import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLowOddsFixtureSelectorQuote, lowOddsSelectorMarketScope } from './low-odds-selector.js';

describe('low odds selector', () => {
  it('uses requested markets instead of hardcoding h2h', () => {
    assert.deepEqual(lowOddsSelectorMarketScope(['double_chance']), ['double_chance']);
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'double_chance', selection: 'home_or_draw' },
        ['double_chance'],
      ),
      true,
    );
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'h2h', selection: 'home' },
        ['double_chance'],
      ),
      false,
    );
  });

  it('keeps h2h draw out of low-odds fixture selection', () => {
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'home' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'away' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'draw' }, ['h2h']), false);
  });
});
