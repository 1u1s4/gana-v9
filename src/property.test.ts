import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  MARKET_KEYS,
  getMarketSelections,
  isMarketKey,
  isValidMarketSelection,
  marketRequiresLine,
  type MarketKey,
} from './domain/markets.js';
import { proportionalDevig } from './markets/devig.js';
import { calculateAggregateConfidence, calculateCombinedOdds } from './parlay/rules.js';

describe('property-based market and probability invariants', () => {
  it('keeps market normalization and selection validation consistent', () => {
    fc.assert(fc.property(fc.constantFrom(...MARKET_KEYS), (market) => {
      assert.equal(isMarketKey(market), true);
      for (const selection of getMarketSelections(market)) {
        assert.equal(isValidMarketSelection(market, selection), true);
      }
      assert.equal(marketRequiresLine(market), market === 'goals_over_under' || market === 'corners_over_under');
    }));

    fc.assert(fc.property(
      fc.constantFrom(...MARKET_KEYS),
      fc.string({ minLength: 1 }).filter((selection) => !allSelections().has(selection)),
      (market, selection) => {
        assert.equal(isValidMarketSelection(market, selection), false);
      },
    ));
  });

  it('normalizes proportional devig probabilities to one', () => {
    fc.assert(fc.property(
      fc.array(fc.double({ min: 1.01, max: 20, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 8 }),
      (odds) => {
        const devig = proportionalDevig(odds.map((price, index) => ({ selection: `s${index}`, odds: price })));
        const probabilitySum = devig.reduce((sum, item) => sum + item.fairProbability, 0);
        assert.ok(Math.abs(probabilitySum - 1) < 1e-9);
        assert.equal(devig.every((item) => item.fairProbability > 0 && item.fairProbability < 1), true);
        assert.equal(devig.every((item) => item.fairOdds > 1), true);
      },
    ));
  });

  it('aggregates probabilities and decimal odds monotonically', () => {
    fc.assert(fc.property(
      fc.array(fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 6 }),
      fc.array(fc.double({ min: 1.01, max: 10, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 6 }),
      (confidences, odds) => {
        const confidence = calculateAggregateConfidence(confidences.map((value) => ({ confidence: value })));
        assert.ok(confidence > 0 && confidence <= Math.min(...confidences));

        const combinedOdds = calculateCombinedOdds(odds.map((value) => ({ odds: value })));
        assert.ok(combinedOdds !== undefined && combinedOdds >= Math.max(...odds));
      },
    ));
  });
});

function allSelections(): Set<string> {
  return new Set(MARKET_KEYS.flatMap((market: MarketKey) => [...getMarketSelections(market)]));
}
