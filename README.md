# Gana Agent TUI

![Gana v9 analytical terminal banner](docs/assets/gana-v9-readme-banner.png)

[Español](README.es.md)

Gana v9 is an analytical terminal agent and operations harness for football/soccer research, odds review, prediction scoring, parlay construction, validation, dashboards, and Discord reporting. It is designed for human review workflows and explicitly does not execute monetary actions.

The default agent backend is local Codex authentication through `codex exec`. OpenRouter is available as an optional compatibility provider.

## What It Does

- Runs a terminal UI for agent-assisted research and operations.
- Discovers fixtures and odds through API-Football.
- Scores predictions and builds analytical parlay candidates.
- Persists operational data in PostgreSQL/Supabase through Prisma.
- Exports artifacts, evidence packs, validation results, and daily metrics.
- Serves a local read-only dashboard for persisted results.
- Publishes daily Discord recommendation and validation summaries with native embeds.
- Redacts secrets in artifacts, logs, sessions, and error payloads.

## Safety Boundary

Gana v9 is analytical software. It does not place bets, move money, trade assets, or automate monetary execution. Any recommendations are review artifacts only and require manual human judgment.

Keep real credentials only in `.env` or your local provider authentication stores. The repository is configured to ignore `.env`, `.artifacts/`, `.sessions/`, `node_modules/`, `dist/`, and `tmp/`.

## Public Picks Strategy Docs

The migrated public-picks funnel and P0 documentation live in versioned repo docs:

- [Public picks funnel](docs/growth/public-picks-funnel.md)
- [Daily picks social workstream](docs/growth/daily-picks-social-workstream.md)
- [Gambeta public strategy and collection boundary](docs/competitive-intelligence/gambeta-public-boundary.md)
- [P0 workstreams map](docs/operations/p0-workstreams-map.md)

## Requirements

- Node.js with npm or pnpm.
- Codex CLI login for the default provider, or OpenRouter credentials for the optional provider.
- `DATABASE_URL` for the PostgreSQL/Supabase runtime, using the session pooler.
- `API_FOOTBALL_KEY` for live football data.
- Prisma migrations applied to the target database.

The canonical database target is PostgreSQL on Supabase. `DATABASE_URL` uses the
session pooler so the CLI, cron and Prisma can connect from IPv4-only hosts.
`DIRECT_URL` uses the direct endpoint when it is reachable; otherwise it may use
the same session pooler. Do not use the transaction pooler for this runtime.

## Quick Start

Install dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env
```

Fill the PostgreSQL `DATABASE_URL` and `DIRECT_URL` placeholders locally. Keep
credentials out of Git. `SOURCE_DATABASE_URL` and `TARGET_DATABASE_URL` are
temporary migration inputs only; remove them after the MySQL cutover.

For the default Codex backend, no API key is needed if you have already run `codex login`. If you use OpenRouter, set `AGENT_PROVIDER=openrouter` and provide `OPENROUTER_API_KEY`.

Build and start the TUI:

```bash
npm run build
npm start
```

For development:

```bash
pnpm gana --help
pnpm test
pnpm typecheck
```

## Productive Live Acceptance

The live acceptance flow is manual and uses the real CLI with database access, API-Football, and local provider authentication. Always use an absolute date.

```bash
pnpm gana db status
pnpm gana football status
pnpm gana filters show
GANA_MAX_FIXTURES_PER_RUN=5 \
GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=5 \
GANA_MAX_PROVIDER_REQUESTS_PER_RUN=600 \
pnpm gana run --date YYYY-MM-DD
pnpm gana artifacts --run-id RUN_ID
pnpm gana export --run-id RUN_ID
pnpm gana validate --date YYYY-MM-DD
pnpm gana dashboard --port 4317
```

A successful run should produce a `runId`, artifacts, an evidence pack, predictions, parlay candidates, a verdict, and logs/artifacts with secrets redacted.

## Daily Discord Operations

Daily operations use Guatemala time (`America/Guatemala`) and publish native Discord embeds.

```bash
node scripts/gana-validate-metrics-and-notify.mjs --date YYYY-MM-DD
node scripts/gana-daily-e2e-and-notify.mjs --date YYYY-MM-DD
node scripts/gana-daily-ops-dispatch.mjs --dry-run
node scripts/install-gana-cron.mjs
```

The canonical authority on this host is one Hermes no-agent cron job. It calls
the deterministic dispatcher at five Guatemala checkpoints:

- 07:15: retention plus previous-day validation/statistics.
- 10:15: initial Daily E2E for the next day.
- 13:15: missed Daily recovery or strategy review.
- 18:15 and 22:15: due Daily retries only.

Codex Scheduled, system cron, and launchd are mutually exclusive fallback
authorities and remain disabled while the Hermes job is active.

Optional per-flow Discord targets:

- `GANA_DISCORD_RECOMMENDATIONS_TARGET`
- `GANA_DISCORD_VALIDATION_TARGET`
- `GANA_DISCORD_STRATEGY_TARGET`
- `GANA_DISCORD_ALERTS_TARGET`

Each target falls back to `--gateway-target`, then `GANA_DISCORD_TARGET`, and finally `discord:1510041125614915756` (`#gana-alertas`).

See [Discord recommendation notifications](docs/discord-recommendation-notifications.md).

## Database Capacity

The live Supabase database is intentionally compact:

- Keep raw/transient observations for 7 days, research/validation for 14 days,
  and non-published operational analytics for 30 days.
- Keep the durable Discord ledger and consolidated metrics for at most 60 days.
- Preserve recommendations published within that window and every row needed by their lineage.
- Keep a checksummed full MySQL backup outside the live database before compaction.
- Run retention in dry-run mode first, apply only after review, and inspect database/table size monthly.

```bash
pnpm db:retention
pnpm db:retention -- --apply
```

Migration and rollback gates are documented in [Supabase compact migration](docs/operations/supabase-compact-migration.md). Runtime deduplication and retention details are in [raw-data retention](docs/operations/raw-data-retention.md).

## Configuration

Most runtime settings can be adjusted in `agent.config.json` and `.env`.

Core provider options:

- `codex`: default provider, using models such as `gpt-5.5`.
- `openrouter`: OpenRouter provider, requiring `OPENROUTER_API_KEY`.

Browser Use fallback:

- `AGENT_BROWSER_FALLBACK=true` enables the local `browser` tool for OpenRouter agents when native web search is insufficient.
- `BROWSER_USE_API_KEY` configures Browser Use Cloud.
- Default limits match the free tier: `BROWSER_USE_MAX_TASKS_PER_MONTH=10`, `BROWSER_USE_MAX_CONCURRENT_SESSIONS=3`, `BROWSER_USE_TIMEOUT_MS=180000`.
- The tool is read-only for research and remains covered by policy checks, auditing, redaction, and monetary-action blocking.

Operational run limits:

- `GANA_MAX_FIXTURES_PER_RUN` limits selected fixtures for the pipeline.
- `GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN` limits fixtures sent to agentic research/scoring.
- `GANA_MAX_PROVIDER_REQUESTS_PER_RUN` limits real API-Football requests and fails with an actionable error when exceeded.

## TUI Commands

- `/help`: list commands.
- `/dashboard`: serve the local web dashboard.
- `/provider`: list or switch between `codex` and `openrouter`.
- `/model`: list, search, and switch models for the active provider.
- `/fast`: toggle fast mode when supported.
- `/think low|medium|high|xhigh|max|ultra`: adjust Codex reasoning effort when supported.
- `/web`: show or change native web search mode: `on`, `off`, `cached`, `live`.
- `/new`: start a new conversation.
- `exit`: close the TUI.

## Provider Backends

### Codex

- Runs `codex exec --json` as a subprocess.
- Reads authentication from `CODEX_HOME` or `codexHome`.
- Forces native web search with `web_search="live"` when enabled.
- Resumes the Codex thread across turns until `/new`.
- Renders shell commands executed by Codex inside the tool renderer.
- Reads model metadata from `config/codex-models.json`.

Update the Codex model list:

```bash
npm run update:codex-models
```

### OpenRouter

- Requires `OPENROUTER_API_KEY`.
- Provides file read/write/edit, glob/grep search, directory listing, and shell execution with timeout.
- Can use the Browser Use Cloud fallback through the local `browser` tool.

## Local Dashboard

To inspect persisted results:

```bash
pnpm gana dashboard --port 4317
```

Open `http://127.0.0.1:4317`. The dashboard is read-only and supports filtering by date, run id, status, and limit. It shows fixtures/results, predictions, parlays, validations, daily runs, and detail panels. It requires `DATABASE_URL`.

## Discord Notifications

Parlay/recommendation delivery through Hermes is documented in [docs/discord-recommendation-notifications.md](docs/discord-recommendation-notifications.md). The notifier skill lives in `.agents/skills/discord-recommendation-notifier/`.

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --transport discord-native \
  --max 3
```

The single-task Guatemala daily operations schedule is documented in [docs/daily-operations-cron.md](docs/daily-operations-cron.md).

```bash
scripts/install-gana-hermes-cron.sh
```

## Development

Useful commands:

```bash
pnpm test
pnpm typecheck
pnpm gana db status
pnpm gana football status
pnpm gana dashboard --port 4317
```

Before publishing or pushing public branches, run:

```bash
gitleaks detect --source . --redact=100 --no-banner
```

Skill documentation:

- [Repo skills guide](docs/skills.md) documents `.agents/skills` operational runbooks and `skills/` harness prompt contracts.
- [Canonical docs index](docs/README.md) links the engineering operating index, repo/publication/security runbook, daily operations, and the closed Notion migration archive.
- [Technical architecture](docs/architecture/README.md) is the repo-owned architecture entry point migrated from Notion.

## License

No license file is currently included. Add a license before publishing the repository as open source.
