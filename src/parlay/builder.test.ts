import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildParlay } from './builder.js';
import type { ParlaySourcePrediction } from './types.js';

function prediction(overrides: Partial<ParlaySourcePrediction> = {}): ParlaySourcePrediction {
  return {
    id: 'prediction-1',
    runId: 'run-1',
    fixtureId: 'fixture-1',
    market: 'h2h',
    selection: 'home',
    odds: 2,
    confidence: 0.8,
    quality: 'high',
    status: 'candidate',
    ...overrides,
  };
}

describe('parlay builder', () => {
  it('applies default min and max leg rules', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1' }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-2' }),
        prediction({ id: 'prediction-3', fixtureId: 'fixture-3' }),
        prediction({ id: 'prediction-4', fixtureId: 'fixture-4' }),
        prediction({ id: 'prediction-5', fixtureId: 'fixture-5' }),
      ],
    });

    assert.equal(result.config.minLegs, 2);
    assert.equal(result.config.maxLegs, 4);
    assert.equal(result.parlay.legs.length, 4);
    assert.equal(result.parlay.status, 'candidate');
    assert.deepEqual(result.evaluations[4]?.excludedReasons, ['excluded-max-legs-reached']);
  });

  it('excludes blocked and draft predictions but allows review-required legs as review parlays', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1', status: 'blocked' }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-2', status: 'draft' }),
        prediction({ id: 'prediction-3', fixtureId: 'fixture-3', status: 'review-required' }),
        prediction({ id: 'prediction-4', fixtureId: 'fixture-4', status: 'candidate' }),
      ],
    });

    assert.deepEqual(result.parlay.legs.map((leg) => leg.predictionId), ['prediction-4', 'prediction-3']);
    assert.equal(result.parlay.status, 'review-required');
    assert.deepEqual(
      result.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-1')?.excludedReasons,
      ['excluded-blocked-prediction'],
    );
    assert.deepEqual(
      result.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-2')?.excludedReasons,
      ['excluded-draft-prediction'],
    );
    assert.deepEqual(
      result.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-3')?.includedReasons,
      ['included-eligible-prediction'],
    );
  });

  it('excludes parlay-ineligible and hard stale/source warning legs from the main build', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1', status: 'promotable', parlayEligible: false }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-2', status: 'promotable', warnings: ['research is not promotable'] }),
        prediction({ id: 'prediction-3', fixtureId: 'fixture-3', status: 'promotable', warnings: ['stale news source'] }),
        prediction({ id: 'prediction-4', fixtureId: 'fixture-4', status: 'promotable' }),
      ],
    });

    assert.deepEqual(result.parlay.legs.map((leg) => leg.predictionId), ['prediction-2', 'prediction-4']);
    assert.deepEqual(
      result.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-1')?.excludedReasons,
      ['excluded-parlay-ineligible'],
    );
    assert.deepEqual(
      result.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-2')?.includedReasons,
      ['included-eligible-prediction'],
    );
    assert.deepEqual(
      result.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-3')?.excludedReasons,
      ['excluded-research-not-promotable'],
    );
    assert.equal(result.parlay.status, 'review-required');
  });

  it('excludes duplicate fixtures by default', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1', selection: 'home' }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-1', selection: 'away' }),
        prediction({ id: 'prediction-3', fixtureId: 'fixture-2', selection: 'home' }),
      ],
    });

    assert.deepEqual(result.parlay.legs.map((leg) => leg.predictionId), ['prediction-1', 'prediction-3']);
    assert.deepEqual(result.evaluations[1]?.excludedReasons, ['excluded-duplicate-fixture']);
  });

  it('allows duplicate fixtures when explicitly configured', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      config: { allowMultipleLegsPerFixture: true },
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1', selection: 'home' }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-1', selection: 'away' }),
      ],
    });

    assert.equal(result.parlay.legs.length, 2);
    assert.equal(result.parlay.legs[1]?.inclusionReason, 'included-with-duplicate-fixture-override');
    assert.deepEqual(result.evaluations[1]?.includedReasons, ['included-with-duplicate-fixture-override']);
    assert.match(result.parlay.warnings.join('\n'), /Duplicate fixture override/);
  });

  it('calculates aggregate odds, confidence, and quality from included legs', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      predictions: [
        prediction({
          id: 'prediction-1',
          fixtureId: 'fixture-1',
          odds: 2,
          confidence: 0.8,
          quality: 'high',
          status: 'promotable',
        }),
        prediction({
          id: 'prediction-2',
          fixtureId: 'fixture-2',
          odds: 1.5,
          confidence: 0.7,
          quality: 'medium',
          status: 'promotable',
        }),
        prediction({
          id: 'prediction-3',
          fixtureId: 'fixture-3',
          odds: 1.8,
          confidence: 0.5,
          quality: 'low',
          status: 'promotable',
        }),
      ],
    });

    assert.equal(result.parlay.combinedOdds, 5.4);
    assert.equal(result.parlay.aggregateConfidence, 0.27999999999999997);
    assert.equal(result.parlay.aggregateQuality, (1 + 0.66 + 0.33) / 3);
    assert.equal(result.parlay.status, 'promotable');
  });

  it('records combined odds limit exclusions', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      config: { maxCombinedOdds: 3 },
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1', odds: 2 }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-2', odds: 2 }),
      ],
    });

    assert.deepEqual(result.evaluations[1]?.excludedReasons, ['excluded-combined-odds-limit']);
    assert.match(result.parlay.warnings.join('\n'), /Combined odds limit/);
  });

  it('labels eligible parlays as analytical artifacts that cannot execute monetary actions', () => {
    const result = buildParlay({
      id: 'parlay-1',
      generatedAt: '2026-04-25T12:00:00.000Z',
      predictions: [
        prediction({ id: 'prediction-1', fixtureId: 'fixture-1' }),
        prediction({ id: 'prediction-2', fixtureId: 'fixture-2' }),
      ],
    });

    assert.equal(result.parlay.status, 'candidate');
    assert.match(result.parlay.rationale, /analytical artifact only/i);
    assert.match(result.parlay.rationale, /cannot execute a wager or monetary action/i);
  });
});
