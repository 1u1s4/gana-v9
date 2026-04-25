import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateImpliedProbability,
  isValidDecimalOdds,
  isValidImpliedProbability,
  validateOddsQuote,
  type OddsQuote,
} from './odds.js';

const baseQuote: OddsQuote = {
  fixtureId: 'fixture-1',
  market: 'h2h',
  selection: 'home',
  price: 2,
  impliedProbability: 0.5,
  capturedAt: '2026-04-25T00:00:00.000Z',
  sourceSnapshotId: 'snapshot-1',
};

describe('domain odds', () => {
  it('calculates implied probability from decimal odds', () => {
    assert.equal(calculateImpliedProbability(2), 0.5);
  });

  it('validates decimal odds greater than one', () => {
    assert.equal(isValidDecimalOdds(1.01), true);
    assert.equal(isValidDecimalOdds(1), false);
    assert.equal(isValidDecimalOdds(0), false);
  });

  it('validates implied probability in the canonical range', () => {
    assert.equal(isValidImpliedProbability(0.01), true);
    assert.equal(isValidImpliedProbability(1), true);
    assert.equal(isValidImpliedProbability(0), false);
    assert.equal(isValidImpliedProbability(1.1), false);
  });

  it('returns quote validation errors', () => {
    assert.deepEqual(validateOddsQuote(baseQuote), []);
    assert.deepEqual(validateOddsQuote({ ...baseQuote, price: 1 }), ['invalid-price']);
    assert.deepEqual(validateOddsQuote({ ...baseQuote, impliedProbability: 0 }), [
      'invalid-implied-probability',
    ]);
    assert.deepEqual(validateOddsQuote({ ...baseQuote, line: Number.NaN }), ['invalid-line']);
  });
});
