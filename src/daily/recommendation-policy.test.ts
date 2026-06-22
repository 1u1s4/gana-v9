import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
  buildFallbackAtomicPredictionRecommendations,
  buildMissingDailyFocusParlayRecommendations,
} from './recommendation-policy.js';

describe('daily recommendation policy', () => {
  it('replaces an h2h simple with the matching high-probability double-chance safety alternative', () => {
    const recommendations = buildFallbackAtomicPredictionRecommendations(
      pipeline([
        prediction({
          id: 'belgium-home',
          market: 'h2h',
          selection: 'home',
          odds: 1.43,
          impliedProbability: 0.6993,
          modelProbability: 0.7,
          probability: 0.7,
          confidence: 0.66,
          edge: 0.030197,
          status: 'promotable',
        }),
        prediction({
          id: 'belgium-home-or-draw',
          market: 'double_chance',
          selection: 'home_or_draw',
          odds: 1.1,
          impliedProbability: 0.909091,
          modelProbability: 0.87,
          probability: 0.87,
          confidence: 0.54,
          edge: -0.039091,
          status: 'blocked',
          warnings: ['double_chance fair probability was inconsistent with low-price implied probability'],
          blockers: ['no-edge'],
        }),
      ]),
      ['codex'],
      () => 'gpt-5.5',
      0,
    );

    assert.equal(recommendations[0].predictionId, 'belgium-home-or-draw');
    assert.equal(recommendations[0].legs[0]?.market, 'double_chance');
    assert.equal(recommendations[0].legs[0]?.selection, 'home_or_draw');
    assert.equal(recommendations[0].aggregateConfidence, 0.87);
    assert.equal(recommendations[0].legs[0]?.confidence, 0.87);
    assert.equal(recommendations[0].expectedEdge, 0.01);
    assert.equal(recommendations[0].harnessStatus, 'review-required');
    assert.equal(recommendations[0].riskFlags.includes('model-probability-safety-confidence'), true);
  });

  it('prefers a safer emitted goals-over line instead of a more aggressive over line', () => {
    const recommendations = buildFallbackAtomicPredictionRecommendations(
      pipeline([
        prediction({
          id: 'goals-over-25',
          market: 'goals_over_under',
          selection: 'over',
          line: 2.5,
          odds: 1.3,
          impliedProbability: 0.769231,
          modelProbability: 0.75,
          probability: 0.75,
          confidence: 0.64,
          edge: 0.026596,
          status: 'review-required',
        }),
        prediction({
          id: 'goals-over-15',
          market: 'goals_over_under',
          selection: 'over',
          line: 1.5,
          odds: 1.25,
          impliedProbability: 0.8,
          modelProbability: 0.79,
          probability: 0.79,
          confidence: 0.6,
          edge: 0.034417,
          status: 'review-required',
        }),
      ]),
      ['codex'],
      () => 'gpt-5.5',
      0,
    );

    assert.equal(recommendations[0].predictionId, 'goals-over-15');
    assert.equal(recommendations[0].legs[0]?.line, 1.5);
    assert.equal(recommendations[0].aggregateConfidence, 0.79);
    assert.equal(recommendations[0].riskFlags.includes('model-probability-conservative-total'), true);
  });

  it('does not invent a safer goals line that the provider did not emit', () => {
    const recommendations = buildFallbackAtomicPredictionRecommendations(
      pipeline([
        prediction({
          id: 'only-goals-over-25',
          market: 'goals_over_under',
          selection: 'over',
          line: 2.5,
          odds: 1.3,
          impliedProbability: 0.769231,
          modelProbability: 0.75,
          probability: 0.75,
          confidence: 0.64,
          edge: 0.026596,
          status: 'review-required',
        }),
      ]),
      ['codex'],
      () => 'gpt-5.5',
      0,
    );

    assert.equal(recommendations[0].predictionId, 'only-goals-over-25');
    assert.equal(recommendations[0].legs[0]?.line, 2.5);
    assert.equal(recommendations[0].aggregateConfidence, 0.64);
    assert.equal(recommendations[0].displayConfidence, 0.75);
    assert.equal(recommendations[0].riskFlags.includes('model-probability-conservative-total'), false);
  });

  it('composes all three daily focus parlays from reviewed simple recommendations when strict profiles are absent', () => {
    const atomicRecommendations = buildFallbackAtomicPredictionRecommendations(
      pipeline([
        prediction({
          id: 'melbourne-over-25',
          fixtureId: 'fixture-melbourne',
          market: 'goals_over_under',
          selection: 'over',
          line: 2.5,
          odds: 1.5,
          modelProbability: 0.68,
          probability: 0.68,
          confidence: 0.68,
          edge: 0.055,
          status: 'review-required',
        }),
        prediction({
          id: 'legion-over-25',
          fixtureId: 'fixture-legion',
          market: 'goals_over_under',
          selection: 'over',
          line: 2.5,
          odds: 1.08,
          modelProbability: 0.88,
          probability: 0.88,
          confidence: 0.88,
          edge: 0.0137,
          status: 'review-required',
        }),
        prediction({
          id: 'shamrock-dc',
          fixtureId: 'fixture-shamrock',
          market: 'double_chance',
          selection: 'home_or_draw',
          odds: 1.22,
          modelProbability: 0.79,
          probability: 0.79,
          confidence: 0.79,
          edge: 0.01,
          status: 'review-required',
        }),
      ]),
      ['codex'],
      () => 'gpt-5.5',
      0,
    );

    const focusParlays = buildMissingDailyFocusParlayRecommendations({
      recommendations: atomicRecommendations,
    });

    assert.deepEqual(focusParlays.map((item) => item.profile), DAILY_PREFERRED_PARLAY_PROFILE_ORDER);
    assert.equal(focusParlays.every((item) => item.kind === 'parlay'), true);
    assert.equal(focusParlays.every((item) => item.selectionMode === 'analytical-fallback'), true);
    assert.equal(focusParlays.every((item) => item.harnessStatus === 'review-required'), true);
    assert.equal(focusParlays.every((item) => item.legs.length >= 2), true);
    assert.equal(focusParlays.every((item) => item.riskFlags.includes('daily-focus-fallback')), true);
    assert.equal(focusParlays.every((item) => item.expectedEdge > 0), true);
  });
});

function pipeline(predictions: any[]) {
  return {
    codex: {
      ok: true,
      runId: 'codex-run',
      fixtures: [{
        id: 'fixture-1',
        providerFixtureId: 'provider-fixture-1',
        homeTeamName: 'Belgium',
        awayTeamName: 'Iran',
        scheduledAt: '2026-06-21T19:00:00.000Z',
      }],
      scoring: [{
        ok: true,
        runId: 'codex-run',
        fixtureId: 'fixture-1',
        providerFixtureId: 'provider-fixture-1',
        predictions,
      }],
    } as any,
  };
}

function prediction(overrides: Record<string, unknown>) {
  return {
    id: 'prediction-1',
    runId: 'codex-run',
    fixtureId: 'fixture-1',
    providerFixtureId: 'provider-fixture-1',
    market: 'h2h',
    selection: 'home',
    odds: 1.5,
    impliedProbability: 0.666667,
    marketFairProbability: 0.67,
    modelProbability: 0.68,
    probability: 0.68,
    edge: 0.02,
    confidence: 0.6,
    quality: 'medium',
    confidenceBand: 'medium',
    status: 'review-required',
    oddsSnapshotId: 'odds-snapshot-1',
    oddsQuoteId: 'odds-quote-1',
    evidenceIds: ['evidence-1'],
    claimIds: [],
    warnings: [],
    blockers: [],
    promptVersion: 'score-prediction-v2',
    scoringRuleVersion: 'scoring-v2',
    ...overrides,
  };
}
