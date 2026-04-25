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
   - Preparar configuracion, perfiles, artifact root y contratos transversales.
   - Debe dejar listo el suelo para que los planes siguientes registren runs y eventos sin inventar formatos distintos.

2. `02-provider-agentic-y-sesiones.md`
   - Consolidar el contrato Codex/Gemini/Cursor que ya existe en `src/agent.ts`.
   - Agregar estado de sesion, web search requerido, profile awareness y eventos normalizados.

3. `03-db-digitalocean-postgres.md`
   - Crear el baseline de DigitalOcean PostgreSQL + Prisma.
   - Este plan bloquea cualquier persistencia productiva, evidence durable y validation historica.

4. `04-api-football-provider-y-normalizacion.md`
   - Implementar el proveedor deportivo real y snapshots.
   - Este plan desbloquea fixtures, odds, resultados y estadisticas reales.

5. `05-filtros-fixtures-y-low-odds.md`
   - Construir los filtros operativos del MVP: ligas, equipos, mercados y threshold `1.20`.
   - Depende de DB y API-Football para persistir presets, scans y hits.

6. `06-domain-mercados-y-settlement.md`
   - Fijar los tipos y reglas de mercados.
   - Debe ser estable antes de scoring, parlay y validation.

7. `07-research-scoring-y-predictions.md`
   - Generar evidencia, claims y predicciones atomicas estructuradas.
   - Depende de provider agentic, dominio, DB, snapshots y filtros.

8. `08-parlay-builder-y-validation.md`
   - Construir parlays desde predicciones y validar settlement.
   - Depende de reglas de mercado, resultados finales y estadisticas.

9. `09-tui-cli-headless.md`
   - Cerrar la experiencia operativa: TUI, slash commands y CLI headless.
   - Debe exponer capacidades ya implementadas, no duplicar logica.

10. `10-permisos-auditoria-y-seguridad.md`
    - Completar approvals, auto-approvals, audit log y redaccion.
    - Se puede iniciar temprano, pero debe cerrar despues de conocer todos los eventos sensibles.

11. `11-qa-aceptacion-y-e2e.md`
    - Definir matriz final de pruebas y aceptacion.
    - Debe ejecutarse como cierre del MVP vertical.

## Cortes verticales

### Corte 1: Harness arranca con estado real

- Config extendida con runtime, profile, DB/API env vars redacted y artifacts.
- `/session`, `/profile`, `/approval`, `/db`, `/football` existen aunque algunas respuestas iniciales sean de estado/configuracion.
- `pnpm gana` queda definido como target del producto.
- Aceptacion: la TUI muestra provider agentic, modelo, perfil, artifact root, DB status y API-Football status sin exponer secretos.

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

- `03-db-digitalocean-postgres` debe decidir schema antes de que `04`, `05`, `07`, `08`, `09` escriban persistencia.
- `06-domain-mercados-y-settlement` debe fijar `MarketKey`, selections y settlement antes de scoring y validation.
- `10-permisos-auditoria-y-seguridad` debe integrarse con `src/tools/*`, proveedores CLI, DB writes, artifact writes y comandos de promocion.
- `09-tui-cli-headless` debe llamar servicios del runtime; no debe poner reglas de negocio en `src/cli.ts` ni `src/commands.ts`.

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
- Revisar que el roadmap preserve la secuencia de dependencias: runtime/config, providers, DB, API-Football, filtros, dominio, scoring, parlay, TUI/CLI, seguridad y QA.
