import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  CAPACITY_HARD_BYTES,
  CAPACITY_WARNING_BYTES,
  HISTORY_POST_RAW_RETENTION_TARGETS,
  HISTORY_PRE_RAW_RETENTION_TARGETS,
  HISTORY_RETENTION_TABLES,
  HISTORY_RETENTION_TARGETS,
  NEVER_DELETE_TABLES,
  PAYLOAD_COMPACTION_TARGETS,
  RAW_RETENTION_TARGETS,
  RETENTION_EXECUTION_ORDER,
  buildDatabaseSizeQuery,
  buildHistoryRetentionReportQuery,
  buildPayloadCompactionReportQuery,
  buildPayloadCompactionUpdateQuery,
  buildQuotaConsolidateDeleteQuery,
  buildQuotaRetentionReportQuery,
  buildRetentionDeleteQuery,
  buildRetentionReportQuery,
  buildTopIndexSizesQuery,
  buildTopTableSizesQuery,
  inspectDatabaseCapacity,
  parseRawRetentionOptions,
  payloadCompactionCutoffs,
  retentionCutoff,
  retentionCutoffs,
  runRawRetention,
  validateRetentionPlan,
} from '../lib/raw-data-retention.mjs';

describe('bounded data retention', () => {
  it('defaults to tiered 7/14/30/60-day retention with destructive bounds', () => {
    const options = parseRawRetentionOptions([], {});
    assert.equal(options.mode, 'dry-run');
    assert.equal(options.retentionDays, 7);
    assert.equal(options.transientRetentionDays, 7);
    assert.equal(options.researchRetentionDays, 14);
    assert.equal(options.analyticRetentionDays, 30);
    assert.equal(options.historyRetentionDays, 60);
    assert.equal(options.batchSize, 1_000);
    assert.throws(() => parseRawRetentionOptions(['--apply', '--dry-run'], {}), /either/);
    assert.throws(() => parseRawRetentionOptions(['--apply', '--retention-days', '6'], {}), /between 7/);
    assert.throws(() => parseRawRetentionOptions(['--retention-days=8'], {}), /between 7 and 7/);
    assert.throws(() => parseRawRetentionOptions(['--transient-retention-days=8'], {}), /between 7 and 7/);
    assert.throws(() => parseRawRetentionOptions(['--research-retention-days=15'], {}), /between 7 and 14/);
    assert.throws(() => parseRawRetentionOptions(['--analytic-retention-days=31'], {}), /between 30 and 30/);
    assert.throws(() => parseRawRetentionOptions(['--batch-size=10001'], {}), /between 1 and 10000/);
    assert.throws(() => parseRawRetentionOptions(['--analytic-retention-days=29'], {}), /between 30 and 30/);
    assert.throws(() => parseRawRetentionOptions(['--analytic-retention-days=61'], {}), /between 30 and 30/);
    assert.throws(() => parseRawRetentionOptions(['--history-retention-days=61'], {}), /between 30 and 60/);
    assert.throws(
      () => parseRawRetentionOptions(['--research-retention-days=14', '--analytic-retention-days=30', '--history-retention-days=29'], {}),
      /between 30 and 60/,
    );
  });

  it('calculates absolute UTC cutoffs', () => {
    const now = new Date('2026-07-14T12:00:00.000Z');
    assert.equal(retentionCutoff(now, 7).toISOString(), '2026-07-07T12:00:00.000Z');
    assert.equal(retentionCutoff(now, 60).toISOString(), '2026-05-15T12:00:00.000Z');
    const cutoffs = retentionCutoffs(now, parseRawRetentionOptions([], {}));
    assert.equal(cutoffs.transient.toISOString(), '2026-07-07T12:00:00.000Z');
    assert.equal(cutoffs.research.toISOString(), '2026-06-30T12:00:00.000Z');
    assert.equal(cutoffs.analytic.toISOString(), '2026-06-14T12:00:00.000Z');
    assert.equal(cutoffs.history.toISOString(), '2026-05-15T12:00:00.000Z');
    const payloadCutoffs = payloadCompactionCutoffs(now, parseRawRetentionOptions([], {}));
    assert.equal(payloadCutoffs.immediate.toISOString(), now.toISOString());
    assert.equal(payloadCutoffs.payload.toISOString(), '2026-07-07T12:00:00.000Z');
    assert.equal(payloadCutoffs.blob.toISOString(), '2026-06-30T12:00:00.000Z');
  });

  it('protects relational and legacy JSON references in raw report/delete SQL', () => {
    const sql = RAW_RETENTION_TARGETS.flatMap((target) => [
      buildRetentionReportQuery(target),
      buildRetentionDeleteQuery(target),
    ]).join('\n');

    assert.match(sql, /predictions p where p\.odds_quote_id = oq\.id/);
    assert.match(sql, /predictions p where p\.odds_snapshot_id = os\.id/);
    assert.match(sql, /low_odds_hits loh where loh\.odds_quote_id = oq\.id/);
    assert.match(sql, /sr\.provider_snapshot_id = ps\.id/);
    assert.match(sql, /metadata ->> 'oddsSnapshotId'/);
    assert.match(sql, /metadata ->> 'snapshotId'/);
    assert.match(sql, /validation_artifacts va/);
    assert.match(sql, /va\.metadata ->> 'resultProviderSnapshotId' = ps\.id::text/);
    assert.match(sql, /current_timestamp - interval '24 hours'/);
    assert.match(sql, /newer\.fixture_id = os\.fixture_id/);
    assert.match(sql, /\(newer\.last_seen_at, newer\.id\) > \(os\.last_seen_at, os\.id\)/);
    assert.match(sql, /for update of .* skip locked/i);
  });

  it('consolidates quota samples by UTC natural key before deleting the locked batch', () => {
    const reportSql = buildQuotaRetentionReportQuery();
    const applySql = buildQuotaConsolidateDeleteQuery();

    assert.match(reportSql, /sampled_at at time zone 'UTC'/);
    assert.match(reportSql, /aggregate_group_count/);
    assert.match(applySql, /for update of pqs skip locked/i);
    assert.match(applySql, /insert into provider_quota_daily/);
    assert.match(applySql, /on conflict \(metric_date, provider_code, endpoint_name, status\)/);
    assert.match(applySql, /daily\.response_ms_sample_count \+ excluded\.response_ms_sample_count/);
    assert.match(applySql, /using candidates, upsert_guard/);
    assert.match(applySql, /upsert_guard\.aggregate_group_count > 0/);
    assert.ok(applySql.indexOf('insert into provider_quota_daily') < applySql.indexOf('delete from provider_quota_samples'));
  });

  it('compacts only optional non-published payloads in bounded idempotent updates', () => {
    const reportSql = PAYLOAD_COMPACTION_TARGETS
      .map((target) => buildPayloadCompactionReportQuery(target))
      .join('\n');
    const applySql = PAYLOAD_COMPACTION_TARGETS
      .map((target) => buildPayloadCompactionUpdateQuery(target))
      .join('\n');

    assert.equal(PAYLOAD_COMPACTION_TARGETS.length, 10);
    assert.match(reportSql, /predictions p where p\.odds_quote_id = oq\.id/);
    assert.ok(reportSql.includes('public_recommendation_publications pub'));
    assert.match(reportSql, /lineage_snapshot\.provider_snapshot_id = ps\.id/);
    assert.match(reportSql, /lineage_source\.metadata ->> 'snapshotId'/);
    assert.match(reportSql, /va\.metadata ->> 'resultProviderSnapshotId' = ps\.id::text/);
    assert.match(reportSql, /va\.fixture_id = f\.id/);
    assert.match(applySql, /for update of .* skip locked/i);
    assert.match(applySql, /update predictions target\s+set warnings = null, evidence_ids = null, included_by_filters = null, metadata = null/i);
    assert.doesNotMatch(applySql, /updated_at\s*=/i);
    assert.doesNotMatch(applySql, /\boutcome\s*=\s*null/i);
  });

  it('preserves published source lineage for odds snapshot and quote payloads', () => {
    const quote = PAYLOAD_COMPACTION_TARGETS.find((target) => target.key === 'oddsQuoteMetadata');
    const snapshot = PAYLOAD_COMPACTION_TARGETS.find((target) => target.key === 'oddsSnapshotMetadata');
    assert.ok(quote);
    assert.ok(snapshot);

    const quoteSql = buildPayloadCompactionReportQuery(quote);
    const snapshotSql = buildPayloadCompactionReportQuery(snapshot);
    assert.match(quoteSql, /lineage_source\.metadata ->> 'oddsSnapshotId' = \(oq\.snapshot_id\)::text/);
    assert.match(snapshotSql, /lineage_source\.metadata ->> 'oddsSnapshotId' = \(os\.id\)::text/);
    assert.match(quoteSql, /lineage_prediction\.research_bundle_id = lineage_source\.bundle_id/);
    assert.match(snapshotSql, /lineage_prediction\.research_bundle_id = lineage_source\.bundle_id/);
    assert.match(quoteSql, /public_recommendation_publications pub/);
    assert.match(snapshotSql, /public_recommendation_publications pub/);
  });

  it('indexes each JSON/cursor compatibility guard used by retention', () => {
    const migration = readFileSync(new URL(
      '../../prisma/migrations/20260714183000_tune_retention_autovacuum/migration.sql',
      import.meta.url,
    ), 'utf8');
    const companion = readFileSync(new URL('../../prisma/postgres/retention.sql', import.meta.url), 'utf8');
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const sourceTarget = HISTORY_RETENTION_TARGETS.find((target) => target.key === 'sourceRecords');

    assert.equal(sourceTarget?.orderBy, 'sr.captured_at, sr.id');
    assert.match(migration, /drop index if exists "gana_ops"\."source_records_retention_created_id_idx"/i);
    assert.match(migration, /source_records_retention_captured_id_idx"\s+on "gana_ops"\."source_records" \("captured_at", "id"\)/i);
    assert.match(migration, /validation_artifacts_metadata_result_provider_snapshot_id_idx"[\s\S]+metadata" ->> 'resultProviderSnapshotId'[\s\S]+metadata" \? 'resultProviderSnapshotId'/i);
    assert.match(companion, /source_records_retention_captured_id_idx\s+on source_records \(captured_at, id\)/i);
    assert.match(companion, /validation_artifacts_metadata_result_provider_snapshot_id_idx[\s\S]+metadata ->> 'resultProviderSnapshotId'/i);
    assert.match(schema, /@@index\(\[capturedAt, id\], map: "source_records_retention_captured_id_idx"\)/);
    assert.doesNotMatch(schema, /@@index\(\[createdAt, id\], map: "source_records_retention_created_id_idx"\)/);
  });

  it('covers the complete history closure and excludes catalogs, presets and current state', () => {
    assert.deepEqual(HISTORY_RETENTION_TABLES, [
      'public_recommendation_publications',
      'validation_artifacts',
      'leaderboard_entries',
      'daily_metrics',
      'approval_requests',
      'audit_logs',
      'low_odds_hits',
      'parlay_legs',
      'claims',
      'evidence_items',
      'predictions',
      'parlays',
      'source_records',
      'research_bundles',
      'low_odds_scans',
      'artifacts',
      'gambeta_pick_snapshots',
      'provider_quota_daily',
      'harness_tasks',
      'fixtures',
      'harness_runs',
      'gambeta_scrape_runs',
    ]);
    assert.deepEqual(NEVER_DELETE_TABLES, [
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
    assert.equal(validateRetentionPlan().targetCount, 26);
    assert.equal(validateRetentionPlan().compactionTargetCount, 10);
    assert.equal(HISTORY_RETENTION_TARGETS.find((target) => target.key === 'publicRecommendationPublications').retentionClass, 'history');
    assert.equal(HISTORY_RETENTION_TARGETS.find((target) => target.key === 'validationArtifacts').retentionClass, 'research');
    assert.equal(HISTORY_RETENTION_TARGETS.find((target) => target.key === 'predictions').retentionClass, 'analytic');
    assert.equal(HISTORY_RETENTION_TARGETS.find((target) => target.key === 'lowOddsHits').retentionClass, 'transient');
    assert.equal(new Set(RETENTION_EXECUTION_ORDER).size, RETENTION_EXECUTION_ORDER.length);
    assert.equal(RETENTION_EXECUTION_ORDER[0], 'publicRecommendationPublications');
    assert.ok(RETENTION_EXECUTION_ORDER.indexOf('parlayLegs') < RETENTION_EXECUTION_ORDER.indexOf('predictions'));
    assert.ok(RETENTION_EXECUTION_ORDER.indexOf('sourceRecords') < RETENTION_EXECUTION_ORDER.indexOf('researchBundles'));
    assert.ok(RETENTION_EXECUTION_ORDER.indexOf('providerQuotaSamples') < RETENTION_EXECUTION_ORDER.indexOf('providerQuotaDaily'));
    assert.ok(RETENTION_EXECUTION_ORDER.indexOf('providerSnapshots') < RETENTION_EXECUTION_ORDER.indexOf('harnessTasks'));
    assert.ok(RETENTION_EXECUTION_ORDER.indexOf('harnessTasks') < RETENTION_EXECUTION_ORDER.indexOf('harnessRuns'));
  });

  it('protects Gambeta snapshots while their run backs current picks or stats', () => {
    const target = HISTORY_RETENTION_TARGETS.find((item) => item.key === 'gambetaPickSnapshots');
    assert.ok(target);

    const reportSql = buildHistoryRetentionReportQuery(target);
    const deleteSql = buildRetentionDeleteQuery(target);
    for (const sql of [reportSql, deleteSql]) {
      assert.match(sql, /gambeta_current_picks gcp where gcp\.run_id = gps\.run_id/);
      assert.match(sql, /gambeta_current_stats gcs where gcs\.run_id = gps\.run_id/);
    }
    assert.match(reportSql, /reference_blocked/);
    assert.match(deleteSql, /not \([\s\S]*gcp\.run_id = gps\.run_id[\s\S]*gcs\.run_id = gps\.run_id[\s\S]*\)/);
  });

  it('deletes old publications and blocks old parents while retained children or public lineage remain', () => {
    const sql = HISTORY_RETENTION_TARGETS.flatMap((target) => [
      buildHistoryRetentionReportQuery(target),
      buildRetentionDeleteQuery(target),
    ]).join('\n');

    assert.match(sql, /delete from public_recommendation_publications target/);
    assert.match(sql, /pub\.published_at < \$1/);
    assert.match(sql, /pub\.target_type = 'prediction' and pub\.target_id = p\.id::text/);
    assert.match(sql, /pub\.target_type = 'parlay' and pub\.target_id = pa\.id::text/);
    assert.match(sql, /evidence_items ei where ei\.source_id = sr\.id/);
    assert.match(sql, /predictions p where p\.research_bundle_id = rb\.id/);
    assert.match(sql, /provider_snapshots ps where ps\.task_id = ht\.id/);
    assert.match(sql, /gambeta_current_picks gcp where gcp\.run_id = gsr\.id/);
    assert.match(sql, /reference_blocked/);
    assert.match(sql, /blocked_row_count/);
    assert.match(sql, /for update of .* skip locked/i);
    for (const table of NEVER_DELETE_TABLES) {
      assert.doesNotMatch(sql, new RegExp(`delete from ${table} target`));
    }
  });

  it('reports database capacity plus top tables and indexes at warning thresholds', async () => {
    const queries = [];
    const client = {
      $queryRawUnsafe: async (sql) => {
        queries.push(sql);
        if (sql.includes('pg_database_size')) return [{ database_bytes: String(CAPACITY_WARNING_BYTES) }];
        if (sql.includes('pg_stat_user_indexes')) {
          return [{ schema_name: 'public', table_name: 'predictions', index_name: 'predictions_pkey', index_bytes: '2048' }];
        }
        return [{ schema_name: 'public', table_name: 'predictions', table_bytes: '4096', index_bytes: '2048', total_bytes: '6144' }];
      },
    };

    const result = await inspectDatabaseCapacity(client);
    assert.equal(result.status, 'warning');
    assert.equal(result.databaseBytes, CAPACITY_WARNING_BYTES);
    assert.equal(result.topTables[0].totalBytes, 6144);
    assert.equal(result.topIndexes[0].indexBytes, 2048);
    assert.deepEqual(queries, [buildDatabaseSizeQuery(), buildTopTableSizesQuery(), buildTopIndexSizesQuery()]);
  });

  it('never opens a transaction or deletes in dry-run mode', async () => {
    let reports = 0;
    const client = {
      $queryRawUnsafe: async (sql) => {
        reports += 1;
        assert.doesNotMatch(sql, /delete from/i);
        if (sql.includes('pg_database_size')) return [{ database_bytes: String(CAPACITY_WARNING_BYTES - 1) }];
        if (sql.includes('pg_stat_user_indexes')) {
          return [{ schema_name: 'public', table_name: 'odds_quotes', index_name: 'odds_quotes_pkey', index_bytes: '32' }];
        }
        if (sql.includes('from pg_class cls')) {
          return [{ schema_name: 'public', table_name: 'odds_quotes', table_bytes: '64', index_bytes: '32', total_bytes: '96' }];
        }
        if (sql.includes('blocked_row_count')) {
          return [{
            row_count: '3',
            estimated_bytes: '192',
            blocked_row_count: '1',
            blocked_estimated_bytes: '64',
          }];
        }
        if (sql.includes('provider_quota_samples')) {
          return [{ row_count: '2', estimated_bytes: '128', aggregate_group_count: '1' }];
        }
        return [{ row_count: '2', estimated_bytes: '128' }];
      },
      $transaction: async () => {
        throw new Error('dry-run must not open a deleting transaction');
      },
    };

    const result = await runRawRetention(
      client,
      parseRawRetentionOptions([], {}),
      new Date('2026-07-14T12:00:00.000Z'),
    );

    assert.equal(reports, 39);
    assert.equal(result.schemaVersion, 5);
    assert.equal(result.before.totals.rowCount, 8);
    assert.equal(result.before.totals.estimatedBytes, 512);
    assert.equal(result.before.targets.providerQuotaSamples.aggregateGroupCount, 1);
    assert.equal(result.historyBefore.totals.rowCount, HISTORY_RETENTION_TARGETS.length * 3);
    assert.equal(result.historyBefore.blockedTotals.rowCount, HISTORY_RETENTION_TARGETS.length);
    assert.equal(result.compactionBefore.totals.rowCount, PAYLOAD_COMPACTION_TARGETS.length * 2);
    assert.equal(result.capacityBefore.status, 'ok');
    assert.equal(result.capacityBefore.topTables[0].table, 'odds_quotes');
    assert.equal(result.deleted, undefined);
    assert.equal(result.historyDeleted, undefined);
  });

  it('deletes in FK-safe phase order, bounded short transactions, and remains rerunnable', async () => {
    let applied = false;
    const deleteCalls = new Map();
    const settings = [];
    const deleteTargets = [...HISTORY_RETENTION_TARGETS, ...RAW_RETENTION_TARGETS];
    const tx = {
      $executeRawUnsafe: async (sql) => settings.push(sql),
      $queryRawUnsafe: async (sql, _cutoff, batchSize) => {
        assert.equal(batchSize, 2);
        const target = sql.includes('insert into provider_quota_daily')
          ? { key: 'providerQuotaSamples' }
          : deleteTargets.find((item) => sql.includes(`delete from ${item.table} target`))
            ?? PAYLOAD_COMPACTION_TARGETS.find((item) => sql.includes(`update ${item.table} target`));
        assert.ok(target, sql);
        const count = deleteCalls.get(target.key) ?? 0;
        deleteCalls.set(target.key, count + 1);
        return count === 0
          ? [{ row_count: '2', estimated_bytes: '256', aggregate_group_count: '1' }]
          : [{ row_count: '0', estimated_bytes: '0', aggregate_group_count: '0' }];
      },
    };
    const client = {
      $queryRawUnsafe: async (sql) => {
        if (sql.includes('pg_database_size')) return [{ database_bytes: String(CAPACITY_HARD_BYTES + 1) }];
        if (sql.includes('pg_stat_user_indexes')) return [];
        if (sql.includes('from pg_class cls')) return [];
        if (sql.includes('blocked_row_count')) {
          return [{
            row_count: applied ? '0' : '2',
            estimated_bytes: applied ? '0' : '256',
            blocked_row_count: '1',
            blocked_estimated_bytes: '128',
          }];
        }
        return [{
          row_count: applied ? '0' : '2',
          estimated_bytes: applied ? '0' : '256',
          aggregate_group_count: applied ? '0' : '1',
        }];
      },
      $transaction: async (fn) => {
        const result = await fn(tx);
        if ([...deleteCalls.values()].filter((count) => count >= 2).length === RETENTION_EXECUTION_ORDER.length) {
          applied = true;
        }
        return result;
      },
    };

    const result = await runRawRetention(client, {
      ...parseRawRetentionOptions(['--apply', '--batch-size', '2'], {}),
      maxBatches: 10,
    }, new Date('2026-07-14T12:00:00.000Z'));

    assert.equal(result.deleted.totals.rowCount, 8);
    assert.equal(result.deleted.targets.providerQuotaSamples.aggregateGroupCount, 1);
    assert.equal(result.historyDeleted.totals.rowCount, HISTORY_RETENTION_TARGETS.length * 2);
    assert.equal(result.compacted.totals.rowCount, PAYLOAD_COMPACTION_TARGETS.length * 2);
    assert.equal(result.after.totals.rowCount, 0);
    assert.equal(result.historyAfter.totals.rowCount, 0);
    assert.equal(result.historyAfter.blockedTotals.rowCount, HISTORY_RETENTION_TARGETS.length);
    assert.equal(result.compactionAfter.totals.rowCount, 0);
    assert.equal(result.capacityBefore.status, 'critical');
    assert.equal(result.capacityAfter.status, 'critical');
    assert.match(result.capacityBefore.criticalAction, /Continue bounded retention/);
    assert.deepEqual([...deleteCalls.keys()], RETENTION_EXECUTION_ORDER);
    assert.equal(settings.filter((sql) => /statement_timeout/.test(sql)).length, RETENTION_EXECUTION_ORDER.length * 2);
    assert.equal(settings.filter((sql) => /lock_timeout/.test(sql)).length, RETENTION_EXECUTION_ORDER.length * 2);
    assert.equal(HISTORY_PRE_RAW_RETENTION_TARGETS.length + HISTORY_POST_RAW_RETENTION_TARGETS.length, HISTORY_RETENTION_TARGETS.length);
  });

  it('rejects direct calls that bypass option parsing guards', async () => {
    const client = { $queryRawUnsafe: async () => [] };
    await assert.rejects(
      runRawRetention(client, {
        ...parseRawRetentionOptions([], {}),
        mode: 'unsafe',
      }),
      /Invalid retention mode/,
    );
    for (const [override, error] of [
      [{ retentionDays: 8 }, /between 7 and 7/],
      [{ transientRetentionDays: 8 }, /between 7 and 7/],
      [{ researchRetentionDays: 15 }, /between 7 and 14/],
      [{ analyticRetentionDays: 31 }, /between 30 and 30/],
    ]) {
      await assert.rejects(
        runRawRetention(client, {
          ...parseRawRetentionOptions([], {}),
          ...override,
        }),
        error,
      );
    }
  });
});
