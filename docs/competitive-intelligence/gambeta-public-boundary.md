---
status: canonical
owner: Gambeta Strategy Lab / Webscraper
issue: J-108
updated: 2026-07-01
source: notion-migration
source_notion_ids:
  - 390bea9e-4736-819a-b3f6-f73afafafe0c
  - 390bea9e-4736-816e-84dd-feb2e737b733
  - 390bea9e-4736-8110-8d2d-c9465e42ab7a
---

# Gambeta Public Strategy And Collection Boundary

This is the canonical public-only competitive-intelligence boundary for adapting visible gambeta.ai patterns into gana-v9. It combines the J-92 strategy index and J-93 public scraping boundary.

## Hard Rules

- Do not copy gambeta.ai branding, logos, exact wording, proprietary assets, hidden endpoints, private data, or code.
- Use only public, user-authorized competitive intelligence.
- Do not probe `/api`, authenticated routes, private Telegram/channel content, paywalls, push subscription flows, account flows, ranking mechanics, or query-based endpoints.
- Keep verified observations separate from hypotheses.
- Public strategy inputs belong in planning docs, not in public pick payloads.
- Public gana-v9 surfaces must include: `+18 only. No guaranteed profit. Bet responsibly.`

## Public Evidence Observed

The public homepage at `https://gambeta.ai/` exposes high-level patterns that are safe to learn from:

- Free AI football picks as the main acquisition layer.
- Visible results/history and confidence filtering.
- Multi-league navigation.
- Today/upcoming/live/finished-style browsing.
- Blog/FAQ education around AI, odds, bankroll, and betting concepts.
- Alert/community entry points.
- Personal bankroll or saved-picks style panel.

J-93 recorded public-only collection evidence from the site root, blog, robots.txt, sitemaps, static pages, and representative preview/article pages. It also recorded that restricted or unstable paths such as `/api`, `/ranking`, auth/account surfaces, push, query routes, and private/community areas are not collection targets.

## Adapted Gana v9 Strategy

Use public observations only to prioritize gana-v9's original funnel:

1. Make free Luis-reviewed football picks the first public screen.
2. Use transparent results/history as the trust layer.
3. Support league, market, tier, date, and status filters.
4. Convert to alerts and saved picks only after public value is visible.
5. Build SEO/FAQ around AI limitations, bankroll discipline, odds, value betting, leagues, markets, and grading rules.
6. Treat the personal panel as retention after the public feed and ledger work.
7. Reuse picks/results into X, TikTok/Reels, Telegram, and WhatsApp with canonical gana-v9 links.

Differentiation:

- Luis notes and human review.
- Visible misses and corrections.
- Conservative units.
- Sample-size guardrails.
- Original naming, UX copy, visual system, and data model.

## Allowed Collection

Allowed:

- Public HTML with 2xx responses and no robots disallow.
- Public `robots.txt`.
- Public XML sitemaps.
- Public links and labels visible in HTML.
- Public metadata for social/channel links shown on the site, without joining private channels.

Requires review:

- Browser sessions that might trigger API, auth, account, push, ranking, coupon, odds, or query traffic.
- Forms and lead capture.
- Any automated collection beyond static public HTML/XML.
- Any paid trial or community observation.

Disallowed:

- `/api` and query endpoint probing.
- `/ranking` collection or ranking-mechanics replication.
- Authenticated account/admin/private panels.
- Private Telegram, VIP, paid, or invite-only surfaces.
- Evasion of anti-bot controls.
- Copying proprietary assets or exact public copy.

## Source Notion

- `docs/notion-migration/exported/j-92-rebuild-del-indice-competitive-intelligence-gambeta--390bea9e.md`
- `docs/notion-migration/exported/j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md`
- `docs/notion-migration/exported/revision-frontera-publica-gambeta-j-93--390bea9e.md`
- Strategy references fused into `docs/growth/public-picks-funnel.md`.

## Metrics

- Public homepage observed: yes.
- Public-only docs migrated: J-92, J-93, and the empty J-93 review stub.
- Boundary coverage: homepage, blog, robots, sitemaps, public static pages, no-probe list.
- Compliance requirement: 100% of downstream docs preserve no-copy and responsible-gambling rules.

## Blockers

- No active webscraper implementation should run while the P0 freeze is active.
- Any future paid/community review needs explicit user authorization and a separate issue.

## Next Action

When Jo lifts the P0 freeze, Webscraper may implement an allow-listed static HTML/XML collector that records robots evidence, source URL, fetch time, status code, and lineage for public pages only.
