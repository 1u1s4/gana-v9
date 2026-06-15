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

## 2026-05-23 · strategy-2026-05-22

- Run: strategy-review-2026-05-22-f67eae91
- Dates: 2026-05-22
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-f67eae91/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-22-f67eae91/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 233-155 hit 60.1% (576 total)
- Parlays: 3-19 hit 13.6% (22 total)

### Proposed Modifications

- [high] Quarantine weak parlay profiles before final recommendations (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Raise default automatic parlay construction floors (ready-for-implementation) — src/parlay/rules.ts, src/parlay/service.ts, src/parlay/ranker.ts
- [high] Add market-specific validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/prediction/service.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Expand low-liquidity H2H and low-price parlay blockers (ready-for-implementation) — src/parlay/eligibility.ts, src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts
- [medium] Calibrate high-confidence and high-edge outputs by history bucket (ready-for-implementation) — src/prediction/service.ts, src/scoring/edge-gate.ts, skills/score-prediction-v2/prompt.md
- [medium] Apply fixture-level exposure caps across all final recommendations (proposed) — src/daily/e2e.ts, src/parlay/analysis.ts

## 2026-05-26 · strategy-2026-05-25

- Run: strategy-review-2026-05-25-41ef91a2
- Dates: 2026-05-25
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-25-41ef91a2/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-25-41ef91a2/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 0-0 hit n/a (0 total)
- Parlays: 0-0 hit n/a (0 total)

### Proposed Modifications

- [high] Add empty-run diagnostics to daily and strategy review artifacts (ready-for-implementation) — src/daily/e2e.ts, src/strategy-review/daily.ts
- [high] Persist blocked per-market prediction placeholders (proposed) — skills/score-prediction-v2/prompt.md, src/prediction/gates.ts, src/prediction/service.ts
- [medium] Honor requested market scope in low-odds selection (proposed) — src/filters/low-odds-selector.ts, src/daily/e2e.ts
- [high] Add sample-size guard before threshold retuning (ready-for-implementation) — src/strategy-review/daily.ts, src/scoring/edge-gate.ts, src/parlay/rules.ts, src/parlay/ranker.ts
- [medium] Harden analytical fallback eligibility and telemetry (proposed) — src/daily/e2e.ts

## 2026-05-28 · strategy-2026-05-27

- Run: strategy-review-2026-05-27-451a6cf5
- Dates: 2026-05-27
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-27-451a6cf5/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-27-451a6cf5/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 492-214 hit 69.7% (983 total)
- Parlays: 20-10 hit 66.7% (30 total)

### Proposed Modifications

- [high] Quarantine corners from promotion until settlement reliability is proven (ready-for-implementation) — src/prediction/gates.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Remove low-odds-top and parlay-diamante from strict final promotion until they recover (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/council/recommendation-council.ts
- [high] Add low-liquidity as a hard final-selection risk for low-price parlays (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, src/parlay/analysis.ts
- [high] Add market-level validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts
- [medium] Tighten H2H draw and away gates (proposed) — src/prediction/service.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md
- [medium] Add a parlay aggregate-confidence dead-zone rule for 80-89% (proposed) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/ranker.ts
- [medium] Shift portfolio-v2 exploration toward balanced and market-diverse profiles (needs-more-data) — src/daily/e2e.ts, src/parlay/service.ts
- [medium] Raise low-price double_chance value requirements (ready-for-implementation) — src/scoring/edge-gate.ts, src/prediction/service.ts, src/parlay/eligibility.ts

## 2026-05-29 · strategy-2026-05-28

- Run: strategy-review-2026-05-28-c81cd6da
- Dates: 2026-05-28
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-28-c81cd6da/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-28-c81cd6da/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 55-39 hit 58.5% (129 total)
- Parlays: 0-4 hit 0.0% (4 total)

### Proposed Modifications

- [high] Require positive-edge minimum-confidence fallback parlays (ready-for-implementation) — src/daily/e2e.ts
- [high] Quarantine non-core parlay profiles from operational validation (ready-for-implementation) — src/parlay/service.ts, src/daily/e2e.ts, src/parlay/analysis.ts
- [high] Add bucket-level validation coverage gates (ready-for-implementation) — src/daily/e2e.ts, src/strategy-review/daily.ts, src/metrics/daily.ts
- [medium] Raise promotion floors for low-confidence and high-odds singles (proposed) — src/prediction/service.ts, src/prediction/gates.ts, src/scoring/edge-gate.ts, skills/score-prediction-v2/prompt.md
- [high] Convert low-liquidity youth and development signal from bonus to risk gate (proposed) — src/daily/e2e.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Throttle BTTS, corners, and fragile totals until evidence is market-specific (proposed) — src/prediction/service.ts, src/parlay/eligibility.ts, src/daily/e2e.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md

## 2026-05-29 · harness-applied-codebase-sweep

- Source review: strategy-2026-05-25
- Objective: apply the mechanical, low-risk empty-run diagnostics item during the codebase sweep, without changing promotion thresholds or portfolio policy.
- Status: implemented and verified.

### Applied Modifications

- [high] Empty-run diagnostics — `src/daily/e2e.ts`, `src/daily/e2e.test.ts`, `src/strategy-review/daily.ts`
  - Daily E2E summaries and recommendation artifacts now include `runDiagnostics` with provider prediction counts, persisted/analyzed parlay counts, final recommendation count, empty-run status, and actionable reasons.
  - Daily markdown reports now surface `emptyRun` and the diagnostic reasons.
  - Strategy review artifacts and markdown now include per-day diagnostics and aggregate review diagnostics for zero-prediction, zero-parlay, and missing recommendation-artifact cases.
  - The strategy-review agent prompt now receives those diagnostics in its compact payload.
- Codebase sweep support changes — `src/retrieval/corpus.ts`, `src/retrieval/corpus.test.ts`, `.env.example`, `package-lock.json`, `docs/planes/20-barrido-codigo-2026-05-29.md`
  - Retrieval corpus parsing now ignores malformed sections instead of producing undefined-id documents.
  - npm lockfile is synchronized with `package.json`.
  - `.env.example` no longer carries local user paths or the removed Cursor model path.
  - The full sweep plan and prioritized backlog are documented in `docs/planes/20-barrido-codigo-2026-05-29.md`.

### Verification

- `npm ci --dry-run`
- `npm run typecheck`
- `npm test`
- `npm run db:validate`
- `npm run build`

### Deferred

- Threshold, market freshness, profile quarantine, and bucket-level validation gate proposals remain open for focused implementation because they change promotion behavior and need dedicated tests plus sample-size guard review.

## 2026-05-30 · strategy-2026-05-29

- Run: strategy-review-2026-05-29-8589087e
- Dates: 2026-05-29
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-29-8589087e/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-29-8589087e/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 222-156 hit 58.7% (499 total)
- Parlays: 11-12 hit 47.8% (25 total)

### Proposed Modifications

- [high] Restrict portfolio-v2 generation to validated conservative profiles (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.test.ts, src/parlay/service.test.ts, src/parlay/analysis.test.ts
- [high] Lower high-combined-odds parlay ceiling to below 2.00 (ready-for-implementation) — src/parlay/analysis.ts, src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.test.ts, src/daily/e2e.test.ts
- [high] Add market-level validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/daily/e2e.test.ts
- [medium] Raise prediction promotion floor and add totals/BTTS market floors (proposed) — src/prediction/service.ts, skills/score-prediction-v2/prompt.md, src/prediction/service.test.ts
- [medium] Demote duplicate winner-family exposure per fixture (proposed) — src/prediction/service.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md, src/prediction/service.test.ts, src/daily/e2e.test.ts
- [medium] Add development/thin-fixture low-odds overconfidence feedback loop (proposed) — skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md, src/prediction/service.ts, src/council/recommendation-council.ts, src/prediction/service.test.ts

## 2026-05-30 · strategy-2026-05-29

- Run: strategy-review-2026-05-29-94329ce7
- Dates: 2026-05-29
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-29-94329ce7/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-29-94329ce7/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 222-156 hit 58.7% (499 total)
- Parlays: 11-12 hit 47.8% (25 total)

### Proposed Modifications

- [high] Add bucket-level validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/strategy-review/daily.ts
- [high] Penalize fair-probability-capped low-price double_chance (ready-for-implementation) — src/prediction/service.ts, src/parlay/eligibility.ts, src/daily/e2e.ts, src/council/recommendation-council.ts, skills/score-prediction-v2/prompt.md
- [high] Hard quarantine promoted parlays at combined odds >= 2.00 (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Exclude non-core and unknown profiles from operational validation scope (ready-for-implementation) — src/parlay/service.ts, src/daily/e2e.ts, src/parlay/analysis.ts, src/metrics/daily.ts
- [medium] Tighten BTTS and goals-over promotion rules (proposed) — src/prediction/service.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Run post-settlement validation before strategy review output (ready-for-implementation) — src/daily/e2e.ts, src/validation/service.ts, src/metrics/daily.ts, scripts/gana-strategy-review.mjs
- [medium] Move semantic duplicate filtering before parlay persistence (ready-for-implementation) — src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts

## 2026-05-31 · strategy-2026-05-30

- Run: strategy-review-2026-05-30-9e99e835
- Dates: 2026-05-30
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-30-9e99e835/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-30-9e99e835/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 106-73 hit 59.2% (231 total)
- Parlays: 8-2 hit 80.0% (10 total)

### Proposed Modifications

- [high] Add market-level validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts
- [high] Allow explicit market skips instead of forcing weak-market predictions (ready-for-implementation) — src/prediction/service.ts, src/prediction/prompts.ts, skills/score-prediction-v2/prompt.md
- [high] Cap uncalibrated 90%+ confidence picks (ready-for-implementation) — src/prediction/service.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [medium] Tighten weak-market parlay eligibility for totals and BTTS (proposed) — src/parlay/eligibility.ts, src/parlay/service.ts, src/daily/e2e.ts
- [medium] Canonicalize duplicate parlay leg sets across profiles (ready-for-implementation) — src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts
- [high] Block high-odds analytical fallback from final recommendations (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts
- [medium] Expand inflated double_chance edge detection beyond ultra-low odds (proposed) — src/parlay/eligibility.ts, src/prediction/service.ts, skills/score-prediction-v2/prompt.md

## 2026-06-01 · strategy-2026-05-31

- Run: strategy-review-2026-05-31-6c4e5d0a
- Dates: 2026-05-31
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-31-6c4e5d0a/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-31-6c4e5d0a/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: blocked
- Predictions: 4-1 hit 80.0% (130 total)
- Parlays: 0-0 hit n/a (4 total)

### Proposed Modifications

- None generated.

## 2026-06-01 · strategy-2026-05-31

- Run: strategy-review-2026-05-31-54d098fd
- Dates: 2026-05-31
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-31-54d098fd/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-05-31-54d098fd/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: blocked
- Predictions: 4-1 hit 80.0% (130 total)
- Parlays: 0-0 hit n/a (4 total)

### Proposed Modifications

- None generated.

## 2026-06-02 · strategy-2026-06-01

- Run: strategy-review-2026-06-01-810a2c85
- Dates: 2026-06-01
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-01-810a2c85/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-01-810a2c85/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 90-48 hit 65.2% (202 total)
- Parlays: 9-7 hit 56.3% (16 total)

### Proposed Modifications

- [high] Apply bucket-level validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/daily/e2e.test.ts, src/metrics/daily.test.ts
- [high] Block hard-risk analytical fallback atomics (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, src/daily/e2e.test.ts, src/council/recommendation-council.test.ts
- [high] Lower final parlay odds ceiling below 2.00 (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts, src/parlay/analysis.test.ts, src/parlay/service.test.ts
- [high] Deduplicate parlay leg sets before persistence (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts, src/parlay/service.test.ts, src/parlay/analysis.test.ts
- [high] Make corners watchlist-only by default (ready-for-implementation) — src/prediction/gates.ts, src/prediction/service.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Tighten totals and BTTS correlated evidence (proposed) — src/prediction/service.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Add sample-size guarded provider feedback (needs-more-data) — src/parlay/ranker.ts, src/parlay/analysis.ts, src/strategy-review/daily.ts, src/prediction/service.ts

## 2026-06-02 · strategy-2026-06-01

- Run: strategy-review-2026-06-01-0ff6beac
- Dates: 2026-06-01
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-01-0ff6beac/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-01-0ff6beac/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 90-48 hit 65.2% (202 total)
- Parlays: 9-7 hit 56.3% (16 total)

### Proposed Modifications

- [high] Gate strategy review by full-date and market-level validation freshness (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/strategy-review/daily.ts, src/validation/service.ts, scripts/gana-strategy-review.mjs
- [high] Restrict promoted parlays to conservative odds and core profiles (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts, src/parlay/rules.ts, src/parlay/ranker.ts
- [medium] Move semantic duplicate parlay filtering before persistence (ready-for-implementation) — src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts
- [high] Quarantine corners until settlement reliability is proven (ready-for-implementation) — src/prediction/gates.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Raise low-price double_chance value requirements (ready-for-implementation) — src/scoring/edge-gate.ts, src/prediction/service.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md
- [medium] Tighten totals and BTTS promotion prompts and floors (proposed) — src/prediction/service.ts, src/parlay/eligibility.ts, src/parlay/service.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Consume council-feedback with sample-size guards (proposed) — src/strategy-review/daily.ts, src/daily/e2e.ts, src/prediction/service.ts, src/parlay/analysis.ts, scripts/gana-council-feedback.mjs

## 2026-06-03 · strategy-2026-06-02

- Run: strategy-review-2026-06-02-81e84f7b
- Dates: 2026-06-02
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-02-81e84f7b/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-02-81e84f7b/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 26-12 hit 68.4% (54 total)
- Parlays: 5-1 hit 83.3% (6 total)

### Proposed Modifications

- [high] Quarantine corners until settlement and market-specific evidence are present (ready-for-implementation) — src/prediction/gates.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Add market-conditioned edge and confidence floors (ready-for-implementation) — src/scoring/edge-gate.ts, src/prediction/gates.ts, skills/score-prediction-v2/prompt.md
- [high] Canonicalize provider duplicates before portfolios and review metrics (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts, src/strategy-review/daily.ts
- [medium] Hard-cap analytical fallback parlays and unknown profiles (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/council/recommendation-council.ts
- [medium] Shift market coverage toward BTTS and standard totals (proposed) — src/filters/low-odds-selector.ts, src/daily/e2e.ts, src/parlay/service.ts, skills/score-prediction-v2/prompt.md
- [high] Make validation freshness market-aware (ready-for-implementation) — src/daily/e2e.ts, src/strategy-review/daily.ts
- [low] Track balanced and market-diverse as probation profiles (needs-more-data) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts

## 2026-06-03 · strategy-2026-06-02

- Run: strategy-review-2026-06-02-fc2e0525
- Dates: 2026-06-02
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-02-fc2e0525/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-02-fc2e0525/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 26-12 hit 68.4% (54 total)
- Parlays: 5-1 hit 83.3% (6 total)

### Proposed Modifications

- [high] Split published recommendation metrics from candidate-pool metrics (ready-for-implementation) — src/strategy-review/daily.ts
- [high] Quarantine corners_over_under from promotion (ready-for-implementation) — src/prediction/service.ts, src/prediction/gates.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Cap analytical fallback parlays below the high-odds failure band (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/daily/e2e.test.ts
- [medium] Add a calibrated atomic watchlist for BTTS and standard totals (proposed) — src/daily/e2e.ts, src/daily/e2e.test.ts
- [medium] Move low-price double_chance discovery to review-only until settlement improves (needs-more-data) — src/filters/low-odds-selector.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md

## 2026-06-04 · strategy-2026-06-03

- Run: strategy-review-2026-06-03-58cbe978
- Dates: 2026-06-03
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-03-58cbe978/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-03-58cbe978/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 22-15 hit 59.5% (90 total)
- Parlays: 5-8 hit 38.5% (13 total)

### Proposed Modifications

- [high] Demote h2h from automatic fallback and parlay eligibility unless it is short-priced and strongly supported (ready-for-implementation) — src/parlay/eligibility.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [high] Harden analytical fallback gates for low-edge and women/youth/development picks (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Apply high-odds and weak-profile purge rules to parlay fallback selection (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [medium] Rebalance market coverage toward BTTS and supported totals (proposed) — src/filters/low-odds-selector.ts, src/parlay/service.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Use validation-history calibration before promoting confidence buckets (needs-more-data) — src/scoring/edge-gate.ts, src/prediction/gates.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [medium] Feed settled recommendation outcomes back into provider and model demotion (proposed) — src/daily/e2e.ts, src/parlay/analysis.ts, src/council/recommendation-council.ts

## 2026-06-04 · strategy-2026-06-03

- Run: strategy-review-2026-06-03-6bcf3c86
- Dates: 2026-06-03
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-03-6bcf3c86/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-03-6bcf3c86/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 22-15 hit 59.5% (90 total)
- Parlays: 5-8 hit 38.5% (13 total)

### Proposed Modifications

- [high] Block unknown and high-odds fallback parlays (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/rules.ts, src/parlay/ranker.ts, src/council/recommendation-council.ts
- [high] Add h2h odds-band promotion floors (ready-for-implementation) — src/scoring/edge-gate.ts, src/prediction/service.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md
- [high] Gate low-price double_chance by value and evidence (ready-for-implementation) — src/prediction/service.ts, src/parlay/eligibility.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [high] Make fallback recommendations hard-risk aware (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Add bucket-level validation freshness gates (ready-for-implementation) — src/strategy-review/daily.ts, src/metrics/daily.ts, src/daily/e2e.ts
- [medium] Shift coverage toward BTTS and standard totals (proposed) — src/filters/low-odds-selector.ts, src/parlay/service.ts, src/daily/e2e.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md

## 2026-06-07 · strategy-2026-06-06

- Run: strategy-review-2026-06-06-157e017b
- Dates: 2026-06-06
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-06-157e017b/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-06-157e017b/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 0-0 hit n/a (141 total)
- Parlays: 0-0 hit n/a (17 total)

### Proposed Modifications

- [high] Run post-settlement validation before strategy review metrics (ready-for-implementation) — src/daily/e2e.ts, src/validation/service.ts, src/metrics/daily.ts, scripts/gana-strategy-review.mjs
- [high] Block council approval when validation freshness is thin (ready-for-implementation) — src/council/recommendation-council.ts, src/daily/e2e.ts, src/council/recommendation-council.test.ts, src/daily/e2e.test.ts
- [high] Tighten analytical fallback atomic gates (ready-for-implementation) — src/daily/e2e.ts, src/parlay/eligibility.ts, src/daily/e2e.test.ts
- [high] Penalize fair-probability-capped low-price double_chance (ready-for-implementation) — src/prediction/service.ts, src/parlay/eligibility.ts, src/parlay/analysis.ts, src/council/recommendation-council.ts, skills/score-prediction-v2/prompt.md
- [medium] Move semantic duplicate filtering before parlay persistence (ready-for-implementation) — src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts
- [medium] Separate final-eligible portfolios from exploratory profiles (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts, src/metrics/daily.ts
- [medium] Allow explicit market skips for weak coverage markets (proposed) — src/prediction/service.ts, src/prediction/gates.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md

## 2026-06-08 · strategy-2026-06-07

- Run: strategy-review-2026-06-07-25af2a73
- Dates: 2026-06-07
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-07-25af2a73/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-07-25af2a73/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 0-0 hit n/a (67 total)
- Parlays: 0-0 hit n/a (5 total)

### Proposed Modifications

- [high] Gate strategy-review readiness on settled validation coverage (ready-for-implementation) — src/strategy-review/daily.ts, src/daily/e2e.ts
- [high] Block edge-capped low-liquidity double-chance parlays from strict final selection (ready-for-implementation) — src/parlay/analysis.ts, src/parlay/eligibility.ts, src/daily/e2e.ts
- [medium] Constrain analytical fallback atomics to clean evidence or provider consensus (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts
- [medium] Add market-specific edge floors for low-price and high-confidence promotion (proposed) — src/prediction/service.ts, src/scoring/edge-gate.ts, src/parlay/service.ts, skills/score-prediction-v2/prompt.md
- [medium] Split portfolio-v2 final profiles from exploratory profiles (proposed) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts

## 2026-06-08 · strategy-2026-06-07

- Run: strategy-review-2026-06-07-007082e4
- Dates: 2026-06-07
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-07-007082e4/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-07-007082e4/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 0-0 hit n/a (67 total)
- Parlays: 0-0 hit n/a (5 total)

### Proposed Modifications

- [high] Add settlement-completeness preflight for strategy review (ready-for-implementation) — scripts/gana-strategy-review.mjs, scripts/gana-strategy-review.sh, src/strategy-review/daily.ts
- [high] Scope validation review to published recommendation targets (ready-for-implementation) — src/strategy-review/daily.ts, src/metrics/daily.ts, src/validation/service.ts, src/daily/e2e.ts
- [high] Block low-liquidity inflated double-chance parlays from strict final promotion (ready-for-implementation) — src/parlay/analysis.ts, src/parlay/eligibility.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [medium] Run daily portfolio-v2 with final-eligible profiles by default (proposed) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts
- [medium] Constrain analytical fallback singles by evidence risk concentration (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [low] Keep corners market as watchlist-only until settlement coverage exists (needs-more-data) — src/daily/e2e.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md

## 2026-06-09 · strategy-2026-06-08

- Run: strategy-review-2026-06-08-dcc42d30
- Dates: 2026-06-08
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-08-dcc42d30/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-08-dcc42d30/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 9-4 hit 69.2% (83 total)
- Parlays: 0-0 hit n/a (18 total)

### Proposed Modifications

- [high] Add settled-sample guards to strategy review buckets (ready-for-implementation) — src/strategy-review/daily.ts
- [high] Tighten analytical fallback atomic eligibility (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts
- [high] Cap analytical fallback parlays with conservative final gates (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts
- [high] Sanitize and recompute parlay combined odds before persistence and analysis (ready-for-implementation) — src/parlay/rules.ts, src/parlay/service.ts, src/parlay/analysis.ts
- [high] Quarantine medium-confidence standard totals from final promotion (proposed) — src/prediction/service.ts, src/parlay/eligibility.ts, src/daily/e2e.ts, skills/score-prediction-v2/prompt.md
- [medium] Split portfolio-v2 final profiles from exploratory profiles (proposed) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts

## 2026-06-09 · strategy-2026-06-08

- Run: strategy-review-2026-06-08-bbe13cf8
- Dates: 2026-06-08
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-08-bbe13cf8/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-08-bbe13cf8/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 36-23 hit 61.0% (83 total)
- Parlays: 4-14 hit 22.2% (18 total)

### Proposed Modifications

- [high] Quarantine parlay-all-in from final daily promotion (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts, src/parlay/analysis.test.ts, src/parlay/service.test.ts, src/daily/e2e.test.ts
- [high] Add canonical semantic duplicate and overlap filtering (ready-for-implementation) — src/parlay/analysis.ts, src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.test.ts, src/daily/e2e.test.ts
- [high] Stop forcing parlays when strict gates fail (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, src/daily/e2e.test.ts, src/council/recommendation-council.test.ts
- [medium] Make validation freshness market-aware (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/metrics/daily.test.ts, src/daily/e2e.test.ts
- [medium] Add market-specific promotion thresholds (proposed) — src/prediction/gates.ts, src/scoring/edge-gate.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md, skills/research-fixture-v2/prompt.md, src/prediction/gates.test.ts
- [medium] Add profile and parlay-model cooldown feedback (proposed) — src/metrics/daily.ts, src/parlay/analysis.ts, src/daily/e2e.ts, src/council/recommendation-council.ts, src/parlay/analysis.test.ts, src/daily/e2e.test.ts

## 2026-06-10 · strategy-2026-06-09

- Run: strategy-review-2026-06-09-c107aac8
- Dates: 2026-06-09
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-09-c107aac8/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-09-c107aac8/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 365-177 hit 67.3% (857 total)
- Parlays: 18-22 hit 45.0% (40 total)

### Proposed Modifications

- [high] Quarantine parlay-all-in from final daily promotion (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Deduplicate parlay leg sets before persistence (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts
- [high] Sanitize and recompute parlay combined odds (ready-for-implementation) — src/parlay/rules.ts, src/parlay/service.ts, src/parlay/analysis.ts
- [high] Add market and odds-band promotion floors (ready-for-implementation) — src/prediction/service.ts, src/scoring/edge-gate.ts, src/prediction/gates.ts, skills/score-prediction-v2/prompt.md, skills/research-fixture-v2/prompt.md
- [high] Make validation freshness market-aware (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/strategy-review/daily.ts
- [medium] Add rolling profile and model cooldown feedback (proposed) — src/metrics/daily.ts, src/parlay/analysis.ts, src/daily/e2e.ts, src/council/recommendation-council.ts
- [medium] Expand low-odds discovery toward conservative goals totals (proposed) — src/filters/low-odds-selector.ts, src/parlay/service.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md

## 2026-06-10 · strategy-2026-06-09

- Run: strategy-review-2026-06-09-8934228b
- Dates: 2026-06-09
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-09-8934228b/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-09-8934228b/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 365-177 hit 67.3% (857 total)
- Parlays: 18-22 hit 45.0% (40 total)

### Proposed Modifications

- [high] Quarantine parlay-all-in and market-diverse from final daily promotion (ready-for-implementation) — src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Sanitize and recompute parlay odds before persistence and analysis (ready-for-implementation) — src/parlay/rules.ts, src/parlay/service.ts, src/parlay/analysis.ts
- [high] Move semantic duplicate and fixture-overlap filtering before parlay persistence (ready-for-implementation) — src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts
- [high] Add market-level validation freshness and settled-sample guards (ready-for-implementation) — src/strategy-review/daily.ts, src/metrics/daily.ts, src/daily/e2e.ts
- [high] Add market-specific promotion floors for BTTS, low-price double_chance, and risky H2H (ready-for-implementation) — src/scoring/edge-gate.ts, src/prediction/service.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md, skills/research-fixture-v2/prompt.md
- [medium] Allow fewer parlays and fill with clean atomic recommendations (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts
- [medium] Add profile and parlay-model cooldown feedback (proposed) — src/metrics/daily.ts, src/parlay/analysis.ts, src/daily/e2e.ts, src/council/recommendation-council.ts

## 2026-06-12 · strategy-2026-06-11

- Run: strategy-review-2026-06-11-69e986b6
- Dates: 2026-06-11
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-11-69e986b6/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-11-69e986b6/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 11-2 hit 84.6% (166 total)
- Parlays: 1-1 hit 50.0% (14 total)

### Proposed Modifications

- [high] Quarantine parlay-all-in from final daily promotion (ready-for-implementation) — src/daily/recommendation-policy.ts, src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Add low-price double_chance post-cap edge floors (ready-for-implementation) — src/prediction/service.ts, src/scoring/edge-gate.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md
- [high] Constrain fallback atomics to clean evidence or provider consensus (ready-for-implementation) — src/daily/recommendation-policy.ts, src/daily/e2e.ts, src/council/recommendation-council.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Gate strategy feedback on settled validation coverage (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/strategy-review/daily.ts, src/validation/service.ts, scripts/gana-strategy-review.mjs
- [medium] Move semantic duplicate and overlap filtering before parlay persistence (ready-for-implementation) — src/parlay/service.ts, src/parlay/analysis.ts, src/daily/e2e.ts
- [medium] Split portfolio-v2 final profiles from exploratory profiles (ready-for-implementation) — src/daily/e2e.ts, src/parlay/service.ts, src/parlay/analysis.ts
- [medium] Add line-specific totals guards before expanding market coverage (needs-more-data) — src/filters/low-odds-selector.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [low] Add sample-size guarded provider and model cooldown feedback (needs-more-data) — src/metrics/daily.ts, src/parlay/analysis.ts, src/daily/e2e.ts, src/prediction/service.ts

## 2026-06-12 · strategy-2026-06-11

- Run: strategy-review-2026-06-11-acf1ca10
- Dates: 2026-06-11
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-11-acf1ca10/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-11-acf1ca10/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 77-39 hit 66.4% (166 total)
- Parlays: 9-4 hit 69.2% (14 total)

### Proposed Modifications

- [high] Quarantine parlay-all-in and unknown profiles from final promotion (ready-for-implementation) — src/daily/recommendation-policy.ts, src/parlay/analysis.ts, src/parlay/service.ts
- [high] Move semantic parlay dedupe before persistence and validation (ready-for-implementation) — src/parlay/service.ts, src/parlay/rules.ts, src/parlay/ranker.ts, src/daily/e2e.ts
- [high] Make validation freshness an active council gate (ready-for-implementation) — src/daily/e2e.ts, src/council/recommendation-council.ts, src/metrics/daily.ts
- [high] Add market and odds-band promotion floors (ready-for-implementation) — src/scoring/edge-gate.ts, src/prediction/gates.ts, src/prediction/service.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md
- [high] Gate fair-probability-capped low-price double chance (ready-for-implementation) — src/prediction/service.ts, src/parlay/eligibility.ts, src/daily/recommendation-policy.ts, skills/score-prediction-v2/prompt.md
- [medium] Add conservative totals coverage as a measured watchlist (needs-more-data) — src/filters/low-odds-selector.ts, src/parlay/service.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md

## 2026-06-13 · strategy-2026-06-12

- Run: strategy-review-2026-06-12-1826080a
- Dates: 2026-06-12
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-12-1826080a/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-12-1826080a/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 58-45 hit 56.3% (1275 total)
- Parlays: 0-13 hit 0.0% (56 total)

### Proposed Modifications

- [high] Restrict daily portfolio-v2 generation to stable profiles (ready-for-implementation) — src/daily/e2e.ts, src/daily/recommendation-policy.ts, src/parlay/profile-specs.ts, src/parlay/analysis.ts
- [high] Apply hard final parlay floors for odds and aggregate confidence (ready-for-implementation) — src/daily/recommendation-policy.ts, src/council/recommendation-council.ts, src/parlay/analysis.ts
- [high] Add fixture-level contradiction gates for scorer output (ready-for-implementation) — src/prediction/service.ts, src/prediction/gates.ts, skills/score-prediction-v2/prompt.md
- [high] Add model-market reliability risk flags (proposed) — src/metrics/daily.ts, src/daily/recommendation-policy.ts, src/council/recommendation-council.ts, src/parlay/eligibility.ts
- [medium] Tighten restored fallback atomic publication (ready-for-implementation) — src/daily/recommendation-policy.ts, src/council/recommendation-council.ts, src/daily/e2e.ts
- [medium] Rebalance low-odds market coverage away from weak h2h exposure (proposed) — src/filters/low-odds-selector.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [medium] Gate strategy learning on validation freshness (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/council/recommendation-council.ts

## 2026-06-13 · strategy-2026-06-12

- Run: strategy-review-2026-06-12-11935d4d
- Dates: 2026-06-12
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-12-11935d4d/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-12-11935d4d/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 464-329 hit 58.5% (1275 total)
- Parlays: 15-39 hit 27.8% (56 total)

### Proposed Modifications

- [high] Shrink portfolio-v2 to publishable conservative profiles (ready-for-implementation) — src/daily/e2e.ts, src/daily/types.ts, src/daily/e2e.test.ts
- [high] Align parlay-refinado and parlay-all-in generation with final gates (ready-for-implementation) — src/parlay/profile-specs.ts, src/parlay/service.ts, src/parlay/service.test.ts, src/daily/recommendation-policy.ts
- [high] Add parlay overconfidence penalty for 90%+ aggregate confidence (ready-for-implementation) — src/parlay/analysis.ts, src/daily/recommendation-policy.ts, src/council/recommendation-council.ts, src/parlay/analysis.test.ts, src/daily/e2e.test.ts
- [high] Suppress same-fixture contradictory selections before ranking (ready-for-implementation) — src/parlay/correlation.ts, src/parlay/service.ts, src/daily/recommendation-policy.ts, skills/score-prediction-v2/prompt.md, src/parlay/service.test.ts, src/daily/e2e.test.ts
- [medium] Add market/profile-specific validation freshness gates (ready-for-implementation) — src/daily/e2e.ts, src/daily/recommendation-policy.ts, src/metrics/daily.ts, src/strategy-review/daily.ts, src/daily/e2e.test.ts
- [medium] Move corners to daily watchlist-only unless explicitly requested (proposed) — src/daily/e2e.ts, src/domain/markets.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md, src/parlay/eligibility.ts
- [medium] Demote gemini-2.5-flash for parlay construction only (needs-more-data) — src/daily/recommendation-policy.ts, src/parlay/service.ts, src/daily/e2e.ts, src/daily/e2e.test.ts

## 2026-06-14 · strategy-2026-06-13

- Run: strategy-review-2026-06-13-3075cef7
- Dates: 2026-06-13
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-13-3075cef7/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-13-3075cef7/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 87-95 hit 47.8% (314 total)
- Parlays: 10-9 hit 52.6% (19 total)

### Proposed Modifications

- [high] Harden analytical fallback atomics (ready-for-implementation) — src/daily/recommendation-policy.ts, src/daily/e2e.test.ts
- [high] Remove parlay-all-in and unknown profiles from final promotion (ready-for-implementation) — src/daily/recommendation-policy.ts, src/parlay/analysis.ts, src/parlay/profile-specs.ts
- [high] Tighten h2h and high-odds exposure gates (ready-for-implementation) — src/parlay/eligibility.ts, src/daily/recommendation-policy.ts, skills/score-prediction-v2/prompt.md
- [medium] Keep corners out of default market coverage (ready-for-implementation) — src/prediction/gates.ts, src/daily/e2e.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
- [high] Use validation freshness as a review scheduling gate (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/validation/service.ts
- [medium] Canonicalize duplicate parlay outcomes by leg signature in metrics (ready-for-implementation) — src/parlay/analysis.ts, src/metrics/daily.ts, src/daily/recommendation-policy.ts
- [medium] Add sample-size guarded model calibration dampers (needs-more-data) — src/scoring/edge-gate.ts, skills/score-prediction-v2/prompt.md, src/prediction/gates.ts

## 2026-06-14 · strategy-2026-06-13

- Run: strategy-review-2026-06-13-5e2c4566
- Dates: 2026-06-13
- Artifact: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-13-5e2c4566/strategy-review.json
- Report: /Users/luisalvarado/Documents/GitHub/gana-v9/.artifacts/gana-v9/runs/strategy-review-2026-06-13-5e2c4566/strategy-review.md
- Model: gpt-5.5
- Reasoning: xhigh
- Agent status: ok
- Predictions: 87-95 hit 47.8% (314 total)
- Parlays: 10-9 hit 52.6% (19 total)

### Proposed Modifications

- [high] Quarantine parlay-all-in and unknown from daily final promotion (ready-for-implementation) — src/daily/recommendation-policy.ts, src/daily/e2e.ts, src/parlay/analysis.ts, src/parlay/service.ts, src/parlay/profile-specs.ts
- [high] Harden analytical fallback atomic gates (ready-for-implementation) — src/daily/recommendation-policy.ts, src/daily/e2e.ts, src/parlay/eligibility.ts
- [high] Add sample-size guarded model-market cooldowns (proposed) — src/daily/recommendation-policy.ts, src/scoring/edge-gate.ts, src/prediction/gates.ts, src/parlay/eligibility.ts, skills/score-prediction-v2/prompt.md
- [high] Promote only buckets with fresh validation coverage (ready-for-implementation) — src/daily/e2e.ts, src/metrics/daily.ts, src/strategy-review/daily.ts, src/validation/service.ts
- [medium] Rebalance low-odds coverage away from weak h2h exposure (proposed) — src/filters/low-odds-selector.ts, src/parlay/eligibility.ts, skills/research-fixture-v2/prompt.md, skills/score-prediction-v2/prompt.md
