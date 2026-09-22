import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAILY_ODDS_FLOOR_STRATEGY_VERSION, selectDailyOddsFloorStrategy } from './odds-floor-strategy.js';

const leg = (id: string) => ({ predictionId: id, fixtureId: `fixture-${id}`, market: 'h2h', selection: 'home', line: null, odds: 1.5 });
const pick = (id: string, overrides: any = {}) => ({
  kind: 'atomic-prediction', predictionId: id, predictionIds: [id], parlayId: `atomic-${id}`, rank: 1,
  profile: 'atomic-high-confidence', harnessStatus: 'promotable', combinedOdds: 1.5,
  displayConfidence: 0.95, aggregateConfidence: 0.8, expectedEdge: 0.04, score: 0.5,
  riskFlags: [], legs: [leg(id)], ...overrides,
});
const select = (recommendations: any[], required: any = {}) => selectDailyOddsFloorStrategy({
  recommendations, requiredLeagueRecommendations: { atomicProjections: [], parlayProjections: [], ...required } as any,
});

describe('eligible daily analytical strategy', () => {
  it('keeps the odds floor and orders by evidence confidence, never display probability', () => {
    const result = select([
      pick('below', { combinedOdds: 1.449, aggregateConfidence: 0.99 }),
      pick('inflated-display', { displayConfidence: 0.99, aggregateConfidence: 0.72 }),
      pick('evidence', { combinedOdds: 1.45, displayConfidence: 0.8, aggregateConfidence: 0.85 }),
    ]);
    assert.equal(result.version, DAILY_ODDS_FLOOR_STRATEGY_VERSION);
    assert.equal(result.selectedPick?.id, 'evidence');
    assert.equal(result.selectedPick?.confidenceMetric, 'aggregateConfidence');
    assert.equal(result.selectedPick?.publishedConfidence, 0.85);
    assert.equal(result.eligiblePickCount, 2);
    assert.equal(result.rule.selection, 'highest-eligible-evidence-confidence');
  });
  it('excludes review fallbacks, hard risk flags and non-positive edge', () => {
    const result = select([
      pick('review', { harnessStatus: 'review-required' }),
      pick('fallback', { selectionMode: 'analytical-fallback' }),
      pick('safety', { riskFlags: ['model-probability-safety-confidence'] }),
      pick('negative', { expectedEdge: -0.01 }),
      pick('missing', { expectedEdge: undefined }),
      pick('valid'),
    ]);
    assert.equal(result.selectedPick?.id, 'valid');
    assert.equal(result.evaluatedPickCount, 6);
    assert.equal(result.excludedPickCount, 5);
  });
  it('applies the same eligibility to required league projections', () => {
    const result = select([], {
      atomicProjections: [
        { ...leg('review'), status: 'review-required', odds: 1.6, confidence: 0.99, expectedEdge: 0.05 },
        { ...leg('required'), status: 'promotable', odds: 1.5, confidence: 0.9, expectedEdge: 0.05 },
        { ...leg('override'), status: 'promotable', odds: 1.5, confidence: 0.99, expectedEdge: 0.05, safetyOverride: 'market-implied-double-chance' },
      ],
      parlayProjections: [
        { parlayId: 'blocked', status: 'blocked', combinedOdds: 1.8, aggregateConfidence: 0.99 },
        { parlayId: 'selected', status: 'selected', combinedOdds: 1.8, aggregateConfidence: 0.88, expectedEdge: 0.04, profile: 'principal', legs: [leg('a'), leg('b')] },
      ],
    });
    assert.equal(result.selectedPick?.id, 'required');
    assert.equal(result.selectedPick?.source, 'required-atomic');
    assert.equal(result.eligiblePickCount, 2);
  });
  it('deduplicates identical selections across published sources and keeps order on ties', () => {
    const result = select([pick('first'), pick('different-id-same-selection', { legs: [leg('first')] }), pick('last')]);
    assert.equal(result.eligiblePickCount, 2);
    assert.equal(result.selectedPick?.id, 'first');
  });
  it('returns an explicit no-pick when all candidates fail and rejects invalid probabilities', () => {
    const result = select([
      pick('no-evidence', { aggregateConfidence: undefined }),
      pick('overflow', { aggregateConfidence: 1.2 }),
      pick('review', { harnessStatus: 'review-required' }),
    ]);
    assert.equal(result.status, 'no-eligible-pick');
    assert.equal(result.selectedPick, null);
    assert.equal(result.analyticalArtifactOnly, true);
    assert.equal(result.executionCapability, 'none');
  });
});
