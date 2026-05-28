import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCouncilDecisions, runRecommendationCouncil, type CouncilRecommendation } from './recommendation-council.js';

describe('recommendation council', () => {
  it('rejects weak analytical fallbacks instead of bypassing the review threshold', () => {
    const weakFallback = recommendation({
      kind: 'parlay',
      parlayId: 'fallback-negative-edge',
      combinedOdds: 1.52,
      aggregateConfidence: 0.55,
      expectedEdge: -0.14,
      riskFlags: ['analytical-fallback', 'review-required', 'low-liquidity'],
      legs: [leg({ odds: 1.22 }), leg({ fixtureId: 'fixture-2', odds: 1.25 })],
    });
    const usefulFallback = recommendation({
      kind: 'atomic-prediction',
      predictionId: 'useful-simple',
      combinedOdds: 1.45,
      aggregateConfidence: 0.72,
      expectedEdge: 0.06,
      riskFlags: ['single-selection', 'low-liquidity', 'analytical-fallback', 'review-required'],
      legs: [leg({ odds: 1.45, confidence: 0.72 })],
    });

    const council = runRecommendationCouncil({
      date: '2026-05-28',
      dailyBatchId: 'daily-test',
      generatedAt: '2026-05-27T00:00:00.000Z',
      recommendations: [weakFallback, usefulFallback],
    });

    assert.equal(council.reviews[0].decision, 'reject');
    assert.equal(council.reviews[0].reasons.some((reason) => reason.includes('negative-edge')), true);
    assert.equal(council.reviews[1].decision, 'review');
    assert.equal(council.reviewCount, 1);
    assert.equal(council.rejectedCount, 1);

    const kept = applyCouncilDecisions([weakFallback, usefulFallback], council);
    assert.deepEqual(kept.map((item) => item.predictionId ?? item.parlayId), ['useful-simple']);
    assert.equal(kept[0].rank, 1);
  });

  it('rejects overinflated edge flags even when the score is high', () => {
    const council = runRecommendationCouncil({
      date: '2026-05-28',
      dailyBatchId: 'daily-test',
      generatedAt: '2026-05-27T00:00:00.000Z',
      recommendations: [recommendation({
        kind: 'atomic-prediction',
        predictionId: 'inflated-simple',
        combinedOdds: 1.44,
        aggregateConfidence: 0.74,
        expectedEdge: 0.36,
        riskFlags: ['single-selection', 'overinflated-edge', 'analytical-fallback', 'review-required'],
        legs: [leg({ odds: 1.44, confidence: 0.74 })],
      })],
    });

    assert.equal(council.reviews[0].decision, 'reject');
    assert.equal(council.reviews[0].reasons.some((reason) => reason.includes('hard-risk-flag')), true);
  });
});

function recommendation(overrides: Partial<CouncilRecommendation>): CouncilRecommendation {
  return {
    kind: 'atomic-prediction',
    rank: 1,
    profile: 'analytical-fallback',
    harnessStatus: 'review-required',
    selectionMode: 'analytical-fallback',
    combinedOdds: 1.45,
    aggregateConfidence: 0.72,
    expectedEdge: 0.06,
    riskFlags: ['analytical-fallback', 'review-required'],
    reasons: ['analytical fallback'],
    providers: ['codex'],
    legs: [leg()],
    ...overrides,
  };
}

function leg(overrides: NonNullable<CouncilRecommendation['legs']>[number] = {}): NonNullable<CouncilRecommendation['legs']>[number] {
  return {
    fixtureId: 'fixture-1',
    fixture: 'Team A vs Team B',
    market: 'h2h',
    selection: 'home',
    line: null,
    odds: 1.45,
    confidence: 0.72,
    warnings: [],
    display: {
      fixtureLabel: 'Team A vs Team B',
      homeTeamName: 'Team A',
      awayTeamName: 'Team B',
      kickoffLocal: '2026-05-28T16:00:00.000Z',
    },
    ...overrides,
  };
}
