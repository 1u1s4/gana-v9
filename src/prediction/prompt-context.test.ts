import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRealWebSourceRecord, selectScoringPromptQuotes, toAllowedQuote } from './prompt-context.js';
import type { OddsQuoteRecord, SourceRecordRecord } from '../storage/types.js';

describe('prediction prompt context', () => {
  it('deduplicates prompt quotes by market, selection, and line using the best price', () => {
    const quotes = [
      quote({ id: 'low', marketKey: 'h2h', selectionKey: 'home', price: 1.7 }),
      quote({ id: 'high', marketKey: 'h2h', selectionKey: 'home', price: 1.9 }),
      quote({ id: 'away', marketKey: 'h2h', selectionKey: 'away', price: 2.1 }),
    ];

    const selected = selectScoringPromptQuotes(quotes, 10);

    assert.deepEqual(selected.map((item) => item.id), ['away', 'high']);
    assert.equal(toAllowedQuote(selected[1]).odds, 1.9);
  });

  it('ignores synthesized web-search sources when checking live research coverage', () => {
    assert.equal(isRealWebSourceRecord(source({ id: 'real', url: 'https://example.com/report' })), true);
    assert.equal(isRealWebSourceRecord(source({ id: 'synthetic', url: 'https://example.com/report', metadata: { synthesized: true } })), false);
    assert.equal(isRealWebSourceRecord(source({ id: 'missing-url' })), false);
  });
});

function quote(overrides: Partial<OddsQuoteRecord>): OddsQuoteRecord {
  return {
    id: 'quote',
    fixtureId: 'fixture',
    snapshotId: 'snapshot',
    bookmaker: 'book',
    marketKey: 'h2h',
    selectionKey: 'home',
    line: null,
    price: 1.8,
    impliedProbability: 0.55,
    marketImpliedProbability: null,
    marketFairProbability: null,
    consensusFairOdds: null,
    overround: null,
    marketEfficiencyScore: null,
    capturedAt: new Date('2026-06-12T12:00:00.000Z'),
    metadata: null,
    ...overrides,
  } as OddsQuoteRecord;
}

function source(overrides: Partial<SourceRecordRecord>): SourceRecordRecord {
  return {
    id: 'source',
    bundleId: 'bundle',
    fixtureId: 'fixture',
    sourceType: 'web-search',
    url: null,
    title: null,
    externalId: null,
    providerSnapshotId: null,
    capturedAt: new Date('2026-06-12T12:00:00.000Z'),
    metadata: null,
    ...overrides,
  } as SourceRecordRecord;
}
