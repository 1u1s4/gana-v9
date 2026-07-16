# Daily operations cron

Esta guia deja el flujo diario de Gana v9 programable con una sola autoridad de scheduling, en hora Guatemala (`America/Guatemala`, UTC-06).

## Documentacion canonica relacionada

- `docs/planes/22-implementacion-harness-y-publicacion.md`: indice tecnico migrado desde Notion para implementacion, harness, publicacion y seguridad.
- `docs/skills.md`: inventario de skills operativas y contratos del harness que respaldan este cron.
- `docs/harness-strategy-review-log.md`: bitacora de propuestas y cambios derivados del strategy review.

## Horarios

- `07:15` Guatemala: aplicar retencion una vez por fecha y validar el dia anterior contra el artifact publicado, recalculando metricas solo de picks publicados.
- `10:15` Guatemala: correr el Daily E2E inicial del dia siguiente con Codex Terra (`gpt-5.6-terra`), reasoning `high`, sin fast tier, council gate y Discord.
- `13:15` Guatemala: recuperar primero un Daily inicial que nunca se intento; si ya hubo intento, ejecutar strategy review antes de un Daily meramente `retryable`.
- `18:15` y `22:15` Guatemala: reintentar Daily solo cuando el lock exacto esta `retryable` y `retryAfter` ya vencio.

Una sola tarea `Gana · operaciones diarias` dispara los cinco checkpoints. El
dispatcher permite completar retencion y validacion atrasadas, pero inicia como
maximo un flujo agent-heavy por checkpoint. Nunca usa `--force` ni reintenta
estados terminales (`published`, `review-required`, `blocked` o
`publication-uncertain`).

## Dispatcher canonico

```bash
node scripts/gana-daily-ops-dispatch.mjs
```

Para inspeccionar decisiones sin ejecutar wrappers ni escribir estado:

```bash
node scripts/gana-daily-ops-dispatch.mjs --dry-run
```

El dispatcher usa `America/Guatemala`, respeta `GANA_MAINTENANCE_PAUSED`, un
lock global contra solapamientos y estados por fecha para retencion, validacion,
Daily y strategy. `--now` existe solo junto con `--dry-run` para pruebas y
diagnostico; las corridas reales siempre usan el reloj del host.

## Scripts operativos

Retencion operativa:

```bash
scripts/gana-raw-retention-apply.sh
```

Este wrapper respeta la pausa de mantenimiento, comparte un lock del kernel con
token de propietario entre Hermes, launchd y crontab, y publica atomicamente un
JSON en `.artifacts/gana-v9/retention/`. Si el apply falla, el reporte marca
`changed=possibly-partial`; se debe revisar con un dry-run antes de reintentar.
No habilitar este job hasta validar manualmente el primer dry-run y apply en la
base live.

Validacion y estadisticas del dia anterior:

```bash
scripts/gana-previous-day-validation-notify.sh
```

Este script:

1. Calcula ayer en `America/Guatemala`.
2. Localiza el `daily-parlay-recommendations.json` publicado para esa fecha.
3. Ejecuta `pnpm gana validate --date YYYY-MM-DD --recommendation-artifact PATH`.
4. Ejecuta `pnpm gana metrics daily --date YYYY-MM-DD --scope daily-YYYY-MM-DD --recommendation-artifact PATH`.
5. Envia `daily-metrics.json` y el mirror validado al canal de validaciones con embeds nativos usando Hermes gateway.

Daily E2E y recomendaciones del dia:

```bash
scripts/gana-daily-e2e-notify.sh
```

Este script:

1. Calcula manana en `America/Guatemala`.
2. Ejecuta `pnpm gana daily-e2e --date YYYY-MM-DD --providers codex --provider-concurrency 1 --codex-model gpt-5.6-terra --web live --parlay-profile portfolio-v2 --required-leagues 1:World Cup:World:2026`, con reasoning `high` y `service_tier=fast` desactivado.
3. Usa limites altos por defecto (`GANA_CRON_MAX_FIXTURES_PER_RUN=10000`, `GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10000`, `GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN=10000`, `GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES=10000`) para cubrir el universo diario disponible y low-odds elegibles.
4. Usa `GANA_LOW_ODDS_THRESHOLD=1.20` por defecto; low-odds cubre `h2h` casa/visitante y `double_chance` `home_or_draw`/`draw_or_away` dentro del umbral.
5. Genera `portfolio-v2`, que publica como enfoques diarios `parlay-diamante`, `parlay-refinado` y `low-variance` cuando sobreviven las compuertas.
6. Genera `daily-required-league-recommendations.json` para ligas obligatorias; por defecto World Cup `1:World Cup:World:2026`. Este addendum audita cada fixture requerido, produce proyecciones atomicas cuando hay picks no bloqueados y marca los 3 enfoques de parlay (`principal`, `resultados`, `mixto-seguro`) como `selected` o `blocked` con razones. El planner obligatorio es safety-first: prioriza cobertura de doble oportunidad, pares de totales conservadores y la mejor pareja corta de doble oportunidad, con cuotas realistas y flags de revision cuando usa overrides de seguridad.
7. Hidrata nombres de partidos desde los `fixtures.json` persistidos de los runs fuente para evitar etiquetas `Fixture ...` o UUIDs en Discord.
8. Pasa recomendaciones y parlays por el council local inspirado en Council of High Intelligence; el gate rechaza edge negativo, riesgo duro, edge inflado o score bajo antes de publicar.
9. Si ningun parlay sobrevive pero hay simples fuertes, compone parlays de revision desde esas simples para mantener la funcionalidad diaria de parlays sin dejar pasar parlays malos.
10. Envia `daily-parlay-recommendations.json` al canal de recomendaciones en el formato canonico de embeds nativos y deja el resumen accionable del council al final.

Strategy review del dia anterior:

```bash
scripts/gana-strategy-review.sh
```

Este script:

1. Calcula ayer en `America/Guatemala`.
2. Respeta el lock `strategy-review-YYYY-MM-DD.lock` y no duplica un resultado terminal.
3. Ejecuta `pnpm gana strategy-review --date YYYY-MM-DD --scope strategy-YYYY-MM-DD` sin recalcular validacion ni `daily-metrics`; el flujo canonico de las `07:15` es el unico propietario de esas metricas publicadas.
4. Fuerza Codex como proveedor del analisis, con `GANA_STRATEGY_REVIEW_MODEL=gpt-5.6-terra`, `GANA_STRATEGY_REVIEW_REASONING_EFFORT=high`, fast desactivado y sin fallbacks por defecto.
5. Genera `strategy-review.json`, `strategy-review.md` y actualiza `docs/harness-strategy-review-log.md` con propuestas de cambio al Harness.
6. Notifica el canal de strategy review con un mensaje tecnico: resumen de rendimiento, patrones efectivos/fallidos y cambios propuestos por archivo/prioridad/verificacion.

## Variables

Los scripts operativos cargan el `.env` del repo si existe. El runtime canonico usa
`DATABASE_URL` PostgreSQL/Supabase mediante el pooler de sesion. Las variables
temporales `SOURCE_DATABASE_URL` y `TARGET_DATABASE_URL` pertenecen solo a la
migracion y no reemplazan `DATABASE_URL` para cron ni para Discord.

Variables utiles:

- `GANA_DISCORD_TARGET`: target Discord global para fallbacks. Default final: `discord:1510041125614915756`.
- `GANA_DISCORD_RECOMMENDATIONS_TARGET`: canal para recomendaciones diarias. Default operativo: `discord:1510040973218939022`.
- `GANA_DISCORD_VALIDATION_TARGET`: canal para validaciones y mirror validado.
- `GANA_DISCORD_STRATEGY_TARGET`: canal para strategy review tecnico.
- `GANA_DISCORD_ALERTS_TARGET`: canal para fallos/alertas operativas.
- Precedencia de targets: variable especifica del flujo, luego `--gateway-target`, luego `GANA_DISCORD_TARGET`, luego el canal historico.
- `GANA_DAILY_DATE`: fuerza fecha para Daily E2E.
- `GANA_VALIDATION_DATE`: fuerza fecha para validacion/metricas.
- `GANA_CRON_MAX_FIXTURES_PER_RUN`: default operativo cron `10000`; se aplica como `GANA_MAX_FIXTURES_PER_RUN`.
- `GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN`: default operativo cron `10000`; se aplica como `GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN`.
- `GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN`: default operativo cron `10000`; se aplica como `GANA_MAX_PROVIDER_REQUESTS_PER_RUN`.
- `GANA_LOW_ODDS_THRESHOLD`: default `1.20`.
- `GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES`: default `10000`; permite que el barrido low-odds revise la pizarra diaria completa.
- `GANA_DAILY_PROVIDERS`: default `codex`.
- `GANA_DAILY_CODEX_MODEL`: default `gpt-5.6-terra`.
- `GANA_DAILY_REASONING_EFFORT`: default `high`; el wrapper lo mapea a `AGENT_REASONING_EFFORT` solo para la corrida diaria.
- `GANA_DAILY_FAST_MODE`: default `false`; el wrapper lo mapea a `AGENT_FAST_MODE` y omite `service_tier="fast"`.
- `GANA_DAILY_CODEX_FALLBACK_MODELS`: default vacio para mantener toda la corrida en Terra; acepta una lista de modelos separada por comas para habilitar fallback explicitamente.
- `GANA_MAINTENANCE_PAUSED`: default `false`; usar `true` solo durante una migracion/cutover para que retencion, Daily E2E, validacion y strategy review no inicien trabajo nuevo sobre la DB ni Discord. La pausa no cancela una retencion que ya tiene el lock: esperar que ese proceso termine antes de cambiar `DATABASE_URL`.
- `GANA_DAILY_PUBLISH_EXISTING`: default `false`; habilita explicitamente el camino de publicacion de un artifact ya terminado sin volver a ejecutar E2E, providers ni busqueda web.
- `GANA_DAILY_PUBLISH_EXISTING_MAX_AGE_HOURS`: default `36`; antiguedad maxima conjunta del artifact y su `daily-e2e-summary.json` para `publish-existing`.
- `GANA_DAILY_PROVIDER_CONCURRENCY`: default `1`.
- `GANA_DAILY_REQUIRED_LEAGUES`: default `1:World Cup:World:2026`; acepta lista separada por comas en formato `leagueId:name:country:season`, o `off` para desactivar el addendum obligatorio.
- `GANA_WEB_MODE`: default `live`.
- `GANA_PARLAY_PROFILE`: default `portfolio-v2`; genera `parlay-diamante`, `parlay-refinado`, `parlay-all-in`, `low-odds-top`, `low-variance`, `balanced`, `market-diverse`, `high-conviction` y `parlay-oro`; la publicacion diaria prioriza `parlay-diamante`, `parlay-refinado` y `low-variance`.
- `AGENT_CODEX_FALLBACK_MODELS`: fallback generico del agente; Daily E2E lo reemplaza con `GANA_DAILY_CODEX_FALLBACK_MODELS` (vacio por defecto).
- `AGENT_CODEX_SANDBOX`: default cron `danger-full-access`.
- `GANA_DISCORD_MAX_SELECTIONS`: default `25` para publicar todas las recomendaciones diarias disponibles en el artifact normal; el notifier pagina mensajes nativos cuando hace falta.
- `GANA_METRICS_PERSIST`: default `true`.
- `GANA_STRATEGY_REVIEW_DATE`: fuerza fecha para strategy review diario.
- `GANA_STRATEGY_REVIEW_MODEL`: modelo Codex para el analisis. Default: `gpt-5.6-terra`.
- `GANA_STRATEGY_REVIEW_REASONING_EFFORT`: esfuerzo de razonamiento. Default: `high`.
- `GANA_STRATEGY_REVIEW_FAST_MODE`: default `false`; el wrapper fuerza `AGENT_FAST_MODE=false`.
- `GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS`: default vacio para mantener el analisis completo en Terra.
- `GANA_STRATEGY_REVIEW_CODEX_SANDBOX`: sandbox Codex para el analisis. Default: `read-only`.
- `GANA_STRATEGY_REVIEW_AGENT`: `true|false`; default `true`.
- `GANA_STRATEGY_REVIEW_NOTIFY`: `true|false`; default `true`.
- `GANA_STRATEGY_REVIEW_DOC_PATH`: documento central de tracking. Default: `docs/harness-strategy-review-log.md`.

## Preflight de base y Discord

Antes de habilitar o reanudar cron, validar desde la raiz del repo:

```bash
pnpm gana db status
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --dry-run
```

El primer comando debe resolver el `DATABASE_URL` PostgreSQL del `.env` y
completar la consulta de estado. El segundo construye el payload sin publicarlo.
Si aparece `falta DATABASE_URL`, corregir el `.env` del repo y repetir el
preflight; no copiar el secreto al crontab, al comando ni a artifacts.

Despues del dry-run, ejecutar una sola vez el wrapper diario normal. No invocar
el notifier directo con `--force`: el wrapper y su lock por fecha son la defensa
principal contra publicaciones duplicadas. Confirmar el ledger antes de dejar
activa la tarea unica.

Si el E2E ya termino y el lock exacto quedo `retryable` sin haber enviado
Discord, se puede publicar el artifact existente sin consumir providers ni web:

```bash
node scripts/gana-daily-e2e-and-notify.mjs \
  --publish-existing \
  --date YYYY-MM-DD \
  --daily-batch-id daily-YYYY-MM-DD-full
```

Este modo exige date/batch explicitos, rechaza `--force`, respeta mantenimiento
y hora minima, y solo reclama un lock `retryable` vencido del mismo slate/batch.
Valida el artifact y su summary, IDs/selecciones, `DATABASE_URL` PostgreSQL con
schema `gana_ops`, salud de tablas y duplicados de ledger. Ejecuta el dry-run del
notifier, reserva el ledger con estado `publishing`, y el envio normal reutiliza
exactamente el payload SHA previsualizado. Cualquier ledger previo, reserva
parcial o envio incierto bloquea un reenvio automatico y requiere revision.

## Elegir una sola autoridad

No mantener simultaneamente Codex Scheduled, Hermes, `launchd` y `crontab`.
Los locks son defensa en profundidad, no una autorizacion para duplicar la
autoridad.

En este host la unica autoridad activa es Codex Scheduled con una tarea local:

```text
Gana · operaciones diarias
FREQ=DAILY;BYHOUR=7,10,13,18,22;BYMINUTE=15
```

Su prompt ejecuta unicamente `node scripts/gana-daily-ops-dispatch.mjs`. Hermes
no conserva jobs Gana, el bloque Gana de `crontab` esta ausente y no hay
LaunchAgents Gana cargados.

## Instalar cron en Hermes

Instalacion idempotente:

```bash
scripts/install-gana-hermes-cron.sh
```

Retiro seguro de canonical y nombres legacy, sin tocar jobs ajenos:

```bash
scripts/install-gana-hermes-cron.sh --uninstall
```

Esto crea un wrapper bajo `~/.hermes/scripts/`, elimina nombres legacy de Gana
y registra un solo job `--no-agent`:

```text
gana-v9-daily-operations  15 7,10,13,18,22 * * *
```

Hermes cron muestra los `Next run` en la zona local configurada; en este host debe verse con offset `-06:00`.

El fallback de sistema instalado por `scripts/install-gana-cron.mjs` crea el
directorio de logs antes de redirigir y agrega exactamente una linea con el mismo
dispatcher/horario. `--uninstall` retira solo el bloque administrado y conserva
cualquier entrada ajena del usuario.

En macOS tambien se puede instalar el fallback de usuario con `launchd`, util cuando `/usr/bin/crontab` no responde o queda bloqueado:

```bash
node scripts/install-gana-launchd.mjs
```

Esto limpia los cinco labels legacy y crea un solo LaunchAgent bajo
`~/Library/LaunchAgents/`, usando el dispatcher versionado y el mismo `PATH`
operativo:

```text
com.gana-v9.daily-operations  07:15, 10:15, 13:15, 18:15, 22:15
```

Los logs quedan en `.artifacts/gana-v9/cron/launchd-*.log`. No habilitar este
fallback junto con otra autoridad. Cuando el checkout vive bajo `~/Documents`,
macOS puede bloquear a `launchd` por TCC aunque los permisos Unix sean correctos;
los sintomas son `getcwd: Operation not permitted` y rechazo al abrir el wrapper.
En ese caso se debe retirar, no reintentar ni cambiar `chmod`:

```bash
node scripts/install-gana-launchd.mjs --uninstall
```

Comando equivalente manual:

```bash
hermes cron create "15 7,10,13,18,22 * * *" \
  --name gana-v9-daily-operations \
  --deliver origin \
  --script gana_v9_daily_ops_dispatch.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9
```

## Pruebas

Verificar sintaxis de scripts:

```bash
bash -n scripts/gana-raw-retention-apply.sh
bash -n scripts/gana-previous-day-validation-notify.sh
bash -n scripts/gana-daily-e2e-notify.sh
bash -n scripts/gana-strategy-review.sh
bash -n scripts/install-gana-hermes-cron.sh
node --check scripts/gana-daily-ops-dispatch.mjs
node --test scripts/tests/daily-ops-dispatch.test.mjs
node --test scripts/tests/raw-retention-wrapper.test.mjs
```

Strategy review historico desde la primera fecha con predicciones/parlays:

```bash
pnpm gana strategy-review --all --through YYYY-MM-DD
```

Preview de estadisticas sin enviar:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs \
  --date YYYY-MM-DD \
  --recommendation-artifact .artifacts/gana-v9/runs/daily-YYYY-MM-DD-full/daily-parlay-recommendations.json \
  --dry-run
```

Preview de recomendaciones sin enviar:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --dry-run
```
