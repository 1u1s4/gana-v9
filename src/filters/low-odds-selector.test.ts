import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLowOddsFixtureSelectorQuote, lowOddsSelectorMarketScope } from './low-odds-selector.js';

describe('low odds selector', () => {
  it('always scopes fixture selection to h2h favorites', () => {
    assert.deepEqual(lowOddsSelectorMarketScope(['double_chance']), ['h2h']);
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'double_chance', selection: 'home_or_draw' },
        lowOddsSelectorMarketScope(['double_chance']),
      ),
      false,
    );
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'h2h', selection: 'home' },
        lowOddsSelectorMarketScope(['double_chance']),
      ),
      true,
    );
  });

  it('keeps h2h draw out of low-odds fixture selection', () => {
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'home' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'away' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'draw' }, ['h2h']), false);
  });
});
