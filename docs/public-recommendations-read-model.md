# Public Recommendations Read Model

J-114 adds `GET /api/public/recommendations?date=YYYY-MM-DD&timezone=America/Guatemala`.

The response is public-safe and follows `gana-v9.public-recommendations.v1`:

- daily summary, stale flag, stale reasons, and responsible gambling disclaimer
- public parlays hydrated from persisted `parlays`/`parlay_legs`
- public atomic predictions hydrated from persisted `predictions`
- required-league/general predictions extracted from the daily recommendation artifact
- source lineage: daily batch/run id, source run ids, artifact paths, generated timestamp, and publication-ledger status

The endpoint intentionally returns an empty stale payload for a requested date with no daily batch. It does not backfill picks from another date.

## Publication Ledger

The daily E2E wrapper now persists a Discord publication ledger after the recommendation payload is sent:

- `public_recommendation_publications` rows are keyed by `dailyBatchId`, `channel`, `target`, `targetType`, and `targetId`
- each row stores Discord message ids, payload artifact path, payload SHA-256, publish time, and optional linked `predictionId` / `parlayId`
- synthetic/public-only parlay target ids stay in `targetId`; relation columns remain nullable unless the id is a real persisted UUID
- the public API reports `source.publicationLedger.status = persisted` when rows exist for the batch, otherwise it honestly reports artifact-only/stale state

Operational note: an environment whose configured MySQL schema is not baselined for gana-v9 migrations cannot receive DB ledger rows until the owner baselines or migrates that database. In that case the cron lock and payload artifact still retain a persisted payload ledger with exact Discord message ids and payload hash for audit continuity.
