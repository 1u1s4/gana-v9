# DB DigitalOcean PostgreSQL

## Objetivo

Definir e implementar la base de datos durable de Gana v9 sobre DigitalOcean Managed PostgreSQL + Prisma, con migraciones versionadas, snapshots auditables, indices adecuados y repositorios para el runtime TUI-first.

## SRS cubierto

- Secciones 2.6, 8.4, 9.8, 10, 11 RF-013.
- Secciones 13, 14, 15, 16.4, 17.4.
- Cambios requeridos 19.2 y 19.3.

## Decision

- Motor: DigitalOcean Managed PostgreSQL.
- ORM: Prisma.
- Migraciones: Prisma migrations mas SQL manual complementario para Postgres cuando Prisma no cubra bien partial indexes, constraints, triggers o extensions.
- Naming DB: `snake_case`.
- IDs internos: `uuid`.
- Timestamps: `timestamptz`.
- JSON estructurado: `jsonb`.
- Odds/probabilidades: `numeric(12,6)`.
- No se porta literalmente ningun schema MySQL de v6/v7/v8.

## Auditoria v6/v7/v8

### Patrones a conservar

- Separacion entre catalogo deportivo, fixtures, snapshots, runtime, AI runs, predictions, parlays, validations y audit.
- Upserts idempotentes por claves deterministicas.
- `latest` o read models para lectura rapida, separados de snapshots historicos.
- Lineage por batch/run con hashes, trace IDs y correlation IDs.
- Cola/tareas persistidas con retries, leases y task runs.
- AI runs separados de predicciones finales.
- Parlay legs normalizadas en tabla propia.
- Cache o snapshots de resultados finales para validation.

### Deudas rechazadas

- MySQL-specific SQL (`ON DUPLICATE KEY UPDATE`, backticks, `LONGTEXT`, `TINYINT`, fechas sin timezone).
- JSON serializado como texto para payloads consultables.
- Arrays relacionales en JSON (`fixture_ids`, `prediction_ids`) cuando se requieren joins.
- `fac_odds` unico por fixture; v9 necesita historial por bookmaker/market/selection/line/tiempo.
- Cascades que destruyen trazabilidad historica de predictions/audit al borrar fixtures.
- Queries que cargan listas completas para construir snapshots operativos.
- Falta de constraints para predicciones "current".
- Indices incompletos para fixtures elegibles, latest odds, task queue y published predictions.
- Secretos en docs/migration guides; no migrar ningun secreto historico.

## Entrega por fases

### Fase A: DB baseline de discovery

Esta fase debe desbloquear `/db status`, `/football status`, fixtures, odds, filters y low-odds sin esperar research/parlays:

- `sports_providers`
- `competitions`
- `teams`
- `fixtures`
- `provider_snapshots`
- `odds_snapshots`
- `odds_quotes`
- `harness_runs`
- `harness_tasks`
- `artifacts`
- `audit_logs`
- `league_presets`
- `team_presets`
- `search_filter_presets`
- `low_odds_scans`
- `low_odds_hits`

### Fase B: expansion de prediccion

Esta fase entra cuando discovery persistido ya funciona:

- `agent_runs`
- `research_bundles`
- `source_records`
- `evidence_items`
- `claims`
- `predictions`
- `parlays`
- `parlay_legs`
- `validation_artifacts`
- `approvals`
- `provider_quota_samples`

La Fase A no debe esperar a que el modelo de research/predictions este perfecto. La Fase B debe usar las mismas claves, IDs y audit contracts definidos en la Fase A.

## Schema minimo v9

### Catalogo deportivo

- `sports_providers`
  - `id uuid`
  - `code text unique` (`api-football`)
  - `name text`
  - `base_url text`
  - `created_at timestamptz`

- `competitions`
  - `id uuid`
  - `provider_id uuid`
  - `provider_competition_id text`
  - `name text`
  - `country text`
  - `type text`
  - `metadata jsonb`
  - unique `(provider_id, provider_competition_id)`

- `teams`
  - `id uuid`
  - `provider_id uuid`
  - `provider_team_id text`
  - `name text`
  - `country text`
  - `metadata jsonb`
  - unique `(provider_id, provider_team_id)`

- `fixtures`
  - `id uuid`
  - `provider_id uuid`
  - `provider_fixture_id text`
  - `competition_id uuid`
  - `season int`
  - `home_team_id uuid`
  - `away_team_id uuid`
  - `scheduled_at timestamptz`
  - `status text`
  - `score_home int`
  - `score_away int`
  - `included_by_filters text[]`
  - `metadata jsonb`
  - unique `(provider_id, provider_fixture_id)`

### Filtros y scans

- `league_presets`
- `team_presets`
- `search_filter_presets`
- `low_odds_scans`
- `low_odds_hits`

`search_filter_presets` debe almacenar temporada, ligas, equipos, markets, threshold, ventana, include live/completed, max fixtures y allowlist de bookmakers.

`low_odds_hits` debe enlazar `scan_id`, `fixture_id`, `odds_quote_id`, market, selection, line, odds, implied probability, bookmaker, included/excluded reasons y eligibility.

### Snapshots de proveedor y odds

- `provider_snapshots`
  - provider, endpoint logical name, request hash, response hash, captured_at, quota metadata, request metadata redacted, raw payload jsonb opcional.

- `odds_snapshots`
  - fixture, provider snapshot, provider fixture id, bookmaker count, captured_at, payload hash.

- `odds_quotes`
  - snapshot, fixture, bookmaker, market_key, selection_key, line, price, implied_probability, captured_at.

No guardar solo una fila por fixture. Cada quote debe ser consultable por market/selection/line.

### Runtime y agentes

- `harness_runs`
- `harness_tasks`
- `agent_runs`
- `artifacts`
- `approvals`
- `audit_logs`
- `provider_quota_samples`

`harness_runs` debe contener runtime, profile, provider sports, provider agentic, model, filter preset, status, verdict, artifact dir y timestamps.

`agent_runs` debe guardar provider, model, prompt version, status, usage, web search used, error redacted y enlace a artifacts; prompts completos deben ir a artifacts redacted o tabla separada si se decide persistirlos.

### Research, predictions, parlay, validation

- `research_bundles`
- `source_records`
- `evidence_items`
- `claims`
- `predictions`
- `parlays`
- `parlay_legs`
- `validation_artifacts`

`predictions` debe enlazar fixture, run, market, selection, odds quote, evidence, provider agentic, model, prompt version, scoring rule version, status y warnings.

`parlay_legs` debe ser tabla normalizada, no JSON de IDs.

`validation_artifacts` debe enlazar prediction o parlay, result snapshot y settlement rule version.

## Indices y constraints minimos

- `fixtures(status, scheduled_at)`.
- `fixtures(competition_id, season, scheduled_at)`.
- `fixtures(home_team_id, scheduled_at)`.
- `fixtures(away_team_id, scheduled_at)`.
- `odds_quotes(fixture_id, market_key, captured_at desc)`.
- `odds_quotes(fixture_id, market_key, selection_key, line, captured_at desc)`.
- `provider_snapshots(provider_id, endpoint_name, captured_at desc)`.
- `low_odds_hits(scan_id, odds)`.
- `predictions(fixture_id, status, generated_at desc)`.
- Unique parcial para prediccion current si se agrega `is_current`:
  - `(fixture_id, market_key, selection_key, coalesce(line, -1), provider_agentic, prompt_version) where is_current`.
- `harness_tasks(status, scheduled_for, priority desc, created_at) where status = 'queued'`.
- `harness_tasks(lease_expires_at) where status = 'running'`.
- `audit_logs(run_id, created_at desc)`.
- BRIN opcional por tiempo en snapshots/audit si crecen rapido.

## Prisma y modulos

Agregar:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `src/storage/db.ts`
- `src/storage/repositories/*`
- `src/storage/types.ts`
- `src/storage/redacted-status.ts`

Actualizar:

- `package.json` con `prisma`, `@prisma/client` y scripts:
  - `db:generate`
  - `db:validate`
  - `db:migrate:dev`
  - `db:migrate:deploy`
  - `db:status`

`src/storage/db.ts` debe:

- crear singleton Prisma client;
- validar `DATABASE_URL`;
- exponer `getDbStatus()`;
- redacted connection identity;
- reportar migration status o degradar con mensaje accionable.

## `/db` y `pnpm gana db status`

Salida minima:

- connected/disconnected;
- engine `postgresql`;
- migration status;
- last read;
- last write;
- active run count;
- redacted host/db/user;
- error accionable si falta config o falla conexion.

## Criterios de aceptacion

- `npm run typecheck` pasa.
- `npm run db:validate` pasa.
- `prisma/schema.prisma` usa `postgresql`.
- No hay tablas con nombres MySQL heredados tipo `fac_*` salvo decision explicita documentada.
- Fase A: la DB puede persistir un run, fixture, provider snapshot, odds quote, low-odds scan/hit, artifact y audit log.
- Fase A: `harness_tasks` existe en version minima para trazabilidad de `/run`, aunque el MVP inicial ejecute comandos directos sin cola distribuida.
- Fase B: la DB puede persistir agent run, research bundle, prediction, parlay, validation y approval.
- `db status` no imprime credenciales.
- Cada FK relevante tiene indice.
- Los snapshots conservan hashes y captured_at.

## Pruebas

- Unit tests de mapping/repositories con Prisma test DB o mocks.
- Test de `getDbStatus` con `DATABASE_URL` faltante.
- Test de redaccion de `DATABASE_URL`.
- Migration validation en CI local.
- Smoke manual contra DB de desarrollo DigitalOcean:
  - `pnpm gana db status`
  - crear run de prueba;
  - insertar provider snapshot;
  - consultar artifact metadata.

## Riesgos

- Prisma no soporta todas las capacidades Postgres necesarias via schema; usar migraciones SQL complementarias y documentarlas.
- Evitar RLS/Supabase-specific si DigitalOcean PostgreSQL no lo requiere; si se adopta Supabase despues, agregar plan separado. Para v9 actual, seguridad se controla server-side/TUI y secretos locales.
- No persistir raw prompts sin redaccion y politica de retencion.
