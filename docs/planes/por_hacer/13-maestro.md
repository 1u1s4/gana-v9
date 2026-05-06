quiero que completes esto:
"""
## Veredicto

Ahora sí lo veo como un **production candidate real**, no solo como MVP candidate.

El cambio más importante es que ya desapareció el enfoque `smoke` del árbol actual: en `scripts/` solo quedan los actualizadores de modelos de Codex, Cursor y Gemini, y ya no aparecen `smoke.ts`, `smoke-e2e.ts` ni `smoke-e2e.test.ts`. Eso está alineado con tu decisión de dejar de invertir en smoke tests y enfocarte en operación real. 

Además, el repo ya se ve bastante más maduro que antes: ahora aparecen módulos de `analytics`, `markets`, `observability`, `dashboard`, `evals`, `runtime/scheduler.ts`, `runtime/worker.ts`, `runtime/recovery.ts`, `runtime/idempotency.ts`, parlay avanzado, leaderboard y migraciones nuevas para approvals, odds analytics y leaderboard entries. Eso ya no es solo “hacer predicciones”; ya empieza a parecer un sistema de producción para operar, medir y mejorar predicciones en volumen. 

Mi lectura actual sería:

```text
Estado: production candidate avanzado
Siguiente fase: operación controlada en masa
Riesgo principal: lanzar volumen sin límites, sin monitoreo y sin decisión DB documentada
```

---

## Lo mejor que veo ahora

### 1. Smoke eliminado correctamente

Esto ya quedó bien. El árbol actual de `scripts/` solo muestra:

```text
update-codex-models.ts
update-cursor-models.ts
update-gemini-models.ts
```

Eso significa que el repo ya no está centrado en “pruebas de humo”, sino en operación real y mantenimiento de providers agentic. 

---

### 2. El sistema ya tiene capa productiva real

Ahora aparecen módulos que antes no estaban o no estaban tan completos:

```text
src/runtime/dispatcher.ts
src/runtime/idempotency.ts
src/runtime/recovery.ts
src/runtime/scheduler.ts
src/runtime/worker.ts
src/observability/spans.ts
src/observability/trace-writer.ts
src/analytics/*
src/evals/*
```

Eso es muy buena señal. Para predicción en masa no basta con tener `/score` o `/parlay`; necesitas idempotencia, recuperación, trazas, worker/scheduler, métricas y evaluación posterior. El árbol actual ya apunta justo a eso. 

---

### 3. El parlay ya está más allá de la versión básica

Tu módulo `src/parlay` ya no solo tiene builder, rules y service. Ahora también incluye:

```text
candidate-generator.ts
correlation.ts
diversifier.ts
ranker.ts
```

Eso es importante porque, para predecir en masa, no basta con generar parlays combinando picks. Necesitas evitar correlaciones malas, diversificar candidatos y rankearlos. Esa es una mejora fuerte para operación real. 

---

### 4. Ya agregaste analítica de desempeño

Veo:

```text
brier.ts
calibration-plot.ts
clv.ts
holdout.ts
leaderboard.ts
logloss.ts
```

Esto es clave. Si vas a predecir en masa, la pregunta ya no es solo “¿cuántas predicciones generé?”, sino:

```text
¿están calibradas?
¿mejoran contra implied probability?
¿hay CLV positivo?
¿qué skill/modelo funciona mejor?
¿qué mercados fallan más?
¿qué leagues/teams conviene filtrar?
```

Esa capa analítica es lo que te puede permitir mejorar el sistema con datos reales, no solo producir picks en volumen. 

---

### 5. El enfoque de skills quedó muy interesante

La carpeta `skills/` ahora incluye cosas como:

```text
devig-and-fairprice-v1
line-movement-tracker-v1
lineup-confirmation-gate-v1
correlation-model-v1
ensemble-disagreement-v1
calibration-monitor-v1
validation-clv-v1
parlay-ranker-v1
```

Esto es una muy buena dirección. Ya no estás dependiendo de una sola heurística de scoring. Estás preparando un sistema por skills evaluables, versionadas y testeables. Para producción, eso ayuda mucho porque puedes comparar versiones y saber qué skill aporta valor real. 

---

## Lo que todavía cerraría antes de lanzar volumen fuerte

### 1. La decisión DB sigue siendo el único punto amarillo

En el árbol actual, el `schema.prisma` sigue mostrando:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

Pero tus planes siguen hablando de **DigitalOcean Managed PostgreSQL** y piden explícitamente que `prisma/schema.prisma` use `postgresql`.  

Para producción inmediata, mi recomendación práctica es:

```text
No migres de motor justo antes de operar en masa.
Si MySQL ya funciona, congela MySQL como decisión productiva actual.
```

Pero documenta esa decisión. Ahora mismo el sistema parece listo para correr, pero la documentación todavía dice otra cosa. Eso no bloquea técnicamente, pero sí puede causar confusión cuando depures errores o vuelvas a revisar arquitectura.

Yo haría este cierre:

```text
DB productiva MVP: DigitalOcean MySQL + Prisma.
PostgreSQL queda como alternativa futura, no como requisito actual.
```

---

### 2. Todavía hay referencias documentales a smoke

Aunque los scripts ya no muestran smoke, los planes de QA todavía hablan de “smoke tests”. El documento de QA mantiene esa terminología como parte de la matriz de aceptación. 

No es grave para correr producción, pero sí limpiaría docs para que el proyecto quede coherente:

```text
smoke tests -> acceptance live
smoke productivo -> production acceptance run
GANA_ENABLE_SMOKE -> eliminar si aún aparece en docs/env
```

Esto evita que el repo diga una cosa y la operación haga otra.

---

### 3. La carpeta `fixtures/replays` sigue existiendo

El árbol actual todavía muestra:

```text
fixtures/replays
```

No necesariamente está mal. Puede servir para tests unitarios, regresión o fixtures técnicos. Pero como tú decidiste que el producto debe ser 100% online, yo lo dejaría documentado así:

```text
fixtures/replays no son modo operativo del producto.
Solo existen para pruebas técnicas o regresión local.
```

No hace falta borrarlo si los tests lo usan. Solo evita que aparezca como camino de ejecución productiva.

---

## Mi recomendación para lanzarte ya

Yo no haría otro rediseño. Haría una entrada a producción en tres niveles.

### Nivel 1: corrida pequeña real

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana run --date 2026-05-06
```

Objetivo:

```text
ver que el pipeline completo corre,
persiste datos,
genera artifacts,
no filtra secretos,
y produce predictions/parlays/validation pendientes.
```

---

### Nivel 2: corrida media

```bash
GANA_MAX_FIXTURES_PER_RUN=40 \
pnpm gana run --date 2026-05-06
```

Aquí revisaría:

```text
tiempo total
errores API-Football
quota consumida
fixtures sin odds
mercados faltantes
predictions blocked
predictions review-required
predictions promotable
parlays generados
artifacts exportados
```

---

### Nivel 3: corrida masiva controlada

```bash
GANA_MAX_FIXTURES_PER_RUN=100 \
pnpm gana run --date 2026-05-06
```

No empezaría con más de 100 fixtures por run hasta ver tiempos, cuota y calidad de resultados.

Después exportas:

```bash
pnpm gana export --run-id RUN_ID
```

Y cuando terminen los partidos:

```bash
pnpm gana validate --date 2026-05-06
```

---

## Controles que pondría para predicción en masa

Para producción diaria, usaría límites duros:

```text
maxFixturesPerRun: 100
lowOddsThreshold: 1.20
includeLiveFixtures: false
includeCompletedFixtures: false para predicción
includeCompletedFixtures: true solo para validation
maxParlayLegs: 3 a 5
maxParlaysPerRun: limitado
```

Y monitorearía estas tablas/módulos:

```text
harness_runs
harness_tasks
provider_quota_samples
odds_snapshots
odds_quotes
predictions
parlays
parlay_legs
validation_artifacts
leaderboard_entries
audit_logs
```

Tus migraciones actuales ya incluyen `approval_requests`, `odds_market_analytics` y `leaderboard_entries`, lo cual ayuda mucho para operación posterior y seguimiento de desempeño. 

---

## Qué no haría

No volvería a meter smoke.

No migraría a PostgreSQL hoy si MySQL ya está funcionando.

No abriría dashboard como superficie principal todavía, aunque ya exista `src/dashboard`. Lo usaría como lectura/observabilidad, pero la operación principal debe seguir siendo TUI/CLI, como dice el enfoque del SRS. El plan de TUI/CLI mantiene que la TUI y el CLI headless son la superficie operativa principal. 

No correría “todo el mundo” de una sola vez. API-Football, odds y research pueden volverse caros o lentos si escalas sin límites.

---

## Checklist final antes del primer batch fuerte

```text
[ ] npm run typecheck pasa
[ ] npm test pasa
[ ] pnpm gana db status funciona
[ ] pnpm gana football status funciona
[ ] pnpm gana filters show funciona
[ ] smoke ya no aparece en package.json ni scripts
[ ] docs ya no presentan smoke como flujo productivo
[ ] DB canónica documentada: MySQL o PostgreSQL, sin contradicción
[ ] run pequeño de 10 fixtures funciona
[ ] export genera artifacts
[ ] no aparecen secretos en logs/artifacts
[ ] no-monetary-actions sigue activo
[ ] validation funciona cuando hay resultados finales
[ ] leaderboard/calibration empiezan a poblarse después de validation
```

---

## Conclusión

Ahora lo veo **muy bien para entrar en producción controlada**.

Ya tienes señales de un sistema serio: runtime productivo, worker/scheduler, recovery, observabilidad, analytics, evals, parlay avanzado, leaderboard, permissions, no-monetary-actions y smoke eliminado. 

Mi recomendación sería:

> Lánzate ya con runs reales, pero escala por tandas: 10 fixtures, luego 40, luego 100. No vuelvas a invertir en smoke. Invierte en monitorear calidad, cuota, calibration, CLV, blocked reasons y validation results.
"""

ademas de 
"""
Sí. A nivel código, yo atacaría esto en 4 frentes, en este orden:

1. Sacar legs con research timeout del parlay principal

Ahora el builder permite meter una leg review-required si ayuda a llegar al parlay, pero esa leg 1535198 es justamente la que arrastra:

• research fixture 1535198 timed out
• research is not promotable
• stale news source
• parlay review-required

Cambio recomendado:

En src/parlay/builder.ts o donde evalúa elegibilidad de legs:

const hasHardResearchWarning = prediction.warnings?.some((warning) =>
  warning.includes('research is not promotable') ||
  warning.includes('stale news source') ||
  warning.includes('timed out') ||
  warning.includes('insufficient evidence')
);

if (hasHardResearchWarning) {
  return excluded('research-not-promotable');
}O más suave:

• parlay conservador/balanced: solo status === 'promotable'
• parlay review: permite review-required

Así el parlay principal no queda contaminado por una sola leg débil

───

2. Mejorar timeout/retry de research por fixture

El fixture 1535198 hizo timeout dos veces. Ahora el pipeline lo trata como fallo de research y cae en fallback/review.

En src/runtime/pipeline.ts, el timeout global es por fixture:

AGENT_FIXTURE_TIMEOUT_MSY en src/evidence/research.ts hay otro timeout:

RESEARCH_AGENT_TIMEOUT_MSRecomendación:

• Subir timeout de research para live web a 240-300s
• Agregar retry real por fixture cuando el error sea timeout
• Reducir scope del prompt si es retry: pedir solo fuentes + claims mínimos

Ejemplo conceptual:

if (isTimeoutError(err) && attempt < 2) {
  return runFixtureResearch(config, {
    ...input,
    mode: 'minimal-research-retry',
  }, runtime);
}Y en el prompt retry:

• máximo 2 fuentes web
• máximo 4 claims
• sin narrativa larga
• JSON estricto

───

3. No dejar que fallback research sea elegible para score/parlay

En src/evidence/research.ts, el fallback está bien marcado como:

'fallback research is not promotable'Pero luego scoring/parlay todavía puede producir picks sobre eso.

Cambio recomendado en src/prediction/service.ts:

Si el research bundle tiene fallback o gateResult.verdict !== 'promotable', permitir scoring analítico pero marcarlo como no elegible para parlay:

const parlayEligible = researchBundle.gateResult.verdict === 'promotable'
  && !researchBundle.warnings.some(w => w.includes('fallback research'));

prediction.metadata = {
  ...prediction.metadata,
  parlayEligible,
};Luego el parlay builder filtra:

if (prediction.metadata?.parlayEligible === false) exclude(...)───

4. Separar “analytical-only” de “review-required”

Esto es importante: analyticalArtifactOnly: true no viene de mala evidencia. Está hardcodeado por diseño.

Está en src/parlay/service.ts:

analyticalArtifactOnly: true,
notice: 'This parlay candidate is an analytical artifact only...'Entonces aunque todo sea promotable, el artifact seguirá siendo “analítico”.

Si querés que el sistema distinga mejor, no quitaría ese flag. Haría esto:

analyticalArtifactOnly: true,
qualityVerdict: build.parlay.status,
executionCapability: 'none',Así queda claro:

• analyticalArtifactOnly: true = política/producto, no ejecuta apuestas
• status: promotable | review-required = calidad de evidencia

───

Mi recomendación concreta para el próximo patch:

1. En parlay builder: excluir del parlay principal cualquier leg con research timeout / stale source / fallback research
2. Mantener esas legs solo en portfolio review
3. Agregar retry minimal para research timeout
4. Renombrar o complementar analyticalArtifactOnly para que no se confunda con baja calidad

Eso debería bajar bastante los review-required falsos y evitar que una leg débil arrastre todo el parlay final
"""


para el web search quiero que agregues una tool fallback que puedan usar los agentes:
usando ### browser

`[REDACTED_BROWSER_USE_API_KEY]` (mi API-KEY para agregar el .env y probar)
de https://browser-use.com/
considerar se esta en capa free Free
The default way to connect your agent to the web.

$0
/mo
Free browsers & proxies · 10 agent tasks/mo
3 concurrent sessions
Advanced stealth

por los limites, para no sobre pasarlos.

hacer pruebas reales, con todos los proveedores, ver que hagan predicciones y parlays

al final documentar todos los cambios en un .md en docs