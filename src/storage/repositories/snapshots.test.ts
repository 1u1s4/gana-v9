import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createOddsSnapshotRepository,
  createProviderSnapshotRepository,
  oddsQuoteContentHash,
  oddsSnapshotDedupeKey,
  providerSnapshotDedupeKey,
} from './snapshots.js';

const firstSeen = new Date('2026-07-14T10:00:00.000Z');
const lastSeen = new Date('2026-07-14T11:00:00.000Z');

describe('snapshot content deduplication', () => {
  it('keys provider content by payload and request while ignoring observation-only fields', () => {
    const base = {
      providerId: 'provider-1',
      endpointName: 'odds',
      requestHash: 'request-hash',
      payloadHash: 'payload-hash',
      capturedAt: firstSeen,
      quotaMetadata: { remaining: 99 },
    };

    assert.equal(providerSnapshotDedupeKey(base), providerSnapshotDedupeKey({
      ...base,
      capturedAt: lastSeen,
      quotaMetadata: { remaining: 98 },
    }));
    assert.notEqual(providerSnapshotDedupeKey(base), providerSnapshotDedupeKey({
      ...base,
      payloadHash: 'changed-payload',
    }));
    assert.notEqual(providerSnapshotDedupeKey(base), providerSnapshotDedupeKey({
      ...base,
      runId: 'provenance-bearing-run',
    }));
    assert.equal(providerSnapshotDedupeKey({ ...base, payloadHash: null }), undefined);
  });

  it('atomically reuses provider content and advances last-seen counters', async () => {
    const calls: any[] = [];
    const db: any = {
      providerSnapshot: {
        upsert: async (args: any) => {
          calls.push(args);
          return { id: 'provider-snapshot-1', ...args.create };
        },
        create: async () => {
          throw new Error('create should not be used for hash-addressable content');
        },
      },
    };

    await createProviderSnapshotRepository(db).create({
      providerId: 'provider-1',
      endpointName: 'odds',
      requestHash: 'request-hash',
      payloadHash: 'payload-hash',
      capturedAt: lastSeen,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].create.lastSeenAt, lastSeen);
    assert.deepEqual(calls[0].update.observationCount, { increment: 1 });
    assert.equal(calls[0].update.lastSeenAt, lastSeen);
  });

  it('dedupes only exact normalized odds content and ignores observation timestamps', () => {
    const quote = {
      fixtureId: 'fixture-1',
      bookmaker: 'book',
      marketKey: 'h2h',
      selectionKey: 'home',
      price: 1.75,
      capturedAt: firstSeen,
      metadata: { sourceSnapshotId: 'observation-1', lowLiquidity: false },
    };
    const input = {
      snapshot: {
        fixtureId: 'fixture-1',
        providerFixtureId: '1001',
        payloadHash: 'payload-hash',
        capturedAt: firstSeen,
      },
      quotes: [quote],
    };

    const repeated = {
      ...input,
      snapshot: { ...input.snapshot, capturedAt: lastSeen },
      quotes: [{
        ...quote,
        capturedAt: lastSeen,
        metadata: { sourceSnapshotId: 'observation-2', lowLiquidity: false },
      }],
    };

    assert.equal(oddsQuoteContentHash(quote), oddsQuoteContentHash(repeated.quotes[0]));
    assert.equal(oddsSnapshotDedupeKey(input), oddsSnapshotDedupeKey(repeated));
    assert.notEqual(oddsQuoteContentHash(quote), oddsQuoteContentHash({ ...quote, price: 1.76 }));
    assert.notEqual(oddsSnapshotDedupeKey(input), oddsSnapshotDedupeKey({
      ...input,
      quotes: [{ ...quote, price: 1.76 }],
    }));
  });

  it('upserts an unchanged odds snapshot and inserts quotes with exact content hashes', async () => {
    const snapshotUpserts: any[] = [];
    const quoteBatches: any[] = [];
    const db: any = {
      oddsSnapshot: {
        upsert: async (args: any) => {
          snapshotUpserts.push(args);
          return { id: 'odds-snapshot-1', ...args.create };
        },
        create: async () => {
          throw new Error('create should not be used for hash-addressable content');
        },
      },
      oddsQuote: {
        createMany: async (args: any) => {
          quoteBatches.push(args);
          return { count: args.data.length };
        },
      },
      $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
    };

    const input = {
      snapshot: {
        fixtureId: 'fixture-1',
        providerFixtureId: '1001',
        payloadHash: 'payload-hash',
        capturedAt: lastSeen,
      },
      quotes: [{
        fixtureId: 'fixture-1',
        bookmaker: 'book',
        marketKey: 'h2h',
        selectionKey: 'home',
        price: 1.75,
      }],
    };

    await createOddsSnapshotRepository(db).createWithQuotes(input);

    assert.equal(snapshotUpserts.length, 1);
    assert.deepEqual(snapshotUpserts[0].update.observationCount, { increment: 1 });
    assert.equal(quoteBatches.length, 1);
    assert.equal(quoteBatches[0].skipDuplicates, true);
    assert.equal(quoteBatches[0].data[0].snapshotId, 'odds-snapshot-1');
    assert.match(quoteBatches[0].data[0].contentHash, /^[0-9a-f]{64}$/);
  });
});
