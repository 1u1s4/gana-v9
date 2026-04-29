import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Fixture } from '../domain/fixtures.js';
import { settleMarket } from './settlement-rules.js';
import { fetchValidationResult } from './result-fetcher.js';

const fixture = {
  id: 'fixture-1',
  provider: 'api-football',
  providerFixtureId: '1001',
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  scheduledAt: '2026-04-25T18:00:00.000Z',
  status: 'completed',
  scoreHome: 2,
  scoreAway: 1,
  includedByFilters: [],
  providerSnapshotId: 'snapshot-result-1',
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:00:00.000Z',
} satisfies Fixture;

describe('validation result fetcher', () => {
  it('fetches final fixture results for non-corner markets', async () => {
    const result = await fetchValidationResult({
      getFixture: async () => fixture,
      getFixtureStatistics: async () => {
        throw new Error('statistics should not be fetched');
      },
    }, {
      providerFixtureId: '1001',
      fixtureId: 'fixture-1',
      market: 'h2h',
    });

    assert.equal(result.fixture.scoreHome, 2);
    assert.equal(result.providerSnapshotId, 'snapshot-result-1');
    assert.equal(result.statistics, undefined);
  });

  it('fetches corners statistics for corners_over_under', async () => {
    const result = await fetchValidationResult({
      getFixture: async () => fixture,
      getFixtureStatistics: async () => ({
        providerFixtureId: '1001',
        cornersHome: 6,
        cornersAway: 4,
        totalCorners: 10,
        capturedAt: '2026-04-25T20:00:00.000Z',
        providerSnapshotId: 'snapshot-statistics-1',
      }),
    }, {
      providerFixtureId: '1001',
      fixtureId: 'fixture-1',
      market: 'corners_over_under',
    });

    assert.equal(result.statistics?.cornersHome, 6);
    assert.equal(result.statistics?.cornersAway, 4);
    assert.equal(result.providerSnapshotId, 'snapshot-statistics-1');
  });

  it('lets settlement block when provider corners are unavailable', async () => {
    const result = await fetchValidationResult({
      getFixture: async () => fixture,
      getFixtureStatistics: async () => ({
        providerFixtureId: '1001',
        capturedAt: '2026-04-25T20:00:00.000Z',
      }),
    }, {
      providerFixtureId: '1001',
      fixtureId: 'fixture-1',
      market: 'corners_over_under',
    });

    const outcome = settleMarket({
      fixture: result.fixture,
      statistics: result.statistics,
      selection: {
        market: 'corners_over_under',
        selection: 'over',
        line: 9.5,
        odds: 1.9,
        impliedProbability: 1 / 1.9,
        sourceSnapshotId: 'odds-snapshot-1',
      },
      evaluatedAt: '2026-04-25T20:00:00.000Z',
    });

    assert.equal(outcome.status, 'blocked');
    assert.equal(outcome.reason, 'corners-statistics-unavailable');
  });
});
