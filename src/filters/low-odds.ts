import type { AgentConfig } from '../config.js';
import { getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { isApiFootballProviderError } from '../providers/sports/api-football-errors.js';
import { oddsQuoteDedupeKey } from '../providers/sports/api-football-mappers.js';
import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type { JsonValue, LowOddsScanRecord, StoragePrismaClient } from '../storage/types.js';
import { requireDatabaseUrl, resolveFilterConfig } from './config.js';
import { discoverFixtures } from './engine.js';
import type {
  FilterCombineMode,
  FilterReason,
  LowOddsHitView,
  LowOddsScanView,
  RequestedLeaguePresetView,
  RequestedTeamPresetView,
} from './types.js';

export interface LowOddsPersistenceRepositories {
  lowOddsScans: {
    create(input: {
      threshold: number;
      status?: string;
      runId?: string | null;
      startedAt?: Date | null;
      querySnapshot?: JsonValue | null;
    }): Promise<Pick<LowOddsScanRecord, 'id'>>;
    updateStatus(id: string, update: {
      status: string;
      completedAt?: Date | null;
      fixtureCount?: number;
      hitCount?: number;
      errorRedacted?: string | null;
      querySnapshot?: JsonValue | null;
    }): Promise<unknown>;
  };
  lowOddsHits: {
    createMany(inputs: Array<{
      scanId: string;
      fixtureId: string;
      oddsQuoteId?: string | null;
      marketKey: string;
      selectionKey: string;
      line?: number | null;
      odds: number;
      impliedProbability?: number | null;
      bookmaker?: string | null;
      includedReasons?: string[] | JsonValue | null;
      excludedReasons?: string[] | JsonValue | null;
      eligible?: boolean;
      metadata?: JsonValue | null;
    }>): Promise<unknown>;
  };
}

export interface PersistLowOddsScanInput {
  runId?: string | null;
  date: string;
  threshold: number;
  markets: string[];
  bookmakerAllowlist?: string[];
  fixtureCount: number;
  hits: LowOddsHitView[];
  fixtureEvaluations: LowOddsScanView['fixtureEvaluations'];
  requestedLeagues?: RequestedLeaguePresetView[];
  requestedTeams?: RequestedTeamPresetView[];
}

export async function scanLowOdds(
  config: AgentConfig,
  input: {
    date: string;
    threshold?: number;
    leaguesDefault?: boolean;
    teamsDefault?: boolean;
    combineMode?: FilterCombineMode;
  },
  runtime?: RuntimeContext,
): Promise<LowOddsScanView> {
  requireDatabaseUrl(config);
  const filters = resolveFilterConfig(config, {
    date: input.date,
    threshold: input.threshold,
    leaguesDefault: input.leaguesDefault,
    teamsDefault: input.teamsDefault,
    combineMode: input.combineMode,
  });
  const db = getPrismaClient() as unknown as StoragePrismaClient;
  const repositories = createStorageRepositories(db);
  const scan = await repositories.lowOddsScans.create({
    threshold: filters.threshold,
    status: 'running',
    startedAt: new Date(),
    querySnapshot: toJsonValue({
      date: filters.date,
      threshold: filters.threshold,
      markets: filters.markets,
      bookmakerAllowlist: filters.bookmakerAllowlist ?? [],
    }),
  });

  const hits: LowOddsHitView[] = [];
  let fixtureDiscovery: Awaited<ReturnType<typeof discoverFixtures>> = {
    fixtures: [],
    evaluations: [],
    requestedLeagues: [],
    requestedTeams: [],
  };
  let fixtureEvaluations: LowOddsScanView['fixtureEvaluations'] = [];

  try {
    fixtureDiscovery = await discoverFixtures(config, {
      date: filters.date,
      leaguesDefault: input.leaguesDefault,
      teamsDefault: input.teamsDefault,
      combineMode: filters.combineMode,
    }, runtime);
    fixtureEvaluations = [...fixtureDiscovery.evaluations];

    for (const fixture of fixtureDiscovery.fixtures.slice(0, filters.maxFixturesPerRun)) {
      try {
        const snapshot = await getApiFootballOddsSnapshot(config, fixture.providerFixtureId, runtime);
        const marketQuotes = snapshot.quotes.filter((quote) => filters.markets.includes(quote.market));
        const bookmakerQuotes = filters.bookmakerAllowlist?.length
          ? marketQuotes.filter((quote) => quote.bookmaker && filters.bookmakerAllowlist?.includes(quote.bookmaker))
          : marketQuotes;

        if (!snapshot.quotes.length) {
          addEvaluationReason(fixtureEvaluations, fixture.providerFixtureId, 'excluded-missing-odds');
          continue;
        }
        if (!marketQuotes.length) {
          addEvaluationReason(fixtureEvaluations, fixture.providerFixtureId, 'excluded-market-not-available');
          continue;
        }

        const lowQuotes = bookmakerQuotes.filter((quote) => quote.price <= filters.threshold);
        if (!lowQuotes.length) {
          addEvaluationReason(fixtureEvaluations, fixture.providerFixtureId, 'excluded-above-threshold');
          continue;
        }

        for (const quote of lowQuotes) {
          const quoteKey = oddsQuoteDedupeKey(quote);
          const oddsQuoteId = snapshot.quoteRecordIds?.[quoteKey];
          await repositories.lowOddsHits.create({
            scanId: scan.id,
            fixtureId: fixture.id,
            oddsQuoteId,
            marketKey: quote.market,
            selectionKey: quote.selection,
            line: quote.line ?? null,
            odds: quote.price,
            impliedProbability: quote.impliedProbability,
            bookmaker: quote.bookmaker,
            includedReasons: ['included-by-low-odds-threshold'],
            excludedReasons: [],
            eligible: true,
            metadata: {
              providerFixtureId: fixture.providerFixtureId,
              sourceSnapshotId: quote.sourceSnapshotId,
            },
          });
          hits.push({
            fixtureId: fixture.id,
            providerFixtureId: fixture.providerFixtureId,
            market: quote.market,
            selection: quote.selection,
            line: quote.line,
            odds: quote.price,
            impliedProbability: quote.impliedProbability,
            bookmaker: quote.bookmaker,
            oddsQuoteId,
            includedReasons: ['included-by-low-odds-threshold'],
            excludedReasons: [],
          });
        }
      } catch (err) {
        addEvaluationReason(
          fixtureEvaluations,
          fixture.providerFixtureId,
          isApiFootballProviderError(err) && err.code === 'rate_limited'
            ? 'excluded-provider-rate-limit'
            : 'excluded-missing-odds',
        );
      }
    }

    await repositories.lowOddsScans.updateStatus(scan.id, {
      status: 'succeeded',
      completedAt: new Date(),
      fixtureCount: fixtureDiscovery.fixtures.length,
      hitCount: hits.length,
      querySnapshot: toJsonValue({
        date: filters.date,
        threshold: filters.threshold,
        markets: filters.markets,
        bookmakerAllowlist: filters.bookmakerAllowlist ?? [],
        requestedLeagues: fixtureDiscovery.requestedLeagues,
        requestedTeams: fixtureDiscovery.requestedTeams,
        fixtureEvaluations,
      }),
    });
  } catch (err) {
    await repositories.lowOddsScans.updateStatus(scan.id, {
      status: 'failed',
      completedAt: new Date(),
      fixtureCount: fixtureDiscovery.fixtures.length,
      hitCount: hits.length,
      errorRedacted: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return {
    scanId: scan.id,
    date: filters.date,
    threshold: filters.threshold,
    fixtureCount: fixtureDiscovery.fixtures.length,
    hitCount: hits.length,
    hits,
    fixtureEvaluations,
    requestedLeagues: fixtureDiscovery.requestedLeagues,
    requestedTeams: fixtureDiscovery.requestedTeams,
  };
}

export async function persistLowOddsScanResult(
  repositories: LowOddsPersistenceRepositories,
  input: PersistLowOddsScanInput,
): Promise<string> {
  const scan = await repositories.lowOddsScans.create({
    threshold: input.threshold,
    status: 'running',
    runId: input.runId ?? null,
    startedAt: new Date(),
    querySnapshot: toJsonValue({
      date: input.date,
      threshold: input.threshold,
      markets: input.markets,
      bookmakerAllowlist: input.bookmakerAllowlist ?? [],
    }),
  });

  try {
    if (input.hits.length > 0) {
      await repositories.lowOddsHits.createMany(input.hits.map((hit) => ({
        scanId: scan.id,
        fixtureId: hit.fixtureId,
        oddsQuoteId: hit.oddsQuoteId,
        marketKey: hit.market,
        selectionKey: hit.selection,
        line: hit.line ?? null,
        odds: hit.odds,
        impliedProbability: hit.impliedProbability,
        bookmaker: hit.bookmaker,
        includedReasons: hit.includedReasons,
        excludedReasons: hit.excludedReasons,
        eligible: true,
        metadata: {
          providerFixtureId: hit.providerFixtureId,
        },
      })));
    }

    await repositories.lowOddsScans.updateStatus(scan.id, {
      status: 'succeeded',
      completedAt: new Date(),
      fixtureCount: input.fixtureCount,
      hitCount: input.hits.length,
      querySnapshot: toJsonValue({
        date: input.date,
        threshold: input.threshold,
        markets: input.markets,
        bookmakerAllowlist: input.bookmakerAllowlist ?? [],
        requestedLeagues: input.requestedLeagues ?? [],
        requestedTeams: input.requestedTeams ?? [],
        fixtureEvaluations: input.fixtureEvaluations,
      }),
    });
  } catch (err) {
    await repositories.lowOddsScans.updateStatus(scan.id, {
      status: 'failed',
      completedAt: new Date(),
      fixtureCount: input.fixtureCount,
      hitCount: input.hits.length,
      errorRedacted: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return scan.id;
}

function addEvaluationReason(
  evaluations: LowOddsScanView['fixtureEvaluations'],
  providerFixtureId: string,
  reason: FilterReason,
): void {
  const evaluation = evaluations.find((item) => item.providerFixtureId === providerFixtureId);
  if (!evaluation) return;
  if (!evaluation.excludedReasons.includes(reason)) evaluation.excludedReasons.push(reason);
  evaluation.eligible = false;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  return null;
}
