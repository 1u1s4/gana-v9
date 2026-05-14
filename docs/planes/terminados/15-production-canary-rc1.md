## Estado de cierre

Completado el 2026-05-14 como RC/canary controlado.

Cambios aplicados:

- Se agregaron limites operativos explicitos por run:
  - `GANA_MAX_PROVIDER_REQUESTS_PER_RUN`
  - `GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN`
- El runtime cuenta requests del provider y bloquea con error accionable cuando se alcanza el techo.
- El pipeline registra `maxProviderRequestsPerRun`, `maxAgenticResearchCallsPerRun`, `providerRequests`, `agenticResearchCalls` y `agenticFixtures` en artifacts/evaluation.
- El pipeline limita research/scoring agentic por `maxAgenticResearchCallsPerRun` sin romper el cap existente de `maxFixturesPerRun`.
- El analisis de parlays ahora expone `exposure` y `exposurePolicy` como lenguaje preferente de artifact analitico, manteniendo `stake`/`bankrollPolicy` solo como compatibilidad legacy.
- El output CLI de `parlay analyze` muestra `exposurePolicy`, `selectedExposureUnits` y `exposure`.
- Dashboard confirmado read-only: `src/dashboard/server.ts` acepta solo `GET` y retorna `405` para otros metodos.
- PostgreSQL confirmado como historico/futuro en docs terminados; MySQL/DigitalOcean sigue siendo canonico para el RC.

Verificacion automatica:

```text
npm run typecheck
npm test
```

Resultado:

```text
typecheck: passed
tests: 350/350 passed
```

Canary 1:

```text
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10 \
GANA_MAX_PROVIDER_REQUESTS_PER_RUN=160 \
npm run gana -- run --date 2026-05-14 --web off --markets h2h,double_chance,goals_over_under,btts
```

Resultado:

```text
runId: 71cdf70d-42fa-448b-8442-44ee03f25518
status: failed
verdict: blocked
providerRequests: 160
causa: Provider request limit reached for this run (160)
```

Hallazgo: `160` requests es demasiado bajo para los presets actuales; se alcanza el techo antes de completar odds/low-odds. El bloqueo fue esperado y accionable, y demuestra que el gate de limite funciona.

Canary 2:

```text
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10 \
GANA_MAX_PROVIDER_REQUESTS_PER_RUN=600 \
npm run gana -- run --date 2026-05-14 --web off --validate off --markets h2h,double_chance,goals_over_under,btts
```

Resultado:

```text
runId: c0d5540e-038d-4d33-aaed-cb88ff90b47b
status: succeeded
verdict: review-required
fixtures: 10
selectedFixtures: 10
agenticFixtures: 10
providerRequests: 193
oddsQuotes: 381
lowOddsHits: 480
predictions: 36
parlayLegs: 4
parlayRecommendations: 1
validations: 0
```

Artifacts principales:

```text
.artifacts/gana-v9/runs/c0d5540e-038d-4d33-aaed-cb88ff90b47b
.artifacts/gana-v9/handoffs/c0d5540e-038d-4d33-aaed-cb88ff90b47b.md
.artifacts/gana-v9/evidence-packs/c0d5540e-038d-4d33-aaed-cb88ff90b47b/manifest.json
```

Cobertura del canary 2:

```text
webSearchCoverage: web off, required=false, real=0, synthetic=0
marketCoverage requested: h2h,double_chance,goals_over_under,btts
oddsMarkets: btts,double_chance,goals_over_under,h2h
predictionMarkets: btts,double_chance,goals_over_under,h2h
researchEvidenceMarkets: btts,double_chance,goals_over_under,h2h
calibrationSummary: applied=0 degraded=0 unavailable=36
```

Estado operativo:

- No se escalo a 40/100 fixtures porque el canary 2 queda `review-required`, no promotable.
- Razones principales: fixtures fuera de fecha local excluidos, cap de 100 a 10, warnings de research fallback, baja liquidez, edge insuficiente/capado, calibracion no disponible y algunos markets marcados review-required por scoring.
- Validation se dejo apagado en el canary 2 para aislar el RC; el primer canary con auto validation encontro 626 targets historicos del dia, lo cual confirma que la validacion date-wide debe correrse como paso separado cuando se quiera liquidar/backtestear.
- Se verifico que los artifacts del canary 2 no contienen credenciales reales del `.env` (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `DATABASE_URL`).
- Todo sigue siendo artifact analitico: `executionCapability: none`; no hay capacidad monetaria ni acciones mutantes de dashboard.

Comandos manuales de acceptance live recomendados antes de subir volumen:

```bash
DATABASE_URL=... API_FOOTBALL_KEY=... AGENT_PROVIDER=codex \
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10 \
GANA_MAX_PROVIDER_REQUESTS_PER_RUN=600 \
npm run gana -- run --date YYYY-MM-DD --web off --validate off --markets h2h,double_chance,goals_over_under,btts

DATABASE_URL=... API_FOOTBALL_KEY=... AGENT_PROVIDER=codex \
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10 \
GANA_MAX_PROVIDER_REQUESTS_PER_RUN=600 \
npm run gana -- run --date YYYY-MM-DD --web live --validate off --markets h2h,double_chance,goals_over_under,btts

npm run gana -- validate --date YYYY-MM-DD
```

---

## Veredicto general

Lo veo **muy sólido**. Ya no estás en “MVP candidate”; lo pondría como:

```text
Estado actual: release candidate productivo
Madurez técnica: 94% - 96%
Siguiente paso: canary live controlado
Riesgo principal: escalar demasiado rápido sin observar cuota, latencia, calidad y validación posterior
```

El árbol actual muestra una arquitectura bastante completa: `runtime`, `pipeline`, `run-service`, `dispatcher`, `idempotency`, `recovery`, `scheduler`, `worker`, `observability`, `analytics`, `dashboard`, `parlay`, `validation`, `permissions`, `security`, `storage`, `providers/sports`, `skills` versionadas y migraciones hasta `daily_metrics`. Eso ya tiene forma de sistema productivo, no de prototipo. 

---

## Lo mejor que veo

### 1. La arquitectura ya está production-grade

La estructura actual tiene los módulos que esperaría en un harness productivo real:

```text
src/runtime/pipeline.ts
src/runtime/run-service.ts
src/runtime/scheduler.ts
src/runtime/worker.ts
src/runtime/recovery.ts
src/runtime/idempotency.ts
src/observability/spans.ts
src/observability/trace-writer.ts
```

Eso es muy buena señal. Para operar predicciones en volumen no basta con tener comandos sueltos; necesitas orquestación, recuperación, trazas, idempotencia y workers. El árbol ya muestra esas piezas. 

Además, `run-service.ts` centraliza el acceso a `executeRunPipeline`, `runFixtureScoring`, `runParlayBuild` y `runValidation`, lo cual evita que la lógica quede duplicada en la TUI o en comandos headless. 

---

### 2. La certificación quedó mucho mejor

El cambio a `ci-certification` está bien cerrado. El runner ahora usa:

```text
CERTIFICATION_PROFILE = 'ci-certification'
CERTIFICATION_FIXTURE_PATH = fixtures/replays/ci-certification.json
CERTIFICATION_GOLDEN_PATH = fixtures/replays/ci-certification.golden.json
```

y el check principal se llama `certification-pipeline-evidence-pack-v2`, ya no “smoke” ni “replay pipeline” como flujo operativo. 

También me gusta que la certificación cubra más que “el sistema corre”. Está verificando cosas importantes:

```text
tools con metadata/schema/policy/redaction/audit/timeout/risk/executor
OpenRouter server tools no registrados
tools mutantes requieren approval
skills versionadas con tests
hashes de prompts contra manifests
secret leak check
prediction contract
handoff disclaimer
calibration/leaderboard
manifest v2
golden manifest hash
```

Eso es mucho más serio que un smoke test simple. 

---

### 3. Los fixtures técnicos quedaron correctamente aislados

La certificación usa fixtures en `fixtures/replays/ci-certification.*`, pero el manifest marca:

```text
fixtureMode: technical-certification-only
deterministic: true
```

Eso es exactamente lo que querías: no es un modo operativo offline, sino una regresión técnica interna para garantizar que el harness no se rompa. 

Ese punto ya está bien resuelto conceptualmente.

---

### 4. Los skills ya parecen una base seria para mejorar calidad

El árbol actual incluye muchos skills versionados y con tests:

```text
research-fixture-v1/v2
score-prediction-v1/v2
build-parlay-v1
parlay-candidate-generator-v1
parlay-portfolio-v1
parlay-ranker-v1
correlation-model-v1
devig-and-fairprice-v1
line-movement-tracker-v1
lineup-confirmation-gate-v1
ensemble-disagreement-v1
validation-clv-v1
calibration-monitor-v1
```

Esto es muy valioso porque ya no dependes de una sola heurística. Tienes piezas evaluables, versionadas y comparables. 

Además, la certificación revisa que las skills estén cubiertas y que los hashes de prompts coincidan con sus manifests. Eso ayuda mucho a evitar cambios silenciosos en prompts o reglas. 

---

### 5. Parlay ya no es un builder básico

Tu módulo de parlay ahora incluye:

```text
analysis.ts
builder.ts
candidate-generator.ts
correlation.ts
diversifier.ts
eligibility.ts
ranker.ts
rules.ts
service.ts
```

Eso está muy bien. Para producción, el problema no es solo crear combinaciones, sino controlar correlación, elegibilidad, diversificación y ranking. Ese diseño ya apunta a operación real. 

---

### 6. Analytics y métricas ya están bien encaminadas

Veo módulos de:

```text
brier
logloss
clv
holdout
leaderboard
calibration-plot
daily metrics
```

y además una migración `20260513090000_daily_metrics`. Esto es clave porque, cuando empieces a generar volumen, la prioridad será medir desempeño real: calibración, error, CLV, leaderboard, mercados fuertes y mercados débiles. 

La inclusión de `metrics` dentro del `DashboardOverviewResponse` también indica que el dashboard ya puede servir como visor de desempeño y no solo como listado de runs/predictions. 

---

### 7. El dashboard está bien orientado como observabilidad

El dashboard permite leer config, filtros, counts, fixtures, predictions, parlays, validations, runs y métricas. Eso está bien para observabilidad y revisión. 

Lo mantendría así: **visor y observabilidad**, no control plane. El centro operativo debe seguir siendo TUI/CLI.

---

## Lo que revisaría con más cuidado

### 1. DB: MySQL está bien si ya quedó canónico

El schema actual usa:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

Eso está bien si ya congelaste la decisión como **DigitalOcean MySQL RC**. 

El único cuidado es documental: en snapshots anteriores había planes que todavía hablaban de PostgreSQL como objetivo. Si esos archivos viejos todavía existen en `docs/planes/por_hacer`, yo los movería a histórico o los renombraría para que nadie piense que hay que migrar a PostgreSQL antes de operar. Técnicamente, **no migraría a PostgreSQL ahora**. Si MySQL ya está funcionando, usaría MySQL para el RC.

---

### 2. Lenguaje de “bankroll” y “stake”

Veo que en la certificación aparece un bloque analítico con cosas como:

```text
percentOfBankroll
fractional-kelly-capped-analytical-stake
bankrollPolicy
analyticalArtifactOnly: true
executionCapability: none
```

La parte buena es que explícitamente dice `analyticalArtifactOnly: true` y `executionCapability: none`, o sea, no hay ejecución monetaria. 

Aun así, yo suavizaría el lenguaje para producción. En vez de `bankroll` y `stake`, usaría algo como:

```text
exposureUnits
portfolioExposurePolicy
analyticalUnits
maxPortfolioExposure
maxParlayExposure
```

No es un bloqueo técnico, pero reduce ambigüedad. El producto debe seguir siendo de **análisis y predicción**, no de ejecución financiera ni apuestas automatizadas.

---

### 3. La certificación es fuerte, pero no sustituye un canary live

La certificación valida contrato, evidencia, manifest, tools, skills, hashes, trazas y seguridad sin credenciales reales. Eso es excelente para regresión técnica. 

Pero para producción todavía necesitas una corrida live pequeña. No la llamaría smoke; la llamaría:

```text
production canary
```

La certificación responde:

> “¿El sistema sigue cumpliendo sus contratos internos?”

El canary live responde:

> “¿El sistema funciona hoy con API-Football, DB real, cuotas reales, fixtures reales y artifacts reales?”

Son dos cosas distintas. Ya cerraste bien la primera; ahora toca la segunda.

---

### 4. Vigilar el volumen de artifacts

Ya tienes artifacts, evidence packs, handoffs, spans, dashboard, metrics y daily metrics. Eso es excelente, pero en producción puede crecer rápido.

Antes de correr volumen fuerte, definiría una política simple:

```text
artifacts completos: retención 30-90 días
manifests/hashes/resúmenes: retención larga
raw provider snapshots: retención controlada
spans grandes: compactación o retención menor
```

No es urgente para el primer canary, pero sí para producción diaria.

---

### 5. Cuota y latencia de API-Football

El sistema ya tiene provider, snapshots, status y persistencia, pero al escalar debes observar:

```text
requests por run
fixtures sin odds
mercados no disponibles
bookmakers faltantes
latencia por endpoint
errores 429 / rate limit
errores por fecha/liga
```

No empieces con miles de fixtures. Empieza con 10, luego 40, luego 100.

---

## Mi lectura por área

| Área               |                 Estado | Lectura                                                                            |
| ------------------ | ---------------------: | ---------------------------------------------------------------------------------- |
| Runtime/pipeline   |             Muy fuerte | Ya hay orquestación, run-service, recovery, worker, scheduler e idempotencia.      |
| Certificación      |             Muy fuerte | `ci-certification`, manifest, hashes, skills, secret checks y evidence pack v2.    |
| API-Football       |                 Fuerte | Provider, mappers, snapshots, tests y persistencia.                                |
| DB/storage         |                 Fuerte | MySQL RC parece correcto si ya quedó canónico.                                     |
| Domain/markets     |                 Fuerte | Fixture, odds, markets y settlement están bien separados.                          |
| Filtros/low-odds   |                 Fuerte | El enfoque por filtros y threshold ya está en el diseño.                           |
| Prediction/scoring |                 Fuerte | Gates, scoring, prompts, service y pruebas.                                        |
| Parlay             |             Muy fuerte | Builder, candidate generator, correlation, diversifier, eligibility y ranker.      |
| Validation         |                 Fuerte | Result fetcher, service, settlement rules y tests.                                 |
| Analytics/evals    |             Muy fuerte | Brier, logloss, CLV, calibration, leaderboard y daily metrics.                     |
| Seguridad          |                 Fuerte | Permissions, approvals, egress/filesystem policy, redaction y no-monetary-actions. |
| Dashboard          |                  Bueno | Útil como observabilidad; no debe volverse control plane.                          |
| Operación live     | Pendiente de comprobar | Falta canary productivo con datos reales.                                          |

---

## Qué haría ahora exactamente

### 1. Congelar este estado

Como ya pasaste:

```text
pnpm typecheck
pnpm test
pnpm gana certify --profile ci-certification
manifest audit
```

yo haría tag:

```bash
git tag gana-v9-rc1
```

o:

```bash
git tag gana-v9-production-candidate-2026-05-14
```

---

### 2. Primer production canary

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana run --date YYYY-MM-DD
```

Criterios de éxito:

```text
runId creado
fixtures reales consultados
odds reales consultadas
filtros aplicados
predictions generadas
parlays analíticos generados si hay condiciones
artifacts escritos
evidence pack generado
handoff generado
spans escritos
DB persistida
sin secretos en output/artifacts
sin acciones monetarias
```

---

### 3. Exportar y revisar

```bash
pnpm gana export --run-id RUN_ID
pnpm gana artifacts --run-id RUN_ID
```

Luego revisa:

```text
manifest
predictions.json
parlays.json
validations.json si aplica
handoff.md
spans.jsonl
audit logs
provider snapshots
odds snapshots
```

---

### 4. Escalar de forma gradual

Después del canary de 10:

```bash
GANA_MAX_FIXTURES_PER_RUN=40 pnpm gana run --date YYYY-MM-DD
```

Después:

```bash
GANA_MAX_FIXTURES_PER_RUN=100 pnpm gana run --date YYYY-MM-DD
```

No subiría de 100 hasta tener varios días de validación.

---

### 5. Validación posterior

Cuando los partidos ya tengan resultados:

```bash
pnpm gana validate --date YYYY-MM-DD
```

Después revisa:

```text
Brier
logloss
CLV
calibration
leaderboard
daily metrics
mercados fuertes
mercados débiles
ligas problemáticas
blocked reasons
review-required reasons
```

---

## Pequeños ajustes recomendados antes de volumen masivo

No son bloqueantes para un canary, pero sí buenos para producción diaria:

```text
1. Renombrar “bankroll/stake” a “exposure/analytical units” en artifacts/handoff.
2. Confirmar que docs viejos de PostgreSQL estén como históricos, no como planes activos.
3. Definir retención de artifacts/spans/provider snapshots.
4. Poner límite explícito de requests por run.
5. Poner límite de agentic research calls por run.
6. Confirmar que dashboard no tenga acciones mutantes.
7. Confirmar backup de DigitalOcean MySQL antes de runs diarios.
```

---

## Conclusión

Va **muy bien**. Yo ya no lo trataría como proyecto por terminar, sino como un sistema listo para su **primer canary productivo**.

La base está fuerte: certificación limpia, runtime productivo, skills versionadas, parlay avanzado, validation, analytics, dashboard de observabilidad, seguridad y DB real. Lo que falta ya no es arquitectura; falta **operar con disciplina**.

Mi recomendación final:

> Congela RC1, corre un canary live de 10 fixtures, exporta artifacts, revisa calidad y secretos, luego escala a 40 y 100. A partir de ahí, la mejora debe venir de validation, calibration, CLV y leaderboard, no de más reescritura del sistema.
