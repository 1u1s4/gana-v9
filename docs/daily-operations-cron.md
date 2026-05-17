# Daily operations cron

Esta guia deja el flujo diario de Gana v9 programable en Hermes cron, en hora Guatemala (`America/Guatemala`, UTC-06).

## Horarios

- `07:00` Guatemala: validar el dia anterior, recalcular daily metrics y notificar estadisticas a Discord.
- `10:00` Guatemala: correr Daily E2E del dia actual con Codex + Gemini, low-odds elegibles, portfolio-v2 con parlay-diamante, y notificar recomendaciones/parlays a Discord.

## Scripts operativos

Validacion y estadisticas del dia anterior:

```bash
scripts/gana-previous-day-validation-notify.sh
```

Este script:

1. Calcula ayer en `America/Guatemala`.
2. Ejecuta `pnpm gana validate --date YYYY-MM-DD`.
3. Ejecuta `pnpm gana metrics daily --date YYYY-MM-DD --scope daily-YYYY-MM-DD`.
4. Envia `daily-metrics.json` a Discord con embeds nativos usando Hermes gateway.

Daily E2E y recomendaciones del dia:

```bash
scripts/gana-daily-e2e-notify.sh
```

Este script:

1. Calcula hoy en `America/Guatemala`.
2. Ejecuta `pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --provider-concurrency 2 --web live --parlay-profile portfolio-v2`.
3. Usa limites altos por defecto (`GANA_CRON_MAX_FIXTURES_PER_RUN=10000`, `GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=10000`, `GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN=10000`, `GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES=10000`) para cubrir el universo diario disponible y low-odds elegibles.
4. Usa `GANA_LOW_ODDS_THRESHOLD=1.20` por defecto; low-odds significa exclusivamente mercado `h2h` casa/visitante con cuota menor o igual al umbral.
5. Genera `portfolio-v2`, que incluye `parlay-diamante` como perfil conservador diario objetivo 1.10-1.20.
6. Envia `daily-parlay-recommendations.json` a Discord con embeds nativos usando Hermes gateway.

## Variables

Ambos scripts cargan `.env` si existe.

Variables utiles:

- `GANA_DISCORD_TARGET`: target Discord. Default: `discord:1494071165453467721`.
- `GANA_DAILY_DATE`: fuerza fecha para Daily E2E.
- `GANA_VALIDATION_DATE`: fuerza fecha para validacion/metricas.
- `GANA_CRON_MAX_FIXTURES_PER_RUN`: default operativo cron `10000`; se aplica como `GANA_MAX_FIXTURES_PER_RUN`.
- `GANA_CRON_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN`: default operativo cron `10000`; se aplica como `GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN`.
- `GANA_CRON_MAX_PROVIDER_REQUESTS_PER_RUN`: default operativo cron `10000`; se aplica como `GANA_MAX_PROVIDER_REQUESTS_PER_RUN`.
- `GANA_LOW_ODDS_THRESHOLD`: default `1.20`.
- `GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES`: default `10000`; permite que el barrido low-odds revise la pizarra diaria completa.
- `GANA_DAILY_PROVIDERS`: default `codex,gemini`.
- `GANA_DAILY_PROVIDER_CONCURRENCY`: default `2`.
- `GANA_WEB_MODE`: default `live`.
- `GANA_PARLAY_PROFILE`: default `portfolio-v2`; incluye `parlay-diamante`, `low-odds-top`, `low-variance`, `balanced`, `market-diverse`, `high-conviction` y `parlay-oro`.
- `AGENT_CODEX_FALLBACK_MODELS`: default cron `gpt-5.4-mini`.
- `AGENT_CODEX_SANDBOX`: default cron `danger-full-access`.
- `GANA_DISCORD_MAX_SELECTIONS`: default `5`.
- `GANA_METRICS_PERSIST`: default `true`.

## Instalar cron en Hermes

Instalacion idempotente:

```bash
scripts/install-gana-hermes-cron.sh
```

Esto crea wrappers bajo `~/.hermes/scripts/` y registra dos jobs `--no-agent`:

```text
gana-v9-validate-yesterday-discord  0 7 * * *
gana-v9-daily-e2e-discord           0 10 * * *
```

Hermes cron muestra los `Next run` en la zona local configurada; en este host debe verse con offset `-06:00`.

Comando equivalente manual:

```bash
hermes cron create "0 7 * * *" \
  --name gana-v9-validate-yesterday-discord \
  --deliver origin \
  --script gana_v9_previous_day_validation_notify.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9

hermes cron create "0 10 * * *" \
  --name gana-v9-daily-e2e-discord \
  --deliver origin \
  --script gana_v9_daily_e2e_notify.sh \
  --no-agent \
  --workdir /Users/luisalvarado/Documents/GitHub/gana-v9
```

## Pruebas

Verificar sintaxis de scripts:

```bash
bash -n scripts/gana-previous-day-validation-notify.sh
bash -n scripts/gana-daily-e2e-notify.sh
bash -n scripts/install-gana-hermes-cron.sh
```

Preview de estadisticas sin enviar:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs \
  --date YYYY-MM-DD \
  --dry-run \
  --gateway-target discord:1494071165453467721
```

Preview de recomendaciones sin enviar:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --dry-run \
  --gateway-target discord:1494071165453467721
```
