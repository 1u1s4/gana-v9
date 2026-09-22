import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBelowLowOddsThreshold, isLowOddsFixtureSelectorQuote, lowOddsSelectorMarketScope } from './low-odds-selector.js';

describe('low odds selector', () => {
  it('scopes fixture selection to outright winners regardless of analysis markets', () => {
    assert.deepEqual(lowOddsSelectorMarketScope(['goals_over_under']), ['h2h']);
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'double_chance', selection: 'home_or_draw' },
        lowOddsSelectorMarketScope(['goals_over_under']),
      ),
      false,
    );
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'double_chance', selection: 'draw_or_away' },
        lowOddsSelectorMarketScope(['goals_over_under']),
      ),
      false,
    );
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'h2h', selection: 'home' },
        lowOddsSelectorMarketScope(['goals_over_under']),
      ),
      true,
    );
  });

  it('requires a finite decimal price strictly below the threshold and above one', () => {
    assert.equal(isBelowLowOddsThreshold(1.09, 1.10), true);
    for (const price of [1.10, 1.11, 1, 0, -1, NaN, Infinity]) {
      assert.equal(isBelowLowOddsThreshold(price, 1.10), false, String(price));
    }
    assert.equal(isBelowLowOddsThreshold(1.09, NaN), false);
    assert.equal(isBelowLowOddsThreshold(1.09, Infinity), false);
  });

  it('keeps h2h draw out of low-odds fixture selection', () => {
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'home' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'away' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'draw' }, ['h2h']), false);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'double_chance', selection: 'home_or_away' }, ['double_chance']), false);
  });
});
