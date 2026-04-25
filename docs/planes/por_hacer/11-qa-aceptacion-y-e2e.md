# QA, Aceptacion y E2E

## Objetivo

Definir la matriz de aceptacion del MVP productivo online, con pruebas unitarias, integracion, smoke tests y checks manuales que demuestren que Gana v9 cumple el SRS sin secretos expuestos ni rutas simuladas como producto.

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

Estos tests no son "modo simulado" del producto; son aislamiento de pruebas.

### Nivel 3: smoke productivo controlado

Detras de env vars reales:

- `API_FOOTBALL_KEY`
- `DATABASE_URL`
- auth local de Codex/Gemini/Cursor segun provider.

Comandos smoke:

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
```

## Matriz de aceptacion del SRS

1. `pnpm gana` abre TUI.
2. TUI muestra provider agentic, modelo, perfil, API-Football status, DB status y filtros.
3. `/provider` cambia entre Codex, Gemini y Cursor cuando estan autenticados.
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

- La matriz de 23 puntos queda trazada a pruebas unitarias, integration mocked o smoke productivo.
- Los smoke tests productivos son opt-in y no corren sin `API_FOOTBALL_KEY` y `DATABASE_URL`.
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
- Smoke `pnpm gana run`.
- Auditoria completa.

## Reglas de CI/local

- No correr smoke productivo si faltan env vars.
- Los tests con red deben estar opt-in.
- Ningun test debe imprimir `DATABASE_URL`, API keys ni auth files.
- Las fixtures de prueba deben estar redacted.
- Los artifacts generados en pruebas deben ir a tmp o `.artifacts/test` ignorado por git.

## Checklist final

- [ ] `npm run typecheck` pasa.
- [ ] Prisma validate/migrations pasan.
- [ ] Unit tests pasan.
- [ ] Integration mocked pasa.
- [ ] Smoke DB pasa.
- [ ] Smoke API-Football pasa.
- [ ] Smoke low-odds pasa.
- [ ] Smoke run/export pasa.
- [ ] Revisar artifacts para secretos.
- [ ] Revisar audit logs para auto-approvals.
- [ ] Confirmar que no existe automatizacion monetaria.

## Riesgos

- Los tests productivos pueden consumir cuota de API-Football; limitar fixtures y documentar fechas.
- Fechas relativas pueden hacer flaky los tests; usar fechas absolutas.
- Provider agentic CLI puede cambiar output; mantener fixtures de eventos y tests defensivos.
