-- JSON-heavy operational tables update and compact out-of-line values during
-- retention. PostgreSQL does not inherit the parent table's autovacuum
-- settings for its TOAST relation, so tune those relations explicitly.
-- These settings make dead TOAST tuples reusable sooner without a blocking
-- VACUUM FULL.
ALTER TABLE "fixtures" SET (
  toast.autovacuum_vacuum_threshold = 50,
  toast.autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_insert_threshold = 1000,
  toast.autovacuum_vacuum_insert_scale_factor = 0.05
);

ALTER TABLE "harness_runs" SET (
  toast.autovacuum_vacuum_threshold = 50,
  toast.autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_insert_threshold = 1000,
  toast.autovacuum_vacuum_insert_scale_factor = 0.05
);

ALTER TABLE "predictions" SET (
  toast.autovacuum_vacuum_threshold = 50,
  toast.autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_insert_threshold = 1000,
  toast.autovacuum_vacuum_insert_scale_factor = 0.05
);

ALTER TABLE "validation_artifacts" SET (
  toast.autovacuum_vacuum_threshold = 50,
  toast.autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_insert_threshold = 1000,
  toast.autovacuum_vacuum_insert_scale_factor = 0.05
);
