---
name: discord-recommendation-notifier
description: Use when Hermes needs to notify Gana daily recommendation selections to Discord with native Discord embed boxes from daily-parlay-recommendations.json artifacts, including parlays and atomic high-confidence predictions. This is a Hermes agent skill, not a harness prompt contract.
---

# Discord Recommendation Notifier

Use this skill to send the selections from a Gana daily recommendations artifact to Discord, and to send the daily validation/statistics summary after settlement validation.

This skill lives under `.agents/skills` for Hermes. Do not create or modify harness prompt contracts under `skills/` for this workflow.

## Inputs

- Daily recommendations artifact: `daily-parlay-recommendations.json`
- Recommendation types: ranked parlays plus `atomic-prediction` entries, which are high-confidence single-selection recommendations shaped like one-leg parlays.
- Council review artifact: `recommendation-council.json`, embedded into the final recommendations artifact as `council`.
- Transport: native Discord embeds via Hermes gateway config by default (`--transport discord-native`), plain Hermes gateway text with `--transport hermes-gateway`, or webhook with `--transport webhook`
- Gateway target: the Gana Discord channel by default, or a specific target from Hermes such as `discord:#general`
- Discord webhook: `DISCORD_WEBHOOK_URL` or `--webhook-url` only when using `--transport webhook`
- Optional max selections: `--max N` defaults to 25. Native Discord delivery automatically splits more than 8 selections into multiple embed messages unless `--single-message` is passed, which packs compact selections into one native Discord message.
- Validation stats artifact: `daily-metrics.json`, optionally paired with `validations.json`
- Validation recommendation mirror: matching `daily-parlay-recommendations.json`
- Strategy review artifact: `strategy-review.json`, produced by `pnpm gana strategy-review`, for technical Harness change notifications.
- Optional channel routing by flow: `GANA_DISCORD_RECOMMENDATIONS_TARGET`, `GANA_DISCORD_VALIDATION_TARGET`, `GANA_DISCORD_STRATEGY_TARGET`, and `GANA_DISCORD_ALERTS_TARGET`. Each falls back to `--gateway-target`, then `GANA_DISCORD_TARGET`, then the default Gana channel.

## Workflow

1. Locate the artifact. If the user gives a path, use it. Otherwise use the latest `.artifacts/gana-v9/runs/**/daily-parlay-recommendations.json`.
2. Preview the Discord message first:

   ```bash
   node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --artifact PATH --dry-run
   ```

3. Send with native Discord embed boxes through Hermes gateway config:

   ```bash
   node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --artifact PATH
   ```

4. If explicitly using a webhook instead of the gateway:

   ```bash
   DISCORD_WEBHOOK_URL=... node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --artifact PATH --transport webhook
   ```

5. Report the artifact path, selection count, transport, target, and send status. Never print webhook URLs or tokens.

For validation statistics, send native Discord boxes from daily metrics:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs \
  --date YYYY-MM-DD
```

For Harness strategy review change notifications:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-strategy-review.mjs \
  --artifact .artifacts/gana-v9/runs/RUN_ID/strategy-review.json
```

The strategy review notifier should stay technical and compact: include review scope/date range, model/reasoning, prediction/parlay hit-rate context, effective/failure patterns, proposed Harness changes with priority/status/files/rationale/impact/verification, and a final analytical-only note.

When a matching recommendations artifact exists for the validation date, the daily stats notifier sends two native Discord messages: one sober aggregate validation summary and one validated mirror in the same visual language as daily recommendations. The stats summary should stay concise, but the mirror should preserve recommendation-style boxes: rank, selection title, leg lines, compact metrics, validation status overlay, and a `Real:` line per leg when result details are available. If the recommendation artifact references a required-league addendum, hydrate it and include the full required-league section in the validation mirror: fixture coverage, required atomic predictions, optional general predictions, and required parlay boxes with the same validation overlays and `Real:` result lines.

## Message Rules

- Keep native Discord embeds/cajas for Discord delivery unless the user explicitly asks for plain text.
- Header embed format: `🏆 Gana v9 · Recomendaciones`, parlay/simple counts, and artifact date as `DD/MM/YYYY`.
- Per-parlay embed format: title, blockquote selection lines, and one compact metrics line with odds/confidence/edge/analytical stake/exposure.
- Per-atomic embed format: `📌 Simple · fixture · kickoff`, one blockquote selection line, and the same compact metrics line. Do not repeat the market/selection in the title.
- Confidence metrics use the `🍀` icon everywhere; keep `🧠` only when it is a profile emoji such as `parlay-refinado`.
- Selection boxes should include kickoff times only in titles, never in leg lines. In required-league addendum output, also keep kickoff in the `🌍 Obligatorio` fixture summary lines, but not in required prediction lines or required parlay leg lines.
- Required-league fixture summary lines should put the fixture/time header on one line ending in `:`, then the projection/prediction count on the next line.
- Avoid repeating kickoff times inside recommendation embeds; titles carry the time and inner selection lines omit it.
- When provider-comparison data is available for required-league fixtures, include a separate `📋 Predicciones generales` embed before the required parlays. Group it by required fixture and show atomic match-analysis markets with the status semaphore (`✅`, `🟡`, `🚫`), a market icon, pick, odds, and integer consensus confidence; do not print market labels like `Resultado:` or `Goles:`, do not append provider names, and do not show edge. Consolidate matching provider selections into one line. For goals, show only the highest-confidence goals pick per fixture, not multiple over/under goal lines.
- Required parlays should render as individual native Discord boxes, one per profile (`principal`, `resultados`, `mixto-seguro`, `parlay-diamante`, `parlay-refinado`, `low-variance`), using the daily parlay style: rank emoji, profile emoji/name, fixture-title summary, compact leg lines, and a compact odds/confidence metrics line.
- Required parlay legs should use the same compact selection style with a market icon, fixture, pick, and odds; put parlay-level odds/confidence on a separate compact metrics line.
- When required parlays are blocked by the same confidence-floor diagnostic, keep each profile line short (`No publicado: confianza agregada insuficiente.`) and show the best rejected combo once as a compact `🔎 Mejor combo evaluado` block with leg lines, cuota/confidence/edge, and the missed floor. Do not repeat raw `mejor combo rechazado:` text under every profile.
- Required parlay approaches use the required-league safety-first planner (`principal`, `resultados`, `mixto-seguro`) plus the daily-focus trio (`parlay-diamante`, `parlay-refinado`, `low-variance`). Prefer low-variance double-chance coverage, conservative totals pairs (high under / low over), best short double-chance pairs, and daily-focus-style low-odds pairs. These can include traceable low-price safety overrides when blocked double-chance or conservative-total candidates were blocked only by value/fair-probability gates, while preserving review-required risk flags in the output.
- Parlay titles include a profile emoji before the fixture name: `💎` principal/parlay-diamante, `⚽` resultados, `🧩` mixto-seguro/market-diverse, `🧠` parlay-refinado, `🛡️` low-variance, `📉` low-odds-top, `🚀` parlay-all-in, `🥇` parlay-oro, `⚖️` balanced, `🔥` high-conviction, `🥅` totales/totals, `🔒` conservative, `🔎` review, and `🎟️` fallback/unknown.
- When the artifact includes `parlayApproaches`, the header must show the three approach statuses with profile emojis; blocked approaches are status context, not published parlay picks.
- Do not publish raw fixture UUIDs or `Fixture ...` placeholders when persisted fixture metadata is available; the daily artifact should already carry hydrated display labels from source-run `fixtures.json`.
- Selection icons identify the market family: `⛳` corners, `🥅` goals/BTTS, `⚽` result-style soccer markets.
- Native Discord recommendation blocks are color-coded: yellow for the principal/rank-1 parlay, green for secondary parlays, and purple for simple recommendations.
- Preserve the established style in future sends: emoji-led scan lines, native Discord boxes, blockquoted selections, compact metrics, and the final manual-review control.
- Keep each native message compact enough for Discord embed limits; use the notifier's automatic multi-message pagination for 4 parlays + 10 simples.
- Use `--single-message` only when the user explicitly asks for one part / one message; it packs compact selections and cannot preserve one native colored block per selection because of Discord embed limits.
- Disable mentions with `allowed_mentions: { "parse": [] }`.
- Preserve the Gana policy: analytical artifact only, no monetary execution, no guarantees.
- When the artifact includes `stakeRecommendation`, show only the bucketed analytical bank percentage as `💵 Stake N`; allowed buckets are `1, 5, 10, 15, 20, 25`.
- Do not include payment links, bookmaker instructions, auto-execution language, or monetary execution claims.
- Validation stat notifications must use native embeds, but keep the aggregate summary sober: no repeated chart/shield sections, one concise metrics box, and plain labels such as `ganadas`, `perdidas`, `pendientes`, and `sin validar`.
- Validation notifications should include the recommendation-style mirror unless `--no-recommendation-mirror` is explicitly provided. The mirror should show each sent selection with validation overlays and `Real:` result lines. Include required-league addendum sections when present, and split native Discord mirror payloads if the added embeds exceed Discord's per-message embed limit. Use `--test-label "Esto es una prueba"` for retrospective/test sends so Discord clearly marks them.
- When the artifact includes `council`, the final recommendation control embed must include a compact `🧠 Council · Resumen final` section: status/counts, daily highlights, required-league strong projection counts, required predictions with confidence, and selected required parlays. Do not send a separate council Discord message.

## Style Persistence

The canonical style is encoded in `scripts/notify-discord-recommendations.mjs` and covered by `tests/notify-discord-recommendations.test.mjs`. Do not restyle ad hoc in prompts or one-off gateway calls. When the Discord format changes, update the script, this skill file, and the tests together so Hermes keeps sending the same style consistently.

## Script

Use `scripts/notify-discord-recommendations.mjs` for deterministic formatting, validation, latest-artifact discovery, dry-run previews, native Discord embed delivery, plain Hermes gateway delivery, and optional webhook POSTs.

Use `scripts/notify-discord-daily-stats.mjs` for validation/day-after statistics embeds by date and the validated recommendation mirror. `scripts/notify-discord-validation-stats.mjs` is available only for legacy explicit metrics/validation artifact sends that do not need the mirror.

Repo-level cron wrappers:

- `scripts/gana-daily-e2e-and-notify.mjs`: runs full daily E2E for tomorrow's Guatemala date, applies the recommendation council gate, and sends recommendations with the council summary included in the final control embed.
- `scripts/gana-validate-metrics-and-notify.mjs`: validates the previous Guatemala date scoped to the published recommendations artifact, builds daily metrics scoped to those same published targets, and sends stats.
- `scripts/install-gana-hermes-cron.sh`: installs Hermes cron jobs at 7am/10am America/Guatemala.
- `scripts/install-gana-cron.mjs`: installs a system crontab fallback at 7am/10am America/Guatemala.
- `.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs`: centralizes flow-specific Discord target resolution for notifiers and repo-level cron wrappers.

Useful commands:

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --latest --dry-run
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --artifact .artifacts/gana-v9/runs/daily-YYYY-MM-DD/daily-parlay-recommendations.json --max 25
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --artifact .artifacts/gana-v9/runs/daily-YYYY-MM-DD/daily-parlay-recommendations.json --max 25 --single-message
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs --latest --transport discord-native
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs --date YYYY-MM-DD --dry-run
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs --date YYYY-MM-DD --test-label "Esto es una prueba"
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-strategy-review.mjs --artifact .artifacts/gana-v9/runs/RUN_ID/strategy-review.json --dry-run
node .agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs
node .agents/skills/discord-recommendation-notifier/tests/notify-discord-daily-stats.test.mjs
node .agents/skills/discord-recommendation-notifier/tests/discord-targets.test.mjs
```
