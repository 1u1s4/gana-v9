import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_MARKETS,
  getMarketSelections,
  isMarketKey,
  isOverUnderMarket,
  isValidMarketSelection,
  marketRequiresLine,
} from './markets.js';

describe('domain markets', () => {
  it('defines the five canonical MVP markets', () => {
    assert.deepEqual(DEFAULT_MARKETS, [
      'h2h',
      'double_chance',
      'goals_over_under',
      'corners_over_under',
      'btts',
    ]);
  });

  it('validates known market keys', () => {
    assert.equal(isMarketKey('h2h'), true);
    assert.equal(isMarketKey('corners_over_under'), true);
    assert.equal(isMarketKey('asian_handicap'), false);
  });

  it('exposes valid selections by market', () => {
    assert.deepEqual([...getMarketSelections('h2h')], ['home', 'draw', 'away']);
    assert.deepEqual([...getMarketSelections('double_chance')], [
      'home_or_draw',
      'home_or_away',
      'draw_or_away',
    ]);
    assert.deepEqual([...getMarketSelections('goals_over_under')], ['over', 'under']);
    assert.deepEqual([...getMarketSelections('corners_over_under')], ['over', 'under']);
    assert.deepEqual([...getMarketSelections('btts')], ['yes', 'no']);
  });

  it('rejects selections outside their market', () => {
    assert.equal(isValidMarketSelection('h2h', 'home'), true);
    assert.equal(isValidMarketSelection('h2h', 'yes'), false);
    assert.equal(isValidMarketSelection('btts', 'draw'), false);
    assert.equal(isValidMarketSelection('goals_over_under', 'over'), true);
  });

  it('requires lines only for over-under markets', () => {
    assert.equal(marketRequiresLine('goals_over_under'), true);
    assert.equal(marketRequiresLine('corners_over_under'), true);
    assert.equal(marketRequiresLine('h2h'), false);
    assert.equal(isOverUnderMarket('btts'), false);
  });
});
