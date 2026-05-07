import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAtomicPrediction, scorePredictionCandidate } from './scoring.js';

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

  it('uses devigged market fair probability for edge when available', () => {
    const result = scorePredictionCandidate(candidate({
      odds: 1.8,
      probability: 0.61,
      marketFairProbability: 0.56,
      marketImpliedProbability: 0.58,
    }));

    assert.equal(result.valid, true);
    assert.equal(result.scored.marketImpliedProbability, 0.58);
    assert.equal(result.scored.marketFairProbability, 0.56);
    assert.ok(Math.abs((result.scored.edge ?? 0) - 0.05) < 1e-9);
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

  it('keeps low-liquidity and low-confidence as warnings instead of hard blockers', () => {
    const prediction = buildAtomicPrediction({
      runId: 'run-1',
      fixtureId: 'fixture-1',
      providerFixtureId: '1001',
      oddsSnapshotId: 'odds-snapshot-1',
      oddsQuoteId: 'odds-quote-1',
      market: 'corners_over_under',
      selection: 'under',
      line: 9.5,
      odds: 1.8,
      marketFairProbability: 0.5,
      estimatedProbability: 0.6,
      evidenceIds: ['evidence-1'],
      claimIds: ['claim-1'],
      status: 'promotable',
      confidence: 0.34,
      rationale: 'Corners under is a thin but valid LLM prediction.',
      lowLiquidity: true,
      generatedAt: '2026-05-06T20:00:00.000Z',
    });

    assert.equal(prediction.status, 'promotable');
    assert.equal(prediction.promotable, true);
    assert.deepEqual(prediction.blockers, []);
    assert.match(prediction.warnings.join('\n'), /low-liquidity/);
    assert.match(prediction.warnings.join('\n'), /low-confidence/);
  });

  it('keeps lineup-pending as a non-blocking warning for otherwise promotable predictions', () => {
    const prediction = buildAtomicPrediction({
      runId: 'run-1',
      fixtureId: 'fixture-1',
      providerFixtureId: '1001',
      oddsSnapshotId: 'odds-snapshot-1',
      oddsQuoteId: 'odds-quote-1',
      market: 'btts',
      selection: 'yes',
      odds: 2,
      marketFairProbability: 0.45,
      estimatedProbability: 0.9,
      evidenceIds: ['evidence-1', 'evidence-2'],
      claimIds: ['claim-1'],
      status: 'promotable',
      confidence: 0.9,
      rationale: 'BTTS is supported by the supplied evidence.',
      lineupPending: true,
      generatedAt: '2026-05-06T20:00:00.000Z',
    });

    assert.equal(prediction.status, 'promotable');
    assert.equal(prediction.promotable, true);
    assert.deepEqual(prediction.blockers, []);
    assert.match(prediction.warnings.join('\n'), /lineup-pending/);
  });
});
