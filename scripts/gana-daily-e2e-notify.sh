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
DISCORD_TARGET="${GANA_DISCORD_TARGET:-discord:1494071165453467721}"

export GANA_PROFILE="${GANA_CRON_PROFILE:-full-permissions}"
export GANA_APPROVAL_MODE="${GANA_CRON_APPROVAL_MODE:-auto-grant}"
export GANA_MAX_FIXTURES_PER_RUN="${GANA_CRON_MAX_FIXTURES_PER_RUN:-10000}"
export GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN="${GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN:-10000}"
export GANA_MAX_PROVIDER_REQUESTS_PER_RUN="${GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN:-10000}"
export GANA_LOW_ODDS_THRESHOLD="${GANA_LOW_ODDS_THRESHOLD:-1.20}"
export GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES="${GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES:-${GANA_CRON_LOW_ODDS_GLOBAL_MAX_FIXTURES:-10000}}"
export GANA_DAILY_PROVIDER_CONCURRENCY="${GANA_DAILY_PROVIDER_CONCURRENCY:-2}"
export AGENT_CODEX_FALLBACK_MODELS="${AGENT_CODEX_FALLBACK_MODELS:-gpt-5.4-mini}"
export AGENT_CODEX_SANDBOX="${AGENT_CODEX_SANDBOX:-danger-full-access}"

exec node scripts/gana-daily-e2e-and-notify.mjs \
  --date "$DATE" \
  --gateway-target "$DISCORD_TARGET" \
  --threshold "$GANA_LOW_ODDS_THRESHOLD" \
  --provider-concurrency "$GANA_DAILY_PROVIDER_CONCURRENCY" \
  --parlay-profile "${GANA_PARLAY_PROFILE:-portfolio-v2}" \
  --max "${GANA_DISCORD_MAX_SELECTIONS:-8}"
