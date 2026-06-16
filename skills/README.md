# Harness Skills

This directory stores versioned prompt and schema contracts used by the Gana v9 harness.

For the full repo-level skill map, including `.agents/skills`, see [docs/skills.md](../docs/skills.md).

## Directory Contract

Each `skills/<id-version>/` directory should contain:

- `skill.json`: metadata, trusted/untrusted context, input names, output schema, eval names, and `promptSha256`.
- `prompt.md`: the model-facing prompt contract.
- `output.schema.json`: the structured output contract.
- `tests/manifest.test.json`: certification coverage for the prompt/schema contract.

All skills are analytical-only. They must not recommend staking, execute bets, move funds, or create monetary automation.

## Current Production Paths

- `research-fixture-v2`: live/fallback fixture research with web-search enforcement, source provenance, ranked source ids, and market-specific claims.
- `score-prediction-v2`: market-specific prediction scoring with `modelProbability`, `marketFairProbability`, edge, calibration, blockers, `promotable`, `evidenceIds`, and `claimIds`.
- `parlay-portfolio-v1`: LLM portfolio output contract used by `--portfolio llm`; deterministic service profiles share the same artifact shape.
- `llm-parlay-all-in-v1`: guarded LLM selector for one safe analytical accumulator from a prediction pool.
- `llm-parlay-refinado-v1`: refined LLM-first parlay selector with guardrails and fallback behavior.
- `build-parlay-v1`, `parlay-candidate-generator-v1`, `parlay-ranker-v1`, `correlation-model-v1`: analytical parlay construction contracts used as documentation and certification coverage for `src/parlay`.
- `validate-settlement-v1`, `validation-clv-v1`, `calibration-monitor-v1`: validation, CLV, and calibration contracts.

## Supported Parlay Service Modes

- default builder
- `--portfolio llm`
- `--portfolio low-odds-top`
- `--portfolio low-variance`
- `--portfolio balanced`
- `--portfolio totals`
- `--portfolio high-conviction`
- `--portfolio market-diverse`
- `--portfolio parlay-oro`
- `--portfolio parlay-refinado`
- `--portfolio portfolio-v2`

`parlay-oro` seeks the highest combined odds possible from the safest low-priced predictions inside deterministic filters: h2h/double_chance only, leg odds <= 1.25, high confidence, positive edge, and no draw exposure.

`portfolio-v2` is the daily operational portfolio. It prioritizes the visible daily approach set (`parlay-diamante`, `parlay-refinado`, `low-variance`) while allowing other profiles to remain auditable as blocked or selected depending on guardrails.

## Maintenance Checklist

When a prompt changes:

1. Update `prompt.md`.
2. Recalculate `promptSha256` in `skill.json`.
3. Update `tests/manifest.test.json` if the contract changed.
4. Run the focused tests for the consuming module.
5. Run `pnpm typecheck`; run `pnpm test` when daily/parlay/scoring/validation behavior changes.
