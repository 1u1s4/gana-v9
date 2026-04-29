import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ApiFootballFixtureMapperError,
  mapApiFootballFixture,
  mapApiFootballFixtureStatistics,
  mapApiFootballFixtureStatus,
  mapApiFootballOdds,
  type ApiFootballFixturePayload,
  type ApiFootballFixtureMapperErrorCode,
} from './api-football-mappers.js';
import { ApiFootballProviderError } from './api-football-errors.js';

const capturedAt = new Date('2026-04-25T00:00:00.000Z');

function apiFixture(overrides: Partial<ApiFootballFixturePayload> = {}): ApiFootballFixturePayload {
  return {
    fixture: {
      id: 1001,
      referee: 'Jane Referee',
      timezone: 'UTC',
      date: '2026-05-01T18:30:00+00:00',
      timestamp: 1777660200,
      status: {
        long: 'Not Started',
        short: 'NS',
        elapsed: null,
      },
    },
    league: {
      id: 39,
      name: 'Premier League',
      country: 'England',
      season: 2026,
      round: 'Regular Season - 1',
    },
    teams: {
      home: {
        id: 33,
        name: 'Manchester United',
      },
      away: {
        id: 40,
        name: 'Liverpool',
      },
    },
    goals: {
      home: 2,
      away: 1,
    },
    score: {
      fulltime: {
        home: 2,
        away: 1,
      },
    },
    ...overrides,
  };
}

describe('api-football mappers', () => {
  it('maps a fixture payload to the normalized fixture shape', () => {
    const result = mapApiFootballFixture(apiFixture(), {
      capturedAt,
      includedByFilters: ['england-top-flight'],
    });

    assert.equal(result.provider, 'api-football');
    assert.equal(result.providerFixtureId, '1001');
    assert.deepEqual(result.competition, {
      providerCompetitionId: '39',
      name: 'Premier League',
      country: 'England',
      type: undefined,
    });
    assert.equal(result.season, 2026);
    assert.deepEqual(result.homeTeam, {
      providerTeamId: '33',
      name: 'Manchester United',
      country: 'England',
    });
    assert.deepEqual(result.awayTeam, {
      providerTeamId: '40',
      name: 'Liverpool',
      country: 'England',
    });
    assert.equal(result.scheduledAt?.toISOString(), '2026-05-01T18:30:00.000Z');
    assert.equal(result.status, 'scheduled');
    assert.equal(result.scoreHome, 2);
    assert.equal(result.scoreAway, 1);
    assert.deepEqual(result.includedByFilters, ['england-top-flight']);
    assert.equal(result.metadata.capturedAt, capturedAt.toISOString());
    assert.equal(result.metadata.round, 'Regular Season - 1');
  });

  it('maps API-Football status codes to canonical fixture statuses', () => {
    for (const statusCode of ['NS', 'TBD']) {
      assert.equal(mapApiFootballFixtureStatus(statusCode), 'scheduled');
    }

    for (const statusCode of ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']) {
      assert.equal(mapApiFootballFixtureStatus(statusCode), 'live');
    }

    for (const statusCode of ['FT', 'AET', 'PEN']) {
      assert.equal(mapApiFootballFixtureStatus(statusCode), 'completed');
    }

    for (const statusCode of ['PST', 'CANC', 'ABD', 'AWD', 'WO']) {
      assert.equal(mapApiFootballFixtureStatus(statusCode), 'cancelled');
    }

    assert.equal(mapApiFootballFixtureStatus('unexpected'), 'unknown');
    assert.equal(mapApiFootballFixtureStatus(null), 'unknown');
  });

  it('falls back to timestamp when fixture date is missing', () => {
    const result = mapApiFootballFixture(apiFixture({ fixture: { id: 1001, timestamp: 1777660200 } }), {
      capturedAt,
    });

    assert.equal(result.scheduledAt?.toISOString(), '2026-05-01T18:30:00.000Z');
  });

  it('preserves non-secret metadata and removes secret-like keys', () => {
    const result = mapApiFootballFixture(
      apiFixture({
        requestToken: 'token-value',
        league: {
          id: 39,
          name: 'Premier League',
          country: 'England',
          season: 2026,
          apiKey: 'secret-value',
          round: 'Regular Season - 1',
        },
      }),
      { capturedAt },
    );

    const raw = result.metadata.raw as { league?: unknown; requestToken?: unknown };

    assert.deepEqual(raw.league, {
      id: 39,
      name: 'Premier League',
      country: 'England',
      season: 2026,
      round: 'Regular Season - 1',
    });
    assert.equal('requestToken' in raw, false);
  });

  it('rejects missing or invalid fixture identity fields and scheduledAt', () => {
    assertMappingError(apiFixture({ fixture: { id: 0, date: '2026-05-01T18:30:00+00:00' } }), 'invalid-fixture-id');
    assertMappingError(apiFixture({ league: { id: 'abc' } }), 'invalid-league-id');
    assertMappingError(apiFixture({ teams: { home: { id: null }, away: { id: 40 } } }), 'invalid-home-team-id');
    assertMappingError(apiFixture({ teams: { home: { id: 33 }, away: { id: -1 } } }), 'invalid-away-team-id');
    assertMappingError(apiFixture({ fixture: { id: 1001, date: 'not-a-date' } }), 'invalid-scheduled-at');
  });

  it('maps API-Football odds to canonical quotes', () => {
    const quotes = mapApiFootballOdds({
      response: [{
        bookmakers: [{
          id: 6,
          name: 'Bet365',
          bets: [
            { id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '2.00' }, { value: 'Draw', odd: '3.20' }, { value: 'Away', odd: '3.80' }] },
            { id: 12, name: 'Double Chance', values: [{ value: 'Home or Draw', odd: '1.20' }, { value: 'Home/Away', odd: '1.30' }, { value: 'Draw/Away', odd: '1.70' }] },
            { id: 5, name: 'Goals Over/Under', values: [{ value: 'Over 2.5', odd: '1.91' }, { value: 'Under 2.5', odd: '1.95' }] },
            { name: 'Corners Over Under', values: [{ value: 'Over 9.5', odd: '1.85' }, { value: 'Under 9.5', odd: '1.85' }] },
            { id: 8, name: 'Both Teams Score', values: [{ value: 'Yes', odd: '1.75' }, { value: 'No', odd: '2.05' }] },
            { id: 999, name: 'Correct Score', values: [{ value: '1:0', odd: '8.0' }] },
          ],
        }],
      }],
    }, {
      fixtureId: 'fixture-1',
      providerSnapshotId: 'snapshot-1',
      capturedAt,
    });

    assert.equal(quotes.length, 12);
    assert.deepEqual(
      quotes.map((quote) => [quote.market, quote.selection, quote.line, quote.price]),
      [
        ['h2h', 'home', undefined, 2],
        ['h2h', 'draw', undefined, 3.2],
        ['h2h', 'away', undefined, 3.8],
        ['double_chance', 'home_or_draw', undefined, 1.2],
        ['double_chance', 'home_or_away', undefined, 1.3],
        ['double_chance', 'draw_or_away', undefined, 1.7],
        ['goals_over_under', 'over', 2.5, 1.91],
        ['goals_over_under', 'under', 2.5, 1.95],
        ['corners_over_under', 'over', 9.5, 1.85],
        ['corners_over_under', 'under', 9.5, 1.85],
        ['btts', 'yes', undefined, 1.75],
        ['btts', 'no', undefined, 2.05],
      ],
    );
    assert.equal(quotes[0].impliedProbability, 0.5);
    assert.equal(quotes[0].bookmaker, 'Bet365');
    assert.equal(quotes[0].sourceSnapshotId, 'snapshot-1');
  });

  it('rejects unknown selections inside target markets', () => {
    assert.throws(
      () => mapApiFootballOdds({
        response: [{
          bookmakers: [{ name: 'Bet365', bets: [{ id: 1, name: 'Match Winner', values: [{ value: 'Either', odd: '2.00' }] }] }],
        }],
      }, { fixtureId: 'fixture-1', providerSnapshotId: 'snapshot-1', capturedAt }),
      (error: unknown) => error instanceof ApiFootballProviderError && error.code === 'mapping_error',
    );
  });

  it('maps fixture statistics corner kicks by team order', () => {
    const result = mapApiFootballFixtureStatistics({
      response: [
        { team: { id: 33, name: 'Home' }, statistics: [{ type: 'Corner Kicks', value: 7 }] },
        { team: { id: 40, name: 'Away' }, statistics: [{ type: 'Corner Kicks', value: '3' }] },
      ],
    }, {
      providerFixtureId: '1001',
      capturedAt,
      providerSnapshotId: 'snapshot-statistics-1',
    });

    assert.equal(result.providerFixtureId, '1001');
    assert.equal(result.cornersHome, 7);
    assert.equal(result.cornersAway, 3);
    assert.equal(result.totalCorners, 10);
    assert.equal(result.providerSnapshotId, 'snapshot-statistics-1');
  });

  it('keeps missing corner statistics absent instead of inventing values', () => {
    const result = mapApiFootballFixtureStatistics({
      response: [
        { team: { id: 33, name: 'Home' }, statistics: [{ type: 'Shots on Goal', value: 5 }] },
        { team: { id: 40, name: 'Away' }, statistics: [{ type: 'Shots on Goal', value: 2 }] },
      ],
    }, {
      providerFixtureId: '1001',
      capturedAt,
    });

    assert.equal(result.cornersHome, undefined);
    assert.equal(result.cornersAway, undefined);
    assert.equal(result.totalCorners, undefined);
  });
});

function assertMappingError(
  payload: ApiFootballFixturePayload,
  code: ApiFootballFixtureMapperErrorCode,
): void {
  assert.throws(
    () => mapApiFootballFixture(payload, { capturedAt }),
    (error: unknown) => error instanceof ApiFootballFixtureMapperError && error.code === code,
  );
}
