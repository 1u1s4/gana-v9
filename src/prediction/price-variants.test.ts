import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OddsQuoteRecord } from '../storage/types.js';
import { selectScoringPromptQuotes } from './prompt-context.js';
import { selectLowOddsPriceVariantQuote } from './price-variants.js';

const quote = (id: string, price: number, overrides: Partial<OddsQuoteRecord> = {}) => ({
  id, price, fixtureId: 'fixture', snapshotId: 'snapshot', marketKey: 'h2h', selectionKey: 'home',
  line: null, bookmaker: 'Bet365', capturedAt: new Date('2026-09-22T12:00:00Z'), ...overrides,
}) as OddsQuoteRecord;

describe('strict price variants', () => {
  for (const [low, high, selection] of [[1.07, 1.12, 'away'], [1.09, 1.11, 'home']] as const) {
    it(`retains selectable ${low} without changing the general ${high} quote`, () => {
      const quotes = [quote('strict', low, { selectionKey: selection }), quote('best', high, { selectionKey: selection })];
      const [best] = selectScoringPromptQuotes(quotes);
      assert.equal(best.id, 'best');
      assert.equal(selectLowOddsPriceVariantQuote(best, quotes, ['Bet365'])?.id, 'strict');
    });
  }

  it('requires a real matching selectable quote, obeys whitelist, and picks the best strict price', () => {
    const best = quote('best', 1.12);
    const quotes = [
      best, quote('lower', 1.04), quote('strict', 1.07), quote('boundary', 1.1), quote('invalid', 1),
      quote('reference-only-book', 1.09, { bookmaker: 'Unlisted' }),
      quote('other-snapshot', 1.099, { snapshotId: 'old-snapshot' }),
      quote('other-fixture', 1.099, { fixtureId: 'other-fixture' }),
      quote('other-side', 1.099, { selectionKey: 'away' }),
      quote('draw', 1.099, { selectionKey: 'draw' }),
      quote('dc', 1.099, { marketKey: 'double_chance', selectionKey: 'home_or_draw' }),
    ];
    assert.equal(selectLowOddsPriceVariantQuote(best, quotes, ['Bet365'])?.id, 'strict');
    assert.equal(selectLowOddsPriceVariantQuote(best, [best, quote('boundary', 1.1)], ['Bet365']), undefined);
    assert.equal(selectLowOddsPriceVariantQuote(best, [best, quote('outside', 1.08, { bookmaker: 'Unlisted' })], ['Bet365']), undefined);
    assert.equal(selectLowOddsPriceVariantQuote(best, [best], ['Bet365']), undefined);
    assert.equal(selectLowOddsPriceVariantQuote(quote('already-strict', 1.07), quotes, ['Bet365']), undefined);
    assert.equal(selectLowOddsPriceVariantQuote(best, quotes, ['Bet365'], 1.05)?.id, 'lower');
  });
});
