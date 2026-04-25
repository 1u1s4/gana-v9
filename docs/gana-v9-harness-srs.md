# Gana v9 Harness/TUI SRS

Estado: draft inicial
Fecha: 2026-04-25
Owner: Luis / Jo
Base analizada:
- /Users/luisalvarado/gana-v8
- /Users/luisalvarado/v9-srs-research/v0-v7
- /Users/luisalvarado/v9-srs-research/v0-gana-v6-dashboard-design
- /Users/luisalvarado/v9-srs-research/skills/skills/create-agent-tui

## 1. Propósito

Gana v9 debe ser una versión más compacta, funcional y dirigida que v8: un harness/TUI local para operar, evaluar y auditar flujos de predicción deportiva sin convertir el repo en una plataforma distribuida grande desde el inicio.

El objetivo principal no es crear otra web app ni otro monorepo disperso. El objetivo es tener un runtime canónico, reproducible y usable desde terminal que permita:

- cargar fixtures y odds desde snapshots locales o proveedor externo opcional
- seleccionar candidatos
- generar predicciones atómicas con motor determinístico o agente Codex
- construir parlays
- validar resultados
- guardar evidencia por run
- comparar contra goldens
- producir handoff y evaluación promotable/review-required/blocked

El diseño debe tomar las mejores lecciones de v6/v7/v8, pero evitar sus fuentes de dispersión.

## 2. Principios de producto

### 2.1 Harness-first

El producto base es un harness operativo. La TUI es la cara principal. Cualquier API HTTP o dashboard web es secundario y opcional.

### 2.2 Offline-first para smoke y desarrollo

El flujo mínimo debe correr sin:

- API-Football
- MySQL/DigitalOcean
- OpenRouter API key
- web search
- navegador

Debe existir un provider local/mock y fixtures/goldens versionadas.

### 2.3 Codex auth como camino principal de agente

Cuando se necesite agente/LLM real, v9 debe preferir auth/sesión Codex ya disponible en la máquina, no una matriz de API keys. OpenAI/OpenRouter HTTP puede existir como adapter opcional, pero no como requisito del MVP.

### 2.4 Runtime único

No debe existir una tensión tipo control-plane legacy vs runtime nuevo. El MVP tiene un solo entrypoint y un solo modelo mental.

### 2.5 Evidencia antes de promoción

Toda decisión promotable debe tener evidence pack. Si falta evidencia, el resultado debe ser review-required o blocked, no “éxito silencioso”.

### 2.6 Menos APIs, más adapters

API-Football, Codex, web search y DB remota son adapters opcionales. El core no debe depender de ellos.

## 3. Alcance

### 3.1 Incluido en MVP

- TUI/CLI local
- runtime agentic compacto
- provider mock offline
- provider Codex opcional
- sesiones JSONL
- storage local en `.gana/`
- fixtures/goldens locales
- event bus/logs estructurados
- task queue local con dedupe/retry básico
- ETL local/provider-adapter mínimo
- odds latest/snapshot mínimo
- candidate selection
- predicción atómica determinística y/o Codex
- parlay builder determinístico inicial
- validación de atómicas/parlays con reglas versionadas
- evidence packs por run
- evaluación final promotable/review-required/blocked
- handoff exportable
- permisos para herramientas file/shell

### 3.2 Fuera del MVP

- public-api obligatoria
- operator-console web obligatoria
- MySQL/Prisma obligatorio
- API-Football obligatorio
- web search obligatorio
- multi-worker deployment
- scheduler/dispatcher/recovery como procesos separados
- simulador Monte Carlo como core
- charts web complejos
- legacy compatibility layer
- 20+ packages/workspaces
- runtime release DB-backed como check default

## 4. Usuarios y casos de uso

### 4.1 Operador humano

Quiere abrir la TUI, ver fixtures, ejecutar pipeline, revisar picks/parlays, validar resultados y exportar handoff.

### 4.2 Agente implementador

Quiere usar el harness para correr tareas reproducibles, guardar evidencia y saber si un cambio es promotable.

### 4.3 Evaluador agentic

Quiere leer artifacts, comparar contra goldens y emitir verdict claro: promotable, review-required o blocked.

## 5. Arquitectura objetivo

### 5.1 Forma recomendada del repo

Para el MVP se recomienda un solo package TypeScript o un monorepo mínimo de máximo 3-4 workspaces.

Opción compacta preferida:

```text
src/
  cli.ts
  tui/
  runtime/
  providers/
  tools/
  permissions/
  session/
  storage/
  domain/
  etl/
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
  gana-v9-harness-srs.md
.gana/
  sessions/
  runs/
  state.sqlite o jsonl
```

Si se usa monorepo:

```text
apps/harness-tui/
packages/core/
packages/harness/
packages/provider-codex/ opcional
```

### 5.2 Capas

1. TUI/CLI
   - input
   - slash commands
   - render de eventos
   - paneles operativos

2. Runtime
   - run orchestration
   - task queue local
   - event bus
   - cancellation
   - retries

3. Provider adapters
   - mock
   - codex
   - openai/openrouter opcional
   - sports data provider local/API-Football opcional

4. Domain core
   - Fixture
   - OddsSnapshot
   - Candidate
   - Prediction
   - Parlay
   - Validation
   - Run/Evidence

5. Storage
   - `.gana/runs/<run-id>/`
   - `.gana/sessions/*.jsonl`
   - `.gana/state.sqlite` o JSONL append-only

6. Evaluation
   - golden replay
   - evidence completeness
   - verdict
   - remediation

## 6. Requisitos funcionales

### RF-001: TUI principal

El sistema debe proveer una TUI local para operar el harness.

Debe mostrar como mínimo:

- estado del workspace
- provider activo: mock/codex/opcional
- fecha/ventana operativa
- fixtures visibles
- runs recientes
- pipeline status
- logs vivos
- verdict de evaluación

### RF-002: CLI headless

Todo flujo principal debe poder ejecutarse sin TUI, con comandos headless.

Comandos mínimos sugeridos:

```bash
pnpm dev
pnpm check:fast
pnpm check:harness
pnpm gana init
pnpm gana tui
pnpm gana run --fixture-set fixtures/goldens/demo.json
pnpm gana replay --run-id <id>
pnpm gana eval --run-id <id>
pnpm gana export-handoff --run-id <id>
```

### RF-003: Sesiones JSONL

El sistema debe persistir sesiones en JSONL append-only.

Cada línea debe poder representar:

- message
- turn_started
- turn_finished
- tool_call
- tool_result
- approval_request
- approval_decision
- provider_event
- error
- usage

Path recomendado:

```text
.gana/sessions/<session-id>.jsonl
```

### RF-004: Runs con evidence pack

Cada ejecución operativa debe crear un run directory.

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

### RF-005: Provider mock obligatorio

El sistema debe tener un provider mock determinístico que permita correr smoke y tests sin red ni credenciales.

Debe poder simular:

- text del agente
- tool calls
- predicción atómica
- parlay builder
- fallos controlados

### RF-006: Provider Codex opcional/principal para agente real

El sistema debe proveer un adapter Codex para ejecutar agente/LLM real usando auth/sesión Codex cuando esté disponible.

Requisitos:

- no exponer secretos en logs
- error claro si auth no está disponible
- fallback a mock para tests
- eventos normalizados al contrato `AgentEvent`

### RF-007: Provider sports local

El sistema debe cargar fixtures/odds desde archivos locales.

Formatos aceptados MVP:

- JSON fixture set
- JSON odds snapshots
- golden replay pack

### RF-008: Provider sports externo opcional

El sistema puede incluir adapter API-Football, pero debe ser opcional.

Debe estar detrás de una interfaz tipo:

```ts
interface SportsDataProvider {
  listFixtures(input): Promise<Fixture[]>;
  getOdds(input): Promise<OddsSnapshot[]>;
  getFinalResults(input): Promise<FinalResult[]>;
  getQuota?(): Promise<QuotaStatus>;
}
```

### RF-009: Event bus estructurado

Todo job debe emitir eventos estructurados.

Contrato mínimo:

```ts
type HarnessEvent = {
  timestamp: string;
  runId: string;
  taskId?: string;
  fixtureId?: string;
  type: 'status' | 'log' | 'metric' | 'warning' | 'error' | 'complete';
  phase?: string;
  level?: 'debug' | 'info' | 'warn' | 'error' | 'success';
  message: string;
  key?: string;
  data?: unknown;
};
```

Debe soportar `key` para actualizar progreso sin inundar la pantalla.

### RF-010: Task queue local

El sistema debe tener una cola local persistida o semi-persistida con:

- task id opaco
- kind
- payload
- dedupe key
- status
- priority
- attempts
- run after
- locked by / locked until si aplica
- error legible

Task kinds mínimos:

- ingest-fixtures
- ingest-odds
- select-candidates
- generate-atomic-predictions
- build-parlay
- reconcile-results
- validate-predictions
- evaluate-run

### RF-011: Candidate selection

El sistema debe seleccionar candidatos usando reglas configurables:

- fixture status
- kickoff window
- odds availability
- odds thresholds
- stale data
- manual include/exclude/pin
- max fixtures

Debe producir razones legibles por candidato:

- eligible
- missing odds
- stale odds
- outside window
- manually excluded
- pinned

### RF-012: Predicciones atómicas

El sistema debe generar predicciones atómicas estructuradas.

Contrato mínimo:

```ts
type AtomicPrediction = {
  id: string;
  fixtureId: string;
  market: 'moneyline' | 'totals-goals' | 'both-teams-score' | 'double-chance' | string;
  selection: string;
  line?: number;
  odds?: number;
  probability?: number;
  confidence: number;
  quality: number;
  rationale: string;
  warnings: string[];
  sourceRunId: string;
  generatedAt: string;
};
```

MVP debe incluir predictor determinístico/offline. Codex puede actuar como advisor o predictor opcional.

### RF-013: Parlay builder

El sistema debe construir parlays desde predicciones atómicas persistidas.

Requisitos mínimos:

- legs relacionales/estructuradas, no sólo texto
- max one leg per fixture por defecto
- min legs configurable
- max legs configurable
- odds combinadas
- confidence/quality agregadas
- explicación corta
- razones de exclusión

MVP debe incluir builder determinístico antes de depender de LLM.

### RF-014: Validación

El sistema debe validar predicciones y parlays contra resultados finales.

Estados mínimos:

- pending
- won
- lost
- push
- voided
- error

Cada validación debe incluir:

- ruleVersion
- evidence
- evaluatedAt
- reason

### RF-015: Golden replay

El sistema debe poder correr un replay contra fixtures/goldens locales y comparar salida.

Debe producir:

- diff esperado vs actual
- tolerancias configurables
- verdict
- remediation

### RF-016: Evaluation verdict

Cada run debe terminar con un verdict:

- promotable
- review-required
- blocked

Criterios mínimos:

- promotable: checks pasan, evidencia completa, no errores críticos
- review-required: output útil pero falta evidencia, hay warnings relevantes o cambios inesperados tolerables
- blocked: falla crítica, no hay output válido, o se violan reglas del harness

### RF-017: Remediación legible

Toda falla debe incluir:

- qué falló
- esperado
- actual
- archivo/run afectado
- siguiente acción recomendada
- comando sugerido si aplica

### RF-018: Handoff exportable

El sistema debe exportar handoff por run con:

- objetivo
- estado
- decisiones
- artifacts
- riesgos
- errores
- próxima acción

### RF-019: Permisos de herramientas

Las herramientas locales deben declarar metadata:

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

Default recomendado: dangerous-only.

### RF-020: Slash commands

La TUI debe soportar comandos:

- /help
- /new
- /session
- /sessions opcional
- /provider
- /model si provider lo soporta
- /approval
- /tools
- /export
- /exit

No debe llamar OpenRouter para listar modelos salvo que el provider activo sea OpenRouter.

## 7. Requisitos no funcionales

### RNF-001: Smoke sin red

`check:fast` y el smoke harness deben pasar sin red y sin credenciales.

### RNF-002: Instalación simple

El primer run debe requerir pocos comandos:

```bash
pnpm install
pnpm gana init
pnpm gana run --fixture-set fixtures/goldens/demo.json
```

### RNF-003: Performance interactiva

La TUI debe mostrar primer render en menos de 2 segundos en un repo ya instalado.

### RNF-004: Portabilidad

Debe funcionar en macOS y Linux.

### RNF-005: Seguridad local

Por defecto:

- no escribir fuera del workspace
- no ejecutar comandos destructivos sin aprobación
- no exponer server en 0.0.0.0
- no guardar secretos en sessions/logs

### RNF-006: Reproducibilidad

Un run debe poder reproducirse con sus inputs locales y provider mock.

### RNF-007: Observabilidad

Cada run debe tener eventos JSONL y summary machine-readable.

### RNF-008: Documentación compacta

Docs iniciales máximas recomendadas:

- README.md
- AGENTS.md
- docs/gana-v9-harness-srs.md
- docs/architecture.md
- docs/runbook.md

Evitar planes activos múltiples compitiendo.

### RNF-009: Mantenibilidad

Evitar archivos gigantes y lógica mezclada UI/runtime.

Regla guía:

- TUI renderiza y envía comandos
- runtime ejecuta
- domain calcula
- storage persiste
- provider adapters hablan con externos

### RNF-010: Extensibilidad controlada

Adapters externos deben ser enchufables sin invadir core.

## 8. Modelo de datos MVP

### 8.1 Fixture

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
  raw?: unknown;
};
```

### 8.2 OddsSnapshot

```ts
type OddsSnapshot = {
  id: string;
  fixtureId: string;
  market: string;
  selection: string;
  odds: number;
  bookmaker?: string;
  capturedAt: string;
  raw?: unknown;
};
```

### 8.3 PipelineState

```ts
type PipelineState = {
  fixtureId: string;
  oddsStatus: string;
  candidateStatus: string;
  predictionStatus: string;
  parlayStatus: string;
  validationStatus: string;
  eligibilityReason?: string;
  manualOverride?: 'include' | 'exclude' | 'pin' | null;
  updatedAt: string;
};
```

### 8.4 Run

```ts
type Run = {
  id: string;
  objective: string;
  mode: 'mock' | 'codex' | 'external';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  verdict?: 'promotable' | 'review-required' | 'blocked';
  artifactDir: string;
};
```

## 9. TUI UX

### 9.1 Layout base

Inspirado en v6/v7 “control room”, pero terminal-first.

Paneles mínimos:

```text
┌ GANA V9 HARNESS ─────────────────────────────────────┐
│ provider mock/codex | workspace clean | date window  │
├ OVERVIEW ───────────┬ FIXTURES ──────────────────────┤
│ matches 12          │ HH:MM league home-away odds    │
│ odds fresh 10       │ selected / eligible / stale    │
│ predictions 6       │                                │
├ PIPELINE ───────────┼ RUN LOG ───────────────────────┤
│ fixtures -> odds    │ info/warn/error/success        │
│ candidates -> picks │ keyed progress updates         │
├ EVALUATION ─────────┴────────────────────────────────┤
│ verdict review-required | next action ...            │
└──────────────────────────────────────────────────────┘
```

### 9.2 Estilo

- dark/terminal
- colores semánticos: verde, amarillo, rojo, gris
- uppercase labels
- sin charts complejos
- barras ASCII para distribución de odds
- logs siempre visibles

### 9.3 Input

Basado en create-agent-tui:

- block si TTY normal
- plain si CI/TERM=dumb/no TTY
- bordered opcional

### 9.4 Tool display

Default: grouped.

Debe mostrar:

- herramienta
- argumento clave truncado
- duración
- status
- salida resumida

## 10. Integración Codex

### 10.1 Objetivo

Usar Codex auth como camino principal para agente real, evitando depender de múltiples API keys.

### 10.2 Adapter

Contrato:

```ts
interface ProviderAdapter {
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

### 10.3 Eventos

El adapter Codex debe normalizar a:

- text_delta
- reasoning_delta
- tool_call_started
- tool_call_finished
- tool_call_failed
- turn_started
- turn_finished
- error

### 10.4 Fallbacks

Si Codex auth no está disponible:

- mostrar error accionable
- sugerir provider mock
- no fallar tests offline

## 11. Checks y aceptación

### 11.1 Checks de desarrollo

```bash
pnpm check:fast
```

Debe incluir:

- lint básico
- typecheck
- tests unitarios sin red

### 11.2 Check harness

```bash
pnpm check:harness
```

Debe incluir:

- replay golden demo
- evidence pack generado
- evaluation.json válido
- handoff.md generado

### 11.3 Check release opcional

```bash
pnpm check:release
```

Puede incluir:

- provider externo
- DB externa
- Codex real
- más fixtures

No debe ser requisito para iteración diaria.

## 12. Criterios de done del MVP

El MVP v9 está listo cuando:

1. `pnpm install` funciona
2. `pnpm check:fast` pasa sin red
3. `pnpm gana init` crea estructura `.gana/`
4. `pnpm gana run --fixture-set fixtures/goldens/demo.json` genera run completo
5. El run produce predictions/parlays/validations determinísticas
6. El run produce `evaluation.json` con verdict
7. El run produce `handoff.md`
8. La TUI puede abrir y mostrar el run
9. Provider mock funciona en CI
10. Provider Codex falla claro si no hay auth y funciona si auth está disponible
11. No se requiere MySQL/API-Football/OpenRouter para smoke
12. Los artifacts son legibles por humano y agente

## 13. Riesgos y mitigaciones

### Riesgo: repetir la dispersión de v8

Mitigación:
- un runtime canónico
- máximo 3 checks base
- no public-api/operator-console en MVP
- no DB externa obligatoria

### Riesgo: acoplar v9 a OpenRouter/create-agent-tui literal

Mitigación:
- tomar sólo patrones
- ProviderAdapter propio
- mock + Codex por defecto
- OpenRouter opt-in

### Riesgo: Codex auth no portable

Mitigación:
- provider mock obligatorio
- error accionable
- adapter HTTP opcional si se decide después

### Riesgo: TUI ornamental pero poco útil

Mitigación:
- logs, runs, fixtures, evaluation primero
- estética minimal
- no charts/web deps en core

### Riesgo: herramientas locales peligrosas

Mitigación:
- permissions.ts obligatorio
- approval dangerous-only por defecto
- workspace root guard
- shell danger classifier

### Riesgo: predicciones sin evidencia

Mitigación:
- verdict review-required si falta evidencia
- evidence pack obligatorio
- golden replay obligatorio

## 14. Lecciones incorporadas de versiones anteriores

### Desde v6 dashboard

Conservar:
- control room oscuro
- KPIs simples
- fixtures table con low odds
- ETL logs vivos
- date navigator
- batch selection

Evitar:
- React/Next como centro operativo
- componentes gigantes
- charts complejos
- sessionStorage como estado operativo
- extractor auto-run agresivo

### Desde v7

Conservar:
- SRS de consola autónoma
- task queue persistente con dedupe
- pipeline_state por fixture
- structured AI output
- atómicas -> parlay -> validation
- odds snapshots/latest
- validation rules versionadas

Evitar:
- Codex como único provider conceptual
- API-Football como único proveedor
- UI web como fuente de verdad

### Desde v8

Conservar:
- repo-as-harness
- principios dorados
- handoff agentic
- evaluation rubric
- goldens/evidence packs
- remediación legible
- artifacts trazables
- worktree isolation

Evitar:
- demasiadas apps/packages
- MySQL/Prisma obligatorio
- public-api/operator-console como MVP
- runtime release DB-backed por default
- legacy compatibility layers
- documentación histórica dispersa

### Desde create-agent-tui

Conservar:
- separación agent runner/TUI/tools/session/config
- streaming de eventos
- JSONL sessions
- tool display grouped/minimal
- slash commands
- permisos/aprobaciones
- server SSE opcional

Adaptar:
- no OPENROUTER_API_KEY obligatorio
- no server tools OpenRouter por defecto
- no /model contra OpenRouter salvo provider activo
- ProviderAdapter neutral con mock y Codex

## 15. Referencias inspeccionadas

- gana-v8: `README.md`, `AGENTS.md`, `docs/harness-principios-dorados.md`, `docs/agentic-handoff.md`, `docs/agentic-sprint-contract.md`, `docs/agentic-evaluation-rubric.md`, `scripts/workspace-dev.mjs`, `tests/sandbox/certification.mjs`, `packages/ai-runtime/*`
- v0-v7: `docs/SRS_v2_consola_autonoma.md`, `prisma/schema.prisma`, `app/ops/page.tsx`, `components/ops/*`, `lib/ops/tasks/*`, `lib/etl/*`, `lib/ai/*`, `lib/validation/*`
- v6 dashboard: `app/page.tsx`, `app/fixtures/page.tsx`, `app/etl/page.tsx`, `app/predictions/page.tsx`, `components/fixtures-table.tsx`, `components/terminal-logs.tsx`, `app/globals.css`, `lib/etl/stream.ts`, `lib/etl/policy.ts`
- OpenRouter create-agent-tui: `SKILL.md`, `references/tools.md`, `references/modules.md`, `references/tui.md`, `references/tool-display.md`, `references/input-styles.md`, `references/loader.md`, `references/slash-commands.md`, `references/system-prompt.md`, `references/server-entry-points.md`, `sample/src/*`

## 16. Decisión recomendada

Construir v9 como harness local primero, no como plataforma web.

MVP recomendado:

1. Un package TypeScript
2. `.gana/` como storage local
3. provider mock obligatorio
4. provider Codex adapter
5. fixtures/goldens demo
6. TUI minimal
7. queue local
8. prediction/parlay/validation determinísticos
9. evidence pack + evaluation + handoff
10. API-Football/MySQL/OpenRouter sólo como adapters posteriores
