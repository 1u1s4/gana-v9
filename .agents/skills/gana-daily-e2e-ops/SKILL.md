---
name: gana-daily-e2e-ops
description: Use when operating, rerunning, debugging, or verifying the Gana v9 daily E2E cron flow, including bad or early cron runs, missing/empty recommendation artifacts, long Codex/Gemini provider runs, fixture-label/UUID regressions, and Discord resend verification.
---

# Gana Daily E2E Ops

Use this skill for the project-local daily operations loop in `/Users/luisalvarado/Documents/GitHub/gana-v9`.

Do not use it for one-off fixture research or scoring unless the user is trying to diagnose the daily E2E output. For Discord formatting and sends, compose this with `discord-recommendation-notifier`.

## Source Of Truth

- Cron guide: `docs/daily-operations-cron.md`
- Daily wrapper: `scripts/gana-daily-e2e-and-notify.mjs`
- Shell wrapper: `scripts/gana-daily-e2e-notify.sh`
- Council notifier: `scripts/gana-council-review-notify.mjs`
- Discord skill/scripts: `.agents/skills/discord-recommendation-notifier/`
- Artifacts root: `.artifacts/gana-v9/runs`
- Logs: `.artifacts/gana-v9/cron/cron-daily-e2e.log`

## Operating Rules

- Never print secrets from `.env`; inspect variable names or redacted values only.
- Treat recommendations as analytical artifacts only. Do not add execution, betting, payment, or bookmaker language.
- If a run was triggered at the wrong time, identify whether the source was Hermes cron, system crontab fallback, or a manual run before changing schedules.
- Clean only artifacts and locks for the exact bad `daily-YYYY-MM-DD...` batch being replaced. Do not delete other dates or unrelated runs.
- Long provider phases can be normal. Check processes, task files, and artifact timestamps before declaring a run stuck.
- A run can be `review-required` and still have useful recommendations. Verify the JSON artifact, not just the CLI summary line.
- Before resending to Discord, always dry-run the recommendation and council notifiers and scan for `Fixture ...` placeholders or UUID-looking team labels.

## Triage Checklist

1. Establish the requested date in `America/Guatemala` and whether the target is today's published recommendations or tomorrow's daily slate.
2. Inspect current scheduling without exposing secrets:

   ```bash
   crontab -l
   jq -r '.jobs[]? | select(.name|test("gana-v9";"i")) | [.id,.name,.schedule_display,(.state // .enabled),(.last_run_at // ""),(.last_status // "")] | @tsv' ~/.hermes/cron/jobs.json
   ```

3. Inspect the latest daily artifacts for the date:

   ```bash
   find .artifacts/gana-v9/runs -path '*daily-YYYY-MM-DD*' -maxdepth 2 -type f | sort
   ```

4. Check live processes before interrupting:

   ```bash
   ps -axo pid,ppid,stat,etime,command | grep -E 'gana daily-e2e|tsx src/cli|codex exec|gemini' | grep -v grep
   ```

5. Read progress from `daily-progress.json`, provider `tasks.json`, provider `research-bundle.json`, `predictions.json`, and `daily-e2e-summary.json` when present.
6. Decide one of three outcomes: keep waiting, patch a deterministic bug and rerun, or clean the exact failed batch and rerun.

## Rerun Pattern

Use a new or forced batch only after the bad run is understood.

For a guarded manual rerun:

```bash
GANA_DAILY_DATE=YYYY-MM-DD \
GANA_DAILY_PROVIDERS=codex,gemini \
GANA_DAILY_PROVIDER_CONCURRENCY=2 \
GANA_WEB_MODE=live \
GANA_PARLAY_PROFILE=portfolio-v2 \
GANA_DISCORD_MAX_SELECTIONS=25 \
node scripts/gana-daily-e2e-and-notify.mjs --force
```

If a stale system fallback can fire too early, use or preserve the `--not-before HH:MM` guard rather than relying only on crontab edits.

## Verification

Before calling the work done:

```bash
pnpm typecheck
pnpm test
node --check scripts/gana-daily-e2e-and-notify.mjs
node --check scripts/gana-council-review-notify.mjs
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --artifact PATH --dry-run
node scripts/gana-council-review-notify.mjs --artifact PATH --dry-run
```

Use focused tests when the change is narrow, then run the full suite if cron/notifier/shared recommendation behavior changed.

Verify the final recommendation artifact:

- `summary.counts.recommendations` matches parlays plus atomic predictions.
- `daily-parlay-recommendations.json` has non-empty selections when the user expects a publishable or reviewable output.
- No visible fixture label is a raw UUID or `Fixture abc...` when metadata exists.
- Discord sends return message IDs for recommendations and council when delivery is requested.

## Final Report Shape

Report:

- date and batch id
- root cause if this was an incident
- artifact path and counts
- Discord message IDs if sent
- schedule state if touched
- verification commands and result
- any remaining review-required gate or risk reason
