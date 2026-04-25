# API-Football Provider y Normalizacion

## Objetivo

Implementar API-Football como proveedor deportivo obligatorio del MVP, con cliente HTTP, status/quota, normalizacion a entidades internas, snapshots persistidos, hashes y errores accionables.

## SRS cubierto

- Secciones 2.4, 2.5, 8, 9, 11 RF-005, RF-006, RF-007, RF-012.
- Secciones 14, 15 y 17.2.
- Cambios requeridos 19.2, 19.3, 19.5.

## Contexto actual

No existe `src/providers/sports`, cliente HTTP deportivo, config API-Football ni persistencia de snapshots. El SRS exige datos reales desde el inicio; no se debe crear una ruta simulada como producto.

## Cambios requeridos

### Modulos nuevos

- `src/providers/sports/types.ts`
- `src/providers/sports/api-football.ts`
- `src/providers/sports/api-football-mappers.ts`
- `src/providers/sports/api-football-errors.ts`
- `src/providers/sports/api-football-snapshots.ts`
- `src/providers/sports/index.ts`

### Contrato interno

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

### Config

Usar:

- `API_FOOTBALL_KEY`
- `API_FOOTBALL_BASE_URL`
- `GANA_DEFAULT_SEASON`
- `GANA_MAX_FIXTURES_PER_RUN`

El header de API debe pasar por redaccion en logs y snapshots. Nunca persistir API key.

### Endpoints logicos

El adapter debe encapsular endpoints de API-Football tras nombres logicos:

- `status`
- `fixtures`
- `odds`
- `fixture_result`
- `fixture_statistics`
- `leagues`
- `teams`

Los nombres logicos son los que se guardan en `provider_snapshots.endpoint_name`.

### Normalizacion obligatoria

Convertir payloads externos a dominio interno:

- provider fixture ID;
- competition/league;
- season;
- teams;
- kickoff time en `timestamptz`;
- status normalizado: `scheduled`, `live`, `completed`, `cancelled`, `unknown`;
- scores;
- markets;
- selections;
- lineas over/under;
- odds decimales;
- implied probability;
- bookmaker;
- result final;
- estadisticas finales, especialmente corners.

El dominio no debe depender de nombres nativos del proveedor.

### Snapshots

Cada request relevante debe generar `ProviderSnapshot`:

- provider;
- endpoint logical name;
- request hash;
- response hash;
- capturedAt;
- quota metadata;
- redacted request metadata;
- raw payload opcional segun config;
- correlationId;
- runId/taskId cuando exista.

Los snapshots son parte de la operacion productiva, no un modo alternativo.

### Errores accionables

Crear errores tipados:

- `provider_unavailable`
- `quota_exceeded`
- `rate_limited`
- `fixture_not_found`
- `market_not_available`
- `stale_odds`
- `incomplete_statistics`
- `invalid_provider_response`
- `mapping_error`

Cada error debe incluir:

- que fallo;
- fixture/market afectado si aplica;
- endpoint logico;
- condicion esperada;
- condicion recibida;
- provider request ID si existe;
- siguiente accion recomendada.

### Quota/status

`getStatus()` debe validar:

- API key presente;
- base URL valida;
- request minimo al proveedor;
- latencia;
- ultimo error redacted.

`getQuota()` debe parsear metadata disponible de headers/payload. Si API-Football no retorna cuota clara para el plan usado, devolver `unknown` con `lastCheckedAt` y no inventar numeros.

## Persistencia

El provider no debe escribir directamente en todas las tablas. Debe devolver objetos normalizados y snapshots; los servicios de runtime/repositories coordinan persistencia.

Excepciones permitidas:

- un helper `captureProviderSnapshot` puede recibir repository inyectado;
- `football status` puede guardar `provider_quota_samples`.

## Comandos relacionados

Slash:

- `/football`
- `/fixtures`
- `/odds`
- `/low-odds`
- `/validate`

Headless:

- `pnpm gana football status`
- `pnpm gana fixtures --date YYYY-MM-DD`
- `pnpm gana odds --fixture-id ID`
- `pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20`
- `pnpm gana validate --date YYYY-MM-DD`

## Criterios de aceptacion

- `football status` detecta config faltante sin crash.
- Con API key valida, `football status` muestra `ready` y metadata redacted.
- `listFixtures` normaliza fixtures reales para una fecha.
- `getOdds` produce quotes por market/selection/line/bookmaker.
- Cada request relevante genera hash y snapshot.
- `getFixtureStatistics` puede distinguir `corners-statistics-unavailable`.
- Errores de provider son legibles y accionables.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de mappers con fixtures JSON reales redacted.
- Unit tests de hash estable por request/response.
- Unit tests de errores por payload invalido, fixture faltante y market faltante.
- Integration test opcional detras de env `RUN_API_FOOTBALL_INTEGRATION=true`.
- Smoke manual:
  - `pnpm gana football status`
  - `pnpm gana fixtures --date YYYY-MM-DD`
  - `pnpm gana odds --fixture-id ID`

## Riesgos

- API-Football puede cambiar nombres de mercados/bookmakers. Mantener mapper defensivo y registrar `mapping_error`.
- No asumir que todos los mercados estan disponibles para todos los fixtures.
- Proteger cuota con `maxFixturesPerRun`, caching/snapshots y errores de rate limit.

