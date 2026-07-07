# Goal: OpenWiki documentation integration

## Outcome

Integrate OpenWiki into this repository so Gana v9 documentation can be generated and maintained through versioned local commands and a GitHub Actions workflow.

## Baseline

- The repository has canonical documentation under `docs/`, plus `README.md` and `README.es.md`.
- There is no `openwiki/` directory yet.
- There is no `.github/` workflow directory yet.
- There is no existing `AGENTS.md` or `CLAUDE.md`.
- The project uses Node/TypeScript with pnpm available, but also has an npm lockfile.

## Constraints

- Do not overwrite unrelated local changes.
- Do not commit secrets, local API keys, model credentials, `.env` content, OpenWiki local state, or generated conversation history.
- Do not run a real OpenWiki generation unless valid provider credentials are available and the user has approved the external model call.
- Keep the generated OpenWiki output in `openwiki/` when generation is run.

## Verifier

- `pnpm typecheck` passes after the integration.
- `pnpm exec openwiki --help` works from the repo.
- The OpenWiki workflow YAML is syntactically valid enough for inspection and uses only documented OpenWiki CLI commands.
- Documentation explains local setup, required secrets, update commands, generated output, and safety boundaries.

## Loop

1. Inspect the current repo, package manager setup, docs conventions, and OpenWiki upstream usage.
2. Add the smallest integration surface: dependency/script entries, ignore rules, docs, agent guidance, and CI workflow.
3. Run non-secret verification commands.
4. Record any step that cannot be completed because it needs external provider credentials.

## Approval Gates

- Running `openwiki --init` or `openwiki --update` with live provider credentials requires explicit approval because it may make paid model calls.
- Pushing branches, creating pull requests, or changing repository settings requires explicit approval.

## Completion Proof

Report changed files and verification results, including exact commands run and any credential-gated commands intentionally skipped.
