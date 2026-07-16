const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_RAW_RETENTION_DAYS = 7;
export const DEFAULT_TRANSIENT_RETENTION_DAYS = 7;
export const DEFAULT_RESEARCH_RETENTION_DAYS = 14;
export const DEFAULT_ANALYTIC_RETENTION_DAYS = 30;
export const DEFAULT_HISTORY_RETENTION_DAYS = 60;
export const DEFAULT_RAW_RETENTION_BATCH_SIZE = 1_000;
export const MIN_RAW_RETENTION_DAYS = 7;
export const MAX_RAW_RETENTION_DAYS = 7;
export const MIN_TRANSIENT_RETENTION_DAYS = 7;
export const MAX_TRANSIENT_RETENTION_DAYS = 7;
export const MIN_RESEARCH_RETENTION_DAYS = 7;
export const MAX_RESEARCH_RETENTION_DAYS = 14;
export const MIN_ANALYTIC_RETENTION_DAYS = 30;
export const MAX_ANALYTIC_RETENTION_DAYS = 30;
export const MIN_HISTORY_RETENTION_DAYS = 30;
export const MAX_HISTORY_RETENTION_DAYS = 60;
export const MAX_RAW_RETENTION_BATCH_SIZE = 10_000;
export const CAPACITY_WARNING_BYTES = 350 * 1024 * 1024;
export const CAPACITY_HARD_BYTES = 400 * 1024 * 1024;

const ODDS_SNAPSHOT_RAW_EXPIRY = `(os.last_seen_at < $1 or (
  os.last_seen_at < current_timestamp - interval '24 hours'
  and exists (
    select 1
    from odds_snapshots newer
    where newer.fixture_id = os.fixture_id
      and (newer.last_seen_at, newer.id) > (os.last_seen_at, os.id)
  )
))`;

export const RAW_RETENTION_TARGETS = Object.freeze([
  {
    key: 'oddsQuotes',
    table: 'odds_quotes',
    alias: 'oq',
    from: 'odds_quotes oq join odds_snapshots os on os.id = oq.snapshot_id',
    orderBy: 'os.last_seen_at, oq.id',
    lock: 'oq',
    predicate: `
      ${ODDS_SNAPSHOT_RAW_EXPIRY}
      and not exists (select 1 from predictions p where p.odds_quote_id = oq.id)
      and not exists (select 1 from low_odds_hits loh where loh.odds_quote_id = oq.id)
      and not exists (
        select 1 from source_records sr
        where sr.metadata ->> 'oddsSnapshotId' = os.id::text
      )`,
  },
  {
    key: 'oddsSnapshots',
    table: 'odds_snapshots',
    alias: 'os',
    from: 'odds_snapshots os',
    orderBy: 'os.last_seen_at, os.id',
    lock: 'os',
    predicate: `
      ${ODDS_SNAPSHOT_RAW_EXPIRY}
      and not exists (select 1 from predictions p where p.odds_snapshot_id = os.id)
      and not exists (select 1 from odds_quotes oq where oq.snapshot_id = os.id)
      and not exists (
        select 1 from source_records sr
        where sr.metadata ->> 'oddsSnapshotId' = os.id::text
      )`,
  },
  {
    key: 'providerSnapshots',
    table: 'provider_snapshots',
    alias: 'ps',
    from: 'provider_snapshots ps',
    orderBy: 'ps.last_seen_at, ps.id',
    lock: 'ps',
    predicate: `
      ps.last_seen_at < $1
      and not exists (select 1 from odds_snapshots os where os.provider_snapshot_id = ps.id)
      and not exists (
        select 1 from source_records sr
        where sr.provider_snapshot_id = ps.id
           or sr.metadata ->> 'snapshotId' = ps.id::text
      )
      and not exists (
        select 1 from validation_artifacts va
        where va.provider_snapshot_id = ps.id
      )
      and not exists (
        select 1 from validation_artifacts va
        where va.metadata ->> 'resultProviderSnapshotId' = ps.id::text
      )`,
  },
]);

function publicationProtectsPrediction(predictionAlias) {
  return `exists (
    select 1
    from public_recommendation_publications pub
    where pub.prediction_id = ${predictionAlias}.id
       or (pub.target_type = 'prediction' and pub.target_id = ${predictionAlias}.id::text)
       or exists (
         select 1
         from parlay_legs published_leg
         where published_leg.prediction_id = ${predictionAlias}.id
           and (
             pub.parlay_id = published_leg.parlay_id
             or (pub.target_type = 'parlay' and pub.target_id = published_leg.parlay_id::text)
           )
       )
  )`;
}

function publicationProtectsParlay(parlayAlias) {
  return `exists (
    select 1
    from public_recommendation_publications pub
    where pub.parlay_id = ${parlayAlias}.id
       or (pub.target_type = 'parlay' and pub.target_id = ${parlayAlias}.id::text)
       or exists (
         select 1
         from parlay_legs published_leg
         where published_leg.parlay_id = ${parlayAlias}.id
           and (
             pub.prediction_id = published_leg.prediction_id
             or (pub.target_type = 'prediction' and pub.target_id = published_leg.prediction_id::text)
           )
       )
  )`;
}

function publicationProtectsBundle(bundleIdExpression) {
  return `exists (
    select 1
    from predictions lineage_prediction
    where lineage_prediction.research_bundle_id = ${bundleIdExpression}
      and (${publicationProtectsPrediction('lineage_prediction')})
  )`;
}

function publicationProtectsOddsSnapshotReference(snapshotIdExpression) {
  return `exists (
    select 1
    from source_records lineage_source
    where lineage_source.metadata ->> 'oddsSnapshotId' = (${snapshotIdExpression})::text
      and (${publicationProtectsBundle('lineage_source.bundle_id')})
  )`;
}

const VALIDATION_PUBLIC_PROTECTION = `exists (
  select 1
  from public_recommendation_publications pub
  where (va.run_id is not null and pub.run_id = va.run_id)
     or (va.prediction_id is not null and (
       pub.prediction_id = va.prediction_id
       or (pub.target_type = 'prediction' and pub.target_id = va.prediction_id::text)
       or exists (
         select 1 from parlay_legs published_leg
         where published_leg.prediction_id = va.prediction_id
           and (
             pub.parlay_id = published_leg.parlay_id
             or (pub.target_type = 'parlay' and pub.target_id = published_leg.parlay_id::text)
           )
       )
     ))
     or (va.parlay_id is not null and (
       pub.parlay_id = va.parlay_id
       or (pub.target_type = 'parlay' and pub.target_id = va.parlay_id::text)
       or exists (
         select 1 from parlay_legs validation_leg
         where validation_leg.parlay_id = va.parlay_id
           and (
             pub.prediction_id = validation_leg.prediction_id
             or (pub.target_type = 'prediction' and pub.target_id = validation_leg.prediction_id::text)
           )
       )
     ))
)`;

const LEADERBOARD_PUBLIC_PROTECTION = `le.run_id is not null and exists (
  select 1
  from public_recommendation_publications pub
  where pub.run_id = le.run_id
     or exists (
       select 1 from predictions published_prediction
       where published_prediction.run_id = le.run_id
         and (
           pub.prediction_id = published_prediction.id
           or (pub.target_type = 'prediction' and pub.target_id = published_prediction.id::text)
         )
     )
     or exists (
       select 1 from parlays published_parlay
       where published_parlay.run_id = le.run_id
         and (
           pub.parlay_id = published_parlay.id
           or (pub.target_type = 'parlay' and pub.target_id = published_parlay.id::text)
         )
     )
)`;

function historyTarget({ protection = 'false', retentionClass = 'analytic', ...target }) {
  return Object.freeze({
    ...target,
    retentionClass,
    protection,
    predicate: `(${target.oldPredicate}) and not (${protection})`,
  });
}

const PARLAY_LEG_PUBLIC_PROTECTION = `exists (
  select 1
  from public_recommendation_publications pub
  where pub.prediction_id = pl.prediction_id
     or (pub.target_type = 'prediction' and pub.target_id = pl.prediction_id::text)
     or pub.parlay_id = pl.parlay_id
     or (pub.target_type = 'parlay' and pub.target_id = pl.parlay_id::text)
)`;

const PREDICTION_REFERENCE_PROTECTION = `
  exists (select 1 from parlay_legs pl where pl.prediction_id = p.id)
  or exists (select 1 from validation_artifacts va where va.prediction_id = p.id)
  or ${publicationProtectsPrediction('p')}`;

const PARLAY_REFERENCE_PROTECTION = `
  exists (select 1 from parlay_legs pl where pl.parlay_id = pa.id)
  or exists (select 1 from validation_artifacts va where va.parlay_id = pa.id)
  or ${publicationProtectsParlay('pa')}`;

/**
 * Destructive order before raw cleanup: history leaves first, then their
 * parents. A remaining (normally <=60-day) child always keeps an older parent.
 */
export const HISTORY_PRE_RAW_RETENTION_TARGETS = Object.freeze([
  historyTarget({
    key: 'publicRecommendationPublications', table: 'public_recommendation_publications',
    alias: 'pub', from: 'public_recommendation_publications pub',
    orderBy: 'pub.published_at, pub.id', lock: 'pub', oldPredicate: 'pub.published_at < $1',
    retentionClass: 'history',
  }),
  historyTarget({
    key: 'validationArtifacts', table: 'validation_artifacts', alias: 'va',
    from: 'validation_artifacts va', orderBy: 'va.evaluated_at, va.id', lock: 'va',
    oldPredicate: 'va.evaluated_at < $1', protection: VALIDATION_PUBLIC_PROTECTION,
    retentionClass: 'research',
  }),
  historyTarget({
    key: 'leaderboardEntries', table: 'leaderboard_entries', alias: 'le',
    from: 'leaderboard_entries le', orderBy: 'le.generated_at, le.id', lock: 'le',
    oldPredicate: 'le.generated_at < $1', protection: LEADERBOARD_PUBLIC_PROTECTION,
  }),
  historyTarget({
    key: 'dailyMetrics', table: 'daily_metrics', alias: 'dm', from: 'daily_metrics dm',
    orderBy: 'dm.metric_date, dm.id', lock: 'dm',
    oldPredicate: "dm.metric_date < ($1::timestamptz at time zone 'UTC')::date",
    retentionClass: 'history',
  }),
  historyTarget({
    key: 'approvalRequests', table: 'approval_requests', alias: 'ar', from: 'approval_requests ar',
    orderBy: 'ar.requested_at, ar.id', lock: 'ar',
    oldPredicate: 'coalesce(ar.decided_at, ar.expires_at, ar.requested_at, ar.created_at) < $1',
  }),
  historyTarget({
    key: 'auditLogs', table: 'audit_logs', alias: 'al', from: 'audit_logs al',
    orderBy: 'al.created_at, al.id', lock: 'al', oldPredicate: 'al.created_at < $1',
  }),
  historyTarget({
    key: 'lowOddsHits', table: 'low_odds_hits', alias: 'loh', from: 'low_odds_hits loh',
    orderBy: 'loh.created_at, loh.id', lock: 'loh', oldPredicate: 'loh.created_at < $1',
    retentionClass: 'transient',
  }),
  historyTarget({
    key: 'parlayLegs', table: 'parlay_legs', alias: 'pl', from: 'parlay_legs pl',
    orderBy: 'pl.created_at, pl.id', lock: 'pl', oldPredicate: 'pl.created_at < $1',
    protection: PARLAY_LEG_PUBLIC_PROTECTION,
  }),
  historyTarget({
    key: 'claims', table: 'claims', alias: 'c', from: 'claims c',
    orderBy: 'c.created_at, c.id', lock: 'c', oldPredicate: 'c.created_at < $1',
    protection: publicationProtectsBundle('c.bundle_id'),
    retentionClass: 'research',
  }),
  historyTarget({
    key: 'evidenceItems', table: 'evidence_items', alias: 'ei', from: 'evidence_items ei',
    orderBy: 'ei.created_at, ei.id', lock: 'ei', oldPredicate: 'ei.created_at < $1',
    protection: publicationProtectsBundle('ei.bundle_id'),
    retentionClass: 'research',
  }),
  historyTarget({
    key: 'predictions', table: 'predictions', alias: 'p', from: 'predictions p',
    orderBy: 'p.generated_at, p.id', lock: 'p', oldPredicate: 'p.generated_at < $1',
    protection: PREDICTION_REFERENCE_PROTECTION,
  }),
  historyTarget({
    key: 'parlays', table: 'parlays', alias: 'pa', from: 'parlays pa',
    orderBy: 'pa.generated_at, pa.id', lock: 'pa', oldPredicate: 'pa.generated_at < $1',
    protection: PARLAY_REFERENCE_PROTECTION,
  }),
  historyTarget({
    key: 'sourceRecords', table: 'source_records', alias: 'sr', from: 'source_records sr',
    orderBy: 'sr.captured_at, sr.id', lock: 'sr', oldPredicate: 'sr.captured_at < $1',
    protection: `
      exists (select 1 from evidence_items ei where ei.source_id = sr.id)
      or exists (select 1 from claims c where c.source_id = sr.id)
      or ${publicationProtectsBundle('sr.bundle_id')}`,
    retentionClass: 'research',
  }),
  historyTarget({
    key: 'researchBundles', table: 'research_bundles', alias: 'rb', from: 'research_bundles rb',
    orderBy: 'rb.created_at, rb.id', lock: 'rb', oldPredicate: 'rb.created_at < $1',
    protection: `
      exists (select 1 from source_records sr where sr.bundle_id = rb.id)
      or exists (select 1 from evidence_items ei where ei.bundle_id = rb.id)
      or exists (select 1 from claims c where c.bundle_id = rb.id)
      or exists (select 1 from predictions p where p.research_bundle_id = rb.id)`,
    retentionClass: 'research',
  }),
  historyTarget({
    key: 'lowOddsScans', table: 'low_odds_scans', alias: 'los', from: 'low_odds_scans los',
    orderBy: 'los.created_at, los.id', lock: 'los', oldPredicate: 'los.created_at < $1',
    protection: 'exists (select 1 from low_odds_hits loh where loh.scan_id = los.id)',
    retentionClass: 'transient',
  }),
  historyTarget({
    key: 'artifacts', table: 'artifacts', alias: 'a', from: 'artifacts a',
    orderBy: 'a.created_at, a.id', lock: 'a', oldPredicate: 'a.created_at < $1',
    protection: `
      exists (select 1 from research_bundles rb where rb.artifact_id = a.id)
      or exists (select 1 from source_records sr where sr.artifact_id = a.id)
      or exists (select 1 from evidence_items ei where ei.artifact_id = a.id)
      or exists (select 1 from predictions p where p.artifact_id = a.id)
      or exists (select 1 from parlays pa where pa.artifact_id = a.id)
      or exists (select 1 from validation_artifacts va where va.artifact_id = a.id)`,
  }),
  historyTarget({
    key: 'gambetaPickSnapshots', table: 'gambeta_pick_snapshots', alias: 'gps',
    from: 'gambeta_pick_snapshots gps', orderBy: 'gps.created_at, gps.id', lock: 'gps',
    oldPredicate: 'gps.created_at < $1',
    protection: `
      exists (select 1 from gambeta_current_picks gcp where gcp.run_id = gps.run_id)
      or exists (select 1 from gambeta_current_stats gcs where gcs.run_id = gps.run_id)`,
    retentionClass: 'transient',
  }),
]);

/** Raw cleanup runs before these roots so old raw children can release them. */
export const HISTORY_POST_RAW_RETENTION_TARGETS = Object.freeze([
  historyTarget({
    key: 'providerQuotaDaily', table: 'provider_quota_daily', alias: 'pqd',
    from: 'provider_quota_daily pqd', orderBy: 'pqd.metric_date, pqd.id', lock: 'pqd',
    oldPredicate: "pqd.metric_date < ($1::timestamptz at time zone 'UTC')::date",
    retentionClass: 'history',
  }),
  historyTarget({
    key: 'harnessTasks', table: 'harness_tasks', alias: 'ht', from: 'harness_tasks ht',
    orderBy: 'ht.created_at, ht.id', lock: 'ht', oldPredicate: 'ht.created_at < $1',
    protection: `
      exists (select 1 from approval_requests ar where ar.task_id = ht.id)
      or exists (select 1 from provider_snapshots ps where ps.task_id = ht.id)
      or exists (select 1 from audit_logs al where al.task_id = ht.id)`,
  }),
  historyTarget({
    key: 'fixtures', table: 'fixtures', alias: 'f', from: 'fixtures f',
    orderBy: 'coalesce(f.scheduled_at, f.created_at), f.id', lock: 'f',
    oldPredicate: 'coalesce(f.scheduled_at, f.created_at) < $1',
    protection: `
      exists (select 1 from odds_snapshots os where os.fixture_id = f.id)
      or exists (select 1 from odds_quotes oq where oq.fixture_id = f.id)
      or exists (select 1 from low_odds_hits loh where loh.fixture_id = f.id)
      or exists (select 1 from research_bundles rb where rb.fixture_id = f.id)
      or exists (select 1 from source_records sr where sr.fixture_id = f.id)
      or exists (select 1 from evidence_items ei where ei.fixture_id = f.id)
      or exists (select 1 from claims c where c.fixture_id = f.id)
      or exists (select 1 from predictions p where p.fixture_id = f.id)
      or exists (select 1 from parlay_legs pl where pl.fixture_id = f.id)
      or exists (select 1 from validation_artifacts va where va.fixture_id = f.id)`,
  }),
  historyTarget({
    key: 'harnessRuns', table: 'harness_runs', alias: 'hr', from: 'harness_runs hr',
    orderBy: 'coalesce(hr.completed_at, hr.started_at, hr.created_at), hr.id', lock: 'hr',
    oldPredicate: 'coalesce(hr.completed_at, hr.started_at, hr.created_at) < $1',
    protection: `
      exists (select 1 from harness_tasks ht where ht.run_id = hr.id)
      or exists (select 1 from approval_requests ar where ar.run_id = hr.id)
      or exists (select 1 from artifacts a where a.run_id = hr.id)
      or exists (select 1 from audit_logs al where al.run_id = hr.id)
      or exists (select 1 from provider_snapshots ps where ps.run_id = hr.id)
      or exists (select 1 from low_odds_scans los where los.run_id = hr.id)
      or exists (select 1 from research_bundles rb where rb.run_id = hr.id)
      or exists (select 1 from source_records sr where sr.run_id = hr.id)
      or exists (select 1 from predictions p where p.run_id = hr.id)
      or exists (select 1 from parlays pa where pa.run_id = hr.id)
      or exists (select 1 from validation_artifacts va where va.run_id = hr.id)
      or exists (select 1 from leaderboard_entries le where le.run_id = hr.id)
      or exists (select 1 from public_recommendation_publications pub where pub.run_id = hr.id)`,
  }),
  historyTarget({
    key: 'gambetaScrapeRuns', table: 'gambeta_scrape_runs', alias: 'gsr',
    from: 'gambeta_scrape_runs gsr', orderBy: 'gsr.scraped_at, gsr.id', lock: 'gsr',
    oldPredicate: 'gsr.scraped_at < $1',
    retentionClass: 'transient',
    protection: `
      exists (select 1 from gambeta_pick_snapshots gps where gps.run_id = gsr.id)
      or exists (select 1 from gambeta_current_picks gcp where gcp.run_id = gsr.id)
      or exists (select 1 from gambeta_current_stats gcs where gcs.run_id = gsr.id)`,
  }),
]);

export const HISTORY_RETENTION_TARGETS = Object.freeze([
  ...HISTORY_PRE_RAW_RETENTION_TARGETS,
  ...HISTORY_POST_RAW_RETENTION_TARGETS,
]);

const FIXTURE_PUBLIC_PROTECTION = `
  exists (
    select 1 from predictions fixture_prediction
    where fixture_prediction.fixture_id = f.id
      and (${publicationProtectsPrediction('fixture_prediction')})
  )
  or exists (
    select 1
    from parlay_legs fixture_leg
    join parlays fixture_parlay on fixture_parlay.id = fixture_leg.parlay_id
    where fixture_leg.fixture_id = f.id
      and (${publicationProtectsParlay('fixture_parlay')})
  )
  or exists (
    select 1 from validation_artifacts va
    where va.fixture_id = f.id
      and (${VALIDATION_PUBLIC_PROTECTION})
  )`;

const ODDS_QUOTE_PUBLIC_PROTECTION = `
  exists (select 1 from predictions p where p.odds_quote_id = oq.id)
  or ${publicationProtectsOddsSnapshotReference('oq.snapshot_id')}`;

const ODDS_SNAPSHOT_PUBLIC_PROTECTION = `
  exists (
    select 1 from predictions snapshot_prediction
    where snapshot_prediction.odds_snapshot_id = os.id
      and (${publicationProtectsPrediction('snapshot_prediction')})
  )
  or ${publicationProtectsOddsSnapshotReference('os.id')}`;

const PROVIDER_SNAPSHOT_PUBLIC_PROTECTION = `
  exists (
    select 1
    from odds_snapshots lineage_snapshot
    join predictions lineage_prediction
      on lineage_prediction.odds_snapshot_id = lineage_snapshot.id
    where lineage_snapshot.provider_snapshot_id = ps.id
      and (${publicationProtectsPrediction('lineage_prediction')})
  )
  or exists (
    select 1 from source_records lineage_source
    where (
      lineage_source.provider_snapshot_id = ps.id
      or lineage_source.metadata ->> 'snapshotId' = ps.id::text
    )
      and (${publicationProtectsBundle('lineage_source.bundle_id')})
  )
  or exists (
    select 1
    from source_records lineage_source
    join odds_snapshots lineage_odds
      on lineage_odds.id::text = lineage_source.metadata ->> 'oddsSnapshotId'
    where lineage_odds.provider_snapshot_id = ps.id
      and (${publicationProtectsBundle('lineage_source.bundle_id')})
  )
  or exists (
    select 1 from validation_artifacts va
    where va.provider_snapshot_id = ps.id
      and (${VALIDATION_PUBLIC_PROTECTION})
  )
  or exists (
    select 1 from validation_artifacts va
    where va.metadata ->> 'resultProviderSnapshotId' = ps.id::text
      and (${VALIDATION_PUBLIC_PROTECTION})
  )`;

function payloadTarget({ protection = 'false', ...target }) {
  const anyPayload = target.columns
    .map((column) => `${target.alias}.${column} is not null`)
    .join(' or ');
  return Object.freeze({
    ...target,
    protection,
    predicate: `(${target.oldPredicate}) and (${anyPayload}) and not (${protection})`,
  });
}

export const PAYLOAD_COMPACTION_TARGETS = Object.freeze([
  payloadTarget({
    key: 'oddsQuoteMetadata', table: 'odds_quotes', alias: 'oq', from: 'odds_quotes oq',
    orderBy: 'oq.captured_at, oq.id', lock: 'oq', cutoffClass: 'immediate',
    oldPredicate: 'oq.captured_at <= $1', columns: ['metadata'],
    protection: ODDS_QUOTE_PUBLIC_PROTECTION,
  }),
  payloadTarget({
    key: 'claimPayloads', table: 'claims', alias: 'c', from: 'claims c',
    orderBy: 'c.created_at, c.id', lock: 'c', cutoffClass: 'payload',
    oldPredicate: 'c.created_at < $1', columns: ['evidence_ids', 'warnings', 'metadata'],
    protection: publicationProtectsBundle('c.bundle_id'),
  }),
  payloadTarget({
    key: 'evidencePayloads', table: 'evidence_items', alias: 'ei', from: 'evidence_items ei',
    orderBy: 'ei.created_at, ei.id', lock: 'ei', cutoffClass: 'payload',
    oldPredicate: 'ei.created_at < $1',
    columns: ['snippet_redacted', 'summary_redacted', 'claim_ids', 'warnings', 'metadata'],
    protection: publicationProtectsBundle('ei.bundle_id'),
  }),
  payloadTarget({
    key: 'researchPayloads', table: 'research_bundles', alias: 'rb', from: 'research_bundles rb',
    orderBy: 'rb.created_at, rb.id', lock: 'rb', cutoffClass: 'payload',
    oldPredicate: 'rb.created_at < $1', columns: ['gate_result', 'warnings', 'metadata'],
    protection: publicationProtectsBundle('rb.id'),
  }),
  payloadTarget({
    key: 'sourcePayloads', table: 'source_records', alias: 'sr', from: 'source_records sr',
    orderBy: 'sr.captured_at, sr.id', lock: 'sr', cutoffClass: 'payload',
    oldPredicate: 'sr.captured_at < $1', columns: ['warnings', 'metadata'],
    protection: publicationProtectsBundle('sr.bundle_id'),
  }),
  payloadTarget({
    key: 'validationPayloads', table: 'validation_artifacts', alias: 'va',
    from: 'validation_artifacts va', orderBy: 'va.evaluated_at, va.id', lock: 'va',
    cutoffClass: 'payload', oldPredicate: 'va.evaluated_at < $1',
    columns: ['result_input', 'evidence_ids', 'metadata'],
    protection: VALIDATION_PUBLIC_PROTECTION,
  }),
  payloadTarget({
    key: 'fixtureMetadata', table: 'fixtures', alias: 'f', from: 'fixtures f',
    orderBy: 'coalesce(f.scheduled_at, f.created_at), f.id', lock: 'f', cutoffClass: 'payload',
    oldPredicate: 'coalesce(f.scheduled_at, f.created_at) < $1', columns: ['metadata'],
    protection: FIXTURE_PUBLIC_PROTECTION,
  }),
  payloadTarget({
    key: 'oddsSnapshotMetadata', table: 'odds_snapshots', alias: 'os', from: 'odds_snapshots os',
    orderBy: 'os.last_seen_at, os.id', lock: 'os', cutoffClass: 'payload',
    oldPredicate: 'os.last_seen_at < $1', columns: ['metadata'],
    protection: ODDS_SNAPSHOT_PUBLIC_PROTECTION,
  }),
  payloadTarget({
    key: 'providerSnapshotPayloads', table: 'provider_snapshots', alias: 'ps',
    from: 'provider_snapshots ps', orderBy: 'ps.last_seen_at, ps.id', lock: 'ps',
    cutoffClass: 'payload', oldPredicate: 'ps.last_seen_at < $1',
    columns: ['quota_metadata', 'request_metadata', 'raw_payload'],
    protection: PROVIDER_SNAPSHOT_PUBLIC_PROTECTION,
  }),
  payloadTarget({
    key: 'predictionPayloads', table: 'predictions', alias: 'p', from: 'predictions p',
    orderBy: 'p.generated_at, p.id', lock: 'p', cutoffClass: 'blob',
    oldPredicate: 'p.generated_at < $1',
    columns: ['warnings', 'evidence_ids', 'included_by_filters', 'metadata'],
    protection: publicationProtectsPrediction('p'),
  }),
]);

export const HISTORY_RETENTION_TABLES = Object.freeze(
  HISTORY_RETENTION_TARGETS.map((target) => target.table),
);

export const NEVER_DELETE_TABLES = Object.freeze([
  '_prisma_migrations',
  'sports_providers',
  'competitions',
  'teams',
  'league_presets',
  'team_presets',
  'search_filter_presets',
  'gambeta_current_picks',
  'gambeta_current_stats',
]);

export const RETENTION_EXECUTION_ORDER = Object.freeze([
  ...HISTORY_PRE_RAW_RETENTION_TARGETS.map((target) => target.key),
  'providerQuotaSamples',
  ...RAW_RETENTION_TARGETS.map((target) => target.key),
  ...HISTORY_POST_RAW_RETENTION_TARGETS.map((target) => target.key),
  ...PAYLOAD_COMPACTION_TARGETS.map((target) => target.key),
]);

export const RAW_RETENTION_PROTECTIONS = Object.freeze([
  'predictions.odds_quote_id and predictions.odds_snapshot_id',
  'retained parlays, validation and Discord ledger transitively through predictions',
  'low_odds_hits.odds_quote_id',
  'source_records.provider_snapshot_id',
  'legacy source_records.metadata snapshotId and oddsSnapshotId',
  'validation_artifacts.provider_snapshot_id',
  'validation_artifacts.metadata.resultProviderSnapshotId',
]);

export function validateRetentionPlan() {
  const targets = [
    ...HISTORY_RETENTION_TARGETS,
    ...RAW_RETENTION_TARGETS,
    { key: 'providerQuotaSamples', table: 'provider_quota_samples', predicate: 'pqs.sampled_at < $1' },
  ];
  const keys = new Set();
  const tables = new Set();
  for (const target of targets) {
    if (!/^[a-z][a-z0-9_]*$/.test(target.table)) {
      throw new Error(`Unsafe retention table identifier: ${String(target.table)}`);
    }
    if (keys.has(target.key)) throw new Error(`Duplicate retention target key: ${target.key}`);
    if (tables.has(target.table)) throw new Error(`Duplicate retention target table: ${target.table}`);
    if (!String(target.predicate).includes('$1')) {
      throw new Error(`Retention target ${target.key} has no cutoff guard.`);
    }
    if (NEVER_DELETE_TABLES.includes(target.table)) {
      throw new Error(`Retention must never target protected table ${target.table}.`);
    }
    keys.add(target.key);
    tables.add(target.table);
  }

  for (const target of PAYLOAD_COMPACTION_TARGETS) {
    if (!/^[a-z][a-z0-9_]*$/.test(target.table)) {
      throw new Error(`Unsafe compaction table identifier: ${String(target.table)}`);
    }
    if (!['immediate', 'payload', 'blob'].includes(target.cutoffClass)) {
      throw new Error(`Unsafe compaction cutoff class for ${target.key}.`);
    }
    if (!String(target.predicate).includes('$1')) {
      throw new Error(`Compaction target ${target.key} has no cutoff guard.`);
    }
    if (!Array.isArray(target.columns) || target.columns.length === 0
      || target.columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) {
      throw new Error(`Unsafe compaction column for ${target.key}.`);
    }
    if (NEVER_DELETE_TABLES.includes(target.table)) {
      throw new Error(`Compaction must never target protected table ${target.table}.`);
    }
  }

  const position = new Map(RETENTION_EXECUTION_ORDER.map((key, index) => [key, index]));
  const requiredOrder = [
    ['publicRecommendationPublications', 'validationArtifacts'],
    ['parlayLegs', 'predictions'],
    ['parlayLegs', 'parlays'],
    ['claims', 'sourceRecords'],
    ['evidenceItems', 'sourceRecords'],
    ['sourceRecords', 'researchBundles'],
    ['lowOddsHits', 'oddsQuotes'],
    ['predictions', 'oddsQuotes'],
    ['oddsQuotes', 'oddsSnapshots'],
    ['oddsSnapshots', 'providerSnapshots'],
    ['providerQuotaSamples', 'providerQuotaDaily'],
    ['providerSnapshots', 'harnessTasks'],
    ['harnessTasks', 'harnessRuns'],
    ['gambetaPickSnapshots', 'gambetaScrapeRuns'],
  ];
  for (const [child, parent] of requiredOrder) {
    if ((position.get(child) ?? Infinity) >= (position.get(parent) ?? -1)) {
      throw new Error(`Unsafe retention order: ${child} must run before ${parent}.`);
    }
  }
  return {
    targetCount: targets.length,
    compactionTargetCount: PAYLOAD_COMPACTION_TARGETS.length,
    executionOrder: RETENTION_EXECUTION_ORDER,
  };
}

export function parseRawRetentionOptions(argv = [], env = process.env) {
  const flags = parseFlags(argv);
  if (flags.apply && flags.dryRun) throw new Error('Use either --apply or --dry-run, not both.');
  const retentionDays = boundedInteger(
    flags.retentionDays ?? env.GANA_RAW_RETENTION_DAYS ?? DEFAULT_RAW_RETENTION_DAYS,
    'retention days',
    MIN_RAW_RETENTION_DAYS,
    MAX_RAW_RETENTION_DAYS,
  );
  const analyticRetentionDays = boundedInteger(
    flags.analyticRetentionDays ?? env.GANA_ANALYTIC_RETENTION_DAYS ?? DEFAULT_ANALYTIC_RETENTION_DAYS,
    'analytic retention days',
    MIN_ANALYTIC_RETENTION_DAYS,
    MAX_ANALYTIC_RETENTION_DAYS,
  );
  const researchRetentionDays = boundedInteger(
    flags.researchRetentionDays ?? env.GANA_RESEARCH_RETENTION_DAYS ?? DEFAULT_RESEARCH_RETENTION_DAYS,
    'research retention days',
    MIN_RESEARCH_RETENTION_DAYS,
    MAX_RESEARCH_RETENTION_DAYS,
  );
  const transientRetentionDays = boundedInteger(
    flags.transientRetentionDays ?? env.GANA_TRANSIENT_RETENTION_DAYS ?? DEFAULT_TRANSIENT_RETENTION_DAYS,
    'transient retention days',
    MIN_TRANSIENT_RETENTION_DAYS,
    MAX_TRANSIENT_RETENTION_DAYS,
  );
  const historyRetentionDays = boundedInteger(
    flags.historyRetentionDays ?? env.GANA_HISTORY_RETENTION_DAYS ?? DEFAULT_HISTORY_RETENTION_DAYS,
    'history retention days',
    MIN_HISTORY_RETENTION_DAYS,
    MAX_HISTORY_RETENTION_DAYS,
  );
  if (!(retentionDays <= transientRetentionDays
    && transientRetentionDays <= researchRetentionDays
    && researchRetentionDays <= analyticRetentionDays
    && analyticRetentionDays <= historyRetentionDays)) {
    throw new Error('Retention tiers must satisfy raw <= transient <= research <= analytic <= history.');
  }
  const batchSize = boundedInteger(
    flags.batchSize ?? env.GANA_RAW_RETENTION_BATCH_SIZE ?? DEFAULT_RAW_RETENTION_BATCH_SIZE,
    'batch size',
    1,
    MAX_RAW_RETENTION_BATCH_SIZE,
  );
  const statementTimeoutMs = boundedInteger(
    flags.statementTimeoutMs ?? env.GANA_RAW_RETENTION_STATEMENT_TIMEOUT_MS ?? 30_000,
    'statement timeout',
    1_000,
    300_000,
  );
  const lockTimeoutMs = boundedInteger(
    flags.lockTimeoutMs ?? env.GANA_RAW_RETENTION_LOCK_TIMEOUT_MS ?? 2_000,
    'lock timeout',
    100,
    60_000,
  );
  const maxBatches = boundedInteger(
    flags.maxBatches ?? env.GANA_RAW_RETENTION_MAX_BATCHES ?? 10_000,
    'max batches',
    1,
    100_000,
  );
  return {
    mode: flags.apply ? 'apply' : 'dry-run',
    retentionDays,
    transientRetentionDays,
    researchRetentionDays,
    analyticRetentionDays,
    historyRetentionDays,
    batchSize,
    statementTimeoutMs,
    lockTimeoutMs,
    maxBatches,
    json: Boolean(flags.json),
    help: Boolean(flags.help),
  };
}

export function retentionCutoff(now, retentionDays) {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export function retentionCutoffs(now, options) {
  return Object.freeze({
    transient: retentionCutoff(now, options.transientRetentionDays),
    research: retentionCutoff(now, options.researchRetentionDays),
    analytic: retentionCutoff(now, options.analyticRetentionDays),
    history: retentionCutoff(now, options.historyRetentionDays),
  });
}

export function payloadCompactionCutoffs(now, options) {
  return Object.freeze({
    immediate: now,
    payload: retentionCutoff(now, options.retentionDays),
    blob: retentionCutoff(now, options.researchRetentionDays),
  });
}

function historyCutoffForTarget(target, cutoffs) {
  const cutoff = cutoffs[target.retentionClass];
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new Error(`Missing ${target.retentionClass} cutoff for ${target.key}.`);
  }
  return cutoff;
}

function payloadCutoffForTarget(target, cutoffs) {
  const cutoff = cutoffs[target.cutoffClass];
  if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
    throw new Error(`Missing ${target.cutoffClass} payload cutoff for ${target.key}.`);
  }
  return cutoff;
}

export function buildRetentionReportQuery(target) {
  return `
    with eligible as materialized (
      select ${target.alias}.*
      from ${target.from}
      where ${target.predicate}
    )
    select
      count(*)::text as row_count,
      coalesce(sum(pg_column_size(eligible)), 0)::text as estimated_bytes
    from eligible
  `;
}

export function buildRetentionDeleteQuery(target) {
  return `
    with candidates as materialized (
      select ${target.alias}.id
      from ${target.from}
      where ${target.predicate}
      order by ${target.orderBy}
      for update of ${target.lock} skip locked
      limit $2
    ), deleted as (
      delete from ${target.table} target
      using candidates
      where target.id = candidates.id
      returning pg_column_size(target) as row_bytes
    )
    select
      count(*)::text as row_count,
      coalesce(sum(row_bytes), 0)::text as estimated_bytes
    from deleted
  `;
}

function payloadByteExpression(target) {
  return target.columns
    .map((column) => `coalesce(pg_column_size(${target.alias}.${column}), 0)`)
    .join(' + ');
}

export function buildPayloadCompactionReportQuery(target) {
  return `
    select
      count(*)::text as row_count,
      coalesce(sum(${payloadByteExpression(target)}), 0)::text as estimated_bytes
    from ${target.from}
    where ${target.predicate}
  `;
}

export function buildPayloadCompactionUpdateQuery(target) {
  const assignments = target.columns.map((column) => `${column} = null`).join(', ');
  return `
    with candidates as materialized (
      select
        ${target.alias}.id,
        (${payloadByteExpression(target)})::bigint as estimated_bytes
      from ${target.from}
      where ${target.predicate}
      order by ${target.orderBy}
      for update of ${target.lock} skip locked
      limit $2
    ), compacted as (
      update ${target.table} target
      set ${assignments}
      from candidates
      where target.id = candidates.id
      returning target.id
    )
    select
      count(*)::text as row_count,
      coalesce(sum(candidates.estimated_bytes), 0)::text as estimated_bytes
    from compacted
    join candidates on candidates.id = compacted.id
  `;
}

export function buildQuotaRetentionReportQuery() {
  return `
    select
      count(*)::text as row_count,
      coalesce(sum(pg_column_size(pqs)), 0)::text as estimated_bytes,
      count(distinct (
        (pqs.sampled_at at time zone 'UTC')::date,
        pqs.provider_code,
        coalesce(pqs.endpoint_name, ''),
        pqs.status
      ))::text as aggregate_group_count
    from provider_quota_samples pqs
    where pqs.sampled_at < $1
  `;
}

export function buildQuotaConsolidateDeleteQuery() {
  return `
    with candidates as materialized (
      select pqs.*
      from provider_quota_samples pqs
      where pqs.sampled_at < $1
      order by pqs.sampled_at, pqs.id
      for update of pqs skip locked
      limit $2
    ), aggregated as (
      select
        (c.sampled_at at time zone 'UTC')::date as metric_date,
        (array_agg(c.provider_id order by c.sampled_at) filter (where c.provider_id is not null))[1] as provider_id,
        c.provider_code,
        coalesce(c.endpoint_name, '') as endpoint_name,
        c.status,
        count(*)::bigint as sample_count,
        count(c.response_ms)::bigint as response_ms_sample_count,
        round(avg(c.response_ms)::numeric, 3) as avg_response_ms,
        min(c.response_ms) as min_response_ms,
        max(c.response_ms) as max_response_ms,
        count(c.quota_limit)::bigint as quota_limit_sample_count,
        round(avg(c.quota_limit)::numeric, 3) as avg_quota_limit,
        min(c.quota_limit) as min_quota_limit,
        max(c.quota_limit) as max_quota_limit,
        count(c.quota_remaining)::bigint as quota_remaining_sample_count,
        round(avg(c.quota_remaining)::numeric, 3) as avg_quota_remaining,
        min(c.quota_remaining) as min_quota_remaining,
        max(c.quota_remaining) as max_quota_remaining,
        min(c.sampled_at) as first_sampled_at,
        max(c.sampled_at) as last_sampled_at
      from candidates c
      group by
        (c.sampled_at at time zone 'UTC')::date,
        c.provider_code,
        coalesce(c.endpoint_name, ''),
        c.status
    ), upserted as (
      insert into provider_quota_daily as daily (
        id,
        metric_date,
        provider_id,
        provider_code,
        endpoint_name,
        status,
        sample_count,
        response_ms_sample_count,
        avg_response_ms,
        min_response_ms,
        max_response_ms,
        quota_limit_sample_count,
        avg_quota_limit,
        min_quota_limit,
        max_quota_limit,
        quota_remaining_sample_count,
        avg_quota_remaining,
        min_quota_remaining,
        max_quota_remaining,
        first_sampled_at,
        last_sampled_at,
        created_at,
        updated_at
      )
      select
        gen_random_uuid(),
        a.metric_date,
        a.provider_id,
        a.provider_code,
        a.endpoint_name,
        a.status,
        a.sample_count,
        a.response_ms_sample_count,
        a.avg_response_ms,
        a.min_response_ms,
        a.max_response_ms,
        a.quota_limit_sample_count,
        a.avg_quota_limit,
        a.min_quota_limit,
        a.max_quota_limit,
        a.quota_remaining_sample_count,
        a.avg_quota_remaining,
        a.min_quota_remaining,
        a.max_quota_remaining,
        a.first_sampled_at,
        a.last_sampled_at,
        current_timestamp,
        current_timestamp
      from aggregated a
      on conflict (metric_date, provider_code, endpoint_name, status) do update set
        provider_id = coalesce(daily.provider_id, excluded.provider_id),
        avg_response_ms = case
          when daily.response_ms_sample_count + excluded.response_ms_sample_count = 0 then null
          else round((
            coalesce(daily.avg_response_ms, 0) * daily.response_ms_sample_count
            + coalesce(excluded.avg_response_ms, 0) * excluded.response_ms_sample_count
          ) / (daily.response_ms_sample_count + excluded.response_ms_sample_count), 3)
        end,
        min_response_ms = case
          when daily.min_response_ms is null then excluded.min_response_ms
          when excluded.min_response_ms is null then daily.min_response_ms
          else least(daily.min_response_ms, excluded.min_response_ms)
        end,
        max_response_ms = case
          when daily.max_response_ms is null then excluded.max_response_ms
          when excluded.max_response_ms is null then daily.max_response_ms
          else greatest(daily.max_response_ms, excluded.max_response_ms)
        end,
        avg_quota_limit = case
          when daily.quota_limit_sample_count + excluded.quota_limit_sample_count = 0 then null
          else round((
            coalesce(daily.avg_quota_limit, 0) * daily.quota_limit_sample_count
            + coalesce(excluded.avg_quota_limit, 0) * excluded.quota_limit_sample_count
          ) / (daily.quota_limit_sample_count + excluded.quota_limit_sample_count), 3)
        end,
        min_quota_limit = case
          when daily.min_quota_limit is null then excluded.min_quota_limit
          when excluded.min_quota_limit is null then daily.min_quota_limit
          else least(daily.min_quota_limit, excluded.min_quota_limit)
        end,
        max_quota_limit = case
          when daily.max_quota_limit is null then excluded.max_quota_limit
          when excluded.max_quota_limit is null then daily.max_quota_limit
          else greatest(daily.max_quota_limit, excluded.max_quota_limit)
        end,
        avg_quota_remaining = case
          when daily.quota_remaining_sample_count + excluded.quota_remaining_sample_count = 0 then null
          else round((
            coalesce(daily.avg_quota_remaining, 0) * daily.quota_remaining_sample_count
            + coalesce(excluded.avg_quota_remaining, 0) * excluded.quota_remaining_sample_count
          ) / (daily.quota_remaining_sample_count + excluded.quota_remaining_sample_count), 3)
        end,
        min_quota_remaining = case
          when daily.min_quota_remaining is null then excluded.min_quota_remaining
          when excluded.min_quota_remaining is null then daily.min_quota_remaining
          else least(daily.min_quota_remaining, excluded.min_quota_remaining)
        end,
        max_quota_remaining = case
          when daily.max_quota_remaining is null then excluded.max_quota_remaining
          when excluded.max_quota_remaining is null then daily.max_quota_remaining
          else greatest(daily.max_quota_remaining, excluded.max_quota_remaining)
        end,
        sample_count = daily.sample_count + excluded.sample_count,
        response_ms_sample_count = daily.response_ms_sample_count + excluded.response_ms_sample_count,
        quota_limit_sample_count = daily.quota_limit_sample_count + excluded.quota_limit_sample_count,
        quota_remaining_sample_count = daily.quota_remaining_sample_count + excluded.quota_remaining_sample_count,
        first_sampled_at = least(daily.first_sampled_at, excluded.first_sampled_at),
        last_sampled_at = greatest(daily.last_sampled_at, excluded.last_sampled_at),
        updated_at = current_timestamp
      returning 1 as group_row
    ), upsert_guard as (
      select count(*)::bigint as aggregate_group_count from upserted
    ), deleted as (
      delete from provider_quota_samples target
      using candidates, upsert_guard
      where target.id = candidates.id
        and upsert_guard.aggregate_group_count > 0
      returning pg_column_size(target) as row_bytes
    )
    select
      count(*)::text as row_count,
      coalesce(sum(row_bytes), 0)::text as estimated_bytes,
      (select aggregate_group_count::text from upsert_guard) as aggregate_group_count
    from deleted
  `;
}

export function buildHistoryRetentionReportQuery(target) {
  return `
    with old_rows as materialized (
      select
        pg_column_size(${target.alias}) as row_bytes,
        (${target.protection}) as reference_blocked
      from ${target.from}
      where ${target.oldPredicate}
    )
    select
      count(*) filter (where not reference_blocked)::text as row_count,
      coalesce(sum(row_bytes) filter (where not reference_blocked), 0)::text as estimated_bytes,
      count(*) filter (where reference_blocked)::text as blocked_row_count,
      coalesce(sum(row_bytes) filter (where reference_blocked), 0)::text as blocked_estimated_bytes
    from old_rows
  `;
}

export function buildDatabaseSizeQuery() {
  return `select pg_database_size(current_database())::text as database_bytes`;
}

export function buildTopTableSizesQuery() {
  return `
    select
      ns.nspname as schema_name,
      cls.relname as table_name,
      pg_relation_size(cls.oid)::text as table_bytes,
      pg_indexes_size(cls.oid)::text as index_bytes,
      pg_total_relation_size(cls.oid)::text as total_bytes
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where cls.relkind in ('r', 'p')
      and ns.nspname not in ('pg_catalog', 'information_schema')
      and ns.nspname !~ '^pg_toast'
    order by pg_total_relation_size(cls.oid) desc, ns.nspname, cls.relname
    limit 10
  `;
}

export function buildTopIndexSizesQuery() {
  return `
    select
      schemaname as schema_name,
      relname as table_name,
      indexrelname as index_name,
      pg_relation_size(indexrelid)::text as index_bytes
    from pg_stat_user_indexes
    order by pg_relation_size(indexrelid) desc, schemaname, indexrelname
    limit 10
  `;
}

export async function inspectRawRetention(client, cutoff) {
  const quotaRows = await client.$queryRawUnsafe(buildQuotaRetentionReportQuery(), cutoff);
  const targets = {
    providerQuotaSamples: normalizeQuotaCountRow(quotaRows?.[0]),
  };
  for (const target of RAW_RETENTION_TARGETS) {
    const rows = await client.$queryRawUnsafe(buildRetentionReportQuery(target), cutoff);
    targets[target.key] = normalizeCountRow(rows?.[0]);
  }
  return withTotals(targets);
}

export async function applyRawRetention(client, cutoff, options) {
  const targets = {
    providerQuotaSamples: await applyQuotaRetention(client, cutoff, options),
    ...(await applyRetentionTargets(client, RAW_RETENTION_TARGETS, cutoff, options)).targets,
  };
  return withTotals(targets);
}

export async function inspectHistoryRetention(client, cutoffs) {
  const targets = {};
  for (const target of HISTORY_RETENTION_TARGETS) {
    const cutoff = historyCutoffForTarget(target, cutoffs);
    const rows = await client.$queryRawUnsafe(buildHistoryRetentionReportQuery(target), cutoff);
    targets[target.key] = {
      ...normalizeHistoryCountRow(rows?.[0]),
      retentionClass: target.retentionClass,
      cutoff: cutoff.toISOString(),
    };
  }
  return withHistoryTotals(targets);
}

export async function inspectPayloadCompaction(client, cutoffs) {
  const targets = {};
  for (const target of PAYLOAD_COMPACTION_TARGETS) {
    const cutoff = payloadCutoffForTarget(target, cutoffs);
    const rows = await client.$queryRawUnsafe(buildPayloadCompactionReportQuery(target), cutoff);
    targets[target.key] = {
      ...normalizeCountRow(rows?.[0]),
      cutoffClass: target.cutoffClass,
      cutoff: cutoff.toISOString(),
    };
  }
  return withTotals(targets);
}

export async function inspectDatabaseCapacity(client) {
  const [databaseRows, tableRows, indexRows] = await Promise.all([
    client.$queryRawUnsafe(buildDatabaseSizeQuery()),
    client.$queryRawUnsafe(buildTopTableSizesQuery()),
    client.$queryRawUnsafe(buildTopIndexSizesQuery()),
  ]);
  const databaseBytes = safeCount(databaseRows?.[0]?.database_bytes ?? databaseRows?.[0]?.databaseBytes);
  return {
    status: capacityStatus(databaseBytes),
    databaseBytes,
    warningBytes: CAPACITY_WARNING_BYTES,
    hardBytes: CAPACITY_HARD_BYTES,
    topTables: (tableRows ?? []).map(normalizeTableSizeRow),
    topIndexes: (indexRows ?? []).map(normalizeIndexSizeRow),
    criticalAction: databaseBytes >= CAPACITY_HARD_BYTES
      ? 'Continue bounded retention, then inspect reference-blocked history and ingestion growth before resuming writes.'
      : null,
  };
}

export async function applyHistoryRetention(client, cutoffs, options, targets = HISTORY_RETENTION_TARGETS) {
  return applyRetentionTargets(
    client,
    targets,
    (target) => historyCutoffForTarget(target, cutoffs),
    options,
  );
}

async function applyQuotaRetention(client, cutoff, options) {
  let rowCount = 0;
  let estimatedBytes = 0;
  let aggregateGroupCount = 0;
  let batches = 0;
  let exhausted = false;
  while (batches < options.maxBatches) {
    const batch = await client.$transaction(async (tx) => {
      await setRetentionTimeouts(tx, options);
      const rows = await tx.$queryRawUnsafe(buildQuotaConsolidateDeleteQuery(), cutoff, options.batchSize);
      return normalizeQuotaCountRow(rows?.[0]);
    }, transactionOptions(options));
    batches += 1;
    rowCount += batch.rowCount;
    estimatedBytes += batch.estimatedBytes;
    aggregateGroupCount += batch.aggregateGroupCount;
    if (batch.rowCount < options.batchSize) {
      exhausted = true;
      break;
    }
  }
  if (!exhausted) {
    throw new Error('Retention stopped after max batches for providerQuotaSamples; rerun safely to continue.');
  }
  return { rowCount, estimatedBytes, aggregateGroupCount, batches };
}

async function applyRetentionTargets(client, retentionTargets, cutoffOrResolver, options) {
  const targets = {};
  for (const target of retentionTargets) {
    const cutoff = typeof cutoffOrResolver === 'function'
      ? cutoffOrResolver(target)
      : cutoffOrResolver;
    let rowCount = 0;
    let estimatedBytes = 0;
    let batches = 0;
    let exhausted = false;
    while (batches < options.maxBatches) {
      const batch = await client.$transaction(async (tx) => {
        await setRetentionTimeouts(tx, options);
        const rows = await tx.$queryRawUnsafe(buildRetentionDeleteQuery(target), cutoff, options.batchSize);
        return normalizeCountRow(rows?.[0]);
      }, transactionOptions(options));
      batches += 1;
      rowCount += batch.rowCount;
      estimatedBytes += batch.estimatedBytes;
      if (batch.rowCount < options.batchSize) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted) {
      throw new Error(`Retention stopped after max batches for ${target.key}; rerun safely to continue.`);
    }
    targets[target.key] = {
      rowCount,
      estimatedBytes,
      batches,
      ...(target.retentionClass ? {
        retentionClass: target.retentionClass,
        cutoff: cutoff.toISOString(),
      } : {}),
    };
  }
  return withTotals(targets);
}

export async function applyPayloadCompaction(client, cutoffs, options) {
  const targets = {};
  for (const target of PAYLOAD_COMPACTION_TARGETS) {
    const cutoff = payloadCutoffForTarget(target, cutoffs);
    let rowCount = 0;
    let estimatedBytes = 0;
    let batches = 0;
    let exhausted = false;
    while (batches < options.maxBatches) {
      const batch = await client.$transaction(async (tx) => {
        await setRetentionTimeouts(tx, options);
        const rows = await tx.$queryRawUnsafe(
          buildPayloadCompactionUpdateQuery(target),
          cutoff,
          options.batchSize,
        );
        return normalizeCountRow(rows?.[0]);
      }, transactionOptions(options));
      batches += 1;
      rowCount += batch.rowCount;
      estimatedBytes += batch.estimatedBytes;
      if (batch.rowCount < options.batchSize) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted) {
      throw new Error(`Payload compaction stopped after max batches for ${target.key}; rerun safely to continue.`);
    }
    targets[target.key] = {
      rowCount,
      estimatedBytes,
      batches,
      cutoffClass: target.cutoffClass,
      cutoff: cutoff.toISOString(),
    };
  }
  return withTotals(targets);
}

export async function runRawRetention(client, options, now = new Date()) {
  validateRetentionOptions(options);
  validateRetentionPlan();
  const cutoff = retentionCutoff(now, options.retentionDays);
  const historyCutoffMap = retentionCutoffs(now, options);
  const payloadCutoffMap = payloadCompactionCutoffs(now, options);
  const [before, historyBefore, compactionBefore, capacityBefore] = await Promise.all([
    inspectRawRetention(client, cutoff),
    inspectHistoryRetention(client, historyCutoffMap),
    inspectPayloadCompaction(client, payloadCutoffMap),
    inspectDatabaseCapacity(client),
  ]);
  const base = {
    schemaVersion: 5,
    mode: options.mode,
    generatedAt: now.toISOString(),
    cutoff: cutoff.toISOString(),
    retentionDays: options.retentionDays,
    historyCutoff: historyCutoffMap.history.toISOString(),
    historyRetentionDays: options.historyRetentionDays,
    researchRetentionDays: options.researchRetentionDays,
    transientRetentionDays: options.transientRetentionDays,
    analyticRetentionDays: options.analyticRetentionDays,
    historyCutoffs: Object.fromEntries(
      Object.entries(historyCutoffMap).map(([key, value]) => [key, value.toISOString()]),
    ),
    payloadCutoffs: Object.fromEntries(
      Object.entries(payloadCutoffMap).map(([key, value]) => [key, value.toISOString()]),
    ),
    batchSize: options.batchSize,
    estimate: 'PostgreSQL heap tuple bytes; index/TOAST savings and physical file shrinkage are not guaranteed.',
    protections: RAW_RETENTION_PROTECTIONS,
    historyPolicy: {
      id: 'bounded-7d-14d-30d-60d-v2',
      retentionTableCount: HISTORY_RETENTION_TABLES.length,
      neverDeleteTableCount: NEVER_DELETE_TABLES.length,
      executionPhaseCount: 4,
      tiers: {
        transientDays: options.transientRetentionDays,
        researchDays: options.researchRetentionDays,
        analyticDays: options.analyticRetentionDays,
        durableHistoryDays: options.historyRetentionDays,
      },
      note: 'Each table uses its 7/14/30/60-day class. Older parents remain only while referenced by retained rows or retained publication lineage.',
    },
    capacityBefore,
    before,
    historyBefore,
    compactionBefore,
  };
  if (options.mode !== 'apply') return base;
  const historyDeletedBeforeRaw = await applyHistoryRetention(
    client,
    historyCutoffMap,
    options,
    HISTORY_PRE_RAW_RETENTION_TARGETS,
  );
  const deleted = await applyRawRetention(client, cutoff, options);
  const historyDeletedAfterRaw = await applyHistoryRetention(
    client,
    historyCutoffMap,
    options,
    HISTORY_POST_RAW_RETENTION_TARGETS,
  );
  const historyDeleted = mergeRetentionReports(historyDeletedBeforeRaw, historyDeletedAfterRaw);
  const compacted = await applyPayloadCompaction(client, payloadCutoffMap, options);
  const [after, historyAfter, compactionAfter, capacityAfter] = await Promise.all([
    inspectRawRetention(client, cutoff),
    inspectHistoryRetention(client, historyCutoffMap),
    inspectPayloadCompaction(client, payloadCutoffMap),
    inspectDatabaseCapacity(client),
  ]);
  return {
    ...base,
    deleted,
    historyDeleted,
    compacted,
    after,
    historyAfter,
    compactionAfter,
    capacityAfter,
  };
}

async function setRetentionTimeouts(tx, options) {
  await tx.$executeRawUnsafe(`set local statement_timeout = '${options.statementTimeoutMs}ms'`);
  await tx.$executeRawUnsafe(`set local lock_timeout = '${options.lockTimeoutMs}ms'`);
}

function transactionOptions(options) {
  return { maxWait: options.lockTimeoutMs + 1_000, timeout: options.statementTimeoutMs + 5_000 };
}

function validateRetentionOptions(options) {
  if (!['dry-run', 'apply'].includes(options.mode)) {
    throw new Error(`Invalid retention mode: ${String(options.mode)}.`);
  }
  boundedInteger(
    options.retentionDays,
    'retention days',
    MIN_RAW_RETENTION_DAYS,
    MAX_RAW_RETENTION_DAYS,
  );
  boundedInteger(
    options.transientRetentionDays,
    'transient retention days',
    MIN_TRANSIENT_RETENTION_DAYS,
    MAX_TRANSIENT_RETENTION_DAYS,
  );
  boundedInteger(
    options.researchRetentionDays,
    'research retention days',
    MIN_RESEARCH_RETENTION_DAYS,
    MAX_RESEARCH_RETENTION_DAYS,
  );
  boundedInteger(
    options.analyticRetentionDays,
    'analytic retention days',
    MIN_ANALYTIC_RETENTION_DAYS,
    MAX_ANALYTIC_RETENTION_DAYS,
  );
  boundedInteger(
    options.historyRetentionDays,
    'history retention days',
    MIN_HISTORY_RETENTION_DAYS,
    MAX_HISTORY_RETENTION_DAYS,
  );
  if (!(options.retentionDays <= options.transientRetentionDays
    && options.transientRetentionDays <= options.researchRetentionDays
    && options.researchRetentionDays <= options.analyticRetentionDays
    && options.analyticRetentionDays <= options.historyRetentionDays)) {
    throw new Error('Retention tiers must satisfy raw <= transient <= research <= analytic <= history.');
  }
  boundedInteger(options.batchSize, 'batch size', 1, MAX_RAW_RETENTION_BATCH_SIZE);
  boundedInteger(options.maxBatches, 'max batches', 1, 100_000);
  boundedInteger(options.statementTimeoutMs, 'statement timeout', 1_000, 300_000);
  boundedInteger(options.lockTimeoutMs, 'lock timeout', 100, 60_000);
}

function normalizeCountRow(row = {}) {
  return {
    rowCount: safeCount(row.row_count ?? row.rowCount),
    estimatedBytes: safeCount(row.estimated_bytes ?? row.estimatedBytes),
  };
}

function normalizeQuotaCountRow(row = {}) {
  return {
    ...normalizeCountRow(row),
    aggregateGroupCount: safeCount(row.aggregate_group_count ?? row.aggregateGroupCount),
  };
}

function normalizeHistoryCountRow(row = {}) {
  return {
    ...normalizeCountRow(row),
    blockedRowCount: safeCount(row.blocked_row_count ?? row.blockedRowCount),
    blockedEstimatedBytes: safeCount(row.blocked_estimated_bytes ?? row.blockedEstimatedBytes),
  };
}

function normalizeTableSizeRow(row = {}) {
  return {
    schema: String(row.schema_name ?? row.schemaName ?? ''),
    table: String(row.table_name ?? row.tableName ?? ''),
    tableBytes: safeCount(row.table_bytes ?? row.tableBytes),
    indexBytes: safeCount(row.index_bytes ?? row.indexBytes),
    totalBytes: safeCount(row.total_bytes ?? row.totalBytes),
  };
}

function normalizeIndexSizeRow(row = {}) {
  return {
    schema: String(row.schema_name ?? row.schemaName ?? ''),
    table: String(row.table_name ?? row.tableName ?? ''),
    index: String(row.index_name ?? row.indexName ?? ''),
    indexBytes: safeCount(row.index_bytes ?? row.indexBytes),
  };
}

function capacityStatus(databaseBytes) {
  if (databaseBytes >= CAPACITY_HARD_BYTES) return 'critical';
  if (databaseBytes >= CAPACITY_WARNING_BYTES) return 'warning';
  return 'ok';
}

function safeCount(value) {
  const parsed = typeof value === 'bigint' ? Number(value) : Number(String(value ?? 0));
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid retention count returned by PostgreSQL: ${String(value)}`);
  return parsed;
}

function withTotals(targets) {
  return {
    targets,
    totals: Object.values(targets).reduce((total, value) => ({
      rowCount: total.rowCount + value.rowCount,
      estimatedBytes: total.estimatedBytes + value.estimatedBytes,
    }), { rowCount: 0, estimatedBytes: 0 }),
  };
}

function withHistoryTotals(targets) {
  const eligible = withTotals(targets);
  return {
    ...eligible,
    blockedTotals: Object.values(targets).reduce((total, value) => ({
      rowCount: total.rowCount + value.blockedRowCount,
      estimatedBytes: total.estimatedBytes + value.blockedEstimatedBytes,
    }), { rowCount: 0, estimatedBytes: 0 }),
  };
}

function mergeRetentionReports(...reports) {
  return withTotals(Object.assign({}, ...reports.map((report) => report.targets)));
}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--') continue;
    if (!value.startsWith('--')) throw new Error(`Unexpected argument: ${value}`);
    const [rawName, inline] = value.slice(2).split('=', 2);
    const name = rawName.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (['apply', 'dryRun', 'json', 'help'].includes(name)) {
      if (inline !== undefined) throw new Error(`--${rawName} does not accept a value.`);
      flags[name] = true;
      continue;
    }
    const next = inline ?? argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`--${rawName} requires a value.`);
    flags[name] = next;
    if (inline === undefined) index += 1;
  }
  const known = new Set([
    'apply', 'dryRun', 'json', 'help', 'retentionDays', 'analyticRetentionDays', 'batchSize',
    'researchRetentionDays', 'transientRetentionDays', 'historyRetentionDays',
    'statementTimeoutMs', 'lockTimeoutMs', 'maxBatches',
  ]);
  for (const name of Object.keys(flags)) {
    if (!known.has(name)) throw new Error(`Unknown retention option: --${name}`);
  }
  return flags;
}

function boundedInteger(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}
