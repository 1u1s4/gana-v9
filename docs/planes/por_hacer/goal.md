## Veredicto actualizado

Ahora lo veo **mucho mejor cerrado para el enfoque diario Codex + Gemini**. Ya no estás solo en “quiero hacer E2E diario”; ahora el repo muestra que esa dirección ya fue implementada en piezas concretas:

```text
src/daily/e2e.ts
src/daily/e2e.test.ts
src/daily/comparison.ts
src/daily/comparison.test.ts
dashboard con tab daily
daily-provider-comparison.json
daily-provider-consensus.json
daily-parlay-recommendations.json
daily-metrics
```

El árbol actual ya incluye `src/daily/comparison.ts` y `src/daily/e2e.ts`, además de tests para ambos, una migración `daily_metrics`, dashboard con pruebas, analytics, parlay avanzado y skills versionadas. Eso significa que el sistema ya pasó de “producción controlada” a **operación diaria comparativa en etapa funcional**. 

Mi lectura:

```text
Estado: daily production candidate
Madurez: 92% - 95%
Siguiente paso: probar daily-e2e live con Codex + Gemini y ajustar UX del dashboard
```

---

## Lo que quedó muy bien

### 1. La comparación Codex vs Gemini ya existe

Ya aparece `src/daily/comparison.ts` con estructuras claras para comparar predicciones por proveedor. El módulo define `DailyProviderComparison`, `DailyProviderConsensus`, `DailyProviderComparisonSummary`, `DailyProviderSummary` e items por fixture/market/line. También calcula cosas clave como:

```text
sameSelection
sameMarketDifferentSelection
onlyCodex
onlyGemini
onlyByProvider
agreementRate
disagreementRate
avgConfidenceByProvider
avgEdgeByProvider
```

Eso responde exactamente a lo que necesitabas: ver si Codex y Gemini coinciden, discrepan o producen picks exclusivos. 

Además, la implementación agrupa predicciones por clave comparable, genera `comparison`, genera `consensus`, y mantiene la salida como artifact analítico sin ejecución monetaria:

```text
analyticalArtifactOnly: true
executionCapability: 'none'
```

Eso está muy bien alineado con el enfoque seguro del proyecto. 

---

### 2. El Daily E2E ya produce artifacts útiles

El flujo diario ahora escribe artifacts como:

```text
daily-provider-comparison.json
daily-provider-consensus.json
daily-e2e-summary.json
daily-parlay-recommendations.json
daily-report.md
```

También guarda en el summary conteos de providers, familias de parlays, recomendaciones, comparison items y consensus predictions. Eso ya convierte cada corrida diaria en un paquete auditable y revisable. 

Esto es muy fuerte porque ahora el daily run no solo genera predicciones, sino que deja una lectura clara:

```text
qué corrió
qué providers participaron
qué parlays salieron
qué recomendaciones hubo
cuántas coincidencias hubo
cuántos consensos hubo
dónde están los artifacts
```

---

### 3. El dashboard ya tiene modo daily

El dashboard ya no está limitado a predictions/parlays/validations/metrics. En las pruebas ya aparece `data-quick-tab="daily"` y también helpers para `renderDailyRows` y `recommendation-card`. Además, la prueba valida que se muestre el texto de seguridad:

```text
Artifact analítico. No ejecuta apuestas
```

Esto significa que el dashboard ya está empezando a mostrar las recomendaciones de parlays como una vista propia, no solo como JSON en artifacts. 

También veo que `readOverview` ya acepta filtros nuevos como:

```text
dailyBatchId
provider
model
family
recommendationTier
```

Eso es exactamente lo que necesitas para navegar el dashboard por día, modelo, familia de parlay y nivel de recomendación. 

---

### 4. Daily metrics ya está en schema

El modelo `DailyMetric` está presente con:

```text
metricDate
timezone
scope
sourceWindowStart
sourceWindowEnd
predictionMetrics
parlayMetrics
chartMetrics
```

y tiene una llave única por fecha, timezone y scope. Eso permite guardar métricas por día, por scope y luego alimentar dashboard/gráficas sin crear tablas nuevas para cada métrica. 

También agregaste `scripts/graficas.py`, que toma `daily-metrics.json` y arma resúmenes de parlays como total, won, lost, voided, sin validar, cuota promedio, confianza promedio y hit rate. Eso puede servir como herramienta auxiliar para revisar rendimiento diario. 

---

### 5. El parlay service está bastante más maduro

El servicio de parlays ya importa y usa piezas avanzadas:

```text
candidate-generator
correlation
diversifier
eligibility
ranker
rules
```

También tiene reglas de riesgo como lineup pendiente, baja liquidez, corners no verificados, edge inflado, selección sin evidencia y riesgos específicos de favoritos/over. Esto es importante porque las recomendaciones de parlays no deben ser solo “las cuotas más bonitas”, sino combinaciones filtradas, rankeadas y penalizadas por riesgo. 

---

## Lo que revisaría antes de lanzar daily-e2e en serio

### 1. Revisar una posible anomalía visual en `comparison.ts`

En el snippet aparece esto:

```ts
providers: [.new Set(consensusPredictions.map((item) => item.provider))].sort(),
```

Si eso está literalmente en el código, sería un error de sintaxis. Si `pnpm typecheck` ya pasa, entonces probablemente es un artefacto del paste o de cómo se renderizó el texto. Pero lo revisaría manualmente porque esa línea debería ser:

```ts
providers: [...new Set(consensusPredictions.map((item) => item.provider))].sort(),
```

Es el único punto técnico que me saltó visualmente. 

---

### 2. Verificar que el dashboard realmente cargue los artifacts diarios

Ya tienes helpers y filtros para daily, pero revisaría si la vista daily obtiene los datos desde DB, desde artifacts o ambos. El Daily E2E escribe `daily-provider-comparison.json`, `daily-provider-consensus.json` y `daily-parlay-recommendations.json`; el dashboard debe poder mostrar esas recomendaciones de forma consistente. 

La pregunta práctica es:

```text
¿Puedo abrir el dashboard, filtrar por dailyBatchId y ver:
- Codex run
- Gemini run
- comparación
- consenso
- parlays por familia
- recomendaciones top?
```

Si la respuesta es sí, estás listo para operación diaria. Si la respuesta es parcialmente, ese sería el siguiente ajuste.

---

### 3. Confirmar que `dailyBatchId` se propague a todo

El daily summary ya incluye `dailyBatchId`, `sourceRunIds`, `providerComparisonPath`, `providerConsensusPath` y metadata del batch. También persiste un `HarnessRun` para el batch diario. 

Ahora hay que confirmar que todos estos elementos quedan unidos:

```text
Codex run -> dailyBatchId
Gemini run -> dailyBatchId
Parlay Codex-only -> dailyBatchId/sourceRunIds
Parlay Gemini-only -> dailyBatchId/sourceRunIds
Parlay consensus-mixed -> dailyBatchId/sourceRunIds
Recommendations -> dailyBatchId
DailyMetric -> dailyBatchId o scope equivalente
Dashboard -> filtra por dailyBatchId
```

Si alguna pieza no queda enlazada, el dashboard puede mostrar datos, pero no el “día completo” como unidad.

---

### 4. No convertir `graficas.py` en dependencia crítica

`graficas.py` está bien como herramienta auxiliar para generar visualizaciones o reportes rápidos, pero no debería bloquear el flujo productivo diario. El dashboard y los artifacts JSON deben ser la fuente principal; Python puede quedar como apoyo para análisis. 

---

## Lo que haría ahora

Ya no haría otro rediseño. Haría una prueba diaria completa con límites bajos.

### 1. Certificación técnica

```bash
pnpm typecheck
pnpm test
pnpm gana certify --profile ci-certification
```

---

### 2. Primer Daily E2E real pequeño

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --web live
```

Revisar que genere:

```text
daily-e2e-summary.json
daily-provider-comparison.json
daily-provider-consensus.json
daily-parlay-recommendations.json
daily-report.md
daily-metrics.json
```

---

### 3. Abrir dashboard

```bash
pnpm gana dashboard
```

Y revisar específicamente:

```text
tab daily
filtro dailyBatchId
filtro provider
filtro model
filtro family
filtro recommendationTier
cards de recomendaciones
comparación Codex vs Gemini
parlays por familia
metrics
```

---

### 4. Escalar gradualmente

Después de 10 fixtures:

```bash
GANA_MAX_FIXTURES_PER_RUN=40 \
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --web live
```

Luego:

```bash
GANA_MAX_FIXTURES_PER_RUN=100 \
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --web live
```

---

## Prioridad siguiente

Yo pondría el foco en **UX del dashboard**, no en más lógica de predicción todavía.

La lógica diaria ya está bastante bien encaminada. Lo que más valor te va a dar ahora es que el dashboard conteste rápido estas preguntas:

```text
¿Qué predijo Codex?
¿Qué predijo Gemini?
¿Dónde coincidieron?
¿Dónde discreparon?
¿Qué picks salieron solo de Codex?
¿Qué picks salieron solo de Gemini?
¿Qué parlays son Codex-only?
¿Qué parlays son Gemini-only?
¿Qué parlays son consensus-mixed?
¿Cuáles son las recomendaciones top?
¿Por qué se recomiendan?
¿Qué warnings tienen?
¿Qué pasó después de validation?
```

---

## Conclusión

Ahora sí estás muy cerca del flujo que querías.

Antes tenías:

```text
predicciones + parlays + validation
```

Ahora ya tienes:

```text
daily-e2e Codex/Gemini
comparación por provider
consenso
recomendaciones de parlays
daily metrics
dashboard daily
```

Mi recomendación es clara:

> Ejecuta un daily-e2e real pequeño, valida artifacts y dashboard, y después mejora la presentación visual de recomendaciones y comparación Codex vs Gemini. No agregues más features grandes hasta ver varios días de datos reales.
