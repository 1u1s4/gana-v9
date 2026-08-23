import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAILY_ODDS_FLOOR_MINIMUM_PUBLISHED_ODDS,
  DAILY_ODDS_FLOOR_STRATEGY_VERSION,
  selectDailyOddsFloorStrategy,
} from './odds-floor-strategy.js';

describe('daily odds-floor strategy', () => {
  it('treats 1.45 as eligible and resolves daily odds from combined, direct, then leg odds', () => {
    const result = selectDailyOddsFloorStrategy({
      recommendations: [
        dailyPick({
          predictionId: 'combined-odds',
          combinedOdds: 1.45,
          displayConfidence: 0.71,
        }),
        dailyPick({
          predictionId: 'direct-odds',
          combinedOdds: undefined,
          odds: 1.46,
          displayConfidence: 0.72,
        }),
        dailyPick({
          predictionId: 'leg-odds',
          combinedOdds: undefined,
          odds: undefined,
          displayConfidence: 0.73,
          legs: [leg({ predictionId: 'leg-odds', odds: 1.47 })],
        }),
      ],
      requiredLeagueRecommendations: requiredArtifact(),
    });

    assert.equal(DAILY_ODDS_FLOOR_MINIMUM_PUBLISHED_ODDS, 1.45);
    assert.equal(result.eligiblePickCount, 3);
    assert.equal(result.selectedPick?.id, 'leg-odds');
    assert.equal(result.selectedPick?.publishedOdds, 1.47);
  });

  it('evaluates daily, required atomic, and selected required parlays while excluding blocked parlays', () => {
    const result = selectDailyOddsFloorStrategy({
      recommendations: [dailyPick({
        predictionId: 'daily-candidate',
        combinedOdds: 1.5,
        displayConfidence: 0.76,
      })],
      requiredLeagueRecommendations: requiredArtifact({
        atomicProjections: [requiredAtomic({
          predictionId: 'required-atomic-candidate',
          odds: 1.55,
          confidence: 0.81,
        })],
        parlayProjections: [
          requiredParlay({
            parlayId: 'required-selected-candidate',
            status: 'selected',
            combinedOdds: 1.7,
            aggregateConfidence: 0.84,
          }),
          requiredParlay({
            parlayId: 'required-blocked-higher-confidence',
            status: 'blocked',
            combinedOdds: 2.2,
            aggregateConfidence: 0.99,
          }),
        ],
      }),
    });

    assert.equal(result.evaluatedPickCount, 3);
    assert.equal(result.eligiblePickCount, 3);
    assert.equal(result.selectedPick?.source, 'required-parlay');
    assert.equal(result.selectedPick?.id, 'required-selected-candidate');
    assert.equal(result.selectedPick?.publishedConfidence, 0.84);
  });

  it('uses the exact published-confidence precedence for every official source', () => {
    const daily = selectDailyOddsFloorStrategy({
      recommendations: [dailyPick({
        predictionId: 'daily-display-confidence',
        combinedOdds: 1.5,
        displayConfidence: 0.72,
        aggregateConfidence: 0.99,
        confidence: 0.98,
        adjustedProbability: 0.97,
      })],
      requiredLeagueRecommendations: requiredArtifact(),
    });
    const requiredAtomicResult = selectDailyOddsFloorStrategy({
      recommendations: [],
      requiredLeagueRecommendations: requiredArtifact({
        atomicProjections: [requiredAtomic({
          predictionId: 'required-atomic-display-confidence',
          odds: 1.5,
          displayConfidence: 0.73,
          confidence: 0.99,
          aggregateConfidence: 0.98,
        })],
      }),
    });
    const requiredParlayResult = selectDailyOddsFloorStrategy({
      recommendations: [],
      requiredLeagueRecommendations: requiredArtifact({
        parlayProjections: [requiredParlay({
          parlayId: 'required-parlay-display-confidence',
          status: 'selected',
          combinedOdds: 1.5,
          displayConfidence: 0.74,
          aggregateConfidence: 0.99,
          confidence: 0.98,
        })],
      }),
    });

    assert.deepEqual(
      [daily.selectedPick?.publishedConfidence, daily.selectedPick?.confidenceMetric],
      [0.72, 'displayConfidence'],
    );
    assert.deepEqual(
      [requiredAtomicResult.selectedPick?.publishedConfidence, requiredAtomicResult.selectedPick?.confidenceMetric],
      [0.73, 'displayConfidence'],
    );
    assert.deepEqual(
      [requiredParlayResult.selectedPick?.publishedConfidence, requiredParlayResult.selectedPick?.confidenceMetric],
      [0.74, 'displayConfidence'],
    );
  });

  it('selects the highest published confidence regardless of odds, rank, or recommendation score', () => {
    const result = selectDailyOddsFloorStrategy({
      recommendations: [
        dailyPick({
          predictionId: 'lower-confidence-high-score',
          combinedOdds: 4.5,
          displayConfidence: 0.78,
          rank: 1,
          score: 100,
        }),
        dailyPick({
          predictionId: 'highest-confidence',
          combinedOdds: 1.45,
          displayConfidence: 0.81,
          rank: 99,
          score: -100,
        }),
      ],
      requiredLeagueRecommendations: requiredArtifact({
        atomicProjections: [requiredAtomic({
          predictionId: 'middle-confidence',
          odds: 2.5,
          confidence: 0.8,
          rank: 1,
        })],
      }),
    });

    assert.equal(result.selectedPick?.id, 'highest-confidence');
    assert.equal(result.selectedPick?.publishedConfidence, 0.81);
    assert.equal(result.selectedPick?.publishedOdds, 1.45);
  });

  it('breaks equal-confidence ties only by first published order', () => {
    const result = selectDailyOddsFloorStrategy({
      recommendations: [
        dailyPick({
          predictionId: 'first-published',
          combinedOdds: 1.45,
          displayConfidence: 0.8,
          rank: 99,
          score: -100,
        }),
        dailyPick({
          predictionId: 'later-better-rank-and-score',
          combinedOdds: 9,
          displayConfidence: 0.8,
          rank: 1,
          score: 100,
        }),
      ],
      requiredLeagueRecommendations: requiredArtifact({
        atomicProjections: [requiredAtomic({
          predictionId: 'required-atomic-same-confidence',
          odds: 2,
          confidence: 0.8,
          rank: 1,
        })],
        parlayProjections: [requiredParlay({
          parlayId: 'required-parlay-same-confidence',
          status: 'selected',
          combinedOdds: 3,
          aggregateConfidence: 0.8,
        })],
      }),
    });

    assert.equal(result.selectedPick?.id, 'first-published');
    assert.equal(result.selectedPick?.publishedOrder, 1);
    assert.deepEqual(result.rule.tieBreak, ['published-order-ascending']);
  });

  it('returns an explicit no-eligible result without inventing a fallback pick', () => {
    const result = selectDailyOddsFloorStrategy({
      recommendations: [dailyPick({
        predictionId: 'just-below-floor',
        combinedOdds: 1.449999,
        displayConfidence: 0.99,
      })],
      requiredLeagueRecommendations: requiredArtifact({
        atomicProjections: [requiredAtomic({
          predictionId: 'required-below-floor',
          odds: 1.44,
          confidence: 0.99,
        })],
        parlayProjections: [
          requiredParlay({
            parlayId: 'selected-without-odds',
            status: 'selected',
            combinedOdds: null,
            aggregateConfidence: 0.99,
          }),
          requiredParlay({
            parlayId: 'blocked-above-floor',
            status: 'blocked',
            combinedOdds: 4,
            aggregateConfidence: 0.99,
          }),
        ],
      }),
    });

    assert.equal(result.version, DAILY_ODDS_FLOOR_STRATEGY_VERSION);
    assert.equal(result.status, 'no-eligible-pick');
    assert.equal(result.rule.minimumPublishedOdds, 1.45);
    assert.equal(result.evaluatedPickCount, 2);
    assert.equal(result.eligiblePickCount, 0);
    assert.equal(result.selectedPick, null);
    assert.equal(result.analyticalArtifactOnly, true);
    assert.equal(result.executionCapability, 'none');
  });
});

function dailyPick(overrides: Record<string, unknown> = {}) {
  const predictionId = String(overrides.predictionId ?? 'daily-prediction');
  return {
    kind: 'atomic-prediction',
    predictionId,
    parlayId: `atomic-${predictionId}`,
    rank: 1,
    profile: 'atomic-high-confidence',
    combinedOdds: 1.5,
    displayConfidence: 0.75,
    aggregateConfidence: 0.9,
    adjustedProbability: 0.9,
    score: 0.5,
    legs: [leg({ predictionId, odds: 1.5 })],
    ...overrides,
  } as any;
}

function requiredAtomic(overrides: Record<string, unknown> = {}) {
  const predictionId = String(overrides.predictionId ?? 'required-atomic');
  return {
    kind: 'required-league-atomic-projection',
    predictionId,
    rank: 1,
    fixtureId: `fixture-${predictionId}`,
    fixture: `Home ${predictionId} vs Away ${predictionId}`,
    market: 'h2h',
    selection: 'home',
    line: null,
    odds: 1.5,
    confidence: 0.75,
    ...overrides,
  } as any;
}

function requiredParlay(overrides: Record<string, unknown> = {}) {
  const parlayId = String(overrides.parlayId ?? 'required-parlay');
  return {
    kind: 'required-league-parlay-projection',
    parlayId,
    profile: 'principal',
    status: 'selected',
    combinedOdds: 1.8,
    aggregateConfidence: 0.75,
    legs: [leg({ predictionId: `${parlayId}-leg`, odds: 1.8 })],
    ...overrides,
  } as any;
}

function requiredArtifact({
  atomicProjections = [],
  parlayProjections = [],
}: {
  atomicProjections?: any[];
  parlayProjections?: any[];
} = {}) {
  return { atomicProjections, parlayProjections } as any;
}

function leg(overrides: Record<string, unknown> = {}) {
  const predictionId = String(overrides.predictionId ?? 'prediction-leg');
  return {
    predictionId,
    fixtureId: `fixture-${predictionId}`,
    fixture: `Home ${predictionId} vs Away ${predictionId}`,
    market: 'h2h',
    selection: 'home',
    line: null,
    odds: 1.5,
    confidence: 0.75,
    ...overrides,
  };
}
