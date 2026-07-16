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

DATE="${GANA_STRATEGY_REVIEW_DATE:-$(gt_date -1)}"
# Flow-specific GANA_DISCORD_*_TARGET values are resolved inside the Node wrapper.

export GANA_PROFILE="${GANA_CRON_PROFILE:-full-permissions}"
export GANA_APPROVAL_MODE="${GANA_CRON_APPROVAL_MODE:-auto-grant}"
export GANA_STRATEGY_REVIEW_MODEL="${GANA_STRATEGY_REVIEW_MODEL:-gpt-5.6-terra}"
export GANA_STRATEGY_REVIEW_REASONING_EFFORT="${GANA_STRATEGY_REVIEW_REASONING_EFFORT:-high}"
export GANA_STRATEGY_REVIEW_FAST_MODE="${GANA_STRATEGY_REVIEW_FAST_MODE:-false}"
export GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS="${GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS-}"
export GANA_STRATEGY_REVIEW_CODEX_SANDBOX="${GANA_STRATEGY_REVIEW_CODEX_SANDBOX:-read-only}"
export AGENT_FAST_MODE="$GANA_STRATEGY_REVIEW_FAST_MODE"
export AGENT_CODEX_FALLBACK_MODELS="$GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS"

exec node scripts/gana-strategy-review.mjs \
  --date "$DATE" \
  --scope "${GANA_STRATEGY_REVIEW_SCOPE:-strategy-$DATE}" \
  --agent "${GANA_STRATEGY_REVIEW_AGENT:-true}" \
  --notify "${GANA_STRATEGY_REVIEW_NOTIFY:-true}"
