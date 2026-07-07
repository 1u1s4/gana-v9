#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
HERMES_SCRIPTS_DIR="${HERMES_SCRIPTS_DIR:-$HOME/.hermes/scripts}"

VALIDATION_JOB_NAME="${GANA_VALIDATION_CRON_NAME:-gana-v9-validate-yesterday-discord}"
DAILY_JOB_NAME="${GANA_DAILY_CRON_NAME:-gana-v9-daily-e2e-discord}"
DAILY_CATCHUP_JOB_NAME="${GANA_DAILY_CATCHUP_CRON_NAME:-gana-v9-daily-e2e-catchup-discord}"
STRATEGY_REVIEW_JOB_NAME="${GANA_STRATEGY_REVIEW_CRON_NAME:-gana-v9-strategy-review}"
VALIDATION_SCHEDULE="${GANA_VALIDATION_CRON_SCHEDULE:-0 7 * * *}"
DAILY_SCHEDULE="${GANA_DAILY_CRON_SCHEDULE:-15 10 * * *}"
DAILY_CATCHUP_SCHEDULE="${GANA_DAILY_CATCHUP_CRON_SCHEDULE:-*/30 10-22 * * *}"
STRATEGY_REVIEW_SCHEDULE="${GANA_STRATEGY_REVIEW_CRON_SCHEDULE:-0 13 * * *}"
HERMES_CRON_DELIVER="${GANA_HERMES_CRON_DELIVER:-${GANA_DISCORD_ALERTS_TARGET:-discord:1510041125614915756}}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 127
  fi
}

write_wrapper() {
  local name="$1"
  local target="$2"
  local path="$HERMES_SCRIPTS_DIR/$name"
  cat > "$path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_ROOT"
export GANA_DISCORD_TARGET="\${GANA_DISCORD_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_RECOMMENDATIONS_TARGET="\${GANA_DISCORD_RECOMMENDATIONS_TARGET:-discord:1510040973218939022}"
export GANA_DISCORD_COUNCIL_TARGET="\${GANA_DISCORD_COUNCIL_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_VALIDATION_TARGET="\${GANA_DISCORD_VALIDATION_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_FEEDBACK_TARGET="\${GANA_DISCORD_FEEDBACK_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_STRATEGY_TARGET="\${GANA_DISCORD_STRATEGY_TARGET:-discord:1510041125614915756}"
export GANA_DISCORD_ALERTS_TARGET="\${GANA_DISCORD_ALERTS_TARGET:-discord:1510041125614915756}"
export GANA_CRON_DIRECT_TELEGRAM="\${GANA_CRON_DIRECT_TELEGRAM:-0}"
export GANA_CRON_TELEGRAM_TARGET="\${GANA_CRON_TELEGRAM_TARGET:-discord:1510041125614915756}"
exec "$target"
EOF
  chmod +x "$path"
  echo "$name"
}

job_id_by_name() {
  local name="$1"
  hermes cron list 2>/dev/null | awk -v expected="$name" '
    /^[[:space:]]+[[:xdigit:]]+[[:space:]]+\[/ { id = $1 }
    /^[[:space:]]+Name:[[:space:]]+/ {
      current = $0
      sub(/^[[:space:]]+Name:[[:space:]]+/, "", current)
      if (current == expected && id != "") {
        print id
        exit
      }
    }
  '
}

upsert_job() {
  local name="$1"
  local schedule="$2"
  local wrapper="$3"
  local id
  id="$(job_id_by_name "$name")"
  if [[ -n "$id" ]]; then
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

validation_wrapper="$(write_wrapper gana_v9_previous_day_validation_notify.sh "$REPO_ROOT/scripts/gana-previous-day-validation-notify.sh")"
daily_wrapper="$(write_wrapper gana_v9_daily_e2e_notify.sh "$REPO_ROOT/scripts/gana-daily-e2e-notify.sh")"
strategy_review_wrapper="$(write_wrapper gana_v9_strategy_review.sh "$REPO_ROOT/scripts/gana-strategy-review.sh")"

upsert_job "$VALIDATION_JOB_NAME" "$VALIDATION_SCHEDULE" "$validation_wrapper"
upsert_job "$DAILY_JOB_NAME" "$DAILY_SCHEDULE" "$daily_wrapper"
upsert_job "$DAILY_CATCHUP_JOB_NAME" "$DAILY_CATCHUP_SCHEDULE" "$daily_wrapper"
upsert_job "$STRATEGY_REVIEW_JOB_NAME" "$STRATEGY_REVIEW_SCHEDULE" "$strategy_review_wrapper"

hermes cron list | grep -A5 -E "Name:      ($VALIDATION_JOB_NAME|$DAILY_JOB_NAME|$DAILY_CATCHUP_JOB_NAME|$STRATEGY_REVIEW_JOB_NAME)" || true
