-- PostgreSQL/Supabase-only companion migration for content-addressed ingestion
-- and bounded raw-data retention. This file is intentionally separate from the
-- historical MySQL Prisma migrations. It is idempotent and must be reviewed and
-- applied to the PostgreSQL target before enabling `pnpm db:retention -- --apply`.

create table if not exists provider_quota_daily (
  id uuid not null default gen_random_uuid(),
  metric_date date not null,
  provider_id uuid,
  provider_code varchar(64) not null,
  endpoint_name varchar(120) not null default '',
  status varchar(40) not null,
  sample_count bigint not null,
  response_ms_sample_count bigint not null,
  avg_response_ms numeric(14, 3),
  min_response_ms integer,
  max_response_ms integer,
  quota_limit_sample_count bigint not null,
  avg_quota_limit numeric(16, 3),
  min_quota_limit integer,
  max_quota_limit integer,
  quota_remaining_sample_count bigint not null,
  avg_quota_remaining numeric(16, 3),
  min_quota_remaining integer,
  max_quota_remaining integer,
  first_sampled_at timestamptz(3) not null,
  last_sampled_at timestamptz(3) not null,
  created_at timestamptz(3) not null default current_timestamp,
  updated_at timestamptz(3) not null default current_timestamp,
  constraint provider_quota_daily_pkey primary key (id)
);

create unique index if not exists provider_quota_daily_natural_key
  on provider_quota_daily (metric_date, provider_code, endpoint_name, status);

create index if not exists provider_quota_daily_provider_metric_date_idx
  on provider_quota_daily (provider_code, metric_date);

create index if not exists provider_quota_daily_provider_id_metric_date_idx
  on provider_quota_daily (provider_id, metric_date);

create index if not exists provider_quota_samples_retention_sampled_id_idx
  on provider_quota_samples (sampled_at, id);

create index if not exists validation_artifacts_retention_evaluated_id_idx
  on validation_artifacts (evaluated_at, id);

create index if not exists leaderboard_entries_retention_generated_id_idx
  on leaderboard_entries (generated_at, id);

create index if not exists public_rec_publications_target_lookup_idx
  on public_recommendation_publications (target_type, target_id);

-- Cursor indexes only for high-volume history tables. Small-table sequential
-- scans are cheaper than carrying extra indexes inside the constrained live DB.
create index if not exists low_odds_hits_retention_created_id_idx
  on low_odds_hits (created_at, id);
drop index if exists source_records_retention_created_id_idx;
create index if not exists source_records_retention_captured_id_idx
  on source_records (captured_at, id);
create index if not exists evidence_items_retention_created_id_idx
  on evidence_items (created_at, id);
create index if not exists claims_retention_created_id_idx
  on claims (created_at, id);
create index if not exists predictions_retention_generated_id_idx
  on predictions (generated_at, id);

alter table provider_snapshots
  add column if not exists dedupe_key varchar(64),
  add column if not exists last_seen_at timestamptz(3),
  add column if not exists observation_count integer;

update provider_snapshots
set
  last_seen_at = coalesce(last_seen_at, captured_at),
  observation_count = coalesce(observation_count, 1)
where last_seen_at is null or observation_count is null;

alter table provider_snapshots
  alter column last_seen_at set default current_timestamp,
  alter column last_seen_at set not null,
  alter column observation_count set default 1,
  alter column observation_count set not null;

alter table odds_snapshots
  add column if not exists dedupe_key varchar(64),
  add column if not exists last_seen_at timestamptz(3),
  add column if not exists observation_count integer;

update odds_snapshots
set
  last_seen_at = coalesce(last_seen_at, captured_at),
  observation_count = coalesce(observation_count, 1)
where last_seen_at is null or observation_count is null;

alter table odds_snapshots
  alter column last_seen_at set default current_timestamp,
  alter column last_seen_at set not null,
  alter column observation_count set default 1,
  alter column observation_count set not null;

alter table odds_quotes
  add column if not exists content_hash varchar(64);

create unique index if not exists provider_snapshots_dedupe_key_key
  on provider_snapshots (dedupe_key);

create unique index if not exists odds_snapshots_dedupe_key_key
  on odds_snapshots (dedupe_key);

create unique index if not exists odds_quotes_snapshot_content_hash_key
  on odds_quotes (snapshot_id, content_hash);

create index if not exists provider_snapshots_retention_last_seen_id_idx
  on provider_snapshots (last_seen_at, id);

create index if not exists odds_snapshots_retention_last_seen_id_idx
  on odds_snapshots (last_seen_at, id);

-- Research historically stored snapshot references in JSON metadata. These
-- expression indexes keep the compatibility guards in dry-run/apply indexable.
create index if not exists source_records_metadata_snapshot_id_idx
  on source_records ((metadata ->> 'snapshotId'))
  where metadata ? 'snapshotId';

create index if not exists source_records_metadata_odds_snapshot_id_idx
  on source_records ((metadata ->> 'oddsSnapshotId'))
  where metadata ? 'oddsSnapshotId';

create index if not exists validation_artifacts_metadata_result_provider_snapshot_id_idx
  on validation_artifacts ((metadata ->> 'resultProviderSnapshotId'))
  where metadata ? 'resultProviderSnapshotId';

-- Promote legacy provider references to the existing FK where possible. The
-- JSON value remains in place for artifact compatibility and auditability.
update source_records sr
set provider_snapshot_id = ps.id
from provider_snapshots ps
where sr.provider_snapshot_id is null
  and sr.metadata ->> 'snapshotId' = ps.id::text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'provider_quota_daily_provider_id_fkey'
      and conrelid = 'provider_quota_daily'::regclass
  ) then
    alter table provider_quota_daily
      add constraint provider_quota_daily_provider_id_fkey
      foreign key (provider_id) references sports_providers(id)
      on delete set null on update cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'provider_quota_daily_counts_nonnegative'
      and conrelid = 'provider_quota_daily'::regclass
  ) then
    alter table provider_quota_daily
      add constraint provider_quota_daily_counts_nonnegative
      check (
        sample_count > 0
        and response_ms_sample_count >= 0
        and quota_limit_sample_count >= 0
        and quota_remaining_sample_count >= 0
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'provider_snapshots_observation_count_positive'
      and conrelid = 'provider_snapshots'::regclass
  ) then
    alter table provider_snapshots
      add constraint provider_snapshots_observation_count_positive
      check (observation_count > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'odds_snapshots_observation_count_positive'
      and conrelid = 'odds_snapshots'::regclass
  ) then
    alter table odds_snapshots
      add constraint odds_snapshots_observation_count_positive
      check (observation_count > 0);
  end if;
end $$;

-- Existing rows intentionally keep NULL content-address keys. Generating keys
-- in SQL would risk disagreeing with the application's canonical JSON hashing.
-- New writes populate the keys; old unreferenced rows are handled by retention.
