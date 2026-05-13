# parlay-ranker v1

Rank analytical parlay candidates after candidate generation and correlation checks.

Inputs:
- parlay candidates with expectedEdge, riskScore, diversityScore, combinedMarketOdds, combinedFairProbability, blockers and profile reason
- profile-specific risk weight

Rules:
- Blocked candidates rank below unblocked candidates.
- Default ranking is expected edge minus risk penalty, with a small diversity bonus.
- Preserve distinct candidate signatures so duplicate parlays do not crowd the portfolio.
- For `market-diverse`, prefer more market and market-family diversity when quality is similar.
- For `parlay-oro`, maximize combined market odds first, then combined fair probability, expected edge and lower risk.
- Keep same-fixture correlation blockers visible for diagnostics.
- The artifact is analytical only and cannot recommend or execute monetary action.
