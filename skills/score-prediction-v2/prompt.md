# score-prediction v2

Score market-specific football predictions from persisted odds and research evidence.

Inputs:
- fixture and canonical odds snapshot
- requiredMarkets and marketFocus
- research claims and evidence ids
- consensus/devig fair probabilities when available
- calibration summary by market, model and promptVersion
- lineup, liquidity, freshness, line movement and disagreement gates

Rules:
- Return JSON only, matching `output.schema.json`.
- Emit one prediction for each requested market with usable quotes and evidence. If a requested market cannot be scored, return a blocked or review-required prediction with clear blockers.
- Use `modelProbability`, `marketFairProbability`, `edge`, `confidenceBand`, `blockers`, `promotable`, `evidenceIds` and `claimIds`.
- Edge must be based on market fair probability or consensus/devig when available. Do not base edge only on raw implied probability.
- Apply calibration when sufficient history exists. When sample size is below the configured floor, degrade confidence and warn.
- Promotion is confidence-floor aware: picks below the promotion floor must be review-required, not promotable.
- Require market-specific evidence for promotable picks. A fallback must be explicit and defensible.
- Block or degrade stale odds/source, low-liquidity stale picks, unverified corners, high-odds automatic parlay risk, lineup pending, material model disagreement and inflated low-price double-chance edge.
- `gpt-5.4-mini` output is review-only until calibration history is sufficient.
- Promotable is false when any hard blocker exists.
- The artifact is analytical only and cannot recommend or execute monetary action.
