import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
  buildFallbackAtomicPredictionRecommendations,
  buildFallbackParlayRecommendations,
  buildMissingDailyFocusParlayRecommendations,
  displayFixturesFromPipelineResult,
  selectDailyParlayRecommendations,
} from './recommendation-policy.js';

describe('daily recommendation policy', () => {
  it('uses model probability for combined EV while keeping evidence confidence separate', () => {
    const picks = ['a', 'b'].map((id) => prediction({
      id, fixtureId: id, status: 'promotable', odds: 1.4, confidence: 0.95,
      modelProbability: 0.99, probability: 0.72, edge: 0.02,
    }));
    const [result] = buildFallbackParlayRecommendations(pipeline(picks), ['codex'], () => 'gpt-6-astra', 1);
    assert.equal(result.aggregateConfidence, 0.9025);
    assert.equal(result.adjustedProbability, 0.5184);
    assert.equal(result.expectedEdge, 0.016064);
    assert.equal(result.legs.every((leg) => leg.probability === 0.72), true);
  });

  it('denies missing probability and negative model EV even when evidence and source edge are high', () => {
    for (const missing of [undefined, Number.NaN]) {
      const picks = ['a', 'b'].map((id) => prediction({
        id, fixtureId: id, status: 'promotable', confidence: 0.99, odds: 1.4,
        probability: missing, modelProbability: undefined, edge: 0.05,
      }));
      assert.deepEqual(buildFallbackAtomicPredictionRecommendations(pipeline(picks), ['codex'], () => 'gpt-6-astra', 0), []);
      assert.deepEqual(buildFallbackParlayRecommendations(pipeline(picks), ['codex'], () => 'gpt-6-astra', 1), []);
    }
    const negative = prediction({ status: 'promotable', confidence: 0.99, probability: 0.5, edge: 0.05 });
    assert.deepEqual(buildFallbackAtomicPredictionRecommendations(pipeline([negative]), ['codex'], () => 'gpt-6-astra', 0), []);
    const withoutProbability = [strictSimple('a', 'fa'), strictSimple('b', 'fb')].map((pick) => ({
      ...pick, legs: pick.legs.map((leg) => ({ ...leg, probability: undefined })),
    }));
    assert.deepEqual(buildMissingDailyFocusParlayRecommendations({ recommendations: withoutProbability as any }), []);
  });

  it('retains required fixtures excluded by the discovery cap for honest coverage', () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'gana-required-discovery-display-'));
    try {
      writeFileSync(join(artifactDir, 'fixtures.json'), JSON.stringify({
        fixtures: [{ id: 'selected' }],
        discoveredRequiredFixtures: [{ id: 'selected' }, { id: 'required-capped' }, null],
      }));
      const fixtures = displayFixturesFromPipelineResult({ artifactDir, fixtures: [], lowOddsScan: {} } as any);
      assert.deepEqual([...new Set(fixtures.map((fixture) => fixture.id))], ['selected', 'required-capped']);
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  });

  it('does not replace an eligible h2h with a blocked double-chance or manufacture edge', () => {
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

    assert.equal(recommendations[0].predictionId, 'belgium-home');
    assert.equal(recommendations[0].aggregateConfidence, 0.66);
    assert.equal(recommendations[0].displayConfidence, 0.66);
    assert.equal(recommendations[0].adjustedProbability, 0.7);
    assert.equal(recommendations[0].expectedEdge, 0.001);
    assert.equal(recommendations[0].riskFlags.includes('model-probability-safety-confidence'), false);
  });

  it('excludes review-required totals without promoting market probability to evidence confidence', () => {
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

    assert.deepEqual(recommendations, []);
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
          modelProbability: 0.79,
          probability: 0.79,
          confidence: 0.64,
          edge: 0.026596,
          status: 'promotable',
        }),
      ]),
      ['codex'],
      () => 'gpt-5.5',
      0,
    );

    assert.equal(recommendations[0].predictionId, 'only-goals-over-25');
    assert.equal(recommendations[0].legs[0]?.line, 2.5);
    assert.equal(recommendations[0].aggregateConfidence, 0.64);
    assert.equal(recommendations[0].displayConfidence, 0.64);
    assert.equal(recommendations[0].riskFlags.includes('model-probability-conservative-total'), false);
  });

  it('prefers independent fixtures and new markets among already eligible approaches', () => {
    const recommendation = (id: string, profile: string, fixtures: string[], market: string) => ({
      ...strictSimple(id, fixtures[0]), kind: 'parlay', parlayId: id, profile,
      combinedOdds: profile === 'parlay-diamante' ? 1.21 : 1.6,
      legs: fixtures.map((fixtureId) => ({ ...strictSimple(fixtureId, fixtureId).legs[0], market })),
    });
    const selected = selectDailyParlayRecommendations([
      recommendation('diamond', 'parlay-diamante', ['a', 'b'], 'double_chance'),
      recommendation('same-fixtures', 'parlay-refinado', ['a', 'b'], 'h2h'),
      recommendation('independent', 'parlay-refinado', ['c', 'd'], 'goals_over_under'),
      { ...recommendation('unsafe', 'low-variance', ['e', 'f'], 'btts'), riskFlags: ['stale-source'] },
    ] as any, 4);
    assert.deepEqual(selected.map((item) => item.parlayId), ['diamond', 'independent']);
  });

  it('composed diamante uses independent-leg product without profile or average uplift', () => {
    const picks = [strictSimple('a', 'fa'), strictSimple('b', 'fb')].map((pick) => ({
      ...pick, aggregateConfidence: 0.9, legs: pick.legs.map((leg) => ({ ...leg, confidence: 0.9 })),
    }));
    const result = buildMissingDailyFocusParlayRecommendations({ recommendations: picks as any });
    const diamante = result.find((item) => item.profile === 'parlay-diamante');
    assert.ok(diamante);
    assert.equal(diamante.aggregateConfidence, 0.81);
    assert.ok(Math.abs(diamante.adjustedProbability - 0.9409) < 1e-10);
    assert.equal(diamante.combinedOdds, 1.21);
    assert.equal(result.some((item) => item.profile === 'low-odds-top'), false);
    assert.equal(new Set(result.map((item) => item.legs.map((leg) => leg.fixtureId).sort().join('|'))).size, result.length);
  });

  it('does not relabel review-only legs as diamante or other strict daily approaches', () => {
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

    assert.deepEqual(focusParlays, []);
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

function strictSimple(id: string, fixtureId: string) {
  return {
    kind: 'atomic-prediction', predictionId: id, predictionIds: [id], parlayId: `atomic-${id}`,
    profile: 'atomic-high-confidence', rank: 1, harnessStatus: 'promotable', validationStatus: 'unvalidated',
    combinedOdds: 1.1, aggregateConfidence: 0.96, expectedEdge: 0.04, score: 0.8, riskFlags: [], reasons: [],
    legs: [{ predictionId: id, fixtureId, fixture: fixtureId, market: 'h2h', selection: 'home', line: null,
      odds: 1.1, confidence: 0.96, probability: 0.97, validationStatus: 'unvalidated', warnings: [] }],
  };
}
