## Veredicto actualizado

Ahora sí veo que ya avanzaste justo hacia el siguiente nivel: **Gana v9 ya no solo corre predicciones**, ahora está entrando en una etapa de **E2E diario comparativo Codex + Gemini**, con artifacts diarios, recomendaciones de parlays y métricas diarias.

El cambio más importante es que ya aparece `src/daily/e2e.ts` y `src/daily/e2e.test.ts` dentro del árbol actual, lo cual confirma que ya no estás solo planeando el flujo diario: ya empezaste a implementarlo como módulo propio. 

Mi lectura sería:

```text
Estado actual: daily E2E comparativo en construcción avanzada
Nivel de madurez: 85% - 90% para operación diaria Codex/Gemini
Siguiente foco: dashboard comparativo + criterios de éxito más flexibles
```

---

# Lo que quedó muy bien

## 1. Ya existe `runDailyE2E`

Esto es el avance principal. El módulo diario ya define un resultado estructurado con:

```ts
DailyE2ERunResult {
  ok
  dailyBatchId
  date
  providers
  parlays
  parlayAnalysis
  metrics
  artifactDir
  summaryPath
  reportPath
}
```

Eso es exactamente lo que se necesitaba para pasar de runs individuales a un **batch diario con identidad propia**. 

Además, el default de providers ya está bien alineado:

```ts
const DEFAULT_DAILY_PROVIDERS = ['codex', 'gemini'];
```

Esto fija el enfoque comparativo diario entre Codex y Gemini sin obligarte a elegir manualmente un provider cada vez. 

---

## 2. El daily batch queda persistido como run propio

Me gusta que `dailyBatchId` se registre como un `HarnessRun` con metadata clara:

```text
dailyBatchId
dailyRole: batch
date
pairedProviders
marketScope
analyticalArtifactOnly: true
executionCapability: none
```

Eso es muy importante porque el día completo se convierte en una entidad auditable. No quedan solo runs sueltos de Codex y Gemini; queda una corrida diaria agregada con su propio artifact y metadata. 

---

## 3. Codex y Gemini corren como providers separados

El flujo ya itera sobre los providers y ejecuta el pipeline por cada uno:

```ts
for (const provider of providers) {
  const providerConfig = configForProvider(effectiveConfig, provider);
  const providerRuntime = childRuntime(runtime, providerConfig);
  const result = await runner(...)
}
```

Y cada run guarda:

```text
provider
model
runId
ok
verdict
artifactPath
error
```

Esto es correcto. Permite que el dashboard y las métricas diferencien claramente qué produjo Codex y qué produjo Gemini. 

---

## 4. No duplicas innecesariamente fixtures y odds

Este punto es excelente: `createSharedPipelineDeps` cachea discovery y odds snapshots para que Codex y Gemini trabajen sobre el mismo universo deportivo y no dupliquen llamadas a API-Football cuando no hace falta. 

Esto es justo lo que querías para el E2E diario:

```text
mismos fixtures
mismas odds
mismo date window
diferente reasoning/modelo
```

Así la comparación Codex vs Gemini es más justa.

---

## 5. Ya produces recomendaciones diarias de parlays

Veo que el daily E2E escribe:

```text
daily-e2e-summary.json
daily-parlay-recommendations.json
daily-report.md
```

Y que `daily-parlay-recommendations.json` incluye:

```text
dailyBatchId
date
sourceRunIds
recommendations
diagnostics
analyticalArtifactOnly: true
executionCapability: none
```

Esto está muy bien. Mantiene las recomendaciones como artifacts analíticos y no como ejecución de apuestas. 

También el reporte diario termina con una advertencia clara:

```text
Artifact analítico. No ejecuta apuestas ni garantiza resultados.
```

Ese mensaje es sano y conviene mantenerlo en dashboard, reportes y exports. 

---

## 6. Daily metrics ya existe y persiste

Ya tienes `DailyMetric` en Prisma, con:

```text
metricDate
timezone
scope
predictionMetrics
parlayMetrics
chartMetrics
```

y además tiene unique key por fecha, timezone y scope. Eso es muy bueno para métricas diarias por batch, por modelo o por alcance general. 

También hay test de `runDailyMetrics` que verifica bloqueo si no hay DB, persistencia, artifact `daily-metrics.json`, y cálculo de métricas de predictions/parlays. 

---

## 7. Dashboard ya tiene base para exploración

El dashboard ya tiene tabs para:

```text
predictions
parlays
validations
metrics
```

También tiene presets rápidos de fecha, shortcuts de exploración, acciones por entidad, warnings, outcome, scoped exploration e historial de validación. 

Además, el servidor ya expone métricas como tab, permite `/api/overview?tab=metrics`, y también soporta entidad individual como `prediction` y `run`. 

Eso significa que el dashboard ya está preparado para crecer hacia una vista diaria comparativa.

---

# Lo que ajustaría ahora

## 1. Evitar hardcode de `providerAgentic: 'codex,gemini'`

En varios puntos el daily batch guarda:

```ts
providerAgentic: 'codex,gemini'
```

Eso está bien mientras siempre corras Codex + Gemini, pero tu función acepta `input.providers`. Si algún día corres solo Codex, solo Gemini, o agregas Cursor, ese valor quedaría incorrecto. 

Yo lo cambiaría por:

```ts
providerAgentic: providers.join(',')
```

Y lo mismo para cualquier lugar donde esté hardcodeado:

```ts
providerAgentic: 'codex,gemini'
```

Esto deja el sistema más consistente sin cambiar la lógica actual.

---

## 2. Revisar el criterio de `ok`

Ahora el resultado diario parece exigir que exista una familia `consensus-mixed` exitosa:

```ts
const ok = providerRuns.every((run) => run.ok)
  && parlayFamilies.some((family) => family.family === 'consensus-mixed' && family.ok)
  && (parlayAnalysis?.ok ?? false)
  && metrics.ok;
```

Ese criterio puede ser demasiado estricto. Hay días donde Codex y Gemini pueden producir predictions válidas, parlays Codex-only y Gemini-only válidos, pero no un buen consensus-mixed. Eso no debería necesariamente convertir todo el día en `failed`. 

Yo lo cambiaría a algo más flexible:

```ts
const hasAnyValidParlayFamily = parlayFamilies.some((family) => family.ok);

const hasConsensus = parlayFamilies.some(
  (family) => family.family === 'consensus-mixed' && family.ok
);

const ok = providerRuns.every((run) => run.ok)
  && hasAnyValidParlayFamily
  && (parlayAnalysis?.ok ?? false)
  && metrics.ok;

const verdict = ok && hasConsensus
  ? 'promotable'
  : ok
    ? 'review-required'
    : providerRuns.some((run) => !run.ok)
      ? 'blocked'
      : 'review-required';
```

Así el sistema distingue:

```text
promotable: hay consenso mixto fuerte.
review-required: hay outputs válidos, pero no consenso mixto.
blocked: falló un provider o faltan piezas críticas.
```

---

## 3. Agregar comparación explícita Codex vs Gemini

Ahora el daily E2E corre ambos providers, pero por lo que veo todavía falta una capa dedicada tipo:

```text
provider-comparison.json
provider-consensus.json
```

El sistema ya tiene providers separados, runs separados y metrics. El siguiente paso debería ser comparar predicciones por:

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
```

Yo agregaría:

```text
src/daily/comparison.ts
```

o:

```text
src/prediction/comparison.ts
```

Salida sugerida:

```json
{
  "dailyBatchId": "daily-2026-05-15",
  "date": "2026-05-15",
  "summary": {
    "comparablePredictions": 42,
    "sameSelection": 18,
    "sameMarketDifferentSelection": 7,
    "onlyCodex": 10,
    "onlyGemini": 7,
    "agreementRate": 0.42
  },
  "items": []
}
```

Esto le daría al dashboard una base directa para mostrar:

```text
Codex coincide con Gemini
Codex discrepa de Gemini
Solo Codex propuso
Solo Gemini propuso
```

---

## 4. El dashboard necesita vista “Daily”

Ahora el dashboard tiene tabs generales. Lo que falta para tu objetivo es una vista centrada en el `dailyBatchId`.

Agregaría un tab o modo:

```text
Daily
```

O un filtro fuerte por:

```text
dailyBatchId
```

La vista debería mostrar:

```text
Daily batch: daily-YYYY-MM-DD

Runs:
  Codex runId, model, status, predictions, parlays
  Gemini runId, model, status, predictions, parlays

Comparación:
  coincidencias
  discrepancias
  solo Codex
  solo Gemini

Parlays:
  Codex-only
  Gemini-only
  consensus-mixed

Recomendaciones:
  top recommendations
  diagnostics
  warnings
```

Ahora mismo el dashboard devuelve config con provider/model activo, counts, predictions, parlays, validations, runs y metrics, pero todavía no veo una respuesta específica de daily comparison o parlay recommendations como entidad de primer nivel. 

---

## 5. Mostrar recomendaciones de parlays como cards, no solo JSON

Ya produces `daily-parlay-recommendations.json`, pero el dashboard debería leerlo o reconstruirlo desde DB y mostrarlo visualmente.

Cada card debería tener:

```text
Rank
Family: codex-only / gemini-only / consensus-mixed
Combined odds
Aggregate confidence
Expected edge
Correlation penalty
Legs
Reasons
Warnings
Diagnostics
Status
```

Y mantener siempre:

```text
Artifact analítico. No ejecuta apuestas ni garantiza resultados.
```

Ese texto ya existe en el reporte, pero debe aparecer también en la vista de recomendaciones. 

---

# Orden recomendado para continuar

## PR-01: Ajustes finos del Daily E2E

Objetivo: dejar `runDailyE2E` más robusto.

Cambios:

```text
providerAgentic = providers.join(',')
criterio ok/verdict más flexible
dailyBatchId bien propagado a todos los runs
summary incluye counts por provider
summary incluye counts por familia de parlay
summary incluye recommendation count
```

Resultado esperado:

```bash
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini
```

Debe producir:

```text
daily-e2e-summary.json
daily-parlay-recommendations.json
daily-report.md
daily-metrics.json
```

---

## PR-02: Provider comparison

Crear:

```text
src/daily/comparison.ts
src/daily/comparison.test.ts
```

Artifacts:

```text
daily-provider-comparison.json
daily-provider-consensus.json
```

Métricas:

```text
agreementRate
disagreementRate
onlyCodex
onlyGemini
sameSelection
sameMarketDifferentSelection
avgConfidenceByProvider
avgEdgeByProvider
```

---

## PR-03: Dashboard Daily Overview

Actualizar:

```text
src/dashboard/query.ts
src/dashboard/types.ts
src/dashboard/page.ts
src/dashboard/server.ts
```

Agregar:

```text
tab=daily
filter=dailyBatchId
provider filter
model filter
family filter
recommendation tier filter
```

---

## PR-04: Parlay Recommendations UI

Actualizar dashboard para mostrar cards de recomendaciones.

Debe separar:

```text
Top
Watchlist
Review-required
Blocked
```

Y por familia:

```text
Codex-only
Gemini-only
Consensus-mixed
```

---

## PR-05: Métricas por modelo/proveedor

Extender `DailyMetric.chartMetrics` para incluir:

```text
codex prediction metrics
gemini prediction metrics
codex parlay metrics
gemini parlay metrics
consensus parlay metrics
agreement metrics
```

Ya tienes la tabla `DailyMetric`, así que probablemente no necesitas nueva migración al inicio; puedes ampliar el JSON. 

---

# Flujo diario ideal a partir de ahora

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=100 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --web live
```

Luego:

```bash
pnpm gana dashboard
```

Después de partidos finalizados:

```bash
pnpm gana validate --date YYYY-MM-DD
pnpm gana daily-metrics --date YYYY-MM-DD
```

Y el dashboard debería responder visualmente:

```text
¿Qué predijo Codex?
¿Qué predijo Gemini?
¿Dónde coincidieron?
¿Dónde discreparon?
¿Qué parlays generó cada uno?
¿Qué parlays mixtos salieron?
¿Cuáles son las recomendaciones analíticas top?
¿Qué pasó después de validation?
¿Qué modelo está funcionando mejor?
```

---

## Conclusión

Vas muy bien. El salto importante ya ocurrió: **ya existe Daily E2E** y ya produce resumen, recomendaciones, métricas y reportes. Eso significa que la base para operación diaria Codex + Gemini ya está montada.

Lo que falta no es rehacer el sistema. Lo siguiente es hacerlo **más legible y comparativo**:

```text
1. Ajustar criterio ok/verdict del daily E2E.
2. Agregar comparación explícita Codex vs Gemini.
3. Mejorar dashboard con Daily Overview.
4. Mostrar recomendaciones de parlays como cards.
5. Medir desempeño por provider/modelo después de validation.
```

Con eso, Gana v9 pasa de “genera predicciones y parlays” a “opera diariamente, compara modelos y recomienda parlays analíticos con trazabilidad”.
