import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { RuntimeContext } from '../../runtime/context.js';
import { ApiFootballProvider } from './api-football.js';
import { mapApiFootballCompletedTeamFixtures, validateCompletedTeamFixturesQuery, type TeamHistorySeasonResponse } from './api-football-team-history.js';
import type { ApiFootballProviderConfig } from './types.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const query = { team: 1850, seasons: [2019, 2020], from: '2020-03-26', to: '2020-09-21' };
const capturedAt = new Date('2020-09-22T14:00:00Z');
const config = { apiFootballKey: 'test-account-a', apiFootballBaseUrl: 'https://v3.football.api-sports.io', apiFootball: { maxProviderRequestsPerRun: 30 } } as ApiFootballProviderConfig;
const runtime = () => ({ providerRequestCount: 0, providerRequestLimit: 30 } as RuntimeContext);

function fixture(id = 1, season = 2020, league = 44, status = 'FT') {
  return {
    fixture: { id, date: '2020-09-19T16:30:00Z', status: { short: status }, venue: { name: 'Test Stadium' } },
    league: { id: league, season, name: league === 44 ? 'FA WSL' : 'Other Cup', type: league === 44 ? 'League' : 'Cup', round: 'Round 3' },
    teams: { home: { id: 1850, name: 'Arsenal W' }, away: { id: 1857, name: 'Brighton W' } },
    goals: { home: 3, away: 1 }, score: { fulltime: { home: 1, away: 1 } },
  };
}

function response(rows: unknown[]) { return { errors: [], results: rows.length, paging: { current: 1, total: 1 }, response: rows }; }
function snapshot(season: number, rows: unknown[], changes: Partial<TeamHistorySeasonResponse> = {}): TeamHistorySeasonResponse {
  return { season, payload: response(rows), capturedAt, payloadHash: `hash-${season}`, providerSnapshotId: `snapshot-${season}`, ...changes };
}

describe('API-Football completed team history', () => {
  it('requires an exact team, explicit bounded seasons and valid historic date range', () => {
    assert.deepEqual(validateCompletedTeamFixturesQuery({ ...query, seasons: [2020, 2019, 2020] }, capturedAt), query);
    for (const changes of [
      { team: 0 }, { seasons: [] }, { seasons: [1] }, { seasons: [2017, 2018, 2019, 2020] },
      { from: '2020-02-31' }, { from: '2019-03-25' }, { from: '2020-09-23' },
      { to: '2020-09-22' }, { to: '2020-09-23' },
    ]) assert.throws(() => validateCompletedTeamFixturesQuery({ ...query, ...changes }, capturedAt), /explicit seasons/);
  });

  it('preserves competitions, seasons, exact teams, venues and per-season provenance without blending scores', () => {
    const oldCup = fixture(2, 2019, 525, 'AET');
    const no90 = { ...fixture(3, 2020, 698, 'PEN'), score: undefined };
    const result = mapApiFootballCompletedTeamFixtures([
      snapshot(2020, [fixture(), no90], { capturedAt: new Date('2020-09-22T14:00:02Z') }),
      snapshot(2019, [oldCup]),
    ], query);
    assert.equal(result.teamId, 1850);
    assert.deepEqual(result.seasons, [2019, 2020]);
    assert.equal(result.capturedAt, '2020-09-22T14:00:02.000Z');
    assert.deepEqual(result.providerSnapshotIds, ['snapshot-2019', 'snapshot-2020']);
    assert.deepEqual(result.snapshots.map((entry) => [entry.season, entry.payloadHash]), [[2019, 'hash-2019'], [2020, 'hash-2020']]);
    assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.fixtures.map((match) => [match.providerFixtureId, match.leagueId, match.season, match.leagueType]),
      [['1', 44, 2020, 'League'], ['2', 525, 2019, 'Cup'], ['3', 698, 2020, 'Cup']]);
    assert.deepEqual(result.fixtures.map((match) => [match.scoreHome90, match.scoreAway90]), [[1, 1], [1, 1], [null, null]]);
    assert.equal(result.fixtures[0].leagueName, 'FA WSL');
    assert.equal(result.fixtures[0].providerHomeTeamId, '1850');
    assert.equal(result.fixtures[0].providerAwayTeamId, '1857');
    assert.equal(result.fixtures[0].venue, 'Test Stadium');
    assert.equal(result.fixtures[0].round, 'Round 3');
    assert.deepEqual(result.coverage, { complete: true, requestedSeasons: [2019, 2020], fetchedSeasons: [2019, 2020],
      returnedFixtures: 3, includedFixtures: 3, excludedFixtures: 0, unknownRegulationScoreFixtures: 1 });
  });

  it('retains explicit development and friendly identities for separate contextual treatment', () => {
    const youthOpponent = fixture(2, 2020, 1156);
    youthOpponent.teams.away = { id: 200, name: 'Leicester City U21' };
    const friendly = fixture(3, 2020, 667);
    friendly.league.name = 'Friendlies Clubs';
    const result = mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2020, [youthOpponent, friendly])], query);
    assert.equal(result.coverage.complete, true);
    assert.equal(result.fixtures[0].awayTeamName, 'Leicester City U21');
    assert.equal(result.fixtures[0].providerAwayTeamId, '200');
    assert.equal(result.fixtures[1].leagueName, 'Friendlies Clubs');
  });

  it('filters wrong-team, wrong-season, non-completed and out-of-range rows and marks the response incomplete', () => {
    const wrongTeam = fixture(2);
    wrongTeam.teams.home.id = 100;
    const future = fixture(3);
    future.fixture.date = '2020-09-21T23:00:00-06:00';
    const tooOld = fixture(4);
    tooOld.fixture.date = '2020-03-25T23:59:59Z';
    const result = mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2020,
      [fixture(), wrongTeam, future, tooOld, fixture(5, 2019), fixture(6, 2020, 44, 'NS')])], query);
    assert.deepEqual(result.fixtures.map((row) => row.providerFixtureId), ['1']);
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.excludedFixtures, 5);
  });

  it('deduplicates identical rows but marks conflicting fixture versions incomplete', () => {
    const duplicate = mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2020, [fixture(), fixture()])], query);
    assert.equal(duplicate.fixtures.length, 1);
    assert.equal(duplicate.coverage.complete, true);
    assert.equal(duplicate.coverage.excludedFixtures, 1);
    const conflict = fixture(); conflict.score.fulltime.home = 2;
    const conflicting = mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2020, [fixture(), conflict])], query);
    assert.equal(conflicting.coverage.complete, false);
  });

  it('rejects missing seasons, unverified pagination and malformed provider responses', () => {
    assert.throws(() => mapApiFootballCompletedTeamFixtures([snapshot(2020, [])], query), /missing a requested season/);
    assert.throws(() => mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2019, [])], query), /duplicate season/);
    for (const payload of [
      { ...response([]), paging: { current: 1, total: 2 } }, { response: [] },
      { ...response([]), response: {} }, { ...response([]), errors: { season: 'Not available' } },
    ]) assert.throws(() => mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2020, [], { payload })], query));
    const empty = mapApiFootballCompletedTeamFixtures([snapshot(2019, []), snapshot(2020, [])], query);
    assert.equal(empty.coverage.complete, true);
    assert.deepEqual(empty.fixtures, []);
  });

  it('requests exact date ranges for every season, caches within runtime/account and never upserts history', async () => {
    const requests: URL[] = [];
    const captures: Array<{ rawPayload?: unknown }> = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input)); requests.push(url);
      const season = Number(url.searchParams.get('season'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify(response([fixture(season, season)])));
    }) as typeof fetch;
    const shared = runtime();
    const persistence = {
      providerId: 'provider-test',
      snapshotSink: { capture: async (input: { rawPayload?: unknown }) => { captures.push(input); return { id: `snapshot-${captures.length}` }; } },
      upsertFixtures: async () => { throw new Error('History must not upsert fixtures'); },
    };
    const a = new ApiFootballProvider(config, persistence, shared);
    const b = new ApiFootballProvider(config, persistence, shared);
    const [first, second] = await Promise.all([a.getCompletedTeamFixtures(query), b.getCompletedTeamFixtures({ ...query, seasons: [2020, 2019] })]);
    assert.deepEqual(first, second);
    assert.equal(requests.length, 2);
    assert.equal(shared.providerRequestCount, 2);
    assert.equal(captures.length, 2);
    assert.deepEqual(captures[0].rawPayload, response([fixture(2019, 2019)]));
    assert.deepEqual(Object.fromEntries(requests[0].searchParams), {
      team: '1850', season: '2019', from: '2020-03-26', to: '2020-09-21', status: 'FT-AET-PEN', timezone: 'UTC',
    });
    assert.equal(requests[1].searchParams.get('season'), '2020');
    assert.ok(requests.every((url) => !url.searchParams.has('last') && !url.searchParams.has('league')));
    assert.deepEqual(first.providerSnapshotIds, ['snapshot-1', 'snapshot-2']);
    await a.getCompletedTeamFixtures(query);
    assert.equal(requests.length, 2);
  });

  it('isolates cached histories by account, runtime, base URL, exact team and date range', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify(response([]))); }) as typeof fetch;
    const shared = runtime();
    await new ApiFootballProvider(config, {}, shared).getCompletedTeamFixtures(query);
    await new ApiFootballProvider({ ...config, apiFootballKey: 'another-account' }, {}, shared).getCompletedTeamFixtures(query);
    await new ApiFootballProvider(config, {}, runtime()).getCompletedTeamFixtures(query);
    await new ApiFootballProvider({ ...config, apiFootballBaseUrl: `${config.apiFootballBaseUrl}/` }, {}, shared).getCompletedTeamFixtures(query);
    await new ApiFootballProvider(config, {}, shared).getCompletedTeamFixtures({ ...query, team: 13982 });
    await new ApiFootballProvider(config, {}, shared).getCompletedTeamFixtures({ ...query, to: '2020-09-20' });
    await new ApiFootballProvider(config).getCompletedTeamFixtures(query);
    await new ApiFootballProvider(config).getCompletedTeamFixtures(query);
    assert.equal(calls, 16);
  });

  it('returns no partial DTO on provider failure and evicts failed cache entries', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify(calls === 2 ? { errors: { plan: 'Season unavailable' }, response: [] } : response([])));
    }) as typeof fetch;
    const shared = runtime();
    const provider = new ApiFootballProvider(config, {}, shared);
    await assert.rejects(() => provider.getCompletedTeamFixtures(query));
    assert.equal(calls, 2);
    assert.equal((await provider.getCompletedTeamFixtures(query)).coverage.complete, true);
    assert.equal(calls, 4);
    assert.equal(shared.providerRequestCount, 4);
  });

  it('reserves no network calls for invalid input or an insufficient shared request budget', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify(response([]))); }) as typeof fetch;
    const shared = { ...runtime(), providerRequestLimit: 1 };
    const provider = new ApiFootballProvider(config, {}, shared);
    await assert.rejects(() => provider.getCompletedTeamFixtures(query), /remaining provider request budget/);
    await assert.rejects(() => provider.getCompletedTeamFixtures({ ...query, seasons: [] }), /explicit seasons/);
    assert.equal(calls, 0);
    assert.equal(shared.providerRequestCount, 0);
    shared.providerRequestLimit = 2;
    assert.equal((await provider.getCompletedTeamFixtures(query)).coverage.complete, true);
    assert.equal(calls, 2);
  });
});
