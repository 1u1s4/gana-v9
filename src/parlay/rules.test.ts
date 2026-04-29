import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_PARLAY_CONFIG,
  calculateAggregateConfidence,
  calculateAggregateQuality,
  calculateCombinedOdds,
  resolveParlayConfig,
} from './rules.js';

describe('parlay rules', () => {
  it('resolves conservative defaults', () => {
    assert.deepEqual(resolveParlayConfig(), DEFAULT_PARLAY_CONFIG);
    assert.equal(resolveParlayConfig().minLegs, 2);
    assert.equal(resolveParlayConfig().maxLegs, 4);
    assert.equal(resolveParlayConfig().allowMultipleLegsPerFixture, false);
  });

  it('honors rule overrides', () => {
    assert.deepEqual(resolveParlayConfig({
      minLegs: 3,
      maxLegs: 5,
      allowMultipleLegsPerFixture: true,
      minPredictionConfidence: 0.6,
      maxCombinedOdds: 12,
    }), {
      minLegs: 3,
      maxLegs: 5,
      allowMultipleLegsPerFixture: true,
      minPredictionConfidence: 0.6,
      maxCombinedOdds: 12,
    });
  });

  it('calculates combined odds as the decimal odds product', () => {
    assert.equal(calculateCombinedOdds([{ odds: 2 }, { odds: 1.5 }, { odds: 1.8 }]), 5.4);
  });

  it('calculates aggregate confidence as the confidence product', () => {
    assert.equal(calculateAggregateConfidence([
      { confidence: 0.8 },
      { confidence: 0.7 },
      { confidence: 0.5 },
    ]), 0.27999999999999997);
  });

  it('calculates aggregate quality from mapped quality scores', () => {
    assert.equal(calculateAggregateQuality([
      { quality: 'low' },
      { quality: 'medium' },
      { quality: 'high' },
    ]), (0.33 + 0.66 + 1) / 3);
  });

  it('rejects invalid leg bounds', () => {
    assert.throws(() => resolveParlayConfig({ minLegs: 0 }), RangeError);
    assert.throws(() => resolveParlayConfig({ minLegs: 3, maxLegs: 2 }), RangeError);
  });
});
