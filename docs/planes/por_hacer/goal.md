## Cómo lo veo ahora

Lo veo en una etapa muy buena para pasar del **harness productivo** a un flujo más maduro de **operación diaria comparativa**.

Ya tienes la base correcta: Codex y Gemini están modelados como proveedores agentic nativos, con labels, modelos default y soporte de web search nativo diferenciado (`Codex web_search` y `Gemini google_web_search`). Eso significa que el siguiente paso natural no es “otro modelo más”, sino **hacer que ambos corran diariamente sobre el mismo universo de fixtures y comparar sus salidas**. 

También ya existe una base fuerte para dashboard: tabs de predictions, parlays, validations y metrics; shortcuts de exploración; filtros por fecha; métricas diarias; y helpers visuales para métricas de predicciones y parlays. 

Mi recomendación sería continuar con este objetivo:

> Convertir Gana v9 en un sistema diario de predicción comparativa Codex vs Gemini, con parlays analíticos, recomendaciones de parlays y dashboard claro para inspeccionar modelo, run, mercado, confianza, edge, validación y desempeño.

Mantén siempre la línea de seguridad: **parlays como artifacts analíticos**, sin ejecución monetaria ni instrucciones para apostar. Tu código ya maneja esa dirección con `analyticalArtifactOnly: true` y `executionCapability: 'none'` en el análisis de parlays. 

---

# Prioridad 1: E2E diario dual-provider

Ahora mismo tu operación diaria debería dejar de ser:

```text
run de un provider -> predictions -> parlays
```

y pasar a ser:

```text
daily e2e
  -> run Codex
  -> run Gemini
  -> comparar predicciones
  -> construir parlays por provider
  -> construir parlays combinados
  -> analizar/recomendar parlays
  -> exportar artifacts
  -> mostrar en dashboard
```

La ventaja es que Codex y Gemini no competirían de forma informal. Cada día tendrías dos runs comparables sobre los mismos fixtures, mismas odds y misma ventana.

## Comando recomendado

Yo agregaría un comando nuevo:

```bash
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini
```

Con flags opcionales:

```bash
pnpm gana daily-e2e \
  --date YYYY-MM-DD \
  --providers codex,gemini \
  --max-fixtures 100 \
  --threshold 1.20 \
  --web live \
  --parlay-profile balanced
```

## Qué debería hacer internamente

El flujo debería ser:

```text
1. Resolver fecha y ventana operativa.
2. Descubrir fixtures una sola vez.
3. Consultar odds una sola vez o reutilizar snapshots del día.
4. Ejecutar run Codex.
5. Ejecutar run Gemini.
6. Guardar ambos runIds.
7. Construir parlays Codex-only.
8. Construir parlays Gemini-only.
9. Construir parlays mixtos Codex+Gemini.
10. Ejecutar parlay analysis/recommendations.
11. Generar daily metrics.
12. Exportar daily report.
```

Algo importante: no dupliques innecesariamente llamadas a API-Football. La diferencia principal debe estar en el research/scoring agentic, no en consultar dos veces los mismos fixtures y odds.

---

# Prioridad 2: crear una capa de comparación Codex vs Gemini

No basta con que ambos generen predicciones. Necesitas una capa que diga:

```text
Codex dijo X.
Gemini dijo Y.
Ambos coincidieron.
Ambos discreparon.
Uno tiene más edge.
Uno tiene más evidencia.
Uno quedó blocked/review-required.
```

Yo implementaría un módulo nuevo:

```text
src/prediction/comparison.ts
src/prediction/consensus.ts
```

O, si quieres mantenerlo más amplio:

```text
src/daily/provider-comparison.ts
```

## Salidas que debería producir

Para cada fixture/market/selection comparable:

```ts
interface ProviderPredictionComparison {
  fixtureId: string;
  market: string;
  selection: string;
  line?: number | null;

  codex?: {
    predictionId: string;
    runId: string;
    model: string;
    confidence: number;
    edge: number;
    status: string;
    evidenceCount: number;
  };

  gemini?: {
    predictionId: string;
    runId: string;
    model: string;
    confidence: number;
    edge: number;
    status: string;
    evidenceCount: number;
  };

  agreement: 'same-selection' | 'same-market-different-selection' | 'only-codex' | 'only-gemini' | 'no-comparable-pick';
  consensusScore: number;
  recommendationTier: 'strong-consensus' | 'model-lean' | 'conflict-review' | 'blocked';
  reasons: string[];
}
```

## Por qué esto es clave

Si ambos modelos coinciden en fixture, mercado y selección, eso puede ser una señal de mayor estabilidad. Si discrepan, no deberías ocultarlo; el dashboard debe mostrarlo claramente.

Tu sistema ya guarda proveedor y modelo en research bundles (`providerAgentic`, `model`, `promptVersion`) y también usa `modelId`, `promptVersion`, market y league en leaderboard/calibration, así que la base para comparar por modelo ya existe.  

---

# Prioridad 3: parlays por provider y parlays mixtos

Aquí estás bien posicionado porque ya existe soporte para construir parlays desde múltiples source runs. En los tests actuales ya aparece un caso donde `runParlayBuild` combina predicciones de `codex-run` y `gemini-run` usando `sourceRunIds`, sin caer en contaminación por fecha completa. 

Eso es exactamente lo que necesitas.

## Tipos de parlays diarios

Yo manejaría tres familias:

```text
1. Codex-only
   Solo predicciones generadas por Codex.

2. Gemini-only
   Solo predicciones generadas por Gemini.

3. Consensus/mixed
   Predicciones donde Codex y Gemini coinciden, o combinaciones controladas de ambos.
```

## Profiles recomendados

```text
safe-consensus
  2-3 legs, preferir coincidencias Codex+Gemini, baja correlación.

balanced
  3-4 legs, edge medio, diversidad de mercado.

aggressive-analytical
  4-5 legs, mayor cuota combinada, pero con más warnings.
```

Evitaría usar lenguaje como “stake” o “bankroll” en el dashboard. Mejor:

```text
exposureUnits
analyticalExposure
maxPortfolioExposure
recommendationTier
```

Porque el sistema debe quedarse como herramienta de análisis, no como ejecución de apuestas.

---

# Prioridad 4: recomendaciones de parlays

Ya existe una base muy útil en `parlay-analysis`: toma parlays persistidos, filtra por perfil, ordena candidatos, descarta duplicados, asigna exposición analítica y genera `parlay-analysis.json` con `top`, `diagnostics`, `analyticalArtifactOnly: true` y `executionCapability: 'none'`. 

Yo convertiría eso en una salida diaria formal:

```text
daily-parlay-recommendations.json
daily-parlay-recommendations.md
```

## Qué debe contener cada recomendación

```ts
interface DailyParlayRecommendation {
  rank: number;
  parlayId: string;
  family: 'codex-only' | 'gemini-only' | 'consensus-mixed';
  recommendationTier: 'top' | 'watchlist' | 'review-required' | 'blocked';

  combinedOdds: number;
  adjustedProbability: number;
  expectedEdge: number;
  aggregateConfidence: number;
  correlationPenalty: number;

  legs: Array<{
    fixture: string;
    market: string;
    selection: string;
    line?: number | null;
    odds: number;
    providerAgentic: 'codex' | 'gemini';
    model: string;
    confidence: number;
    edge: number;
    warnings: string[];
  }>;

  reasons: string[];
  riskFlags: string[];
  analyticalExposure?: {
    units: number;
    policy: string;
  };
}
```

## Clasificación práctica

```text
Top recommendation
  consenso alto, edge positivo, baja correlación, sin warnings duros.

Watchlist
  buena señal, pero falta evidencia o hay alguna advertencia menor.

Review-required
  modelos discrepan, mercado frágil o evidencia incompleta.

Blocked
  falta odds, falta evidencia, alta correlación, fixture inválido o mercado no settleable.
```

---

# Prioridad 5: dashboard comparativo

El dashboard ya tiene una base buena: lee overview, filtros, status facets, tabs, counts, predictions, parlays, validations y runs. También expone config del provider agentic y modelo actual. 

Pero para tu nuevo objetivo le falta una capa de **comparación por modelo/proveedor**.

## Nuevas vistas que agregaría

### 1. Daily Overview

Una vista inicial por fecha:

```text
Fecha: YYYY-MM-DD
Runs:
  Codex runId
  Gemini runId

Fixtures analizados
Predictions Codex
Predictions Gemini
Coincidencias
Discrepancias
Parlays Codex
Parlays Gemini
Parlays consenso
Top recomendaciones
Validaciones pendientes
```

### 2. Predictions by Model

Tabla comparativa:

```text
Fixture | Market | Selection | Codex confidence | Gemini confidence | Codex edge | Gemini edge | Agreement | Status
```

Filtros:

```text
provider: codex/gemini/all
model
market
league
status
agreement
minEdge
minConfidence
runId
date
```

### 3. Parlays by Family

Tabla:

```text
Parlay | Family | Legs | Combined odds | Confidence | Edge | Correlation | Status | Recommendation tier
```

Filtros:

```text
codex-only
gemini-only
consensus-mixed
top
watchlist
review-required
blocked
```

### 4. Parlay Recommendations

Panel principal:

```text
Top 5 recomendaciones analíticas del día
```

Cada card debe mostrar:

```text
rank
family
combined odds
adjusted probability
expected edge
confidence
correlation penalty
legs
reasons
warnings
status
```

Y siempre un texto claro:

```text
Artifact analítico. No ejecuta apuestas ni garantiza resultados.
```

### 5. Model Performance

Después de validation:

```text
Codex vs Gemini
  Brier
  Logloss
  CLV
  hit rate
  calibration
  predictions settled
  parlays settled
```

Tu schema ya tiene `DailyMetric` con `predictionMetrics`, `parlayMetrics` y `chartMetrics`, así que puedes alimentar esta vista sin inventar una estructura completamente nueva. 

---

# Prioridad 6: guardar agrupación diaria

Para que el dashboard no tenga que adivinar qué runs pertenecen al mismo día, yo agregaría una entidad o metadata de “daily batch”.

## Opción simple sin migración inmediata

Guardar en `HarnessRun.metadata`:

```json
{
  "dailyBatchId": "daily-2026-05-14",
  "dailyRole": "codex",
  "providerAgentic": "codex",
  "pairedProviders": ["codex", "gemini"]
}
```

Para el run Gemini:

```json
{
  "dailyBatchId": "daily-2026-05-14",
  "dailyRole": "gemini",
  "providerAgentic": "gemini",
  "pairedProviders": ["codex", "gemini"]
}
```

Para el run de análisis combinado:

```json
{
  "dailyBatchId": "daily-2026-05-14",
  "dailyRole": "comparison",
  "sourceRunIds": ["codex-run-id", "gemini-run-id"]
}
```

## Opción más limpia con migración

Crear tabla:

```prisma
model DailyRunBatch {
  id          String   @id @default(uuid()) @db.Char(36)
  date        DateTime @db.Date
  timezone    String
  status      String
  codexRunId  String?
  geminiRunId String?
  analysisRunId String?
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Yo empezaría con metadata en `HarnessRun` para avanzar rápido. Si el dashboard crece mucho, entonces haces migración.

---

# Orden recomendado para continuar

## PR-01: Daily E2E dual-provider

Crear:

```text
src/daily/types.ts
src/daily/e2e.ts
src/daily/artifacts.ts
```

Agregar comando:

```bash
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini
```

Debe devolver:

```text
dailyBatchId
codexRunId
geminiRunId
comparisonRunId
parlayAnalysisRunId
artifact paths
```

Criterios:

```text
Codex y Gemini corren sobre la misma fecha.
Cada run queda persistido.
Cada run queda identificado por provider/model.
No se mezclan sourceRunIds accidentalmente.
No hay acciones monetarias.
```

---

## PR-02: Comparison/consensus layer

Crear:

```text
src/prediction/comparison.ts
src/prediction/consensus.ts
```

Artifacts:

```text
provider-comparison.json
provider-consensus.json
```

Debe comparar:

```text
fixture
market
selection
line
confidence
edge
status
provider
model
evidence count
warnings
```

Resultado:

```text
agreement
disagreement
only-codex
only-gemini
consensus-score
recommendation-tier
```

---

## PR-03: Parlay recommendations v2

Extender:

```text
src/parlay/analysis.ts
```

O crear:

```text
src/parlay/recommendations.ts
```

Salida:

```text
daily-parlay-recommendations.json
daily-parlay-recommendations.md
```

Debe separar:

```text
codex-only
gemini-only
consensus-mixed
```

Y conservar:

```text
analyticalArtifactOnly: true
executionCapability: 'none'
```

---

## PR-04: Dashboard daily model comparison

Actualizar:

```text
src/dashboard/query.ts
src/dashboard/types.ts
src/dashboard/page.ts
src/dashboard/page.test.ts
```

Agregar:

```text
Daily Overview
Predictions by Model
Parlays by Family
Parlay Recommendations
Model Performance
```

El dashboard ya tiene tabs y shortcuts para predictions, parlays, validations y metrics; este PR debe hacer que esas vistas no solo listen datos, sino que comparen Codex/Gemini y resalten recomendaciones analíticas. 

---

## PR-05: Daily metrics por provider/model

Extender:

```text
src/metrics/daily.ts
src/analytics/leaderboard.ts
src/analytics/brier.ts
src/analytics/logloss.ts
src/analytics/clv.ts
```

Métricas mínimas:

```text
predictionsByProvider
parlaysByFamily
agreementRate
disagreementRate
avgConfidenceCodex
avgConfidenceGemini
avgEdgeCodex
avgEdgeGemini
validationRate
hitRateByProvider
brierByProvider
loglossByProvider
clvByProvider
```

Guardar en `DailyMetric.chartMetrics`.

---

# Flujo diario ideal

Cuando esté listo, tu operación diaria debería ser así:

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=100 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana daily-e2e --date 2026-05-14 --providers codex,gemini --web live
```

Luego:

```bash
pnpm gana dashboard
```

Y después de los partidos:

```bash
pnpm gana validate --date 2026-05-14
pnpm gana daily-metrics --date 2026-05-14
```

El dashboard debería mostrar:

```text
Codex predictions
Gemini predictions
Coincidencias
Discrepancias
Parlays Codex
Parlays Gemini
Parlays consenso
Top recomendaciones analíticas
Validaciones
Métricas por modelo
```

---

## Conclusión

Vas en la dirección correcta. La siguiente gran etapa no es agregar más mercados ni más features aisladas. Es construir el **ciclo diario completo**:

```text
Codex + Gemini
  -> predicciones comparables
  -> consenso/discrepancia
  -> parlays por familia
  -> recomendaciones analíticas
  -> dashboard comparativo
  -> validación posterior
  -> métricas por modelo
```

Yo empezaría por **PR-01 Daily E2E dual-provider**, porque desbloquea todo lo demás. Después haces comparison, recommendations y dashboard. Ahí Gana v9 pasa de ser un generador productivo de predicciones a un sistema diario de evaluación y decisión analítica.
