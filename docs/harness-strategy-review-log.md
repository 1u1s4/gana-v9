# Gana v9 Harness Strategy Review Log

Central tracking document for daily and historical validation-driven harness improvement proposals.

Automated reviews are analytical only. They create a proposed change backlog; source-code changes still require normal implementation and verification.

## Operating Contract

- Daily schedule: `13:00 America/Guatemala`.
- Daily target: the previous closed fixture date only.
- Historical target: all fixture dates with persisted predictions/parlays when `pnpm gana strategy-review --all` is run.
- Agent: Codex only, configured through `GANA_STRATEGY_REVIEW_MODEL` and `GANA_STRATEGY_REVIEW_REASONING_EFFORT`.
- Defaults: `gpt-5.5` with `xhigh` reasoning.
- Output artifacts: `strategy-review.json` and `strategy-review.md` under `.artifacts/gana-v9/runs/<runId>/`.
- Safety: the automated job does not execute monetary actions and does not patch source files by itself; it records proposed Harness changes here.

## 2026-05-22 · historical-backfill-initial

- Run: strategy-review-backfill-mphfaana
- Dates: 2026-05-01, 2026-05-02, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06, 2026-05-07, 2026-05-08, 2026-05-09, 2026-05-10, 2026-05-11, 2026-05-12, 2026-05-13, 2026-05-14, 2026-05-15, 2026-05-16, 2026-05-17, 2026-05-18, 2026-05-19, 2026-05-20, 2026-05-21, 2026-05-22, 2026-05-23
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphfaana/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphfaana/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: skipped
- Predictions: 2415-1717 hit 58.4% (8680 total)
- Parlays: 176-190 hit 48.1% (475 total)

### Proposed Modifications

- None generated.

## 2026-05-22 · historical-backfill-codex

- Run: strategy-review-backfill-mphfb991
- Dates: 2026-05-01, 2026-05-02, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06, 2026-05-07, 2026-05-08, 2026-05-09, 2026-05-10, 2026-05-11, 2026-05-12, 2026-05-13, 2026-05-14, 2026-05-15, 2026-05-16, 2026-05-17, 2026-05-18, 2026-05-19, 2026-05-20, 2026-05-21, 2026-05-22, 2026-05-23
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphfb991/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphfb991/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: blocked
- Predictions: 2415-1717 hit 58.4% (8680 total)
- Parlays: 176-190 hit 48.1% (475 total)

### Proposed Modifications

- None generated.

## 2026-05-22 · historical-backfill-codex-v2

- Run: strategy-review-backfill-mphfdnzw
- Dates: 2026-05-01, 2026-05-02, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06, 2026-05-07, 2026-05-08, 2026-05-09, 2026-05-10, 2026-05-11, 2026-05-12, 2026-05-13, 2026-05-14, 2026-05-15, 2026-05-16, 2026-05-17, 2026-05-18, 2026-05-19, 2026-05-20, 2026-05-21, 2026-05-22, 2026-05-23
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphfdnzw/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphfdnzw/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: blocked
- Predictions: 2415-1717 hit 58.4% (8680 total)
- Parlays: 176-190 hit 48.1% (475 total)

### Proposed Modifications

- None generated.

## 2026-05-22 · daily-agent-sanitize-test

- Run: strategy-review-2026-05-22-a0c6fba2
- Dates: 2026-05-22
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-a0c6fba2/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-a0c6fba2/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 39-25 hit 60.9% (576 total)
- Parlays: 0-1 hit 0.0% (22 total)

### Proposed Modifications

- [high] Run post-settlement validation before strategy review metrics (ready-for-implementation) — src/validation/service.ts, src/metrics/daily.ts, src/daily/e2e.ts
- [high] Add semantic fixture exposure caps to final recommendations (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts
- [high] Tighten fragile market gates for h2h away, btts no, and goals over 2.5 (ready-for-implementation) — src/parlay/eligibility.ts, src/parlay/builder.ts, src/parlay/service.ts, src/parlay/types.ts, src/prediction/service.ts
- [high] Broaden inflated double-chance edge detection (ready-for-implementation) — src/parlay/eligibility.ts, src/prediction/service.ts, src/parlay/service.ts
- [medium] Use rolling validation weights in parlay and final recommendation scoring (needs-more-data) — src/parlay/analysis.ts, src/daily/e2e.ts, src/metrics/daily.ts
- [medium] Expand low-odds selector coverage with guarded double_chance support (proposed) — src/filters/low-odds-selector.ts, src/parlay/service.ts, src/filters/low-odds-selector.test.ts
- [medium] Add validation-feedback risk instructions to scoring prompts (ready-for-implementation) — skills/score-prediction-v2/prompt.md, src/prediction/prompts.ts, skills/research-fixture-v2/prompt.md
- [low] Persist and audit profile metadata for every multi-leg selection (proposed) — src/parlay/service.ts, src/metrics/daily.ts

## 2026-05-22 · historical-backfill-codex-final

- Run: strategy-review-backfill-mphflk7p
- Dates: 2026-05-01, 2026-05-02, 2026-05-03, 2026-05-04, 2026-05-05, 2026-05-06, 2026-05-07, 2026-05-08, 2026-05-09, 2026-05-10, 2026-05-11, 2026-05-12, 2026-05-13, 2026-05-14, 2026-05-15, 2026-05-16, 2026-05-17, 2026-05-18, 2026-05-19, 2026-05-20, 2026-05-21, 2026-05-22, 2026-05-23
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphflk7p/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-backfill-mphflk7p/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 2415-1717 hit 58.4% (8680 total)
- Parlays: 176-190 hit 48.1% (475 total)

### Proposed Modifications

- [high] Filter duplicate parlays by logical leg signature (ready-for-implementation) — src/parlay/analysis.ts, src/daily/e2e.ts, src/strategy-review/daily.ts
- [high] Make final parlay recommendations conservative by default (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Add market and odds specific promotion gates (proposed) — src/prediction/service.ts, src/scoring/edge-gate.ts, skills/score-prediction-v2/prompt.md
- [high] Gate daily recommendations on validation freshness (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/validation/service.ts
- [medium] Expand low-odds discovery to safe double-chance (proposed) — src/filters/low-odds-selector.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md
- [high] Fix parlay profile attribution in review feedback (ready-for-implementation) — src/parlay/service.ts, src/strategy-review/daily.ts
- [medium] Add validation-driven threshold feedback (proposed) — src/strategy-review/daily.ts, src/prediction/service.ts, src/parlay/service.ts

## 2026-05-22 · harness-applied-changes-round-1

- Source review: strategy-review-backfill-mphflk7p
- Objective: apply the first high-confidence Harness changes identified by the historical Codex review.
- Status: implemented in working tree; verified with typecheck, full test run, notifier test, cron syntax, and strategy-review smoke.

### Applied Modifications

- [high] Semantic parlay deduplication — `src/parlay/analysis.ts`, `src/daily/e2e.ts`, `src/strategy-review/daily.ts`
  - Parlay analysis now detects duplicate exposure by `fixtureId:market:selection:line`, not prediction id.
  - Final daily recommendations reject duplicate logical leg signatures and avoid repeated profile exposure.
  - Strategy review artifact audits now count duplicate parlays using the same semantic signature and exclude atomic singles.
- [high] Conservative final parlay promotion — `src/daily/e2e.ts`
  - Final daily parlays require positive adjusted edge, 2-3 legs, aggregate confidence >= 0.70, combined odds <= 2.20, and no high-risk flags.
  - `parlay-diamante` remains allowed only inside 1.10-1.30 combined odds with aggregate confidence >= 0.78.
  - High-odds, stale-source, unverified-corners, negative-edge, and duplicate-leg-set candidates stay out of final recommendations.
- [high] Validation freshness gate — `src/daily/e2e.ts`
  - Daily E2E now derives validation freshness from daily metrics.
  - Promotion requires prediction/parlay validation coverage >= 60%; otherwise the run remains review-required even if providers and parlays succeeded.
  - Recommendation artifacts include the validation freshness snapshot and gate policy.
- [high] Parlay profile attribution fix — `src/strategy-review/daily.ts`
  - Strategy review now reads `metadata.portfolioProfile` before fallback profile fields, so future review buckets can distinguish profiles such as `parlay-diamante`, `low-variance`, and `balanced`.

## 2026-05-22 · harness-applied-smoke

- Run: strategy-review-2026-05-22-122120f3
- Dates: 2026-05-22
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-122120f3/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-122120f3/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: skipped
- Predictions: 39-25 hit 60.9% (576 total)
- Parlays: 0-1 hit 0.0% (22 total)

### Proposed Modifications

- None generated.
