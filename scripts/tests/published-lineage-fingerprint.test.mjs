import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PUBLISHED_LINEAGE_TABLE_SPECS,
  buildPublishedLineageFingerprint,
  buildPublishedLineageFingerprintQuery,
  comparePublishedLineageFingerprints,
  fingerprintPublishedLineage,
} from '../lib/published-lineage-fingerprint.mjs';

describe('published recommendation lineage fingerprint', () => {
  it('selects all 19 publication-protected lineage categories including JSON references', () => {
    const sql = buildPublishedLineageFingerprintQuery();
    assert.equal(PUBLISHED_LINEAGE_TABLE_SPECS.length, 19);
    assert.match(sql, /public_recommendation_publications/);
    assert.match(sql, /published.*prediction|seed_prediction_ids/s);
    assert.match(sql, /metadata ->> 'oddsSnapshotId'/);
    assert.match(sql, /metadata ->> 'snapshotId'/);
    assert.match(sql, /metadata ->> 'resultProviderSnapshotId'/);
    assert.match(sql, /jsonb_agg\(to_jsonb\(t\) order by t\.id::text\)/);
    for (const [, table] of PUBLISHED_LINEAGE_TABLE_SPECS) assert.match(sql, new RegExp(`from ${table} t`));
  });

  it('is deterministic regardless of query result order and excludes generatedAt from the lineage digest', () => {
    const rows = fakeRows();
    const first = buildPublishedLineageFingerprint(rows, '2026-07-14T00:00:00.000Z');
    const second = buildPublishedLineageFingerprint([...rows].reverse(), '2026-07-15T00:00:00.000Z');
    assert.equal(first.tableCount, 19);
    assert.equal(first.rowTotal, 19);
    assert.equal(first.rootPublicationCount, 1);
    assert.equal(first.lineageSha256, second.lineageSha256);
    assert.deepEqual(first.tables, second.tables);
    assert.notEqual(first.generatedAt, second.generatedAt);
  });

  it('uses exactly one read-only CTE query and hashes its returned canonical JSON', async () => {
    const queries = [];
    const client = {
      $queryRawUnsafe: async (sql) => {
        queries.push(sql);
        return fakeRows();
      },
    };
    const result = await fingerprintPublishedLineage(client, { now: new Date('2026-07-14T12:00:00.000Z') });
    assert.equal(queries.length, 1);
    assert.match(queries[0].trimStart(), /^with pub as/i);
    assert.doesNotMatch(queries[0], /\b(insert|update|delete|truncate|alter|drop|create)\b/i);
    assert.equal(result.generatedAt, '2026-07-14T12:00:00.000Z');
  });

  it('compares v1 and v2 artifacts using root count plus per-table row counts and hashes', () => {
    const actual = buildPublishedLineageFingerprint(fakeRows(), '2026-07-14T00:00:00.000Z');
    const v1 = { schemaVersion: 1, rootPublicationCount: actual.rootPublicationCount, tables: actual.tables };
    assert.deepEqual(comparePublishedLineageFingerprints(v1, actual), {
      ok: true,
      matchedTableCount: 19,
      comparedTableCount: 19,
      mismatches: [],
    });
    const changed = structuredClone(actual);
    changed.tables.predictions.rowCount += 1;
    const comparison = comparePublishedLineageFingerprints(v1, changed);
    assert.equal(comparison.ok, false);
    assert.deepEqual(comparison.mismatches.map(({ table }) => table), ['predictions']);
  });
});

function fakeRows() {
  return PUBLISHED_LINEAGE_TABLE_SPECS.map(([name], index) => ({
    name,
    row_count: 1,
    rows_json: JSON.stringify([{ id: String(index).padStart(2, '0'), name }]),
  }));
}
