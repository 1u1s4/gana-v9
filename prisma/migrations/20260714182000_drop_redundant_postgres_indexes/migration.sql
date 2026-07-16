-- Each dropped index is a left-prefix duplicate of an existing B-tree index.
-- Removing them preserves the same lookup paths while reducing storage and
-- write amplification on every ingest and retention cycle.
DROP INDEX IF EXISTS "competitions_provider_id_idx";
DROP INDEX IF EXISTS "teams_provider_id_idx";
DROP INDEX IF EXISTS "odds_quotes_snapshot_id_idx";
DROP INDEX IF EXISTS "leaderboard_entries_generated_at_idx";
DROP INDEX IF EXISTS "daily_metrics_metric_date_idx";
