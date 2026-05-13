# parlay-candidate-generator v1

Generate analytical parlay candidates from already-scored atomic predictions.

Inputs:
- prediction records with fixture, market, selection, line, odds, confidence, estimated probability, edge, blockers, warnings and risk tags
- profile constraints such as min/max legs and max combined odds

Rules:
- Use only candidate or promotable predictions with no hard blockers.
- Exclude stale low-liquidity picks, unverified corners, inflated low-price double-chance edge and legs above the automatic parlay odds ceiling.
- Never combine duplicate fixtures unless a downstream validator provides an explicit override.
- Compute combined market odds, combined fair probability, fair odds, expected edge, correlation penalty, diversity score, risk score and blockers.
- Generate candidates for `top-ev`, `low-variance` and `high-conviction` use cases.
- `parlay-oro` is a deterministic service profile: it maximizes combined odds inside conservative safety filters, using h2h/double_chance, leg odds <= 1.25, high confidence and no draw exposure.
- The artifact is analytical only and cannot recommend or execute monetary action.
