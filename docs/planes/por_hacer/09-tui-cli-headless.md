# TUI y CLI Headless

## Objetivo

Convertir la TUI actual en la superficie operativa de Gana v9 y agregar CLI headless `pnpm gana ...` para flujos principales, sin mover logica de dominio al renderer ni a los comandos.

Este plan se implementa en dos momentos: un skeleton temprano en Corte 1 y una experiencia final cuando los servicios productivos ya existan.

## SRS cubierto

- Secciones 2.1, 3.1, 6, 11 RF-001 a RF-014.
- Secciones 17.1, 17.3, 17.6.
- Cambios requeridos 19.4, 19.5.

## Contexto actual

- `src/cli.ts` ejecuta REPL interactivo con estilos de input y loader.
- `src/commands.ts` registra slash commands en un array local.
- `src/renderer.ts` renderiza eventos agentic/tool.
- `package.json` usa `npm start` y no define binario `gana`.
- El SRS target es `pnpm gana`, aunque el repo actual usa npm/package-lock.

## Decision package manager/binario

Para el MVP productivo, documentar e implementar:

- `pnpm` como package manager objetivo.
- `bin` `gana` apuntando a `dist/cli.js` cuando exista build.
- scripts:
  - `gana`: ejecutar TUI.
  - `start`: compatibilidad local.
  - `dev`: desarrollo watch.
  - `typecheck`.

Transicion:

- No romper `npm start` inmediatamente si el repo aun usa `package-lock.json`.
- Agregar `pnpm` en docs y scripts como target.
- Si se migra lockfile, hacerlo en cambio separado.

## Cambios requeridos

### 09a: Skeleton temprano

Debe implementarse desde Corte 1:

- command registry compartible entre slash y headless;
- `pnpm gana` y `pnpm gana tui`;
- `pnpm gana db status`;
- `pnpm gana football status`;
- `pnpm gana filters show`;
- slash commands `/session`, `/profile`, `/approval`, `/db`, `/football`, `/filters`;
- respuestas de estado accionables cuando DB/API aun no esten configuradas.

Este skeleton no debe contener logica de dominio. Solo conecta config/runtime/status services disponibles.

### 09b: Experiencia final

Debe completarse cuando DB, API-Football, filtros, scoring, parlay y validation ya existan:

- renderer extendido;
- comandos deportivos completos;
- `/run`;
- `/export`;
- handoff/evidence pack visible desde TUI.

### Parser headless

Crear `src/headless.ts` o dividir `src/cli.ts`:

- Si no hay subcomando, abrir TUI.
- Si hay subcomando, ejecutar flujo headless y salir con exit code correcto.

Comandos requeridos:

```bash
pnpm gana
pnpm gana tui
pnpm gana db status
pnpm gana football status
pnpm gana filters show
pnpm gana leagues list
pnpm gana teams list
pnpm gana fixtures --date YYYY-MM-DD
pnpm gana odds --fixture-id ID
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20
pnpm gana research --fixture-id ID --web live
pnpm gana score --fixture-id ID
pnpm gana parlay --date YYYY-MM-DD
pnpm gana validate --date YYYY-MM-DD
pnpm gana run --date YYYY-MM-DD
pnpm gana export --run-id RUN_ID
```

### Command registry

Refactor minimo:

- mantener `src/commands.ts`;
- extraer servicios por comando para evitar logica en `execute`;
- compartir parsing entre slash y headless cuando sea razonable.

### Slash commands nuevos

Agregar:

- `/session`
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

### Renderer

Extender `src/renderer.ts` para eventos:

- provider sports;
- DB;
- filters;
- low odds hits;
- audit;
- artifact written;
- validation verdict;
- quota/rate limit.

Mantener modos existentes `grouped`, `minimal`, `emoji`, `hidden`.

### TUI status inicial

Al ejecutar `pnpm gana`, mostrar:

- nombre del sistema;
- provider agentic activo;
- modelo activo;
- auth provider;
- API-Football status;
- DB status;
- perfil;
- fecha/ventana;
- filtros activos;
- threshold;
- artifact root.

Los checks externos lentos deben mostrar loader y no congelar input.

## Separacion de responsabilidades

- `src/cli.ts`: input/render/dispatch.
- `src/commands.ts`: parsing comando y llamada a servicios.
- `src/runtime/*`: orquestacion.
- `src/domain/*`: tipos/reglas.
- `src/providers/*`: externos.
- `src/storage/*`: persistencia.
- `src/evidence/*`: artifacts/evidence.
- `src/permissions/*`: approvals/audit/redaccion.

## Criterios de aceptacion

- 09a: `pnpm gana db status`, `pnpm gana football status` y `pnpm gana filters show` existen desde el primer corte.
- 09a: `/session`, `/profile`, `/approval`, `/db`, `/football`, `/filters` existen y no exponen secretos.
- `pnpm gana` abre TUI.
- `npm start` sigue funcionando o el README documenta claramente el cambio.
- Slash commands actuales siguen funcionando.
- Headless commands devuelven exit code no-cero en errores productivos.
- Los comandos no exponen secretos.
- Renderer muestra eventos DB/API/filters sin solapar el output agentic.
- `pnpm gana run --date YYYY-MM-DD` orquesta flujo canonico cuando los planes previos esten listos.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de parser headless.
- Unit tests de dispatch slash.
- Tests de renderer con eventos sinteticos.
- Smoke manual:
  - `pnpm gana db status`
  - `pnpm gana football status`
  - `pnpm gana filters show`
  - `pnpm gana fixtures --date YYYY-MM-DD`
  - `pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20`

## Riesgos

- Meter demasiada logica en `commands.ts`; mantener servicios separados.
- Checks iniciales lentos pueden degradar la TUI; correr status con timeout y mensajes accionables.
- Migrar a `pnpm` puede generar churn; hacerlo como cambio intencional.
