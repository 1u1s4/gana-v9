---
status: canonical
owner: Growth / Content Ops / CMO
issue: J-108
updated: 2026-07-01
source: notion-migration
source_notion_ids:
  - 390bea9e-4736-819b-9e90-cd9614bf2df1
  - 390bea9e-4736-8124-91bd-db3c6383c77c
  - 38dbea9e-4736-81a5-9fc5-c9664b6782a9
  - 38dbea9e-4736-81d3-898d-e0bb31e10c5b
  - 38dbea9e-4736-8153-936d-e3b5e8d08d4b
---

# Daily Picks Social Workstream

This is the canonical repo handoff for the J-89 daily picks, X/TikTok, and funnel metrics workflow. It replaces the missing markdown referenced by the exported Notion stub.

Every public wagering-adjacent asset must include:

> +18 only. No guaranteed profit. Bet responsibly.

## Summary

The daily growth loop starts only when a fresh approved pick feed exists. Growth should not turn old anchors, stale examples, or unpublished pipeline output into public advice.

The operating goal is simple: publish original gana-v9 picks and lessons, drive users back to the public picks/results funnel, and record real channel/funnel metrics without inventing evidence.

## Daily Gate

Before 09:00 America/Guatemala, the picks owner must provide:

- 3 to 5 prioritized picks.
- Match, league, kickoff time, market, and selection.
- Confidence tier: Lean, Value, or Prime.
- Stake units or explicit "stake unavailable" state.
- Luis thesis in 1 to 2 public-safe lines.
- Main risk in 1 line.
- Destination CTA for the day.

If any required field is missing, do not publish. Escalate the same day to Luis / CEO and the CMO.

## Stop Conditions

Stop publication for the day when:

- No fresh approved pick row exists.
- A pick is already past kickoff.
- Responsible-gambling language is missing.
- Result/ledger route is unavailable.
- Channel access is missing.
- The post would imply guaranteed profit or risk-free betting.
- A user asks for personalized staking advice.

## Channel Plan

X:

- Main volume channel.
- Use one concise post per top pick, plus a follow-up only when there is a real update or result.
- Use one CTA per post.

TikTok / Reels:

- One simple lesson or match angle.
- Avoid overcrowding with many picks.
- Link back to the canonical gana-v9 pick/result page.

Telegram / WhatsApp:

- Alert format only after opt-in path and unsubscribe/stop flow are confirmed.
- Include match, pick, tier, kickoff, risk line, and canonical URL.

Default CTA until Luis / CEO confirms a better destination:

- `DM TRIAL`

Do not publish paid-tier copy until the free loop has visible picks, results, and real lead evidence.

## Metrics

Channel metrics:

- X views.
- TikTok/Reels views.
- Engagement.
- Saves/bookmarks.
- Replies/comments.
- DMs.
- Landing clicks.
- Profile clicks.
- Real post URLs.

Lead metrics:

- Alert opt-ins.
- Results opt-ins.
- DM keyword count.
- Paid-intent count.
- Follow-up status.
- Compliance notes.

Product funnel metrics:

- Public picks page views.
- Pick-card impressions.
- Pick-detail opens.
- Results-page views.
- Results-to-alert conversion.
- Content-to-picks CTR.

Trust metrics:

- Picks published.
- Settled picks.
- Wins.
- Losses.
- Voids.
- Pending settlements.
- Visible corrections.
- Settlement latency.
- Responsible-language coverage.

## Backfill Rules

- Backfill the dashboard after the first reading window and again after 24 hours.
- Do not invent post IDs, views, clicks, DMs, opt-ins, conversions, or paid intent.
- Mark rows as `blocked` or `no fresh pick` instead of fabricating activity.
- Keep screenshots or URLs when available.

Minimum row fields:

```csv
date,channel,owner,post_url,post_id,pick_id,fixture,kickoff,market,selection,tier,format,cta,campaign_tag,published_at,views,replies,likes,shares,saves,profile_clicks,landing_clicks,dms,dm_keyword,alert_opt_ins,results_opt_ins,paid_intent_count,follow_up_status,operational_status,compliance_note,learning
```

Product/trust reconciliation:

- Public pick views and pick-card opens should reconcile with the public picks surface when that surface exists.
- Results metrics count only published picks with explicit settlement state: won, lost, void, pending, or corrected.
- ROI/profit claims stay hidden until odds, stake units, profit/loss, and sample-size guardrails are documented.
- Responsible-language coverage target is `100%` across public pick/result/social templates.

## Source Notion

- `docs/notion-migration/exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md`
- `docs/notion-migration/exported/gana-v9-02-growth-y-contenido-indice-operativo--38dbea9e.md`
- `docs/notion-migration/exported/j-56-public-picks-contract-gana-v9--38dbea9e.md`
- `docs/notion-migration/exported/j-57-public-results-history-and-trust-layer-spec-gana-v9--38dbea9e.md`
- Related historical templates: J-36, J-40, J-47, J-48, J-67 through J-71.

## Blockers

- P0 freeze remains active until Jo clears the P0 workstream map.
- Channel credentials, handles, and paid destination are human-owned and must not be copied into docs.
- Growth cannot publish without a fresh approved public feed and a ledger route.

## Next Action

After the P0 freeze is lifted, Growth + Content Ops should restart the daily sprint with a dated restart note, confirm the CTA destination, and log the first 24-hour metric window using only real post URLs and measured values.
