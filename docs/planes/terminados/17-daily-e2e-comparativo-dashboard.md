# Daily E2E comparativo Codex/deprecated provider

Origen: `docs/planes/por_hacer/goal.md`

## Entregables completados

- Daily E2E usa `providerAgentic = providers.join(',')` en artifacts, `run.json` y `HarnessRun`.
- El criterio `ok/verdict` ya no exige `consensus-mixed`: si hay runs validos, alguna familia de parlay valida, analysis ok y metrics ok, el batch queda ok; si no hay consenso mixto queda `review-required`.
- Se agrego comparacion explicita Codex/deprecated provider:
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
- Dashboard Daily ya no hace auto-refresh periodico; la vista queda estable hasta que el usuario refresque o cambie filtros.
- Daily metrics ahora incluye buckets por provider/model:
  - predictionMetrics.byProvider
  - predictionMetrics.byModel
  - parlayMetrics.byProvider
  - parlayMetrics.byModel
  - chartMetrics provider/model para predicciones y parlays.
- CLI registra `daily-e2e` como comando headless valido.
- Los run ids derivados de Daily E2E quedan acotados a 36 caracteres para respetar el schema DB.

## Smoke live con `.env`

Se ejecuto un Daily E2E real pequeno con web live y providers Codex/deprecated provider:

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=1 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
npm run gana -- daily-e2e \
  --date 2026-05-15 \
  --providers codex,deprecated-provider \
  --web live \
  --max-fixtures 1 \
  --threshold 1.20 \
  --parlay-profile balanced \
  --daily-batch-id daily-2026-05-15-v2
```

Resultado:

- Batch: `daily-2026-05-15-v2`
- Artifact: `.artifacts/gana-v9/runs/daily-2026-05-15-v2`
- Codex run: `d71ca351-4ad1-4d70-819a-07ae5df2f95b`, `review-required`, 5 predicciones.
- deprecated provider run: `ea1eb25c-53e6-468a-8078-b64e50aec505`, `review-required`, 5 predicciones.
- Comparacion: 10 predicciones comparables, 4 grupos, 3 mismas selecciones, 1 misma market con seleccion distinta, agreement rate `0.75`.
- Consenso: 3 predicciones, providers `codex,deprecated-provider`, confianza media `0.5933`, edge medio `0.0393`.
- Metrics: `daily-2026-05-15-v2-metrics`, persistido `1`.
- Parlays: familias `codex-only`, `deprecated-provider-only` y `consensus-mixed` quedaron `blocked` porque el smoke uso `--max-fixtures 1` y no habia suficientes legs para construir parlays validos.
- Dashboard: `GET /api/overview?tab=daily&dailyBatchId=daily-2026-05-15-v2&take=5` devuelve el batch, providers, parlays bloqueados, comparacion, consenso y metrics.

Durante el primer intento live se encontro un bug productivo: ids derivados como `daily-2026-05-15-smoke-codex-balanced` excedian `HarnessRun.id CHAR(36)`. Se corrigio con ids diarios acotados y hash estable.

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
- `npm test`: passed, 361/361
- `npm run gana -- certify --profile ci-certification`: passed, manifest hash `8535d1b35dae2b25217df94a529ebb831ccccdb82d76903d338e43929c25207d`
- Smoke live `.env`: completed con artifacts y dashboard; verdict `review-required` por parlays insuficientes en `--max-fixtures 1`, sin resultados inventados.

Todos los artifacts nuevos se mantienen como `analyticalArtifactOnly: true` y `executionCapability: none`.
