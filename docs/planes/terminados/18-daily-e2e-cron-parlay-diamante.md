## Veredicto

Sí, con ese contexto extra, el siguiente paso está bastante claro. Yo priorizaría **cuatro mejoras en este orden**:

```text
1. Paralelismo Codex + deprecated provider en daily-e2e.
2. Progreso observable por provider para Codex/Hermes/operador.
3. Arreglar Discord para mostrar nombres reales de equipos, no UUIDs.
4. Parlay Portfolio V2: variedad de 1, 2, 3 y 4 patas, más cobertura de corners.
```

Actualmente `runDailyE2E` sigue ejecutando los providers con un `for (const provider of providers)` y un `await runner(...)` dentro del loop. Eso significa que Codex corre primero y deprecated provider después, o viceversa, pero **no en paralelo**. 

Además, la corrida real que muestras confirma el problema operativo: deprecated provider produjo 412 predicciones y 228 promotable, mientras Codex terminó blocked con 0 predicciones válidas. Aun así, el flujo siguió y generó recomendaciones, pero el tiempo total fue largo y la observabilidad dependió demasiado de revisar logs/artifacts manualmente. 

---

# 1. Paralelismo Codex + deprecated provider

## Qué cambiar

Ahora mismo el Daily E2E hace esto conceptualmente:

```ts
for (const provider of providers) {
  const result = await runner(...);
  providerRuns.push(result);
}
```

Eso debe pasar a:

```ts
const providerResults = await Promise.allSettled(
  providers.map((provider) => runProviderPipeline(provider))
);
```

Pero con una condición importante: **no dupliques discovery/odds de API-Football**.

Tu código ya crea `sharedDeps` antes de ejecutar providers:

```ts
const sharedDeps = deps.sharedPipelineDeps ?? createSharedPipelineDeps(effectiveConfig, input);
```

Eso es bueno porque permite que Codex y deprecated provider usen el mismo universo de fixtures/odds. 

El riesgo es que, si ambos providers entran al mismo tiempo y `sharedDeps` no tiene memoización por promesa, podrían disparar consultas duplicadas. Por eso yo haría esto:

```text
Fase A: preparar slate compartido
  - fixtures
  - odds snapshots
  - low-odds scan
  - market scope

Fase B: correr providers en paralelo
  - Codex pipeline
  - deprecated provider pipeline

Fase C: construir parlays
  - Codex-only
  - deprecated provider-only
  - consensus-mixed

Fase D: recommendations + metrics + Discord
```

## Implementación recomendada

Agregar una función interna:

```ts
async function runProviderDailyPipeline(provider: DailyE2EProvider) {
  const providerConfig = configForProvider(effectiveConfig, provider, input.models);
  const providerRuntime = childRuntime(runtime, providerConfig);

  return runner(providerConfig, {
    date: input.date,
    web: input.web,
    validate: input.validate,
    markets: marketScope,
    metadata: {
      dailyBatchId,
      dailyRole: provider,
      providerAgentic: provider,
      pairedProviders,
    },
  }, providerRuntime, sharedDeps);
}
```

Luego:

```ts
const providerSettled = await Promise.allSettled(
  providers.map(async (provider) => {
    const result = await runProviderDailyPipeline(provider);
    return { provider, result };
  })
);
```

Y después normalizas:

```ts
for (const item of providerSettled) {
  if (item.status === 'fulfilled') {
    providerPipelineResults[item.value.provider] = item.value.result;
    providerRuns.push(toProviderRun(item.value.provider, item.value.result));
  } else {
    providerRuns.push(toFailedProviderRun(provider, item.reason));
  }
}
```

## Flag recomendado

Agrega:

```bash
--provider-concurrency 2
```

Y env:

```bash
GANA_DAILY_PROVIDER_CONCURRENCY=2
```

Default:

```text
2 para codex,deprecated-provider
1 si quieres modo seguro/debug
```

Así puedes volver a serial si algo falla.

---

# 2. Progreso observable por provider

Paralelismo sin progreso puede confundir más, porque ahora Codex y deprecated provider estarán trabajando al mismo tiempo. Necesitas que el progreso diga claramente:

```text
Codex: running / scoring / completed / blocked
deprecated provider: running / scoring / completed / review-required
```

Yo haría que `daily-progress.json` tenga sección por provider:

```json
{
  "batchId": "daily-2026-05-16",
  "status": "running",
  "phase": "providers.parallel",
  "providers": {
    "codex": {
      "status": "running",
      "phase": "scoring",
      "predictions": 0,
      "promotable": 0,
      "updatedAt": "..."
    },
    "deprecated-provider": {
      "status": "running",
      "phase": "scoring",
      "predictions": 340,
      "promotable": 184,
      "updatedAt": "..."
    }
  }
}
```

También en stdout:

```text
[daily-e2e] providers.parallel started codex,deprecated-provider
[daily-e2e] codex running phase=research elapsed=04:12
[daily-e2e] deprecated-provider running phase=scoring predictions=169 promotable=90
[daily-e2e] deprecated-provider completed predictions=412 promotable=228 verdict=review-required
[daily-e2e] codex completed verdict=blocked predictions=0
```

Esto le sirve a Hermes y también a ti cuando estás viendo una corrida grande.

---

# 3. Discord: arreglar nombres de equipos

El problema de Discord es claro: en los simples aparecen UUIDs como si fueran equipos:

```text
a28f3e87... vs badde2e5...
68de8c78... vs 4f07d4b2...
```

Eso significa que el notifier está recibiendo una recomendación cuyo `fixtureLabel` o `teamName` no está hidratado, entonces cae al fallback de IDs.

El wrapper actual manda el artifact de recomendaciones a:

```bash
notify-discord-recommendations.mjs --artifact "$RECOMMENDATIONS_ARTIFACT"
```

Así que el notifier depende de lo que venga en `daily-parlay-recommendations.json`. 

## Regla que yo pondría

El artifact de recomendaciones debe ser **autosuficiente**. No debería depender de que Discord consulte DB para saber nombres.

Cada leg debería incluir:

```ts
display: {
  fixtureLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName?: string;
  kickoffLocal?: string;
}
```

Ejemplo:

```json
{
  "fixtureId": "a28f3e87-bc59-4e9e-b1fd-062759061d86",
  "display": {
    "fixtureLabel": "Fluminense vs Sao Paulo",
    "homeTeamName": "Fluminense",
    "awayTeamName": "Sao Paulo",
    "leagueName": "Brazil Serie A",
    "kickoffLocal": "2026-05-16 16:30"
  }
}
```

## Dónde corregirlo

Yo lo pondría en dos capas:

### A. Capa de generación de recomendaciones

Cuando construyes `daily-parlay-recommendations.json`, hidratar cada leg con datos de fixture/team.

Crear helper:

```ts
src/recommendations/display.ts
```

Con algo como:

```ts
export async function hydrateRecommendationDisplay(
  recommendation: DailyFinalRecommendation,
  repositories: StorageRepositories
): Promise<DailyFinalRecommendation> {
  // buscar fixture por fixtureId
  // buscar teams/competition
  // llenar fixtureLabel, homeTeamName, awayTeamName
}
```

### B. Capa notifier como fallback

En `.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs`, antes de renderizar:

```js
const label = leg.display?.fixtureLabel
  ?? leg.fixtureLabel
  ?? buildLabelFromTeams(leg)
  ?? shortFixtureFallback(leg.fixtureId);
```

El fallback final puede ser:

```text
Fixture a28f3e87…
```

Pero nunca debería mostrar:

```text
UUID completo vs UUID completo
```

## También cambiaría los textos

En Discord yo usaría:

```text
🟡 Mixto · Pendiente de validar · Riesgo medio
```

En vez de:

```text
mixed · unvalidated · mixed-risk
```

Y para simples:

```text
🎯 Simple · Fluminense vs Sao Paulo · h2h home
```

No:

```text
🎯 Simple · UUID vs UUID · h2h home
```

---

# 4. Parlay Portfolio V2: más variedad

Aquí sí conviene cambiar el sistema de generación. Ahora el resultado fue:

```text
1 parlay + 18 simples
```

o, en el mensaje que compartiste:

```text
1 parlays · 7 simples
```

Eso no está mal, pero es poca variedad. 

Yo haría que el sistema genere una **cartera analítica diaria** con buckets fijos:

```text
Singles / 1-leg
2-leg parlays
3-leg parlays
4-leg parlays
Corner-focused
Consensus-mixed
Provider-only
```

Importante: los “singles” son recomendaciones simples, no parlays reales. Mantendría el lenguaje como **simple** o **selección individual**, no “parlay de una pata”.

## Estructura propuesta

Crear o extender:

```text
src/parlay/portfolio-v2.ts
src/parlay/leg-buckets.ts
src/parlay/corner-strategy.ts
```

O extender los módulos existentes:

```text
src/parlay/candidate-generator.ts
src/parlay/diversifier.ts
src/parlay/ranker.ts
src/parlay/analysis.ts
```

Tu repo ya tiene parlay avanzado con candidate generator, correlation, diversifier, ranker, eligibility y service, así que no hay que empezar desde cero. 

## Buckets recomendados

```ts
const DAILY_PORTFOLIO_BUCKETS = [
  {
    key: 'single-top',
    legCount: 1,
    maxItems: 8,
    minConfidence: 0.82,
    maxCombinedOdds: 2.20,
  },
  {
    key: 'two-leg-safe',
    legCount: 2,
    maxItems: 6,
    minConfidence: 0.74,
    maxCombinedOdds: 4.00,
  },
  {
    key: 'three-leg-balanced',
    legCount: 3,
    maxItems: 5,
    minConfidence: 0.68,
    maxCombinedOdds: 7.50,
  },
  {
    key: 'four-leg-aggressive-analytical',
    legCount: 4,
    maxItems: 3,
    minConfidence: 0.62,
    maxCombinedOdds: 12.00,
  },
  {
    key: 'corners-watchlist',
    legCount: 1,
    maxItems: 5,
    markets: ['corners_over_under'],
  },
  {
    key: 'corners-mixed',
    legCount: 2,
    maxItems: 3,
    requireAtLeastOneMarket: ['corners_over_under'],
  },
];
```

## Familias por provider

Generar por separado:

```text
codex-only
deprecated-provider-only
consensus-mixed
```

Y por bucket:

```text
single-top
two-leg-safe
three-leg-balanced
four-leg-aggressive-analytical
corners-watchlist
corners-mixed
```

Ejemplo de salida:

```text
Top simples:
  8 selecciones

2-leg safe:
  6 candidatos

3-leg balanced:
  5 candidatos

4-leg analytical:
  3 candidatos

Corners:
  5 simples + 3 mixtos

Consensus:
  4 candidatos
```

Eso le da variedad sin convertir el sistema en ruido.

---

# 5. Más enfoque en tiros de esquina

Ya tienes `corners_over_under` en los mercados iniciales y también exclusiones como:

```text
excluded-corners-unverified
```

Eso indica que el sistema ya reconoce que corners necesita validación especial. 

Yo lo convertiría en una estrategia propia:

```text
corner-strategy-v1
```

## Señales para corners

Para cada fixture con mercado `corners_over_under`, calcular:

```text
cornerLine
cornerOdds
cornerDataQuality
teamCornerForAvg
teamCornerAgainstAvg
leagueCornerPace
recentCornerTrend
homeAwayCornerSplit
lineMovement
providerAvailability
```

No necesitas que todo esté perfecto desde el primer PR. Puedes empezar con:

```text
line disponible
odds válidas
estadísticas de corners disponibles
fixture no live
market liquidity aceptable
no blocked reasons
```

## Gates para corners

```text
Promotable:
  - line disponible
  - odds válidas
  - datos de corners suficientes
  - no hay warning de baja liquidez
  - confidence/edge pasa umbral

Review-required:
  - datos parciales
  - línea disponible pero poca evidencia
  - discrepancia Codex/deprecated provider

Blocked:
  - no hay stats de corners
  - mercado sin línea clara
  - odds inválidas
```

## En portfolio

No mezclar demasiados corners en parlays grandes. Reglas:

```text
maxCornersPerParlay = 1 para 2-leg y 3-leg
maxCornersPerParlay = 2 solo para 4-leg analytical
```

Así evitas que todos los parlays dependan de un mercado más frágil.

---

# 6. Ajuste importante: Codex blocked no debe romper todo

En la corrida real, Codex terminó blocked y deprecated provider produjo muchas predicciones. 

Eso significa que el Daily E2E debe manejar tres escenarios:

```text
Codex + deprecated provider ok:
  generar codex-only, deprecated-provider-only, consensus-mixed.

Solo deprecated provider ok:
  generar deprecated-provider-only + simples + review-required por falta de consenso.

Solo Codex ok:
  generar codex-only + simples + review-required por falta de consenso.

Ninguno ok:
  blocked.
```

No deberías exigir siempre consensus-mixed para que haya salida útil. El sistema debe decir:

```text
No hubo consenso mixto porque Codex quedó blocked.
Se generaron recomendaciones deprecated provider-only en revisión.
```

Eso sería más claro para Discord y Dashboard.

---

# 7. Cómo debería verse Discord después

Ejemplo mejorado:

```text
🏆 Gana v9 · Recomendaciones analíticas
📦 6 parlays · 🎯 8 simples · 🟡 Revisión requerida
🤖 Codex: blocked · deprecated provider: 412 predictions / 228 promotable
⚠️ Sin ejecución monetaria · Sin garantía

1️⃣ Parlay 2-leg · Consensus/Mixto · Riesgo medio
Fluminense vs Sao Paulo
  h2h home @ 1.91

Seoul E-Land FC vs Yongin City
  double chance home_or_draw @ 1.14

Odds 2.17 · Conf 54.7% · Edge 9.8%
Razón: baja correlación, odds válidas, consenso parcial.

2️⃣ Simple · Brazil Serie A · Fluminense vs Sao Paulo
h2h home @ 1.91
Conf 82% · Edge 6.2%

3️⃣ Corners Watchlist · Team A vs Team B
corners over 8.5 @ 1.83
Conf 72% · Edge 4.1%
Warning: revisar disponibilidad final de stats.
```

Claves:

```text
- Mostrar equipo real.
- Mostrar familia: codex-only / deprecated-provider-only / consensus-mixed.
- Mostrar tipo: simple / 2-leg / 3-leg / 4-leg / corners-watchlist.
- Mostrar warnings.
- Mantener disclaimer analítico.
```

---

# 8. Orden recomendado de implementación

## PR-01: Paralelismo Daily E2E + progreso por provider

Cambios:

```text
src/daily/e2e.ts
src/daily/e2e.test.ts
src/runtime/progress.ts
src/runtime/progress.test.ts
src/commands.ts
```

Entregar:

```bash
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,deprecated-provider --provider-concurrency 2
pnpm gana progress --latest
```

Criterios:

```text
Codex y deprecated provider corren en paralelo.
No se duplican fixtures/odds.
Se escribe daily-progress.json.
Se puede ver estado de cada provider.
Si un provider falla, el otro puede terminar.
```

---

## PR-02: Discord Display Hydration

Cambios:

```text
src/recommendations/display.ts
src/daily/e2e.ts
.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs
```

Entregar:

```text
daily-parlay-recommendations.json con fixtureLabel, homeTeamName, awayTeamName.
Discord sin UUID vs UUID.
Mensajes en español consistente.
```

Tests:

```text
- simple con fixture display renderiza nombres.
- parlay con 2 legs renderiza ambos partidos.
- si faltan nombres, usa fallback corto, no UUID completo.
```

---

## PR-03: Parlay Portfolio V2

Cambios:

```text
src/parlay/portfolio-v2.ts
src/parlay/candidate-generator.ts
src/parlay/diversifier.ts
src/parlay/ranker.ts
src/parlay/analysis.ts
```

Entregar buckets:

```text
single-top
two-leg-safe
three-leg-balanced
four-leg-aggressive-analytical
corners-watchlist
corners-mixed
```

Tests:

```text
- genera 1-leg, 2-leg, 3-leg y 4-leg si hay insumos.
- respeta maxItems por bucket.
- no repite demasiado fixture/mercado.
- limita corners por parlay.
- separa codex-only, deprecated-provider-only y consensus-mixed.
```

---

## PR-04: Corners Strategy V1

Cambios:

```text
src/parlay/corner-strategy.ts
src/prediction/corners.ts
src/validation/settlement-rules.ts si hace falta ajustar reason codes
```

Entregar:

```text
cornerDataQuality
cornerSignalScore
corner warnings
corners-watchlist
corners-mixed
```

Criterios:

```text
corners sin datos suficientes -> review-required o blocked.
corners con datos suficientes -> candidatos analíticos.
```

---

## PR-05: Dashboard + Discord final

Cambios:

```text
src/dashboard/page.ts
src/dashboard/query.ts
src/dashboard/types.ts
notify-discord-recommendations.mjs
```

Mostrar:

```text
Daily progress
Provider status
Parlay bucket
Leg count
Family
Corners recommendations
Display names
Warnings
```

---

# Mi recomendación final

Yo haría **primero paralelismo + progreso**, porque eso impacta directamente el tiempo del E2E y la visibilidad de Hermes.

Después arreglaría **Discord names**, porque ahora mismo la notificación pierde confianza cuando muestra UUIDs.

Luego haría **Parlay Portfolio V2**, porque ahí está el salto de calidad: más variedad, más legs, más corners, más familias, mejores recomendaciones.

En una frase:

> Corre Codex y deprecated provider en paralelo sobre el mismo slate, muestra progreso por provider, hidrata nombres antes de Discord, y convierte el parlay builder en una cartera diaria con simples, 2-leg, 3-leg, 4-leg, corners y consenso.
