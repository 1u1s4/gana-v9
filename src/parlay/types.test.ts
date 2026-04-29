import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parlaySchema,
  parlaySourcePredictionSchema,
  type Parlay,
  type ParlaySourcePrediction,
} from './types.js';

const sourcePrediction = {
  id: 'prediction-1',
  runId: 'run-1',
  fixtureId: 'fixture-1',
  market: 'goals_over_under',
  selection: 'over',
  line: 2.5,
  odds: 1.9,
  confidence: 0.7,
  quality: 'medium',
  status: 'candidate',
} satisfies ParlaySourcePrediction;

const parlay = {
  id: 'parlay-1',
  sourceRunId: 'run-1',
  legs: [{
    parlayId: 'parlay-1',
    predictionId: 'prediction-1',
    fixtureId: 'fixture-1',
    market: 'goals_over_under',
    selection: 'over',
    line: 2.5,
    odds: 1.9,
    status: 'candidate',
    index: 0,
    inclusionReason: 'included-eligible-prediction',
  }],
  combinedOdds: 1.9,
  aggregateConfidence: 0.7,
  aggregateQuality: 0.66,
  rationale: 'Analytical parlay candidate built from structured predictions.',
  warnings: [],
  status: 'candidate',
  generatedAt: '2026-04-25T12:00:00.000Z',
} satisfies Parlay;

describe('parlay types', () => {
  it('accepts structured source predictions', () => {
    assert.equal(parlaySourcePredictionSchema.safeParse(sourcePrediction).success, true);
  });

  it('rejects invalid source prediction odds', () => {
    const result = parlaySourcePredictionSchema.safeParse({ ...sourcePrediction, odds: 1 });

    assert.equal(result.success, false);
  });

  it('accepts parlay artifacts with normalized legs', () => {
    assert.equal(parlaySchema.safeParse(parlay).success, true);
  });

  it('rejects parlay artifacts without a source run', () => {
    const result = parlaySchema.safeParse({ ...parlay, sourceRunId: '' });

    assert.equal(result.success, false);
  });
});
