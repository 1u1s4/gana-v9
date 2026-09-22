import { createHash } from 'node:crypto';
import { ApiFootballProviderError } from './api-football-errors.js';
import { mapApiFootballFixtures } from './api-football-mappers.js';
import type { CompletedTeamFixture, CompletedTeamFixtures, CompletedTeamFixturesQuery } from './types.js';

export interface TeamHistorySeasonResponse {
  season: number;
  payload: unknown;
  capturedAt: Date;
  payloadHash: string;
  providerSnapshotId?: string;
}

export function validateCompletedTeamFixturesQuery(input: CompletedTeamFixturesQuery, now = new Date()): CompletedTeamFixturesQuery {
  const seasons = Array.isArray(input.seasons) ? [...new Set(input.seasons)].sort((a, b) => a - b) : [];
  const validRange = validDate(input.from) && validDate(input.to) && input.from <= input.to
    && Date.parse(input.to) - Date.parse(input.from) <= 366 * 86_400_000;
  if (!Number.isSafeInteger(input.team) || input.team <= 0 || !validRange || !Number.isFinite(now.getTime())
    || input.to >= now.toISOString().slice(0, 10) || !seasons.length || seasons.length > 3
    || seasons.some((season) => !Number.isSafeInteger(season) || season < 1900 || season > 9999)) {
    throw new ApiFootballProviderError({ code: 'mapping_error', endpointName: 'fixture_history',
      message: 'Completed team history requires an exact team ID, 1–3 explicit seasons and an ordered range of at most 366 days ending before today UTC.' });
  }
  return { team: input.team, from: input.from, to: input.to, seasons };
}

/** A complete response for every requested season is required; no partial-season fallback. */
export function mapApiFootballCompletedTeamFixtures(
  responses: TeamHistorySeasonResponse[],
  input: CompletedTeamFixturesQuery,
): CompletedTeamFixtures {
  const capturedAt = new Date(Math.max(...responses.map((response) => response.capturedAt.getTime())));
  const query = validateCompletedTeamFixturesQuery(input, capturedAt);
  const fetchedSeasons = responses.map((response) => response.season).sort((a, b) => a - b);
  if (JSON.stringify(fetchedSeasons) !== JSON.stringify(query.seasons)) {
    throw invalidResponse('Completed team history is missing a requested season or contains duplicate season responses.');
  }
  const byId = new Map<string, CompletedTeamFixture>();
  let returnedFixtures = 0;
  let excludedFixtures = 0;
  let complete = true;
  const snapshots: CompletedTeamFixtures['snapshots'] = [];
  for (const response of [...responses].sort((a, b) => a.season - b.season)) {
    validateCompletedTeamFixturesQuery(query, response.capturedAt);
    const paging = (response.payload as { paging?: { current?: unknown; total?: unknown } } | null)?.paging;
    if (!paging || paging.current !== 1 || paging.total !== 1) {
      throw invalidResponse('Completed team history must include the entire requested season/date range in one verified page.');
    }
    const normalized = mapApiFootballFixtures(response.payload, response.capturedAt);
    returnedFixtures += normalized.length;
    snapshots.push({ season: response.season, capturedAt: response.capturedAt.toISOString(), payloadHash: response.payloadHash,
      ...(response.providerSnapshotId && { providerSnapshotId: response.providerSnapshotId }) });
    for (const fixture of normalized) {
      const leagueId = Number(fixture.competition?.providerCompetitionId);
      const providerStatus = String(fixture.metadata.apiFootballStatusShort);
      const date = fixture.scheduledAt?.toISOString().slice(0, 10);
      const teamIds = [fixture.homeTeam?.providerTeamId, fixture.awayTeam?.providerTeamId];
      if (fixture.status !== 'completed' || !['FT', 'AET', 'PEN'].includes(providerStatus)
        || !Number.isSafeInteger(leagueId) || leagueId <= 0 || fixture.season !== response.season
        || !fixture.homeTeam || !fixture.awayTeam || !teamIds.includes(String(query.team))
        || !fixture.scheduledAt || !date || date < query.from || date > query.to
        || fixture.scheduledAt.getTime() >= response.capturedAt.getTime()) {
        excludedFixtures++;
        complete = false;
        continue;
      }
      const match: CompletedTeamFixture = {
        providerFixtureId: fixture.providerFixtureId, leagueId, season: response.season,
        leagueName: fixture.competition?.name ?? null, leagueType: fixture.competition?.type ?? null,
        scheduledAt: fixture.scheduledAt.toISOString(),
        providerHomeTeamId: fixture.homeTeam.providerTeamId, providerAwayTeamId: fixture.awayTeam.providerTeamId,
        homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name,
        providerStatus: providerStatus as CompletedTeamFixture['providerStatus'],
        scoreHome90: validScore(fixture.scoreHome), scoreAway90: validScore(fixture.scoreAway),
        venue: typeof fixture.metadata.venue === 'string' ? fixture.metadata.venue : null,
        round: typeof fixture.metadata.round === 'string' ? fixture.metadata.round : null,
      };
      const prior = byId.get(match.providerFixtureId);
      if (prior) {
        excludedFixtures++;
        if (JSON.stringify(prior) !== JSON.stringify(match)) complete = false;
      } else byId.set(match.providerFixtureId, match);
    }
  }
  const fixtures = [...byId.values()].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || a.providerFixtureId.localeCompare(b.providerFixtureId));
  return {
    teamId: query.team, from: query.from, to: query.to, seasons: query.seasons,
    capturedAt: capturedAt.toISOString(),
    payloadHash: createHash('sha256').update(JSON.stringify({ query, payloads: snapshots.map(({ season, payloadHash }) => ({ season, payloadHash })) })).digest('hex'),
    providerSnapshotIds: snapshots.flatMap((snapshot) => snapshot.providerSnapshotId ? [snapshot.providerSnapshotId] : []),
    snapshots, fixtures,
    coverage: { complete, requestedSeasons: query.seasons, fetchedSeasons, returnedFixtures, includedFixtures: fixtures.length,
      excludedFixtures, unknownRegulationScoreFixtures: fixtures.filter((fixture) => fixture.scoreHome90 === null || fixture.scoreAway90 === null).length },
  };
}

function invalidResponse(message: string): ApiFootballProviderError {
  return new ApiFootballProviderError({ code: 'invalid_provider_response', endpointName: 'fixture_history', message });
}

function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validScore(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
