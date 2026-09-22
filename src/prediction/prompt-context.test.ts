import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRealWebSourceRecord, selectResearchPromptQuotes, selectScoringPromptQuotes, toAllowedQuote } from './prompt-context.js';
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
    assert.equal(isRealWebSourceRecord(source({ externalId: 'web-search:source-1' })), false);
    assert.equal(isRealWebSourceRecord(source({ externalId: 'https://example.com/report' })), true);
    assert.equal(isRealWebSourceRecord(source({ url: 'file:///tmp/source' })), false);
  });

  it('keeps every market when a large goals ladder exceeds the scoring budget', () => {
    const quotes = [
      ...Array.from({ length: 100 }, (_, i) => quote({ id: `goals-${i}`, marketKey: 'goals_over_under', selectionKey: i % 2 ? 'over' : 'under', line: i / 4 })),
      quote({ id: 'h2h', marketKey: 'h2h' }),
      quote({ id: 'dc', marketKey: 'double_chance', selectionKey: 'home_draw' }),
      quote({ id: 'btts', marketKey: 'btts', selectionKey: 'yes' }),
      quote({ id: 'corners', marketKey: 'corners_over_under', selectionKey: 'under', line: 9.5 }),
    ];
    const selected = selectScoringPromptQuotes(quotes, 10);
    assert.equal(selected.length, 10);
    assert.deepEqual(new Set(selected.map((q) => q.marketKey)), new Set(quotes.map((q) => q.marketKey)));
    assert.deepEqual(selected, selectScoringPromptQuotes([...quotes].reverse(), 10));
    assert.deepEqual(selectScoringPromptQuotes(quotes, 0), []);
  });

  it('deduplicates bookmaker repetition before balancing research markets', () => {
    const quotes = Array.from({ length: 50 }, (_, index) => ({
      fixtureId: 'fixture', market: 'h2h' as const, selection: 'home', price: 1.6 + index / 100,
      impliedProbability: 0.5, bookmaker: `book-${index}`, capturedAt: '2026-09-22T00:00:00Z', sourceSnapshotId: 'snapshot',
    }));
    const btts = { ...quotes[0], market: 'btts' as const, selection: 'yes', price: 1.8 };
    const selected = selectResearchPromptQuotes([...quotes, btts]);
    assert.equal(selected.length, 2);
    assert.equal(selected[0].price, 2.09);
    assert.equal(selected[1].market, 'btts');
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
