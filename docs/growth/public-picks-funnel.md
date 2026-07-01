---
status: canonical
owner: Gambeta Strategy Lab / Product / Growth
issue: J-108
updated: 2026-07-01
source: notion-migration
source_notion_ids:
  - 38dbea9e-4736-81ef-9afc-c606d0d98776
  - 38dbea9e-4736-81d3-898d-e0bb31e10c5b
  - 38dbea9e-4736-8153-936d-e3b5e8d08d4b
  - 38dbea9e-4736-8159-9bc1-d0560b5d9cb1
---

# Gana v9 Public Picks Funnel

This is the canonical repo version of the public picks acquisition strategy migrated from Notion for J-108. It turns public competitive intelligence into an original gana-v9 funnel centered on Luis-reviewed picks, transparent results, and conservative risk framing.

Public wagering-adjacent surfaces must always include this visible line:

> +18 only. No guaranteed profit. Bet responsibly.

## Summary

The first public screen should be a useful free football picks experience, not a marketing-only landing page. A visitor should immediately see fresh gana-v9 picks, the match context, confidence tier, stake framing, Luis's short note, kickoff status, and the path to results/history.

The funnel should convert trust after value is visible:

1. Public visitor reads free picks.
2. Visitor checks history, result status, and transparent misses.
3. Visitor opts into alerts or saves picks.
4. Registered user gets saved picks, preferences, personal bankroll notes, and later private-tier intent.
5. Growth reuses each pick/result as an original social asset with a canonical gana-v9 link.

## Competitive Evidence

Public evidence from `https://gambeta.ai/` was used only at the pattern level. The visible public page includes free AI football picks, results/history modules, many league filters, status views, blog/FAQ education, alert/community entry points, and a bankroll/personal panel concept. Do not copy their branding, exact copy, visual assets, ranking mechanics, private routes, hidden endpoints, code, or proprietary data.

The gana-v9 adaptation is differentiated by:

- Luis-reviewed picks and notes instead of anonymous certainty language.
- Lean / Value / Prime tiers as confidence filters, not promises.
- Append-only results and visible misses as the main trust layer.
- Conservative unit staking and sample-size guardrails.
- Original gana-v9 URLs, copy, share assets, and responsible-gambling language.

## Public Product Surface

### Hero and first viewport

- Brand signal: Gana v9 / Luis-reviewed football picks.
- Promise: free daily football picks with transparent results.
- Stats: published picks, settled picks, hit rate only when sample exists, ROI hidden until thresholds are met.
- Daily picks: 3 to 5 cards when fresh picks exist.
- Risk line: `+18 only. No guaranteed profit. Bet responsibly.`
- CTA: alert opt-in, save picks, or private-tier waitlist only after picks are visible.

### Pick card

Each card should show:

- League and kickoff time.
- Home and away teams.
- Market and selection.
- Odds at publish time when available.
- Confidence tier: Lean, Value, or Prime.
- Stake units when supplied by the approved pipeline.
- Luis note: 1 to 2 public-safe lines.
- Result state if settled.
- Share action with canonical gana-v9 URL.

No card should include draft predictions, raw prompts, provider request IDs, private diagnostics, raw lead emails, or personal betting advice.

### Feed navigation

Required views:

- Today.
- Upcoming.
- Live.
- Finished.
- Results.

Required controls:

- League chips.
- Market dropdown.
- Tier segmented control.
- Date picker.
- Status tabs.
- Saved-only toggle after login.

### Results and history

Results are a product surface, not a small proof widget. The default should show the last 30 days, with filters by status, league, market, tier, and date range.

Rules:

- Never delete losing picks.
- Do not silently edit picks after kickoff.
- Corrections require visible notes.
- Publish-time odds, market, selection, tier, and stake data are locked for metrics.
- Backfilled picks cannot improve public performance metrics.
- Empty states must be honest: no fake picks, fake win rates, or placeholder ROI.

Metric guardrails:

- Hit rate can show once there is at least one settled non-void pick and must be labeled as settled hit rate.
- ROI/profit-loss stay hidden until odds, stake units, and settlement P/L are reliable and at least 30 settled non-void picks exist.
- Pending and void picks are excluded from hit-rate denominator.

## Funnel Layers

Free:

- Public feed.
- Public results/history.
- Daily email, Telegram, or WhatsApp alerts.
- Weekly recap.

Registered:

- Saved picks.
- Alert preferences.
- Followed leagues.
- Personal bankroll journal.
- Personal performance view.

Private tier:

- Earlier alerts.
- Luis watchlist.
- Deeper rationale.
- Community channel.
- Private weekly review.

Paid copy must never imply guaranteed outcomes, risk-free profit, or personalized financial advice.

## SEO And Education

SEO content should support the product rather than replace picks. Priority clusters:

- How AI football picks work and what they cannot guarantee.
- Bankroll units, staking discipline, and avoiding chase betting.
- Odds, implied probability, and value betting basics.
- League pages for Liga MX, Premier League, LaLiga, Champions League, Copa Libertadores, World Cup, and other owned coverage.
- Market explainers for 1X2, BTTS, totals, Asian handicap, corners, and supported contract markets.
- Results methodology and void rules.
- Responsible gambling and risk controls.
- Luis weekly review with lessons from wins and losses.

## Analytics

Minimum instrumentation:

- Unique public picks visitors.
- Pick-card impressions.
- Pick-detail opens.
- Alert opt-in conversion.
- Saved-pick conversion.
- Results-page views.
- Results-to-alert conversion.
- Share-card clicks.
- Private-tier waitlist intent.
- Published pick count.
- Settled pick count.
- Settlement latency.
- Visible correction count.
- Responsible-language coverage.

Launch acceptance:

- At least 10 real Luis-owned public picks can be published and settled without editing history.
- Public results reconcile with the internal public pick ledger.
- Every public pick, result, social asset, CTA, and lead-capture state includes `+18 only. No guaranteed profit. Bet responsibly.`

## Source Notion

- `docs/notion-migration/exported/j-54-gana-v9-public-picks-funnel-blueprint--38dbea9e.md`
- `docs/notion-migration/exported/j-56-public-picks-contract-gana-v9--38dbea9e.md`
- `docs/notion-migration/exported/j-57-public-results-history-and-trust-layer-spec-gana-v9--38dbea9e.md`
- `docs/notion-migration/exported/j-64-cmo-review-differentiation-originality-and-18-language--38dbea9e.md`

## Blockers

- The current checkout does not contain the Notion-referenced `docs/contracts`, `packages/contract-schemas`, or `apps/public-api` paths. Engineering should verify the active public API/schema location before implementation.
- Product/growth execution remains subject to the P0 freeze until Jo clears the P0 workstream map.

## Next Action

Founding Engineer / Product should map the active gana-v9 data model to this public surface and ship the first feed slice only after the responsible-gambling line, freshness checks, and append-only result rules are enforced.
