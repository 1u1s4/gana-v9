---
name: gana-strategy-review-implementer
description: Use when converting Gana v9 strategy-review artifacts or docs/harness-strategy-review-log.md proposals into narrow code, prompt, test, or cron changes, especially items marked ready-for-implementation after validation-driven review.
---

# Gana Strategy Review Implementer

Use this skill when the user asks to apply, implement, close, or act on Gana v9 strategy-review feedback. This is not the skill for generating the review itself; the cron and CLI already do that.

## Source Of Truth

- Central log: `docs/harness-strategy-review-log.md`
- Strategy wrapper: `scripts/gana-strategy-review.mjs`
- Strategy cron shell: `scripts/gana-strategy-review.sh`
- Strategy command: `pnpm gana strategy-review --date YYYY-MM-DD --scope strategy-YYYY-MM-DD`
- Daily metrics: `.artifacts/gana-v9/runs/**/daily-metrics.json`
- Validation artifacts: `.artifacts/gana-v9/runs/**/validations.json`
- Strategy artifacts: `.artifacts/gana-v9/runs/**/strategy-review.json`
- Discord notifier: `.agents/skills/discord-recommendation-notifier/scripts/notify-discord-strategy-review.mjs`

## Candidate Selection

Implement only proposals that are:

- marked `ready-for-implementation`, or explicitly requested by the user
- backed by settled validation or an artifact path/date in the log
- mapped to concrete files or rules
- small enough to verify with focused tests in this turn

Skip or defer proposals marked `proposed` or `needs-more-data` unless the user explicitly asks to implement them. Do not retune thresholds from tiny samples unless the proposal itself includes a sample-size guard.

## Workflow

1. Identify the review date/scope and locate the matching log section or `strategy-review.json`.
2. Extract candidate proposals with priority, status, files, rationale, impact, and verification hints.
3. Deduplicate against earlier implemented sections in `docs/harness-strategy-review-log.md` and recent commits.
4. Choose the smallest coherent implementation set. Prefer one gate/rule family at a time.
5. Inspect only the referenced files plus their adjacent tests.
6. Make changes in the existing ownership boundary:
   - final recommendation gates: `src/daily/e2e.ts`
   - council policy: `src/council/recommendation-council.ts`
   - parlay eligibility/ranking: `src/parlay/*`
   - prediction gates/scoring prompts: `src/prediction/*`, `skills/score-prediction-v2/prompt.md`
   - research evidence requirements: `src/evidence/*`, `skills/research-fixture-v2/prompt.md`
   - validation/metrics freshness: `src/validation/*`, `src/metrics/*`
7. Add or update focused tests for the exact regression or policy rule.
8. Run focused tests, `pnpm typecheck`, and broader tests when shared daily/parlay/council behavior changed.
9. Update the strategy log only after the code and tests pass. Record what changed, files, verification, and any proposal left as needs-more-data.

## Guardrails

- Preserve the analytical-only policy: no monetary execution, bookmaker instructions, or guarantees.
- Do not make final recommendations more permissive to hide poor validation results.
- Prefer quarantine, review-required, or risk tagging over silent deletion when a selection is analytically useful but unsafe to promote.
- Keep corners, youth/development, low-liquidity favorites, inflated double-chance edge, and stale validation as explicit risk buckets when touched.
- Do not mix post-hoc backtest conclusions with live promotion policy without a sample-size guard.
- Do not update Discord style ad hoc while implementing strategy rules; use the notifier skill if notification formatting must change.

## Verification Patterns

Use focused commands first:

```bash
node --import tsx --test src/daily/e2e.test.ts
node --import tsx --test src/parlay/service.test.ts src/parlay/analysis.test.ts src/parlay/rules.test.ts
node --import tsx --test src/council/recommendation-council.test.ts
node --import tsx --test src/prediction/gates.test.ts src/prediction/service.test.ts
node --import tsx --test src/metrics/daily.test.ts src/validation/service.test.ts
pnpm typecheck
```

Run `pnpm test` when the change crosses daily, parlay, validation, council, or notifier boundaries.

For a live smoke, prefer a dry-run or artifact replay before launching a full slate:

```bash
pnpm gana strategy-review --date YYYY-MM-DD --scope strategy-YYYY-MM-DD
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-strategy-review.mjs --artifact PATH --dry-run
```

## Final Report Shape

Report:

- implemented proposal titles and dates
- files changed
- tests and typecheck run
- log section updated, if any
- proposals deliberately left as `proposed` or `needs-more-data`
- remaining evidence needed before further threshold or portfolio changes
