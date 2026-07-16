#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ARTIFACT_ROOT="${GANA_ARTIFACT_ROOT:-.artifacts/gana-v9}"
if [[ "$ARTIFACT_ROOT" != /* ]]; then
  ARTIFACT_ROOT="$REPO_ROOT/$ARTIFACT_ROOT"
fi

LOCK_DIR="$ARTIFACT_ROOT/cron/locks/raw-retention.lock"
KERNEL_LOCK_FILE="$LOCK_DIR/kernel.lock"
LOCK_OWNER_FILE="$LOCK_DIR/owner"
LEGACY_LOCK_PID_FILE="$LOCK_DIR/pid"
REPORT_DIR="$ARTIFACT_ROOT/retention"
LEGACY_OWNERLESS_GRACE_SECONDS=300
OWNER_TOKEN="$$-$(date -u +%s)-${RANDOM:-0}-${RANDOM:-0}"
OWNER_TEMP=""
LOCK_FD_OPEN=0
APPLY_STARTED=0
REPORT_FINALIZED=0
CLI_PID=""
RAW_OUTPUT=""
REPORT_PATH=""
REPORT_TMP=""
LOCK_FAILURE_KIND="skip"

cd "$REPO_ROOT"
umask 077

read_line() {
  local path="$1"
  local line_number="$2"
  sed -n "${line_number}p" "$path" 2>/dev/null || true
}

path_mtime_epoch() {
  local value=""
  if value="$(stat -c '%Y' "$1" 2>/dev/null)" && [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  if value="$(stat -f '%m' "$1" 2>/dev/null)" && [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  return 1
}

emit_lock_skip() {
  local reason="$1"
  printf '{"status":"skipped","reason":"%s","changed":false}\n' "$reason"
}

owner_pid() {
  if [[ -r "$LOCK_OWNER_FILE" ]]; then
    read_line "$LOCK_OWNER_FILE" 2
  elif [[ -r "$LEGACY_LOCK_PID_FILE" ]]; then
    read_line "$LEGACY_LOCK_PID_FILE" 1
  fi
}

legacy_lock_blocks_start() {
  local pid="" now mtime age
  [[ -d "$LOCK_DIR" && ! -e "$KERNEL_LOCK_FILE" ]] || return 1

  pid="$(owner_pid)"
  if [[ "$pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$pid" 2>/dev/null; then
    emit_lock_skip "retention-already-running"
    return 0
  fi

  # Compatibility for the old mkdir-then-pid lock. A directory observed in
  # its metadata-free initialization window is never deleted or adopted.
  if [[ ! -e "$LOCK_OWNER_FILE" && ! -e "$LEGACY_LOCK_PID_FILE" ]]; then
    now="$(date -u +%s)"
    mtime="$(path_mtime_epoch "$LOCK_DIR" || printf '%s\n' "$now")"
    age=$((now - mtime))
    if (( age < 0 )); then age=0; fi
    if (( age < LEGACY_OWNERLESS_GRACE_SECONDS )); then
      emit_lock_skip "retention-lock-initializing"
      return 0
    fi
  fi

  return 1
}

describe_held_kernel_lock() {
  local pid=""
  pid="$(owner_pid)"
  if [[ "$pid" =~ ^[1-9][0-9]*$ ]] && kill -0 "$pid" 2>/dev/null; then
    emit_lock_skip "retention-already-running"
  else
    # The kernel lock is authoritative during the tiny interval before owner
    # metadata is atomically published. Missing/stale PID is not reclaimed.
    emit_lock_skip "retention-lock-initializing"
  fi
}

publish_owner_metadata() {
  local created current
  created="$(date -u +%s)"
  OWNER_TEMP="$LOCK_DIR/.owner.${OWNER_TOKEN}.tmp"
  if ! printf '%s\n%s\n%s\n' "$OWNER_TOKEN" "$$" "$created" > "$OWNER_TEMP"; then
    return 1
  fi
  if ! mv -f -- "$OWNER_TEMP" "$LOCK_OWNER_FILE"; then
    return 1
  fi
  OWNER_TEMP=""
  current="$(read_line "$LOCK_OWNER_FILE" 1)"
  [[ "$current" == "$OWNER_TOKEN" ]]
}

acquire_kernel_lock() {
  if ! mkdir -p "$LOCK_DIR"; then
    LOCK_FAILURE_KIND="error"
    echo '{"status":"error","reason":"retention-lock-directory-create-failed","changed":false}' >&2
    return 1
  fi
  if ! exec 9>"$KERNEL_LOCK_FILE"; then
    LOCK_FAILURE_KIND="error"
    echo '{"status":"error","reason":"retention-kernel-lock-open-failed","changed":false}' >&2
    return 1
  fi
  LOCK_FD_OPEN=1

  if [[ -x /usr/bin/lockf ]]; then
    if ! /usr/bin/lockf -s -t 0 9; then
      describe_held_kernel_lock
      return 1
    fi
  elif command -v flock >/dev/null 2>&1; then
    if ! flock -n 9; then
      describe_held_kernel_lock
      return 1
    fi
  else
    LOCK_FAILURE_KIND="error"
    echo '{"status":"error","reason":"retention-kernel-lock-tool-unavailable","changed":false}' >&2
    return 1
  fi

  # A kernel advisory lock is released by the OS even on SIGKILL. Stale owner
  # metadata can therefore be replaced only after exclusive ownership exists.
  if ! rm -f -- "$LEGACY_LOCK_PID_FILE"; then
    LOCK_FAILURE_KIND="error"
    echo '{"status":"error","reason":"retention-legacy-lock-cleanup-failed","changed":false}' >&2
    return 1
  fi
  if ! publish_owner_metadata; then
    LOCK_FAILURE_KIND="error"
    echo '{"status":"error","reason":"retention-lock-owner-publish-failed","changed":false}' >&2
    return 1
  fi
  return 0
}

release_lock_if_owned() {
  local current=""
  if [[ -r "$LOCK_OWNER_FILE" ]]; then
    current="$(read_line "$LOCK_OWNER_FILE" 1)"
    if [[ "$current" == "$OWNER_TOKEN" ]]; then
      rm -f -- "$LOCK_OWNER_FILE"
    fi
  fi
  if (( LOCK_FD_OPEN == 1 )); then
    exec 9>&-
    LOCK_FD_OPEN=0
  fi
}

write_failure_report() {
  local exit_code="$1"
  local reason="$2"
  local generated_at
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ -n "$REPORT_PATH" && -n "$REPORT_TMP" ]] || return 0
  rm -f -- "$REPORT_TMP"
  printf '{\n  "schemaVersion": 1,\n  "status": "error",\n  "changed": "possibly-partial",\n  "exitCode": %d,\n  "reason": "%s",\n  "generatedAt": "%s"\n}\n' \
    "$exit_code" "$reason" "$generated_at" > "$REPORT_TMP"
  mv -f -- "$REPORT_TMP" "$REPORT_PATH"
  REPORT_FINALIZED=1
  cat "$REPORT_PATH"
}

cleanup() {
  if [[ -n "$RAW_OUTPUT" ]]; then rm -f -- "$RAW_OUTPUT"; fi
  if [[ -n "$REPORT_TMP" ]]; then rm -f -- "$REPORT_TMP"; fi
  if [[ -n "$OWNER_TEMP" ]]; then rm -f -- "$OWNER_TEMP"; fi
  release_lock_if_owned
}

handle_signal() {
  local exit_code="$1"
  trap - INT TERM
  if [[ -n "$CLI_PID" ]] && kill -0 "$CLI_PID" 2>/dev/null; then
    kill -TERM "$CLI_PID" 2>/dev/null || true
    wait "$CLI_PID" 2>/dev/null || true
  fi
  CLI_PID=""
  if (( APPLY_STARTED == 1 && REPORT_FINALIZED == 0 )); then
    write_failure_report "$exit_code" "retention-apply-interrupted"
  fi
  exit "$exit_code"
}

trap cleanup EXIT
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

# Maintenance mode prevents a new scheduled mutation. It intentionally does
# not terminate an apply that already owns the kernel lock; cutover must wait
# for that owner to finish before changing database routing.
if node --input-type=module -e "import 'dotenv/config'; process.exit(process.env.GANA_MAINTENANCE_PAUSED === 'true' ? 0 : 1)"; then
  echo '{"status":"paused","reason":"GANA_MAINTENANCE_PAUSED=true","changed":false}'
  exit 0
fi

if legacy_lock_blocks_start; then
  exit 0
fi
if ! acquire_kernel_lock; then
  if [[ "$LOCK_FAILURE_KIND" == "error" ]]; then exit 69; fi
  exit 0
fi

mkdir -p "$REPORT_DIR"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_PATH="$REPORT_DIR/retention-${RUN_STAMP}-$$.json"
REPORT_TMP="$REPORT_PATH.tmp"
RAW_OUTPUT="$(mktemp "$REPORT_DIR/.retention-${RUN_STAMP}-$$.stdout.XXXXXX")"
APPLY_STARTED=1

node scripts/gana-raw-retention.mjs --apply --json > "$RAW_OUTPUT" &
CLI_PID=$!
set +e
wait "$CLI_PID"
CLI_EXIT=$?
set -e
CLI_PID=""

if (( CLI_EXIT != 0 )); then
  write_failure_report "$CLI_EXIT" "retention-apply-command-failed"
  exit "$CLI_EXIT"
fi

# Parse and rewrite into a same-directory temp file before rename. A zero-exit
# command with truncated/non-JSON stdout may already have committed batches, so
# it is represented as possibly-partial instead of publishing a corrupt file.
if ! node - "$RAW_OUTPUT" "$REPORT_TMP" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const [inputPath, outputPath] = process.argv.slice(2);
const report = JSON.parse(readFileSync(inputPath, 'utf8'));
if (!report || typeof report !== 'object' || Array.isArray(report)) {
  throw new Error('Retention JSON output must be an object.');
}
for (const section of ['after', 'historyAfter', 'compactionAfter']) {
  const rowCount = Number(report[section]?.totals?.rowCount);
  if (!Number.isFinite(rowCount) || rowCount < 0) {
    throw new Error(`Retention JSON output is missing ${section}.totals.rowCount.`);
  }
}
const capacityStatus = report.capacityAfter?.status ?? report.capacityBefore?.status;
if (typeof capacityStatus !== 'string' || !capacityStatus) {
  throw new Error('Retention JSON output is missing capacity status.');
}
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
NODE
then
  write_failure_report 70 "retention-apply-invalid-json"
  exit 70
fi

mv -f -- "$REPORT_TMP" "$REPORT_PATH"
REPORT_FINALIZED=1
cat "$REPORT_PATH"

if ! node - "$REPORT_PATH" <<'NODE'
const { readFileSync } = require('node:fs');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const residual = Number(report.after?.totals?.rowCount ?? 0)
  + Number(report.historyAfter?.totals?.rowCount ?? 0)
  + Number(report.compactionAfter?.totals?.rowCount ?? 0);
const capacity = report.capacityAfter?.status ?? report.capacityBefore?.status;
if (residual > 0 || capacity !== 'ok') {
  process.stderr.write(`Retention requires attention: residual=${residual}, capacity=${capacity}\n`);
  process.exit(2);
}
NODE
then
  exit 2
fi
