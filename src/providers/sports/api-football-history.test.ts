import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { RuntimeContext } from '../../runtime/context.js';
import { ApiFootballProvider } from './api-football.js';
import { mapApiFootballCompletedLeagueFixtures, validateCompletedLeagueFixturesQuery } from './api-football-history.js';
import type { ApiFootballProviderConfig } from './types.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const query = { league: 39, season: 2020, from: '2020-01-01', to: '2020-09-21' };
const capturedAt = new Date('2020-09-22T08:00:00Z');
const config = { apiFootballKey: 'test-account-a', apiFootballBaseUrl: 'https://v3.football.api-sports.io', apiFootball: { maxProviderRequestsPerRun: 10 } } as ApiFootballProviderConfig;
const runtime = () => ({ providerRequestCount: 0, providerRequestLimit: 10 } as RuntimeContext);
function fixture(id = 1, status = 'FT', date = '2020-09-20T18:00:00Z') {
  return {
    fixture: { id, date, status: { short: status }, venue: { name: 'Test Stadium' } },
    league: { id: 39, season: 2020, name: 'Premier League', round: 'Regular Season - 3' },
    teams: { home: { id: 33, name: 'Home' }, away: { id: 40, name: 'Away' } },
    goals: { home: 2, away: 1 }, score: { fulltime: { home: 1, away: 1 } },
  };
}
const response = (fixtures = [fixture()]) => ({ paging: { current: 1, total: 1 }, response: fixtures });

describe('API-Football completed league history', () => {
  it('keeps only the requested league, season, completed status and UTC date range with regulation scores', () => {
    const extraTime = fixture(2, 'AET');
    const missingRegulation = { ...fixture(3, 'PEN'), score: undefined };
    const wrongLeague = { ...fixture(4), league: { ...fixture().league, id: 140 } };
    const wrongSeason = { ...fixture(5), league: { ...fixture().league, season: 2019 } };
    const raw = { paging: { current: 1, total: 1 }, response: [
      fixture(), extraTime, missingRegulation, wrongLeague, wrongSeason,
      fixture(6, 'NS'), fixture(7, '1H'), fixture(8, 'CANC'), fixture(9, 'FT', '2020-09-22T12:00:00Z'),
      fixture(10, 'FT', '2019-12-31T12:00:00Z'), fixture(11, 'FT', '2020-09-21T23:00:00-06:00'),
    ] };
    const result = mapApiFootballCompletedLeagueFixtures(raw, query, capturedAt, 'hash-1', 'snapshot-1');
    assert.deepEqual(result.fixtures.map((item) => item.providerFixtureId), ['1', '2', '3']);
    assert.deepEqual(result.fixtures.map((item) => [item.scoreHome90, item.scoreAway90]), [[1, 1], [1, 1], [null, null]]);
    assert.equal(result.fixtures[0].providerHomeTeamId, '33');
    assert.equal(result.fixtures[0].awayTeamName, 'Away');
    assert.equal(result.fixtures[0].venue, 'Test Stadium');
    assert.equal(result.fixtures[0].round, 'Regular Season - 3');
    assert.equal(result.providerSnapshotId, 'snapshot-1');
    assert.equal(result.payloadHash, 'hash-1');
    assert.equal(result.capturedAt, capturedAt.toISOString());
    assert.deepEqual(result.coverage, { returnedFixtures: 11, includedFixtures: 3, excludedFixtures: 8, unknownRegulationScoreFixtures: 1 });
  });

  it('rejects invalid or future ranges and refuses incomplete paginated history', () => {
    assert.deepEqual(validateCompletedLeagueFixturesQuery(query, capturedAt), query);
    for (const change of [{ league: 0 }, { season: 1 }, { from: '2020-02-31' }, { to: '2020-09-22' }, { to: '2020-09-23' }, { from: '2020-10-01' }]) {
      assert.throws(() => validateCompletedLeagueFixturesQuery({ ...query, ...change }, capturedAt), /ordered date range ending before today UTC/);
    }
    assert.throws(() => mapApiFootballCompletedLeagueFixtures({ ...response(), paging: { current: 1, total: 2 } }, query, capturedAt, 'hash'), /entire requested range/);
    assert.throws(() => mapApiFootballCompletedLeagueFixtures({ response: {} }, query, capturedAt, 'hash'));
    assert.deepEqual(mapApiFootballCompletedLeagueFixtures(response([]), query, capturedAt, 'hash').fixtures, []);
  });

  it('deduplicates concurrent providers within one runtime, preserves snapshot provenance, and never upserts historical fixtures', async () => {
    const requests: URL[] = [];
    const captures: unknown[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(new URL(String(input)));
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify(response()));
    }) as typeof fetch;
    const context = runtime();
    const persistence = {
      providerId: 'provider-test',
      snapshotSink: { capture: async (input: unknown) => { captures.push(input); return { id: 'snapshot-history' }; } },
      upsertFixtures: async () => { throw new Error('History must not upsert fixtures'); },
    };
    const a = new ApiFootballProvider(config, persistence, context);
    const b = new ApiFootballProvider(config, persistence, context);
    const [first, second] = await Promise.all([a.getCompletedLeagueFixtures(query), b.getCompletedLeagueFixtures(query)]);
    assert.equal(requests.length, 1);
    assert.equal(context.providerRequestCount, 1);
    assert.equal(captures.length, 1);
    assert.deepEqual((captures[0] as { rawPayload: unknown }).rawPayload, response());
    assert.equal(requests[0].pathname, '/fixtures');
    assert.deepEqual(Object.fromEntries(requests[0].searchParams), { league: '39', season: '2020', from: '2020-01-01', to: '2020-09-21', status: 'FT-AET-PEN', timezone: 'UTC' });
    assert.equal(first.providerSnapshotId, 'snapshot-history');
    assert.match(first.payloadHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(second, first);
    await a.getCompletedLeagueFixtures(query);
    assert.equal(requests.length, 1);
  });

  it('isolates accounts, runtimes, cutoff keys and providers without a runtime', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify(response())); }) as typeof fetch;
    const context = runtime();
    await new ApiFootballProvider(config, {}, context).getCompletedLeagueFixtures(query);
    await new ApiFootballProvider({ ...config, apiFootballKey: 'test-account-b' }, {}, context).getCompletedLeagueFixtures(query);
    await new ApiFootballProvider(config, {}, runtime()).getCompletedLeagueFixtures(query);
    await new ApiFootballProvider(config, {}, context).getCompletedLeagueFixtures({ ...query, to: '2020-09-20' });
    await new ApiFootballProvider(config).getCompletedLeagueFixtures(query);
    await new ApiFootballProvider(config).getCompletedLeagueFixtures(query);
    assert.equal(calls, 6);
  });

  it('evicts failed promises and preserves the shared request budget on retry', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify(calls === 1 ? { errors: { plan: 'unavailable' }, response: [] } : response()));
    }) as typeof fetch;
    const context = { ...runtime(), providerRequestLimit: 2 };
    const provider = new ApiFootballProvider(config, {}, context);
    await assert.rejects(() => provider.getCompletedLeagueFixtures(query));
    assert.equal((await provider.getCompletedLeagueFixtures(query)).fixtures.length, 1);
    await assert.rejects(() => provider.getCompletedLeagueFixtures({ ...query, to: '2020-09-20' }), /Provider request limit reached/);
    assert.equal(calls, 2);
  });
});
