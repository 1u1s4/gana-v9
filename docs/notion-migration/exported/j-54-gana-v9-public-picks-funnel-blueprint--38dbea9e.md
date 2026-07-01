---
source: notion
notion_id: 38dbea9e-4736-81ef-9afc-c606d0d98776
notion_url: https://app.notion.com/p/J-54-Gana-v9-public-picks-funnel-blueprint-38dbea9e473681ef9afcc606d0d98776
title: "J-54 - Gana v9 public picks funnel blueprint"
---

# J-54 - Gana v9 public picks funnel blueprint

Status: ready for product execution
Owner: Gambeta Strategy Lab; Notion sync owner: CMO
Synced by J-72 on 2026-06-28 America/Guatemala.
Source issue: J-54 /J/issues/J-54#document-blueprint
Implementation issue: J-66 /J/issues/J-66
Sync issue: J-72 /J/issues/J-72
> +18 only. Picks do not guarantee profit. Bet responsibly and only with money you can afford to lose.
## Summary
This page syncs the completed J-54 strategy blueprint into the company Notion documentation system. The core strategy is to make free, Luis-reviewed football picks the first public screen, then convert trust into registered users through transparent results, bankroll-safe framing, daily alerts, SEO education, and a later personal panel.
The blueprint adapts public, visible patterns observed from gambeta.ai into original Gana v9 assets. It does not copy competitor branding, logos, exact copy, assets, private data, restricted endpoints, or code.
Winning pattern: a free daily habit loop with visible picks, league/time/status navigation, confidence and stake framing, public results/history, search-capturing education, social/community alerts, and a personal panel for retention.
## Decisions
- Decision: Make free football picks the first public screen. Owner: CMO/Product. Date: 2026-06-28. Rationale: visitors should see today's Luis-reviewed picks immediately instead of a marketing-only landing page.
- Decision: Use confidence tiers without implying certainty. Owner: CMO/Product. Date: 2026-06-28. Rationale: Lean, Value, and Prime make picks scannable while preserving risk language and avoiding guaranteed-win claims.
- Decision: Publish an append-only results ledger. Owner: Product/Engineering. Date: 2026-06-28. Rationale: trust comes from visible misses, locked publish-time odds, settlement states, and correction notes.
- Decision: Build multi-league navigation around user intent. Owner: Product. Date: 2026-06-28. Rationale: Today, Upcoming, Live, Finished, and Results views map to how users scan betting opportunities.
- Decision: Capture leads only after value is visible. Owner: Growth. Date: 2026-06-28. Rationale: free feed access creates trust before asking for email, WhatsApp, Telegram, saved picks, or private-tier waitlist intent.
- Decision: Differentiate on Luis, transparency, and bankroll discipline. Owner: CMO. Date: 2026-06-28. Rationale: Gana v9 should not clone competitor ranking or coin mechanics; it should own Luis notes, result transparency, and conservative unit staking.
- Decision: Treat SEO content as a product layer. Owner: Content/Growth. Date: 2026-06-28. Rationale: education, league pages, market explainers, methodology, responsible gambling, and weekly reviews create durable acquisition paths.
- Decision: Make the personal panel a retention surface, not a phase-one blocker. Owner: Product. Date: 2026-06-28. Rationale: saved picks, bankroll journal, watched leagues, alerts, and cooldown warnings matter after the public feed and ledger are live.
## Evidence/Links
- Paperclip source issue: J-54 /J/issues/J-54#document-blueprint
- Implementation child: J-66 /J/issues/J-66
- Notion sync issue: J-72 /J/issues/J-72
- Repo source: repo/docs/plans/2026-06-28-j-54-gana-v9-public-picks-funnel-blueprint.md
- Public homepage observed: https://gambeta.ai/
- Public robots boundary observed: https://gambeta.ai/robots.txt
- Public sitemap observed: https://gambeta.ai/sitemap.xml
- Public preview sitemap observed: https://gambeta.ai/sitemap-previas.xml
- Prior CI workspace reference: docs/plans/2026-04-21-j-22-gambeta-notion-workspace.md
- Growth ops dashboard reference: docs/plans/2026-06-28-j-47-growth-content-ops-dashboard.md
## Metrics
- Competitive evidence: homepage HTTP status 200; homepage visible text length after script/style removal 16991.
- Competitive term signals counted: gratis=23, apuesta=37, bankroll=13, result=18, telegram=4, vip=6, bot=8.
- Sitemap evidence: main sitemap URL count 349; blog URL count 266; preview-like URL count 72; preview sitemap URL count 32.
- Compliance guardrail: restricted routes respected, including /api, /ranking, and query-filtered routes from robots.txt.
- Product instrumentation targets: unique visitors, pick-card impressions, pick-detail CTR, alert opt-in conversion, saved-pick conversion, D1/D7/D30 registered-user retention, settled pick count, settlement latency, results-page views, share-card clicks, private-tier waitlist conversion.
## Blockers
- Blocker: none for Notion sync. The previous J-54 direct-write blocker is resolved by this J-72 sync using the live Notion API token available to the CMO runtime.
- Implementation dependency: J-66 owns Slice 1 product execution for the public picks feed and responsible-gambling guardrails.
## Next Action
- Owner: Founding Engineer / Product Engineering via J-66.
- Action: build the public picks feed with today/upcoming/finished filters, Luis note, confidence tier, stake units, result status, and visible +18 / no guaranteed profit / bet responsibly language.
- Due/trigger: continue from J-66; this Notion sync is complete and no longer blocks implementation.
---
## Original Funnel Blueprint
### Public Homepage
- Above the fold: Gana v9 brand signal, daily free picks promise, three trust stats, visible responsible gambling line, three to five daily pick cards, and a get-free-daily-alerts CTA.
- Pick card: league, kickoff, teams, market/selection, odds at publish, tier chip, stake units, short Luis note, result status if settled, and share action.
### Picks Feed
- Views: today, upcoming, live, finished, all results.
- Controls: league chips, market dropdown, tier segmented control, date picker, status tabs, saved-only toggle after login.
### Results/History
- Public default: last 30 days, transparent wins/losses/voids, ROI only after enough settled picks exist, and filters by tier, league, and market.
- Rules: never delete losing picks; corrections require visible notes; odds lock at publish time; no backfilled picks in public performance metrics.
### Paid/Community Funnel
- Free: public feed, daily email/Telegram/WhatsApp alert, weekly recap.
- Registered: saved picks, personal bankroll journal, alert preferences, followed leagues.
- Private tier: earlier alerts, Luis watchlist, deeper rationale, community channel, private weekly review.
### Social Loop
- Daily distribution assets: image card per pick, short X thread with top picks and responsible gambling line, TikTok/Reels script with one pick and one lesson, Telegram/WhatsApp alert linking back to pick detail, weekly results recap card.
- Every shared card should include match, pick, tier, odds at publish, +18/no guaranteed profit language, and canonical Gana v9 URL.
### Implementation Sequence
1. Slice 1: public pick contract and feed. Ship public pick schema, today/upcoming/finished views, Luis note, tier/stake presentation, and responsible gambling component. Acceptance metric: at least 10 real Luis-owned picks can be published and settled without editing history.
2. Slice 2: results ledger and trust stats. Ship append-only results table, settlement states, last 7/30/90-day metrics, filters, and correction notes. Acceptance metric: public results page reconciles exactly with the internal pick ledger.
3. Slice 3: lead capture and alerts. Ship email capture, Telegram/WhatsApp opt-in tracking, daily pick alert template, and unsubscribe/stop flow. Acceptance metric: pick-view to alert-opt-in conversion is measurable.
4. Slice 4: personal panel. Ship saved picks, bankroll journal, personal result tracking, followed leagues, and alert preferences. Acceptance metric: registered users can see saved picks and bankroll history across sessions.
5. Slice 5: SEO and social operating loop. Ship blog/FAQ templates, league pages, match preview template, weekly Luis review, and share-card generator. Acceptance metric: each published pick can become a share card and each major match can become an indexed preview page.
### What To Avoid
- Do not use competitor logos, colors, brand names as product framing, exact wording, UI clone, ranking clone, coin mechanics clone, competitor APIs, restricted routes, hidden endpoints, or private Telegram/channel scraping.
- Do not present backfilled results as live picks or use risk-free, sure-win, guaranteed-profit, or similar claims.
- Do not publish ROI claims before sample size is large enough and settlement rules are documented.
- Do not provide personal betting advice without bankroll and risk context.
### SEO Content Clusters
- AI picks education: how AI football picks work and limits of AI predictions.
- Bankroll: unit staking, bankroll logging, avoiding chase betting.
- Value betting: odds vs probability and expected value basics.
- League pages: Liga MX, Premier League, LaLiga, Champions, World Cup.
- Market explainers: 1X2, BTTS, totals, Asian handicap, corners.
- Results methodology: how Gana v9 grades picks and voids.
- Responsible gambling: +18, no guarantees, risk controls.
- Luis weekly review: weekly picks recap and lessons.
### Responsible Gambling Disclaimer
> Gana v9 is for informational and entertainment purposes only. Predictions are not guarantees. Bet responsibly, only if legal in your jurisdiction, and never wager more than you can afford to lose. If gambling stops being fun or feels hard to control, seek local help and support.
### Paperclip Link Index
[J-54 source blueprint](http://127.0.0.1:3100/J/issues/J-54#document-blueprint)
[J-66 implementation child](http://127.0.0.1:3100/J/issues/J-66)
[J-72 Notion sync issue](http://127.0.0.1:3100/J/issues/J-72)
