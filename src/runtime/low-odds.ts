import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { isMarketKey, normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import { type FixtureDiscoveryResult } from '../filters/engine.js';
import { isLowOddsFixtureSelectorQuote, lowOddsSelectorMarketScope } from '../filters/low-odds-selector.js';
import type { LowOddsHitView, LowOddsScanView } from '../filters/types.js';
import type { FixtureScoringResult } from '../prediction/service.js';
import { oddsQuoteDedupeKey } from '../providers/sports/api-football-mappers.js';
import type { OddsSnapshotView, PipelinePriorityLeague } from './pipeline.js';

interface LowOddsPredictionCoverage {
  threshold: number;
  hits: number;
  scopedHits: number;
  indicatorFixtures: number;
  excludedIndicatorFixtures: number;
  scoredIndicatorFixtures: number;
  missingIndicatorFixtureIds: string[];
  excludedIndicatorFixtureIds: string[];
  hitsWithOddsQuoteId: number;
  uniqueHitOddsQuoteIds: number;
  predictedHitOddsQuoteIds: number;
  missingPredictionHits: number;
  unlinkedHits: number;
  complete: boolean;
  missingOddsQuoteIds: string[];
}

const EMPTY_LOW_ODDS_SCAN: Omit<LowOddsScanView, 'date' | 'threshold'> = {
  fixtureCount: 0,
  hitCount: 0,
  hits: [],
  fixtureEvaluations: [],
};

export function lowOddsGlobalDiscoveryConfig(config: AgentConfig, maxFixturesPerRun: number): AgentConfig {
  return {
    ...config,
    apiFootball: {
      ...config.apiFootball,
      maxFixturesPerRun,
    },
  };
}

export function buildLowOddsScan(
  date: string,
  config: AgentConfig,
  discovery: FixtureDiscoveryResult,
  snapshots: OddsSnapshotView[],
  requestedMarkets?: readonly MarketKey[],
): LowOddsScanView {
  const hits: LowOddsHitView[] = [];
  const analysisMarketScope = normalizeMarketScope(requestedMarkets, config.apiFootball.defaultMarkets);
  const selectorMarketScope = lowOddsSelectorMarketScope(analysisMarketScope);
  const fixturesByProviderId = new Map(discovery.fixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
  for (const snapshot of snapshots) {
    const fixture = fixturesByProviderId.get(snapshot.providerFixtureId);
    if (!fixture) continue;
    for (const quote of snapshot.quotes) {
      if (!isLowOddsFixtureSelectorQuote(quote, selectorMarketScope)) continue;
      if (quote.price > config.apiFootball.lowOddsThreshold) continue;
      hits.push({
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        market: quote.market,
        selection: quote.selection,
        line: quote.line,
        odds: quote.price,
        impliedProbability: quote.impliedProbability,
        bookmaker: quote.bookmaker,
        oddsQuoteId: snapshot.quoteRecordIds?.[oddsQuoteDedupeKey(quote)],
        includedReasons: ['included-by-low-odds-threshold'],
        excludedReasons: [],
      });
    }
  }
  return {
    scanId: undefined,
    date,
    threshold: config.apiFootball.lowOddsThreshold,
    marketScope: [...analysisMarketScope],
    selectorMarketScope: [...selectorMarketScope],
    analysisMarketScope: [...analysisMarketScope],
    marketCoverage: buildLowOddsMarketCoverage(analysisMarketScope, selectorMarketScope, snapshots, hits),
    fixtureCount: discovery.fixtures.length,
    hitCount: hits.length,
    hits,
    candidateFixtures: discovery.fixtures,
    fixtureEvaluations: discovery.evaluations,
    requestedLeagues: discovery.requestedLeagues,
    requestedTeams: discovery.requestedTeams,
  };
}

function buildLowOddsMarketCoverage(
  analysisMarkets: readonly MarketKey[],
  selectorMarkets: readonly MarketKey[],
  snapshots: OddsSnapshotView[],
  hits: LowOddsHitView[],
): NonNullable<LowOddsScanView['marketCoverage']> {
  const quotedMarkets = [...new Set(snapshots.flatMap((snapshot) => snapshot.quotes.map((quote) => quote.market)).filter(isMarketKey))].sort();
  const hitMarkets = [...new Set(hits.map((hit) => hit.market).filter(isMarketKey))].sort();
  return {
    requestedMarkets: [...analysisMarkets],
    quotedMarkets,
    hitMarkets,
    missingMarkets: selectorMarkets.filter((market) => !quotedMarkets.includes(market)),
    selectorMarketScope: [...selectorMarkets],
    analysisMarketScope: [...analysisMarkets],
  };
}

export function selectLowOddsHitFixtures(fixtures: Fixture[], lowOddsScan: LowOddsScanView): Fixture[] {
  if (!fixtures.length || !lowOddsScan.hits.length) return [];
  const hitStats = new Map<string, { hitCount: number; minOdds: number }>();
  for (const hit of lowOddsScan.hits) {
    const existing = hitStats.get(hit.providerFixtureId);
    hitStats.set(hit.providerFixtureId, {
      hitCount: (existing?.hitCount ?? 0) + 1,
      minOdds: Math.min(existing?.minOdds ?? Number.POSITIVE_INFINITY, hit.odds),
    });
  }
  return fixtures
    .filter((fixture) => hitStats.has(fixture.providerFixtureId))
    .sort((left, right) => {
      const leftStats = hitStats.get(left.providerFixtureId);
      const rightStats = hitStats.get(right.providerFixtureId);
      const oddsDelta = (leftStats?.minOdds ?? Number.POSITIVE_INFINITY) - (rightStats?.minOdds ?? Number.POSITIVE_INFINITY);
      if (oddsDelta !== 0) return oddsDelta;
      const hitDelta = (rightStats?.hitCount ?? 0) - (leftStats?.hitCount ?? 0);
      if (hitDelta !== 0) return hitDelta;
      return left.scheduledAt.localeCompare(right.scheduledAt);
    });
}

export function uniqueFixtureCount(fixtures: Fixture[]): number {
  return new Set(fixtures.map((fixture) => fixture.providerFixtureId)).size;
}

export function fixtureLocalDateKey(scheduledAt: string, timezone: string): string {
  const date = new Date(scheduledAt);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
  } catch {
    return scheduledAt.slice(0, 10);
  }
}

export function mergeFixtureSlates(primary: Fixture[], secondary: Fixture[]): Fixture[] {
  const merged = new Map<string, Fixture>();
  for (const fixture of [...primary, ...secondary]) merged.set(fixture.providerFixtureId, fixture);
  return [...merged.values()];
}

export function prioritizeFixtureSlate(fixtures: Fixture[], priorityLeagues: readonly PipelinePriorityLeague[]): Fixture[] {
  if (!priorityLeagues.length || fixtures.length < 2) return fixtures;
  return fixtures
    .map((fixture, index) => ({ fixture, index, priorityIndex: fixturePriorityIndex(fixture, priorityLeagues) }))
    .sort((a, b) => {
      if (a.priorityIndex === null && b.priorityIndex === null) return a.index - b.index;
      if (a.priorityIndex === null) return 1;
      if (b.priorityIndex === null) return -1;
      return a.priorityIndex - b.priorityIndex || a.index - b.index;
    })
    .map((item) => item.fixture);
}

export function fixturePriorityIndex(fixture: Fixture, priorityLeagues: readonly PipelinePriorityLeague[]): number | null {
  const index = priorityLeagues.findIndex((league) => fixtureMatchesPriorityLeague(fixture, league));
  return index === -1 ? null : index;
}

function fixtureMatchesPriorityLeague(fixture: Fixture, league: PipelinePriorityLeague): boolean {
  const providerCompetitionId = String(league.providerCompetitionId ?? '').trim();
  if (!providerCompetitionId) return false;
  const idMatches = String(fixture.leagueId ?? fixture.competitionId ?? '') === providerCompetitionId;
  const nameMatches = league.name && fixture.competitionName
    ? fixture.competitionName.trim().toLowerCase() === league.name.trim().toLowerCase()
    : false;
  if (!idMatches && !nameMatches) return false;
  if (league.season !== null && league.season !== undefined && fixture.season !== undefined && fixture.season !== league.season) return false;
  return true;
}

export function buildLowOddsPredictionCoverage(
  scan: LowOddsScanView,
  scoring: FixtureScoringResult[],
  selectedFixtures: Fixture[] = [],
): LowOddsPredictionCoverage {
  const selectedFixtureIds = new Set(selectedFixtures.map((fixture) => fixture.id));
  const scopedHits = selectedFixtureIds.size
    ? scan.hits.filter((hit) => selectedFixtureIds.has(hit.fixtureId))
    : scan.hits;
  const excludedIndicatorFixtureIds = selectedFixtureIds.size
    ? [...new Set(scan.hits.map((hit) => hit.fixtureId).filter((fixtureId) => !selectedFixtureIds.has(fixtureId)))]
    : [];
  const hitQuoteFixtures = new Map<string, string>();
  for (const hit of scopedHits) hitQuoteFixtures.set(lowOddsSemanticKey(hit), hit.fixtureId);
  const uniqueHitQuoteIds = [...hitQuoteFixtures.keys()];
  const indicatorFixtureIds = [...new Set(scopedHits.map((hit) => hit.fixtureId))];
  const scoredFixtureIds = new Set(scoring.flatMap((result) => {
    if (!result.predictions.length) return [];
    return [
      ...(result.fixtureId ? [result.fixtureId] : []),
      ...result.predictions.map((prediction) => prediction.fixtureId),
    ].filter((fixtureId): fixtureId is string => typeof fixtureId === 'string' && fixtureId.length > 0);
  }));
  const missingIndicatorFixtureIds = indicatorFixtureIds.filter((fixtureId) => !scoredFixtureIds.has(fixtureId));
  const missingIndicatorFixtureIdSet = new Set(missingIndicatorFixtureIds);
  const missingOddsQuoteIds = uniqueHitQuoteIds.filter((id) => {
    const fixtureId = hitQuoteFixtures.get(id);
    return fixtureId ? missingIndicatorFixtureIdSet.has(fixtureId) : true;
  });
  const unlinkedHits = 0;
  return {
    threshold: scan.threshold,
    hits: scan.hitCount,
    scopedHits: scopedHits.length,
    indicatorFixtures: indicatorFixtureIds.length,
    excludedIndicatorFixtures: excludedIndicatorFixtureIds.length,
    scoredIndicatorFixtures: indicatorFixtureIds.length - missingIndicatorFixtureIds.length,
    missingIndicatorFixtureIds,
    excludedIndicatorFixtureIds,
    hitsWithOddsQuoteId: uniqueHitQuoteIds.length,
    uniqueHitOddsQuoteIds: uniqueHitQuoteIds.length,
    predictedHitOddsQuoteIds: uniqueHitQuoteIds.length - missingOddsQuoteIds.length,
    missingPredictionHits: missingIndicatorFixtureIds.length,
    unlinkedHits,
    complete: missingIndicatorFixtureIds.length === 0 && unlinkedHits === 0,
    missingOddsQuoteIds,
  };
}

function lowOddsSemanticKey(hit: LowOddsHitView): string {
  return [
    hit.fixtureId,
    hit.market,
    hit.selection,
    hit.line ?? 'null',
  ].join(':');
}

export function emptyLowOddsScan(date: string, threshold: number, marketScope: readonly MarketKey[] = []): LowOddsScanView {
  const selectorMarketScope = lowOddsSelectorMarketScope(marketScope);
  return {
    ...EMPTY_LOW_ODDS_SCAN,
    date,
    threshold,
    marketScope: [...marketScope],
    selectorMarketScope: [...selectorMarketScope],
    analysisMarketScope: [...marketScope],
    marketCoverage: {
      requestedMarkets: [...marketScope],
      quotedMarkets: [],
      hitMarkets: [],
      missingMarkets: [...selectorMarketScope],
      selectorMarketScope: [...selectorMarketScope],
      analysisMarketScope: [...marketScope],
    },
  };
}
