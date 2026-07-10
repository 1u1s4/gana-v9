#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

gt_date() {
  local offset_days="${1:-0}"
  node -e '
const offset = Number(process.argv[1] || 0);
const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(date);
const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
console.log(`${values.year}-${values.month}-${values.day}`);
' -- "$offset_days"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 127
  fi
}

require_command node
require_command pnpm

DATE="${GANA_DAILY_DATE:-$(gt_date 1)}"
DAILY_BATCH_ID="${GANA_DAILY_BATCH_ID:-daily-${DATE}-full}"
LOCK_PATH="$REPO_ROOT/.artifacts/gana-v9/cron/locks/daily-e2e-${DATE}.lock"
# Flow-specific GANA_DISCORD_*_TARGET values are resolved inside the Node wrapper.

export GANA_PROFILE="${GANA_CRON_PROFILE:-full-permissions}"
export GANA_APPROVAL_MODE="${GANA_CRON_APPROVAL_MODE:-auto-grant}"
export GANA_MAX_FIXTURES_PER_RUN="${GANA_CRON_MAX_FIXTURES_PER_RUN:-10000}"
export GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN="${GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN:-10000}"
export GANA_MAX_PROVIDER_REQUESTS_PER_RUN="${GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN:-10000}"
export GANA_LOW_ODDS_THRESHOLD="${GANA_LOW_ODDS_THRESHOLD:-1.20}"
export GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES="${GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES:-${GANA_CRON_LOW_ODDS_GLOBAL_MAX_FIXTURES:-10000}}"
export GANA_DAILY_PROVIDER_CONCURRENCY="${GANA_DAILY_PROVIDER_CONCURRENCY:-1}"
export GANA_DAILY_CODEX_MODEL="${GANA_DAILY_CODEX_MODEL:-gpt-5.5}"
export GANA_DAILY_REQUIRED_LEAGUES="${GANA_DAILY_REQUIRED_LEAGUES:-1:World Cup:World:2026}"
export AGENT_CODEX_FALLBACK_MODELS="${AGENT_CODEX_FALLBACK_MODELS:-gpt-5.6-luna}"
export AGENT_CODEX_SANDBOX="${AGENT_CODEX_SANDBOX:-danger-full-access}"

mark_retryable_lock() {
  local signal="$1"
  node - "$LOCK_PATH" "$DATE" "$DAILY_BATCH_ID" "$signal" <<'NODE' || true
const fs = require('node:fs');
const path = process.argv[2];
const date = process.argv[3];
const dailyBatchId = process.argv[4];
const signal = process.argv[5];
const retryAfter = new Date(Date.now() + 10 * 60 * 1000).toISOString();
fs.mkdirSync(require('node:path').dirname(path), { recursive: true });
fs.writeFileSync(path, `${JSON.stringify({
  date,
  dailyBatchId,
  status: 'retryable',
  retryAfter,
  updatedAt: new Date().toISOString(),
  reason: `daily-e2e wrapper received ${signal}`,
}, null, 2)}\n`);
NODE
}

child_pid=""
handle_signal() {
  local signal="$1"
  mark_retryable_lock "$signal"
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" >/dev/null 2>&1; then
    kill -TERM "$child_pid" >/dev/null 2>&1 || true
    wait "$child_pid" >/dev/null 2>&1 || true
  fi
  echo "daily-e2e wrapper received $signal; lock marked retryable at $LOCK_PATH" >&2
  exit 143
}
trap 'handle_signal SIGTERM' TERM
trap 'handle_signal SIGINT' INT

node scripts/gana-daily-e2e-and-notify.mjs \
  --date "$DATE" \
  --daily-batch-id "$DAILY_BATCH_ID" \
  --providers "${GANA_DAILY_PROVIDERS:-codex}" \
  --codex-model "$GANA_DAILY_CODEX_MODEL" \
  --threshold "$GANA_LOW_ODDS_THRESHOLD" \
  --provider-concurrency "$GANA_DAILY_PROVIDER_CONCURRENCY" \
  --max-fixtures "${GANA_DAILY_MAX_FIXTURES:-${GANA_CRON_MAX_FIXTURES_PER_RUN:-10000}}" \
  --web "${GANA_WEB_MODE:-live}" \
  --parlay-profile "${GANA_PARLAY_PROFILE:-portfolio-v2}" \
  --required-leagues "$GANA_DAILY_REQUIRED_LEAGUES" \
  --max "${GANA_DISCORD_MAX_SELECTIONS:-25}" &
child_pid=$!
wait "$child_pid"
