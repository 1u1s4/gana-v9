import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { Fixture } from '../../domain/fixtures.js';
import type { RuntimeContext } from '../../runtime/context.js';
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

  it('classifies rate-limit errors embedded in HTTP 200 provider payloads', async () => {
    globalThis.fetch = (async () => jsonResponse({
      errors: {
        rateLimit: 'Too many requests. You have exceeded the limit of requests per minute of your subscription.',
      },
      response: [],
    })) as typeof fetch;

    const provider = createApiFootballProvider(testConfig());
    await assert.rejects(
      () => provider.listFixtures({ date: '2026-05-01', league: 39, season: 2026 }),
      (err) => {
        assert.equal(isApiFootballProviderError(err), true);
        assert.equal((err as { code?: string }).code, 'rate_limited');
        assert.match((err as Error).message, /rate_limited/);
        return true;
      },
    );
  });

  it('classifies daily-limit payloads before their generic rateLimit field name', async () => {
    globalThis.fetch = (async () => jsonResponse({
      errors: {
        rateLimit: 'You have reached the request limit for the day of your subscription.',
      },
      response: [],
    })) as typeof fetch;

    const provider = createApiFootballProvider(testConfig());
    await assert.rejects(
      () => provider.listFixtures({ date: '2026-05-01', league: 39, season: 2026 }),
      (err) => {
        assert.equal(isApiFootballProviderError(err), true);
        assert.equal((err as { code?: string }).code, 'quota_exceeded');
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

  it('preserves provider team names when returning persisted fixtures', async () => {
    globalThis.fetch = (async () => jsonResponse({ response: [apiFixture({ providerFixtureId: 1001 })] })) as typeof fetch;

    const provider = createApiFootballProvider(testConfig(), {
      upsertFixtures: async (fixtures) => fixtures.map((normalized) => ({
        normalized,
        fixture: fixtureFromNormalized(normalized),
      })),
    });

    const fixtures = await provider.listFixtures({ date: '2026-05-01', league: 39 });

    assert.equal(fixtures.length, 1);
    assert.equal(fixtures[0].homeTeamName, 'Manchester United');
    assert.equal(fixtures[0].awayTeamName, 'Liverpool');
  });

  it('blocks provider calls after the per-run request limit is reached', async () => {
    const requests: URL[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      return jsonResponse({ response: [] });
    }) as typeof fetch;
    const config = testConfig({ maxProviderRequestsPerRun: 1 });
    const runtime: RuntimeContext = {
      sessionPath: 'session.jsonl',
      artifactRoot: '.artifacts/test',
      profile: 'standard',
      approvalMode: 'manual',
      providerAgentic: 'codex',
      providerSports: 'api-football',
      model: 'test-model',
      providerRequestCount: 0,
      providerRequestLimit: 1,
    };
    const provider = createApiFootballProvider(config, {}, runtime);

    await provider.listFixtures({ date: '2026-05-01', league: 39 });
    await assert.rejects(
      () => provider.listFixtures({ date: '2026-05-01', league: 40 }),
      (err) => {
        assert.equal(isApiFootballProviderError(err), true);
        assert.match((err as Error).message, /Provider request limit reached/);
        return true;
      },
    );
    assert.equal(requests.length, 1);
    assert.equal(runtime.providerRequestCount, 1);
  });

  it('retries seasonless league fixture discovery with date-derived seasons when provider requires season', async () => {
    const requests: URL[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      if (url.pathname === '/fixtures' && !url.searchParams.has('season')) {
        return jsonResponse({ errors: { season: 'The season field is required.' }, response: [] });
      }
      if (url.pathname === '/fixtures' && url.searchParams.get('season') === '2026') {
        return jsonResponse({ response: [apiFixture({ providerFixtureId: 1001 })] });
      }
      return jsonResponse({ response: [] });
    }) as typeof fetch;

    const provider = createApiFootballProvider(testConfig());
    const fixtures = await provider.listFixtures({ date: '2026-05-01', league: 128 });

    assert.equal(fixtures.length, 1);
    assert.equal(fixtures[0].providerFixtureId, '1001');
    assert.deepEqual(
      requests.filter((request) => request.pathname === '/fixtures').map((request) => request.searchParams.get('season') ?? 'seasonless'),
      ['seasonless', '2026'],
    );
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

  it('falls back to all persisted odds quotes when the bookmaker allowlist filters a real fixture to zero quotes', async () => {
    const fixturesByProviderId = new Map<string, Fixture>();
    const persistedSnapshots: CanonicalOddsSnapshot[] = [];

    globalThis.fetch = (async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/fixtures') {
        return jsonResponse({ response: [apiFixture({ providerFixtureId: 1001 })] });
      }
      if (url.pathname === '/odds') {
        return jsonResponse({
          paging: { current: 1, total: 1 },
          response: [{
            bookmakers: [{
              id: 42,
              name: 'Regional Book',
              bets: [{
                id: 1,
                name: 'Match Winner',
                values: [{ value: 'Home', odd: '1.80' }],
              }],
            }],
          }],
        });
      }
      throw new Error(`Unexpected API-Football request: ${url.toString()}`);
    }) as typeof fetch;

    const persistence: ApiFootballPersistence = {
      upsertFixtures: async (fixtures) => fixtures.map((normalized) => {
        const fixture = fixtureFromNormalized(normalized);
        fixturesByProviderId.set(normalized.providerFixtureId, fixture);
        return { normalized, fixture };
      }),
      resolveFixtureByProviderFixtureId: async (providerFixtureId) => fixturesByProviderId.get(providerFixtureId) ?? null,
      persistOddsSnapshot: async (snapshot) => {
        persistedSnapshots.push(snapshot);
        return { ...snapshot, oddsSnapshotId: 'odds-snapshot-1' };
      },
    };

    const provider = createApiFootballProvider(testConfig({ bookmakerAllowlist: ['Bet365'] }), persistence);
    const results = await provider.scanOdds({ date: '2026-05-01', league: 39, maxFixtures: 1 });

    assert.equal(results[0].quotes.length, 1);
    assert.equal(results[0].quotes[0].bookmaker, 'Regional Book');
    assert.equal(persistedSnapshots[0].bookmakerCount, 1);
    assert.equal((persistedSnapshots[0].metadata as any).bookmakerAllowlistFallback, true);
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
      maxProviderRequestsPerRun: 500,
      maxAgenticResearchCallsPerRun: 10,
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
