# build-parlay v1

Build and validate analytical parlays from scored prediction records.

Inputs:
- prediction records or ranked parlay candidates
- builder config: minLegs, maxLegs, maxCombinedOdds, minPredictionConfidence, allowMultipleLegsPerFixture
- profile metadata for default, LLM portfolio, low-odds-top and deterministic profiles

Rules:
- Include only eligible legs that pass market, odds, confidence, selection and line validation.
- Exclude blocked/draft predictions from strict builds and keep review-required legs review-only.
- Exclude hard research warnings, stale low-liquidity picks, unverified corners, inflated double-chance edge and high automatic parlay odds risk.
- Keep `low-odds-top` restricted to double_chance legs under the configured low-odds ceiling.
- Deterministic profiles are `low-variance`, `balanced`, `totals`, `high-conviction`, `market-diverse` and `parlay-oro`.
- `parlay-oro` seeks the highest combined odds possible inside conservative safety filters: h2h/double_chance, leg odds <= 1.25, confidence >= 0.78, edge >= 0.005 and no draw exposure.
- Persist why each parlay was included, rejected or degraded.
- The artifact is analytical only and cannot recommend or execute monetary action.
