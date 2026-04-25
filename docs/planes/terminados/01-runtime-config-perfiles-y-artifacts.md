# Runtime, Configuracion, Perfiles y Artifacts

## Objetivo

Extender la base actual para que Gana v9 opere como `mvp-productivo-online` desde el primer corte: configuracion durable, perfiles operativos, artifact root, redaccion de secretos y contratos transversales para runs/events.

Este plan debe implementar la seguridad basica temprano: redaccion, profile, approval mode y audit events minimos no se postergan al cierre de seguridad.

## SRS cubierto

- Secciones 0, 2.1, 2.2, 2.3, 2.6, 2.8, 2.9.
- Secciones 5.2, 5.3, 10.5, 14, 15, 16, 17.
- Cambios requeridos 19.2, 19.3 y 19.6.

## Contexto actual

- `src/config.ts` carga `agent.config.json`, variables `AGENT_*`, auth local de Codex/Gemini/Cursor y display.
- `src/cli.ts` crea una sesion JSONL simple y pasa `CommandContext` a `src/commands.ts`.
- `src/session.ts` solo persiste mensajes `{ timestamp, message }`.
- No hay `runtime`, `profile`, `approvalMode`, `apiFootball`, `databaseUrl`, `artifactRoot`, `runId`, `taskId`, `audit log` ni redaccion centralizada.

## Cambios requeridos

### Configuracion

Agregar a `src/config.ts` tipos y defaults:

```ts
type GanaRuntime = 'mvp-productivo-online';
type GanaProfile = 'standard' | 'full-permissions';
type ApprovalMode = 'manual' | 'auto-grant';

interface ApiFootballFilterConfig {
  defaultSeason: number;
  defaultLeagues: ApiFootballLeagueRef[];
  defaultTeams: ApiFootballTeamRef[];
  defaultMarkets: MarketKey[];
  lowOddsThreshold: number;
  kickoffWindowHours: number;
  includeLiveFixtures: boolean;
  includeCompletedFixtures: boolean;
  maxFixturesPerRun: number;
  bookmakerAllowlist?: string[];
}

interface GanaConfigExtension {
  runtime: GanaRuntime;
  profile: GanaProfile;
  apiFootballKey: string;
  apiFootballBaseUrl: string;
  databaseUrl: string;
  artifactRoot: string;
  approvalMode: ApprovalMode;
  apiFootball: ApiFootballFilterConfig;
}
```

Para que PR-01 pueda pasar `typecheck` antes de completar todo el dominio, crear el bootstrap minimo `src/domain/markets.ts`:

```ts
export type MarketKey =
  | 'h2h'
  | 'double_chance'
  | 'goals_over_under'
  | 'corners_over_under'
  | 'btts';

export const DEFAULT_MARKETS: MarketKey[] = [
  'h2h',
  'double_chance',
  'goals_over_under',
  'corners_over_under',
  'btts',
];
```

El plan `06-domain-mercados-y-settlement.md` conserva ownership del dominio y expande ese archivo con selections, validators, odds y settlement.

Tambien crear en PR-01 los refs minimos usados por `ApiFootballFilterConfig`, para que `typecheck` no dependa del provider completo:

```ts
export interface ApiFootballLeagueRef {
  providerLeagueId: string;
  name?: string;
  country?: string;
}

export interface ApiFootballTeamRef {
  providerTeamId: string;
  name?: string;
  leagueId?: string;
  country?: string;
}
```

Ubicacion inicial recomendada: `src/filters/types.ts`, porque PR-01 ya expone `filters show`; el plan `05-filtros-fixtures-y-low-odds.md` expande esos tipos.

Defaults iniciales:

- `runtime`: `mvp-productivo-online`.
- `profile`: `standard`.
- `approvalMode`: `manual`.
- `artifactRoot`: `.artifacts/gana-v9`.
- `apiFootballBaseUrl`: `https://v3.football.api-sports.io`.
- `apiFootball.lowOddsThreshold`: `1.2`.
- `apiFootball.defaultMarkets`: `h2h`, `double_chance`, `goals_over_under`, `corners_over_under`, `btts`.
- `apiFootball.defaultSeason`: resolver desde `GANA_DEFAULT_SEASON` o `inferSeasonFromDate(new Date())`.
- Si la temporada no se puede inferir con seguridad, los scans productivos deben mostrar warning accionable y exigir `GANA_DEFAULT_SEASON`.

Variables de entorno:

- `GANA_RUNTIME`
- `GANA_PROFILE`
- `GANA_ARTIFACT_ROOT`
- `GANA_APPROVAL_MODE`
- `API_FOOTBALL_KEY`
- `API_FOOTBALL_BASE_URL`
- `DATABASE_URL`
- `GANA_DEFAULT_SEASON`
- `GANA_LOW_ODDS_THRESHOLD`
- `GANA_MAX_FIXTURES_PER_RUN`

Actualizar `.env.example` con nombres y comentarios sin secretos reales.

### Runtime context

Crear `src/runtime/context.ts`:

```ts
interface RuntimeContext {
  runId?: string;
  taskId?: string;
  sessionPath: string;
  artifactRoot: string;
  profile: GanaProfile;
  approvalMode: ApprovalMode;
  providerAgentic: 'codex' | 'gemini' | 'cursor' | 'openrouter';
  providerSports: 'api-football';
  model: string;
}
```

`src/cli.ts` debe construir este contexto al arrancar y actualizarlo cuando cambian provider/model/profile/session.

### IDs y eventos

Crear `src/runtime/events.ts` con:

```ts
type HarnessEventType =
  | 'task.started'
  | 'task.progress'
  | 'provider.requested'
  | 'provider.completed'
  | 'provider.rate_limited'
  | 'filters.applied'
  | 'low_odds.scan_started'
  | 'low_odds.hit_found'
  | 'low_odds.scan_completed'
  | 'db.read'
  | 'db.write'
  | 'agent.started'
  | 'agent.delta'
  | 'agent.tool_call'
  | 'agent.tool_result'
  | 'agent.reasoning'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.provider_changed'
  | 'agent.session_reset'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.auto_granted'
  | 'artifact.written'
  | 'gate.passed'
  | 'gate.blocked'
  | 'task.completed'
  | 'task.failed';
```

Cada evento debe tener `eventId`, `runId`, `taskId?`, `correlationId`, `traceId`, `timestamp`, `runtime`, `profile`, `providerAgentic`, `providerSports`, `severity`, `payload`.

### Artifacts

Crear `src/runtime/artifacts.ts` como modulo canonico de escritura de artifacts. `src/evidence/*` podra consumirlo despues para evidence packs, pero no debe crear otro writer paralelo.

- `ensureArtifactRoot(config)`
- `createRunArtifactDir(runId)`
- `writeRunJson(run)`
- `appendEventJsonl(runId, event)`
- `writeArtifact(runId, name, payload)`
- `hashPayload(payload)`

Estructura obligatoria:

```text
.artifacts/gana-v9/
  sessions/
  runs/
  evidence-packs/
  handoffs/
```

Run directory:

```text
.artifacts/gana-v9/runs/<run-id>/
  run.json
  input.json
  filters.json
  events.jsonl
  provider-snapshots.jsonl
  agent-events.jsonl
  audit-log.jsonl
  handoff.md
```

### Redaccion

Crear `src/permissions/redaction.ts` como ubicacion canonica. `src/security/redaction.ts` solo puede existir como reexport si se necesita compatibilidad.

- `redactSecrets(value: unknown): unknown`
- `redactConnectionUrl(url: string): string`
- `redactHeaders(headers: Record<string, string>): Record<string, string>`

Debe cubrir:

- API keys.
- OAuth tokens.
- Refresh tokens.
- Authorization headers.
- `DATABASE_URL`.
- URLs con usuario/password/token.
- Valores cuyo key contenga `key`, `token`, `secret`, `password`, `authorization`.

Aplicar redaccion en:

- errores de config;
- status de DB/API-Football;
- sessions JSONL;
- artifacts;
- audit logs;
- renderer si muestra argumentos.

### Audit minimo de Corte 1

Crear `src/permissions/audit.ts` con una primera version append-only para artifacts:

- `appendAuditEvent(context, event)`
- `appendAutoApproval(context, action)`
- `appendConfigStatusEvent(context, status)`

En Corte 1 puede persistir solo en `.artifacts/gana-v9/runs/<run-id>/audit-log.jsonl` o en session/artifact local si la DB aun no esta lista. Cuando `03-db-digitalocean-postgres` entregue `audit_logs`, el mismo contrato debe escribir tambien en DB.

Eventos minimos:

- cambio de profile;
- DB/API status checks;
- errores redacted de config;
- artifact writes;
- auto-approval bajo `full-permissions`.

## Interfaz esperada

`loadConfig()` debe devolver una configuracion extendida compatible con los campos actuales. Ningun consumidor existente debe romperse por falta de nuevos env vars excepto comandos productivos que requieran DB/API.

Abrir la TUI no debe requerir auth agentic, `API_FOOTBALL_KEY` ni `DATABASE_URL`. Si falta auth de Codex/Gemini/Cursor, el harness debe abrir y mostrar estado `missing` o `not configured`; solo los comandos o turnos que usen ese provider deben fallar con error accionable.

`full-permissions` debe setear defaults coherentes:

- `approvalMode = auto-grant`
- `codexSandbox = danger-full-access` solo si config/env lo pide explicitamente
- `geminiApprovalMode = yolo`
- `cursorForce = true`

`standard` debe mantener aprobaciones manuales para mutaciones sensibles.

## Criterios de aceptacion

- `npm run typecheck` pasa.
- `loadConfig({})` funciona sin auth agentic, `DATABASE_URL` ni `API_FOOTBALL_KEY` para abrir TUI, pero `/provider`, `/db` y `/football` reportan configuracion faltante o auth missing.
- PR-01 crea `src/domain/markets.ts` con `MarketKey` y `DEFAULT_MARKETS` minimos para soportar config sin esperar el dominio completo.
- PR-01 crea `src/filters/types.ts` con `ApiFootballLeagueRef` y `ApiFootballTeamRef` minimos.
- `defaultSeason` se resuelve por env o inferencia; si no es seguro, los scans productivos exigen `GANA_DEFAULT_SEASON` con warning accionable.
- `agent.config.json` puede definir `runtime`, `profile`, `artifactRoot`, `approvalMode` y `apiFootball`.
- `.env.example` documenta todas las variables nuevas.
- `artifactRoot` se crea al iniciar un run, no necesariamente al abrir la TUI.
- El writer canonico de artifacts vive en `src/runtime/artifacts.ts`.
- Ningun log/status imprime secretos completos.
- `profile full-permissions` no elimina auditoria; solo cambia aprobacion a auto-grant auditada.
- Existe `src/permissions/redaction.ts` como modulo canonico de redaccion.
- Existe audit append-only minimo antes de conectar DB.

## Pruebas

- Unit tests de `redactSecrets` con objetos anidados, headers, URLs y `.env`-like strings.
- Unit tests de defaults de `loadConfig`.
- Unit tests de `ensureArtifactRoot` y `createRunArtifactDir` usando directorio temporal.
- Smoke manual: arrancar TUI con `npm start`, ejecutar `/session`, `/profile`, `/approval` despues de implementarlos.

## Riesgos

- Extender `AgentConfig` demasiado puede mezclar config agentic con config deportiva. Si crece, dividir en `AgentConfig` y `GanaConfig`, pero mantener `loadConfig` como fachada publica.
- No crear runs implicitos para cada mensaje agentic todavia si no hay flujo deportivo; registrar session y run solo cuando un comando productivo lo requiere.
