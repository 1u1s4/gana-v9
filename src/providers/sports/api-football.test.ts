import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { Fixture } from '../../domain/fixtures.js';
import type { ApiFootballPersistence, ApiFootballProviderConfig, CanonicalOddsSnapshot, NormalizedFixture } from './types.js';
import { createApiFootballProvider } from './api-football.js';
import { isApiFootballProviderError } from './api-football-errors.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('api-football provider', () => {
  it('applies a timeout signal and maps aborted requests to provider errors', async () => {
    let sawSignal = false;
    globalThis.fetch = (async (_input, init) => {
      sawSignal = init?.signal instanceof AbortSignal;
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      throw err;
    }) as typeof fetch;

    const provider = createApiFootballProvider(testConfig());
    await assert.rejects(
      () => provider.listFixtures({ date: '2026-05-01', league: 39, season: 2026 }),
      (err) => {
        assert.equal(sawSignal, true);
        assert.equal(isApiFootballProviderError(err), true);
        assert.match((err as Error).message, /timed out/);
        return true;
      },
    );
  });

  it('omits season from fixture requests when discovery is seasonless', async () => {
    const requests: URL[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      return jsonResponse({ response: [] });
    }) as typeof fetch;

    const provider = createApiFootballProvider(testConfig());
    await provider.listFixtures({ date: '2026-05-01', league: 39 });

    const fixtureRequest = requests.find((request) => request.pathname === '/fixtures');
    assert.ok(fixtureRequest);
    assert.equal(fixtureRequest.searchParams.get('date'), '2026-05-01');
    assert.equal(fixtureRequest.searchParams.get('league'), '39');
    assert.equal(fixtureRequest.searchParams.has('season'), false);
  });

  it('scans fixtures for a date and returns persisted canonical odds snapshots', async () => {
    const requests: URL[] = [];
    const fixturesByProviderId = new Map<string, Fixture>();
    const persistedSnapshots: CanonicalOddsSnapshot[] = [];
    const capturedEndpointNames: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);

      if (url.pathname === '/fixtures') {
        return jsonResponse({
          response: [
            apiFixture({ providerFixtureId: 1001 }),
            apiFixture({ providerFixtureId: 1002 }),
          ],
        });
      }

      if (url.pathname === '/odds') {
        return jsonResponse({
          paging: { current: 1, total: 1 },
          response: [{
            bookmakers: [
              {
                id: 6,
                name: 'Bet365',
                bets: [{
                  id: 1,
                  name: 'Match Winner',
                  values: [{ value: 'Home', odd: '1.80' }],
                }],
              },
              {
                id: 42,
                name: 'Random Book',
                bets: [{
                  id: 1,
                  name: 'Match Winner',
                  values: [{ value: 'Away', odd: '2.10' }],
                }],
              },
            ],
          }],
        });
      }

      throw new Error(`Unexpected API-Football request: ${url.toString()}`);
    }) as typeof fetch;

    const persistence: ApiFootballPersistence = {
      providerId: 'provider-api-football',
      snapshotSink: {
        capture: async (input) => {
          capturedEndpointNames.push(input.endpointName);
          return { id: `provider-snapshot-${capturedEndpointNames.length}` };
        },
      },
      upsertFixtures: async (fixtures) => fixtures.map((normalized) => {
        const fixture = fixtureFromNormalized(normalized);
        fixturesByProviderId.set(normalized.providerFixtureId, fixture);
        return { normalized, fixture };
      }),
      resolveFixtureByProviderFixtureId: async (providerFixtureId) => fixturesByProviderId.get(providerFixtureId) ?? null,
      persistOddsSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
        return { ...snapshot, oddsSnapshotId: `odds-snapshot-${persistedSnapshots.length}` };
      },
    };

    const provider = createApiFootballProvider(testConfig({ bookmakerAllowlist: ['bet365', 'Stake', 'Pinnacle'] }), persistence);
    const results = await provider.scanOdds({
      date: '2026-05-01',
      league: 39,
      season: 2026,
      maxFixtures: 1,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].fixtureId, 'fixture-1001');
    assert.equal(results[0].quotes.length, 1);
    assert.equal(results[0].quotes[0].fixtureId, 'fixture-1001');
    assert.equal(results[0].quotes[0].market, 'h2h');
    assert.equal(results[0].quotes[0].selection, 'home');
    assert.equal(results[0].quotes[0].price, 1.8);
    assert.equal(results[0].quotes[0].bookmaker, 'Bet365');

    assert.equal(persistedSnapshots.length, 1);
    assert.equal(persistedSnapshots[0].fixtureId, 'fixture-1001');
    assert.equal(persistedSnapshots[0].providerFixtureId, '1001');
    assert.equal(persistedSnapshots[0].bookmakerCount, 1);
    assert.equal(persistedSnapshots[0].quotes.length, 1);

    const fixtureRequest = requests.find((request) => request.pathname === '/fixtures');
    assert.ok(fixtureRequest);
    assert.equal(fixtureRequest.searchParams.get('date'), '2026-05-01');
    assert.equal(fixtureRequest.searchParams.get('timezone'), 'America/Guatemala');
    assert.equal(fixtureRequest.searchParams.get('league'), '39');
    assert.equal(fixtureRequest.searchParams.get('season'), '2026');
    assert.equal(fixtureRequest.searchParams.has('maxFixtures'), false);

    assert.deepEqual(
      requests.filter((request) => request.pathname === '/odds').map((request) => request.searchParams.get('fixture')),
      ['1001'],
    );
    assert.deepEqual(capturedEndpointNames, ['fixtures', 'odds']);
  });
});

function testConfig(apiFootball: Partial<ApiFootballProviderConfig['apiFootball']> = {}): ApiFootballProviderConfig {
  return {
    apiFootballKey: 'test-api-football-key',
    apiFootballBaseUrl: 'https://v3.football.api-sports.io',
    apiFootball: {
      defaultSeason: 2026,
      defaultSeasonInferred: false,
      timezone: 'America/Guatemala',
      leaguePresetsPath: 'config/league-presets.test.json',
      bookmakerPresetsPath: 'config/bookmaker-presets.test.json',
      defaultLeagues: [],
      defaultTeams: [],
      defaultMarkets: ['h2h'],
      lowOddsThreshold: 1.2,
      kickoffWindowHours: 36,
      includeLiveFixtures: true,
      includeCompletedFixtures: true,
      maxFixturesPerRun: 10,
      ...apiFootball,
    },
  };
}

function apiFixture(input: { providerFixtureId: number }) {
  return {
    fixture: {
      id: input.providerFixtureId,
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
      home: null,
      away: null,
    },
  };
}

function fixtureFromNormalized(normalized: NormalizedFixture): Fixture {
  return {
    id: `fixture-${normalized.providerFixtureId}`,
    provider: normalized.provider,
    providerFixtureId: normalized.providerFixtureId,
    leagueId: normalized.competition ? Number(normalized.competition.providerCompetitionId) : undefined,
    season: normalized.season ?? undefined,
    homeTeamId: normalized.homeTeam?.providerTeamId ?? 'unknown-home-team',
    awayTeamId: normalized.awayTeam?.providerTeamId ?? 'unknown-away-team',
    scheduledAt: (normalized.scheduledAt ?? new Date(0)).toISOString(),
    status: normalized.status,
    includedByFilters: normalized.includedByFilters,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-requests-limit': '100',
      'x-ratelimit-requests-remaining': '99',
    },
  });
}
