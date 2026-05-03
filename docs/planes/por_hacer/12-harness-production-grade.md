# Harness Production-Grade

## Objetivo

Cerrar la brecha entre el MVP harness-first actual y un harness production-grade alineado con la guia de "harness engineering". El proyecto ya tiene runtime, artifacts, auditoria, policy, evidencia, predicciones, validacion y persistencia, pero varias capas existen como modulos aislados y todavia no estan conectadas como una capa de control uniforme.

Este plan formaliza approval real, tool registry unico, runtime durable, trace/span, eval harness, evidence pack v2, retrieval formal, Skills y la capa de calidad analitica de predictions y parlays, manteniendo la restriccion explicita de no automatizacion monetaria.

El sandbox fuerte tipo Firecracker/gVisor queda explicitamente fuera de alcance: Gana v9 es TUI-first, single-user y local; los proveedores agentic (Codex, Gemini, Cursor) ya traen su propio aislamiento. La defensa se basa en tool registry, approval real, redaccion, allowlist de comandos y reglas de filesystem/egress como policy, no en aislamiento por proceso/tarea.

La calidad analitica no se trata como un problema de prompt: se trata como una capa de modulos deterministicos sobre el harness (devig, fair price, edge gate, calibracion, correlacion, parlay candidate generator, validation analytics, leaderboard) y como gates duros que el modelo no puede saltar.

## SRS cubierto

- Secciones 2.6, 2.8, 2.9, 2.10 (runtime, profile, approval, redaccion).
- Secciones 5.2, 5.3 (arquitectura, scheduler, dispatcher, recovery, artifact writer).
- Secciones 10.5, 14, 15, 16, 17.4, 17.6 (artifacts, eventos, evidencia, seguridad, audit, sources).
- Seccion 18 (criterios de aceptacion 6, 22, 23 y certificacion `ci-smoke`).
- Seccion 19 (cambios requeridos sobre el codigo actual: separar provider agentic de runtime, no depender de OpenRouter como runtime).

## Diagnostico de partida

| Area                                                                              |     Estado actual |      Nivel |
| --------------------------------------------------------------------------------- | ----------------: | ---------: |
| Flujo de dominio `fixture -> odds -> research -> scoring -> parlay -> validation` |      muy avanzado |       alto |
| Persistencia, artifacts y evidencia                                               | bastante avanzado | medio-alto |
| Policy, redaccion y auditoria                                                     |   bien encaminado | medio-alto |
| Approval real con pausa/reanudacion                                               |        incompleto |       bajo |
| Runtime durable con scheduler/dispatcher/recovery real                            |           parcial | medio-bajo |
| Observabilidad tipo trace/span/costo                                              |           parcial | medio-bajo |
| Evals/certificacion harness-grade                                                 |        incompleto |       bajo |
| Skills/retrieval formal                                                           | ausente o parcial |       bajo |
| Calidad analitica (devig, edge, calibracion, correlacion, CLV)                    |        incompleto |       bajo |

## Lo que ya esta alineado

- Schema con `HarnessRun`, `HarnessTask`, `Artifact`, `AuditLog`, `ProviderSnapshot`, `ResearchBundle`, `SourceRecord`, `EvidenceItem`, `Claim`, `Prediction`, `Parlay`, `ValidationArtifact`.
- Pipeline canonico `executeRunPipeline` con artifacts canonicos, evidence pack y handoff.
- Plan de permisos con metadata por herramienta, perfiles `standard` y `full-permissions`, approval mode, redaccion, audit log y restriccion monetaria.
- Tools locales envueltas con `evaluateAction` que registra audit y redacta resultados.
- Plan de provider agentic que reconoce Codex/Gemini/Cursor y propone OpenRouter solo como compatibilidad tecnica.

## Brechas frente a la guia

1. Approval gate solo bloquea, no pausa/reanuda con auditabilidad ligada al `toolCallId`.
2. Tools mutantes (`shell`, `file_write`) sin schemas seguros, sin `dryRun`, sin `reason` obligatorio, sin `idempotencyKey`.
3. `SERVER_TOOLS` de OpenRouter (`openrouter:web_search`, `openrouter:datetime`) entran al agente sin pasar por `guardTool`.
4. Pipeline ejecuta como flujo sincrono y no usa `HarnessTask` como cola durable.
5. Falta egress allowlist y reglas de filesystem como policy (no como sandbox real): hoy `shell` y `file_write` corren contra el entorno local sin restricciones explicitas.
6. Eventos existen pero no hay trace/span jerarquico con costos y latencias por step/tool.
7. Falta eval harness `gana certify` con goldens, safety checks y manifest deterministico.
8. Evidence pack actual no incluye sources/claims/approvals/gates/hashes/reproduction como secciones explicitas.
9. Retrieval no esta formalizado: hay evidencia pero no ranking, frescura ni provenance obligatoria.
10. No existe estructura de Skills versionadas con tests, drift detection ni bump obligatorio por cambio de prompt.
11. Odds entran sin remocion de vig ni consenso multi-bookmaker, asi que el "edge" comparado contra el mercado no es defendible.
12. Predictions se modelan como verdict textual y no como probabilidad calibrada con `edge`, `confidenceBand`, `blockers` ni gates duros antes de promover.
13. Parlays se construyen sin modelo de correlacion entre legs, sin diversificacion estructural y sin variantes (`top-ev`, `low-variance`, `high-conviction`).
14. Validation no produce metricas analiticas comparables (Brier, log loss, CLV, calibration plot) ni leaderboard por skill/modelo/mercado/liga.
15. No hay disciplina formal de "no-jugar": no existe gate global que convierta el default del run en `no-parlay-today` cuando faltan condiciones.

## Modulos nuevos

```text
src/permissions/approval-store.ts
src/permissions/approval-service.ts
src/permissions/approval-executor.ts
src/commands/approval.ts

src/tools/registry.ts
src/tools/executor.ts
src/tools/schemas.ts

src/runtime/scheduler.ts
src/runtime/dispatcher.ts
src/runtime/worker.ts
src/runtime/recovery.ts
src/runtime/idempotency.ts

src/permissions/egress-policy.ts
src/permissions/filesystem-policy.ts

src/observability/spans.ts
src/observability/trace-writer.ts

src/evals/runner.ts
src/evals/metrics.ts
tests/certification/
fixtures/replays/

src/retrieval/index.ts
src/retrieval/corpus.ts
src/retrieval/bm25.ts
src/retrieval/freshness.ts
src/retrieval/provenance.ts

skills/
  research-fixture-v1/
  score-prediction-v1/
  build-parlay-v1/
  validate-settlement-v1/

src/markets/devig.ts
src/markets/fair-price.ts
src/markets/line-movement.ts
src/markets/efficiency.ts
src/markets/lineup-gate.ts

src/scoring/calibration.ts
src/scoring/ensemble.ts
src/scoring/edge-gate.ts
src/scoring/disagreement.ts

src/parlay/correlation.ts
src/parlay/candidate-generator.ts
src/parlay/ranker.ts
src/parlay/diversifier.ts

src/analytics/brier.ts
src/analytics/logloss.ts
src/analytics/clv.ts
src/analytics/calibration-plot.ts
src/analytics/leaderboard.ts
src/analytics/holdout.ts

skills/
  devig-and-fairprice-v1/
  line-movement-tracker-v1/
  lineup-confirmation-gate-v1/
  research-fixture-v2/
  score-prediction-v2/
  ensemble-disagreement-v1/
  correlation-model-v1/
  parlay-candidate-generator-v1/
  parlay-ranker-v1/
  validation-clv-v1/
  calibration-monitor-v1/
```

## Modulos afectados

- `src/agent.ts`: registro unico de tools, eliminar `...SERVER_TOOLS` sin policy.
- `src/tools/*`: reemplazar `shell` y `file_write` libres por schemas estrictos, separar `dangerous_shell`.
- `src/runtime/pipeline.ts` y `run-service.ts`: envolver pasos en `HarnessTask` durables.
- `src/permissions/*`: extender de "evaluacion + audit" a approval real con persistencia.
- `src/observability/events.ts`: mantener eventos JSONL y agregar capa de spans.
- `src/runtime/evidence-pack.ts`: emitir manifest v2 con secciones explicitas.
- `src/research/*`: producir claims con `sourceId` real, diversidad de fuentes obligatoria, deteccion de contradicciones y `availableAt` por evidencia.
- `src/scoring/*`: pasar de `verdict` textual a output probabilistico calibrado con `edge`, `confidenceBand` y `blockers`.
- `src/parlay/*`: dejar de multiplicar probabilidades como independientes y pasar a candidate generator + ranker con correlacion explicita.
- `src/validation/*`: emitir metricas analiticas (Brier, log loss, CLV, calibration plot) y enlazar al leaderboard.

---

# P0 - Bloqueantes

## P0.1 Tool registry unico

### Problema

`createTools()` envuelve herramientas locales con `guardTool`, pero agrega `SERVER_TOOLS` directamente. Unas pasan por policy/audit/redaccion y otras no.

### Cambios

- Crear `src/tools/registry.ts` con `registerTool` unico:

```ts
type ToolOrigin = 'native-provider' | 'local';

type RegisteredTool = {
  name: string;
  origin: ToolOrigin;
  schema: ZodSchema;
  metadata: ToolMetadata;
  policy: PolicyHook;
  redaction: RedactionHook;
  audit: AuditHook;
  timeoutMs: number;
  risk: 'low' | 'medium' | 'high';
  executor: ToolExecutor;
};

registerTool(tool: RegisteredTool): void;
resolveTool(name: string): RegisteredTool;
listTools(): RegisteredTool[];
```

- Eliminar el patron `...SERVER_TOOLS` sin policy en `src/agent.ts`.
- Reemplazar `openrouter:web_search` por una interfaz propia:

```ts
type ResearchSearchTool = {
  mode: 'disabled' | 'cached' | 'live';
  provider: 'codex-native' | 'gemini-native' | 'replay';
  required: boolean;
};
```

- Toda tool que entre al agente debe tener metadata, policy, redaccion, audit, trazabilidad, timeout y clasificacion de riesgo. Ninguna excepcion.

### Aceptacion

- Ejecucion con `--web required` no depende de OpenRouter.
- Test unit verifica que cada tool registrada tiene los siete atributos.
- Test integracion bloquea registro de tool sin metadata o sin executor.

---

## P0.2 Approval real con pausa/reanudacion

### Problema

`evaluateAction()` devuelve `require_approval` y la tool retorna un resultado bloqueado. No hay pausa, ni decision humana persistida, ni reanudacion del mismo `toolCallId`.

### Contrato

```ts
type ApprovalRequest = {
  approvalId: string;
  runId: string;
  taskId?: string;
  toolCallId: string;
  toolName: string;
  argsRedacted: unknown;
  risk: 'low' | 'medium' | 'high';
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
};
```

### Flujo

1. Policy devuelve `require_approval`.
2. `approval-service` crea `approval.requested` y persiste en DB y `audit-log.jsonl`.
3. TUI/CLI muestra diff/comando/argumentos redacted.
4. Usuario aprueba o deniega.
5. `approval-executor` reejecuta la tool con el mismo `toolCallId`.
6. Resultado queda ligado al `approvalId` en `audit_logs` y artifact.

### Comandos

- TUI: `/approval pending`, `/approval show APPROVAL_ID`, `/approve APPROVAL_ID`, `/deny APPROVAL_ID`.
- Headless: `pnpm gana approve APPROVAL_ID`, `pnpm gana run --date YYYY-MM-DD --approval-token TOKEN`.

### Aceptacion

- Una accion `file_edit`, `file_write`, `shell`, `artifact_promote` o `prediction_promote` queda pendiente, auditable y reanudable sin perderse.
- Test integracion: requested -> approved -> executed mantiene el mismo `toolCallId`.
- Test integracion: requested -> denied no ejecuta la tool y emite `approval.denied`.
- Test integracion: pending expirado emite `approval.expired` y la tool no se ejecuta.

---

## P0.3 Endurecer shell y file tools

### Problema

`file_write` acepta path absoluto. `shell` ejecuta comando libre con timeout pero sin allowlist, sin `cwd` controlado, sin `dryRun`, sin `reason` ni egress policy.

### Schemas seguros

```ts
type FileWriteInput = {
  path: string;              // repo-relative, no absoluto
  content: string;
  reason: string;
  dryRun?: boolean;          // default true para cambios sensibles
  expectedParent?: string;
};

type FileEditInput = {
  path: string;              // repo-relative
  search: string;
  replace: string;
  expectedSha256?: string;
  reason: string;
  dryRun?: boolean;
};

type ShellInput = {
  command: 'pnpm test' | 'pnpm typecheck' | 'pnpm lint' | 'git status';
  cwd?: string;
  reason: string;
  timeoutMs?: number;
};
```

### Reglas de tools

- `file_write.path` debe ser repo-relative; bloquear `..` y rutas absolutas.
- `file_edit` exige `expectedSha256` o relectura previa para evitar conflictos.
- `shell` solo acepta comandos allowlisted por defecto.
- Comandos libres se enrutan a `dangerous_shell`, que siempre exige approval manual y allowlist explicita.
- Toda mutacion exige `reason`.
- Toda accion riesgosa tiene `dryRun` default `true`.
- Toda ejecucion exige `idempotencyKey`.

### Reglas de filesystem (policy, no sandbox)

- Escritura permitida solo dentro de `.artifacts/` salvo approval explicito.
- Bloqueo de paths absolutos y `..` a nivel de schema.
- Bloqueo de rutas sensibles por defecto: `.env`, `.git/`, `node_modules/`, fuera del workspace.
- No pasar `.env` completo al proceso hijo: solo variables explicitamente requeridas por la tool.
- `cwd` controlado por la tool, no por el modelo.

### Reglas de egress (policy, no sandbox)

- Allowlist de hosts por perfil:
  - `mock`/`replay`: red deshabilitada (`off`).
  - `live-readonly`: API-Football y proveedor LLM agentic.
- Cualquier host fuera de allowlist queda bloqueado en la tool y emite `policy.evaluate` con resultado `blocked`.
- Web search obedece `ResearchSearchTool.mode` y nunca usa OpenRouter como runtime de red.
- Secretos se inyectan scoped por tool (no globales en el proceso).

### Aceptacion

- `file_write` con path absoluto o `..` falla schema.
- `file_write` fuera de `.artifacts/` sin approval es bloqueado.
- `shell` con comando fuera de allowlist se enruta a `dangerous_shell` o falla.
- `dangerous_shell` sin approval no ejecuta.
- Llamada saliente a host fuera de allowlist es bloqueada y auditada.
- En `mock`/`replay` no hay trafico saliente (verificado en certify).
- Test unit cubre rechazo de paths sensibles (`.env`, `.git/`, fuera del workspace).
- Test unit cubre bloqueo de host fuera de allowlist por perfil.

---

## P0.4 Pipeline como tasks durables

### Problema

`executeRunPipeline` ejecuta como flujo sincrono. `HarnessTask` ya existe en schema con estado, prioridad, `scheduledFor`, `leaseExpiresAt`, intentos y `maxAttempts`, pero no se usa.

### Modelo

Cada step canonico es un task durable con:

```text
taskId, runId, type, status, attempts, maxAttempts,
leaseExpiresAt, idempotencyKey, inputHash,
outputArtifactId, gateResult, lastErrorRedacted
```

Steps:

```text
run.created
  -> fixtures.fetch
  -> odds.fetch
  -> low_odds.scan
  -> research.fixture
  -> score.fixture
  -> parlay.build
  -> validation.run
  -> evidence_pack.export
```

### Modulos

- `scheduler` crea tasks segun el run.
- `dispatcher` toma tasks pendientes respetando lease y prioridad.
- `worker` ejecuta un step y escribe artifact aun en fallo.
- `recovery` detecta leases vencidos y reasigna.
- `idempotency` evita duplicar snapshots, predictions o validations.

### Aceptacion

- Run interrumpido se reanuda con los tasks pendientes sin reejecutar los completados.
- Lease vencido se recupera y aumenta `attempts` hasta `maxAttempts`.
- Idempotency bloquea snapshot duplicado por `(runId, fixtureId, market, providerSnapshotId)`.
- Test integracion: kill durante `score.fixture` deja artifact parcial y permite resume.

---

## P0.5 Certificacion `gana certify` obligatoria

### Comando

```bash
pnpm gana certify --profile ci-smoke
```

### Pipeline

```text
1. cargar replay fixture
2. correr fixtures
3. correr odds replay
4. correr research mock/replay
5. correr score
6. correr parlay
7. correr validation
8. exportar evidence pack
9. comparar manifest contra golden
10. fallar si hay secrets, web vacio, prediction sin evidence o action mutante sin approval
```

### Reglas de fallo

- credencial real detectada;
- red live detectada;
- evidence pack ausente;
- manifest cambia sin razon documentada;
- prediction sin evidence IDs;
- `web required` sin sources;
- tool mutante sin approval;
- secreto en logs/artifacts;
- costo supera budget;
- run no deterministico en replay.

### Aceptacion

- CI corre `pnpm gana certify --profile ci-smoke` sin credenciales reales.
- Manifest hash es deterministico ante misma replay fixture.
- Cambio en prompt version dispara regresion documentada o falla.

---

# P1 - Alineacion fuerte

## P1.6 Trace/span por run

### Modelo

Mantener `events.jsonl` y agregar `spans.jsonl`:

```ts
type HarnessSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  taskId?: string;
  name: string;
  kind: 'llm' | 'tool' | 'provider' | 'db' | 'retrieval' | 'policy' | 'gate';
  startedAt: string;
  endedAt?: string;
  status: 'ok' | 'error' | 'blocked' | 'pending_approval';
  inputHash?: string;
  outputHash?: string;
  cost?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    estimatedUsd?: number;
  };
  metadataRedacted: unknown;
};
```

### Spans obligatorios

`fixtures.fetch`, `odds.fetch`, `research.agent_call`, `research.web_search`, `score.agent_call`, `policy.evaluate`, `approval.request`, `tool.execute`, `parlay.build`, `validation.settle`, `evidence_pack.export`.

### Aceptacion

- Cada run tiene un `traceId` unico y todos los steps cuelgan de el.
- Spans cubren llm calls, tool calls, retrievals, policy y gates.
- Costos y latencias quedan registrados por span.

---

## P1.7 Evidence pack v2

### Manifest

```json
{
  "manifestVersion": 2,
  "run": {},
  "inputs": {},
  "providers": {},
  "sources": [],
  "claims": [],
  "evidenceItems": [],
  "predictions": [],
  "parlays": [],
  "validations": [],
  "approvals": [],
  "gates": [],
  "hashes": {},
  "reproduction": {
    "command": "pnpm gana run --date ... --provider replay",
    "profile": "ci-smoke"
  }
}
```

### Aceptacion

- Manifest v2 es generado por todo run promovible.
- Reproduction command reproduce el run en replay y produce hashes equivalentes.
- Approvals y gates aparecen como secciones explicitas y enlazan a audit log.

---

## P1.8 Retrieval formal

### Modulos

```text
src/retrieval/
  index.ts
  corpus.ts
  bm25.ts
  hybrid.ts
  rerank.ts
  freshness.ts
  provenance.ts
```

### Reglas

Para Gana v9 no se requiere vector DB inicial. Empezar con:

- BM25/local search sobre evidence packs;
- busqueda por fixture/team/market;
- ranking por frescura;
- ranking por tipo de fuente;
- bloqueo si la fuente esta vieja para un fixture futuro;
- citations obligatorias desde `sourceId`.

Ejemplo de gate:

```ts
if (source.type === 'odds' && ageMinutes > 60 && fixture.status === 'scheduled') {
  gate.block('stale odds source');
}
```

### Aceptacion

- Toda claim tiene al menos un `sourceId` rankeado.
- Gate bloquea ejecucion con sources stale segun tipo y estado de fixture.
- `web required` sin fuentes frescas falla certify.

---

## P1.9 Skills versionadas

### Estructura

```text
skills/
  research-fixture-v1/
    skill.json
    prompt.md
    output.schema.json
    tests/
  score-prediction-v1/
  build-parlay-v1/
  validate-settlement-v1/
```

### Skill manifest

```json
{
  "id": "research-fixture",
  "version": "v1",
  "purpose": "Collect evidence for a football fixture before scoring",
  "inputs": ["fixture", "oddsSnapshot", "sourcePolicy"],
  "trustedContext": ["api-football snapshot", "stored evidence"],
  "untrustedContext": ["web snippets"],
  "outputSchema": "research-bundle.schema.json",
  "evals": ["web-required-blocks-empty-sources", "claims-have-evidence"]
}
```

### Aceptacion

- Cambio de prompt sin bump de version falla certify.
- Cada skill tiene tests dedicados en `skills/<id>/tests/`.
- Drift detectado entre versiones se reporta en evidence pack.

---

# P2 - Madurez production-grade

## P2.11 OpenTelemetry o exportador compatible

- Mantener JSONL local como fuente.
- Diseñar contrato de spans/eventos exportable a OTel.
- Capturar prompts/completions, costo, anomaly detection, feedback, sampling y retention.

---

## P2.12 Governance scorecard por run

```json
{
  "secretsRedacted": true,
  "mutationsApproved": true,
  "networkPolicyRespected": true,
  "evidenceCoverage": 0.92,
  "predictionSchemaValid": true,
  "costWithinBudget": true,
  "validationLinked": true,
  "replayable": true
}
```

- Adjuntar a evidence pack v2.
- Falla certify si algun campo obligatorio es `false`.

---

## P2.13 Dashboard como visor read-only

- TUI primero, dashboard despues.
- `src/dashboard` solo expone runs, traces, artifacts y validations.
- No se permite que el dashboard escriba en runtime, apruebe acciones, mute artifacts o reemplace la TUI/CLI como control plane.

---

# P3 - Calidad analitica de predictions y parlays

Esta capa convierte el harness en un producto analitico defendible. Es complementaria a P0/P1/P2: el harness puede ser perfecto y aun asi producir predictions ruidosas si la entrada no se procesa, el modelo no se calibra, los parlays no controlan correlacion y la validacion no aporta feedback. Toda esta capa respeta la regla del proyecto: artifacts analiticos, no recomendacion de apuesta. Las metricas tipo `roiHipotetico` y `clv` se exportan como `tracking-only` con disclaimer en evidence pack.

## P3.14 Devig + fair price + market efficiency

### Problema

Las odds entran al pipeline como cuota cruda de un solo bookmaker. Comparar `modelProbability` contra `1 / odds` sin remover el vig es comparar contra mercado mas margen.

### Cambios

- Snapshot multi-bookmaker (>=3) por `(fixture, market, selection)`.
- Implementar devig por proporcionalidad y por shin/power method en `src/markets/devig.ts`.
- Producir `marketImpliedProbability`, `marketFairProbability`, `overround` y `consensusFairOdds` ponderados por liquidez.
- `marketEfficiencyScore` por mercado: dispersion entre bookmakers, conteo de bookmakers, `overround`, freshness.

### Aceptacion

- Toda `OddsSnapshot` se persiste con `overround` y `fairPrice` por seleccion.
- Mercados con menos de N bookmakers o con `marketEfficiencyScore` debajo de umbral quedan marcados `low-liquidity` y bloquean promocion.
- Test unit: devig de mercado simetrico produce probabilidades que suman 1 dentro de tolerancia.

---

## P3.15 Prediction probabilistica + edge gate + calibracion

### Contrato

```ts
type Prediction = {
  fixtureId: string;
  market: MarketKey;
  selection: string;
  modelProbability: number;       // 0..1
  marketImpliedProbability: number;
  marketFairProbability: number;
  edge: number;                   // model - fair
  confidenceBand: 'low' | 'medium' | 'high';
  rationaleClaims: ClaimId[];
  blockers: string[];
  promotable: boolean;
  promptVersion: string;
  modelId: string;
};
```

### Reglas

- `verdict` textual sigue existiendo pero la decision se toma sobre `edge` y `confidenceBand`.
- Edge minimo configurable por mercado y persistido por `prompt-version`:
  - `1X2`: medium >= 3%, high >= 6%.
  - `Over/Under`: medium >= 4%, high >= 7%.
  - `BTTS`: medium >= 5%, high >= 8%.
  - Player props / corners / cards: medium >= 6%, high >= 10%, mas datos especificos obligatorios.
- Calibracion explicita con isotonic regression o Platt scaling sobre output del modelo, almacenada por `(market, prompt-version)`.

### Edge gate (gates duros antes de promover)

- `modelProbability < marketFairProbability` -> `blockers += ['no-edge']`.
- `confidenceBand === 'low'` -> no promovible.
- linea movida contra el pick > umbral -> `blockers += ['stale-pick']`.
- XI no confirmado en mercado dependiente -> `blockers += ['lineup-pending']`.
- `evidenceCoverage < umbral` -> `blockers += ['evidence-thin']`.
- mercado `low-liquidity` -> `blockers += ['low-liquidity']`.

### Aceptacion

- Toda prediction lleva probabilidad calibrada y bandera `promotable` calculada deterministicamente.
- Prediction con cualquier blocker no entra a parlay builder.
- Test unit: edge gate con cada blocker individual marca prediction como no promovible.
- Test unit: calibracion isotonic ajustada sobre golden corpus produce monotonicidad por bin.

---

## P3.16 Gates de lineup y line movement

### Lineup confirmation gate

- Mercados sensibles a XI: `over_under_goals`, `btts`, props de jugador, ratings.
- Si XI no confirmado y kickoff < 90 minutos: `blockers += ['lineup-pending']`.
- Si baja clave detectada despues de research: emitir `evidence.invalidated` y bloquear hasta refresco.

### Line movement gate

- Snapshots de odds en T-24h, T-6h, T-1h y closing si hay tiempo.
- `lineMovementVelocity` calculado por seleccion.
- Si la linea se mueve mas de X% contra el pick desde el snapshot del research: `blockers += ['stale-pick']` hasta nuevo snapshot.
- Persistir `lineOpen`, `lineNow`, `lineClose` (cuando exista) en `OddsSnapshot`.

### Aceptacion

- Test integracion: pick con linea movida 8% queda bloqueado y reactivado cuando entra nuevo snapshot favorable.
- Test integracion: research de prop sin XI confirmado es bloqueado y libera al confirmar XI.

---

## P3.17 Ensemble multi-proveedor y deteccion de desacuerdo

### Reglas

- Toda skill critica (`research-fixture`, `score-prediction`) puede correrse con dos proveedores agentic distintos (Codex + Gemini, por ejemplo).
- Combinador con pesos por performance historica (mantenido por `analytics/leaderboard`).
- Acuerdo en selection -> `confidenceBand` no degrada.
- Desacuerdo en selection -> `confidenceBand` degrada un nivel.
- Probabilidades muy distintas (delta > 15 puntos) -> emitir `model.disagreement`, marcar `blockers += ['model-disagreement']`.

### Aceptacion

- Spans incluyen los dos proveedores y la decision del ensemble.
- Test integracion: dos predictions con probabilidades 0.55 y 0.78 producen `model-disagreement`.

---

## P3.18 Parlay correlation, candidate generator y ranker

### Problema

Multiplicar probabilidades de legs como si fueran independientes es el error mas comun. Mismo fixture y mercados correlacionados (1X+Over, BTTS+Over, mismo equipo en handicap y total) sobrestiman la probabilidad conjunta.

### Modelo de correlacion

- `src/parlay/correlation.ts` con matriz empirica precomputada por pares de mercados, ajustable por liga.
- Para legs en el mismo fixture: estimar joint probability con un Dixon-Coles ligero o lookup en la matriz.
- Para legs en fixtures distintos: asumir independencia salvo factor compartido detectado (mismo arbitro, misma copa, condiciones meteorologicas).

### Candidate generator

```ts
type ParlayCandidate = {
  parlayId: string;
  legs: PredictionId[];
  combinedFairProbability: number;
  combinedMarketOdds: number;
  combinedFairOdds: number;
  expectedEdge: number;
  correlationPenalty: number;
  diversityScore: number;
  riskScore: number;
  reason: 'top-ev' | 'low-variance' | 'high-conviction' | 'rejected';
  blockers: string[];
};
```

### Reglas duras

- max N legs (default 4, configurable).
- max 1-2 legs por liga.
- max 1 leg por equipo.
- prohibido dos legs del mismo fixture salvo que la matriz de correlacion provea joint probability fiable.
- prob conjunta minima: parlay con `combinedFairProbability < 5%` queda como `low-conviction`, no `top-ev`.
- cuota maxima de parlay configurable (default 50.0); arriba de ese umbral, marcado `lottery-ticket` y bloqueado.

### Ranker

- Ordena candidatos por `expectedEdge - riskWeight * riskScore`.
- Devuelve hasta tres parlays con perfiles distintos: `top-ev`, `low-variance`, `high-conviction`.
- Si ningun candidato pasa los gates, el run termina con `handoff.parlay = no-parlay-today` y razon detallada.

### Aceptacion

- Test unit: parlay con dos legs `1X` y `Over 0.5` del mismo fixture aplica correlacion y degrada `expectedEdge`.
- Test unit: 5 legs todos del mismo equipo es bloqueado por diversidad.
- Test integracion: run sin candidatos validos produce handoff `no-parlay-today` reproducible.

---

## P3.19 Validation analytics y leaderboard

### Metricas obligatorias por run

- Brier score por mercado.
- Log loss por mercado.
- ROI hipotetico marcado `tracking-only-not-betting` por confidenceBand.
- CLV % cuando exista `lineClose`.
- Hit rate por confidenceBand.
- EV realizado vs EV esperado por parlay.

### Calibration plot

- Bins de 10 puntos sobre `modelProbability` vs frecuencia observada.
- Almacenado por `(market, prompt-version, modelId)` en `src/analytics/calibration-plot.ts`.
- Adjuntado al evidence pack v2 cuando aplique.

### Leaderboard interno

```text
prompt-version | modelo | mercado | liga | brier | logloss | clv% | hitrate | n
```

- Persistido en DB (`leaderboard_entries`) y exportado como artifact.
- Comando: `pnpm gana leaderboard --since YYYY-MM-DD --by prompt|model|market|league`.

### Reglas de evaluacion honesta

- Reportar siempre `n` (tamano de muestra) y banda de confianza.
- No tunear umbrales sobre la misma ventana usada para reporte: holdout obligatorio en `src/analytics/holdout.ts`.
- Toda mejora de prompt o umbral se valida en holdout antes de promover, registro en `evals/`.

### Aceptacion

- Run replay produce calibration plot y leaderboard entries reproducibles.
- Holdout set congelado se mantiene fuera de tuning.
- Test integracion: muestra `n < 30` produce reporte con flag `low-sample`.

---

## P3.20 Disciplina no-jugar y handoff `no-parlay-today`

### Default

El default de un run no es "promover el mejor parlay disponible", es **no promover salvo que se cumpla la suma de gates**:

- >=N predictions con `confidenceBand: 'high'`.
- todas con edge positivo y sin blockers.
- correlacion controlada por la matriz.
- manifest hash deterministico.
- certify pass.

### KPI obligatorio

- `% de runs sin parlay promovido` se reporta por dia/semana/mes en `pnpm gana stats`.
- Un sistema sano dice "hoy no" la mayoria del tiempo. Valor objetivo no se fija aqui, pero se monitorea para detectar overpromote.

### Disclaimer reforzado

- Cada `handoff.md` incluye: "uso analitico, no constituye recomendacion de apuesta, no garantiza resultado".
- Evidence pack v2 incluye `analyticalOnly: true` y `monetaryActions: 'forbidden-by-policy'`.
- Lista de palabras clave (`bet`, `stake`, `wager`, `apostar`, `colocar`) en input/output activa `policy.evaluate` con `blocked` y emite audit event.

### Aceptacion

- Test integracion: corpus replay con todos los gates positivos promueve parlay.
- Test integracion: corpus replay con `low-liquidity` en uno de los legs produce `no-parlay-today`.
- Certify falla si `handoff.md` o evidence pack carecen del disclaimer.

---

# Matriz de alineacion por capas de la guia

| Capa                | Estado                                                           | Brecha                                                                             | Prioridad |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 1. Instruction      | Prompts research/scoring, guard contra acciones monetarias       | Prompt library formal, prompt hash, Skills, spotlighting de contenido no confiable | Alta      |
| 2. Tools            | Tools locales con schemas Zod y policy wrapper                   | Approval real, dry-run, idempotency, server tools gobernados, schemas mas seguros  | Critica   |
| 3. Memory/Retrieval | Evidence, sources, claims, bundles                               | Retrieval engine, freshness, ranking, provenance obligatoria, memory decay         | Alta      |
| 4. Execution        | Pipeline canonico y artifacts                                    | Scheduler/dispatcher/recovery real, queue durable, egress allowlist, filesystem policy | Critica   |
| 5. Policy/Approval  | Metadata, redaccion, audit, perfiles `standard`/`full-permissions` | Pausa/reanuda approval, RBAC/principal, approvals en DB, policy para server tools  | Critica   |
| 6. Observability    | Event types, JSONL, audit, snapshots                             | Trace/span jerarquico, costos, tokens, latency, retries, anomaly detection         | Alta      |
| 7. Evaluation       | Unit tests y planes de certification                             | Eval harness, golden fixtures, trajectory eval, safety evals, `gana certify` real  | Critica   |

## Apendice: capa de calidad analitica (no esta en la guia, es del dominio Gana)

| Sub-capa                  | Estado                              | Brecha                                                                              | Prioridad |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| Market data (devig/fair)  | Odds crudas un solo bookmaker       | Multi-bookmaker, devig, fair price, market efficiency, line movement                | Critica   |
| Prediction probabilistica | Verdict textual                     | Probabilidad calibrada, edge gate, blockers, confidenceBand, calibracion isotonic   | Critica   |
| Lineup/line gates         | No existen                          | Lineup confirmation, stale-pick detection                                           | Alta      |
| Ensemble                  | Provider unico                      | Ensemble multi-proveedor, deteccion de desacuerdo, pesos por performance            | Alta      |
| Parlay correlation        | Multiplicacion como independientes  | Modelo de correlacion, candidate generator, ranker, variantes, diversidad           | Critica   |
| Validation analytics      | Settlement basico                   | Brier, log loss, CLV, calibration plot, leaderboard, holdout                        | Alta      |
| Disciplina no-jugar       | No formalizada                      | Default `no-parlay-today`, KPI de % no promovido, disclaimer reforzado en artifacts | Critica   |

---

# Orden congelado de PRs

```text
PR-14 Tool registry unico                          (P0.1)
PR-15 Approval real con pausa/reanudacion          (P0.2)
PR-16 Shell/file/egress/filesystem policy          (P0.3)
PR-17 Trace/span runtime                           (P1.6)
PR-18 Evidence pack v2                             (P1.7)
PR-19 Certification smoke `gana certify`           (P0.5)
PR-20 HarnessTask dispatcher/recovery              (P0.4)
PR-21 Retrieval formal                             (P1.8)
PR-22 Skills versionadas                           (P1.9)
PR-23 OpenTelemetry exportador opcional            (P2.11)
PR-24 Governance scorecard + dashboard visor       (P2.12 + P2.13)
PR-25 Devig + fair price + market efficiency       (P3.14)
PR-26 Prediction probabilistica + edge gate        (P3.15)
PR-27 Gates lineup y line movement                 (P3.16)
PR-28 Ensemble multi-proveedor + disagreement      (P3.17)
PR-29 Parlay correlation + candidate generator     (P3.18)
PR-30 Validation analytics + leaderboard + holdout (P3.19)
PR-31 Disciplina no-jugar + disclaimer reforzado   (P3.20)
```

Dependencias clave:

- PR-14 a PR-16 deben mergear antes que PR-17 a PR-19.
- PR-20 puede iniciar en paralelo con PR-17 si el tool registry ya esta congelado.
- PR-22 (Skills versionadas) puede correr en paralelo despues de PR-14 (registry) y PR-19 (certify), porque el bump de version se valida en certify.
- PR-25 (devig) es prerequisito de PR-26 (edge gate) y de PR-29 (parlay con `combinedFairProbability`).
- PR-26 es prerequisito de PR-29 y de PR-30 (no se puede medir Brier/CLV sobre verdict textual).
- PR-28 (ensemble) puede correr en paralelo con PR-26 si la probabilidad calibrada ya esta congelada.
- PR-31 (disciplina no-jugar) es ultimo: agrupa los gates de P3.14-P3.19 en el default del run.

---

# Restricciones de alcance

Incluido:

- Approval real con persistencia, pausa y reanudacion.
- Tool registry unico para tools locales y server-native (proveedores agentic).
- Pipeline durable basado en `HarnessTask`.
- Egress allowlist y reglas de filesystem aplicadas como policy en las tools.
- Trace/span jerarquico con costos.
- Evidence pack v2 con secciones explicitas y reproduction command.
- Eval harness `gana certify --profile ci-smoke`.
- Retrieval formal con BM25, frescura y provenance obligatoria.
- Skills versionadas con tests, drift detection y bump obligatorio por cambio de prompt.
- Devig + fair price multi-bookmaker como entrada canonica de odds.
- Prediction probabilistica calibrada con `edge`, `confidenceBand`, `blockers` y gates duros antes de promover.
- Lineup gate y line movement gate como bloqueadores explicitos.
- Ensemble multi-proveedor con deteccion de desacuerdo.
- Parlay con modelo de correlacion, candidate generator, ranker y variantes (`top-ev`, `low-variance`, `high-conviction`).
- Validation analytics con Brier, log loss, CLV, calibration plot, leaderboard y holdout.
- Disciplina no-jugar: default `no-parlay-today` cuando faltan condiciones, con disclaimer reforzado.

Fuera:

- Vector DB obligatoria desde el inicio.
- Sandbox real con aislamiento por proceso o tarea (Firecracker/gVisor o equivalente). Gana v9 confia en tool registry, approval real, redaccion, allowlist de comandos y reglas de filesystem/egress como policy. Reabrir solo si aparece uno de estos disparadores: ejecucion no supervisada en cloud, multi-tenant, multi-worker en la misma maquina con cargas de varios runs en paralelo, o introduccion de un tool que ejecute codigo arbitrario fuera de los proveedores agentic.
- MCP server como frontera de integracion. Gana v9 es TUI/CLI single-user local; TUI, CLI, agente y certify ya comparten el mismo tool registry y policy engine, no hace falta exponer una superficie adicional. Reabrir solo si aparece uno de estos disparadores: integracion estable con un cliente externo (otra IDE, otro agente, dashboard separado) que necesite hablar con Gana via protocolo estandar; necesidad de exponer recursos `gana://...` a un tercero auditado; o decision de producto de ofrecer Gana como backend de otros agentes.
- Dashboard web como control plane.
- API publica obligatoria.
- Multi-worker deployment como prerequisito.
- Apuestas monetarias, casas de apuestas o movimiento de fondos.
- Dependencia estrategica de OpenRouter como runtime, model registry o proveedor de tools.
- Modelos cuantitativos pesados tipo XGBoost/red neuronal entrenados localmente: la calidad analitica de Gana v9 se apoya en devig, calibracion ligera (isotonic/Platt), correlacion empirica y disciplina de gates, no en modelos propios entrenados desde cero. Reabrir solo si el leaderboard demuestra estancamiento sostenido pese a mejoras de prompts y ensembles.
- Recomendaciones de apuesta, tips, picks o cualquier salida que se pueda interpretar como consejo financiero. Las metricas tipo `roiHipotetico` y `clv` se exportan unicamente como `tracking-only-not-betting` con disclaimer obligatorio.

---

# Criterios de aceptacion globales

- Ninguna tool entra al agente sin metadata, schema, policy, redaccion, audit, timeout y clasificacion de riesgo.
- `file_write`, `file_edit`, `shell`, `artifact_promote` y `prediction_promote` quedan pendientes en approval pending y se reanudan sin perder contexto.
- Egress fuera de allowlist y escritura fuera de `.artifacts/` quedan bloqueados a nivel de tool.
- `executeRunPipeline` puede interrumpirse y reanudarse usando `HarnessTask`.
- `pnpm gana certify --profile ci-smoke` corre sin credenciales reales y compara contra golden manifest.
- Evidence pack v2 incluye sources, claims, predictions, validations, approvals, gates, hashes y reproduction command.
- Spans cubren llm calls, tool calls, retrievals, policy decisions y gates.
- Retrieval bloquea sources stale y exige `sourceId` por claim.
- OpenRouter queda solo como compatibilidad; no como runtime ni proveedor de tools.
- Restriccion monetaria sigue activa: el sistema produce artifacts analiticos, no ejecuta apuestas, no mueve fondos y no presenta resultados como garantia.
- Toda `OddsSnapshot` lleva multi-bookmaker, `overround` y `fairPrice` por seleccion; mercados sin minimo de bookmakers o por debajo del `marketEfficiencyScore` umbral no son promovibles.
- Toda `Prediction` lleva `modelProbability`, `marketFairProbability`, `edge`, `confidenceBand`, `blockers` y `promotable` calculado deterministicamente.
- Toda promocion de prediction o parlay tiene cero `blockers`, edge positivo, sources frescas y, cuando aplica, XI confirmado y linea estable.
- Parlays se construyen con modelo de correlacion explicito; legs del mismo fixture sin joint probability fiable son rechazados.
- Validation produce Brier, log loss, CLV (cuando aplica), calibration plot y leaderboard entries; holdout set permanece fuera del tuning.
- El default de un run sin condiciones suficientes es `handoff.parlay = no-parlay-today`, no un parlay degradado.
- Cada `handoff.md` y evidence pack contienen disclaimer explicito de uso analitico; certify falla si falta.

# Pruebas

- Unit tests por modulo nuevo (`registry`, `approval-store`, `scheduler`, `dispatcher`, `recovery`, `idempotency`, `bm25`, `freshness`, `provenance`, `devig`, `fair-price`, `edge-gate`, `calibration`, `correlation`, `candidate-generator`, `ranker`, `brier`, `logloss`, `clv`, `calibration-plot`, `holdout`).
- Property-based tests (fast-check) en normalizacion de markets, devig y agregacion de probabilidades.
- Integration tests:
  - approval requested -> approved -> executed con mismo `toolCallId`;
  - approval requested -> denied no ejecuta y emite `approval.denied`;
  - run interrumpido en `score.fixture` se reanuda sin reejecutar `fixtures.fetch`;
  - lease vencido se recupera y aumenta `attempts`;
  - `dangerous_shell` sin approval no ejecuta;
  - retrieval bloquea source stale segun tipo/edad/estado de fixture;
  - prediction con `low-liquidity` no entra a parlay;
  - parlay con dos legs correlacionados del mismo fixture aplica penalizacion y degrada `expectedEdge`;
  - parlay con 5 legs todos del mismo equipo es rechazado por diversidad;
  - ensemble con probabilidades 0.55 y 0.78 emite `model-disagreement`;
  - linea movida 8% contra el pick bloquea promocion hasta nuevo snapshot;
  - prop con XI no confirmado bloquea hasta confirmacion;
  - run sin candidatos validos produce `no-parlay-today` reproducible.
- Certification:
  - `pnpm gana certify --profile ci-smoke` deterministico sobre replay fixture;
  - manifest hash estable;
  - secret leak en log/artifact rompe certify;
  - prediction sin evidence rompe certify;
  - prediction sin `edge` o sin `confidenceBand` rompe certify;
  - tool mutante sin approval rompe certify;
  - handoff sin disclaimer rompe certify;
  - calibration plot fuera de tolerancia sobre golden corpus rompe certify.
- Acceptance manual:
  - `/approval pending` lista pendientes redacted;
  - `/approve APPROVAL_ID` reanuda la accion original;
  - `pnpm gana approve APPROVAL_ID` funciona en headless;
  - run completo en `replay` produce evidence pack v2 reproducible;
  - `pnpm gana leaderboard --since YYYY-MM-DD --by prompt|model|market|league` produce reporte con `n` y banda de confianza;
  - run con condiciones insuficientes muestra `no-parlay-today` con razones detalladas en TUI.

# Riesgos

- Approval real introduce estado adicional: persistir en DB y en `audit-log.jsonl` para evitar inconsistencias.
- Sin sandbox real, la defensa depende de tool registry, approval, redaccion, allowlist de comandos y reglas de filesystem/egress como policy. Documentar este limite en el README del MVP y revisar la decision si aparece alguno de los disparadores listados en "Fuera de alcance".
- Tool registry unico puede romper integraciones existentes con OpenRouter; mantener `openrouter` solo como compatibilidad y no como runtime.
- Trace/span agrega volumen a `.artifacts`; aplicar sampling y retention desde el inicio.
- Skills versionadas requieren disciplina de bump; sin esto, drift de prompt no se detecta y certify pierde valor.
- Evidence pack v2 cambia el contrato de manifest; congelar `manifestVersion: 2` y mantener migracion explicita desde v1.
- Devig sin suficientes bookmakers produce `fairPrice` sesgado; aplicar umbral minimo de bookmakers y marcar mercados pobres como `low-liquidity` para no contaminar el edge gate.
- Calibracion isotonic puede sobreajustar con muestras pequenas; reportar siempre `n` y mantener el ajuste por `(market, prompt-version)` con holdout.
- Modelo de correlacion de parlay es la pieza mas frágil: empezar con matriz empirica conservadora y solo refinarla cuando haya volumen historico suficiente. Subestimar correlacion infla el edge esperado.
- Ensemble multi-proveedor multiplica costo de tokens; combinar con budgets y cost-aware routing para no descontrolar el gasto.
- `roiHipotetico` y CLV pueden interpretarse como recomendacion si se publican fuera de contexto; mantener disclaimer en todo artifact y bloquear cualquier output que use lenguaje de apuesta.
- Look-ahead leakage es un riesgo silencioso: toda evidencia y stat debe llevar `availableAt`, y la skill debe filtrar por kickoff. Una sola fuga invalida el leaderboard historico.
- Confirmation bias: si el prompt de research conoce el `verdict` antes de buscar, encontrara evidencia para sustentarlo. Mantener separacion de fases research/score y evals que detecten correlacion sospechosa entre prompt e input.
