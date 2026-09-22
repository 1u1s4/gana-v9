import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fixture } from '../domain/fixtures.js';
import type { CompletedTeamFixture, CompletedTeamFixtures, CompletedTeamFixturesQuery } from '../providers/sports/types.js';
import { buildTeamPerformanceContext, fetchRecentTeamPerformance } from './team-performance.js';
import { apiFootballSources, buildResearchProviderContext } from './provider-context.js';

const fixture: Fixture = {
  id: 'internal', provider: 'api-football', providerFixtureId: '99', competitionName: 'Cup', leagueId: 525, season: 2026,
  homeTeamId: 'internal-home', awayTeamId: 'internal-away', providerHomeTeamId: '42', providerAwayTeamId: '49',
  homeTeamName: 'Home', awayTeamName: 'Away', scheduledAt: '2026-09-23T18:00:00Z', status: 'scheduled',
  includedByFilters: [], createdAt: '2026-09-22T07:00:00Z', updatedAt: '2026-09-22T07:00:00Z',
};

function match(id: string, override: Partial<CompletedTeamFixture> = {}): CompletedTeamFixture {
  return { providerFixtureId: id, leagueId: 39, leagueName: 'Domestic league', leagueType: 'League', season: 2026,
    scheduledAt: '2026-09-20T18:00:00Z', providerHomeTeamId: '42', providerAwayTeamId: '8',
    homeTeamName: 'Home', awayTeamName: 'Opponent', providerStatus: 'FT', scoreHome90: 2, scoreAway90: 1,
    venue: 'Stadium', round: 'Round 5', ...override };
}

function history(fixtures: CompletedTeamFixture[], override: Partial<CompletedTeamFixtures> = {}): CompletedTeamFixtures {
  return { teamId: 42, from: '2026-03-26', to: '2026-09-21', seasons: [2025, 2026],
    capturedAt: '2026-09-22T07:00:00Z', payloadHash: 'a'.repeat(64), providerSnapshotIds: ['snapshot-2025', 'snapshot-2026'],
    snapshots: [2025, 2026].map((season) => ({ season, capturedAt: '2026-09-22T07:00:00Z',
      payloadHash: String(season).repeat(16), providerSnapshotId: `snapshot-${season}` })), fixtures,
    coverage: { complete: true, requestedSeasons: [2025, 2026], fetchedSeasons: [2025, 2026],
      returnedFixtures: fixtures.length, includedFixtures: fixtures.length, excludedFixtures: 0,
      unknownRegulationScoreFixtures: fixtures.filter((row) => row.scoreHome90 === null || row.scoreAway90 === null).length },
    ...override };
}

test('team history supplements a sparse cup sample without pooling competitions or replacing source lineage', async () => {
  const rows = [match('cup', { leagueId: 525, leagueName: 'Cup', leagueType: 'Cup' }),
    ...Array.from({ length: 10 }, (_, i) => match(`league-${i}`, {
      scheduledAt: `2026-09-${String(19 - i).padStart(2, '0')}T18:00:00Z`,
      season: i >= 5 ? 2025 : 2026,
      providerHomeTeamId: i % 2 ? '8' : '42', providerAwayTeamId: i % 2 ? '42' : '8',
    }))];
  const result = buildTeamPerformanceContext(history(rows), fixture);
  assert.equal(result.recentMatches.length, 10);
  assert.equal(result.coverage.known90mMatchesInWindow, 11);
  assert.equal(result.recentMatches.filter((row) => row.targetCompetitionAndSeason).length, 1);
  assert.deepEqual(result.groups.map((group) => [group.leagueId, group.season, group.sample.all.played]), [[525, 2026, 1], [39, 2026, 5], [39, 2025, 4]]);
  assert.ok(!('sample' in result));
  assert.ok(!('opponentBeforeMatch' in result.recentMatches[0]));
  const sources = apiFootballSources(fixture, history([]).capturedAt, { warnings: [], recentTeamPerformance: [result] });
  for (const row of result.recentMatches) {
    const source = sources.find((source) => source.id === row.sourceId)!;
    assert.equal(source.snapshotId, `snapshot-${row.season}`);
    assert.equal(source.hash, String(row.season).repeat(16));
    assert.match(source.externalId!, new RegExp(`team=42&season=${row.season}&from=2026-03-26&to=2026-09-21`));
    assert.equal(source.capturedAt, '2026-09-22T07:00:00Z');
  }
});

test('team context excludes future, other-team, duplicate, target and unknown regulation results', () => {
  const result = buildTeamPerformanceContext(history([
    match('valid-draw', { providerStatus: 'PEN', scoreHome90: 1, scoreAway90: 1 }),
    match('valid-draw'),
    match('wrong-team', { providerHomeTeamId: '420' }),
    match('99'),
    match('after-cutoff', { scheduledAt: '2026-09-22T00:00:00Z' }),
    match('before-window', { scheduledAt: '2026-03-25T23:59:59Z' }),
    match('wrong-season', { season: 2024 }),
    match('unknown-aet', { providerStatus: 'AET', scoreHome90: null, scoreAway90: null }),
    match('live', { providerStatus: '2H' as 'FT' }),
  ]), fixture);
  assert.deepEqual(result.recentMatches.map((row) => row.providerFixtureId), ['valid-draw']);
  assert.equal(result.recentMatches[0].result90, 'D');
  assert.equal(result.coverage.excludedContextRows, 8);
});

test('friendlies and development-labelled opponents stay explicit and separate from other competition samples', () => {
  const result = buildTeamPerformanceContext(history([
    match('senior'),
    match('development', { awayTeamName: 'Opponent U21' }),
    match('friendly', { leagueId: 667, leagueName: 'Friendlies Clubs', leagueType: 'Cup' }),
  ]), fixture);
  assert.equal(result.groups.length, 3);
  assert.ok(result.groups.every((group) => group.sample.all.played === 1));
  assert.deepEqual(result.recentMatches.find((row) => row.providerFixtureId === 'development')!.contextFlags, ['opponent-name-indicates-youth-or-reserve']);
  assert.deepEqual(result.recentMatches.find((row) => row.providerFixtureId === 'friendly')!.contextFlags, ['competition-name-indicates-friendly']);
  assert.match(result.interpretation, /unflagged does not prove senior competitive comparability/);
});

test('provider context requests exact IDs and date-bounded seasons before both observation and kickoff', async () => {
  const requests: CompletedTeamFixturesQuery[] = [];
  const provider = { getFixture: async () => fixture, getCompletedTeamFixtures: async (query: CompletedTeamFixturesQuery) => {
    requests.push(query);
    return history([], { teamId: query.team, from: query.from, to: query.to, seasons: query.seasons });
  } };
  const context = await buildResearchProviderContext(provider, fixture, undefined, ['h2h'], new Date('2026-09-22T07:00:00Z'));
  assert.deepEqual(requests, [42, 49].map((team) => ({ team, seasons: [2025, 2026], from: '2026-03-26', to: '2026-09-21' })));
  assert.equal(context.recentTeamPerformance?.length, 2);
  assert.equal(context.recentTeamPerformance?.[0].recentMatches.length, 0);
  requests.length = 0;
  await buildResearchProviderContext(provider, fixture, undefined, ['h2h'], new Date('2026-10-01T07:00:00Z'));
  assert.equal(requests[0].to, '2026-09-22');
  assert.equal(requests[0].from, '2026-03-27');
});

test('missing IDs, failed queries, partial seasons and mismatched identity cannot manufacture team evidence', async () => {
  let calls = 0;
  const missing = await fetchRecentTeamPerformance({ getCompletedTeamFixtures: async () => { calls += 1; return history([]); } },
    { ...fixture, providerHomeTeamId: undefined, providerAwayTeamId: undefined }, new Date('2026-09-22T07:00:00Z'), []);
  assert.equal(calls, 0);
  assert.deepEqual(missing, []);
  for (const getCompletedTeamFixtures of [
    async () => { throw new Error('unavailable'); },
    async () => history([], { teamId: 420 }),
    async () => history([], { to: '2026-09-22' }),
    async () => history([], { snapshots: [history([]).snapshots[0]] }),
    async () => history([], { coverage: { ...history([]).coverage, complete: false } }),
    async () => history([], { coverage: { ...history([]).coverage, fetchedSeasons: [2026] } }),
  ]) {
    const warnings: string[] = [];
    const context = await fetchRecentTeamPerformance({ getCompletedTeamFixtures }, fixture, new Date('2026-09-22T07:00:00Z'), warnings);
    assert.deepEqual(context, []);
    assert.equal(warnings.length, 2);
  }
});
