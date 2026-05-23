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

## 2026-05-22 · strategy-2026-05-21

- Run: strategy-review-2026-05-21-81b24dbb
- Dates: 2026-05-21
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-21-81b24dbb/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-21-81b24dbb/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 85-42 hit 66.9% (166 total)
- Parlays: 16-6 hit 72.7% (22 total)

### Proposed Modifications

- [high] Quarantine balanced and high-conviction final recommendations (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Raise low-liquidity H2H favorite risk ceiling (ready-for-implementation) — src/parlay/eligibility.ts, src/parlay/analysis.ts, src/parlay/service.ts, skills/score-prediction-v2/prompt.md
- [high] Make confidence floors promotion-aware (ready-for-implementation) — src/prediction/service.ts, src/prediction/gates.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [medium] Tighten totals-over and corners market gates (ready-for-implementation) — src/parlay/eligibility.ts, src/prediction/service.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Expand low-odds discovery toward safer double chance (proposed) — src/filters/low-odds-selector.ts, src/parlay/service.ts, src/daily/e2e.ts
- [medium] Move overlap duplicate filtering before persistence (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts, src/parlay/ranker.ts
- [medium] Feed settled strategy review back into portfolio eligibility (proposed) — src/daily/e2e.ts, src/strategy-review/daily.ts, src/parlay/analysis.ts

## 2026-05-23 · strategy-2026-05-22

- Run: strategy-review-2026-05-22-2e8bed2f
- Dates: 2026-05-22
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-2e8bed2f/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-2e8bed2f/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 197-133 hit 59.7% (576 total)
- Parlays: 3-17 hit 15.0% (22 total)

### Proposed Modifications

- [high] Quarantine weak parlay profiles from daily final recommendations (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts
- [high] Rebuild balanced profile around BTTS and goals, not H2H favorites (proposed) — src/parlay/service.ts, src/parlay/eligibility.ts
- [high] Harden low-odds and H2H favorite gates (ready-for-implementation) — src/parlay/eligibility.ts, src/filters/low-odds-selector.ts, src/parlay/service.ts
- [medium] Make corners settlement reliability a hard parlay and recommendation blocker (ready-for-implementation) — src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Add fixture-level caps and full risk reuse for atomic recommendations (ready-for-implementation) — src/daily/e2e.ts, src/parlay/eligibility.ts
- [medium] Tighten validation freshness with unresolved-rate caps (ready-for-implementation) — src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [medium] Demote gpt-5.4-mini output to review-only until calibrated (needs-more-data) — src/daily/e2e.ts, src/prediction/gates.ts, src/config.ts

### Applied Modifications

- Run: harness-applied-changes-2026-05-23-round-2
- Source reviews: strategy-2026-05-21, strategy-2026-05-22
- Status: implemented in working tree; ready for staged commit after verification.
- [high] Final recommendation quarantine — `src/daily/e2e.ts`, `src/parlay/analysis.ts`
  - Daily final parlays now allow only `parlay-diamante`, `low-odds-top`, and `low-variance`.
  - `balanced`, `high-conviction`, `market-diverse`, `parlay-oro`, `default`, `review`, `totals`, and `aggressive` are blocked from promoted final recommendations.
  - Historical analysis also purges `balanced` and `high-conviction` as weak profiles.
- [high] Balanced profile rebuild — `src/parlay/service.ts`
  - Deterministic balanced generation is limited to BTTS and goals totals.
  - H2H and double-chance legs are excluded from balanced portfolio pools.
  - Balanced remains review-only until settled performance supports promotion.
- [high] Low-odds/H2H hardening — `src/filters/low-odds-selector.ts`, `src/parlay/eligibility.ts`, `src/parlay/service.ts`
  - Low-odds discovery now supports H2H home/away plus safe double chance (`home_or_draw`, `draw_or_away`), and rejects `home_or_away`.
  - Low-liquidity H2H favorites are parlay-blocked regardless of prediction status.
  - Low-odds parlay construction rejects low-liquidity H2H favorite risk in strict and fallback paths.
- [medium] Totals/corners hardening — `src/parlay/eligibility.ts`, `src/daily/e2e.ts`, `skills/research-fixture-v2/prompt.md`, `skills/score-prediction-v2/prompt.md`
  - Fragile totals-over risk ceiling is now <= 1.40.
  - Atomic recommendations reuse risk flags and block corners without reliable settlement/statistics support.
  - Research/scoring prompts require corners settlement reliability evidence before promotion.
- [high] Atomic recommendation risk reuse — `src/daily/e2e.ts`
  - Atomic recommendations exclude fixtures already used by selected parlays.
  - Atomic selection is capped to one recommendation per fixture.
  - Atomic promotion skips stale-source, corners, low-liquidity H2H, lineup, missing-evidence, inflated double-chance, and overinflated-edge risks.
- [medium] Validation freshness tightening — `src/daily/e2e.ts`
  - Freshness now fails when unresolved prediction/parlay validation rate exceeds 25%.
  - Recommendation policy artifacts expose allowed/blocked profiles, blocked risk flags, demoted models, atomic fixture exclusion, and per-fixture atomic cap.
- [medium] gpt-5.4-mini demotion — `src/prediction/service.ts`, `src/daily/e2e.ts`, `skills/score-prediction-v2/prompt.md`
  - `gpt-5.4-mini` output is forced review-only and parlay-ineligible until calibrated.
  - Final/atomic recommendation selection demotes `gpt-5.4-mini` outputs.
- Verification:
  - `pnpm typecheck`
  - `node --import tsx --test src/harness-production-grade.test.ts src/prediction/service.test.ts`
  - `node scripts/gana-validate-metrics-and-notify.mjs --date 2026-05-22`
  - 2026-05-22 validation artifact: `/Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/7e0e83d4-8407-4ec2-b07b-1b79424df88e/validations.json`
  - 2026-05-22 metrics artifact: `/Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/cbae1056-4649-45b1-9932-eb730dbb1273/daily-metrics.json`
  - Discord stats message: `1507627247912358009`
  - Discord validation mirror message: `1507627251686965379`
