---
status: canonical
issue: J-108
owner: Gambeta Strategy Lab
updated: 2026-07-01
---

# J-108 Migration Decisions

This index records the Notion-to-repo migration decisions for the Gambeta-style public picks system and P0 workstreams. It is the derived migration index required by `docs/notion-migration/AGENT_BRIEF.md`.

## Summary

J-108 migrated the actionable strategy and workstream material into canonical repo docs while preserving raw Notion exports as historical evidence.

Canonical outputs:

- `docs/growth/public-picks-funnel.md`
- `docs/growth/daily-picks-social-workstream.md`
- `docs/competitive-intelligence/gambeta-public-boundary.md`
- `docs/operations/p0-workstreams-map.md`

Public wagering-adjacent outputs must include:

> +18 only. No guaranteed profit. Bet responsibly.

## Decisions

| Source | Decision | Canonical destination | Rationale |
| --- | --- | --- | --- |
| J-54 public picks funnel blueprint | Migrated and fused | `docs/growth/public-picks-funnel.md` | Main acquisition strategy belongs in a stable product/growth doc. |
| J-56 public picks contract | Fused | `docs/growth/public-picks-funnel.md` | Contract principles are retained, but referenced code paths are absent in this checkout. |
| J-57 results/history trust layer | Fused | `docs/growth/public-picks-funnel.md` | Trust ledger and metric guardrails are core to the same public funnel. |
| J-64 originality and +18 review | Fused | `docs/growth/public-picks-funnel.md` | Responsible-gambling and differentiation rules are mandatory launch gates. |
| J-89 daily picks handoff duplicates | Migrated and deduplicated | `docs/growth/daily-picks-social-workstream.md` | Exported pages were stubs pointing to missing markdown. |
| Gana v9 Growth index | Partially fused | `docs/growth/daily-picks-social-workstream.md` | Daily gate, stop conditions, and metrics were extracted for active workflow use. |
| J-92 Competitive Intelligence / Gambeta | Migrated and expanded | `docs/competitive-intelligence/gambeta-public-boundary.md` | Exported page was a stub; strategy now has a usable repo source. |
| J-93 public scraping boundary | Fused | `docs/competitive-intelligence/gambeta-public-boundary.md` | Public-only collection rules belong beside strategy adaptation rules. |
| Revision frontera publica Gambeta J-93 | Marked empty historical stub | `docs/competitive-intelligence/gambeta-public-boundary.md` | Export contained no useful markdown body. |
| Gana v9 P0 operating map | Fused | `docs/operations/p0-workstreams-map.md` | P0 freeze state now has repo-native navigation. |
| J-95 master P0 workstreams map | Migrated and fused | `docs/operations/p0-workstreams-map.md` | Master map is the primary source for workstream status and blockers. |
| J-22 / old Gambeta seed pages | Historical only | Keep raw export | Superseded by J-92/J-93 canonical boundary. |
| J-35 duplicate competitive scraping pages | Historical only | Keep raw export | Superseded by J-92/J-93 canonical boundary. |
| J-36/J-40 daily sprint templates | Historical templates | Keep raw export; referenced by J-89 doc | Useful examples, not evidence of live publication. |
| HIBRI2 and personal/finance pages | Out of scope | Keep raw export | Not part of gana-v9 public picks or P0 workstream migration. |

## Links

- Public competitive evidence used: `https://gambeta.ai/`
- Source export root: `docs/notion-migration/exported/`
- Migration brief: `docs/notion-migration/AGENT_BRIEF.md`
- Canonical public funnel: `docs/growth/public-picks-funnel.md`
- Canonical daily workstream: `docs/growth/daily-picks-social-workstream.md`
- Canonical CI boundary: `docs/competitive-intelligence/gambeta-public-boundary.md`
- Canonical P0 map: `docs/operations/p0-workstreams-map.md`

## Metrics

- Canonical docs created: 4.
- Migration decision index created: 1.
- Notion exports with explicit decisions in this index: 15 groups.
- Duplicate J-89 exports deduplicated: 2 source IDs to 1 canonical doc.
- Responsible-gambling coverage in new canonical docs: 4 of 4 public/growth/CI docs include the risk line; P0 map enforces no-secrets and freeze rules.

## Blockers

- P0 freeze remains active until Jo/J-94 audits the tree and J-87 is closed or explicitly lifted.
- Referenced product contract paths from older Notion docs are absent in this checkout and need engineering reconciliation before implementation.
- Notion mirroring is not required after J-111; the repo paths above are the durable handoff.

## Next Action

Jo should review the canonical repo docs and live Paperclip state before lifting any freeze. After J-111, Notion is no longer mirrored or used as an operational source.
