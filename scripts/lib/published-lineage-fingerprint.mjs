import { createHash } from 'node:crypto';

export const PUBLISHED_LINEAGE_TABLE_SPECS = Object.freeze([
  ['publications', 'public_recommendation_publications', 'true'],
  ['predictions', 'predictions', 't.id in (select id from protected_prediction_ids)'],
  ['parlays', 'parlays', 't.id in (select id from protected_parlay_ids)'],
  ['parlayLegs', 'parlay_legs', 't.parlay_id in (select id from protected_parlay_ids) or t.prediction_id in (select id from seed_prediction_ids)'],
  ['validations', 'validation_artifacts', 't.id in (select id from protected_validation_ids)'],
  ['researchBundles', 'research_bundles', 't.id in (select id from protected_bundle_ids)'],
  ['sourceRecords', 'source_records', 't.id in (select id from protected_source_ids)'],
  ['evidenceItems', 'evidence_items', 't.id in (select id from protected_evidence_ids)'],
  ['claims', 'claims', 't.id in (select id from protected_claim_ids)'],
  ['oddsSnapshots', 'odds_snapshots', 't.id in (select id from protected_snapshot_ids)'],
  ['oddsQuotes', 'odds_quotes', 't.id in (select id from protected_quote_ids)'],
  ['providerSnapshots', 'provider_snapshots', 't.id in (select id from protected_provider_snapshot_ids)'],
  ['fixtures', 'fixtures', 't.id in (select id from protected_fixture_ids)'],
  ['runs', 'harness_runs', 't.id in (select id from protected_run_ids)'],
  ['tasks', 'harness_tasks', 't.run_id in (select id from protected_run_ids)'],
  ['artifacts', 'artifacts', 't.id in (select id from protected_artifact_ids)'],
  ['leaderboard', 'leaderboard_entries', 't.run_id in (select id from protected_run_ids)'],
  ['approvals', 'approval_requests', 't.run_id in (select id from protected_run_ids)'],
  ['auditLogs', 'audit_logs', 't.run_id in (select id from protected_run_ids)'],
].map((spec) => Object.freeze(spec)));

const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

/**
 * This is the publication-only expansion of the protection predicates in
 * raw-data-retention.mjs. Keep the explicit CTEs: they make the protected
 * relational and legacy-JSON closure auditable and hash the same row sets
 * before and after a retention apply.
 */
export function buildPublishedLineageFingerprintQuery() {
  const cte = `
with pub as (
  select * from public_recommendation_publications
), seed_prediction_ids as (
  select prediction_id as id from pub where prediction_id is not null
  union
  select target_id::uuid from pub
  where target_type = 'prediction' and target_id ~* '${UUID_PATTERN}'
), seed_parlay_ids as (
  select parlay_id as id from pub where parlay_id is not null
  union
  select target_id::uuid from pub
  where target_type = 'parlay' and target_id ~* '${UUID_PATTERN}'
), protected_prediction_ids as (
  select id from seed_prediction_ids
  union
  select pl.prediction_id from parlay_legs pl join seed_parlay_ids sp on sp.id = pl.parlay_id
), protected_parlay_ids as (
  select id from seed_parlay_ids
  union
  select pl.parlay_id from parlay_legs pl join seed_prediction_ids sp on sp.id = pl.prediction_id
), protected_validation_ids as (
  select va.id from validation_artifacts va
  where (va.run_id is not null and exists (select 1 from pub where pub.run_id = va.run_id))
     or va.prediction_id in (select id from protected_prediction_ids)
     or va.parlay_id in (select id from protected_parlay_ids)
), protected_bundle_ids as (
  select distinct p.research_bundle_id as id from predictions p
  where p.id in (select id from protected_prediction_ids) and p.research_bundle_id is not null
), protected_source_ids as (
  select sr.id from source_records sr where sr.bundle_id in (select id from protected_bundle_ids)
), protected_evidence_ids as (
  select ei.id from evidence_items ei where ei.bundle_id in (select id from protected_bundle_ids)
), protected_claim_ids as (
  select c.id from claims c where c.bundle_id in (select id from protected_bundle_ids)
), protected_snapshot_ids as (
  select p.odds_snapshot_id as id from predictions p
  where p.id in (select id from protected_prediction_ids) and p.odds_snapshot_id is not null
  union
  select os.id from odds_snapshots os
  where exists (
    select 1 from source_records sr
    where sr.id in (select id from protected_source_ids)
      and sr.metadata ->> 'oddsSnapshotId' = os.id::text
  )
), protected_quote_ids as (
  select p.odds_quote_id as id from predictions p
  where p.id in (select id from protected_prediction_ids) and p.odds_quote_id is not null
  union
  select oq.id from odds_quotes oq where oq.snapshot_id in (select id from protected_snapshot_ids)
), protected_provider_snapshot_ids as (
  select os.provider_snapshot_id as id from odds_snapshots os
  where os.id in (select id from protected_snapshot_ids) and os.provider_snapshot_id is not null
  union
  select sr.provider_snapshot_id from source_records sr
  where sr.id in (select id from protected_source_ids) and sr.provider_snapshot_id is not null
  union
  select ps.id from provider_snapshots ps where exists (
    select 1 from source_records sr
    where sr.id in (select id from protected_source_ids)
      and sr.metadata ->> 'snapshotId' = ps.id::text
  )
  union
  select va.provider_snapshot_id from validation_artifacts va
  where va.id in (select id from protected_validation_ids) and va.provider_snapshot_id is not null
  union
  select ps.id from provider_snapshots ps where exists (
    select 1 from validation_artifacts va
    where va.id in (select id from protected_validation_ids)
      and va.metadata ->> 'resultProviderSnapshotId' = ps.id::text
  )
), protected_fixture_ids as (
  select p.fixture_id as id from predictions p where p.id in (select id from protected_prediction_ids)
  union select pl.fixture_id from parlay_legs pl where pl.parlay_id in (select id from protected_parlay_ids)
  union select va.fixture_id from validation_artifacts va where va.id in (select id from protected_validation_ids) and va.fixture_id is not null
  union select rb.fixture_id from research_bundles rb where rb.id in (select id from protected_bundle_ids)
  union select os.fixture_id from odds_snapshots os where os.id in (select id from protected_snapshot_ids)
), protected_run_ids as (
  select run_id as id from pub where run_id is not null
  union select p.run_id from predictions p where p.id in (select id from protected_prediction_ids) and p.run_id is not null
  union select pa.run_id from parlays pa where pa.id in (select id from protected_parlay_ids) and pa.run_id is not null
  union select va.run_id from validation_artifacts va where va.id in (select id from protected_validation_ids) and va.run_id is not null
  union select rb.run_id from research_bundles rb where rb.id in (select id from protected_bundle_ids) and rb.run_id is not null
), protected_artifact_ids as (
  select sr.artifact_id as id from source_records sr where sr.id in (select id from protected_source_ids) and sr.artifact_id is not null
  union select va.artifact_id from validation_artifacts va where va.id in (select id from protected_validation_ids) and va.artifact_id is not null
  union select a.id from artifacts a where a.run_id in (select id from protected_run_ids)
)
`;
  const union = PUBLISHED_LINEAGE_TABLE_SPECS.map(([name, table, where]) => `
select '${name}'::text as name,
       count(*)::int as row_count,
       coalesce(jsonb_agg(to_jsonb(t) order by t.id::text)::text, '[]') as rows_json
from ${table} t
where ${where}`).join('\nunion all\n');
  return `${cte}${union}`;
}

export async function fingerprintPublishedLineage(client, options = {}) {
  const generatedAt = normalizeDate(options.now ?? new Date()).toISOString();
  const rows = await client.$queryRawUnsafe(buildPublishedLineageFingerprintQuery());
  return buildPublishedLineageFingerprint(rows, generatedAt);
}

export function buildPublishedLineageFingerprint(rows, generatedAt = new Date().toISOString()) {
  const expectedNames = new Set(PUBLISHED_LINEAGE_TABLE_SPECS.map(([name]) => name));
  const receivedNames = new Set(rows.map((row) => String(row.name)));
  const missing = [...expectedNames].filter((name) => !receivedNames.has(name));
  const unexpected = [...receivedNames].filter((name) => !expectedNames.has(name));
  if (missing.length > 0 || unexpected.length > 0 || rows.length !== expectedNames.size) {
    throw new Error(`Invalid published-lineage query result (missing=${missing.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}).`);
  }

  const tables = Object.fromEntries([...rows]
    .sort((left, right) => String(left.name).localeCompare(String(right.name)))
    .map((row) => {
      const rowCount = Number(row.row_count ?? row.rowCount);
      const rowsJson = String(row.rows_json ?? row.rowsJson ?? '');
      if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowsJson.length === 0) {
        throw new Error(`Invalid fingerprint input for ${String(row.name)}.`);
      }
      return [String(row.name), {
        rowCount,
        sha256: sha256(rowsJson),
      }];
    }));
  const rootPublicationCount = tables.publications.rowCount;
  const rowTotal = Object.values(tables).reduce((total, table) => total + table.rowCount, 0);
  const lineageSha256 = sha256(JSON.stringify({ rootPublicationCount, tables }));
  return {
    schemaVersion: 2,
    generatedAt: normalizeDate(generatedAt).toISOString(),
    rootPublicationCount,
    tableCount: Object.keys(tables).length,
    rowTotal,
    lineageSha256,
    tables,
  };
}

export function comparePublishedLineageFingerprints(expected, actual) {
  const expectedTables = expected?.tables && typeof expected.tables === 'object' ? expected.tables : {};
  const actualTables = actual?.tables && typeof actual.tables === 'object' ? actual.tables : {};
  const names = [...new Set([...Object.keys(expectedTables), ...Object.keys(actualTables)])].sort();
  const mismatches = [];
  for (const name of names) {
    const before = expectedTables[name] ?? null;
    const after = actualTables[name] ?? null;
    if (!before || !after || before.rowCount !== after.rowCount || before.sha256 !== after.sha256) {
      mismatches.push({ table: name, expected: before, actual: after });
    }
  }
  if (expected?.rootPublicationCount !== actual?.rootPublicationCount) {
    mismatches.unshift({
      table: '$rootPublicationCount',
      expected: expected?.rootPublicationCount ?? null,
      actual: actual?.rootPublicationCount ?? null,
    });
  }
  return {
    ok: mismatches.length === 0,
    matchedTableCount: names.length - mismatches.filter(({ table }) => table !== '$rootPublicationCount').length,
    comparedTableCount: names.length,
    mismatches,
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('generatedAt must be a valid date.');
  return date;
}
