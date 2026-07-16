-- Remove unused indexes whose read paths are covered by narrower production
-- indexes. This saves storage and lowers write amplification during ingestion.
--
-- odds quote reads always filter by snapshot_id in production; the unique
-- (snapshot_id, content_hash) index covers that path. Optional fixture/market
-- reads remain covered by odds_quotes_fixture_market_captured_at_idx.
DROP INDEX IF EXISTS "odds_quotes_fixture_market_selection_line_captured_at_idx";

-- Source-record production reads use bundle, run, or fixture. Retention uses
-- (captured_at, id). There is no hash lookup, and source_type is only an
-- optional filter layered onto one of the supported parent lookups.
DROP INDEX IF EXISTS "source_records_hash_idx";
DROP INDEX IF EXISTS "source_records_source_type_captured_at_idx";

-- Quota reads use provider_id; provider_code is recorded but not queried.
DROP INDEX IF EXISTS "provider_quota_samples_provider_sampled_at_idx";
