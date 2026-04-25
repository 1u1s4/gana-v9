# Roadmap MVP Productivo Online

## Fuente canonica

- Fuente: `docs/planes/gana-v9-srs-mvp-productivo-online.md`.
- Fecha base del SRS: 2026-04-25.
- Decision de producto: Gana v9 es un MVP productivo online, TUI-first, con API-Football, DigitalOcean DB, proveedores agentic CLI reales y evidencia auditable.
- Este roadmap no reemplaza el SRS; lo convierte en una secuencia implementable adaptada al repo actual.

## SRS cubierto

- Secciones 0 a 3: decision canonica, proposito, principios y alcance MVP.
- Secciones 5 y 6: arquitectura de alto nivel, TUI y CLI.
- Secciones 7 a 10: proveedores agentic, API-Football, filtros y DB durable.
- Secciones 11 a 18: flujo funcional, mercados, datos, eventos, artifacts, seguridad, RNF y aceptacion.
- Seccion 19: cambios requeridos sobre el codigo actual.

## Contexto actual del repo

El repo actual es una TUI compacta TypeScript/Node:

- `src/cli.ts`: entrada interactiva, lectura de input, dispatch de slash commands, sesiones y renderer.
- `src/agent.ts`: router de proveedores `codex`, `gemini`, `cursor` y compatibilidad `openrouter`.
- `src/commands.ts`: slash commands actuales `/provider`, `/model`, `/fast`, `/think`, `/web`, `/new`, `/help`.
- `src/config.ts`: configuracion de provider/modelo/display/sesiones/web search/sandbox/auth local.
- `src/renderer.ts`: render de eventos agentic y tools.
- `src/session.ts`: JSONL simple de mensajes.
- `src/tools/*`: herramientas locales de archivo, busqueda y shell para el backend OpenRouter.

No existe todavia DB, API-Football, runtime deportivo, artifacts de runs, repositorios ni CLI headless `pnpm gana`.

## Orden de implementacion

1. `01-runtime-config-perfiles-y-artifacts.md`
   - Preparar configuracion, perfiles, artifact root, redaccion obligatoria y audit events minimos.
   - Debe dejar listo el suelo para que los planes siguientes registren runs/eventos sin inventar formatos distintos ni filtrar secretos.
   - PR-01 crea el bootstrap minimo `src/domain/markets.ts` con `MarketKey` y `DEFAULT_MARKETS` para que config pueda tipar `defaultMarkets`.

2. Skeleton temprano de comandos desde `09-tui-cli-headless.md`
   - Crear command registry minimo y CLI headless base para `/session`, `/profile`, `/approval`, `/db`, `/football` y `/filters`.
   - Es parte obligatoria de PR-01 y debe existir desde el Corte 1 para preservar el enfoque TUI-first mientras los servicios reales se conectan progresivamente.

3. `06-domain-mercados-y-settlement.md`
   - Fijar dominio minimo antes de API-Football y filtros: `Fixture`, `Odds`, `MarketKey`, selections, lineas e inicio de `settlement-v1`.
   - Este plan es dueno de `src/domain/*` y `src/validation/settlement-rules.ts`.

4. `03-db-digitalocean-postgres.md`
   - Crear el baseline de DigitalOcean PostgreSQL + Prisma.
   - Partir la implementacion en baseline de discovery + runs/audit/tasks minimos y expansion de prediccion para no bloquear fixtures/odds por research/parlays.

5. `04-api-football-provider-y-normalizacion.md`
   - Implementar el proveedor deportivo real y snapshots.
   - Debe consumir los tipos canonicos del dominio para mapear markets, selections, lineas, odds y resultados.

6. `05-filtros-fixtures-y-low-odds.md`
   - Construir los filtros operativos del MVP: ligas, equipos, mercados y threshold `1.20`.
   - Usa `MarketKey`, `Fixture` y `OddsQuote` del dominio; no crea tipos paralelos.

7. `02-provider-agentic-y-sesiones.md`
   - Consolidar el contrato Codex/Gemini/Cursor que ya existe en `src/agent.ts`.
   - Agregar estado de sesion, web search requerido, profile awareness y eventos normalizados.

8. `07-research-scoring-y-predictions.md`
   - Generar evidencia, claims y predicciones atomicas estructuradas.
   - Depende de provider agentic, dominio, DB, snapshots y filtros.

9. `08-parlay-builder-y-validation.md` fase parlay
   - Construir parlays desde predicciones estructuradas.
   - Debe consumir settlement rules del dominio, no redefinirlas.

10. `08-parlay-builder-y-validation.md` fase validation
    - Validar predictions/parlays contra resultados y estadisticas finales.
    - Debe enlazar provider snapshots y `settlement-v1`.

11. `09-tui-cli-headless.md` cierre de experiencia
    - Completar renderer extendido, comandos finales, `/run`, `/export`, `src/runtime/run-service.ts` y `src/runtime/pipeline.ts`.
    - Debe exponer capacidades ya implementadas, no duplicar logica.

12. `10-permisos-auditoria-y-seguridad.md`
    - Completar approvals, auto-approvals, audit log y redaccion.
    - Redaccion/audit basicos empiezan en el plan 01; este plan cierra la policy completa.

13. `11-qa-aceptacion-y-e2e.md`
    - Definir matriz final de pruebas y aceptacion.
    - Debe ejecutarse como cierre del MVP vertical.

## Cortes verticales

### Corte 1: Harness arranca con estado real

- Config extendida con runtime, profile, DB/API env vars redacted, artifacts y audit events minimos.
- Command registry minimo: `/session`, `/profile`, `/approval`, `/db`, `/football`, `/filters` y equivalentes headless de status existen aunque algunas respuestas iniciales sean de estado/configuracion.
- Bootstrap minimo de dominio: `MarketKey` y `DEFAULT_MARKETS` existen en `src/domain/markets.ts`; el dominio completo entra en el siguiente corte.
- DB baseline preparado para discovery: provider, competitions, teams, fixtures, snapshots, odds quotes, runs, tasks minimos, artifacts, audit logs, presets y low-odds.
- `pnpm gana` queda definido como target del producto.
- Aceptacion: la TUI muestra provider agentic, modelo, perfil, artifact root, DB status y API-Football status sin exponer secretos.

## Orden PR congelado

1. PR-01: runtime/config/redaction/profile + bootstrap `MarketKey` + skeleton TUI/CLI + status commands.
2. PR-02: dominio minimo completo: `Fixture`, `OddsQuote`, selections y `settlement-v1`.
3. PR-03: DB baseline DigitalOcean PostgreSQL + Prisma.
4. PR-04: API-Football provider + status/quota + fixtures.
5. PR-05: odds normalization + snapshots + odds quotes.
6. PR-06: filtros, presets, fixtures y low-odds.
7. PR-07: providers agentic formalizados + sessions/events/web requirement.
8. PR-08: research/evidence/claims.
9. PR-09: scoring y predictions.
10. PR-10: parlay builder.
11. PR-11: validation.
12. PR-12: run pipeline, export, handoff y evidence pack.
13. PR-13: seguridad completa + QA/E2E final.

### Corte 2: Descubrimiento deportivo persistido

- API-Football consulta fixtures/odds reales.
- DB persiste fixtures, teams, competitions, provider snapshots, odds snapshots y filtros aplicados.
- `/fixtures`, `/odds`, `/filters`, `/leagues`, `/teams`, `/threshold`, `/low-odds` funcionan.
- Aceptacion: un scan low-odds de una fecha produce hits, snapshots, DB records y artifacts.

### Corte 3: Prediccion auditable

- Research estructurado, claims, evidence items y scoring para mercados iniciales.
- Predicciones atomicas enlazan fixture, odds, evidence, run, provider agentic y modelo.
- Aceptacion: `pnpm gana score --fixture-id ID` genera una prediccion con verdict y artifact auditable.

### Corte 4: Parlay, validation y handoff

- Builder de parlays con legs normalizadas.
- Settlement con resultados/estadisticas de API-Football.
- Evidence pack y handoff por run.
- Aceptacion: `pnpm gana run --date YYYY-MM-DD` termina en `promotable`, `review-required` o `blocked`.

## Dependencias entre planes

- `06-domain-mercados-y-settlement` debe ejecutarse antes de `04-api-football-provider-y-normalizacion` y `05-filtros-fixtures-y-low-odds`, porque ambos necesitan `MarketKey`, selections, lineas y odds canonicas.
- `06-domain-mercados-y-settlement` es el unico dueno de `src/domain/*` y `src/validation/settlement-rules.ts`; los demas planes consumen esos tipos.
- `03-db-digitalocean-postgres` debe entregar primero el baseline de discovery; research/predictions/parlays/validation entran en la expansion.
- `09-tui-cli-headless` se divide en skeleton temprano y cierre final. El skeleton llama servicios disponibles; la TUI final no debe poner reglas de negocio en `src/cli.ts` ni `src/commands.ts`.
- `10-permisos-auditoria-y-seguridad` cierra la policy completa, pero redaccion, profile y audit events minimos son obligatorios desde `01-runtime-config-perfiles-y-artifacts`.

## Reglas de alcance

Incluido:

- TUI local y CLI headless.
- API-Football como unico proveedor deportivo inicial.
- DigitalOcean PostgreSQL durable.
- Codex CLI, Gemini CLI y Cursor Agent.
- Runs, events, snapshots, evidence packs y handoff.
- Filtros por ligas, equipos, mercados, fecha, ventana y odds `<= 1.20`.
- Predicciones y parlays analiticos.

Fuera:

- Dashboard web obligatorio.
- API publica obligatoria.
- Multi-worker deployment obligatorio desde el primer corte.
- Rutas simuladas como base del producto.
- Apuestas monetarias, casas de apuestas o movimiento de fondos.
- Dependencia estrategica de OpenRouter.

## Criterios de aceptacion documental

- Existen los 12 documentos en `docs/planes/por_hacer`.
- Cada documento indica secciones del SRS cubiertas.
- Cada documento menciona los modulos actuales afectados y los modulos nuevos esperados.
- Cada documento tiene criterios de aceptacion y pruebas.
- El plan DB incluye auditoria v6/v7/v8, decisiones conservadas y deudas rechazadas.
- No quedan decisiones tecnicas de alto impacto sin default explicito.

## Pruebas documentales

- Listar `docs/planes/por_hacer` y confirmar que existen los archivos `00` a `11`.
- Buscar `SRS cubierto`, `Criterios de aceptacion` y `Pruebas` en cada plan operativo.
- Revisar que ningun plan agregue dashboard web obligatorio, API publica obligatoria, multi-worker obligatorio o automatizacion monetaria.
- Revisar que el roadmap preserve la secuencia ajustada: runtime/config/redaccion, command skeleton, dominio minimo, DB baseline, API-Football, filtros, providers agentic, scoring, parlay, validation, TUI final, seguridad completa y QA.
