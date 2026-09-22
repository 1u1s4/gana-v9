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
- Evaluate each requested market with an allowed quote. Thin candidates must have `promotable=false` and clear blockers. When there is no defensible probability/evidence, emit a blocked candidate with null probability/modelProbability, zero confidence, low confidenceBand and only actual evidence (empty arrays when none). Coverage never requires fabricated probabilities or weaker gates.
- For priority or required fixtures, emit conservative high-probability alternatives in addition to the primary market pick when `allowedQuotes` contains realistic lower-variance lines. Prefer supported goals bands such as under 3.0/3.25/3.5 or over 1.0/1.25/1.5, and protected result-style markets only when their fair probability is not anomalous.
- Do not force a conservative alternative when it has non-positive edge, distorted fair probability, stale/low-liquidity-only support, or weaker evidence than the primary pick; explain the blocker instead.
- Use `modelProbability`, `marketFairProbability`, `edge`, `confidenceBand`, `blockers`, `promotable`, `evidenceIds` and `claimIds`.
- Edge must be based on market fair probability or consensus/devig when available. Do not base edge only on raw implied probability.
- `modelProbability` is an uncalibrated, evidence-grounded event estimate before service-side calibration. Explain line-specific assumptions and uncertainty; historical frequencies are inputs, not automatically the forecast. Missing calibration history alone does not prevent a defensible model estimate. If the factual basis is insufficient, retain null probability and explicit blockers; never manufacture positive edge.
- The service applies empirical calibration and the existing sample-size, confidence and promotion gates afterward. Report missing or small settled samples, use conservative confidence and never claim empirically calibrated accuracy without support. Do not apply an invented calibration adjustment yourself.
- Promotion is confidence-floor aware: picks below the promotion floor must be review-required, not promotable.
- Require market-specific evidence for promotable picks. Fixture-only support remains review-required with an explicit missing-market-evidence blocker.
- Compare result, protected result, goals, BTTS and verified corners approaches independently. A home win and home-or-draw share a directional thesis; do not count them as independent diversification.
- Give a brief rationale covering facts, relevance to the selected line, and the main failure scenario, with actual supplied evidence IDs. Price favoritism alone does not establish positive edge.
- Keep event probability, devig market probability and evidence confidence distinct. A short price alone never establishes diamond/high-confidence status. Do not assert calibration without supplied settled history or use later match results as pre-match evidence.
- Preserve explicit signal tags in rationale/warnings for low-odds, women/femenino, and youth/development fixtures (`U23`, `U21`, `U20`, `U19`, `U18`, `sub-*`, reserves/B/II`) so final selection and council feedback can measure those buckets separately.
- Prefer low-variance markets (`double_chance`, short h2h favorites with real liquidity, and conservative totals) when evidence shows a structural mismatch; do not promote thin-liquidity youth/women picks without market-specific support.
- Block or degrade stale odds/source, low-liquidity stale picks, unverified corners, high-odds automatic parlay risk, lineup pending, material model disagreement and inflated low-price double-chance edge.
- `gpt-5.6-luna` output is review-only until calibration history is sufficient.
- Promotable is false when any hard blocker exists.
- The artifact is analytical only and cannot recommend or execute monetary action.
