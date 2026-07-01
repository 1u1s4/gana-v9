---
status: canonical
owner: Jo / Paperclip / Department owners
issue: J-108
updated: 2026-07-01
source: notion-migration
source_notion_ids:
  - 390bea9e-4736-81dd-9128-c7da48584dba
  - 390bea9e-4736-81ef-a721-edee78ce3f71
---

# P0 Workstreams Map

This is the canonical repo map for the P0 documentation freeze and workstreams migrated from Notion for J-108.

Paperclip remains the execution source of truth. This repo is the durable documentation source of truth. Notion exports remain historical evidence only.

No secrets, tokens, DSNs, cookies, private URLs, passwords, personal emails, or credential values belong in Paperclip, Notion, or repo docs.

Any public wagering-adjacent output from these workstreams must include: `+18 only. No guaranteed profit. Bet responsibly.`

## Summary

The P0 freeze exists because the operating tree had become hard to navigate. Normal product, growth, scraping, hiring, and publication work should not resume until each critical area has a clear source, owner, status, blockers, and next action.

## Read First

1. This map.
2. `docs/notion-migration/AGENT_BRIEF.md`.
3. `docs/growth/public-picks-funnel.md`.
4. `docs/growth/daily-picks-social-workstream.md`.
5. `docs/competitive-intelligence/gambeta-public-boundary.md`.
6. Current Paperclip issue state for J-87 through J-96.

## Workstream Sources

| Area | Issue | Owner | Canonical source | Rule |
| --- | --- | --- | --- | --- |
| P0 freeze / root map | J-87 | Jo / board | `docs/operations/p0-workstreams-map.md` | Do not lift freeze until final audit passes. |
| Marketing / growth index | J-88 | CMO | `docs/growth/README.md` | Use repo docs for campaign context; execution remains gated by Paperclip state. |
| Daily picks and social funnel | J-89 | Growth / Content Ops | `docs/growth/daily-picks-social-workstream.md` | Publish only after fresh approved feed and freeze lift. |
| Engineering / technical index | J-90 | CTO | `docs/operations/engineering-operating-index.md` and `docs/architecture/system-architecture.md` | Repo/Paperclip execution; no secrets in docs. |
| Repo / publication / security | J-91 | Founding Engineer | `docs/operations/repo-publication-security.md` and `docs/architecture/system-architecture.md` | Security state only, never secret values. |
| Competitive intelligence / Gambeta | J-92 | Gambeta Strategy Lab | `docs/competitive-intelligence/gambeta-public-boundary.md` | Public-only observations; no copying or endpoint probing. |
| Scraping public boundary | J-93 | Webscraper | `docs/competitive-intelligence/gambeta-public-boundary.md` | Static public HTML/XML only after freeze lift. |
| Final audit | J-94 | Jo | Paperclip J-94 + this map | Blocked until every workstream has evidence. |
| Master link map | J-95 | CTO | `docs/operations/p0-workstreams-map.md` | This repo doc supersedes the Notion-only master map for migration purposes. |
| Secret hygiene gate | J-96 | CTO | `docs/operations/repo-publication-security.md` + Paperclip J-96 state | Must confirm no secrets leaked before freeze lift. |

## Blocked Workstreams

| Workstream | Issues | Unblock owner | Valid action |
| --- | --- | --- | --- |
| Credentials and legacy rewrite | J-77, J-83, J-18 | Luis or workspace admin | Rotate/revoke credentials and confirm scope without copying secrets. |
| Public hardening | J-19 | CTO | Resume only after J-87 closes and J-91 confirms status. |
| Webscraper contractor | J-24, J-80, J-81 | CTO + board/operator | Marketplace, payment, and external authorization after freeze. |
| Daily social sprint | J-40, J-48, J-69 | CMO / Growth Ops | Do not publish without channel access and fresh approved feed. |
| Public funnel backfill | J-61, J-76, J-78 | Strategy Lab / CTO | Continue only after freeze and source reconciliation. |
| Trust/results spec | J-57 | Board / Jo path | Spec is readable; closure depends on links/audit, not new strategy. |

## Definition Of Done

The freeze can be considered ready for Jo audit only when:

- Each critical area has a canonical repo doc or explicit Paperclip state with owner.
- Obsolete pages are marked historical or no-source-of-truth in the migration decisions index.
- J-96 confirms secret hygiene.
- J-94 verifies the tree end to end in less than 10 minutes.
- J-87 is marked done or Jo explicitly lifts the freeze.

## Source Notion

- `docs/notion-migration/exported/gana-v9-mapa-operativo-p0-notion--390bea9e.md`
- `docs/notion-migration/exported/j-95-mapa-maestro-de-workstreams-p0--390bea9e.md`

## Metrics

- Canonical workstreams mapped: 10.
- Blocked workstream groups preserved: 6.
- New canonical repo paths created for J-88 through J-95 and J-54/J-56/J-57 strategy.

## Next Action

Jo should audit the canonical repo paths listed above and use Paperclip for live blockers. No Notion-only material remains a valid operational source.
