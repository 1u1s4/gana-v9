# QA, Aceptacion y E2E

## Objetivo

Definir la matriz de aceptacion del MVP productivo online, con pruebas unitarias, integracion y acceptance live manual que demuestren que Gana v9 cumple el SRS sin secretos expuestos ni rutas simuladas como producto.

## SRS cubierto

- Secciones 17 y 18 completas.
- Validacion transversal de planes 01 a 10.

## Pruebas

### Nivel 1: typecheck y unit tests

Debe ejecutarse en cada cambio:

```bash
npm run typecheck
```

Agregar test runner si el repo aun no lo tiene. Preferir tests TypeScript con fixtures locales para:

- config defaults;
- redaccion;
- provider event parsing;
- API-Football mappers;
- filter engine;
- market settlement;
- scoring gates;
- parlay builder;
- DB status redacted;
- headless parser.

### Nivel 2: integration con mocks

Usar fixtures JSON redacted para:

- API-Football fixtures;
- API-Football odds;
- API-Football results;
- API-Football statistics;
- provider agentic structured output;
- DB repositories con test DB o mocks controlados.

Las pruebas pueden usar fixtures y mocks controlados para aislamiento tecnico, pero el producto MVP no ofrece un modo operativo offline ni simulado.

### Nivel 3: acceptance live productivo

Ejecucion manual con env vars reales. No corre por defecto en CI ni local:

- `API_FOOTBALL_KEY`
- `DATABASE_URL`
- auth local de Codex/Gemini segun `AGENT_PROVIDER`; para `openrouter`, `OPENROUTER_API_KEY`.

La fecha debe ser absoluta para evitar flakiness y proteger la cuota de API-Football. El primer run productivo debe limitar fixtures explicitamente:

```bash
pnpm gana db status
pnpm gana football status
pnpm gana filters show
GANA_MAX_FIXTURES_PER_RUN=5 pnpm gana run --date YYYY-MM-DD
pnpm gana artifacts --run-id RUN_ID
pnpm gana export --run-id RUN_ID
pnpm gana validate --date YYYY-MM-DD
```

El run debe producir `runId`, artifacts, evidence pack, predictions, candidato de parlay y verdict. Al final se revisan stdout/stderr, artifacts y audit logs para confirmar que no aparezcan `DATABASE_URL`, password de DB, `API_FOOTBALL_KEY`, `OPENROUTER_API_KEY` ni secretos de auth local.

Comandos de operacion productiva:

```bash
pnpm gana db status
pnpm gana football status
pnpm gana fixtures --date YYYY-MM-DD
pnpm gana odds --fixture-id ID
pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20
pnpm gana research --fixture-id ID --web live
pnpm gana score --fixture-id ID
pnpm gana parlay --date YYYY-MM-DD
pnpm gana validate --date YYYY-MM-DD
pnpm gana run --date YYYY-MM-DD
pnpm gana export --run-id RUN_ID
pnpm gana artifacts --run-id RUN_ID
```

Un verdict `blocked` impide promover el run. Un verdict `review-required` se permite solo cuando el comando produjo artifacts o persistencia suficiente para inspeccion manual.

## Matriz de aceptacion del SRS

1. `pnpm gana` abre TUI.
2. TUI muestra provider agentic, modelo, perfil, API-Football status, DB status y filtros.
3. `/provider` cambia entre Codex, Gemini y OpenRouter cuando estan configurados.
4. `/model` lista modelos del provider activo.
5. `/web live` exige web search nativo en research.
6. `/profile full-permissions` activa autoautorizacion auditada.
7. `/leagues` configura ligas default.
8. `/teams` configura equipos default.
9. `/threshold` muestra/cambia default `1.20`.
10. `/low-odds` muestra partidos con odds `<= threshold`.
11. `pnpm gana football status` verifica API-Football sin secretos.
12. `pnpm gana db status` verifica DB sin credenciales.
13. `pnpm gana fixtures --date YYYY-MM-DD` obtiene fixtures reales.
14. `pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20` obtiene y persiste hits.
15. `pnpm gana odds --fixture-id ID` normaliza odds reales.
16. El sistema genera predictions para los cinco markets iniciales.
17. El sistema construye parlays sin ejecutar acciones monetarias.
18. El sistema valida resultados con API-Football y genera `ValidationArtifact`.
19. Fixtures, odds, filters, scans, predictions, parlays, validations, runs y audit logs se persisten.
20. Cada run produce evidence pack y handoff.
21. Cada run termina con `promotable`, `review-required` o `blocked`.
22. Secrets quedan redacted.
23. `full-permissions` reduce prompts sin eliminar auditoria.

## Criterios de aceptacion

- La matriz de 23 puntos queda trazada a pruebas unitarias, integration mocked o acceptance live productivo.
- La acceptance live productiva es manual y no corre sin `API_FOOTBALL_KEY`, `DATABASE_URL`, fecha absoluta y auth del provider agentic configurado.
- Toda prueba con red usa fechas absolutas y limites de fixtures para proteger cuota.
- Los artifacts generados en pruebas quedan fuera de git o en directorios ignorados.
- La revision final confirma que no hay secretos en logs, sessions, artifacts ni errores.
- La revision final confirma que no existe automatizacion monetaria.

## Criterios de salida por corte

### Corte 1

- Config extendida.
- `/session`, `/profile`, `/approval`, `/db`, `/football`.
- Artifact root.
- DB/API status redacted.
- Typecheck y unit tests de config/redaccion.

### Corte 2

- Fixtures/odds reales.
- Filtros y low odds.
- DB persiste snapshots e hits.
- Integration tests API-Football mocked.

### Corte 3

- Research/scoring/predictions.
- Evidence y claims.
- Agent runs persistidos.
- Tests de gates y structured output.

### Corte 4

- Parlay y validation.
- Evidence pack/handoff.
- Acceptance `pnpm gana run`.
- Auditoria completa.

## Reglas de CI/local

- No correr acceptance live productiva si faltan env vars.
- Los tests con red deben estar opt-in.
- Ningun test debe imprimir `DATABASE_URL`, API keys ni auth files.
- Las fixtures de prueba deben estar redacted.
- Los artifacts generados en pruebas deben ir a tmp o `.artifacts/test` ignorado por git.

## Checklist final

- [ ] `npm run typecheck` pasa.
- [ ] Prisma validate/migrations pasan.
- [ ] Unit tests pasan.
- [ ] Integration mocked pasa.
- [ ] Acceptance DB pasa.
- [ ] Acceptance API-Football pasa.
- [ ] Acceptance low-odds pasa.
- [ ] Acceptance run/export pasa.
- [ ] Revisar artifacts para secretos.
- [ ] Revisar audit logs para auto-approvals.
- [ ] Confirmar que no existe automatizacion monetaria.

## Riesgos

- Los tests productivos pueden consumir cuota de API-Football; limitar fixtures y documentar fechas.
- Fechas relativas pueden hacer flaky los tests; usar fechas absolutas.
- Provider agentic CLI puede cambiar output; mantener fixtures de eventos y tests defensivos.
