# Daily operations cron

Esta guia deja el flujo diario de Gana v9 programable en Hermes cron, en hora Guatemala (`America/Guatemala`, UTC-06).

## Horarios

- `07:00` Guatemala: validar el dia anterior contra el artifact de recomendaciones publicado, recalcular daily metrics solo de picks publicados y notificar estadisticas a Discord.
- `10:15` Guatemala: correr Daily E2E del dia siguiente con Codex + Gemini, low-odds elegibles, portfolio-v2 con los 3 enfoques diarios (`parlay-diamante`, `parlay-refinado`, `low-variance`), addendum de ligas obligatorias, council gate, y notificar recomendaciones/parlays a Discord.
- `10:00-22:30` Guatemala, cada 30 minutos: catch-up idempotente del Daily E2E. Si el equipo estuvo dormido a las `10:15`, el wrapper vuelve a intentar al despertar; si el daily ya corrio, el lock diario evita duplicados.
- `13:00` Guatemala: correr strategy review del dia anterior cerrado, usando Codex GPT-5.5 con reasoning X-High, y actualizar el log central de mejoras del Harness.

## Scripts operativos

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
6. Genera `council-feedback.json` y lo envia al canal de feedback para retroalimentar el gate del siguiente ciclo.

Daily E2E y recomendaciones del dia:

```bash
scripts/gana-daily-e2e-notify.sh
```

Este script:

1. Calcula manana en `America/Guatemala`.
2. Ejecuta `pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --provider-concurrency 2 --web live --parlay-profile portfolio-v2 --required-leagues 1:World Cup:World:2026`.
3. Usa limites altos por defecto (`GANA_CRON_MAX_FIXTURES_PER_RUN=10000`, `GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10000`, `GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN=10000`, `GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES=10000`) para cubrir el universo diario disponible y low-odds elegibles.
4. Usa `GANA_LOW_ODDS_THRESHOLD=1.20` por defecto; low-odds cubre `h2h` casa/visitante y `double_chance` `home_or_draw`/`draw_or_away` dentro del umbral.
5. Genera `portfolio-v2`, que publica como enfoques diarios `parlay-diamante`, `parlay-refinado` y `low-variance` cuando sobreviven las compuertas.
6. Genera `daily-required-league-recommendations.json` para ligas obligatorias; por defecto World Cup `1:World Cup:World:2026`. Este addendum audita cada fixture requerido, produce proyecciones atomicas cuando hay picks no bloqueados y marca los 3 enfoques de parlay como `selected` o `blocked` con razones.
7. Hidrata nombres de partidos desde los `fixtures.json` persistidos de los runs fuente para evitar etiquetas `Fixture ...` o UUIDs en Discord.
8. Pasa recomendaciones y parlays por el council local inspirado en Council of High Intelligence; el gate rechaza edge negativo, riesgo duro, edge inflado o score bajo antes de publicar.
9. Si ningun parlay sobrevive pero hay simples fuertes, compone parlays de revision desde esas simples para mantener la funcionalidad diaria de parlays sin dejar pasar parlays malos.
10. Envia `daily-parlay-recommendations.json` al canal de recomendaciones y el resumen accionable del council al canal de council con embeds nativos usando Hermes gateway.

Strategy review del dia anterior:

```bash
scripts/gana-strategy-review.sh
```

Este script:

1. Calcula ayer en `America/Guatemala`.
2. Ejecuta `pnpm gana validate --date YYYY-MM-DD` para asegurar settlement actualizado.
3. Ejecuta `pnpm gana metrics daily --date YYYY-MM-DD --scope daily-YYYY-MM-DD`.
4. Ejecuta `pnpm gana strategy-review --date YYYY-MM-DD --scope strategy-YYYY-MM-DD`.
5. Fuerza Codex como proveedor del analisis, con `GANA_STRATEGY_REVIEW_MODEL=gpt-5.5` y `GANA_STRATEGY_REVIEW_REASONING_EFFORT=xhigh` por defecto.
6. Genera `strategy-review.json`, `strategy-review.md` y actualiza `docs/harness-strategy-review-log.md` con propuestas de cambio al Harness.
7. Notifica el canal de strategy review con un mensaje tecnico: resumen de rendimiento, patrones efectivos/fallidos y cambios propuestos por archivo/prioridad/verificacion.

## Variables

Ambos scripts cargan `.env` si existe.

Variables utiles:

- `GANA_DISCORD_TARGET`: target Discord global. Default final: `discord:1494071165453467721`.
- `GANA_DISCORD_RECOMMENDATIONS_TARGET`: canal para recomendaciones diarias.
- `GANA_DISCORD_COUNCIL_TARGET`: canal para decision/resumen del council.
- `GANA_DISCORD_VALIDATION_TARGET`: canal para validaciones y mirror validado.
- `GANA_DISCORD_FEEDBACK_TARGET`: canal para feedback post-validacion del council.
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
- `GANA_DAILY_PROVIDERS`: default `codex,gemini`.
- `GANA_DAILY_CODEX_MODEL`: default `gpt-5.5`.
- `GANA_DAILY_GEMINI_MODEL`: default `gemini-3.1-pro`.
- `GANA_DAILY_PROVIDER_CONCURRENCY`: default `2`.
- `GANA_DAILY_REQUIRED_LEAGUES`: default `1:World Cup:World:2026`; acepta lista separada por comas en formato `leagueId:name:country:season`, o `off` para desactivar el addendum obligatorio.
- `GANA_WEB_MODE`: default `live`.
- `GANA_PARLAY_PROFILE`: default `portfolio-v2`; genera `parlay-diamante`, `parlay-refinado`, `parlay-all-in`, `low-odds-top`, `low-variance`, `balanced`, `market-diverse`, `high-conviction` y `parlay-oro`; la publicacion diaria prioriza `parlay-diamante`, `parlay-refinado` y `low-variance`.
- `AGENT_CODEX_FALLBACK_MODELS`: default cron `gpt-5.4-mini`.
- `AGENT_CODEX_SANDBOX`: default cron `danger-full-access`.
- `GANA_DISCORD_MAX_SELECTIONS`: default `3` para publicar los 3 enfoques diarios de parlays.
- `GANA_METRICS_PERSIST`: default `true`.
- `GANA_STRATEGY_REVIEW_DATE`: fuerza fecha para strategy review diario.
- `GANA_STRATEGY_REVIEW_MODEL`: modelo Codex para el analisis. Default: `gpt-5.5`.
- `GANA_STRATEGY_REVIEW_REASONING_EFFORT`: esfuerzo de razonamiento. Default: `xhigh`.
- `GANA_STRATEGY_REVIEW_CODEX_SANDBOX`: sandbox Codex para el analisis. Default: `read-only`.
- `GANA_STRATEGY_REVIEW_AGENT`: `true|false`; default `true`.
- `GANA_STRATEGY_REVIEW_NOTIFY`: `true|false`; default `true`.
- `GANA_STRATEGY_REVIEW_DOC_PATH`: documento central de tracking. Default: `docs/harness-strategy-review-log.md`.

## Instalar cron en Hermes

Instalacion idempotente:

```bash
scripts/install-gana-hermes-cron.sh
```

Esto crea wrappers bajo `~/.hermes/scripts/` y registra tres jobs `--no-agent`:

```text
gana-v9-validate-yesterday-discord  0 7 * * *
gana-v9-daily-e2e-discord           15 10 * * *
gana-v9-daily-e2e-catchup-discord   */30 10-22 * * *
gana-v9-strategy-review             0 13 * * *
```

Hermes cron muestra los `Next run` en la zona local configurada; en este host debe verse con offset `-06:00`.

El fallback de sistema instalado por `scripts/install-gana-cron.mjs` agrega una segunda linea `*/30 10-22 * * *` para el Daily E2E. Esa linea existe para recuperar ejecuciones perdidas por sleep/darkwake; no debe duplicar publicaciones porque `scripts/gana-daily-e2e-and-notify.mjs` aplica guard de hora minima y lock por fecha. Si un intento produce cero selecciones, el wrapper no envia recomendaciones vacias y marca el lock como retryable para un nuevo catch-up posterior.

Comando equivalente manual:

```bash
hermes cron create "0 7 * * *" \
  --name gana-v9-validate-yesterday-discord \
  --deliver origin \
  --script gana_v9_previous_day_validation_notify.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9

hermes cron create "15 10 * * *" \
  --name gana-v9-daily-e2e-discord \
  --deliver origin \
  --script gana_v9_daily_e2e_notify.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9

hermes cron create "*/30 10-22 * * *" \
  --name gana-v9-daily-e2e-catchup-discord \
  --deliver origin \
  --script gana_v9_daily_e2e_notify.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9

hermes cron create "0 13 * * *" \
  --name gana-v9-strategy-review \
  --deliver origin \
  --script gana_v9_strategy_review.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9
```

## Pruebas

Verificar sintaxis de scripts:

```bash
bash -n scripts/gana-previous-day-validation-notify.sh
bash -n scripts/gana-daily-e2e-notify.sh
bash -n scripts/gana-strategy-review.sh
bash -n scripts/install-gana-hermes-cron.sh
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
