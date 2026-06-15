# Worklog 21: arquitectura, dashboard, E2E y Telegram

## 2026-06-15

- Instalada `ultragoal` en `.agents/skills/ultragoal` desde `jxnl/dots@master`.
- Leidas instrucciones locales de `ultragoal`, `gana-daily-e2e-ops` y Browser.
- Creado este plan trazable con objetivo, verificadores, no objetivos y gates.
- Subagentes read-only completados:
  - Arquitectura: recomendo no tocar el artifact central de daily en este pase; el refactor grande de `src/daily/e2e.ts` queda como trabajo futuro.
  - Dashboard: confirmo P1 movil por filtros altos, tabs verticales, tablas sin card fallback y detalle no enfocado.
  - E2E: encontro riesgo P1 de publicar artifact viejo y conteo incompleto para addendum obligatorio.
  - Telegram: confirmo que `gana-telegram-rich-output.mjs` era Markdown de consola, no Telegram HTML seguro.
- Baseline Browser movil `390x844` antes del cambio:
  - `body.scrollHeight`: 4721.
  - filtros: 916px de alto.
  - tabs: 186px de alto.
  - contenido empieza cerca de y=1546.
  - sin overflow horizontal, pero el listado no aparece en el primer viewport.
- Cambios aplicados:
  - Dashboard movil: filtros colapsables, tabs horizontales, stats 2 columnas, controles tactiles mas altos, tarjetas moviles para fixtures/validations/runs, foco del detalle en movil.
  - E2E wrapper: valida que `daily-parlay-recommendations.json` sea del run actual antes de publicar, cuenta addendum obligatorio, escribe `*-outcome.json`, marca lock `published` en exito y devuelve exit no exitoso cuando el run sale 0 pero no hay publicables.
  - Shell wrapper: default de `--max-fixtures` vuelve a `10000`.
  - Telegram rich output: conserva Markdown por defecto y agrega `format: "telegram-html"` via input o `GANA_TELEGRAM_SUMMARY_FORMAT=telegram-html`, con HTML escaping, redaccion basica y truncado.
- Browser verificado despues del cambio:
  - Movil `390x844`: sin overflow horizontal; filtros colapsados a 73px; tabs flex de 46px; contenido empieza en y=426; 50 tarjetas moviles renderizadas; tabla desktop oculta en movil.
  - Click en primera tarjeta movil carga detalle y hace scroll a `#detail-panel`.
  - Desktop `1280x720`: sin overflow horizontal ni vertical; filtros no colapsados; toggle oculto; tabs siguen grid; tabla desktop visible con 50 filas.
- Verificacion:
  - `pnpm typecheck`: pass.
  - `node --check scripts/gana-daily-e2e-and-notify.mjs && node --check scripts/gana-validate-metrics-and-notify.mjs && node --check scripts/gana-strategy-review.mjs && node --check scripts/gana-council-review-notify.mjs && bash -n scripts/gana-daily-e2e-notify.sh`: pass.
  - `node --test scripts/tests/gana-telegram-rich-output.test.mjs scripts/tests/daily-e2e-wrapper-state.test.mjs`: pass, 6 tests.
  - `node --import tsx --test src/dashboard/page.test.ts src/dashboard/query.test.ts src/dashboard/server.test.ts`: pass, 35 tests.
  - `node --import tsx --test src/daily/e2e.test.ts src/daily/comparison.test.ts`: pass, 18 tests.
  - `.agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs`: pass, 25 tests.
  - `pnpm test`: fail preexistente/no relacionado en `src/harness-production-grade.test.ts` porque certification allowlist omite `llm-parlay-all-in-v1` y `llm-parlay-refinado-v1`; tambien cambia el golden hash.
  - `.agents/skills/discord-recommendation-notifier/tests/notify-discord-daily-stats.test.mjs`: fail no relacionado por expectation `🎯` vs render actual `⛳` para corners.
