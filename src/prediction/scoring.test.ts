import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scorePredictionCandidate } from './scoring.js';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    fixtureId: 'fixture-1',
    market: 'h2h',
    selection: 'home',
    probability: 0.58,
    odds: 2.1,
    oddsQuoteId: 'odds-quote-1',
    evidenceIds: ['evidence-1'],
    ...overrides,
  };
}

describe('prediction scoring', () => {
  it('calculates implied probability and edge from decimal odds', () => {
    const result = scorePredictionCandidate(candidate());

    assert.equal(result.valid, true);
    assert.equal(result.scored.market, 'h2h');
    assert.equal(result.scored.impliedProbability, 1 / 2.1);
    assert.equal(result.scored.edge, 0.58 - (1 / 2.1));
  });

  it('supports lined over-under selections', () => {
    const result = scorePredictionCandidate(candidate({
      market: 'goals_over_under',
      selection: 'over',
      line: 2.5,
      probability: 0.61,
      odds: 1.95,
    }));

    assert.equal(result.valid, true);
    assert.equal(result.scored.line, 2.5);
    assert.equal(result.scored.impliedProbability, 1 / 1.95);
    assert.equal(result.scored.edge, 0.61 - (1 / 1.95));
  });

  it('rejects unsupported markets', () => {
    const result = scorePredictionCandidate(candidate({ market: 'asian_handicap' }));

    assert.equal(result.valid, false);
    assert.match(result.reasons.join('\n'), /invalid market/i);
  });

  it('rejects selections outside the market', () => {
    const result = scorePredictionCandidate(candidate({ market: 'btts', selection: 'home' }));

    assert.equal(result.valid, false);
    assert.match(result.reasons.join('\n'), /invalid selection/i);
  });

  it('rejects missing line for over-under markets', () => {
    const result = scorePredictionCandidate(candidate({
      market: 'goals_over_under',
      selection: 'over',
    }));

    assert.equal(result.valid, false);
    assert.match(result.reasons.join('\n'), /line required/i);
  });

  it('rejects line on markets that do not support one', () => {
    const result = scorePredictionCandidate(candidate({ line: 2.5 }));

    assert.equal(result.valid, false);
    assert.match(result.reasons.join('\n'), /line forbidden/i);
  });
});
