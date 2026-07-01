---
source: notion
notion_id: 38dbea9e-4736-8153-936d-e3b5e8d08d4b
notion_url: https://app.notion.com/p/J-57-Public-Results-History-and-Trust-Layer-Spec-gana-v9-38dbea9e47368153936de3b5e8d08d4b
title: "J-57 Public Results/History and Trust Layer Spec - gana-v9"
---

# J-57 Public Results/History and Trust Layer Spec - gana-v9

Mirrored from docs/plans/2026-06-28-j-57-public-results-history-trust-layer-spec.md on 2026-06-28. Paperclip issue: J-57. Closure issue: J-78.
# J-57 Public Results/History and Trust Layer Spec
Status: ready except direct Notion mirror
Owner: Gambeta Strategy Lab
Issue: \[J-57\](/J/issues/J-57)
Updated: 2026-06-28
## Summary
This spec defines the gana-v9 public trust layer for free football picks: an append-only results/history surface, transparent grading rules, filters, confidence buckets, public accuracy metrics, and responsible gambling disclaimers.
The goal is credibility without overclaiming. The public page should make Luis's own picks, wins, losses, voids, and pending results easy to inspect while avoiding any suggestion of guaranteed profit.
Public-facing responsible gambling language must remain visible in the hero, every results/history view, pick detail, share card, and lead-capture state:
> +18 only. No pick guarantees profit. Bet responsibly and only with money you can afford to lose.
## Decisions
1. Results are a first-class product surface, not a small proof widget.
The trust layer should have a dedicated \`/public/results\` experience plus summary modules on the public homepage and daily picks feed. The default results view should show the last 30 days, with recent settled results and a compact performance summary visible without login.
1. The public ledger is append-only.
Published picks must not be deleted or silently edited after kickoff. Corrections are allowed only as additional correction records linked to the original pick. Losing picks remain visible.
1. Publish-time data is locked before kickoff.
Public metrics should use the pick state captured at publish time: market, selection, confidence tier, stake units, odds if available, model probability if public-safe, edge if reliable, Luis note, and responsible-gambling disclaimer. Backfilled or edited fields cannot improve historical metrics.
1. Confidence tiers are trust filters, not certainty claims.
The public UI should map existing contract tiers to original gana-v9 labels:
`| Contract tier | Public label | Meaning | Suggested unit range |`
`| --- | --- | --- | --- |`
`| \`low\` | \`Lean\` | Interesting edge, lower conviction | \`0.25u-0.5u\` |`
`| \`medium\` | \`Value\` | Price/model gap is the main reason | \`0.5u-0.75u\` |`
`| \`high\` | \`Prime\` | Model edge plus Luis review alignment | \`0.75u-1u\` |`
The labels must never imply a safe bet, guaranteed outcome, or risk-free profit.
1. Accuracy metrics need sample-size guardrails.
Show hit rate once there is at least one settled non-void pick, but label it as settled hit rate. Show ROI or profit/loss only after odds and stake units are locked end to end and at least 30 settled non-void picks exist. Before that, render "sample building" instead of an ROI number.
1. Public result states are explicit.
Allowed display states:
`| State | Public meaning |`
`| --- | --- |`
`| \`upcoming\` | Published before kickoff, not started |`
`| \`live\` | Fixture in progress, not settled |`
`| \`won\` | Settled as a win by validation or supported score inference |`
`| \`lost\` | Settled as a loss by validation or supported score inference |`
`| \`void\` | Stake returned or market invalid under documented grading rules |`
`| \`pending\` | Fixture/validation incomplete; not counted as a win or loss |`
`| \`corrected\` | Original settlement was updated with a visible correction note |`
1. Filters should support investigation, not only browsing.
Required public filters:
`| Filter | Default behavior |`
`| --- | --- |`
`| Date range | Last 30 days default, with 7/30/90-day shortcuts |`
`| Status | Upcoming, live, finished, won, lost, void, pending |`
`| League | All leagues plus visible league chips from the feed |`
`| Market | Moneyline, totals, BTTS, spreads, and any supported contract market |`
`| Tier | Lean, Value, Prime |`
`| Luis-reviewed | Default on; only public picks from the gana-v9 pipeline |`
Optional after implementation stabilizes: odds range, model edge range, kickoff time, team search, and saved-only for signed-in users.
1. Public metrics must reconcile with internal records.
The public results page should reconcile exactly with internal published-prediction and validation records. Draft predictions, unpublished AI runs, raw prompts, provider request IDs, private diagnostics, and raw lead emails are never part of the public trust payload.
1. Trust copy must be original to gana-v9.
The adapted strategy is public proof through visible history and confidence tiers. Do not copy gambeta.ai brand, logos, exact wording, proprietary assets, hidden endpoints, private data, or code. The gana-v9 trust angle is Luis's review, visible grading, conservative units, and honest misses.
1. The trust layer should feed social distribution.
Every settled pick should be usable by growth ops as a share card input with canonical URL, match, pick, tier, odds-at-publish if available, result, and \`+18 / no guaranteed profit / bet responsibly\` language.
## Product Requirements
### Public results page
Route: \`/public/results\`
Primary modules:
`| Module | Requirement |`
`| --- | --- |`
`| Results summary | Settled picks, wins, losses, voids, pending, hit rate, sample-size note |`
`| Ledger table/cards | Match, league, kickoff, market, pick, tier, stake units, odds, result, score, settled time |`
`| Filters | Date range, status, league, market, tier |`
`| Correction visibility | Correction badge and linked note when settlement changes |`
`| Responsible gambling | Visible line in the header area and footer |`
Do not hide negative outcomes. Trust comes from showing the record, including misses.
### Homepage trust module
The public homepage should show a compact trust strip below the hero:
`| Stat | Rule |`
`| --- | --- |`
`| Published picks | Count public picks with \`publishedAt\` |`
`| Settled picks | Count won/lost non-void results |`
`| Void picks | Count separately, not as wins or losses |`
`| Settled hit rate | \`won / (won + lost)\` when denominator is greater than \`0\` |`
`| ROI | Hidden until odds/stake coverage and 30 settled non-void sample threshold are met |`
### Pick detail trust block
Each pick detail should show:
- publish timestamp before kickoff
- result status and settled timestamp when available
- locked publish-time odds and stake units when available
- Luis note or public-safe rationale
- "This can lose" responsible gambling line
- correction note if the settlement was corrected
### Empty and low-sample states
Empty states must be honest:
- "No settled public picks yet" for a new ledger
- "Sample building" when there are too few results for ROI
- "Pending settlement" for fixtures awaiting validation
Do not render fake sample picks, placeholder win rates, or implied performance claims.
## Data Contract Extension
J-56 already defines \`gana-v9.public-picks.v1\` and current executable schema coverage in \`packages/contract-schemas/src/public-picks.ts\`. J-57 should extend implementation around this existing contract before introducing a separate version.
Required result-ledger fields:
`| Field | Requirement |`
`| --- | --- |`
`| \`id\` | Stable prediction/pick identifier |`
`| \`fixtureId\` | Stable fixture identifier |`
`| \`publishedAt\` | Required for public performance inclusion |`
`| \`scheduledAt\` | Fixture kickoff timestamp |`
`| \`competition\` | Public league/competition label |`
`| \`homeTeam\`, \`awayTeam\` | Public match labels |`
`| \`market\`, \`outcome\` | Machine-readable market and selection |`
`| \`marketLabel\`, \`pickLabel\` | Human-readable public labels |`
`| \`confidenceTier\` | \`low\`, \`medium\`, or \`high\` mapped to Lean/Value/Prime |`
`| \`stake.units\` | Required before ROI/profit-loss metrics launch |`
`| \`odds\` | Required before ROI/profit-loss metrics launch |`
`| \`settlement.result\` | \`won\`, \`lost\`, \`void\`, or \`pending\` |`
`| \`settlement.score\` | Score when relevant and available |`
`| \`settlement.settledAt\` | Required for won/lost/void |`
`| \`settlement.profitLossUnits\` | Required before ROI/profit-loss metrics launch |`
`| \`correction\` | Optional visible note/version when result changes |`
`| \`responsibleGamblingDisclaimer\` | Required on public payloads or page state |`
Do not add competitor-derived fields. If competitive public-surface observations inform navigation or page strategy, that provenance should stay in planning docs, not in public pick/result payloads.
## Settlement Rules
Resolution priority:
1. Explicit prediction validation record.
2. Fixture score inference for deterministic supported markets.
3. Manual operator correction with visible correction note.
4. \`pending\` when fixture or validation state is incomplete.
Counting rules:
`| Metric | Formula |`
`| --- | --- |`
`| Settled non-void picks | \`won + lost\` |`
`| Hit rate | \`won / (won + lost)\` |`
`| Void rate | \`void / (won + lost + void)\` |`
`| Pending count | Pending picks excluded from hit rate |`
`| Profit/loss units | Sum of \`settlement.profitLossUnits\` only when present for all included picks |`
`| ROI | \`profitLossUnits / stakeUnitsRisked\`, hidden until coverage and sample thresholds pass |`
Correction rules:
- never overwrite the original publish timestamp
- never remove the original result from the audit trail
- show correction timestamp and reason in the public ledger
- recalculate metrics from the latest valid settlement while keeping correction history accessible
## UI Requirements
Public results should be scannable on mobile and desktop.
Required table/card columns:
`| Column | Mobile treatment |`
`| --- | --- |`
`| Date/kickoff | Above matchup |`
`| League | Compact chip |`
`| Match | Primary row title |`
`| Pick | Primary result line |`
`| Tier | Lean/Value/Prime chip |`
`| Result | Strong status chip: won/lost/void/pending |`
`| Odds/stake | Secondary fact row; omit if not present |`
`| Score | Secondary fact row |`
`| Luis note | Expand/collapse after first line |`
Trust styling should be restrained and clear: green for won, red/rose for lost, blue/gray for void/pending, and no flashy "sure win" treatment.
## Analytics And Metrics
Instrumentation events:
`| Event | Trigger |`
`| --- | --- |`
`| \`public-funnel.results-viewed\` | \`/public/results\` page or results module viewed |`
`| \`public-funnel.result-filtered\` | A results filter changes |`
`| \`public-funnel.result-opened\` | User opens a result detail |`
`| \`public-funnel.pick-viewed\` | Existing event for pick card visibility/detail |`
`| \`public-funnel.lead-captured\` | Existing event for successful lead capture |`
`| \`public-funnel.lead-updated\` | Existing event for preference changes |`
Dashboard metrics:
`| Metric | Acceptance target |`
`| --- | --- |`
`| Public ledger reconciliation | \`100%\` match against internal published results |`
`| Settlement latency | Median time from fixture completion to public settlement |`
`| Results page views | Daily count and source/campaign attribution |`
`| Filter usage | Top league/status/tier filters |`
`| Pick-to-results navigation | Share of pick viewers who open results |`
`| Results-to-alert conversion | Alert opt-ins after results page/session |`
`| Correction count | Visible count per 30/90-day window |`
`| Responsible language coverage | \`100%\` of public pick/result/social templates |`
## Implementation Sequence
### Slice 1: results page and ledger
Ship:
- \`/public/results\` route or homepage section route target
- append-only result ledger rendering
- 7/30/90-day date filters
- status, league, market, and tier filters
- responsible gambling header/footer copy
Acceptance:
- public results reconcile with \`listPublicResults()\` for the same operation snapshot
- losing and void picks are visible in the default 30-day view
### Slice 2: trust stats and metric guardrails
Ship:
- homepage trust strip
- settled hit-rate calculation
- sample-size labels
- hidden ROI until odds/stake/profit-loss coverage is reliable
Acceptance:
- hit rate excludes pending and void picks
- ROI is absent until the 30 settled non-void threshold and full odds/stake coverage pass
### Slice 3: correction and audit visibility
Ship:
- correction note model
- public correction badge and detail
- audit trail link in internal ops console
Acceptance:
- changing a settlement creates a visible correction record instead of silently mutating public history
### Slice 4: growth and social reuse
Ship:
- CSV/export fields for settled results
- share-card input contract
- X/TikTok/Telegram/WhatsApp recap templates with responsible gambling line
Acceptance:
- each settled public result can be turned into a social recap without adding manual data fields
## Evidence/Links
- \[J-57 Paperclip issue\](/J/issues/J-57)
- Funnel blueprint: \`docs/plans/2026-06-28-j-54-gana-v9-public-picks-funnel-blueprint.md\`
- Public picks contract: \`docs/contracts/2026-06-28-j-56-public-picks-contract.md\`
- Executable schema: \`packages/contract-schemas/src/public-picks.ts\`
- Public API implementation evidence: \`apps/public-api/src/index.ts\`
- Public API tests: \`apps/public-api/tests/public-api.test.ts\`
- Current exposed result helpers: \`listPublicResults()\`, \`getPublicFunnelSummary()\`, \`getPublicDailyPicksFeed()\`
- Follow-up implementation issue: \[J-73\](/J/issues/J-73)
- Competitive boundary evidence from J-54: public homepage, robots, and sitemap observations only; restricted routes and private endpoints were not used.
## Metrics
Spec evidence gathered in this heartbeat:
`| Metric | Value |`
`| --- | --- |`
`| Existing contract version | \`gana-v9.public-picks.v1\` |`
`| Existing public feed max picks | \`12\` |`
`| Existing feed display statuses | \`upcoming\`, \`live\`, \`finished\`, \`void\` |`
`| Existing settlement results | \`won\`, \`lost\`, \`void\`, \`pending\` |`
`| Existing public routes observed in code/tests | \`/\`, \`/public/picks\`, \`/public/results\`, \`/public/summary\`, \`/public/daily-feed\`, \`/public/daily-feed.csv\` |`
`| Current test coverage evidence | public funnel routes, today/upcoming/finished filters, summary ignoring drafts, lead tracking, responsible language |`
`| Required responsible language | \`+18\`, \`no guaranteed profit\`, \`bet responsibly\` |`
Launch metrics to monitor are listed in the Analytics And Metrics section and should be added to the operator dashboard before public launch.
## Blockers
Direct Notion write access is not available in this runtime: \`NOTION_API_KEY\` is not set and no Notion connector/tool is installed. This document is Notion-ready and should be mirrored to the Gambeta Strategy Lab Notion page for J-57 once Notion access is enabled.
No product-spec blocker remains for engineering or design handoff.
## Next Action
Engineering follow-up created: \[J-73\](/J/issues/J-73), implementing Slice 1: public results page and append-only ledger behavior using existing \`listPublicResults()\` and \`getPublicFunnelSummary()\` outputs, with filters for date range, status, league, market, and confidence tier.
Recommended owner: founding engineer or product engineer.
Handoff requirement: the implementation issue must link back to \[J-57\](/J/issues/J-57), this spec, J-54, and J-56; it must close with Summary, Decisions, Links, Metrics, Blockers, and Next Action.
