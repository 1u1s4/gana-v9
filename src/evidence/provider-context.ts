import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { MarketKey } from '../domain/markets.js';
import { hashPayload } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import {
  createApiFootballPersistence,
  createApiFootballProvider,
} from '../providers/sports/api-football.js';
import type {
  CanonicalOddsSnapshot,
  CompletedLeagueFixtures,
  FixtureStatistics,
  OddsQuery,
  SportsDataProvider,
  TeamStatistics,
} from '../providers/sports/types.js';
import type { SourceRecord } from './types.js';

export type ResearchSportsProvider = Pick<SportsDataProvider, 'getFixture'> &
  Partial<Pick<SportsDataProvider, 'getFixtureStatistics' | 'getTeamStatistics' | 'getCompletedLeagueFixtures'>> & {
    getCanonicalOddsSnapshot?(input: OddsQuery): Promise<CanonicalOddsSnapshot>;
  };

export interface ResearchProviderContext {
  fixtureStatistics?: FixtureStatistics;
  oddsSnapshot?: CanonicalOddsSnapshot;
  teamStatistics?: Array<TeamStatistics & { sourceId: string }>;
  recentPerformance?: ReturnType<typeof buildRecentPerformanceContext>;
  warnings: string[];
}

export async function createDefaultSportsProvider(
  config: AgentConfig,
  runtime: RuntimeContext,
): Promise<ResearchSportsProvider> {
  const persistence = await createApiFootballPersistence(config, runtime);
  return createApiFootballProvider(config, persistence, runtime);
}

export async function buildResearchProviderContext(
  provider: ResearchSportsProvider,
  fixture: Fixture,
  inputOddsSnapshot?: CanonicalOddsSnapshot,
  markets?: MarketKey[],
  now = new Date(),
): Promise<ResearchProviderContext> {
  const warnings: string[] = [];
  const fixtureStatistics = fixture.status === 'scheduled'
    ? undefined
    : await fetchFixtureStatistics(provider, fixture.providerFixtureId, warnings);
  const teamStatistics = await fetchPrematchTeamStatistics(provider, fixture, now, warnings);
  const recentPerformance = await fetchRecentPerformance(provider, fixture, now, warnings);
  const oddsSnapshot = inputOddsSnapshot
    ?? await fetchCanonicalOddsSnapshot(provider, fixture.providerFixtureId, warnings, markets);

  return {
    ...(fixtureStatistics && { fixtureStatistics }),
    ...(oddsSnapshot && { oddsSnapshot }),
    ...(teamStatistics.length && { teamStatistics }),
    ...(recentPerformance && { recentPerformance }),
    warnings: uniqueStrings(warnings),
  };
}

async function fetchRecentPerformance(provider: ResearchSportsProvider, fixture: Fixture, now: Date, warnings: string[]) {
  if (!provider.getCompletedLeagueFixtures) return undefined;
  const kickoff = Date.parse(fixture.scheduledAt);
  const league = Number(fixture.leagueId);
  const season = Number(fixture.season);
  if (!Number.isFinite(kickoff) || !Number.isInteger(league) || league <= 0 || !Number.isInteger(season) || season < 1900
    || ![fixture.providerHomeTeamId, fixture.providerAwayTeamId].some((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0)) {
    warnings.push('API-Football recent performance unavailable: missing competition, season, provider team IDs or kickoff.');
    return undefined;
  }
  const cutoff = new Date(Math.min(kickoff, now.getTime()));
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  const to = cutoff.toISOString().slice(0, 10);
  const from = `${season}-01-01`;
  if (from > to) {
    warnings.push(`API-Football recent performance unavailable: season ${season} begins after cutoff ${to}.`);
    return undefined;
  }
  try {
    const history = await provider.getCompletedLeagueFixtures({ league, season, from, to });
    if (history.leagueId !== league || history.season !== season || history.from !== from || history.to !== to) {
      warnings.push('API-Football recent performance unavailable: returned history does not match requested league, season and cutoff.');
      return undefined;
    }
    const context = buildRecentPerformanceContext(history, fixture);
    if (context.coverage.excludedInvalidRows > 0 || context.coverage.unknownRegulationScoreFixtures > 0) {
      warnings.push(`Recent performance excludes incomplete or invalid 90-minute results; ${context.coverage.leagueMatchesWith90m} league matches remain, unknown regulation scores ${context.coverage.unknownRegulationScoreFixtures}.`);
    }
    for (const team of context.teams) {
      if (team.recentMatches.length < 10) warnings.push(`Recent performance for team ${team.teamId}: ${team.recentMatches.length}/10 prior same-league matches with known 90-minute scores; report the limited sample.`);
    }
    return context;
  } catch {
    warnings.push(`API-Football recent performance unavailable for league ${league}, season ${season}, through ${to}; do not invent recent results or opponent strength.`);
    return undefined;
  }
}

/** Descriptive prior results, never an official table, rating or calibrated forecast. */
export function buildRecentPerformanceContext(history: CompletedLeagueFixtures, fixture: Fixture) {
  const from = Date.parse(`${history.from}T00:00:00Z`);
  const endExclusive = Date.parse(`${history.to}T00:00:00Z`) + 86_400_000;
  const kickoff = Date.parse(fixture.scheduledAt);
  const seen = new Set<string>();
  let excludedInvalidRows = 0;
  const matches = history.fixtures.filter((match) => {
    const date = Date.parse(match.scheduledAt);
    const valid = match.providerFixtureId !== fixture.providerFixtureId && !seen.has(match.providerFixtureId)
      && match.leagueId === history.leagueId && match.season === history.season
      && Number.isFinite(date) && date >= from && date < endExclusive && date < kickoff
      && ['FT', 'AET', 'PEN'].includes(match.providerStatus)
      && Number.isInteger(match.scoreHome90) && Number(match.scoreHome90) >= 0
      && Number.isInteger(match.scoreAway90) && Number(match.scoreAway90) >= 0;
    if (!valid) { excludedInvalidRows += 1; return false; }
    seen.add(match.providerFixtureId);
    return true;
  }).sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt) || a.providerFixtureId.localeCompare(b.providerFixtureId));
  const recordFor = (teamId: string, rows: typeof matches) => {
    let won = 0, drawn = 0, lost = 0, goalsFor = 0, goalsAgainst = 0;
    const relevant = rows.filter((match) => match.providerHomeTeamId === teamId || match.providerAwayTeamId === teamId);
    for (const match of relevant) {
      const home = match.providerHomeTeamId === teamId;
      const scored = Number(home ? match.scoreHome90 : match.scoreAway90);
      const conceded = Number(home ? match.scoreAway90 : match.scoreHome90);
      goalsFor += scored; goalsAgainst += conceded;
      if (scored > conceded) won += 1;
      else if (scored === conceded) drawn += 1;
      else lost += 1;
    }
    return { played: relevant.length, won, drawn, lost, goalsFor, goalsAgainst,
      pointsPerMatch: relevant.length ? Math.round(((won * 3 + drawn) / relevant.length) * 1000) / 1000 : null };
  };
  const teams = [
    { teamId: fixture.providerHomeTeamId, teamName: fixture.homeTeamName, targetVenue: 'home' },
    { teamId: fixture.providerAwayTeamId, teamName: fixture.awayTeamName, targetVenue: 'away' },
  ].filter((team): team is typeof team & { teamId: string } => Boolean(team.teamId)).map((team) => {
    const recent = matches.filter((match) => [match.providerHomeTeamId, match.providerAwayTeamId].includes(team.teamId)).slice(0, 10);
    return {
      ...team,
      sample: {
        all: recordFor(team.teamId, recent),
        home: recordFor(team.teamId, recent.filter((match) => match.providerHomeTeamId === team.teamId)),
        away: recordFor(team.teamId, recent.filter((match) => match.providerAwayTeamId === team.teamId)),
      },
      recentMatches: recent.map((match) => {
        const home = match.providerHomeTeamId === team.teamId;
        const opponentId = home ? match.providerAwayTeamId : match.providerHomeTeamId;
        const goalsFor = Number(home ? match.scoreHome90 : match.scoreAway90);
        const goalsAgainst = Number(home ? match.scoreAway90 : match.scoreHome90);
        return {
          providerFixtureId: match.providerFixtureId, scheduledAt: match.scheduledAt,
          venue: home ? 'home' : 'away', venueName: match.venue, round: match.round,
          opponentId, opponentName: home ? match.awayTeamName : match.homeTeamName,
          providerStatus: match.providerStatus, goalsFor90: goalsFor, goalsAgainst90: goalsAgainst,
          result90: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L',
          opponentBeforeMatch: {
            asOfExclusive: match.scheduledAt,
            ...recordFor(opponentId, matches.filter((prior) => Date.parse(prior.scheduledAt) < Date.parse(match.scheduledAt))),
          },
        };
      }),
    };
  });
  return {
    sourceId: `source_api_football_league_history_${history.leagueId}_${history.season}_${history.to}`,
    leagueId: history.leagueId, season: history.season, from: history.from, cutoffDate: history.to,
    capturedAt: history.capturedAt, providerSnapshotId: history.providerSnapshotId, payloadHash: history.payloadHash,
    coverage: { ...history.coverage, leagueMatchesWith90m: matches.length, excludedInvalidRows },
    teams,
    interpretation: 'Last 10 available completed same-league season matches, 90-minute scores only. Venue summaries use that same sample. Opponent W/D/L, goals and PPG use only earlier matches in this snapshot, excluding the listed match itself. Descriptive samples, not official standings, strength-adjusted ratings or calibrated probabilities. Missing samples remain unknown; no cross-competition, corner or availability inference.',
  };
}

async function fetchPrematchTeamStatistics(provider: ResearchSportsProvider, fixture: Fixture, now: Date, warnings: string[]) {
  const results: Array<TeamStatistics & { sourceId: string }> = [];
  if (!provider.getTeamStatistics) return results;
  const kickoff = Date.parse(fixture.scheduledAt);
  const league = Number(fixture.leagueId);
  const season = Number(fixture.season);
  if (!Number.isFinite(kickoff) || !Number.isInteger(league) || league <= 0 || !Number.isInteger(season) || season < 1900) {
    warnings.push('API-Football team statistics unavailable: missing competition, season or kickoff metadata.');
    return results;
  }
  // The endpoint accepts a date, not an instant. Exclude the entire cutoff day
  // so the query cannot include the target result or a later same-day match.
  const cutoff = new Date(Math.min(kickoff, now.getTime()));
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  const date = cutoff.toISOString().slice(0, 10);
  for (const rawId of [fixture.providerHomeTeamId, fixture.providerAwayTeamId]) {
    const team = Number(rawId);
    if (!Number.isSafeInteger(team) || team <= 0) {
      warnings.push('API-Football team statistics unavailable: missing provider team ID.');
      continue;
    }
    try {
      const statistics = await provider.getTeamStatistics({ team, league, season, date });
      results.push({ ...statistics, sourceId: `source_api_football_team_${team}` });
    } catch {
      warnings.push(`API-Football team statistics unavailable for team ${team} at cutoff ${date}; do not infer form or goal rates.`);
    }
  }
  return results;
}

async function fetchFixtureStatistics(
  provider: ResearchSportsProvider,
  providerFixtureId: string,
  warnings: string[],
): Promise<FixtureStatistics | undefined> {
  if (!provider.getFixtureStatistics) return undefined;
  try {
    return await provider.getFixtureStatistics({ providerFixtureId });
  } catch (err: any) {
    warnings.push(`API-Football fixture statistics unavailable: ${err?.message ?? String(err)}`);
    return undefined;
  }
}

async function fetchCanonicalOddsSnapshot(
  provider: ResearchSportsProvider,
  providerFixtureId: string,
  warnings: string[],
  markets?: MarketKey[],
): Promise<CanonicalOddsSnapshot | undefined> {
  if (!provider.getCanonicalOddsSnapshot) return undefined;
  try {
    return await provider.getCanonicalOddsSnapshot({ fixtureId: providerFixtureId, markets });
  } catch (err: any) {
    warnings.push(`API-Football odds snapshot unavailable: ${err?.message ?? String(err)}`);
    return undefined;
  }
}

export function apiFootballSource(fixture: Fixture, capturedAt: string): SourceRecord {
  return {
    id: 'source_api_football_fixture',
    type: 'api-football',
    externalId: fixture.providerFixtureId,
    title: 'API-Football fixture',
    capturedAt,
    hash: hashPayload(fixture),
    metadata: {
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
    },
  };
}

export function apiFootballStatisticsSource(statistics: FixtureStatistics, capturedAt: string): SourceRecord {
  return {
    id: 'source_api_football_fixture_statistics',
    type: 'api-football',
    externalId: statistics.providerFixtureId,
    snapshotId: statistics.providerSnapshotId,
    title: 'API-Football fixture statistics',
    capturedAt: statistics.capturedAt ?? capturedAt,
    hash: hashPayload(statistics),
    metadata: {
      providerFixtureId: statistics.providerFixtureId,
      fields: ['cornersHome', 'cornersAway', 'totalCorners'],
    },
  };
}

export function apiFootballOddsSnapshotSource(snapshot: CanonicalOddsSnapshot, capturedAt: string): SourceRecord {
  return {
    id: 'source_api_football_odds_snapshot',
    type: 'provider-snapshot',
    externalId: snapshot.providerFixtureId,
    snapshotId: snapshot.providerSnapshotId,
    title: 'API-Football odds snapshot',
    capturedAt: snapshot.capturedAt ?? capturedAt,
    hash: snapshot.payloadHash,
    metadata: {
      fixtureId: snapshot.fixtureId,
      providerFixtureId: snapshot.providerFixtureId,
      oddsSnapshotId: snapshot.oddsSnapshotId ?? null,
      quoteCount: snapshot.quotes.length,
      bookmakerCount: snapshot.bookmakerCount,
    },
  };
}

export function apiFootballSources(
  fixture: Fixture,
  capturedAt: string,
  providerContext: ResearchProviderContext,
): SourceRecord[] {
  return [
    apiFootballSource(fixture, capturedAt),
    providerContext.fixtureStatistics
      ? apiFootballStatisticsSource(providerContext.fixtureStatistics, capturedAt)
      : undefined,
    providerContext.oddsSnapshot
      ? apiFootballOddsSnapshotSource(providerContext.oddsSnapshot, capturedAt)
      : undefined,
    ...(providerContext.teamStatistics ?? []).map((statistics): SourceRecord => ({
      id: statistics.sourceId,
      type: 'api-football',
      externalId: `teams/statistics?team=${statistics.teamId}&league=${statistics.leagueId}&season=${statistics.season}&date=${statistics.date}`,
      snapshotId: statistics.providerSnapshotId,
      title: `API-Football team ${statistics.teamId} season statistics through ${statistics.date}`,
      capturedAt: statistics.capturedAt,
      hash: hashPayload(statistics),
      metadata: { teamId: statistics.teamId, leagueId: statistics.leagueId, season: statistics.season, cutoffDate: statistics.date },
    })),
    ...(providerContext.recentPerformance ? [{
      id: providerContext.recentPerformance.sourceId,
      type: 'api-football' as const,
      externalId: `fixtures?league=${providerContext.recentPerformance.leagueId}&season=${providerContext.recentPerformance.season}&from=${providerContext.recentPerformance.from}&to=${providerContext.recentPerformance.cutoffDate}&status=FT-AET-PEN`,
      snapshotId: providerContext.recentPerformance.providerSnapshotId,
      title: `API-Football prior league results through ${providerContext.recentPerformance.cutoffDate}`,
      capturedAt: providerContext.recentPerformance.capturedAt,
      hash: providerContext.recentPerformance.payloadHash,
      metadata: { leagueId: providerContext.recentPerformance.leagueId, season: providerContext.recentPerformance.season,
        from: providerContext.recentPerformance.from, cutoffDate: providerContext.recentPerformance.cutoffDate,
        coverage: providerContext.recentPerformance.coverage },
    }] : []),
  ].filter((source): source is SourceRecord => Boolean(source));
}

export function fixtureMetadataSummary(fixture: Fixture): string {
  const score = Number.isFinite(fixture.scoreHome) && Number.isFinite(fixture.scoreAway)
    ? `, score ${fixture.scoreHome}-${fixture.scoreAway}`
    : '';
  const homeTeam = fixture.homeTeamName
    ? `${fixture.homeTeamName} (${fixture.homeTeamId})`
    : fixture.homeTeamId;
  const awayTeam = fixture.awayTeamName
    ? `${fixture.awayTeamName} (${fixture.awayTeamId})`
    : fixture.awayTeamId;
  return [
    `API-Football fixture ${fixture.providerFixtureId}`,
    `home team ${homeTeam}`,
    `away team ${awayTeam}`,
    `status ${fixture.status}`,
    `scheduledAt ${fixture.scheduledAt}${score}`,
  ].join(', ');
}

export function fixtureStatisticsSummary(statistics: FixtureStatistics): string {
  const cornerParts = [
    Number.isFinite(statistics.cornersHome) ? `home corners ${statistics.cornersHome}` : undefined,
    Number.isFinite(statistics.cornersAway) ? `away corners ${statistics.cornersAway}` : undefined,
    Number.isFinite(statistics.totalCorners) ? `total corners ${statistics.totalCorners}` : undefined,
  ].filter(Boolean);
  const corners = cornerParts.length ? cornerParts.join(', ') : 'no mapped corner statistics returned';
  return [
    `API-Football fixture statistics ${statistics.providerFixtureId}`,
    corners,
    `capturedAt ${statistics.capturedAt}`,
  ].join(', ');
}

export function fixtureStatisticsClaim(statistics: FixtureStatistics): string {
  if (Number.isFinite(statistics.totalCorners)) {
    return `API-Football statistics list ${statistics.totalCorners} total corners for fixture ${statistics.providerFixtureId}.`;
  }
  return `API-Football statistics were captured for fixture ${statistics.providerFixtureId}.`;
}

export function fixtureMetadataClaim(fixture: Fixture): string {
  const matchup = fixture.homeTeamName && fixture.awayTeamName
    ? `${fixture.homeTeamName} vs ${fixture.awayTeamName}`
    : `fixture ${fixture.providerFixtureId}`;
  return `API-Football lists ${matchup} (${fixture.providerFixtureId}) as ${fixture.status} with scheduled kickoff ${fixture.scheduledAt}.`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
