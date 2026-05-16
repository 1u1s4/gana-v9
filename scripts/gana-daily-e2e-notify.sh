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
' "$offset_days"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 127
  fi
}

require_command node
require_command pnpm

DATE="${GANA_DAILY_DATE:-$(gt_date 0)}"
DISCORD_TARGET="${GANA_DISCORD_TARGET:-discord:1494071165453467721}"
ARTIFACT_ROOT="${GANA_ARTIFACT_ROOT:-.artifacts/gana-v9/runs}"
RECOMMENDATIONS_ARTIFACT="$ARTIFACT_ROOT/daily-$DATE/daily-parlay-recommendations.json"

export GANA_PROFILE="${GANA_PROFILE:-full-permissions}"
export GANA_APPROVAL_MODE="${GANA_APPROVAL_MODE:-auto-grant}"
export GANA_MAX_FIXTURES_PER_RUN="${GANA_CRON_MAX_FIXTURES_PER_RUN:-10000}"
export GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN="${GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN:-10000}"
export GANA_MAX_PROVIDER_REQUESTS_PER_RUN="${GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN:-10000}"
export GANA_LOW_ODDS_THRESHOLD="${GANA_LOW_ODDS_THRESHOLD:-1.20}"

pnpm gana daily-e2e \
  --date "$DATE" \
  --providers "${GANA_DAILY_PROVIDERS:-codex,gemini}" \
  --web "${GANA_WEB_MODE:-live}" \
  --max-fixtures "${GANA_MAX_FIXTURES_PER_RUN}" \
  --threshold "${GANA_LOW_ODDS_THRESHOLD}" \
  --parlay-profile "${GANA_PARLAY_PROFILE:-balanced}"

if [[ ! -f "$RECOMMENDATIONS_ARTIFACT" ]]; then
  echo "Missing recommendations artifact: $RECOMMENDATIONS_ARTIFACT" >&2
  exit 1
fi

node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --artifact "$RECOMMENDATIONS_ARTIFACT" \
  --transport discord-native \
  --gateway-target "$DISCORD_TARGET" \
  --max "${GANA_DISCORD_MAX_SELECTIONS:-5}"
