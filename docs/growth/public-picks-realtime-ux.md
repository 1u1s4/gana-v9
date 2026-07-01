---
status: canonical
owner: Gambeta Strategy Lab / Product / Growth
issue: J-113
updated: 2026-07-01
source: public-only competitive intelligence + repo docs
---

# Public Picks Realtime UX Spec

This is the J-113 implementation spec for the premium public picks surface. It extends the canonical public funnel with a realtime UX, Spanish copy system, Discord-to-web mapping, and free-to-paid conversion rules.

Boundary:

- Use only public, user-authorized competitive intelligence.
- Do not copy competitor branding, exact copy, assets, private data, hidden endpoints, code, ranking mechanics, or proprietary flows.
- Keep gana-v9 differentiated through Luis-reviewed picks, visible misses, conservative exposure language, and append-only results.
- Every public wagering-adjacent surface must show: `+18 only. No guaranteed profit. Bet responsibly.`

## Source Inputs

- Public competitor root page observed on 2026-07-01: `https://gambeta.ai/`.
- Existing canonical strategy: `docs/growth/public-picks-funnel.md`.
- Existing conversion contract: `docs/growth/free-to-paid-funnel.md`.
- Existing measurement contract: `docs/growth/free-to-paid-measurement-contract.md`.
- Existing CI boundary: `docs/competitive-intelligence/gambeta-public-boundary.md`.
- Existing Discord recommendation contract: `docs/discord-recommendation-notifications.md`.

Safe pattern-level takeaways from the public page:

- Free football picks are the acquisition layer.
- Trust comes from visible results, status filters, confidence filters, and history.
- Breadth matters: many leagues, World Cup coverage, today/upcoming/live/finished views, blog/FAQ, alerts, community, and personal performance concepts.
- Gana-v9 must implement those patterns with original naming, original copy, Luis-owned picks, and responsible-risk language.

## Product Promise

First-screen promise:

> Picks gratis de futbol revisados por Luis, con historial visible, riesgo claro y cero promesas de ganancia.

Supporting copy:

> Gana v9 publica picks simples, parlays analiticos y resultados liquidados sin borrar perdidas. Mira el contexto, la cuota de publicacion y la nota de riesgo antes de activar alertas.

Compliance line:

> +18 only. No guaranteed profit. Bet responsibly.

## Visual Hierarchy

### 1. Hero

Purpose: establish brand, value, trust, and fresh action in the first viewport.

Required content:

- Brand: `Gana v9` and `Picks revisados por Luis`.
- Headline: free football picks with visible history and risk framing.
- Daily proof: counts for approved picks, review-required picks, live picks, and settled results.
- Primary CTA: `Ver picks de hoy`.
- Secondary CTA: `Ver historial`.
- Tertiary route after value: `Recibir alertas`.
- Responsible-gambling line immediately under CTAs.

Hero stats should show only reliable values:

- `Picks publicados`
- `Liquidados`
- `Acierto liquidados`
- `Correcciones visibles`
- `Ultima actualizacion`

Do not show ROI/profit until the measurement contract threshold is met: at least 30 settled non-void picks with reliable odds, units, and settlement P/L.

### 2. Daily Summary

Place directly below the hero or sticky under top nav on mobile.

Fields:

| Field | Display rule |
| --- | --- |
| `Fecha` | Guatemala timezone, absolute date in detail view. |
| `Estado del slate` | `Listo`, `En revision`, `Datos atrasados`, or `Sin picks aprobados`. |
| `Picks aprobados` | Count only public-safe approved picks. |
| `Parlays` | Count approved analytical parlays. |
| `Simples` | Count approved atomic picks. |
| `Mundial 2026` | Count World Cup picks when present; show empty state when none. |
| `Revision manual` | Always visible if any pick is review-required. |

Daily summary copy:

- Good state: `Slate de hoy listo: revisado por Luis y publicado con riesgo visible.`
- Review state: `Hay picks en revision. No se promocionan hasta pasar control manual.`
- Stale state: `Datos sin actualizar recientemente. Revisa hora de publicacion antes de actuar.`
- Empty state: `Hoy no hay picks aprobados. Mejor no publicar que forzar valor.`

### 3. Feed Navigation

Required top-level views:

- `Hoy`
- `Proximos`
- `En vivo`
- `Terminados`
- `Resultados`

Required filters:

- Liga
- Mercado
- Tier
- Fecha
- Estado
- Mundial 2026
- Guardados, only after login

Mobile behavior:

- Status tabs stay visible.
- Secondary filters collapse into a sheet.
- Current filter chips remain visible so users know what is active.

### 4. Live Cards

Cards must be useful before conversion copy appears.

Required card fields:

- League.
- Fixture with real team names.
- Kickoff in Guatemala time.
- Publish timestamp.
- Status: upcoming, live, finished, void, corrected, review-required, stale.
- Market and selection.
- Odds at publication time, if available.
- Tier: Lean, Value, Prime.
- Exposure units, only if approved by the analytical pipeline.
- Luis note, 1 to 2 public-safe lines.
- Risk note.
- Result state and correction note when settled.
- Save/share action with canonical gana-v9 URL.

Card layout:

- Top line: league, kickoff, status.
- Main block: teams, market, selection, odds.
- Confidence row: tier, exposure, confidence/edge only when approved for public display.
- Rationale: Luis note.
- Risk footer: risk note plus responsible-gambling line in card detail.

Never expose:

- Raw prompts.
- Provider request IDs.
- Private diagnostics.
- Raw lead emails.
- Unreviewed predictions.
- Admin actions.
- Monetary execution language.

### 5. Parlay Stack

Purpose: make portfolio variety visible without encouraging reckless accumulation.

Ordering:

1. `Parlay destacado`, only if approved and not review-required.
2. `2-leg`
3. `3-leg`
4. `4-leg`
5. `Corners watchlist`
6. `Simples fuertes`

Each parlay card must show:

- Type: `2-leg`, `3-leg`, `4-leg`, `Corners watchlist`, or `Simple`.
- Family: `Consenso mixto`, `Solo Codex`, `Solo proveedor`, or `Manual Luis`.
- Risk: `Riesgo bajo`, `Riesgo medio`, `Riesgo alto`, or `Revision requerida`.
- Legs with fixture, market, selection, odds, and warning when present.
- Combined odds, aggregate confidence, expected edge, and analytical exposure only when approved.
- Reason: one sentence on why the stack is grouped.

Copy rule:

- Use `simple` or `seleccion individual` for one-leg items.
- Do not call singles "parlays de una pata" in public UX.
- Use `exposicion analitica`, not betting instruction language.

### 6. Mandatory World Cup Block

The public surface must include a dedicated `Mundial 2026` block while the project has World Cup coverage enabled.

Position:

- Desktop: below the daily summary, above the general league feed.
- Mobile: after the first two approved picks, before long lists.

Content:

- Today/upcoming World Cup fixtures from the approved feed.
- Luis note when a World Cup pick is approved.
- `Sin pick aprobado` state when no World Cup pick passes review.
- Link to World Cup results/history filtered view.

Copy:

- Header: `Mundial 2026`
- Subcopy: `Solo mostramos picks aprobados. Si no hay valor claro, el bloque queda en espera.`
- Empty: `No hay pick Mundial aprobado para esta ventana.`

Do not show countdowns or tournament timing unless sourced from a verified feed for the current date.

### 7. Trust And History Layer

Results are not a footer proof widget; they are a primary trust surface.

Required sections:

- `Historial reciente`
- `Ultimos 30 dias`
- `Picks perdidos visibles`
- `Correcciones`
- `Metodologia de resultados`

Required columns:

- Date.
- Fixture.
- Market.
- Selection.
- Publish odds.
- Tier.
- Exposure units.
- Result.
- P/L only after threshold and with methodology.
- Correction note.

Rules:

- Never delete losing picks.
- Never silently edit after kickoff.
- Corrections require visible note and timestamp.
- Backfilled picks cannot improve public metrics.
- Pending and void picks stay out of hit-rate denominator.

### 8. CTA Layer

CTAs must appear after value is visible.

Allowed CTAs:

- `Recibir alerta diaria`
- `Guardar este pick`
- `Seguir historial`
- `Unirme a Telegram`
- `Enviar WhatsApp`
- `Entrar al panel`
- `Ver plan privado`

CTA hierarchy:

1. Feed card detail: save/share or alert for that pick.
2. Results page: weekly recap or results alert.
3. Empty day: follow alerts for next approved slate.
4. Paid intent: private board waitlist after the user has seen picks/results.

Never use CTA copy that implies guaranteed profit, certain wins, or risk-free access.

## Spanish Copy System

Tone:

- Clear, calm, direct.
- Public-friendly Spanish for LATAM users.
- Confident about process, cautious about outcomes.
- Luis is the reviewer, not a miracle predictor.

Voice rules:

- Say what the pick is, why it exists, and what can break it.
- Prefer `riesgo`, `revision`, `historial`, `cuota publicada`, and `exposicion`.
- Avoid hype, urgency traps, and certainty language.

Approved labels:

| Concept | Label |
| --- | --- |
| Public feed | `Picks de hoy` |
| Realtime section | `Feed en vivo` |
| History | `Historial visible` |
| Results | `Resultados` |
| Saved picks | `Guardados` |
| Alerts | `Alertas` |
| Private tier | `Panel privado` |
| Strong simple | `Simple fuerte` |
| Parlay | `Parlay analitico` |
| Review gate | `Revision requerida` |
| Stale data | `Datos atrasados` |
| No pick | `Sin pick aprobado` |
| Manual footer | `Revision manual pendiente` |

Tier definitions:

| Tier | Public meaning |
| --- | --- |
| `Lean` | Pick con tesis defendible, exposicion baja. |
| `Value` | Pick donde cuota y contexto justifican atencion. |
| `Prime` | Pick con mejor encaje del slate, sin prometer resultado. |

Banned copy:

- `seguro`
- `fijo`
- `garantizado`
- `ganancia garantizada`
- `profit guaranteed`
- `dinero facil`
- `apuesta sin riesgo`
- `all-in`
- `recupera tus perdidas`

## Realtime States

### Loading

UX:

- Skeleton cards for hero stats, daily summary, and first feed cards.
- Do not show fake picks.
- Keep the responsible-gambling line visible.

Copy:

> Cargando picks aprobados...

### Stale Data

Trigger:

- Feed `lastUpdatedAt` exceeds the freshness threshold set by engineering, or source run is older than the active slate window.

UX:

- Show amber banner.
- Keep cards readable.
- Disable "share as fresh" social action.

Copy:

> Datos atrasados. Verifica la hora de publicacion antes de compartir o guardar.

### Review Required

Trigger:

- Any recommendation is not approved by the manual/council gate.

UX:

- Show review badge.
- Hide conversion CTAs for the item.
- Allow details only for internal/admin contexts, not public promotion.

Copy:

> Revision requerida. Este pick no esta listo para promocion publica.

### Empty Day

Trigger:

- No picks approved for the selected date/filter.

UX:

- Show honest empty state.
- Offer results/history and alerts for future approved picks.
- Do not backfill old anchors as live advice.

Copy:

> Hoy no hay picks aprobados para este filtro. Mejor esperar que forzar una jugada.

### Manual Review Footer

Always visible on feed and detail pages:

> Picks informativos revisados por Luis. No hay ejecucion monetaria, no hay ganancias garantizadas y cada seleccion puede perder. +18 only. No guaranteed profit. Bet responsibly.

## Discord-To-Web Mapping

The public web surface should map the daily Discord structure into a user-facing product hierarchy.

| Discord artifact concept | Public web module |
| --- | --- |
| Header counts: parlays, simples, review state | Daily summary strip. |
| Provider health / blocked status | Internal/admin badge; public sees `En revision` or `Datos atrasados`. |
| Parlay rank and type | Parlay stack card ordering. |
| Family: codex-only, provider-only, consensus-mixed | Public label: `Solo Codex`, `Solo proveedor`, `Consenso mixto`. |
| Risk flags | Card warning row and review badge. |
| Leg fixture/selection/odds | Leg list inside parlay card. |
| Confidence/edge/exposure | Public metrics row, only if approved. |
| Reason | `Razon de Luis` or `Por que entra`. |
| Final manual review line | Feed footer and card detail footer. |

Public ordering based on the Discord example:

1. Page header: `Gana v9 · Recomendaciones analiticas`.
2. Summary: `N parlays · M simples · revision state`.
3. Safety line: `Sin ejecucion monetaria · Sin garantia`.
4. Ranked parlay cards.
5. Ranked simple cards.
6. Corners watchlist, if present.
7. Manual-review footer.

Public copy must translate technical status into user-safe language. For example, internal `mixed-risk` becomes `Riesgo medio`; internal `unvalidated` becomes `Pendiente de validar`; fixture UUIDs must never render when team names are available.

## Conversion Flow

### Free Public

Entry points:

- Hero.
- Today's picks.
- Results/history.
- World Cup block.
- SEO article.
- Social share URL.

User value:

- See picks.
- Understand risk.
- Check history.
- Save/share.

Primary conversion:

- Daily alert opt-in.
- Telegram/WhatsApp channel.
- Return visit through canonical pick URL.

### Registered

Unlocked value:

- Saved picks.
- League preferences.
- Alert preferences.
- Personal performance journal.
- Bankroll notes.

Guardrail:

- Personal panel language is educational and tracking-oriented, not individualized financial advice.

### Private Tier

Paid intent should be introduced only after public proof is visible.

Private value:

- Earlier alerts.
- Full board.
- Luis watchlist.
- Deeper rationale.
- Weekly review.
- Community discussion.

Paid copy:

- Sell speed, organization, context, and discipline.
- Do not sell certainty or profit.

Approved paid CTA:

> Quiero acceso al panel privado cuando haya cupos.

Disallowed paid CTA:

> Asegura ganancias con picks VIP.

## SEO And Social Loop

SEO modules should support the product, not replace the feed.

Priority pages:

- Como funciona la IA en picks de futbol.
- Bankroll y unidades.
- Cuotas, probabilidad implicita y valor.
- Resultados y reglas de void.
- Liga MX, Premier League, LaLiga, Libertadores, Champions League, Mundial 2026.
- Mercados: 1X2, doble oportunidad, totales, BTTS, handicap asiatico, corners.

Social distribution:

- X: one pick, one risk line, canonical URL.
- TikTok/Reels: Luis note, fixture, risk, result follow-up.
- Telegram/WhatsApp: approved slate and result recap.
- Discord: operational recommendation embed, mapped into public web modules.

Every social asset must carry a responsible-risk line or link to a page where that line is visible before conversion.

## Acceptance Checklist

- Hero shows fresh value before signup.
- Daily summary includes approval/review/freshness state.
- Feed supports today, upcoming, live, finished, and results.
- League, market, tier, date, status, and World Cup filters exist in the spec.
- Pick cards include fixture, market, selection, odds, tier, exposure, Luis note, risk, and status when available.
- Parlay stack supports simples, 2-leg, 3-leg, 4-leg, corners watchlist, family, risk, warnings, and reasons.
- World Cup block has an honest empty state.
- Results/history is append-only and exposes losses/corrections.
- Loading, stale, review-required, empty day, and manual-review states have copy.
- Free-to-paid CTAs avoid profit guarantees.
- Discord structure maps cleanly to web modules.
- `+18 only. No guaranteed profit. Bet responsibly.` is visible in hero, lead capture, card detail, and footer.

## Summary

J-113 defines the premium public picks UX for gana-v9: a useful first-screen feed, realtime state handling, parlay stack, mandatory World Cup block, trust/history layer, Spanish copy system, and compliant free-to-paid path.

## Decisions

- Keep repo Markdown as the canonical operational documentation path per the current J-111 docs rule; this file is the durable J-113 handoff.
- Use public competitor observations only at pattern level.
- Lead with Luis-reviewed picks and visible results instead of anonymous certainty.
- Hide ROI/profit claims until the measurement threshold is met.
- Treat review-required, stale, and empty states as first-class UX, not errors to cover with marketing copy.
- Map Discord's operational recommendation structure into public modules without exposing provider internals or UUID fixtures.

## Links

- Paperclip issue: `J-113`.
- Public competitor evidence: `https://gambeta.ai/` observed on 2026-07-01.
- Strategy source: `docs/growth/public-picks-funnel.md`.
- Conversion source: `docs/growth/free-to-paid-funnel.md`.
- Measurement source: `docs/growth/free-to-paid-measurement-contract.md`.
- CI boundary: `docs/competitive-intelligence/gambeta-public-boundary.md`.
- Discord source: `docs/discord-recommendation-notifications.md`.

## Metrics

- Spec files added: 1.
- Required issue deliverable paths covered: `docs/growth/public-picks-realtime-ux.md`.
- Required realtime states covered: 5 of 5.
- Required visual hierarchy blocks covered: 7 of 7.
- Responsible-gambling line coverage in spec: hero, lead capture, card detail, feed/footer, social loop.

## Blockers

- No live Notion connector is available in this execution context; the current repo docs state that Notion is historical only after J-111.
- Implementation still needs engineering to bind the spec to the active public API/schema and persisted publication ledger.

## Next Action

Product/engineering should translate this spec into UI tasks for the public picks app: realtime data contract, feed state components, parlay stack, World Cup block, history table, and CTA instrumentation.
