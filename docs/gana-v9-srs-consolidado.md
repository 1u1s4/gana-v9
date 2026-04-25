# Gana v9 — SRS Consolidado Harness/TUI

**Estado:** draft consolidado canónico  
**Fecha:** 2026-04-25  
**Owner:** Luis / Jo  
**Alcance:** requisitos de producto y sistema para Gana v9 como harness operativo completamente basado en TUI, con integración necesaria hacia API-Football y backend durable de base de datos en DigitalOcean para modo `release-grade`.

---

## 0. Decisión de consolidación

Gana v9 debe construirse como un **harness local, auditable y TUI-first**. La interfaz primaria no será un dashboard web ni una API pública, sino una terminal operativa que permita ejecutar el ciclo completo de predicción deportiva con trazabilidad, evidencia, aprobación explícita y artifacts reproducibles.

La consolidación resuelve una tensión importante entre los dos SRS originales:

- El sistema debe seguir siendo **offline-first** para desarrollo, pruebas, certificación y smoke tests.
- El sistema también debe tener conexiones reales y necesarias hacia:
  - **API-Football**, como provider deportivo externo para fixtures, odds, resultados y cuota.
  - **DigitalOcean Managed Database**, como backend durable para operaciones `release-grade`.

Por tanto, la decisión canónica es:

> `mock` y `replay` no requieren red, secretos ni base de datos externa.  
> `live-readonly` requiere provider deportivo real, preferentemente API-Football, pero no publica ni muta resultados.  
> `release-grade` requiere API-Football, base de datos durable en DigitalOcean, evidence pack completo, approval explícito y validación focalizada.

La web, el dashboard y una API HTTP pública quedan fuera del MVP operativo. Pueden agregarse después como superficies secundarias, siempre leyendo el mismo modelo de dominio y los mismos artifacts del harness.

---

## 1. Propósito

Gana v9 es una plataforma compacta de predicción deportiva orientada a operar, auditar y validar decisiones desde una TUI local. Su producto principal es el harness: un runtime reproducible que permite correr flujos de datos, generar predicciones, construir parlays, validar resultados y producir evidence packs.

El ciclo canónico de operación es:

```text
fixture -> odds -> research evidence -> scoring -> prediction candidate -> parlay candidate -> validation artifact
```

El sistema debe conservar las mejores lecciones de versiones anteriores:

- De v6: command center visual, selección batch, logs vivos, date rail y consola densa.
- De v7: ETL autónomo, atómicas/parlays, queue durable, validation y contratos value-focused.
- De v8: repo-as-harness, evidence packs, research gates, runtime durable, goldens, runbooks y disciplina de promotion.
- De `create-agent-tui`: separación entre config, agent runner, tools, renderer, sessions y slash commands.

La meta es evitar la dispersión: no comenzar con una plataforma web distribuida, muchos servicios, múltiples providers obligatorios o dependencias externas innecesarias.

---

## 2. Principios de producto

### 2.1 TUI-first

La TUI es la interfaz primaria. El operador debe poder abrir el sistema desde terminal, revisar fixtures, correr el pipeline, inspeccionar evidencia, aprobar acciones y exportar handoffs sin depender de navegador.

### 2.2 Harness-first

El producto base es un harness operativo. La TUI envía comandos y renderiza eventos; el runtime ejecuta; el dominio calcula; el storage persiste; los adapters hablan con servicios externos.

### 2.3 Offline-first para smoke, replay y desarrollo

El sistema debe poder correr sin API-Football, sin DigitalOcean, sin OpenAI/Codex real, sin web search y sin navegador. Para eso deben existir fixtures locales, provider mock, replay packs y goldens determinísticos.

### 2.4 Release-grade con conexiones reales

Aunque el smoke sea offline, una corrida `release-grade` debe usar infraestructura real:

- API-Football para datos deportivos live-readonly.
- Base de datos durable en DigitalOcean para persistencia de entidades operativas.
- Evidence pack completo.
- Approval explícito antes de promotion.
- Validación focalizada.

### 2.5 Evidencia antes de promoción

Toda decisión publicable debe enlazar fuente, evidencia, AI run, versión de prompt, snapshot de datos y artifact de validación. Si falta evidencia, el resultado debe quedar `review-required` o `blocked`, nunca como éxito silencioso.

### 2.6 Menos APIs, mejores adapters

API-Football, Codex/OpenAI, web research y DigitalOcean DB deben ser adapters aislados. El core no debe depender directamente de credenciales o SDKs externos.

### 2.7 Runtime único

El MVP no debe dividirse entre control planes, workers externos y dashboards. Debe existir un solo entrypoint conceptual: el harness Gana v9.

### 2.8 Seguridad por defecto

Las acciones mutantes requieren approval. Secrets nunca deben imprimirse. Live network está deshabilitado por defecto. El shell debe tener límites y denylist mínima.

---

## 3. Alcance

### 3.1 Incluido en MVP

- TUI local como superficie principal.
- CLI headless para todos los flujos principales.
- Runtime compacto de harness.
- Provider mock determinístico.
- Provider replay/golden.
- Adapter Codex/OpenAI para agente real.
- Adapter API-Football para fixtures, odds, resultados y cuota.
- Storage local `.gana/` para sesiones, artifacts y runs.
- Backend durable con Prisma y base de datos en DigitalOcean para `release-grade`.
- Sessions JSONL append-only.
- Event bus/logs estructurados.
- Task queue local con dedupe, retries y locks básicos.
- ETL de fixtures/odds.
- Selección de candidatos.
- Research estructurado con gates.
- Predicciones atómicas determinísticas y/o asistidas por agente.
- Builder determinístico de parlays.
- Validación de predicciones y parlays con reglas versionadas.
- Evidence packs por run.
- Evaluation verdict: `promotable`, `review-required`, `blocked`.
- Handoff exportable.
- Approval policy para tools locales y acciones mutantes.
- Certification smoke sin credenciales reales.

### 3.2 Fuera del MVP

- Dashboard web obligatorio.
- API HTTP pública obligatoria.
- Multi-worker deployment.
- Scheduler, dispatcher y recovery como procesos separados.
- Multiproveedor LLM obligatorio.
- OpenRouter como dependencia obligatoria.
- Groq vision.
- Heroku management.
- Image generation.
- JS REPL.
- Web fetch genérico como tool libre.
- Simulador Monte Carlo como core.
- Charts web complejos.
- Legacy compatibility layer.
- Publicación automática de predicciones/parlays sin approval.
- Mercados experimentales como corners sin feature flag.

---

## 4. Usuarios y modos de operación

### 4.1 Usuario primario: operador técnico

Ejecuta, inspecciona y valida predicciones deportivas desde terminal. Necesita evidencia auditable, no solo output narrativo.

### 4.2 Agente implementador

Usa el harness para ejecutar tareas reproducibles, guardar evidencia y saber si un cambio es promotable.

### 4.3 Evaluador agentic

Lee artifacts, compara contra goldens y emite verdict claro: `promotable`, `review-required` o `blocked`.

### 4.4 Modos requeridos

#### `mock`

- No usa red ni secretos.
- Sirve para desarrollo rápido, tests unitarios y CI.
- Usa provider deportivo mock y agent mock.
- Puede persistir en JSONL o SQLite local.

#### `replay`

- Usa fixtures, snapshots y payloads versionados.
- Sirve para regression, certification y golden replay.
- No requiere API-Football ni DigitalOcean.

#### `live-readonly`

- Consulta provider deportivo real, preferentemente API-Football.
- No publica ni muta decisiones.
- Puede escribir artifacts locales del run.
- Puede persistir snapshots en DB si el profile lo permite.
- Debe respetar rate limits, quota y redacción de secrets.

#### `release-grade`

- Requiere DB durable en DigitalOcean.
- Requiere API-Football o provider deportivo real aprobado.
- Requiere evidence pack completo.
- Requiere approval para promotion.
- Requiere validación focalizada.
- Debe registrar run, task, trace, approvals y artifacts.

---

## 5. Arquitectura de alto nivel

### 5.1 Forma recomendada del repo

La versión inicial debe ser compacta. Se recomienda un monorepo mínimo o un solo paquete TypeScript.

Opción compacta preferida:

```text
src/
  cli.ts
  tui/
  runtime/
  providers/
    sports/
      mock/
      replay/
      api-football/
    ai/
      mock/
      codex-openai/
  tools/
  permissions/
  session/
  storage/
    local/
    digitalocean-db/
  domain/
  etl/
  research/
  scoring/
  prediction/
  parlay/
  validation/
  evidence/
  eval/
  config/
fixtures/
  goldens/
  snapshots/
docs/
  srs/
.gana/
  sessions/
  runs/
  evidence-packs/
  state.sqlite o jsonl
```

Opción monorepo mínima:

```text
apps/
  gana-tui/
packages/
  core/
  harness-runtime/
  provider-adapters/
  storage/
fixtures/
  replays/
tests/
  certification/
```

La separación en más apps o paquetes solo debe ocurrir cuando exista una necesidad operacional demostrada.

### 5.2 Capas

#### TUI/CLI

- Entrada del operador.
- Slash commands.
- Render de eventos.
- Paneles operativos.
- Export de sesiones y handoff.

#### Runtime

- Orquestación de runs.
- Task queue local.
- Event bus.
- Cancellation.
- Retries.
- Dedupe.
- Recovery interno.

#### Provider adapters

- Sports mock.
- Sports replay.
- API-Football.
- Agent mock.
- Codex/OpenAI.

#### Domain core

- Fixture.
- Odds snapshot.
- Research evidence.
- Candidate.
- Prediction.
- Parlay.
- Validation.
- Run.
- Artifact.
- Approval.

#### Storage

- Local `.gana/` para sesiones y artifacts.
- JSONL append-only para sesiones y eventos.
- SQLite opcional para smoke.
- DigitalOcean DB para `release-grade`.

#### Evaluation

- Golden replay.
- Evidence completeness.
- Verdict.
- Remediation.
- Handoff.

---

## 6. Integraciones externas obligatorias por profile

### 6.1 API-Football

API-Football debe implementarse como adapter deportivo externo aprobado para `live-readonly` y `release-grade`.

Contrato mínimo:

```ts
interface SportsDataProvider {
  name: string;
  mode: 'mock' | 'replay' | 'api-football-live-readonly';

  listFixtures(input: {
    date: string;
    competitionIds?: string[];
    timezone?: string;
  }): Promise<Fixture[]>;

  getOdds(input: {
    fixtureIds: string[];
    marketKeys?: string[];
  }): Promise<CanonicalMarketSnapshot[]>;

  getFinalResults(input: {
    fixtureIds: string[];
  }): Promise<FinalResult[]>;

  getQuota?(): Promise<QuotaStatus>;
}
```

Requisitos del adapter API-Football:

- Debe estar deshabilitado por defecto en `mock` y `replay`.
- Debe requerir profile explícito para red.
- Debe registrar `provider.requested`, `provider.rate_limited` y `artifact.written`.
- Debe normalizar datos hacia contratos internos, no filtrar payloads crudos a la TUI.
- Debe guardar hashes de payloads relevantes.
- Debe soportar rate limits y backoff.
- Debe mostrar quota de forma redacted cuando esté disponible.
- Debe fallar con mensaje accionable si falta la API key.
- No debe imprimir headers ni tokens.

### 6.2 Backend durable en DigitalOcean DB

La base de datos en DigitalOcean es obligatoria para `release-grade`, pero no para smoke, CI ni replay.

Stack recomendado:

```text
Prisma + MySQL compatible en DigitalOcean Managed Database
```

También puede aceptarse PostgreSQL si se decide al implementar, pero el contrato del SRS asume Prisma como capa de acceso y evita acoplar el dominio a un motor específico.

Requisitos del backend durable:

- Persistir fixtures normalizados.
- Persistir provider snapshots.
- Persistir odds canonicalizadas.
- Persistir research bundles.
- Persistir AI runs.
- Persistir predictions.
- Persistir parlays y legs.
- Persistir validations.
- Persistir harness runs/tasks.
- Persistir approvals.
- Persistir metadata de artifacts.
- Permitir reproducir un run desde snapshots y artifacts.
- No reemplazar los evidence packs locales; debe complementarlos.
- Nunca guardar secrets en tablas de eventos, artifacts o sesiones.

Variables de entorno esperadas:

```bash
GANA_PROFILE=release-grade
DATABASE_URL=...
API_FOOTBALL_KEY=...
OPENAI_API_KEY=... # opcional si no se usa codex-local
CODEX_API_KEY=...  # opcional según adapter
```

Reglas:

- `release-grade` debe fallar si no hay `DATABASE_URL` válida.
- `mock` y `replay` no deben requerir `DATABASE_URL`.
- CI debe poder correr sin DigitalOcean.
- La TUI solo debe mostrar estado redacted: conectado/no conectado, profile, schema version y último health check.

---

## 7. TUI y CLI

### 7.1 TUI principal

La TUI debe adaptar la estructura de `create-agent-tui`, pero con runtime propio:

- `config`: carga profile, auth mode, model, provider mode, artifact root, DB mode y policy.
- `agent`: coordina Codex/OpenAI calls y tool execution.
- `tools`: expone tools read-only y mutating con approval.
- `renderer`: muestra eventos agrupados, streaming, tasks y artifacts.
- `session`: persiste conversaciones y eventos en JSONL append-only.
- `commands`: implementa slash commands operativos.

Debe mostrar como mínimo:

- Workspace status.
- Profile activo.
- Provider deportivo activo: mock/replay/API-Football.
- Provider AI activo: mock/codex-local/api-key.
- DB status: local/offline/DigitalOcean redacted.
- Fecha o ventana operativa.
- Fixtures visibles.
- Runs recientes.
- Pipeline status.
- Logs vivos.
- Approval queue.
- Verdict de evaluación.
- Artifact root.

Layout conceptual:

```text
┌ GANA V9 HARNESS ─────────────────────────────────────────────────────┐
│ profile replay | sports replay | ai mock | db local | workspace safe │
├ OVERVIEW ───────────┬ FIXTURES ──────────────────────────────────────┤
│ matches 12          │ HH:MM league home-away odds status             │
│ odds fresh 10       │ selected / eligible / stale / blocked          │
│ predictions 6       │                                                │
├ PIPELINE ───────────┼ RUN LOG ───────────────────────────────────────┤
│ fixtures -> odds    │ info/warn/error/success                        │
│ research -> score   │ keyed progress updates                         │
│ parlay -> validate  │                                                │
├ APPROVALS ──────────┼ ARTIFACTS ─────────────────────────────────────┤
│ pending 0           │ evidence-pack/run-id                           │
├ EVALUATION ─────────┴────────────────────────────────────────────────┤
│ verdict review-required | next action ...                            │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 Slash commands requeridos

```text
/help       Lista comandos y modos.
/new        Inicia sesión nueva.
/session    Muestra metadata, artifact root, usage y auth/db status redacted.
/sessions   Lista sesiones recientes.
/provider   Muestra o cambia provider deportivo/AI permitido por profile.
/model      Cambia modelo dentro del registry local permitido.
/tools      Lista herramientas y permisos.
/approval   Muestra approvals pendientes y decisiones recientes.
/run        Ejecuta un flujo o step del harness.
/validate   Corre validación focalizada.
/certify    Corre certification smoke/regression.
/export     Exporta sesión a Markdown y JSONL.
/exit       Cierra la TUI.
```

### 7.3 CLI headless

Todo flujo principal debe poder ejecutarse sin TUI.

Comandos requeridos:

```bash
pnpm gana
pnpm gana init
pnpm gana tui
pnpm gana fixtures --date YYYY-MM-DD --provider mock|replay|api-football
pnpm gana odds --date YYYY-MM-DD --provider mock|replay|api-football
pnpm gana research --fixture-id ID --web disabled|auto|required
pnpm gana score --fixture-id ID
pnpm gana parlay --date YYYY-MM-DD
pnpm gana validate --date YYYY-MM-DD
pnpm gana run --fixture-set fixtures/goldens/demo.json
pnpm gana replay --run-id <id>
pnpm gana eval --run-id <id>
pnpm gana export-handoff --run-id <id>
pnpm gana certify --profile ci-smoke
```

Checks recomendados:

```bash
pnpm check:fast
pnpm check:harness
pnpm check:release
```

`check:release` puede requerir API-Football, DigitalOcean DB y credenciales reales. No debe ser requisito para iteración diaria.

---

## 8. Autenticación Codex/OpenAI

Gana v9 debe soportar dos modos explícitos:

### 8.1 `codex-local`

Usa credencial local generada por Codex CLI cuando exista.

Reglas:

- Recomendado para uso interactivo local.
- Si no está disponible, la TUI debe degradar con mensaje accionable.
- No debe intentar extraer secretos.
- No debe depender de endpoints privados no documentados como única opción.

### 8.2 `api-key`

Usa variables de entorno o secret manager:

```bash
OPENAI_API_KEY=...
CODEX_API_KEY=...
```

Reglas:

- Recomendado para CI, servidores y smoke headless con LLM real.
- Los tests offline no deben requerirlo.
- Tokens, refresh tokens, headers completos y `.env` con secretos nunca deben versionarse ni imprimirse.
- La TUI solo puede mostrar estado redacted: autenticado/no autenticado, modelo resuelto y usage resumido.

### 8.3 Adapter de agente

Contrato mínimo:

```ts
interface AiProviderAdapter {
  name: string;
  runTurn(input: {
    messages: ChatMessage[];
    systemPrompt: string;
    tools: ToolDefinition[];
    model?: string;
    signal?: AbortSignal;
  }): AsyncIterable<AgentEvent>;
}
```

Eventos normalizados:

```text
text_delta
reasoning_delta
tool_call_started
tool_call_finished
tool_call_failed
turn_started
turn_finished
error
```

---

## 9. Tools y approval policy

### 9.1 Tools read-only por defecto

```text
file_read
grep
glob
list_dir
fixture_lookup
artifact_read
session_read
run_read
db_health_read
provider_quota_read
```

### 9.2 Tools con approval obligatorio

```text
shell
file_edit
run_harness_task
provider_live_readonly
db_write_release_grade
prediction_publish_candidate
artifact_promote
```

### 9.3 Tools fuera de v1

```text
file_write general
web_fetch genérico
js_repl
image_generation
sub_agent interno
server tools OpenRouter por defecto
```

### 9.4 Metadata de tools

```ts
type ToolMetadata = {
  name: string;
  readOnly: boolean;
  mutatesFilesystem: boolean;
  runsShell: boolean;
  network: boolean;
  destructive: boolean;
  requiresApproval: 'never' | 'always' | 'dangerous-only';
};
```

### 9.5 Registro de approvals

Cada approval debe registrar:

- Quién aprobó.
- Acción aprobada.
- Argumentos redacted.
- Timestamp.
- Session ID.
- Run ID.
- Resultado.
- Artifact vinculado cuando aplique.

---

## 10. Flujo funcional canónico

### RF-001: Inicialización

El sistema debe crear estructura local con:

```text
.gana/
  sessions/
  runs/
  evidence-packs/
  state.sqlite o state.jsonl
```

Debe validar profile, providers, artifact root, workspace root y policy.

### RF-002: Discover fixtures

El sistema debe listar fixtures por fecha, competition y provider mode.

- En `mock` y `replay`, no debe requerir red.
- En `live-readonly` y `release-grade`, debe usar API-Football o provider externo aprobado.
- Debe registrar snapshot y hash de payload cuando se use provider real.

### RF-003: Ingest odds

El sistema debe capturar y normalizar odds hacia `CanonicalMarketSnapshot`.

Campos mínimos:

- Fixture ID.
- Provider.
- CapturedAt.
- Bookmaker count.
- Market key.
- Selection key.
- Price.
- Implied probability.
- Payload hash.
- Source snapshot ID.

### RF-004: Select fixtures

El operador debe poder seleccionar fixtures manualmente o con policy conservadora.

Criterios mínimos:

- Kickoff window.
- Odds available.
- Provider confidence.
- No validation blockage.
- No duplicate active run.
- Manual include/exclude/pin.
- Max fixtures.

Razones legibles por candidato:

- `eligible`.
- `missing-odds`.
- `stale-odds`.
- `outside-window`.
- `manually-excluded`.
- `pinned`.
- `duplicate-active-run`.
- `provider-low-confidence`.

### RF-005: Run research

Research debe producir datos estructurados, no solo texto.

Entidades mínimas:

- `SourceRecord`.
- `EvidenceItem`.
- `Claim`.
- `ResearchGateResult`.

Modo web:

```ts
type WebResearchMode = 'disabled' | 'auto' | 'required';
```

Reglas:

- Si `required` no produce fuentes verificables, el bundle debe quedar `hold` con razón `web-research-empty`.
- Todo claim crítico necesita fuente oficial o corroboración.
- Research sin evidencia suficiente no debe ser promotable.

### RF-006: Score prediction

El scoring debe generar predicciones atómicas estructuradas.

Mercados v1 requeridos:

```text
h2h / moneyline
double_chance
goals_over_under / totals-goals
```

Mercados permitidos opcionales con flag:

```text
both-teams-score
corners
cards
```

Cada predicción debe incluir:

- Probability.
- Implied probability.
- Edge.
- EV cuando aplique.
- Confidence.
- Quality.
- Selected market.
- Selected outcome.
- Evidence IDs.
- Model.
- Prompt version.
- Reasoning breve.
- Warnings.
- Status.
- GeneratedAt.

Contrato mínimo:

```ts
type AtomicPrediction = {
  id: string;
  fixtureId: string;
  market: 'h2h' | 'moneyline' | 'double_chance' | 'goals_over_under' | 'totals-goals' | string;
  selection: string;
  line?: number;
  odds?: number;
  probability?: number;
  impliedProbability?: number;
  edge?: number;
  ev?: number;
  confidence: number;
  quality: number;
  rationale: string;
  warnings: string[];
  evidenceIds: string[];
  sourceRunId: string;
  aiRunId?: string;
  promptVersion?: string;
  status: 'draft' | 'review-required' | 'publishable' | 'blocked';
  generatedAt: string;
};
```

### RF-007: Build parlay

El parlay builder debe construir parlays desde predicciones atómicas persistidas.

Requisitos mínimos:

- Usar solo predicciones publicables o explícitamente aprobadas.
- Limitarse a 3 legs por defecto.
- Máximo una leg por fixture por defecto.
- Min/max legs configurables.
- Odds combinadas.
- Confidence/quality agregadas.
- Explicación corta del riesgo agregado.
- Razones de exclusión.
- Rechazar mercados experimentales salvo feature flag.
- Requerir approval para promotion.

### RF-008: Validate settlement

La validación posterior debe generar `ValidationArtifact` con:

- Prediction ID o Parlay ID.
- Result input.
- Settlement rule version.
- Status.
- Timestamp.
- Evidence links.
- Error o degradation reason si aplica.

Estados mínimos:

```text
pending
won
lost
push
voided
error
```

### RF-009: Golden replay

El sistema debe poder correr replay contra fixtures/goldens locales y comparar salida.

Debe producir:

- Diff esperado vs actual.
- Tolerancias configurables.
- Verdict.
- Remediation.

### RF-010: Evaluation verdict

Cada run debe terminar con un verdict:

```text
promotable
review-required
blocked
```

Criterios:

- `promotable`: checks pasan, evidencia completa, no errores críticos, approvals requeridos presentes.
- `review-required`: output útil, pero falta evidencia secundaria, hay warnings relevantes o cambios inesperados tolerables.
- `blocked`: falla crítica, no hay output válido, se violan reglas del harness o faltan credenciales/DB requeridas para el profile.

### RF-011: Handoff exportable

El sistema debe exportar un handoff por run con:

- Objetivo.
- Estado.
- Decisiones.
- Artifacts.
- Riesgos.
- Errores.
- Próxima acción.
- Comandos de reproducción.

---

## 11. Modelo de datos compacto

### 11.1 Entidades mínimas

- `Fixture`
- `Team`
- `Competition`
- `ProviderSnapshot`
- `CanonicalMarketSnapshot`
- `ResearchBundle`
- `SourceRecord`
- `EvidenceItem`
- `Claim`
- `ResearchGateResult`
- `AiRun`
- `Prediction`
- `Parlay`
- `ParlayLeg`
- `ValidationArtifact`
- `HarnessTask`
- `HarnessRun`
- `Artifact`
- `Approval`
- `QuotaStatus`
- `DigitalOceanDbHealth`

### 11.2 Fixture

```ts
type Fixture = {
  id: string;
  provider?: string;
  providerFixtureId?: string;
  competition?: string;
  homeTeam: string;
  awayTeam: string;
  scheduledAt: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'unknown';
  scoreHome?: number;
  scoreAway?: number;
  rawHash?: string;
};
```

### 11.3 CanonicalMarketSnapshot

```ts
type CanonicalMarketSnapshot = {
  id: string;
  fixtureId: string;
  provider: string;
  capturedAt: string;
  bookmakerCount?: number;
  marketKey: string;
  selectionKey: string;
  price: number;
  impliedProbability: number;
  payloadHash: string;
  sourceSnapshotId: string;
};
```

### 11.4 PipelineState

```ts
type PipelineState = {
  fixtureId: string;
  oddsStatus: string;
  researchStatus: string;
  candidateStatus: string;
  predictionStatus: string;
  parlayStatus: string;
  validationStatus: string;
  eligibilityReason?: string;
  manualOverride?: 'include' | 'exclude' | 'pin' | null;
  updatedAt: string;
};
```

### 11.5 HarnessRun

```ts
type HarnessRun = {
  id: string;
  objective: string;
  profile: 'mock' | 'replay' | 'live-readonly' | 'release-grade';
  sportsProvider: 'mock' | 'replay' | 'api-football';
  aiProvider: 'mock' | 'codex-local' | 'api-key';
  dbMode: 'none' | 'local' | 'digitalocean';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  verdict?: 'promotable' | 'review-required' | 'blocked';
  artifactDir: string;
};
```

### 11.6 Principios de datos

- Raw payloads se guardan solo cuando aportan replay, audit o debug.
- Todo output publicable debe enlazar run, evidence y source.
- Todo task debe cerrar con artifact o razón de no generación.
- El schema debe favorecer compactación frente a tablas duplicadas por UI.
- La TUI no debe ser fuente de verdad; debe renderizar estado del runtime, artifacts y DB.
- La DB durable no reemplaza JSONL ni evidence packs; los complementa.

---

## 12. Eventos del harness

Todo step debe emitir eventos normalizados.

```ts
type HarnessEventType =
  | 'task.started'
  | 'task.progress'
  | 'provider.requested'
  | 'provider.rate_limited'
  | 'provider.completed'
  | 'db.health.checked'
  | 'db.write.completed'
  | 'ai.started'
  | 'ai.delta'
  | 'ai.completed'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'artifact.written'
  | 'gate.passed'
  | 'gate.blocked'
  | 'task.completed'
  | 'task.failed';
```

Cada evento debe incluir:

- `eventId`.
- `runId`.
- `taskId`.
- `correlationId`.
- `traceId`.
- `timestamp`.
- `profile`.
- `severity`.
- `payload` redacted cuando aplique.
- `key` opcional para actualizar progreso sin inundar pantalla.

Contrato operativo:

```ts
type HarnessEvent = {
  eventId: string;
  runId: string;
  taskId?: string;
  fixtureId?: string;
  correlationId: string;
  traceId: string;
  timestamp: string;
  profile: string;
  type: HarnessEventType;
  phase?: string;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'success';
  message: string;
  key?: string;
  payload?: unknown;
};
```

---

## 13. Sessions, runs, artifacts y evidence packs

### 13.1 Sessions JSONL

Path recomendado:

```text
.gana/sessions/<session-id>.jsonl
```

Cada línea puede representar:

- `message`.
- `turn_started`.
- `turn_finished`.
- `tool_call`.
- `tool_result`.
- `approval_request`.
- `approval_decision`.
- `provider_event`.
- `db_event`.
- `error`.
- `usage`.

### 13.2 Run directory

Path recomendado:

```text
.gana/runs/<run-id>/
  run.json
  input.json
  events.jsonl
  artifacts/
  predictions.json
  parlays.json
  validations.json
  evaluation.json
  handoff.md
```

### 13.3 Evidence packs

Artifacts por defecto:

```text
.gana/evidence-packs/
.artifacts/gana-v9/
  sessions/
  runs/
  evidence-packs/
  certification/
```

Un evidence pack debe contener:

- Manifest.
- Profile.
- Input fixture IDs.
- Provider mode.
- API-Football snapshot metadata cuando aplique.
- DB mode y schema version redacted cuando aplique.
- AI model/resolution.
- Research sources.
- Claims.
- Predictions.
- Parlays.
- Validations.
- Approvals.
- Gate results.
- Hashes de payloads relevantes.
- Comandos de reproducción.
- Verdict.
- Remediation.

---

## 14. Task queue local

El sistema debe tener una cola local persistida o semi-persistida con:

- Task ID opaco.
- Kind.
- Payload.
- Dedupe key.
- Status.
- Priority.
- Attempts.
- Run after.
- Locked by.
- Locked until.
- Error legible.

Task kinds mínimos:

```text
ingest-fixtures
ingest-odds
select-candidates
run-research
generate-atomic-predictions
build-parlay
reconcile-results
validate-predictions
validate-parlays
evaluate-run
write-evidence-pack
sync-release-db
```

En `release-grade`, la cola debe persistir estado durable en DigitalOcean DB o sincronizar un resumen suficiente para auditoría.

---

## 15. Seguridad

Requisitos obligatorios:

- Toda acción mutante requiere approval en TUI o token operativo.
- Live network está deshabilitado por defecto.
- `live-readonly` no puede publicar ni promover predicciones.
- API-Football requiere profile explícito.
- DigitalOcean DB requiere profile explícito.
- Shell debe tener timeout, cap de output y denylist mínima.
- Secrets deben redactarse en logs, sessions, artifacts, errores y eventos.
- CI debe correr con `mock` o `replay`.
- Cualquier `.env` versionado con secretos es bloqueante.
- La TUI debe advertir cuando el profile no sea seguro para promotion.
- La TUI no debe exponer server en `0.0.0.0` por defecto.
- El sistema no debe escribir fuera del workspace salvo path aprobado explícitamente.
- `release-grade` debe validar DB health antes de acciones que dependan de persistencia durable.

---

## 16. Requisitos no funcionales

### RNF-001: Plataforma

- Node.js 22+.
- TypeScript estricto.
- pnpm workspaces o package TypeScript único.
- Prisma para DB durable.
- MySQL compatible como default recomendado para DigitalOcean DB, con posibilidad de PostgreSQL si se decide al implementar.

### RNF-002: Smoke sin red

`check:fast` y certification smoke deben pasar sin red, sin API-Football, sin DigitalOcean DB y sin credenciales LLM reales.

### RNF-003: Performance interactiva

La TUI debe mostrar primer render en menos de 2 segundos en un repo ya instalado.

### RNF-004: Portabilidad

Debe funcionar en macOS y Linux.

### RNF-005: Reproducibilidad

Un run debe poder reproducirse con inputs locales, provider mock/replay y artifacts versionados.

### RNF-006: Observabilidad

Cada run debe tener eventos JSONL, summary machine-readable y handoff humano.

### RNF-007: Documentación compacta

Docs iniciales recomendadas:

- `README.md`.
- `AGENTS.md`.
- `docs/srs/gana-v9-srs-consolidado.md`.
- `docs/architecture.md`.
- `docs/runbook.md`.

Evitar planes activos múltiples compitiendo.

### RNF-008: Mantenibilidad

Regla guía:

- TUI renderiza y envía comandos.
- Runtime ejecuta.
- Domain calcula.
- Storage persiste.
- Provider adapters hablan con externos.

### RNF-009: Mensajes de fallo accionables

Toda falla debe incluir:

- Qué falló.
- Esperado.
- Actual.
- Archivo/run afectado.
- Siguiente acción recomendada.
- Comando sugerido si aplica.

---

## 17. Testing y certificación

### 17.1 Tests mínimos

- Config/auth resolution sin imprimir secretos.
- API-Football adapter falla claro sin API key.
- API-Football adapter normaliza fixtures/odds/resultados.
- DigitalOcean DB health check redacted.
- `release-grade` falla si no hay `DATABASE_URL`.
- Session JSONL append-only.
- Renderer de eventos agrupados.
- Approval policy.
- Fake Codex adapter.
- Web research required con fuentes vacías bloquea.
- Market snapshot canonicalization.
- Scoring para mercados v1.
- Validation settlement por mercado.
- Evidence pack manifest.
- Golden replay determinístico.
- Handoff exportable.

### 17.2 Certification smoke

```bash
pnpm gana certify --profile ci-smoke
```

Debe:

- No usar credenciales reales.
- No usar red.
- No requerir DigitalOcean DB.
- Cargar fixtures replay.
- Ejecutar odds, research, score y validation.
- Generar evidence pack.
- Generar evaluation.json.
- Generar handoff.md.
- Producir resultado determinístico.

### 17.3 Check release

```bash
pnpm check:release
```

Puede requerir:

- API-Football.
- DigitalOcean DB.
- Codex/OpenAI real.
- Más fixtures.

Debe:

- Validar DB health.
- Validar API-Football quota/status.
- Ejecutar al menos un flujo live-readonly.
- Persistir snapshots normalizados.
- Generar evidence pack release-grade.
- Bloquear promotion si falta approval.

---

## 18. Criterios de aceptación

Gana v9 se considera funcional cuando:

1. `pnpm install` funciona.
2. `pnpm gana init` crea estructura `.gana/`.
3. `pnpm gana` abre la TUI en modo `mock` sin credenciales reales.
4. La TUI muestra session, auth status redacted, DB status redacted y artifact root.
5. `pnpm check:fast` pasa sin red.
6. `pnpm gana certify --profile ci-smoke` genera evidence pack reproducible.
7. Un fixture replay pasa por odds, research, scoring, parlay y validation.
8. Research con `web required` bloquea si no hay fuentes verificables.
9. Una predicción publicable enlaza evidence, source, AI run y validation status.
10. Shell, edición, provider live, DB write y promotion requieren approval según policy.
11. No hay dependencia obligatoria de OpenRouter, Groq, Heroku ni dashboard web.
12. CI ejecuta lint, typecheck, tests y certification smoke.
13. API-Football funciona como adapter en `live-readonly` cuando hay credencial válida.
14. `release-grade` falla de forma clara si falta `DATABASE_URL` o API-Football key.
15. `release-grade` persiste run, snapshots, predictions, validations, approvals y artifact metadata en DigitalOcean DB.
16. Los artifacts son legibles por humano y por agente.

---

## 19. Riesgos y mitigaciones

### Riesgo: repetir la dispersión de v8

Mitigación:

- Runtime único.
- TUI primero.
- Máximo 3 checks base.
- No public-api/operator-console en MVP.
- DB externa solo obligatoria para `release-grade`.

### Riesgo: acoplar v9 a OpenRouter/create-agent-tui literal

Mitigación:

- Tomar patrones, no runtime obligatorio.
- ProviderAdapter propio.
- Mock + Codex/OpenAI por defecto.
- OpenRouter solo opt-in posterior.

### Riesgo: API-Football se vuelve dependencia de desarrollo

Mitigación:

- Provider mock obligatorio.
- Replay/goldens obligatorios.
- API-Football solo en profiles live/release.
- Tests offline sin red.

### Riesgo: DigitalOcean DB bloquea iteración diaria

Mitigación:

- `.gana/` local para smoke.
- SQLite/JSONL local para desarrollo.
- DigitalOcean DB solo en `release-grade`.
- Health checks claros.

### Riesgo: TUI ornamental pero poco útil

Mitigación:

- Logs, runs, fixtures, approvals, evaluation y artifacts primero.
- Estética minimal.
- No charts/web deps en core.

### Riesgo: herramientas locales peligrosas

Mitigación:

- `permissions.ts` obligatorio.
- Approval dangerous-only por defecto.
- Workspace root guard.
- Shell danger classifier.
- Denylist mínima y timeout.

### Riesgo: predicciones sin evidencia

Mitigación:

- Evidence pack obligatorio.
- Verdict `review-required` si falta evidencia.
- Verdict `blocked` si falta evidencia crítica.
- Golden replay obligatorio.

---

## 20. Roadmap recomendado

### Fase 0: Base offline

- CLI `pnpm gana`.
- TUI mínima.
- `.gana/` storage.
- Sessions JSONL.
- Provider mock.
- Fixtures/goldens demo.
- Run directory.
- Event bus.

### Fase 1: Pipeline determinístico

- Ingest fixtures/odds replay.
- Candidate selection.
- Scoring determinístico.
- Parlay builder determinístico.
- Validation rules.
- Evaluation verdict.
- Handoff.

### Fase 2: Agent/Codex

- AiProviderAdapter.
- Codex/OpenAI auth.
- Fake Codex adapter para tests.
- Prompt versions.
- AI run artifacts.

### Fase 3: API-Football live-readonly

- Adapter API-Football.
- Fixture lookup live.
- Odds snapshot live.
- Final results lookup.
- Quota/status.
- Rate limit events.

### Fase 4: DigitalOcean DB release-grade

- Prisma schema compacto.
- DB health check.
- Durable persistence.
- Release-grade profile.
- DB sync task.
- Evidence pack con metadata DB.

### Fase 5: Promotion controlada

- Approval queue robusta.
- Artifact promotion.
- Publish candidate sin publicación automática.
- Runbooks.
- Certification release.

---

## 21. Trazabilidad de versiones fuente

### De v6 dashboard

Retener:

- Control room oscuro.
- KPIs simples.
- Fixtures table.
- ETL logs vivos.
- Date navigator.
- Batch selection.

Cambiar:

- TUI primero.
- Web dashboard después.
- Sin React/Next como centro operativo.
- Sin charts complejos como core.

### De v7

Retener:

- ETL autónomo.
- Task queue persistente con dedupe.
- Pipeline state por fixture.
- Structured AI output.
- Atómicas -> parlay -> validation.
- Odds snapshots/latest.
- Validation rules versionadas.
- Contratos value-focused: probability, implied probability, EV, edge, confidence.

Cambiar:

- API-Football como adapter necesario para live/release, no como dependencia del smoke.
- UI web no será fuente de verdad.
- Auth/RBAC/approval para acciones mutantes.

### De v8

Retener:

- Repo-as-harness.
- Principios dorados.
- Handoff agentic.
- Evaluation rubric.
- Goldens/evidence packs.
- Remediación legible.
- Artifacts trazables.
- Worktree isolation.
- Provider modes `mock`, `replay`, `live-readonly`.

Cambiar:

- Reducir apps y packages iniciales.
- No partir de `hermes-control-plane` legacy.
- DB release-grade sí, pero no default para smoke.
- Web/API como fase posterior.

### De create-agent-tui

Retener:

- Estructura `config -> tools -> agent -> renderer -> session -> commands`.
- JSONL sessions.
- Grouped tool display.
- Slash commands.
- Prompt composition.
- Input styles.
- Streaming de eventos.

Cambiar:

- No usar `@openrouter/agent` como runtime obligatorio.
- No usar OpenRouter server tools por defecto.
- Approval obligatorio para tools mutantes.
- Model registry local.
- Codex/OpenAI como camino principal para agente real.

---

## 22. Decisión final

Construir Gana v9 como un harness local TUI-first, no como plataforma web.

MVP recomendado:

1. Runtime único.
2. TUI minimal pero operativa.
3. CLI headless completa.
4. `.gana/` como storage local.
5. Provider mock obligatorio.
6. Provider replay/goldens obligatorio.
7. Adapter Codex/OpenAI.
8. Adapter API-Football para live-readonly/release-grade.
9. DigitalOcean DB para release-grade.
10. Queue local.
11. Prediction/parlay/validation determinísticos.
12. Evidence pack + evaluation + handoff.
13. Approval policy estricta.
14. Certification smoke sin credenciales reales.

La regla de oro queda así:

> La TUI opera.  
> El harness ejecuta.  
> Los adapters conectan.  
> Los artifacts auditan.  
> La DB durable respalda release-grade.  
> Nada se promueve sin evidencia y approval.
