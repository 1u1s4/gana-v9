import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLowOddsFixtureSelectorQuote, lowOddsSelectorMarketScope } from './low-odds-selector.js';

describe('low odds selector', () => {
  it('scopes fixture selection to h2h favorites and safe double chance', () => {
    assert.deepEqual(lowOddsSelectorMarketScope(['goals_over_under']), ['h2h', 'double_chance']);
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'double_chance', selection: 'home_or_draw' },
        lowOddsSelectorMarketScope(['goals_over_under']),
      ),
      true,
    );
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'double_chance', selection: 'draw_or_away' },
        lowOddsSelectorMarketScope(['goals_over_under']),
      ),
      true,
    );
    assert.equal(
      isLowOddsFixtureSelectorQuote(
        { market: 'h2h', selection: 'home' },
        lowOddsSelectorMarketScope(['goals_over_under']),
      ),
      true,
    );
  });

  it('keeps h2h draw out of low-odds fixture selection', () => {
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'home' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'away' }, ['h2h']), true);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'h2h', selection: 'draw' }, ['h2h']), false);
    assert.equal(isLowOddsFixtureSelectorQuote({ market: 'double_chance', selection: 'home_or_away' }, ['double_chance']), false);
  });
});
