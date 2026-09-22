import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fixture } from '../domain/fixtures.js';
import type { CompletedLeagueFixture, CompletedLeagueFixtures } from '../providers/sports/types.js';
import { apiFootballSources, buildRecentPerformanceContext, buildResearchProviderContext, type ResearchSportsProvider } from './provider-context.js';

const fixture: Fixture = {
  id: 'local-fixture', provider: 'api-football', providerFixtureId: '99', competitionName: 'Premier League', leagueId: 39, season: 2026,
  homeTeamId: 'local-team-home', awayTeamId: 'local-team-away', providerHomeTeamId: '42', providerAwayTeamId: '49',
  homeTeamName: 'Home', awayTeamName: 'Away', scheduledAt: '2026-09-23T18:00:00Z', status: 'scheduled',
  includedByFilters: [], createdAt: '2026-09-22T07:00:00Z', updatedAt: '2026-09-22T07:00:00Z',
};

test('research obtains team performance with provider IDs and a cutoff before now and kickoff', async () => {
  const requests: unknown[] = [];
  const provider: ResearchSportsProvider = {
    getFixture: async () => fixture,
    getFixtureStatistics: async () => { throw new Error('future fixture statistics must not be requested'); },
    getTeamStatistics: async (query) => {
      requests.push(query);
      return { teamId: query.team, leagueId: query.league, season: query.season, date: query.date,
        capturedAt: '2026-09-22T07:00:00Z', providerSnapshotId: `snap-${query.team}`, form: 'WWD',
        fixtures: { played: { home: 2, away: 1, total: 3 } }, goals: { for: { total: { total: 5 } } }, cleanSheet: {}, failedToScore: {},
      };
    },
  };
  const context = await buildResearchProviderContext(provider, fixture, undefined, ['h2h'], new Date('2026-09-22T07:00:00Z'));
  assert.deepEqual(requests, [{ team: 42, league: 39, season: 2026, date: '2026-09-21' }, { team: 49, league: 39, season: 2026, date: '2026-09-21' }]);
  assert.equal(context.teamStatistics?.length, 2);
  assert.equal(context.fixtureStatistics, undefined);
  assert.equal(context.warnings.length, 0);
  const sources = apiFootballSources(fixture, '2026-09-22T07:00:00Z', context);
  assert.ok(sources.some((source) => source.id === 'source_api_football_team_42' && source.snapshotId === 'snap-42'));
  requests.length = 0;
  await buildResearchProviderContext(provider, fixture, undefined, ['h2h'], new Date('2026-10-01T07:00:00Z'));
  assert.equal((requests[0] as { date: string }).date, '2026-09-22');
});

test('missing metadata or failed statistics stays unavailable, never a synthetic performance claim', async () => {
  const provider: ResearchSportsProvider = { getFixture: async () => fixture, getTeamStatistics: async () => { throw new Error('unavailable'); } };
  const context = await buildResearchProviderContext(provider, fixture, undefined, ['h2h'], new Date('2026-09-22T07:00:00Z'));
  assert.equal(context.teamStatistics, undefined);
  assert.equal(context.warnings.length, 2);
  assert.equal(apiFootballSources(fixture, '2026-09-22T07:00:00Z', context).length, 1);
  const missing = await buildResearchProviderContext(provider, { ...fixture, providerHomeTeamId: undefined, providerAwayTeamId: undefined });
  assert.equal(missing.teamStatistics, undefined);
});

function pastMatch(id: string, overrides: Partial<CompletedLeagueFixture> = {}): CompletedLeagueFixture {
  return { providerFixtureId: id, leagueId: 39, season: 2026, scheduledAt: '2026-09-10T18:00:00Z',
    providerHomeTeamId: '42', providerAwayTeamId: '49', homeTeamName: 'Home', awayTeamName: 'Away',
    providerStatus: 'FT', scoreHome90: 2, scoreAway90: 1, venue: 'Stadium', round: 'Round 5', ...overrides };
}

function leagueHistory(fixtures: CompletedLeagueFixture[]): CompletedLeagueFixtures {
  return { leagueId: 39, season: 2026, from: '2026-01-01', to: '2026-09-21',
    capturedAt: '2026-09-22T07:00:00Z', providerSnapshotId: 'league-snapshot', payloadHash: 'a'.repeat(64), fixtures,
    coverage: { returnedFixtures: fixtures.length, includedFixtures: fixtures.length, excludedFixtures: 0,
      unknownRegulationScoreFixtures: fixtures.filter((match) => match.scoreHome90 === null || match.scoreAway90 === null).length } };
}

test('recent form uses 90-minute scores and opponent records strictly before each listed match', async () => {
  const history = leagueHistory([
    pastMatch('opponent-loss', { scheduledAt: '2026-09-01T18:00:00Z', providerHomeTeamId: '7', scoreHome90: 1, scoreAway90: 0 }),
    pastMatch('opponent-win', { scheduledAt: '2026-09-03T18:00:00Z', providerHomeTeamId: '49', providerAwayTeamId: '8', scoreHome90: 2, scoreAway90: 0 }),
    pastMatch('team-win'),
    pastMatch('later-opponent-win', { scheduledAt: '2026-09-20T18:00:00Z', providerHomeTeamId: '49', providerAwayTeamId: '9', scoreHome90: 9, scoreAway90: 0 }),
    pastMatch('aet-unknown', { scheduledAt: '2026-09-12T18:00:00Z', providerStatus: 'AET', scoreHome90: null, scoreAway90: null }),
    pastMatch('aet-draw', { scheduledAt: '2026-09-13T18:00:00Z', providerAwayTeamId: '8', providerStatus: 'AET', scoreHome90: 1, scoreAway90: 1 }),
    pastMatch('after-cutoff', { scheduledAt: '2026-09-22T02:00:00Z' }),
    pastMatch('future', { scheduledAt: '2026-09-24T02:00:00Z' }),
    pastMatch('wrong-league', { leagueId: 40 }),
    pastMatch('99'),
    pastMatch('team-win'),
  ]);
  const requests: unknown[] = [];
  const context = await buildResearchProviderContext({ getFixture: async () => fixture,
    getCompletedLeagueFixtures: async (query) => { requests.push(query); return history; },
  }, fixture, undefined, ['h2h'], new Date('2026-09-22T07:00:00Z'));
  assert.deepEqual(requests, [{ league: 39, season: 2026, from: '2026-01-01', to: '2026-09-21' }]);
  const home = context.recentPerformance!.teams[0];
  assert.deepEqual(home.recentMatches.map((match) => match.providerFixtureId), ['aet-draw', 'team-win']);
  assert.equal(home.recentMatches[0].result90, 'D');
  assert.deepEqual(home.sample.all, { played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 2, pointsPerMatch: 2 });
  assert.deepEqual(home.recentMatches[1].opponentBeforeMatch, {
    asOfExclusive: '2026-09-10T18:00:00Z', played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 1, pointsPerMatch: 1.5,
  });
  assert.equal(context.recentPerformance!.coverage.leagueMatchesWith90m, 5);
  assert.ok(context.warnings.some((warning) => warning.includes('unknown regulation scores 1')));
  assert.ok(context.warnings.some((warning) => warning.includes('2/10')));
  const source = apiFootballSources(fixture, history.capturedAt, context).find((source) => source.id === context.recentPerformance!.sourceId)!;
  assert.equal(source.snapshotId, history.providerSnapshotId);
  assert.equal(source.hash, history.payloadHash);
  assert.equal(source.capturedAt, history.capturedAt);
  assert.equal(source.metadata?.cutoffDate, '2026-09-21');
});

test('recent context limits to ten observed matches, preserves venue samples and unknown opponent strength', () => {
  const rows = Array.from({ length: 12 }, (_, i) => pastMatch(`match-${i}`, {
    scheduledAt: `2026-09-${String(i + 1).padStart(2, '0')}T18:00:00Z`,
    providerHomeTeamId: i % 2 ? '42' : `other-${i}`, providerAwayTeamId: i % 2 ? `other-${i}` : '42',
    providerStatus: i === 11 ? 'PEN' : 'FT', scoreHome90: 1, scoreAway90: 1,
  }));
  const context = buildRecentPerformanceContext(leagueHistory(rows.reverse()), fixture);
  const home = context.teams[0];
  assert.equal(home.recentMatches.length, 10);
  assert.equal(home.recentMatches[0].providerFixtureId, 'match-11');
  assert.equal(home.recentMatches[9].providerFixtureId, 'match-2');
  assert.equal(home.sample.home.played, 5);
  assert.equal(home.sample.away.played, 5);
  assert.equal(home.recentMatches[0].result90, 'D');
  assert.equal(home.recentMatches[0].opponentBeforeMatch.played, 0);
  assert.equal(home.recentMatches[0].opponentBeforeMatch.pointsPerMatch, null);
  assert.equal(context.teams[1].sample.all.played, 0);
  assert.equal(context.teams[1].sample.all.pointsPerMatch, null);
});

test('history query failures and mismatched cutoffs do not manufacture recent performance', async () => {
  for (const getCompletedLeagueFixtures of [
    async () => { throw new Error('unavailable'); },
    async () => ({ ...leagueHistory([]), to: '2026-09-23' }),
  ]) {
    const context = await buildResearchProviderContext({ getFixture: async () => fixture, getCompletedLeagueFixtures },
      fixture, undefined, ['h2h'], new Date('2026-09-22T07:00:00Z'));
    assert.equal(context.recentPerformance, undefined);
    assert.match(context.warnings.join(' '), /recent performance unavailable/);
    assert.equal(apiFootballSources(fixture, '2026-09-22T07:00:00Z', context).length, 1);
  }
});
