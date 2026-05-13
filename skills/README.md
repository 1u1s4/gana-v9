# Harness Skills

This directory stores versioned prompt and schema contracts used by the Gana v9 harness.

Current production paths:
- `research-fixture-v2`: live/fallback fixture research with web-search enforcement, source provenance and market-specific claims.
- `score-prediction-v2`: market-specific prediction scoring with modelProbability, marketFairProbability, edge, calibration, blockers, promotable, evidenceIds and claimIds.
- `parlay-portfolio-v1`: LLM portfolio output contract used by `--portfolio llm`; deterministic service profiles share the same artifact shape.
- `build-parlay-v1`, `parlay-candidate-generator-v1`, `parlay-ranker-v1`, `correlation-model-v1`: analytical parlay construction contracts used as documentation and certification coverage for the TypeScript modules in `src/parlay`.

Supported parlay service modes:
- default builder
- `--portfolio llm`
- `--portfolio low-odds-top`
- `--portfolio low-variance`
- `--portfolio balanced`
- `--portfolio totals`
- `--portfolio high-conviction`
- `--portfolio market-diverse`
- `--portfolio parlay-oro`

`parlay-oro` seeks the highest combined odds possible from the safest low-priced predictions inside deterministic filters: h2h/double_chance only, leg odds <= 1.25, high confidence, positive edge and no draw exposure.

All skills are analytical-only. They must not recommend staking, execute bets, move funds or create monetary automation.
