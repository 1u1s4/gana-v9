---
source: notion
notion_id: 38dbea9e-4736-81d3-898d-e0bb31e10c5b
notion_url: https://app.notion.com/p/J-56-Public-Picks-Contract-gana-v9-38dbea9e473681d3898de0bb31e10c5b
title: "J-56 Public Picks Contract - gana-v9"
---

# J-56 Public Picks Contract - gana-v9

CTO contract handoff for Jo and J-55. Contract version: gana-v9.public-picks.v1.
## Summary
Public picks must render only publication-safe gana-v9 picks from published predictions. Empty states must be honest and include responsible gambling language.
## Decisions
- Source: published-predictions through /public/picks, /public/daily-feed, and /public/daily-feed.csv.
- No draft picks, raw prompts, provider request IDs, private diagnostics, or raw analytics emails are public.
- Odds, stake, and profit/loss are optional until the pipeline can supply them reliably.
- Jo should design against the executable schema, not the current internal PredictionEntity.
## Evidence/Links
- Contract handoff doc: docs/contracts/2026-06-28-j-56-public-picks-contract.md
- Executable schema: packages/contract-schemas/src/public-picks.ts
- Contract tests: packages/contract-schemas/tests/contract-schemas.test.ts
- [Paperclip J-56 record](http://127.0.0.1:3100/api/issues/6db28dc1-df21-4839-8289-00dfcce1224b)
## Metrics
- Required launch metrics: page views, unique pick views, alert opt-ins, results opt-ins, signup rejection rate, ready pick count, high-confidence count, settled hit rate.
## Blockers
- No blocker for J-56. Downstream: public-api must emit contractVersion/source/disclaimer/display labels/status and optional settlement P/L before launch.
## Next Action
- Jo uses this as input for J-55. Founding Engineer implements a public-api adapter to validate publicPicksFeedSchema before page implementation ships.
