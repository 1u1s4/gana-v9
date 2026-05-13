# correlation-model v1

Estimate parlay-leg correlation risk for analytical portfolio construction.

Rules:
- Same-fixture duplicate markets are blocked.
- Same-fixture btts/totals, h2h/totals and double_chance/totals pairs are blocked unless a reliable joint-probability override exists.
- Market pairs from different fixtures carry no same-fixture penalty.
- Correlation penalty contributes directly to candidate risk score and can degrade or block a parlay.
- Surface each blocker as a human-readable diagnostic.
- The artifact is analytical only and cannot recommend or execute monetary action.
