---
status: done
issue: J-111
owner: CTO
updated: 2026-07-01
source_of_truth: repo
---

# J-111 Closeout - Notion to Markdown

## Decision

The Notion migration is operationally closed. Gana v9 now uses:

- Repo Markdown for durable documentation, runbooks, architecture, migration ledgers and source decisions.
- Paperclip for live execution state, blockers, owners, comments and issue closure.
- `docs/notion-migration/exported/` only as historical evidence.

Notion is not a source of truth, execution system, review gate or required mirror for new work.

## Canonical Entry Points

| Area | Canonical path |
| --- | --- |
| Docs index | `docs/README.md` |
| Architecture | `docs/architecture/README.md` |
| Operations | `docs/operations/README.md` |
| Engineering operating index | `docs/operations/engineering-operating-index.md` |
| Repo, publication and security | `docs/operations/repo-publication-security.md` |
| Growth/GTM | `docs/growth/README.md` |
| Competitive intelligence | `docs/competitive-intelligence/README.md` |
| P0 workstreams | `docs/operations/p0-workstreams-map.md` |
| Migration archive | `docs/notion-migration/README.md` |

## Manifest Status

- Export entries: 136.
- Pending canonical review entries: 0.
- Sensitive `Mis api keys` export remains `redacted_secret_source_do_not_migrate`.
- Personal, duplicate, empty, obsolete and non-operational exports are retained only as historical evidence.

## Guard

Use:

```bash
npm run docs:check-notion-source
```

The guard fails if:

- `manifest.json` regains `pending_canonical_review` rows.
- direct Notion app links appear outside the historical export or manifest.
- docs reintroduce wording that treats the migration as unfinished or Notion as a temporary operational source.

## Remaining

No migration blocker remains for J-111. Future use of historical Notion exports must be a new scoped repo/Paperclip issue and must produce or update a canonical Markdown path.
