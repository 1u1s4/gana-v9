# Daily E2E comparativo Codex/Gemini

Origen: `docs/planes/por_hacer/goal.md`

## Entregables completados

- Daily E2E usa `providerAgentic = providers.join(',')` en artifacts, `run.json` y `HarnessRun`.
- El criterio `ok/verdict` ya no exige `consensus-mixed`: si hay runs validos, alguna familia de parlay valida, analysis ok y metrics ok, el batch queda ok; si no hay consenso mixto queda `review-required`.
- Se agrego comparacion explicita Codex/Gemini:
  - `src/daily/comparison.ts`
  - `daily-provider-comparison.json`
  - `daily-provider-consensus.json`
- `daily-e2e-summary.json` incluye:
  - counts por provider
  - counts por familia de parlay
  - recommendation count
  - providerComparison summary
  - providerConsensus summary
- `daily-parlay-recommendations.json` referencia artifacts de comparison/consensus.
- Dashboard soporta `tab=daily` con filtros:
  - `dailyBatchId`
  - `provider`
  - `model`
  - `family`
  - `recommendationTier`
- Dashboard Daily muestra batches diarios, comparacion, consenso y cards de recomendaciones de parlays.
- Daily metrics ahora incluye buckets por provider/model:
  - predictionMetrics.byProvider
  - predictionMetrics.byModel
  - parlayMetrics.byProvider
  - parlayMetrics.byModel
  - chartMetrics provider/model para predicciones y parlays.

## Archivos principales

- `src/daily/e2e.ts`
- `src/daily/comparison.ts`
- `src/metrics/daily.ts`
- `src/dashboard/query.ts`
- `src/dashboard/types.ts`
- `src/dashboard/server.ts`
- `src/dashboard/page.ts`

## Tests agregados/actualizados

- `src/daily/comparison.test.ts`
- `src/daily/e2e.test.ts`
- `src/metrics/daily.test.ts`
- `src/dashboard/query.test.ts`
- `src/dashboard/server.test.ts`
- `src/dashboard/page.test.ts`

## Verificacion

- `npm run typecheck`: passed
- `npm test`: passed, 359/359

Todos los artifacts nuevos se mantienen como `analyticalArtifactOnly: true` y `executionCapability: none`.
