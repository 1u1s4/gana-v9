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
  FixtureStatistics,
  OddsQuery,
  SportsDataProvider,
} from '../providers/sports/types.js';
import type { SourceRecord } from './types.js';

export type ResearchSportsProvider = Pick<SportsDataProvider, 'getFixture'> &
  Partial<Pick<SportsDataProvider, 'getFixtureStatistics'>> & {
    getCanonicalOddsSnapshot?(input: OddsQuery): Promise<CanonicalOddsSnapshot>;
  };

export interface ResearchProviderContext {
  fixtureStatistics?: FixtureStatistics;
  oddsSnapshot?: CanonicalOddsSnapshot;
  warnings: string[];
}

export async function createDefaultSportsProvider(
  config: AgentConfig,
  runtime: RuntimeContext,
): Promise<ResearchSportsProvider> {
  const persistence = await createApiFootballPersistence(config, runtime);
  return createApiFootballProvider(config, persistence);
}

export async function buildResearchProviderContext(
  provider: ResearchSportsProvider,
  fixture: Fixture,
  inputOddsSnapshot?: CanonicalOddsSnapshot,
  markets?: MarketKey[],
): Promise<ResearchProviderContext> {
  const warnings: string[] = [];
  const fixtureStatistics = await fetchFixtureStatistics(provider, fixture.providerFixtureId, warnings);
  const oddsSnapshot = inputOddsSnapshot
    ?? await fetchCanonicalOddsSnapshot(provider, fixture.providerFixtureId, warnings, markets);

  return {
    ...(fixtureStatistics && { fixtureStatistics }),
    ...(oddsSnapshot && { oddsSnapshot }),
    warnings: uniqueStrings(warnings),
  };
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
