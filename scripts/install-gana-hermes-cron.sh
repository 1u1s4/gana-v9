#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
HERMES_SCRIPTS_DIR="${HERMES_SCRIPTS_DIR:-$HOME/.hermes/scripts}"

JOB_NAME="gana-v9-daily-operations"
SCHEDULE="15 7,10,13,18,22 * * *"
LEGACY_JOB_NAMES=(
  "gana-v9-raw-retention"
  "gana-v9-validate-yesterday-discord"
  "gana-v9-daily-e2e-discord"
  "gana-v9-daily-e2e-catchup-discord"
  "gana-v9-strategy-review"
)
LEGACY_WRAPPERS=(
  "gana_v9_raw_retention_apply.sh"
  "gana_v9_previous_day_validation_notify.sh"
  "gana_v9_daily_e2e_notify.sh"
  "gana_v9_strategy_review.sh"
)
HERMES_CRON_DELIVER="${GANA_HERMES_CRON_DELIVER:-${GANA_DISCORD_ALERTS_TARGET:-discord:1510041125614915756}}"
UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 64 ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 127
  fi
}

write_wrapper() {
  local name="$1"
  local path="$HERMES_SCRIPTS_DIR/$name"
  cat > "$path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
export GANA_DISCORD_TARGET="\${GANA_DISCORD_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_RECOMMENDATIONS_TARGET="\${GANA_DISCORD_RECOMMENDATIONS_TARGET:-discord:1510040973218939022}"
export GANA_DISCORD_COUNCIL_TARGET="\${GANA_DISCORD_COUNCIL_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_VALIDATION_TARGET="\${GANA_DISCORD_VALIDATION_TARGET:-discord:1510041050255855616}"
export GANA_DISCORD_FEEDBACK_TARGET="\${GANA_DISCORD_FEEDBACK_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_STRATEGY_TARGET="\${GANA_DISCORD_STRATEGY_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_ALERTS_TARGET="\${GANA_DISCORD_ALERTS_TARGET:-discord:1510041125614915756}"
export GANA_CRON_DIRECT_TELEGRAM="\${GANA_CRON_DIRECT_TELEGRAM:-0}"
export GANA_CRON_TELEGRAM_TARGET="\${GANA_CRON_TELEGRAM_TARGET:-discord:1510041125614915756}"
exec node "$REPO_ROOT/scripts/gana-daily-ops-dispatch.mjs"
EOF
  chmod +x "$path"
  echo "$name"
}

job_id_by_name() {
  local name="$1"
  hermes cron list --all 2>/dev/null | awk -v expected="$name" '
    /^[[:space:]]+[[:xdigit:]]+[[:space:]]+\[/ { id = $1 }
    /^[[:space:]]+Name:[[:space:]]+/ {
      current = $0
      sub(/^[[:space:]]+Name:[[:space:]]+/, "", current)
      if (current == expected && id != "") {
        print id
      }
    }
  '
}

remove_jobs_by_name() {
  local name="$1"
  local id
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    hermes cron remove "$id"
    echo "Hermes cron job removed: $name ($id)"
  done < <(job_id_by_name "$name")
}

upsert_job() {
  local name="$1"
  local schedule="$2"
  local wrapper="$3"
  local id
  local duplicate_id
  local ids=()
  while IFS= read -r id; do
    [[ -n "$id" ]] && ids+=("$id")
  done < <(job_id_by_name "$name")
  if (( ${#ids[@]} > 0 )); then
    id="${ids[0]}"
    for duplicate_id in "${ids[@]:1}"; do
      hermes cron remove "$duplicate_id"
      echo "Duplicate Hermes cron job removed: $name ($duplicate_id)"
    done
    hermes cron edit \
      --schedule "$schedule" \
      --name "$name" \
      --deliver "$HERMES_CRON_DELIVER" \
      --script "$wrapper" \
      --no-agent \
      --workdir "$REPO_ROOT" \
      "$id"
    echo "Hermes cron job updated: $name ($id)"
    return
  fi
  hermes cron create "$schedule" \
    --name "$name" \
    --deliver "$HERMES_CRON_DELIVER" \
    --script "$wrapper" \
    --no-agent \
    --workdir "$REPO_ROOT"
}

require_command hermes
mkdir -p "$HERMES_SCRIPTS_DIR"

for legacy_name in "${LEGACY_JOB_NAMES[@]}"; do
  remove_jobs_by_name "$legacy_name"
done
for legacy_wrapper in "${LEGACY_WRAPPERS[@]}"; do
  rm -f "$HERMES_SCRIPTS_DIR/$legacy_wrapper"
done

if (( UNINSTALL == 1 )); then
  remove_jobs_by_name "$JOB_NAME"
  rm -f "$HERMES_SCRIPTS_DIR/gana_v9_daily_operations.sh"
  echo "Hermes Gana cron jobs uninstalled."
  exit 0
fi

wrapper="$(write_wrapper gana_v9_daily_operations.sh)"
upsert_job "$JOB_NAME" "$SCHEDULE" "$wrapper"

hermes cron list --all | grep -A5 -F "Name:      $JOB_NAME" || true
