-- High-churn ingest/retention tables need vacuum and statistics refresh before
-- PostgreSQL's broad defaults would trigger. This reuses dead space without a
-- blocking VACUUM FULL and leaves row-count thresholds at their server defaults.
ALTER TABLE "gana_ops"."fixtures"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."provider_snapshots"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."odds_snapshots"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."odds_quotes"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."provider_quota_samples"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."low_odds_hits"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."source_records"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."evidence_items"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."claims"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."predictions"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "gana_ops"."validation_artifacts"
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);

-- source_records retention is keyed by the observation timestamp, not by the
-- later insert timestamp. Replace the obsolete cursor index idempotently.
DROP INDEX IF EXISTS "gana_ops"."source_records_retention_created_id_idx";
CREATE INDEX IF NOT EXISTS "source_records_retention_captured_id_idx"
  ON "gana_ops"."source_records" ("captured_at", "id");

-- Validation can record a second result snapshot only in legacy JSON metadata.
-- Keep its retention guard indexable without carrying entries for unrelated rows.
CREATE INDEX IF NOT EXISTS "validation_artifacts_metadata_result_provider_snapshot_id_idx"
  ON "gana_ops"."validation_artifacts" (("metadata" ->> 'resultProviderSnapshotId'))
  WHERE "metadata" ? 'resultProviderSnapshotId';
