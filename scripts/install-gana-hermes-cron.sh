#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
HERMES_SCRIPTS_DIR="${HERMES_SCRIPTS_DIR:-$HOME/.hermes/scripts}"

VALIDATION_JOB_NAME="${GANA_VALIDATION_CRON_NAME:-gana-v9-validate-yesterday-discord}"
DAILY_JOB_NAME="${GANA_DAILY_CRON_NAME:-gana-v9-daily-e2e-discord}"
STRATEGY_REVIEW_JOB_NAME="${GANA_STRATEGY_REVIEW_CRON_NAME:-gana-v9-strategy-review}"
VALIDATION_SCHEDULE="${GANA_VALIDATION_CRON_SCHEDULE:-0 7 * * *}"
DAILY_SCHEDULE="${GANA_DAILY_CRON_SCHEDULE:-15 10 * * *}"
STRATEGY_REVIEW_SCHEDULE="${GANA_STRATEGY_REVIEW_CRON_SCHEDULE:-0 13 * * *}"

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
exec "$target"
EOF
  chmod +x "$path"
  echo "$name"
}

job_exists() {
  local name="$1"
  hermes cron list 2>/dev/null | grep -F "Name:      $name" >/dev/null 2>&1
}

create_job_if_missing() {
  local name="$1"
  local schedule="$2"
  local wrapper="$3"
  if job_exists "$name"; then
    echo "Hermes cron job already exists: $name"
    return
  fi
  hermes cron create "$schedule" \
    --name "$name" \
    --deliver origin \
    --script "$wrapper" \
    --no-agent \
    --workdir "$REPO_ROOT"
}

require_command hermes
mkdir -p "$HERMES_SCRIPTS_DIR"

validation_wrapper="$(write_wrapper gana_v9_previous_day_validation_notify.sh "$REPO_ROOT/scripts/gana-previous-day-validation-notify.sh")"
daily_wrapper="$(write_wrapper gana_v9_daily_e2e_notify.sh "$REPO_ROOT/scripts/gana-daily-e2e-notify.sh")"
strategy_review_wrapper="$(write_wrapper gana_v9_strategy_review.sh "$REPO_ROOT/scripts/gana-strategy-review.sh")"

create_job_if_missing "$VALIDATION_JOB_NAME" "$VALIDATION_SCHEDULE" "$validation_wrapper"
create_job_if_missing "$DAILY_JOB_NAME" "$DAILY_SCHEDULE" "$daily_wrapper"
create_job_if_missing "$STRATEGY_REVIEW_JOB_NAME" "$STRATEGY_REVIEW_SCHEDULE" "$strategy_review_wrapper"

hermes cron list | grep -A5 -E "Name:      ($VALIDATION_JOB_NAME|$DAILY_JOB_NAME|$STRATEGY_REVIEW_JOB_NAME)" || true
