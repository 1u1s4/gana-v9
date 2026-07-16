import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommendationArtifactTargets } from './artifact.js';

const PREDICTION_1 = '11111111-1111-4111-8111-111111111111';
const PREDICTION_2 = '22222222-2222-4222-8222-222222222222';
const PREDICTION_3 = '33333333-3333-4333-8333-333333333333';
const PARLAY_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('recommendation artifact targets', () => {
  it('keeps only UUID-backed database targets while retaining artifact-only display selections', () => {
    const targets = recommendationArtifactTargets({
      recommendations: [
        {
          kind: 'parlay',
          parlayId: 'daily-focus-parlay-1',
          predictionIds: [PREDICTION_1, 'daily-focus-prediction-1', 'not-a-uuid'],
          legs: [
            { predictionId: PREDICTION_2 },
            { predictionId: 'analytical-fallback-leg-1' },
          ],
        },
        {
          kind: 'parlay',
          parlayId: ` ${PARLAY_1} `,
          predictionId: ` ${PREDICTION_1} `,
        },
      ],
      requiredLeagueRecommendations: {
        atomicProjections: [
          { predictionId: PREDICTION_3 },
          { predictionId: 'required-atomic-1' },
        ],
        parlayProjections: [{
          status: 'selected',
          parlayId: 'daily-focus-required-parlay',
          legs: [{ predictionId: PREDICTION_2 }, { predictionId: 'anything-human' }],
        }],
        generalPredictions: [{
          fixtureId: 'daily-focus-fixture-1',
          providerFixtureId: '12345',
          fixture: 'Home vs Away',
          market: 'h2h',
          selection: 'home',
        }],
      },
    });

    assert.deepEqual(targets.predictionIds, [PREDICTION_1, PREDICTION_2, PREDICTION_3]);
    assert.deepEqual(targets.parlayIds, [PARLAY_1]);
    assert.equal(targets.artifactSelections.length, 1);
    assert.equal(targets.artifactSelections[0]?.fixtureId, 'daily-focus-fixture-1');
  });
});
