# Gana v9 — SRS MVP Productivo Online

**Estado:** borrador canónico actualizado  
**Fecha:** 2026-04-25  
**Owner:** Luis / Jo  
**Alcance:** requisitos de producto y sistema para Gana v9 como harness operativo completamente basado en TUI, conectado desde el inicio a API-Football, persistido en base de datos durable en DigitalOcean y asistido por Codex CLI y deprecated provider CLI.

---

## 0. Decisión canónica

Gana v9 debe construirse como un **MVP productivo online**. El sistema no debe organizarse alrededor de dos modos separados ni de rutas simuladas de operación. Desde el primer corte funcional, el producto debe trabajar con datos reales, proveedores agentic reales, base de datos durable y artifacts auditables.

La decisión central de este SRS es:

> Gana v9 tendrá un único enfoque operativo: **MVP productivo online, TUI-first, conectado a API-Football y persistido en DigitalOcean DB**.

Esto significa que:

- API-Football es el proveedor deportivo obligatorio desde el inicio.
- DigitalOcean DB es parte del backend inicial, no un agregado posterior.
- La TUI es el centro de operación principal.
- Codex CLI y deprecated provider CLI son los proveedores agentic principales.
- La operación debe ser auditable mediante runs, eventos, evidence packs, snapshots y registros en DB.
- Los filtros de búsqueda deportiva deben existir desde el inicio para ligas, equipos, mercados y cuotas.
- El sistema no debe ejecutar apuestas monetarias ni conectarse a casas de apuestas para colocar jugadas. Los parlays y predicciones son artifacts analíticos.

---

## 1. Propósito

Gana v9 es una plataforma compacta de predicción deportiva orientada a operar, auditar y validar decisiones desde terminal. Su producto principal es un harness TUI-first: una consola de operación capaz de consultar datos reales, filtrar partidos, capturar odds, generar predicciones estructuradas, construir candidatos de parlay, validar resultados y persistir evidencia.

El ciclo canónico del MVP productivo online es:

```text
API-Football fixtures
  -> filtros de ligas/equipos/cuotas/mercados
  -> API-Football odds y estadísticas
  -> snapshots persistidos
  -> research evidence
  -> scoring
  -> prediction candidates
  -> parlay candidates
  -> validation artifacts
  -> DigitalOcean DB persistence
  -> evidence pack y handoff
```

El objetivo no es crear primero una web app ni una plataforma distribuida grande. El objetivo es tener una herramienta real de operación desde terminal, con datos vivos, persistencia durable y trazabilidad suficiente para revisar cada predicción.

Para cada predicción, el sistema debe permitir responder:

- qué fixture la originó;
- qué liga y equipos participaron;
- qué odds y mercados se usaron;
- qué filtros permitieron seleccionar el partido;
- qué evidencia se consultó;
- qué proveedor agentic participó;
- qué modelo y configuración se aplicaron;
- qué run la generó;
- qué reglas de scoring y validación se usaron;
- qué artifact permite auditarla;
- qué registros quedaron persistidos en DigitalOcean DB.

---

## 2. Principios de producto

### 2.1 TUI-first

La TUI es la superficie principal. El operador debe poder abrir el sistema desde terminal y ver estado de API-Football, estado de DigitalOcean DB, proveedor agentic activo, modelo activo, perfil de permisos, fixtures, filtros, odds, predicciones, parlays, validaciones, runs, artifacts y logs vivos.

### 2.2 MVP productivo online

El sistema debe asumir conectividad real como condición normal de uso. La operación principal requiere API-Football, base de datos, proveedor agentic autenticado y capacidad de persistir evidencia.

### 2.3 Harness-first

La TUI renderiza y recibe comandos; el harness ejecuta. La lógica de dominio deportivo, scoring, validación, persistencia, proveedores y artifacts debe estar separada de la lógica visual.

### 2.4 API-Football como fuente deportiva inicial

API-Football será el proveedor principal para fixtures, odds, resultados, estadísticas y cuota operativa. El dominio interno debe usar entidades propias, pero la implementación inicial debe estar diseñada para API-Football.

### 2.5 Filtros desde el inicio

La búsqueda de partidos no debe ser manual ni genérica. El MVP debe incluir filtros configurables para:

- ligas predeterminadas;
- equipos predeterminados;
- temporadas;
- fechas y ventanas horarias;
- mercados permitidos;
- cuotas por debajo de un umbral, con valor inicial `1.20`;
- estado del partido;
- disponibilidad de odds;
- disponibilidad de estadísticas necesarias para validación.

### 2.6 DigitalOcean DB como backend inicial

La base de datos en DigitalOcean debe formar parte del diseño desde el inicio. Debe persistir fixtures, odds snapshots, provider snapshots, runs, tasks, predicciones, parlays, validaciones, filtros aplicados, approvals, agent runs, audit logs y metadata de artifacts.

### 2.7 Agentes CLI reales

El sistema debe usar proveedores agentic locales ya autenticados mediante CLI:

- Codex CLI;
- deprecated provider CLI;

El operador debe poder cambiar entre ellos desde la TUI. Cada proveedor debe normalizar sus eventos hacia un contrato común del harness.

### 2.8 Evidencia antes de promoción

Ninguna predicción o parlay candidato debe considerarse promocionable si no tiene evidencia, snapshots, trazabilidad del run, provider metadata, filtros aplicados y estado de validación.

### 2.9 Perfil de permisos completos

Debe existir un perfil `full-permissions` para evitar aprobaciones repetitivas durante sesiones controladas. Este perfil autoautoriza herramientas y acciones permitidas por configuración, pero conserva auditoría, redacción de secretos, timeouts y registro de cada acción.

### 2.10 Sin automatización monetaria

Gana v9 debe producir análisis, predicciones y candidatos estructurados. No debe ejecutar apuestas, mover dinero, conectarse a casas de apuestas para colocar jugadas ni automatizar decisiones financieras.

---

## 3. Alcance del MVP

### 3.1 Incluido

- TUI local como superficie principal.
- CLI headless para flujos principales.
- Runtime compacto de harness.
- Integración obligatoria con API-Football.
- Backend durable en DigitalOcean DB.
- Provider agentic por Codex CLI.
- Provider agentic por deprecated provider CLI.
- Cambio de provider desde `/provider`.
- Cambio de modelo desde `/model`.
- Modo rápido desde `/fast` cuando el proveedor lo soporte.
- Reasoning effort desde `/think` cuando el proveedor lo soporte.
- Web search nativo desde `/web` cuando la tarea lo requiera.
- Perfil `standard`.
- Perfil `full-permissions`.
- Sesiones JSONL append-only.
- Runs con eventos estructurados.
- Artifacts por run.
- Evidence packs por run.
- Estado de API-Football, cuota y rate limit.
- Estado de DigitalOcean DB.
- ETL de fixtures, odds, resultados y estadísticas desde API-Football.
- Filtros por ligas predeterminadas.
- Filtros por equipos predeterminados.
- Escaneo de partidos con cuota decimal igual o menor a `1.20`.
- Selección de candidatos por reglas configurables.
- Research estructurado con fuentes y claims.
- Scoring para mercados iniciales.
- Predicciones atómicas estructuradas.
- Builder de parlay candidate.
- Validación de predicciones y parlays con reglas versionadas.
- Evaluation verdict: `promotable`, `review-required`, `blocked`.
- Handoff exportable por run.
- Auditoría de acciones, approvals y auto-approvals.
- Redacción de secretos en logs, sessions, artifacts y errores.

### 3.2 Fuera del MVP

- Dashboard web obligatorio.
- API pública obligatoria.
- Multi-worker deployment desde el primer corte.
- Scheduler, dispatcher y recovery como procesos separados.
- Dependencia estratégica de OpenRouter.
- Groq vision.
- Heroku management.
- Image generation.
- JS REPL como herramienta libre.
- Web fetch genérico sin control.
- Simulador Monte Carlo como core inicial.
- Charts web complejos.
- Legacy compatibility layer.
- Ejecución automática de apuestas monetarias.
- Publicación automática de candidatos sin evidence pack.
- Múltiples proveedores deportivos en el primer corte.
- Rutas simuladas como base del producto.

---

## 4. Usuarios y perfiles

### 4.1 Operador técnico

Ejecuta el harness desde terminal. Revisa fixtures, filtros, cuotas, odds, evidencia, predicciones, parlays, validaciones, estado de base de datos, artifacts y errores.

### 4.2 Agente implementador

Usa Codex CLI o deprecated provider CLI para inspeccionar código, modificar archivos, correr comandos, generar artifacts y avanzar tareas dentro del repo.

### 4.3 Evaluador agentic

Lee runs, snapshots, registros de DB, artifacts y evidence packs para emitir un verdict claro: `promotable`, `review-required` o `blocked`.

### 4.4 Perfil `standard`

Perfil seguro para operación normal. Solicita aprobación en acciones mutantes, promoción de artifacts, escritura de archivos sensibles y comandos shell clasificados como riesgosos.

### 4.5 Perfil `full-permissions`

Perfil de operación acelerada. Evita prompts repetitivos y autoautoriza acciones configuradas.

Debe cumplir:

- registrar cada acción autoautorizada;
- registrar provider, modelo, comando, argumentos redacted, timestamp y run ID;
- permitir kill-switch de sesión;
- mantener redacción de secretos;
- mantener timeout y límite de output para shell;
- permitir configuración explícita de sandbox Codex y approval mode deprecated provider;
- impedir que la ausencia de prompts elimine la trazabilidad.

Configuración recomendada:

```json
{
  "profile": "full-permissions",
  "approval": {
    "mode": "auto-grant",
    "audit": true,
    "redactSecrets": true
  },
  "codexSandbox": "danger-full-access",
  "deprecated-providerApprovalMode": "yolo"
}
```

---

## 5. Arquitectura de alto nivel

### 5.1 Base actual del repo

El código ya iniciado tiene una estructura compacta y adecuada para el enfoque TUI-first:

```text
gana-v9
├── config
├── docs
├── scripts
│   ├── update-codex-models.ts
│   └── update-deprecated-provider-models.ts
└── src
    ├── agent.ts
    ├── banner.ts
    ├── cli.ts
    ├── commands.ts
    ├── config.ts
    ├── loader.ts
    ├── renderer.ts
    ├── session.ts
    ├── terminal-bg.ts
    └── tools
        ├── file-edit.ts
        ├── file-read.ts
        ├── file-write.ts
        ├── glob.ts
        ├── grep.ts
        ├── list-dir.ts
        └── shell.ts
```

Esta base debe mantenerse como punto de partida. El SRS no debe forzar un monorepo grande ni separar servicios antes de necesitarlo.

### 5.2 Capas requeridas

```text
src/
  cli.ts
  commands.ts
  agent.ts
  config.ts
  renderer.ts
  session.ts
  tools/
  runtime/
  providers/
    sports/
      api-football.ts
    agentic/
      codex-cli.ts
      deprecated-provider-cli.ts
  domain/
  prediction/
  parlay/
  validation/
  evidence/
  storage/
    db.ts
    repositories/
  permissions/
```

### 5.3 Runtime único

El runtime inicial debe ser un único proceso con módulos internos:

- scheduler interno para crear runs o tasks desde comandos;
- dispatcher interno para ejecutar steps;
- recovery interno para redrive, cancelación o marcado de failure;
- football provider client para API-Football;
- filter engine para ligas, equipos, mercados y cuotas;
- artifact writer para JSONL, summaries y evidence packs;
- DB writer para persistir entidades en DigitalOcean;
- event bus para TUI y logs.

La separación en servicios independientes solo debe ocurrir cuando exista una necesidad operacional demostrada.

---

## 6. Interfaz TUI y CLI

### 6.1 TUI principal

La TUI debe mostrar como mínimo:

- nombre del sistema;
- provider agentic activo;
- modelo activo;
- estado de auth del provider agentic;
- estado de API-Football;
- cuota/rate limit del provider deportivo;
- estado de DigitalOcean DB;
- perfil operativo activo;
- fecha o ventana operativa;
- filtros activos;
- ligas predeterminadas;
- equipos predeterminados;
- umbral de cuota activo;
- fixtures visibles;
- odds disponibles;
- pipeline status;
- runs recientes;
- logs vivos;
- verdict de evaluación;
- artifact root.

### 6.2 Slash commands existentes que se conservan

El código actual ya implementa o prepara estos comandos:

- `/help`: lista comandos disponibles.
- `/new`: inicia una sesión nueva.
- `/provider`: cambia entre `codex`, `deprecated-provider` y compatibilidad `openrouter`.
- `/model`: cambia modelo del provider activo.
- `/fast`: activa modo rápido cuando el provider lo soporte.
- `/think`: define reasoning effort cuando el provider lo soporte.
- `/web`: activa o desactiva búsqueda web nativa y permite modo `live`.

Estos comandos forman parte del contrato funcional del SRS.

### 6.3 Slash commands nuevos requeridos

- `/session`: muestra session ID, run ID activo, artifact root, usage y auth status redacted.
- `/profile`: cambia entre `standard` y `full-permissions`.
- `/approval`: muestra policy activa, auto-approvals y último audit log.
- `/db`: muestra estado de conexión a DigitalOcean DB.
- `/football`: muestra estado de API-Football, cuota y último request.
- `/filters`: muestra o actualiza filtros activos.
- `/leagues`: lista, agrega o elimina ligas predeterminadas.
- `/teams`: lista, agrega o elimina equipos predeterminados.
- `/threshold`: muestra o cambia el umbral de cuota, por defecto `1.20`.
- `/fixtures`: lista fixtures por fecha, liga, equipo, ventana o preset.
- `/low-odds`: busca partidos con cuotas iguales o menores al umbral activo.
- `/odds`: muestra odds normalizadas por fixture y market.
- `/research`: ejecuta o inspecciona research evidence.
- `/score`: genera predicciones atómicas para fixtures seleccionados.
- `/parlay`: construye candidatos de parlay.
- `/validate`: valida predicciones o parlays contra resultados.
- `/run`: ejecuta el flujo completo del MVP productivo.
- `/artifacts`: lista artifacts del run actual.
- `/export`: exporta handoff y evidence pack.

### 6.4 Comandos CLI headless requeridos

```bash
pnpm gana
pnpm gana tui
pnpm gana db status
pnpm gana football status
pnpm gana filters show
pnpm gana leagues list
pnpm gana teams list
pnpm gana fixtures --date YYYY-MM-DD
pnpm gana fixtures --date YYYY-MM-DD --league 39 --season 2025
pnpm gana fixtures --date YYYY-MM-DD --team 33
pnpm gana odds --fixture-id ID
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20
pnpm gana scan low-odds --date YYYY-MM-DD --leagues default --markets h2h,double_chance
pnpm gana research --fixture-id ID --web live
pnpm gana score --fixture-id ID
pnpm gana parlay --date YYYY-MM-DD
pnpm gana validate --date YYYY-MM-DD
pnpm gana run --date YYYY-MM-DD
pnpm gana export --run-id RUN_ID
```

### 6.5 Layout recomendado

```text
┌ GANA V9 HARNESS ─────────────────────────────────────────────────────┐
│ profile full-permissions | provider codex | model gpt-5.5           │
│ API-Football ready       | DO DB connected | threshold <= 1.20       │
├ FILTERS ───────────────────────┬ FIXTURES ──────────────────────────┤
│ leagues: default               │ HH:MM league home-away status       │
│ teams: default                 │ eligible / blocked / selected       │
│ markets: h2h dc goals corners  │ low-odds hits visible               │
├ ODDS / MARKETS ────────────────┼ RUN LOG ───────────────────────────┤
│ h2h dc goals corners btts      │ info/warn/error/success             │
│ bookmaker count | capturedAt   │ grouped tool events                 │
├ EVIDENCE ──────────────────────┴ VERDICT ───────────────────────────┤
│ sources 12 | claims 8 | predictions 5 | verdict review-required     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. Proveedores agentic CLI

### 7.1 Decisión

Gana v9 debe tener un contrato común para proveedores agentic CLI y soportar desde el diseño inicial:

- Codex CLI;
- deprecated provider CLI;

OpenRouter puede permanecer como compatibilidad técnica mientras exista en el código, pero no es el enfoque estratégico del producto.

### 7.2 Contrato común

```ts
type AgentProvider = 'codex' | 'deprecated-provider';

type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; callId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; callId: string; output: string }
  | { type: 'reasoning'; delta: string };
```

Cada proveedor debe normalizar sus eventos hacia este contrato. La TUI no debe depender del formato nativo de cada CLI.

### 7.3 Codex CLI

Requisitos:

- ejecutar `codex exec --json`;
- soportar `resume` con thread ID;
- soportar modelo configurable;
- soportar reasoning effort cuando el modelo lo permita;
- soportar service tier fast cuando el modelo lo permita;
- soportar sandbox configurable;
- registrar uso de tokens cuando el CLI lo reporte;
- detectar y renderizar tool calls de shell;
- detectar uso de web search nativo cuando sea requerido;
- no imprimir secretos ni auth completa.

### 7.4 deprecated provider CLI

Requisitos:

- ejecutar `deprecated-provider` con `--output-format stream-json`;
- soportar `--model`;
- soportar `--resume` con session ID;
- soportar approval mode configurable;
- detectar tool calls y tool results;
- detectar `google_web_search` cuando sea requerido;
- registrar stats de tokens cuando el CLI los reporte;
- no imprimir credenciales OAuth.

### 7.5 Model registry

Los scripts existentes deben conservarse como parte del sistema:

- `scripts/update-codex-models.ts` actualiza `config/codex-models.json`.
- `scripts/update-deprecated-provider-models.ts` actualiza `config/deprecated-provider-models.json`.
El comando `/model` debe leer el catálogo del provider activo y no mezclar modelos entre proveedores.

### 7.6 Web search nativo

Cuando `nativeWebSearch` esté activo, el harness debe exigir que el provider agentic use su herramienta nativa de búsqueda antes de responder en tareas que requieren información actual.

- Codex: `web_search`.
- deprecated provider: `google_web_search`.
Si el provider no usa la herramienta requerida, el turno debe fallar con error accionable.

---

## 8. Integración API-Football

### 8.1 Objetivo

API-Football será el proveedor deportivo principal de Gana v9. Su integración debe cubrir fixtures, odds, resultados, estadísticas, cuota operativa y filtros de búsqueda.

### 8.2 Contrato interno

```ts
interface SportsDataProvider {
  name: 'api-football';
  getStatus(): Promise<ProviderStatus>;
  getQuota(): Promise<QuotaStatus>;
  listFixtures(input: FixtureQuery): Promise<Fixture[]>;
  getFixture(input: FixtureByIdQuery): Promise<Fixture>;
  getOdds(input: OddsQuery): Promise<CanonicalMarketSnapshot[]>;
  scanOdds(input: OddsScanQuery): Promise<OddsScanResult[]>;
  getFinalResult(input: ResultQuery): Promise<FinalResult>;
  getFixtureStatistics(input: FixtureStatisticsQuery): Promise<FixtureStatistics>;
}
```

### 8.3 Normalización obligatoria

El adapter debe convertir payloads externos en entidades internas. El dominio no debe depender directamente de nombres exactos del proveedor.

Debe normalizar:

- IDs de fixtures;
- equipos;
- ligas/competitions;
- temporadas;
- estado del partido;
- kickoff time;
- markets;
- selections;
- odds;
- líneas de over/under;
- estadísticas finales;
- resultados finales;
- metadata de cuota y rate limit cuando esté disponible.

### 8.4 Snapshots

Cada request relevante debe generar snapshot con:

- provider;
- endpoint logical name;
- request hash;
- response hash;
- capturedAt;
- quota metadata;
- redacted request metadata;
- raw payload almacenado según configuración.

Los snapshots son evidencia operativa y no un modo alternativo de ejecución.

### 8.5 Manejo de errores

Errores mínimos:

- provider unavailable;
- quota exceeded;
- rate limited;
- fixture not found;
- market not available;
- stale odds;
- incomplete statistics;
- invalid provider response;
- mapping error.

Todo error debe ser accionable y debe incluir:

- qué falló;
- fixture o market afectado;
- provider request ID si existe;
- condición esperada;
- condición recibida;
- siguiente acción recomendada.

---

## 9. Filtros de búsqueda deportiva

### 9.1 Objetivo

El MVP debe permitir buscar partidos de forma controlada y útil desde la TUI y CLI. La búsqueda debe soportar presets de ligas, presets de equipos y escaneo de cuotas bajas.

### 9.2 Configuración base

```ts
type ApiFootballFilterConfig = {
  defaultSeason: number;
  defaultLeagues: ApiFootballLeagueRef[];
  defaultTeams: ApiFootballTeamRef[];
  defaultMarkets: MarketKey[];
  lowOddsThreshold: number; // default 1.20
  kickoffWindowHours: number;
  includeLiveFixtures: boolean;
  includeCompletedFixtures: boolean;
  maxFixturesPerRun: number;
  bookmakerAllowlist?: string[];
};

type ApiFootballLeagueRef = {
  id: number;
  name: string;
  country?: string;
  enabled: boolean;
};

type ApiFootballTeamRef = {
  id: number;
  name: string;
  leagueIds?: number[];
  enabled: boolean;
};
```

Configuración inicial sugerida:

```json
{
  "apiFootball": {
    "defaultSeason": 2025,
    "defaultLeagues": [],
    "defaultTeams": [],
    "defaultMarkets": [
      "h2h",
      "double_chance",
      "goals_over_under",
      "corners_over_under",
      "btts"
    ],
    "lowOddsThreshold": 1.2,
    "kickoffWindowHours": 36,
    "includeLiveFixtures": false,
    "includeCompletedFixtures": false,
    "maxFixturesPerRun": 80
  }
}
```

Las ligas y equipos predeterminados pueden iniciar vacíos, pero el sistema debe permitir configurarlos desde TUI/CLI antes de ejecutar scans productivos.

### 9.3 Filtro por ligas predeterminadas

El operador debe poder definir una lista de ligas permitidas. Cuando un run use `--leagues default`, el sistema debe consultar solamente esas ligas.

Comandos requeridos:

```bash
pnpm gana leagues list
pnpm gana leagues add --id 39 --name "Premier League" --country England
pnpm gana leagues remove --id 39
pnpm gana fixtures --date YYYY-MM-DD --leagues default
```

Slash commands requeridos:

```text
/leagues
/leagues add 39 "Premier League" England
/leagues remove 39
/fixtures today leagues:default
```

Cada fixture encontrado debe registrar qué filtro lo incluyó.

### 9.4 Filtro por equipos predeterminados

El operador debe poder definir una lista de equipos permitidos o prioritarios. Cuando un run use `--teams default`, el sistema debe consultar fixtures relacionados con esos equipos.

Comandos requeridos:

```bash
pnpm gana teams list
pnpm gana teams add --id 33 --name "Manchester United" --league 39
pnpm gana teams remove --id 33
pnpm gana fixtures --date YYYY-MM-DD --teams default
```

Slash commands requeridos:

```text
/teams
/teams add 33 "Manchester United" league:39
/teams remove 33
/fixtures today teams:default
```

El filtro por equipos debe poder combinarse con ligas y fecha.

### 9.5 Escaneo de cuotas por debajo del umbral `1.20`

El sistema debe poder buscar todos los partidos disponibles con alguna selección de mercado cuya cuota decimal sea igual o menor al umbral configurado. El valor inicial del umbral es `1.20`.

Definición:

```ts
type LowOddsScanQuery = {
  date: string;
  season?: number;
  leagueIds?: number[];
  teamIds?: number[];
  markets: MarketKey[];
  threshold: number; // default 1.20
  comparison: 'lte';
  bookmakerAllowlist?: string[];
  maxResults?: number;
};

type LowOddsHit = {
  fixtureId: string;
  providerFixtureId: string;
  leagueId?: number;
  homeTeamId: string;
  awayTeamId: string;
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  impliedProbability: number;
  bookmaker?: string;
  capturedAt: string;
  includedByFilters: string[];
};
```

Comandos requeridos:

```bash
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20 --leagues default
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20 --teams default
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20 --markets h2h,double_chance,btts
```

Slash commands requeridos:

```text
/low-odds today
/low-odds today threshold:1.20
/low-odds today leagues:default
/low-odds today teams:default
```

La TUI debe mostrar:

- fixture;
- liga;
- hora;
- mercado;
- selección;
- cuota;
- probabilidad implícita;
- bookmaker si está disponible;
- filtros que incluyeron el resultado;
- estado de elegibilidad.

### 9.6 Combinación de filtros

Los filtros deben poder combinarse bajo reglas claras:

- `date` es obligatorio para scans diarios.
- `leagueIds` limita la búsqueda a ligas específicas.
- `teamIds` limita la búsqueda a equipos específicos.
- Si se usan ligas y equipos juntos, se devuelven fixtures que cumplan al menos una condición configurable: `AND` u `OR`.
- El comportamiento por defecto recomendado es `OR` para descubrimiento y `AND` para runs focalizados.
- `markets` limita las odds consultadas.
- `threshold` aplica sobre odds decimales normalizadas.
- `bookmakerAllowlist` limita bookmakers cuando se configure.
- `maxFixturesPerRun` protege cuota y rendimiento.

### 9.7 Razones de inclusión y exclusión

Cada fixture o hit de cuota debe incluir razón legible:

- `included-by-default-league`;
- `included-by-default-team`;
- `included-by-low-odds-threshold`;
- `included-by-manual-query`;
- `excluded-missing-odds`;
- `excluded-market-not-available`;
- `excluded-above-threshold`;
- `excluded-outside-window`;
- `excluded-provider-rate-limit`;
- `excluded-max-fixtures-reached`.

### 9.8 Persistencia de filtros

La DB debe almacenar:

- presets de ligas;
- presets de equipos;
- umbral activo;
- filtros usados por run;
- resultados del scan;
- odds snapshots relacionados;
- razones de inclusión/exclusión.

---

## 10. DigitalOcean DB y persistencia durable

### 10.1 Objetivo

DigitalOcean DB es el backend durable del MVP. La DB debe persistir entidades operativas, mientras que los artifacts siguen siendo paquetes exportables de evidencia.

### 10.2 Tecnología

Requisitos:

- DigitalOcean Managed Database.
- Prisma como ORM recomendado.
- Conexión por `DATABASE_URL` o secret manager.
- Redacción obligatoria de credenciales.
- Migraciones versionadas.

El motor puede ser PostgreSQL o MySQL según decisión de implementación. Si se requiere una decisión por defecto, se recomienda PostgreSQL por su soporte de JSON estructurado y auditoría flexible.

### 10.3 Entidades mínimas

- `Fixture`
- `Team`
- `Competition`
- `LeaguePreset`
- `TeamPreset`
- `SearchFilterPreset`
- `LowOddsScan`
- `LowOddsHit`
- `ProviderSnapshot`
- `CanonicalMarketSnapshot`
- `ResearchBundle`
- `SourceRecord`
- `EvidenceItem`
- `Claim`
- `AgentRun`
- `Prediction`
- `Parlay`
- `ParlayLeg`
- `ValidationArtifact`
- `HarnessTask`
- `HarnessRun`
- `Artifact`
- `Approval`
- `AuditLog`
- `ProviderQuotaSample`

### 10.4 Principios de persistencia

- Todo output promocionable debe enlazar run, fixture, odds snapshot, evidence y validation status.
- Todo provider snapshot debe tener hash.
- Todo scan de cuotas debe registrar filtros aplicados.
- Todo claim crítico debe enlazar fuente.
- Todo task debe cerrar con artifact o razón de no generación.
- Todo artifact debe tener metadata en DB.
- Todo auto-approval debe quedar en audit log.
- Las credenciales no deben persistirse.

### 10.5 Estado de DB

El comando `/db` y `pnpm gana db status` deben mostrar:

- connected/disconnected;
- engine;
- migration status;
- last write;
- last read;
- active run count;
- redacted connection identity;
- errores accionables si falla la conexión.

---

## 11. Flujo funcional canónico

### RF-001: Inicio de TUI

Al ejecutar `pnpm gana`, el sistema debe:

1. cargar configuración con `loadConfig`;
2. resolver provider agentic activo;
3. validar auth del provider seleccionado;
4. validar estado de API-Football;
5. validar conexión a DigitalOcean DB;
6. crear o abrir sesión JSONL;
7. renderizar banner y estado inicial;
8. activar slash commands;
9. preparar renderer de eventos agrupados;
10. mostrar perfil operativo activo;
11. mostrar filtros activos.

### RF-002: Cambio de provider agentic

El comando `/provider` debe permitir cambiar entre:

- `codex`;
- `deprecated-provider`;

El cambio de provider debe:

- verificar auth local;
- resolver modelo por defecto;
- reiniciar sesión agentic del proveedor anterior;
- limpiar thread/session ID;
- mantener session JSONL del harness;
- registrar evento de cambio.

### RF-003: Cambio de modelo

El comando `/model` debe listar modelos del provider activo.

Fuentes:

- Codex: `config/codex-models.json` o cache local del CLI.
- deprecated provider: `config/deprecated-provider-models.json`, settings locales o catálogo disponible.

El cambio de modelo debe registrarse en session y run context.

### RF-004: Gestión de filtros

El sistema debe permitir consultar y modificar filtros activos desde TUI y CLI.

Debe soportar:

- ligas predeterminadas;
- equipos predeterminados;
- temporada predeterminada;
- markets permitidos;
- umbral de cuota;
- ventana horaria;
- límite máximo de fixtures por run.

### RF-005: Discover fixtures

El sistema debe listar fixtures desde API-Football por:

- fecha;
- liga;
- temporada;
- equipo;
- estado;
- ventana horaria;
- presets activos.

Cada fixture debe normalizarse a entidad interna y persistirse.

### RF-006: Scan low odds

El sistema debe consultar odds y detectar partidos con alguna cuota decimal igual o menor a `1.20`, o al umbral configurado.

Debe producir:

- lista de hits;
- fixture asociado;
- mercado;
- selección;
- cuota;
- implied probability;
- bookmaker si existe;
- snapshot ID;
- razón de inclusión;
- estado de elegibilidad.

### RF-007: Ingest odds

El sistema debe consultar y normalizar odds desde API-Football hacia `CanonicalMarketSnapshot`.

Campos mínimos:

- fixture ID interno;
- provider fixture ID;
- provider;
- capturedAt;
- bookmaker count;
- market key;
- selection key;
- line, si aplica;
- price;
- implied probability;
- payload hash;
- source snapshot ID;
- quota metadata;
- request correlation ID.

### RF-008: Select candidates

El operador debe poder seleccionar fixtures manualmente o por policy:

- fixture programado o elegible;
- odds disponibles;
- markets requeridos disponibles;
- odds bajo umbral cuando el scan lo solicite;
- datos no obsoletos;
- kickoff window válido;
- provider confidence suficiente;
- no existe run activo duplicado;
- no hay bloqueo de validación previa.

Cada candidato debe incluir razón legible:

- `eligible`;
- `low-odds-hit`;
- `missing-odds`;
- `missing-market`;
- `stale-odds`;
- `outside-window`;
- `provider-limited`;
- `manual-include`;
- `manual-exclude`.

### RF-009: Run research

Research debe producir datos estructurados, no solo texto.

Entidades mínimas:

- `SourceRecord`;
- `EvidenceItem`;
- `Claim`;
- `ResearchGateResult`.

Fuentes permitidas:

- API-Football payloads;
- snapshots persistidos;
- web search nativo del provider agentic;
- datos de DB previamente persistidos;
- artifacts del propio harness.

Si una predicción depende de research y no existen fuentes suficientes, debe quedar `review-required` o `blocked`.

### RF-010: Score predictions

El scoring debe generar predicciones atómicas para mercados iniciales:

- `h2h`;
- `double_chance`;
- `goals_over_under`;
- `corners_over_under`;
- `btts`.

Cada predicción debe incluir:

- fixture ID;
- filtros que seleccionaron el fixture;
- market;
- selection;
- line, si aplica;
- odds;
- implied probability;
- estimated probability;
- edge;
- confidence;
- quality;
- evidence IDs;
- provider agentic;
- model;
- prompt version;
- scoring rule version;
- reasoning breve;
- warnings;
- status;
- generatedAt.

### RF-011: Build parlay candidate

El builder de parlay debe:

- usar solo predicciones estructuradas;
- limitar cantidad de legs por configuración;
- evitar múltiples legs del mismo fixture salvo override explícito;
- calcular odds combinadas;
- calcular confidence agregada;
- explicar riesgo agregado;
- registrar razones de inclusión y exclusión;
- generar artifact propio;
- no ejecutar acciones monetarias.

### RF-012: Validate settlement

La validación debe consultar resultados y estadísticas finales disponibles desde API-Football y compararlos con reglas versionadas.

Estados:

- `pending`;
- `won`;
- `lost`;
- `push`;
- `voided`;
- `error`;
- `blocked`.

Cada `ValidationArtifact` debe incluir:

- prediction ID;
- parlay ID, si aplica;
- result input;
- settlement rule version;
- status;
- evaluatedAt;
- evidence links;
- provider result snapshot;
- error o degradation reason si aplica.

### RF-013: Persistencia productiva

El sistema debe persistir en DigitalOcean DB:

- fixtures;
- teams;
- competitions;
- presets de ligas;
- presets de equipos;
- filtros aplicados;
- scans de cuotas;
- provider snapshots;
- odds snapshots;
- research bundles;
- predictions;
- parlays;
- validations;
- harness runs;
- harness tasks;
- approvals;
- audit logs;
- artifact metadata;
- agent usage.

### RF-014: Export handoff

Cada run debe exportar un handoff que incluya:

- objetivo;
- perfil;
- provider deportivo;
- provider agentic;
- modelo;
- filtros aplicados;
- fixtures procesados;
- low odds hits;
- predictions;
- parlays;
- validations;
- gates;
- riesgos;
- errores;
- siguiente acción sugerida;
- enlaces a artifacts.

---

## 12. Mercados iniciales

Los mercados iniciales de Gana v9 son:

1. `h2h`
2. `double_chance`
3. `goals_over_under`
4. `corners_over_under`
5. `btts`

### 12.1 `h2h`

Selecciones:

- `home`;
- `draw`;
- `away`.

Settlement:

- `home`: gana equipo local.
- `draw`: empate.
- `away`: gana equipo visitante.

### 12.2 `double_chance`

Selecciones:

- `home_or_draw`;
- `home_or_away`;
- `draw_or_away`.

Settlement:

- `home_or_draw`: local gana o empata.
- `home_or_away`: cualquier equipo gana, no empate.
- `draw_or_away`: visitante gana o empata.

### 12.3 `goals_over_under`

Selecciones:

- `over` con línea numérica;
- `under` con línea numérica.

Settlement:

- usa goles totales del resultado final;
- si la línea permite push, debe registrarse `push`;
- si el resultado final no está disponible, queda `pending` o `blocked` según contexto.

### 12.4 `corners_over_under`

Selecciones:

- `over` con línea numérica;
- `under` con línea numérica.

Settlement:

- usa total de corners del partido según estadísticas finales del provider;
- si las estadísticas de corners no están disponibles, el validation artifact debe quedar `blocked` con razón `corners-statistics-unavailable`;
- no se debe inferir corners desde texto no verificable.

### 12.5 `btts`

Selecciones:

- `yes`;
- `no`.

Settlement:

- `yes`: ambos equipos anotan al menos un gol;
- `no`: al menos un equipo termina con cero goles.

### 12.6 Contrato común de market

```ts
type MarketKey =
  | 'h2h'
  | 'double_chance'
  | 'goals_over_under'
  | 'corners_over_under'
  | 'btts';

type MarketSelection = {
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  impliedProbability: number;
  sourceSnapshotId: string;
};
```

---

## 13. Modelo de datos compacto

### 13.1 Fixture

```ts
type Fixture = {
  id: string;
  provider: 'api-football';
  providerFixtureId: string;
  competitionId?: string;
  leagueId?: number;
  season?: number;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled' | 'unknown';
  scoreHome?: number;
  scoreAway?: number;
  includedByFilters: string[];
  createdAt: string;
  updatedAt: string;
};
```

### 13.2 SearchFilterPreset

```ts
type SearchFilterPreset = {
  id: string;
  name: string;
  defaultSeason: number;
  leagueIds: number[];
  teamIds: string[];
  markets: MarketKey[];
  lowOddsThreshold: number;
  kickoffWindowHours: number;
  maxFixturesPerRun: number;
  createdAt: string;
  updatedAt: string;
};
```

### 13.3 LowOddsScan

```ts
type LowOddsScan = {
  id: string;
  runId: string;
  date: string;
  threshold: number;
  markets: MarketKey[];
  leagueIds: number[];
  teamIds: string[];
  totalFixturesChecked: number;
  totalHits: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
};
```

### 13.4 LowOddsHit

```ts
type LowOddsHit = {
  id: string;
  scanId: string;
  fixtureId: string;
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  impliedProbability: number;
  bookmaker?: string;
  capturedAt: string;
  sourceSnapshotId: string;
  includedByFilters: string[];
  eligibilityStatus: 'eligible' | 'review-required' | 'blocked';
};
```

### 13.5 CanonicalMarketSnapshot

```ts
type CanonicalMarketSnapshot = {
  id: string;
  fixtureId: string;
  provider: 'api-football';
  market: MarketKey;
  selection: string;
  line?: number;
  price: number;
  impliedProbability: number;
  bookmaker?: string;
  bookmakerCount?: number;
  capturedAt: string;
  payloadHash: string;
  sourceSnapshotId: string;
};
```

### 13.6 Prediction

```ts
type Prediction = {
  id: string;
  fixtureId: string;
  market: MarketKey;
  selection: string;
  line?: number;
  odds?: number;
  impliedProbability?: number;
  estimatedProbability: number;
  edge?: number;
  confidence: number;
  quality: number;
  rationale: string;
  warnings: string[];
  evidenceIds: string[];
  includedByFilters: string[];
  providerAgentic: 'codex' | 'deprecated-provider';
  model: string;
  promptVersion: string;
  scoringRuleVersion: string;
  sourceRunId: string;
  status: 'draft' | 'candidate' | 'review-required' | 'promotable' | 'blocked';
  generatedAt: string;
};
```

### 13.7 Parlay

```ts
type Parlay = {
  id: string;
  sourceRunId: string;
  legs: ParlayLeg[];
  combinedOdds?: number;
  aggregateConfidence: number;
  aggregateQuality: number;
  rationale: string;
  warnings: string[];
  status: 'draft' | 'candidate' | 'review-required' | 'promotable' | 'blocked';
  generatedAt: string;
};
```

### 13.8 HarnessRun

```ts
type HarnessRun = {
  id: string;
  objective: string;
  runtime: 'mvp-productivo-online';
  profile: 'standard' | 'full-permissions';
  providerSports: 'api-football';
  providerAgentic: 'codex' | 'deprecated-provider';
  model: string;
  filterPresetId?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  verdict?: 'promotable' | 'review-required' | 'blocked';
  artifactDir: string;
};
```

---

## 14. Eventos del harness

### 14.1 Agent events

```ts
type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; callId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; callId: string; output: string }
  | { type: 'reasoning'; delta: string };
```

### 14.2 Harness events

```ts
type HarnessEvent =
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
  | 'agent.completed'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.auto_granted'
  | 'artifact.written'
  | 'gate.passed'
  | 'gate.blocked'
  | 'task.completed'
  | 'task.failed';
```

Cada evento debe incluir:

- `eventId`;
- `runId`;
- `taskId`;
- `correlationId`;
- `traceId`;
- `timestamp`;
- `runtime`;
- `profile`;
- `providerAgentic`;
- `providerSports`;
- `severity`;
- `payload` redacted cuando aplique.

---

## 15. Artifacts y evidence packs

### 15.1 Artifact root

```text
.artifacts/gana-v9/
  sessions/
  runs/
  evidence-packs/
  handoffs/
```

### 15.2 Run directory

```text
.artifacts/gana-v9/runs/<run-id>/
  run.json
  input.json
  filters.json
  events.jsonl
  provider-snapshots.jsonl
  agent-events.jsonl
  low-odds-scan.json
  predictions.json
  parlays.json
  validations.json
  evaluation.json
  audit-log.jsonl
  handoff.md
```

### 15.3 Evidence pack

Un evidence pack debe contener:

- manifest;
- runtime;
- profile;
- provider deportivo;
- provider agentic;
- modelo;
- filtros aplicados;
- ligas predeterminadas usadas;
- equipos predeterminados usados;
- umbral de cuota usado;
- input fixture IDs;
- API-Football snapshots;
- low odds hits;
- odds snapshots;
- research sources;
- claims;
- predictions;
- parlays;
- validations;
- approvals y auto-approvals;
- gate results;
- DB record IDs relevantes;
- hashes de payloads;
- errores y degradaciones;
- resumen humano;
- metadata para auditoría.

### 15.4 Evaluation verdict

Cada run debe terminar con uno de estos verdicts:

- `promotable`: evidencia completa, snapshots persistidos, filtros registrados, no errores críticos y validación suficiente.
- `review-required`: output útil, pero faltan datos, hay warnings relevantes o se requiere revisión humana.
- `blocked`: falla crítica, provider incompleto, datos insuficientes, error de DB, error de validación o violación de policy.

---

## 16. Tools, permisos y seguridad

### 16.1 Tools existentes

El código actual ya define tools locales útiles:

- `file_read`;
- `file_write`;
- `file_edit`;
- `glob`;
- `grep`;
- `list_dir`;
- `shell`.

Estas tools deben integrarse al modelo de permisos del harness, aunque los proveedores CLI también puedan invocar herramientas propias.

### 16.2 Metadata requerida por tool

```ts
type ToolMetadata = {
  name: string;
  readOnly: boolean;
  mutatesFilesystem: boolean;
  runsShell: boolean;
  network: boolean;
  destructive: boolean;
  requiresApproval: 'never' | 'standard' | 'always';
};
```

### 16.3 Política por perfil

#### Perfil `standard`

- `file_read`, `grep`, `glob`, `list_dir`: permitido.
- `file_write`, `file_edit`: requiere approval.
- `shell`: requiere approval si el comando modifica, instala, borra, expone secretos o sale del workspace.
- `api_football_request`: permitido si la configuración está completa.
- `db_write`: permitido si la conexión DB está validada.
- `artifact_promote`: requiere approval.
- `prediction_promote`: requiere approval.

#### Perfil `full-permissions`

- Autoautoriza herramientas y acciones configuradas.
- No solicita aprobación repetitiva.
- Registra auto-approval en audit log.
- Mantiene redacción de secretos.
- Mantiene timeout de shell.
- Mantiene límite de output.
- Permite `danger-full-access` en Codex solo si está explícitamente configurado.
- Permite `deprecated-providerApprovalMode: yolo`.

### 16.4 Audit log

Cada acción sensible debe registrar:

- action ID;
- session ID;
- run ID;
- provider agentic;
- modelo;
- perfil activo;
- tool name;
- argumentos redacted;
- timestamp;
- resultado;
- si fue approval manual o auto-approval.

### 16.5 Redacción obligatoria

Debe ocultarse en logs, sessions, artifacts y errores:

- API keys;
- OAuth tokens;
- refresh tokens;
- headers completos;
- `.env` con secretos;
- URLs con tokens;
- cadenas que coincidan con patrones de credenciales.

### 16.6 Restricción monetaria

El sistema no debe:

- ejecutar apuestas;
- integrarse con casas de apuestas para colocar jugadas;
- mover fondos;
- solicitar datos financieros del usuario;
- presentar candidatos como garantía de resultado.

---

## 17. Requisitos no funcionales

### RNF-001: Runtime

- Node.js 22+.
- TypeScript estricto.
- pnpm.
- TUI compatible con macOS y Linux.
- Entrada plain cuando no hay TTY.

### RNF-002: Operación productiva online

- La operación normal requiere API-Football.
- La operación normal requiere DigitalOcean DB.
- La operación agentic requiere Codex CLI o deprecated provider CLI autenticado.
- Research actual requiere proveedor agentic con web search nativo disponible.
- Los errores de red deben ser explícitos y accionables.

### RNF-003: Performance interactiva

- Primer render de TUI en menos de 2 segundos en repo ya instalado.
- Slash commands deben responder sin bloquear la pantalla.
- Requests lentos deben mostrar loader y eventos de progreso.
- Scans de cuotas deben respetar límites configurables para proteger cuota y rendimiento.

### RNF-004: Observabilidad

- Todo run debe tener eventos JSONL.
- Todo provider request debe tener correlation ID.
- Todo filtro aplicado debe quedar registrado.
- Todo DB write importante debe tener audit trail.
- Todo artifact debe tener hash o metadata verificable.

### RNF-005: Mantenibilidad

Regla guía:

- TUI renderiza y envía comandos.
- Runtime ejecuta.
- Domain calcula.
- Providers consultan externos.
- Filter engine selecciona.
- Storage persiste.
- Evidence documenta.
- Permissions controla.

### RNF-006: Mensajes de fallo

Cada error debe incluir:

- qué falló;
- condición esperada;
- condición recibida;
- archivo, run, fixture o provider afectado;
- siguiente acción recomendada;
- comando sugerido si aplica.

---

## 18. Criterios de aceptación

Gana v9 se considera funcional en este SRS cuando:

1. `pnpm gana` abre la TUI.
2. La TUI muestra provider agentic, modelo, perfil, API-Football status, DB status y filtros activos.
3. `/provider` cambia entre Codex CLI, deprecated provider CLI y OpenRouter cuando están configurados.
4. `/model` lista modelos del provider activo usando catálogos locales.
5. `/web live` exige uso de web search nativo en tareas de research.
6. `/profile full-permissions` activa autoautorización auditada.
7. `/leagues` permite configurar ligas predeterminadas.
8. `/teams` permite configurar equipos predeterminados.
9. `/threshold` permite ver o cambiar el umbral de cuota, con default `1.20`.
10. `/low-odds` muestra partidos con cuotas iguales o menores al umbral activo.
11. `pnpm gana football status` verifica API-Football sin exponer secretos.
12. `pnpm gana db status` verifica DigitalOcean DB sin exponer credenciales.
13. `pnpm gana fixtures --date YYYY-MM-DD` obtiene fixtures reales desde API-Football.
14. `pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20` obtiene y persiste hits de cuotas bajas.
15. `pnpm gana odds --fixture-id ID` obtiene y normaliza odds reales.
16. El sistema genera predicciones para `h2h`, `double_chance`, `goals_over_under`, `corners_over_under` y `btts`.
17. El sistema construye candidatos de parlay sin ejecutar acciones monetarias.
18. El sistema valida resultados con API-Football y genera `ValidationArtifact`.
19. Fixtures, odds, filters, scans, predictions, parlays, validations, runs y audit logs se persisten en DigitalOcean DB.
20. Cada run produce evidence pack y handoff.
21. Cada run termina con verdict `promotable`, `review-required` o `blocked`.
22. Secrets quedan redacted en logs, sessions, artifacts y errores.
23. El perfil `full-permissions` reduce prompts repetitivos sin eliminar auditabilidad.

---

## 19. Cambios requeridos sobre el código actual

### 19.1 Mantener

Debe conservarse la estructura actual:

- `src/agent.ts` como router de providers agentic.
- `src/cli.ts` como entrada TUI/CLI.
- `src/commands.ts` como base de slash commands.
- `src/config.ts` como carga de configuración.
- `src/renderer.ts` como render de eventos.
- `src/session.ts` como sesiones JSONL.
- `src/tools/*` como herramientas base.
- Scripts de actualización de modelos para Codex y deprecated provider.

### 19.2 Agregar

Agregar módulos:

```text
src/runtime/
src/providers/sports/api-football.ts
src/storage/db.ts
src/storage/repositories/
src/domain/
src/prediction/
src/parlay/
src/validation/
src/evidence/
src/permissions/
src/filters/
```

### 19.3 Extender `config.ts`

Agregar campos:

```ts
type GanaRuntime = 'mvp-productivo-online';
type GanaProfile = 'standard' | 'full-permissions';

interface GanaConfigExtension {
  runtime: GanaRuntime;
  profile: GanaProfile;
  apiFootballKey: string;
  apiFootballBaseUrl: string;
  databaseUrl: string;
  artifactRoot: string;
  approvalMode: 'manual' | 'auto-grant';
  apiFootball: ApiFootballFilterConfig;
}
```

### 19.4 Extender `commands.ts`

Agregar slash commands:

- `/profile`
- `/approval`
- `/db`
- `/football`
- `/filters`
- `/leagues`
- `/teams`
- `/threshold`
- `/fixtures`
- `/low-odds`
- `/odds`
- `/research`
- `/score`
- `/parlay`
- `/validate`
- `/run`
- `/artifacts`
- `/export`

### 19.5 Extender renderer

El renderer debe poder mostrar:

- provider events;
- DB events;
- football provider events;
- filter events;
- low odds hits;
- audit events;
- validation verdict;
- artifact written;
- quota/rate-limit status.

### 19.6 Extender session

Las sesiones JSONL deben incluir:

- message;
- turn_started;
- turn_finished;
- tool_call;
- tool_result;
- provider_event;
- db_event;
- filter_event;
- low_odds_event;
- approval_event;
- auto_approval_event;
- artifact_event;
- error;
- usage.

---

## 20. Referencias de diseño interno

Este SRS se alinea con los siguientes elementos ya presentes en el código:

- `src/agent.ts`: selección de provider `codex`, `deprecated-provider`, `openrouter`; ejecución por `spawn`; normalización de eventos; enforcement de web search nativo.
- `src/config.ts`: configuración de provider, modelo, native web search, Codex sandbox y deprecated provider approval mode.
- `src/commands.ts`: slash commands `/provider`, `/model`, `/fast`, `/think`, `/web`, `/new`, `/help`.
- `scripts/update-codex-models.ts`: catálogo de modelos Codex.
- `scripts/update-deprecated-provider-models.ts`: catálogo de modelos deprecated provider.
- `src/tools/*`: herramientas de archivo, búsqueda y shell.
- `src/renderer.ts`: visualización grouped/minimal/emoji de tool events.
- `src/session.ts`: persistencia JSONL append-only.

---

## 21. Resumen ejecutivo

Gana v9 debe ser una consola/harness de predicción deportiva operada desde TUI, con enfoque de **MVP productivo online** desde el primer corte. El sistema debe consultar API-Football, aplicar filtros por ligas, equipos, mercados y cuotas, detectar partidos con cuotas iguales o menores a `1.20`, persistir todo en DigitalOcean DB, usar agentes reales por Codex CLI y deprecated provider CLI, soportar perfil de permisos completos, generar evidencia obligatoria y validar predicciones bajo reglas versionadas.

La frase que resume este SRS es:

> Gana v9 será un harness TUI-first de operación productiva online, conectado a API-Football y DigitalOcean DB, asistido por Codex/deprecated provider, con filtros deportivos desde el inicio y predicciones auditables antes de cualquier promoción.
