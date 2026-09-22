import { ApiFootballProviderError } from './api-football-errors.js';
import { mapApiFootballFixtures } from './api-football-mappers.js';
import type { CompletedLeagueFixture, CompletedLeagueFixtures, CompletedLeagueFixturesQuery } from './types.js';

export function validateCompletedLeagueFixturesQuery(input: CompletedLeagueFixturesQuery, now = new Date()): CompletedLeagueFixturesQuery {
  if (!Number.isSafeInteger(input.league) || input.league <= 0 || !Number.isSafeInteger(input.season) || input.season < 1900
    || !validDate(input.from) || !validDate(input.to) || input.from > input.to
    || !Number.isFinite(now.getTime()) || input.to >= now.toISOString().slice(0, 10)) {
    throw new ApiFootballProviderError({ code: 'mapping_error', endpointName: 'fixture_history',
      message: 'Completed fixture history requires valid league/season IDs and an ordered date range ending before today UTC.' });
  }
  return { league: input.league, season: input.season, from: input.from, to: input.to };
}

export function mapApiFootballCompletedLeagueFixtures(
  payload: unknown,
  query: CompletedLeagueFixturesQuery,
  capturedAt: Date,
  payloadHash: string,
  providerSnapshotId?: string,
): CompletedLeagueFixtures {
  validateCompletedLeagueFixturesQuery(query, capturedAt);
  const paging = (payload as { paging?: { current?: unknown; total?: unknown } } | null)?.paging;
  if (paging && (paging.current !== 1 || paging.total !== 1)) {
    throw new ApiFootballProviderError({ code: 'invalid_provider_response', endpointName: 'fixture_history',
      message: 'Completed fixture history must include the entire requested range in one response.', received: { paging } });
  }
  const normalized = mapApiFootballFixtures(payload, capturedAt);
  const byId = new Map<string, CompletedLeagueFixture>();
  for (const fixture of normalized) {
    const providerStatus = fixture.metadata.apiFootballStatusShort;
    if (fixture.status !== 'completed' || !['FT', 'AET', 'PEN'].includes(String(providerStatus))
      || Number(fixture.competition?.providerCompetitionId) !== query.league || fixture.season !== query.season
      || !fixture.scheduledAt || !fixture.homeTeam || !fixture.awayTeam) continue;
    const date = fixture.scheduledAt.toISOString().slice(0, 10);
    if (date < query.from || date > query.to || fixture.scheduledAt.getTime() >= capturedAt.getTime()) continue;
    byId.set(fixture.providerFixtureId, {
      providerFixtureId: fixture.providerFixtureId,
      leagueId: query.league,
      season: query.season,
      scheduledAt: fixture.scheduledAt.toISOString(),
      providerHomeTeamId: fixture.homeTeam.providerTeamId,
      providerAwayTeamId: fixture.awayTeam.providerTeamId,
      homeTeamName: fixture.homeTeam.name,
      awayTeamName: fixture.awayTeam.name,
      providerStatus: providerStatus as CompletedLeagueFixture['providerStatus'],
      scoreHome90: validScore(fixture.scoreHome),
      scoreAway90: validScore(fixture.scoreAway),
      venue: typeof fixture.metadata.venue === 'string' ? fixture.metadata.venue : null,
      round: typeof fixture.metadata.round === 'string' ? fixture.metadata.round : null,
    });
  }
  const fixtures = [...byId.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.providerFixtureId.localeCompare(b.providerFixtureId));
  return {
    leagueId: query.league, season: query.season, from: query.from, to: query.to,
    capturedAt: capturedAt.toISOString(), payloadHash, ...(providerSnapshotId && { providerSnapshotId }),
    fixtures,
    coverage: {
      returnedFixtures: normalized.length, includedFixtures: fixtures.length,
      excludedFixtures: normalized.length - fixtures.length,
      unknownRegulationScoreFixtures: fixtures.filter((fixture) => fixture.scoreHome90 === null || fixture.scoreAway90 === null).length,
    },
  };
}

function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validScore(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
