# Maestro Production Candidate

Fecha: 2026-05-06

## Estado

Completado como cierre production-candidate controlado.

## Cambios implementados

- DB canonica documentada para el RC actual: DigitalOcean MySQL + Prisma. PostgreSQL queda como migracion futura, no como requisito operativo actual.
- Browser Use Cloud agregado como fallback local de research con la tool `browser`.
- Configuracion Browser Use:
  - `AGENT_BROWSER_FALLBACK=true`
  - `BROWSER_USE_API_KEY`
  - `BROWSER_USE_BASE_URL=https://api.browser-use.com`
  - `BROWSER_USE_MAX_TASKS_PER_MONTH=10`
  - `BROWSER_USE_MAX_CONCURRENT_SESSIONS=3`
  - `BROWSER_USE_TIMEOUT_MS=180000`
- La tool `browser` pasa por registry, policy, redaccion y auditoria. No permite saltarse el bloqueo de automatizacion monetaria.
- Research ahora reintenta una vez en modo `minimal-research-retry` cuando hay timeout antes de caer a fallback.
- Research normaliza `conflictStatus` no canonicos como `minor` a `potential` antes de validar schema.
- Scoring persiste `metadata.parlayEligible`.
- Parlay builder excluye del parlay principal legs con:
  - `parlayEligible=false`
  - `research is not promotable`
  - `fallback research`
  - stale source/news/odds
  - timeout
  - insufficient evidence
- Portfolio LLM mantiene esas legs solo para perfil `review`; conservative/balanced las filtran.
- Artifacts de parlay separan:
  - `analyticalArtifactOnly: true`
  - `qualityVerdict`
  - `executionCapability: "none"`
- `fixtures/replays` queda como soporte tecnico de certificacion deterministica, no como modo operativo del producto.
- README actualizado con DB canonica y Browser Use fallback.

## Pruebas automatizadas

- `pnpm typecheck`: OK
- `pnpm test`: OK, 320 tests
- `pnpm gana certify --profile ci-certification`: cubierto por suite; el golden deterministico fue actualizado por el registro de la nueva tool `browser`.

## Pruebas reales ejecutadas

- `pnpm gana db status`: OK, MySQL conectado, migraciones aplicadas.
- `pnpm gana football status`: OK, API-Football conectado, quota disponible.
- `pnpm gana filters show`: OK, filtros configurados.
- Browser Use real:
  - task: abrir `https://example.com` y devolver titulo.
  - resultado: OK, output `Example Domain`.
  - uso local registrado: 1/10 tasks del mes, 3 sesiones concurrentes max.

Runs reales con providers:

- Codex:
  - comando: `AGENT_PROVIDER=codex GANA_MAX_FIXTURES_PER_RUN=1 pnpm gana run --date 2026-05-07 --web live --validate off`
  - runId: `5ce9e42a-07e2-4907-a63d-69e502ea3ff0`
  - resultado: `review-required`
  - artifacts: `predictions.json`, `parlay-result.json`, `parlays-blocked.json`, evidence pack y handoff exportados.
  - nota: parlay bloqueado por piernas insuficientes con `maxFixtures=1`, esperado para corrida de cuota baja.

- deprecated provider:
  - intento inicial con modelo por defecto: bloqueado por 404 del provider/modelo.
  - reintento con `AGENT_MODEL=deprecated-provider-2.5-flash`.
  - runId: `08420f4e-d479-4a22-8285-8659fbe85378`
  - resultado: `review-required`
  - artifacts: evidence pack y handoff exportados.

- Parlay real consolidado:
  - comando: `pnpm gana parlay --date 2026-05-07`
  - runId: `7f934e4a-e98b-4663-a85c-5cb79fcf16cc`
  - parlayId: `b59bea4b-8f64-4fc4-9279-62100688a31a`
  - resultado: `promotable`
  - legs: 4
  - combinedOdds: `3.6267504`
  - nota: artifact analitico solamente; no ejecutable.

- OpenRouter:
  - no ejecutado.
  - bloqueo: `OPENROUTER_API_KEY` no esta configurado en el entorno actual.

## Criterio de salida

El sistema queda listo para operacion controlada en tandas. La recomendacion operativa sigue siendo escalar gradualmente:

1. 10 fixtures.
2. 40 fixtures.
3. 100 fixtures maximo hasta medir tiempo, quota, blocked reasons, calibration y CLV.

No se debe presentar la certificacion deterministica local como flujo productivo. Usa fixtures tecnicos y no reemplaza acceptance live.
