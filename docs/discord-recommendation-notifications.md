# Discord recommendation notifications

Esta guia documenta el envio de recomendaciones finales de Gana v9 a Discord desde Hermes: parlays rankeados y predicciones atomicas de muy alta confianza.

## Ubicacion

La skill de Hermes vive en:

```text
.agents/skills/discord-recommendation-notifier/
```

No usa `skills/`, porque esa carpeta es para contratos del harness.

Archivos principales:

- `.agents/skills/discord-recommendation-notifier/SKILL.md`
- `.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs`
- `.agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs`
- `.agents/skills/discord-recommendation-notifier/scripts/notify-discord-validation-stats.mjs`
- `.agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs`
- `.agents/skills/discord-recommendation-notifier/tests/notify-discord-daily-stats.test.mjs`

## Formato canonico

El formato canonico para Discord usa cajas nativas de Discord (`embeds`), no texto plano con bordes.

Estructura visual:

```text
🏆 Gana v9 · Recomendaciones en revisión

📦 N parlays · 🎯 M simples
🟡 review-required · unvalidated · 💧 low-liquidity
⚠️ Sin ejecución monetaria · Sin garantía

1️⃣ Parlay title
> ⚽ Fixture: selection @ odds
> ⚽ Fixture: selection @ odds
> 📊 Odds X · 🧠 Conf Y% · 📈 Edge Z% · 📌 Expo W%

2️⃣ 🎯 Simple · Fixture · selection
> ⚽ Fixture: selection @ odds
> 📊 Odds X · 🧠 Conf Y% · 📈 Edge Z% · 📌 Expo 0%

🛡️ Revisión manual requerida antes de promoción.
```

En Discord esto se renderiza como:

- Un embed de encabezado.
- Un embed por parlay o prediccion atomica.
- Un embed final de cierre/control.

Reglas:

- Mantener `allowed_mentions: { "parse": [] }`.
- Usar emojis en titulos/campos para escaneo rapido.
- Mantener cada recomendacion compacta: selecciones en blockquote y metricas en una linea.
- Renderizar `kind: "atomic-prediction"` como `🎯 Simple · ...`; son "parlays de una sola seleccion" analiticos, no instrucciones de ejecucion.
- Nunca publicar etiquetas de fixture basadas en UUID o `Fixture ...` si existe metadata persistida; el Daily E2E hidrata nombres desde los `fixtures.json` de los runs fuente antes de crear el artifact final.
- No enviar instrucciones monetarias, enlaces de pago, automatizacion de apuesta ni promesas de resultado.
- Usar "exposicion analitica" / `Expo`, no lenguaje operativo de ejecucion.

## Persistencia del estilo

El estilo persiste en codigo, no en instrucciones sueltas del chat:

- Fuente de verdad de formato: `.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs`
- Instrucciones de Hermes: `.agents/skills/discord-recommendation-notifier/SKILL.md`
- Pruebas de regresion: `.agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs`

Para conservar lo acordado, todo envio operativo debe usar el script de la skill. El transporte por defecto es `discord-native`, por lo que mantiene embeds/cajas nativas de Discord sin tener que rearmar el mensaje manualmente.

Si se cambia el estilo en el futuro, actualizar juntos el script, `SKILL.md`, esta documentacion y las pruebas. No enviar variantes manuales por gateway salvo para depuracion explicita.

## Transporte

El transporte por defecto es:

```text
--transport discord-native
```

`discord-native` lee la configuracion del gateway de Hermes y manda el payload a Discord con la API oficial, preservando embeds nativos.

Transportes disponibles:

- `discord-native`: recomendado; usa cajas nativas de Discord.
- `hermes-gateway`: fallback de texto plano via `send_message`.
- `webhook`: fallback con `DISCORD_WEBHOOK_URL`.

## Envio

Preview sin enviar:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --dry-run \
  --max 25
```

Envio real con embeds nativos:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --transport discord-native \
  --max 25
```

Envio de un artifact especifico:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --artifact .artifacts/gana-v9/runs/daily-YYYY-MM-DD/daily-parlay-recommendations.json \
  --transport discord-native \
  --max 25
```

## Validaciones y estadisticas

Las validaciones del dia anterior usan el mismo transporte `discord-native` y cajas nativas de Discord.

Preview:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs \
  --date YYYY-MM-DD \
  --dry-run
```

Envio real:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs \
  --date YYYY-MM-DD \
  --transport discord-native
```

`notify-discord-daily-stats.mjs` busca el `daily-metrics.json` mas reciente para la fecha indicada y, si existe, el artifact `validations.json` o `validations-blocked.json` correspondiente. `notify-discord-validation-stats.mjs` queda disponible para envios con paths explicitos de artifacts.

El formato canonico de validaciones es:

```text
📊 Gana v9 · Validación diaria

📅 YYYY-MM-DD · America/Guatemala
✅ N resueltas · ⏳ M pendientes · ⚪ U sin validar
⚠️ Tracking analítico · Sin ejecución monetaria

🎯 Predicciones
> ✅ W · ❌ L · ➖ V · ⏳ P · 🚫 B · ⚪ U
> 📌 Total N · 📈 Hit X% · 🎲 Odds X · 🧠 Conf Y% · 📊 Edge Z%

🧩 Parlays
> ✅ W · ❌ L · ➖ V · ⏳ P · 🚫 B · ⚪ U
> 📌 Total N · 📈 Hit X% · 🎲 Odds X · 🧠 Conf Y%
```

## Operacion diaria y cron

Wrappers versionados:

- `scripts/gana-validate-metrics-and-notify.mjs`: calcula por defecto la fecha de ayer en `America/Guatemala`, exige el artifact canonico derivado del `dailyBatchId` publicado, corre validacion y metricas por fases y solo entonces notifica. Persiste target, payload hashes y todos los IDs de stats/mirrors; una entrega parcial queda `publication-uncertain`. Los backfills exigen `--test-label`, admiten `--dry-run` sin efectos y tienen `--force` deshabilitado.
- `scripts/gana-daily-e2e-and-notify.mjs`: calcula por defecto la fecha de manana en `America/Guatemala`, corre E2E completo Codex con low-odds threshold `1.20`, pasa recomendaciones por council gate y notifica recomendaciones con resumen council integrado.
- `scripts/gana-daily-ops-dispatch.mjs`: decide deterministicamente retencion, validacion, Daily inicial, strategy review y retries Daily vencidos en los cinco checkpoints diarios.
- `scripts/gana-previous-day-validation-notify.sh`: wrapper shell equivalente para Hermes `--no-agent`.
- `scripts/gana-daily-e2e-notify.sh`: wrapper shell equivalente para Hermes `--no-agent`.
- `scripts/install-gana-hermes-cron.sh`: instala un solo job dispatcher en Hermes cron.
- `scripts/install-gana-cron.mjs`: instala un solo job dispatcher en crontab como fallback.
- `scripts/install-gana-launchd.mjs`: instala un solo LaunchAgent dispatcher como fallback macOS cuando `crontab` no esta disponible.

Hermes cron es un fallback y no debe habilitarse junto con Codex Scheduled:

```bash
scripts/install-gana-hermes-cron.sh
```

Job esperado:

```text
gana-v9-daily-operations  15 7,10,13,18,22 * * *
```

El dispatcher y los wrappers tienen locks por fecha bajo
`.artifacts/gana-v9/cron/locks/`. Esos locks son defensa en profundidad, no una
autorizacion para mantener varias autoridades activas. El dispatcher nunca usa
`--force` y el wrapper de validacion lo rechaza; un reproceso manual deliberado
usa `--backfill --test-label TEXT` sin omitir el mutex ni el ledger de entrega.

Detalles adicionales: `docs/daily-operations-cron.md`.

## Canal y runtime

El target historico usado antes de dividir canales fue:

```text
discord:1494071165453467721
```

Evitar depender del home channel si Hermes reporta `Unknown Channel`; usar el ID numerico del canal.

Los wrappers operativos enrutan recomendaciones y alertas a canales separados:

```env
GANA_DISCORD_RECOMMENDATIONS_TARGET=discord:1510040973218939022
GANA_DISCORD_VALIDATION_TARGET=discord:1510041125614915756
GANA_DISCORD_STRATEGY_TARGET=discord:1510041125614915756
GANA_DISCORD_ALERTS_TARGET=discord:1510041125614915756
```

Precedencia: target especifico del flujo, luego `--gateway-target`, luego `GANA_DISCORD_TARGET`, y finalmente `discord:1510041125614915756`. Los targets pueden usar `discord:CHANNEL_ID`, `discord:CHANNEL_ID:THREAD_ID` o alias resuelto por Hermes.

El runtime Python estable para el gateway es:

```text
/Users/luisalvarado/.hermes/hermes-agent/venv/bin/python3
```

El script lo usa por defecto. Si fuera necesario sobrescribirlo:

```bash
HERMES_GATEWAY_PYTHON=/path/to/hermes/venv/bin/python3 node ...
```

## Validacion

Pruebas de la skill:

```bash
node .agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs
node .agents/skills/discord-recommendation-notifier/tests/notify-discord-daily-stats.test.mjs
node .agents/skills/discord-recommendation-notifier/tests/discord-targets.test.mjs
```

La cobertura valida:

- Payload con embeds nativos.
- `allowed_mentions` deshabilitado.
- Formato canonico del texto dentro de embeds.
- Formato de predicciones atomicas como simples.
- Fallback de texto plano via Hermes gateway.
- Fallback webhook.
- Descubrimiento del artifact mas reciente.

## Council Gate Integrado

El artifact final `daily-parlay-recommendations.json` incluye:

- `councilCandidateRecommendations`: candidatos evaluados por el council, incluyendo los rechazados para auditoria.
- `council`: decision por recomendacion (`approve`, `review`, `reject`), score y feedback.
- `publishedTargets`: `predictionIds` y `parlayIds` usados por validacion/metricas.
- `persistencePolicy`: deja fijo que el scope operativo diario son solo recomendaciones publicadas.

El gate del council es bloqueante: candidatos con edge negativo, riesgo duro, edge inflado o score bajo quedan `reject` y no pasan a `recommendations`. El mensaje de council en Discord debe mostrar cada decision con partido, seleccion, odds, confianza, edge, stake, senales y razones resumidas; no basta una lista de scores.

El resumen del council se integra al final del payload de recomendaciones, en el mismo canal `gana-recomendaciones`, conservando el formato canonico de embeds nativos por seleccion y por bloque obligatorio. El resumen debe mantenerse simple para uso operativo: estado/counts, enfoques diarios principales, proyecciones fuertes obligatorias, predicciones obligatorias con confianza y parlays obligatorios seleccionados. Si ningun parlay sobrevive al primer gate pero hay simples fuertes, el Daily E2E arma parlays de revision desde esas simples aprobadas por council para mantener cobertura de parlays sin dejar pasar parlays malos.

## Artifact esperado

El script lee:

```text
daily-parlay-recommendations.json
```

Campos usados por el formato:

- `recommendations[].kind` (`parlay` legacy/default o `atomic-prediction`)
- `recommendations[].rank`
- `recommendations[].harnessStatus`
- `recommendations[].validationStatus`
- `recommendations[].riskFlags`
- `recommendations[].combinedOdds`
- `recommendations[].aggregateConfidence`
- `recommendations[].expectedEdge`
- `recommendations[].exposure.percentOfAnalyticalBankroll`
- `recommendations[].stake.percentOfBankroll` como fallback legacy
- `recommendations[].legs[].fixture`
- `recommendations[].legs[].market`
- `recommendations[].legs[].selection`
- `recommendations[].legs[].line`
- `recommendations[].legs[].odds`
