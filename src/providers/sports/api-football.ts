import { createHash } from 'node:crypto';
import type { AgentConfig } from '../../config.js';
import { evaluateEgress } from '../../permissions/egress-policy.js';
import type { Fixture } from '../../domain/fixtures.js';
import type { FixtureStatus } from '../../domain/fixtures.js';
import type { SportsProvider } from '../../domain/ids.js';
import type { OddsQuote } from '../../domain/odds.js';
import { consensusFairPrices } from '../../markets/fair-price.js';
import { isLowLiquidity, marketEfficiencyScore } from '../../markets/efficiency.js';
import type { MarketKey } from '../../domain/markets.js';
import { redactSecrets } from '../../permissions/redaction.js';
import { mapWithConcurrency } from '../../runtime/concurrency.js';
import type { RuntimeContext } from '../../runtime/context.js';
import { createStorageRepositories } from '../../storage/repositories/index.js';
import { getPrismaClient } from '../../storage/db.js';
import type { JsonValue, StoragePrismaClient } from '../../storage/types.js';
import type { ServiceStatusReport } from '../../filters/status.js';
import { ApiFootballProviderError, isApiFootballProviderError, mapHttpStatusToProviderError } from './api-football-errors.js';
import { mapApiFootballTeamStatistics, validateTeamStatisticsQuery } from './api-football-team-statistics.js';
import { mapApiFootballCompletedLeagueFixtures, validateCompletedLeagueFixturesQuery } from './api-football-history.js';
import {
  extractApiFootballResponseArray,
  mapApiFootballFixtureStatistics,
  mapApiFootballFixtures,
  mapApiFootballOdds,
  oddsQuoteDedupeKey,
} from './api-football-mappers.js';
import {
  buildApiFootballProviderSnapshot,
  parseApiFootballQuotaHeaders,
  type ApiFootballQuotaStatus,
} from './api-football-snapshots.js';
import {
  API_FOOTBALL_PROVIDER,
  type ApiFootballEndpointName,
  type ApiFootballPersistence,
  type ApiFootballProviderConfig,
  type CanonicalOddsSnapshot,
  type CompletedLeagueFixtures,
  type CompletedLeagueFixturesQuery,
  type FixtureByIdQuery,
  type FixtureQuery,
  type FixtureStatistics,
  type FixtureStatisticsQuery,
  type FinalResult,
  type NormalizedFixture,
  type OddsQuery,
  type OddsScanQuery,
  type OddsScanResult,
  type ProviderStatus,
  type QuotaStatus,
  type SportsDataProvider,
  type TeamStatistics,
  type TeamStatisticsQuery,
} from './types.js';

export interface ApiFootballDateOddsSlate {
  fixtures: Fixture[];
  snapshots: CanonicalOddsSnapshot[];
  coverage?: ApiFootballDateOddsCoverage;
}

export interface ApiFootballDateOddsCoverage {
  scope: 'provider-date-odds' | 'requested-fixtures';
  date: string;
  timezone: string;
  pagesExpected: number;
  pagesFetched: number;
  oddsFixtureCount: number;
  resolvedFixtureCount: number;
  missingFixtureIds: string[];
  fixturesWithoutRequestedMarkets: string[];
  complete: boolean;
}

interface ApiFootballResponse<T = unknown> {
  payload: T;
  headers: Headers;
  responseMs: number;
  capturedAt: Date;
  providerSnapshotId?: string;
  payloadHash?: string | null;
}

const API_FOOTBALL_REQUEST_TIMEOUT_MS = 15_000;
const FIXTURE_PERSISTENCE_CONCURRENCY = 3;
const runtimeHistoryCaches = new WeakMap<RuntimeContext, Map<string, Promise<CompletedLeagueFixtures>>>();
const runtimePendingOddsFallbacks = new WeakMap<RuntimeContext, Map<string, Promise<ApiFootballResponse[]>>>();

export function createApiFootballProvider(
  config: ApiFootballProviderConfig,
  persistence: ApiFootballPersistence = {},
  runtime?: RuntimeContext,
): SportsDataProvider {
  return new ApiFootballProvider(config, persistence, runtime);
}

export class ApiFootballProvider implements SportsDataProvider {
  readonly name: SportsProvider = API_FOOTBALL_PROVIDER;
  private readonly localRequestBudget = { providerRequestCount: 0 };
  private readonly historyCache: Map<string, Promise<CompletedLeagueFixtures>>;
  private readonly pendingOddsFallbacks: Map<string, Promise<ApiFootballResponse[]>>;

  constructor(
    private readonly config: ApiFootballProviderConfig,
    private readonly persistence: ApiFootballPersistence = {},
    private readonly runtime?: RuntimeContext,
  ) {
    const shared = runtime && runtimeHistoryCaches.get(runtime);
    this.historyCache = shared ?? new Map();
    if (runtime && !shared) runtimeHistoryCaches.set(runtime, this.historyCache);
    const pendingOdds = runtime && runtimePendingOddsFallbacks.get(runtime);
    this.pendingOddsFallbacks = pendingOdds ?? new Map();
    if (runtime && !pendingOdds) runtimePendingOddsFallbacks.set(runtime, this.pendingOddsFallbacks);
  }

  async getCompletedLeagueFixtures(input: CompletedLeagueFixturesQuery): Promise<CompletedLeagueFixtures> {
    const query = validateCompletedLeagueFixturesQuery(input);
    const account = createHash('sha256').update(this.config.apiFootballKey).digest('hex');
    const key = JSON.stringify([this.config.apiFootballBaseUrl, account, query]);
    const cached = this.historyCache.get(key);
    if (cached) return cached;
    const pending = (async () => {
      const response = await this.request('fixture_history', '/fixtures', { ...query, status: 'FT-AET-PEN', timezone: 'UTC' });
      return mapApiFootballCompletedLeagueFixtures(response.payload, query, response.capturedAt,
        response.payloadHash ?? createHash('sha256').update(JSON.stringify(response.payload)).digest('hex'), response.providerSnapshotId);
    })();
    this.historyCache.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      if (this.historyCache.get(key) === pending) this.historyCache.delete(key);
      throw error;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const checkedAt = new Date();
    const response = await this.request('status', '/status', {});
    const quota = toQuotaStatus(parseApiFootballQuotaHeaders(response.headers, response.capturedAt), response.responseMs);
    return {
      provider: this.name,
      ready: true,
      checkedAt: checkedAt.toISOString(),
      responseMs: response.responseMs,
      quota,
      message: 'API-Football responded to status check.',
    };
  }

  async getQuota(): Promise<QuotaStatus> {
    const response = await this.request('status', '/status', {});
    return toQuotaStatus(parseApiFootballQuotaHeaders(response.headers, response.capturedAt), response.responseMs);
  }

  async listFixtures(input: FixtureQuery): Promise<Fixture[]> {
    const maxFixtures = input.maxFixtures ?? this.config.apiFootball.maxFixturesPerRun;
    const query: Record<string, string | number> = { date: input.date };
    const timezone = input.timezone ?? this.config.apiFootball.timezone;
    if (timezone) query.timezone = timezone;
    if (input.league !== undefined) query.league = input.league;
    if (input.team !== undefined) query.team = input.team;
    if (input.season !== undefined) query.season = input.season;

    const responses = await this.requestFixtureDiscovery(input, query);
    const normalized = dedupeNormalizedFixtures(responses
      .flatMap((response) => mapApiFootballFixtures(response.payload, response.capturedAt)))
      .slice(0, maxFixtures);
    const persisted = await this.persistence.upsertFixtures?.(normalized);
    return persisted?.map((item) => fixtureWithNormalizedNames(item.fixture, item.normalized))
      ?? normalized.map(fallbackFixtureFromNormalized);
  }

  async getFixture(input: FixtureByIdQuery): Promise<Fixture> {
    const response = await this.request('fixture_result', '/fixtures', { id: input.providerFixtureId });
    const fixtures = mapApiFootballFixtures(response.payload, response.capturedAt);
    const normalized = fixtures[0];
    if (!normalized) {
      throw new ApiFootballProviderError({
        code: 'fixture_not_found',
        endpointName: 'fixture_result',
        fixtureId: input.providerFixtureId,
        message: 'API-Football did not return the requested fixture.',
        expected: 'One fixture in response array.',
        received: response.payload,
        nextAction: 'Verify the provider fixture ID and retry.',
      });
    }
    const persisted = await this.persistence.upsertFixtures?.([normalized]);
    const fixture = persisted?.[0]?.fixture ?? fallbackFixtureFromNormalized(normalized);
    return {
      ...fixture,
      homeTeamName: normalized.homeTeam?.name,
      awayTeamName: normalized.awayTeam?.name,
      providerHomeTeamId: normalized.homeTeam?.providerTeamId,
      providerAwayTeamId: normalized.awayTeam?.providerTeamId,
      ...(response.providerSnapshotId && { providerSnapshotId: response.providerSnapshotId }),
    };
  }

  async getOdds(input: OddsQuery): Promise<OddsQuote[]> {
    const snapshot = await this.getCanonicalOddsSnapshot(input);
    return snapshot.quotes;
  }

  async scanOdds(input: OddsScanQuery): Promise<OddsScanResult[]> {
    const fixtures = await this.listFixtures(input);
    const results: OddsScanResult[] = [];

    for (const fixture of fixtures) {
      const snapshot = await this.getCanonicalOddsSnapshot({ fixtureId: fixture.providerFixtureId });
      results.push({
        fixtureId: snapshot.fixtureId,
        quotes: snapshot.quotes,
      });
    }

    return results;
  }

  async getFinalResult(input: { providerFixtureId: string }): Promise<FinalResult> {
    const response = await this.request('fixture_result', '/fixtures', { id: input.providerFixtureId });
    const fixtures = mapApiFootballFixtures(response.payload, response.capturedAt);
    const normalized = fixtures[0];
    if (!normalized) {
      throw new ApiFootballProviderError({
        code: 'fixture_not_found',
        endpointName: 'fixture_result',
        fixtureId: input.providerFixtureId,
        message: 'API-Football did not return the requested fixture.',
        expected: 'One fixture in response array.',
        received: response.payload,
        nextAction: 'Verify the provider fixture ID and retry.',
      });
    }
    const persisted = await this.persistence.upsertFixtures?.([normalized]);
    const fixture = persisted?.[0]?.fixture ?? fallbackFixtureFromNormalized(normalized);
    if (!Number.isFinite(fixture.scoreHome) || !Number.isFinite(fixture.scoreAway)) {
      throw new ApiFootballProviderError({
        code: 'invalid_provider_response',
        endpointName: 'fixture_result',
        fixtureId: input.providerFixtureId,
        message: 'Fixture result does not include final score.',
        expected: 'scoreHome and scoreAway in provider response.',
        received: fixture,
        nextAction: 'Retry after fixture is completed or inspect provider response.',
      });
    }
    return {
      fixture,
      scoreHome: fixture.scoreHome as number,
      scoreAway: fixture.scoreAway as number,
      ...(response.providerSnapshotId && { providerSnapshotId: response.providerSnapshotId }),
    };
  }

  async getFixtureStatistics(input: FixtureStatisticsQuery): Promise<FixtureStatistics> {
    const response = await this.request('fixture_statistics', '/fixtures/statistics', { fixture: input.providerFixtureId });
    return mapApiFootballFixtureStatistics(response.payload, {
      providerFixtureId: input.providerFixtureId,
      capturedAt: response.capturedAt,
      providerSnapshotId: response.providerSnapshotId,
    });
  }

  async getTeamStatistics(input: TeamStatisticsQuery): Promise<TeamStatistics> {
    const query = validateTeamStatisticsQuery(input);
    const response = await this.request('team_statistics', '/teams/statistics', { ...query });
    return mapApiFootballTeamStatistics(response.payload, query, response.capturedAt, response.providerSnapshotId);
  }

  async getCanonicalOddsSnapshot(input: OddsQuery): Promise<CanonicalOddsSnapshot> {
    const fixture = await this.resolveFixtureForOdds(input.fixtureId);
    const markets = input.markets ?? this.config.apiFootball.defaultMarkets;
    let pages = await this.requestPagedOdds(input.fixtureId, markets);
    let extraMetadata: Record<string, JsonValue> = {};
    let fallbackFixtureId: string | undefined;
    if (pages.every((page) => extractApiFootballResponseArray(page.payload, 'odds').length === 0)) {
      const query = fixtureOddsFallbackQuery(fixture, input.fixtureId, this.config.apiFootball.timezone, markets);
      if (query) {
        const emptyFixtureSnapshotIds = pages.map((page) => page.providerSnapshotId ?? `provider-snapshot:${page.payloadHash ?? 'unknown'}`);
        const fallbackPages = await this.requestFreshLeagueDateOdds(query);
        const matchingPages = fallbackPages.filter((page) => extractApiFootballResponseArray(page.payload, 'odds')
          .some((row) => stringifyFixtureProviderId((row as any)?.fixture?.id) === input.fixtureId));
        // Canonical provenance must point to a page containing this fixture, when found.
        pages = matchingPages.length ? matchingPages : fallbackPages;
        fallbackFixtureId = input.fixtureId;
        extraMetadata = {
          source: 'api-football.odds.fixture-empty-league-date',
          fixtureOddsFallback: {
            query,
            emptyFixtureSnapshotIds,
            pagesExpected: readPagingTotal(fallbackPages[0]?.payload),
            pagesFetched: fallbackPages.length,
            providerSnapshotIds: fallbackPages.map((page) => page.providerSnapshotId ?? `provider-snapshot:${page.payloadHash ?? 'unknown'}`),
            matchedFixture: matchingPages.length > 0,
          },
        };
      } else {
        extraMetadata = { fixtureOddsFallback: { skipped: 'fixture-scope-unavailable' } };
      }
    }
    const mappedQuotes = pages.flatMap((page) => mapApiFootballOdds(fallbackFixtureId ? {
      response: extractApiFootballResponseArray(page.payload, 'odds')
        .filter((row) => stringifyFixtureProviderId((row as any)?.fixture?.id) === fallbackFixtureId),
    } : page.payload, {
      fixtureId: fixture.id,
      providerSnapshotId: page.providerSnapshotId ?? `provider-snapshot:${page.payloadHash ?? 'unknown'}`,
      capturedAt: page.capturedAt,
    }));
    return this.buildAndPersistOddsSnapshot({
      fixture,
      providerFixtureId: input.fixtureId,
      pages,
      mappedQuotes: filterQuotesByMarkets(mappedQuotes, markets),
      extraMetadata,
    });
  }

  async getCanonicalOddsSnapshotsForDate(input: { date: string; fixtures?: Fixture[]; markets?: MarketKey[] }): Promise<CanonicalOddsSnapshot[]> {
    return (await this.getCanonicalOddsSlateForDate(input)).snapshots;
  }

  async getCanonicalOddsSlateForDate(input: { date: string; fixtures?: Fixture[]; markets?: MarketKey[] }): Promise<ApiFootballDateOddsSlate> {
    const markets = input.markets ?? this.config.apiFootball.defaultMarkets;
    const pages = await this.requestPagedDateOdds(input.date, markets);
    const fixtureIds = uniqueStrings(pages.flatMap((page) => extractApiFootballResponseArray(page.payload, 'odds')
      .map((fixtureOdds) => stringifyFixtureProviderId((fixtureOdds as any)?.fixture?.id))
      .filter((value): value is string => Boolean(value))));
    const fixtures = input.fixtures?.length
      ? input.fixtures
      : await this.resolveFixturesByProviderIds(fixtureIds);
    const fixturesByProviderId = new Map(fixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
    const snapshots: CanonicalOddsSnapshot[] = [];
    const groupedOdds = new Map<string, { fixture: Fixture; pages: ApiFootballResponse[]; quotes: OddsQuote[] }>();

    for (const page of pages) {
      for (const fixtureOdds of extractApiFootballResponseArray(page.payload, 'odds')) {
        const providerFixtureId = stringifyFixtureProviderId((fixtureOdds as any)?.fixture?.id);
        if (!providerFixtureId) continue;
        const fixture = fixturesByProviderId.get(providerFixtureId);
        if (!fixture) continue;
        const mappedQuotes = mapApiFootballOdds({ response: [fixtureOdds] }, {
          fixtureId: fixture.id,
          providerSnapshotId: page.providerSnapshotId ?? `provider-snapshot:${page.payloadHash ?? 'unknown'}`,
          capturedAt: page.capturedAt,
        });
        const group = groupedOdds.get(providerFixtureId) ?? { fixture, pages: [], quotes: [] };
        if (!group.pages.includes(page)) group.pages.push(page);
        group.quotes.push(...filterQuotesByMarkets(mappedQuotes, markets));
        groupedOdds.set(providerFixtureId, group);
      }
    }
    const requestedFixtureIds = input.fixtures?.length ? input.fixtures.map((fixture) => fixture.providerFixtureId) : fixtureIds;
    const missingFixtureIds = requestedFixtureIds.filter((id) => !fixturesByProviderId.has(id));
    const fixturesWithoutRequestedMarkets = requestedFixtureIds.filter((id) => !groupedOdds.get(id)?.quotes.length);
    const coverage: ApiFootballDateOddsCoverage = {
      scope: input.fixtures?.length ? 'requested-fixtures' : 'provider-date-odds',
      date: input.date,
      timezone: this.config.apiFootball.timezone,
      pagesExpected: readPagingTotal(pages[0]?.payload),
      pagesFetched: pages.length,
      oddsFixtureCount: fixtureIds.length,
      resolvedFixtureCount: fixtures.length,
      missingFixtureIds,
      fixturesWithoutRequestedMarkets,
      complete: missingFixtureIds.length === 0,
    };
    for (const [providerFixtureId, group] of groupedOdds) {
      snapshots.push(await this.buildAndPersistOddsSnapshot({
        fixture: group.fixture,
        providerFixtureId,
        pages: group.pages,
        mappedQuotes: group.quotes,
        extraMetadata: { source: 'api-football.odds.date', date: input.date, coverage: { ...coverage } },
      }));
    }

    return { fixtures, snapshots, coverage };
  }

  private async buildAndPersistOddsSnapshot(input: {
    fixture: Fixture;
    providerFixtureId: string;
    pages: Array<ApiFootballResponse<unknown>>;
    mappedQuotes: OddsQuote[];
    extraMetadata?: Record<string, JsonValue>;
  }): Promise<CanonicalOddsSnapshot> {
    const dedupedQuotes = dedupeQuotes(input.mappedQuotes);
    const quotes = filterQuotesByBookmakerAllowlistWithFallback(
      dedupedQuotes,
      this.config.apiFootball.bookmakerAllowlist,
    );
    const firstPage = input.pages[0];
    const snapshot: CanonicalOddsSnapshot = {
      fixtureId: input.fixture.id,
      providerFixtureId: input.providerFixtureId,
      providerSnapshotId: firstPage?.providerSnapshotId ?? `provider-snapshot:${firstPage?.payloadHash ?? 'unknown'}`,
      capturedAt: firstPage?.capturedAt.toISOString() ?? new Date().toISOString(),
      bookmakerCount: countBookmakersFromQuotes(quotes),
      payloadHash: firstPage?.payloadHash ?? 'unknown',
      quotes,
      marketReferenceQuotes: dedupedQuotes,
      metadata: {
        ...input.extraMetadata,
        providerSnapshotIds: input.pages.map((page) => page.providerSnapshotId ?? `provider-snapshot:${page.payloadHash ?? 'unknown'}`),
        bookmakerAllowlist: this.config.apiFootball.bookmakerAllowlist ?? [],
        marketReferenceScope: 'all-returned-bookmakers',
        marketReferenceBookmakerCount: countBookmakersFromQuotes(dedupedQuotes),
        selectedBookmakerCount: countBookmakersFromQuotes(quotes),
        bookmakerAllowlistFallback: quotes.length > 0 && dedupedQuotes.length > 0 && quotes.length === dedupedQuotes.length
          && normalizeBookmakerAllowlist(this.config.apiFootball.bookmakerAllowlist).size > 0
          && filterQuotesByBookmakerAllowlist(dedupedQuotes, this.config.apiFootball.bookmakerAllowlist).length === 0,
      } as unknown as JsonValue,
    };

    return await this.persistence.persistOddsSnapshot?.(snapshot) ?? snapshot;
  }

  private async requestFixtureDiscovery(
    input: FixtureQuery,
    query: Record<string, string | number>,
  ): Promise<Array<ApiFootballResponse<unknown>>> {
    try {
      return [await this.request('fixtures', '/fixtures', query)];
    } catch (err) {
      if (!shouldRetryFixtureDiscoveryWithSeason(input, err)) throw err;
      const responses: Array<ApiFootballResponse<unknown>> = [];
      let lastError: unknown = err;
      for (const season of inferFixtureDiscoverySeasons(input.date)) {
        try {
          const response = await this.request('fixtures', '/fixtures', { ...query, season });
          responses.push(response);
          if (apiFootballResponseHasRows(response.payload)) return responses;
        } catch (seasonErr) {
          lastError = seasonErr;
        }
      }
      if (responses.length) return responses;
      throw lastError;
    }
  }

  private async resolveFixtureForOdds(providerFixtureId: string): Promise<Fixture> {
    const existing = await this.persistence.resolveFixtureByProviderFixtureId?.(providerFixtureId);
    if (existing) return existing;
    return this.getFixture({ providerFixtureId });
  }

  private async resolveFixturesByProviderIds(providerFixtureIds: string[]): Promise<Fixture[]> {
    const uniqueIds = uniqueStrings(providerFixtureIds);
    const fixtures: Fixture[] = [];
    const missingIds: string[] = [];
    for (const providerFixtureId of uniqueIds) {
      const existing = await this.persistence.resolveFixtureByProviderFixtureId?.(providerFixtureId);
      if (existing) fixtures.push(existing);
      else missingIds.push(providerFixtureId);
    }
    for (const chunk of chunkStrings(missingIds, 20)) {
      const response = await this.request('fixtures', '/fixtures', { ids: chunk.join('-') });
      const normalized = mapApiFootballFixtures(response.payload, response.capturedAt);
      const persisted = await this.persistence.upsertFixtures?.(normalized);
      fixtures.push(...(persisted?.map((item) => fixtureWithNormalizedNames(item.fixture, item.normalized))
        ?? normalized.map(fallbackFixtureFromNormalized)));
    }
    return fixtures;
  }

  private async requestPagedOdds(providerFixtureId: string, markets: readonly MarketKey[]): Promise<Array<ApiFootballResponse<unknown>>> {
    return this.requestAllOddsPages({ fixture: providerFixtureId, ...oddsMarketQuery(markets) });
  }

  private async requestPagedDateOdds(date: string, markets: readonly MarketKey[]): Promise<Array<ApiFootballResponse<unknown>>> {
    return this.requestAllOddsPages({ date, timezone: this.config.apiFootball.timezone, ...oddsMarketQuery(markets) });
  }

  private async requestFreshLeagueDateOdds(query: Record<string, string | number>): Promise<ApiFootballResponse[]> {
    const account = createHash('sha256').update(this.config.apiFootballKey).digest('hex');
    const key = JSON.stringify([this.config.apiFootballBaseUrl, account, query]);
    const existing = this.pendingOddsFallbacks.get(key);
    if (existing) return existing;
    const pending = this.requestAllOddsPages(query);
    this.pendingOddsFallbacks.set(key, pending);
    try {
      return await pending;
    } finally {
      // Share concurrent requests only; every later lookup must obtain fresh odds.
      if (this.pendingOddsFallbacks.get(key) === pending) this.pendingOddsFallbacks.delete(key);
    }
  }

  private async requestAllOddsPages(query: Record<string, string | number>): Promise<Array<ApiFootballResponse<unknown>>> {
    const first = await this.request('odds', '/odds', query);
    const pages = [first];
    const total = readPagingTotal(first.payload);
    assertOddsPage(first.payload, 1, total);
    const budget = this.runtime ?? this.localRequestBudget;
    const limit = this.runtime?.providerRequestLimit ?? this.config.apiFootball.maxProviderRequestsPerRun;
    if (Number.isFinite(limit) && limit > 0 && total - 1 > limit - (budget.providerRequestCount ?? 0)) {
      throw new ApiFootballProviderError({
        code: 'rate_limited',
        endpointName: 'odds',
        message: `Incomplete odds coverage: ${total} pages exceed the remaining provider request budget.`,
        received: { pagesFetched: 1, pagesExpected: total, providerRequestCount: budget.providerRequestCount ?? 0, limit },
        nextAction: 'Review provider quota and the run request budget before retrying the complete scan.',
      });
    }
    for (let page = 2; page <= total; page++) {
      const next = await this.request('odds', '/odds', { ...query, page });
      assertOddsPage(next.payload, page, total);
      pages.push(next);
    }
    return pages;
  }

  private async request<T = unknown>(
    endpointName: ApiFootballEndpointName,
    path: string,
    query: Record<string, string | number | boolean>,
  ): Promise<ApiFootballResponse<T>> {
    const apiKey = this.config.apiFootballKey?.trim();
    if (!apiKey) {
      throw new ApiFootballProviderError({
        code: 'provider_unavailable',
        endpointName,
        message: 'API_FOOTBALL_KEY is required for API-Football requests.',
        expected: 'API_FOOTBALL_KEY environment variable.',
        nextAction: 'Set API_FOOTBALL_KEY and retry.',
      });
    }

    const url = buildApiFootballUrl(this.config.apiFootballBaseUrl, path, query);
    const egress = evaluateEgress({ url, config: this.config });
    if (!egress.allowed) {
      throw new ApiFootballProviderError({
        code: 'provider_unavailable',
        endpointName,
        message: egress.reason ?? 'API-Football egress blocked by policy.',
        expected: 'Network access to an allowlisted API-Football host.',
        received: egress.host,
        nextAction: 'Set API_FOOTBALL_BASE_URL to an allowlisted provider URL.',
      });
    }
    reserveProviderRequest(this.config, this.runtime ?? this.localRequestBudget, endpointName);
    const headers = { 'x-apisports-key': apiKey };
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: apiFootballRequestSignal(),
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new ApiFootballProviderError({
        code: 'provider_unavailable',
        endpointName,
        message: aborted
          ? `API-Football request timed out after ${API_FOOTBALL_REQUEST_TIMEOUT_MS}ms.`
          : 'Could not reach API-Football.',
        expected: 'Network access to API-Football base URL.',
        received: err instanceof Error ? err.message : err,
        nextAction: 'Check network connectivity and API_FOOTBALL_BASE_URL.',
        cause: err,
      });
    }

    const capturedAt = new Date();
    const responseMs = Date.now() - started;
    const payload = await readJsonResponse(response, endpointName);

    const snapshot = buildApiFootballProviderSnapshot({
      providerId: this.persistence.providerId ?? undefined,
      endpointName,
      method: 'GET',
      url: url.toString(),
      query,
      requestHeaders: headers,
      responseStatus: response.status,
      responsePayload: payload,
      responseHeaders: response.headers,
      capturedAt,
      includeRawPayload: endpointName === 'fixture_history',
    });
    const capturedSnapshot = await this.captureSnapshot(snapshot);
    await this.recordQuota(endpointName, response, snapshot, responseMs, capturedSnapshot?.id);

    if (!response.ok) {
      throw mapHttpStatusToProviderError(response.status, endpointName, payload);
    }
    assertNoProviderErrors(payload, endpointName);

    return {
      payload: payload as T,
      headers: response.headers,
      responseMs,
      capturedAt,
      providerSnapshotId: capturedSnapshot?.id,
      payloadHash: snapshot.payloadHash,
    };
  }

  private async captureSnapshot(snapshot: ReturnType<typeof buildApiFootballProviderSnapshot>): Promise<{ id: string } | null> {
    if (!this.persistence.snapshotSink || !this.persistence.providerId) return null;
    try {
      return await this.persistence.snapshotSink.capture({
        providerId: this.persistence.providerId,
        endpointName: snapshot.endpointName,
        requestHash: snapshot.requestHash,
        responseHash: snapshot.responseHash,
        payloadHash: snapshot.payloadHash,
        capturedAt: snapshot.capturedAt,
        quotaMetadata: snapshot.quotaMetadata,
        requestMetadata: snapshot.requestMetadata,
        rawPayload: snapshot.rawPayload,
        runId: null,
        taskId: null,
        correlationId: null,
        traceId: null,
      });
    } catch {
      return null;
    }
  }

  private async recordQuota(
    endpointName: ApiFootballEndpointName,
    response: Response,
    snapshot: ReturnType<typeof buildApiFootballProviderSnapshot>,
    responseMs: number,
    providerSnapshotId?: string,
  ): Promise<void> {
    if (!this.persistence.quotaSink) return;
    const quota = toQuotaStatus(parseApiFootballQuotaHeaders(response.headers, snapshot.capturedAt), responseMs);
    try {
      await this.persistence.quotaSink.record({
        providerId: this.persistence.providerId,
        providerCode: API_FOOTBALL_PROVIDER,
        endpointName,
        status: response.ok ? quota.status : 'failed',
        quotaLimit: quota.quotaLimit ?? null,
        quotaRemaining: quota.quotaRemaining ?? null,
        resetAt: quota.resetAt ? new Date(quota.resetAt) : null,
        responseMs,
        errorRedacted: response.ok ? null : `HTTP ${response.status}`,
        metadata: {
          ...quota.metadata,
          providerSnapshotId: providerSnapshotId ?? null,
        },
      });
    } catch {
      // Quota persistence must never make provider commands fail.
    }
  }
}

function stringifyFixtureProviderId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function chunkStrings(values: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function apiFootballRequestSignal(): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined') return undefined;
  const timeout = (AbortSignal as any).timeout;
  return typeof timeout === 'function' ? timeout(API_FOOTBALL_REQUEST_TIMEOUT_MS) : undefined;
}

export async function checkApiFootballStatus(
  config: AgentConfig,
  runtime?: RuntimeContext,
): Promise<ServiceStatusReport> {
  const missing = [
    !config.apiFootballBaseUrl ? 'baseUrl' : undefined,
    !config.apiFootballKey ? 'credential' : undefined,
  ].filter((item): item is string => Boolean(item));

  const baseConfig = {
    provider: API_FOOTBALL_PROVIDER,
    apiFootballBaseUrl: config.apiFootballBaseUrl,
    apiFootballKey: config.apiFootballKey,
  };

  if (missing.length) {
    return {
      service: 'providers.sports.football',
      status: 'missing',
      message: 'Football provider configuration is missing required provider or credential values.',
      missing,
      configured: ['provider', ...Object.keys(baseConfig).filter((key) => Boolean((baseConfig as any)[key]))],
      config: {
        provider: API_FOOTBALL_PROVIDER,
        apiFootballBaseUrl: config.apiFootballBaseUrl || null,
        apiFootballKey: config.apiFootballKey ? '[redacted]' : null,
      },
    };
  }

  try {
    new URL(config.apiFootballBaseUrl);
  } catch {
    return {
      service: 'providers.sports.football',
      status: 'disconnected',
      message: 'API_FOOTBALL_BASE_URL must be a valid URL.',
      missing: [],
      configured: ['provider', 'credential', 'baseUrl'],
      config: {
        provider: API_FOOTBALL_PROVIDER,
        apiFootballBaseUrl: config.apiFootballBaseUrl,
        apiFootballKey: '[redacted]',
      },
    };
  }

  try {
    const persistence = await createApiFootballPersistence(config, runtime);
    const provider = createApiFootballProvider(config, persistence);
    const status = await provider.getStatus();
    return {
      service: 'providers.sports.football',
      status: 'connected',
      message: status.message,
      missing: [],
      configured: ['provider', 'credential', 'baseUrl'],
      config: {
        provider: status.provider,
        apiFootballBaseUrl: config.apiFootballBaseUrl,
        apiFootballKey: '[redacted]',
        responseMs: status.responseMs ?? null,
        quotaStatus: status.quota.status,
        quotaRemaining: status.quota.quotaRemaining ?? null,
        rateLimitRemaining: status.quota.rateLimitRemaining ?? null,
        lastCheckedAt: status.checkedAt,
      },
    };
  } catch (err) {
    return {
      service: 'providers.sports.football',
      status: 'disconnected',
      message: String(redactSecrets(err instanceof Error ? err.message : err)),
      missing: [],
      configured: ['provider', 'credential', 'baseUrl'],
      config: {
        provider: API_FOOTBALL_PROVIDER,
        apiFootballBaseUrl: config.apiFootballBaseUrl,
        apiFootballKey: '[redacted]',
        error: String(redactSecrets(err instanceof Error ? err.message : err)),
      },
    };
  }
}

export async function listApiFootballFixtures(
  config: AgentConfig,
  query: FixtureQuery,
  runtime?: RuntimeContext,
): Promise<Fixture[]> {
  const persistence = await createApiFootballPersistence(config, runtime);
  const provider = createApiFootballProvider(config, persistence, runtime);
  return provider.listFixtures(query);
}

export async function getApiFootballOddsSnapshot(
  config: AgentConfig,
  providerFixtureId: string,
  runtime?: RuntimeContext,
  markets?: MarketKey[],
): Promise<CanonicalOddsSnapshot> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to persist odds snapshots and quotes.');
  }
  const persistence = await createApiFootballPersistence(config, runtime);
  if (!persistence.providerId || !persistence.persistOddsSnapshot) {
    throw new Error('Database persistence is required to store odds snapshots and quotes.');
  }
  const provider = createApiFootballProvider(config, persistence, runtime) as ApiFootballProvider;
  return provider.getCanonicalOddsSnapshot({ fixtureId: providerFixtureId, markets });
}

export async function getApiFootballDateOddsSnapshots(
  config: AgentConfig,
  date: string,
  fixtures?: Fixture[],
  runtime?: RuntimeContext,
  markets?: MarketKey[],
): Promise<CanonicalOddsSnapshot[]> {
  return (await getApiFootballDateOddsSlate(config, date, runtime, fixtures, markets)).snapshots;
}

export async function getApiFootballDateOddsSlate(
  config: AgentConfig,
  date: string,
  runtime?: RuntimeContext,
  fixtures?: Fixture[],
  markets?: MarketKey[],
): Promise<ApiFootballDateOddsSlate> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to persist odds snapshots and quotes.');
  }
  const persistence = await createApiFootballPersistence(config, runtime);
  if (!persistence.providerId || !persistence.persistOddsSnapshot) {
    throw new Error('Database persistence is required to store odds snapshots and quotes.');
  }
  const provider = createApiFootballProvider(config, persistence, runtime) as ApiFootballProvider;
  return provider.getCanonicalOddsSlateForDate({ date, fixtures, markets });
}

function reserveProviderRequest(
  config: ApiFootballProviderConfig,
  runtime: Pick<RuntimeContext, 'providerRequestCount' | 'providerRequestLimit'>,
  endpointName: ApiFootballEndpointName,
): void {
  const limit = runtime.providerRequestLimit ?? config.apiFootball.maxProviderRequestsPerRun;
  if (!Number.isFinite(limit) || limit <= 0) return;
  const nextCount = (runtime.providerRequestCount ?? 0) + 1;
  if (nextCount > limit) {
    throw new ApiFootballProviderError({
      code: 'rate_limited',
      endpointName,
      message: `Provider request limit reached for this run (${limit}).`,
      expected: `At most ${limit} API-Football requests in one harness run.`,
      received: { providerRequestCount: runtime.providerRequestCount ?? 0, attemptedEndpoint: endpointName },
      nextAction: 'Raise GANA_MAX_PROVIDER_REQUESTS_PER_RUN for a larger canary, reduce GANA_MAX_FIXTURES_PER_RUN, or resume with a new run after reviewing quota.',
    });
  }
  runtime.providerRequestCount = nextCount;
}

export async function createApiFootballPersistence(
  config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>,
  _runtime?: RuntimeContext,
): Promise<ApiFootballPersistence> {
  if (!config.databaseUrl) return {};

  try {
    const db = getPrismaClient() as unknown as StoragePrismaClient;
    const repositories = createStorageRepositories(db);
    const provider = await repositories.sportsProviders.upsertByCode({
      code: API_FOOTBALL_PROVIDER,
      name: 'API-Football',
      baseUrl: config.apiFootballBaseUrl,
    });

    return {
      providerId: provider.id,
      snapshotSink: {
        capture: (input) => repositories.providerSnapshots.create(input),
      },
      quotaSink: {
        record: (input) => repositories.providerQuotaSamples.record(input),
      },
      resolveFixtureByProviderFixtureId: async (providerFixtureId) => {
        const record = await repositories.fixtures.findByProviderKey(provider.id, providerFixtureId);
        if (!record) return null;
        const [homeTeam, awayTeam, competition] = await Promise.all([
          record.homeTeamId ? repositories.teams.findById(record.homeTeamId) : null,
          record.awayTeamId ? repositories.teams.findById(record.awayTeamId) : null,
          record.competitionId ? repositories.competitions.findById(record.competitionId) : null,
        ]);
        const raw = rawFixtureMetadata(record.metadata);
        return fixtureFromStoredRecord(record, {
          providerHomeTeamId: homeTeam?.providerTeamId ?? rawNestedString(raw, 'teams', 'home', 'id'),
          providerAwayTeamId: awayTeam?.providerTeamId ?? rawNestedString(raw, 'teams', 'away', 'id'),
          homeTeamName: homeTeam?.name ?? rawNestedString(raw, 'teams', 'home', 'name'),
          awayTeamName: awayTeam?.name ?? rawNestedString(raw, 'teams', 'away', 'name'),
          competitionName: competition?.name ?? rawNestedString(raw, 'league', 'name'),
          leagueId: numericString(competition?.providerCompetitionId ?? rawNestedString(raw, 'league', 'id')),
        });
      },
      persistOddsSnapshot: async (snapshot) => {
        const marketAnalytics = buildOddsMarketAnalytics(snapshot.marketReferenceQuotes ?? snapshot.quotes);
        const oddsSnapshot = await repositories.oddsSnapshots.createWithQuotes({
          snapshot: {
            fixtureId: snapshot.fixtureId,
            providerFixtureId: snapshot.providerFixtureId,
            providerSnapshotId: snapshot.providerSnapshotId.startsWith('provider-snapshot:')
              ? null
              : snapshot.providerSnapshotId,
            bookmakerCount: snapshot.bookmakerCount,
            capturedAt: new Date(snapshot.capturedAt),
            payloadHash: snapshot.payloadHash === 'unknown' ? null : snapshot.payloadHash,
            metadata: {
              provider: API_FOOTBALL_PROVIDER,
              quoteCount: snapshot.quotes.length,
              ...(snapshot.metadata && typeof snapshot.metadata === 'object' && !Array.isArray(snapshot.metadata)
                ? snapshot.metadata as Record<string, JsonValue>
                : {}),
            },
          },
          quotes: snapshot.quotes.map((quote) => {
            const analytics = marketAnalytics.get(marketAnalyticsKey(quote));
            return {
              fixtureId: snapshot.fixtureId,
              bookmaker: quote.bookmaker ?? 'unknown',
              bookmakerKey: quote.bookmaker,
              marketKey: quote.market,
              selectionKey: quote.selection,
              line: quote.line ?? null,
              price: quote.price,
              impliedProbability: quote.impliedProbability,
              marketImpliedProbability: analytics?.marketImpliedProbability ?? null,
              marketFairProbability: analytics?.marketFairProbability ?? null,
              consensusFairOdds: analytics?.consensusFairOdds ?? null,
              overround: analytics?.overround ?? null,
              marketEfficiencyScore: analytics?.marketEfficiencyScore ?? null,
              capturedAt: new Date(quote.capturedAt),
              metadata: {
                sourceSnapshotId: quote.sourceSnapshotId,
                lowLiquidity: analytics?.lowLiquidity ?? true,
                lowLiquidityBasis: 'observed-market-bookmaker-coverage-proxy',
                marketReferenceBookmakerCount: analytics?.marketBookmakerCount ?? 0,
              },
            };
          }),
        });
        const quoteRecordIds: Record<string, string> = {};
        const records = await repositories.oddsQuotes.listLatest({
          fixtureId: snapshot.fixtureId,
          snapshotId: oddsSnapshot.id,
          take: Math.max(snapshot.quotes.length, 20),
        });
        for (const record of records) {
          quoteRecordIds[[
            record.bookmaker,
            record.marketKey,
            record.selectionKey,
            record.line === null ? '' : Number(record.line).toString(),
          ].join('|')] = record.id;
        }
        return {
          ...snapshot,
          oddsSnapshotId: oddsSnapshot.id,
          quoteRecordIds,
        };
      },
      upsertFixtures: async (fixtures) => {
        const competitions = new Map<string, Awaited<ReturnType<typeof repositories.competitions.upsertByProviderKey>>>();
        const teams = new Map<string, Awaited<ReturnType<typeof repositories.teams.upsertByProviderKey>>>();

        for (const normalized of fixtures) {
          if (normalized.competition && !competitions.has(normalized.competition.providerCompetitionId)) {
            const competition = await repositories.competitions.upsertByProviderKey({
              providerId: provider.id,
              providerCompetitionId: normalized.competition.providerCompetitionId,
              name: normalized.competition.name,
              country: normalized.competition.country,
              type: normalized.competition.type,
              metadata: assetMetadata({
                logoUrl: normalized.competition.logoUrl,
                flagUrl: normalized.competition.flagUrl,
              }),
            });
            competitions.set(normalized.competition.providerCompetitionId, competition);
          }
          for (const team of [normalized.homeTeam, normalized.awayTeam]) {
            if (team && !teams.has(team.providerTeamId)) {
              const record = await repositories.teams.upsertByProviderKey({
                providerId: provider.id,
                providerTeamId: team.providerTeamId,
                name: team.name,
                country: team.country,
                metadata: assetMetadata({ logoUrl: team.logoUrl }),
              });
              teams.set(team.providerTeamId, record);
            }
          }
        }

        return mapWithConcurrency(fixtures, FIXTURE_PERSISTENCE_CONCURRENCY, async (normalized) => {
          const competition = normalized.competition
            ? competitions.get(normalized.competition.providerCompetitionId) ?? null
            : null;
          const homeTeam = normalized.homeTeam
            ? teams.get(normalized.homeTeam.providerTeamId) ?? null
            : null;
          const awayTeam = normalized.awayTeam
            ? teams.get(normalized.awayTeam.providerTeamId) ?? null
            : null;

          const fixture = await repositories.fixtures.upsertByProviderKey({
            providerId: provider.id,
            providerFixtureId: normalized.providerFixtureId,
            competitionId: competition?.id ?? null,
            season: normalized.season ?? null,
            homeTeamId: homeTeam?.id ?? null,
            awayTeamId: awayTeam?.id ?? null,
            scheduledAt: normalized.scheduledAt ?? null,
            status: normalized.status,
            scoreHome: normalized.scoreHome ?? null,
            scoreAway: normalized.scoreAway ?? null,
            includedByFilters: normalized.includedByFilters,
            metadata: normalized.metadata,
          });

          return {
            normalized,
            fixture: fixtureFromRecord(fixture, normalized),
          };
        });
      },
    };
  } catch (err) {
    throw new Error(`API-Football persistence initialization failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readPagingTotal(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 1;
  const total = (payload as any).paging?.total;
  if (total === undefined) return 1;
  if (typeof total === 'number' && Number.isSafeInteger(total) && total >= 1) return total;
  throw new ApiFootballProviderError({
    code: 'invalid_provider_response', endpointName: 'odds',
    message: 'API-Football returned invalid odds pagination; full coverage cannot be verified.',
    received: { total },
  });
}

function assertOddsPage(payload: unknown, expectedPage: number, expectedTotal: number): void {
  const total = readPagingTotal(payload);
  const current = payload && typeof payload === 'object' ? (payload as any).paging?.current : undefined;
  if (total !== expectedTotal || (current !== undefined && current !== expectedPage)
    || (expectedPage > 1 && current === undefined)
    || (expectedTotal > 1 && extractApiFootballResponseArray(payload, 'odds').length === 0)) {
    throw new ApiFootballProviderError({
      code: 'invalid_provider_response', endpointName: 'odds',
      message: 'API-Football odds pagination changed or skipped a page; full coverage cannot be verified.',
      received: { expectedPage, current: current ?? null, expectedTotal, total },
      nextAction: 'Retry the complete date scan before claiming complete odds coverage.',
    });
  }
}

function oddsMarketQuery(markets: readonly MarketKey[]): Record<string, number> {
  // Pre-match bet 1 is Match Winner (full-time 1X2), not a live bet ID.
  return markets.length === 1 && markets[0] === 'h2h' ? { bet: 1 } : {};
}

function fixtureOddsFallbackQuery(
  fixture: Fixture,
  providerFixtureId: string,
  timezone: string,
  markets: readonly MarketKey[],
): Record<string, string | number> | null {
  const { leagueId, season } = fixture;
  const kickoff = new Date(fixture.scheduledAt);
  if (fixture.providerFixtureId !== providerFixtureId || !Number.isSafeInteger(leagueId) || (leagueId ?? 0) <= 0
    || !Number.isSafeInteger(season) || (season ?? 0) < 1900 || !Number.isFinite(kickoff.getTime()) || !timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(kickoff);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      league: leagueId!,
      season: season!,
      timezone,
      ...oddsMarketQuery(markets),
    };
  } catch {
    return null;
  }
}

function countBookmakersFromQuotes(quotes: OddsQuote[]): number {
  return new Set(quotes.map((quote) => normalizeBookmakerName(quote.bookmaker ?? 'unknown'))).size;
}

function filterQuotesByBookmakerAllowlistWithFallback(quotes: OddsQuote[], allowlist: string[] | undefined): OddsQuote[] {
  const filtered = filterQuotesByBookmakerAllowlist(quotes, allowlist);
  if (filtered.length || !quotes.length || !normalizeBookmakerAllowlist(allowlist).size) return filtered;
  return quotes;
}

function filterQuotesByBookmakerAllowlist(quotes: OddsQuote[], allowlist: string[] | undefined): OddsQuote[] {
  const normalizedAllowlist = normalizeBookmakerAllowlist(allowlist);
  if (!normalizedAllowlist.size) return quotes;
  return quotes.filter((quote) => isAllowedBookmaker(quote.bookmaker, normalizedAllowlist));
}

function filterQuotesByMarkets(quotes: OddsQuote[], markets: readonly MarketKey[] | undefined): OddsQuote[] {
  if (!markets?.length) return quotes;
  const allowed = new Set(markets);
  return quotes.filter((quote) => allowed.has(quote.market));
}

function dedupeNormalizedFixtures(fixtures: NormalizedFixture[]): NormalizedFixture[] {
  const byProviderFixtureId = new Map<string, NormalizedFixture>();
  for (const fixture of fixtures) byProviderFixtureId.set(fixture.providerFixtureId, fixture);
  return [...byProviderFixtureId.values()];
}

function assetMetadata(input: { logoUrl?: string | null; flagUrl?: string | null }): Record<string, JsonValue> | undefined {
  const assets: Record<string, JsonValue> = {};
  if (input.logoUrl) assets.logoUrl = input.logoUrl;
  if (input.flagUrl) assets.flagUrl = input.flagUrl;
  return Object.keys(assets).length ? { assetSource: API_FOOTBALL_PROVIDER, ...assets } : undefined;
}

function apiFootballResponseHasRows(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object' && Array.isArray((payload as { response?: unknown }).response)
    && ((payload as { response: unknown[] }).response.length > 0));
}

function shouldRetryFixtureDiscoveryWithSeason(input: FixtureQuery, err: unknown): boolean {
  if (input.season !== undefined || input.league === undefined) return false;
  const text = [
    err instanceof Error ? err.message : String(err),
    isApiFootballProviderError(err) ? JSON.stringify(err.received) : '',
  ].join(' ');
  return /season/i.test(text) && /(required|require|missing|obligat)/i.test(text);
}

function inferFixtureDiscoverySeasons(date: string): number[] {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year) || year < 1900) return [];
  return uniqueNumbers([year, year - 1, year + 1]);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value)))];
}

function normalizeBookmakerAllowlist(allowlist: string[] | undefined): Set<string> {
  return new Set((allowlist ?? [])
    .map(normalizeBookmakerName)
    .filter((value) => value.length > 0));
}

function isAllowedBookmaker(bookmaker: string | undefined, allowlist: Set<string>): boolean {
  const bookmakerName = normalizeBookmakerName(bookmaker ?? '');
  if (!bookmakerName) return false;
  if (allowlist.has(bookmakerName)) return true;
  for (const allowed of allowlist) {
    if (bookmakerName.startsWith(allowed) || allowed.startsWith(bookmakerName)) return true;
  }
  return false;
}

function normalizeBookmakerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface OddsMarketAnalytics {
  marketBookmakerCount: number;
  marketImpliedProbability: number;
  marketFairProbability: number;
  consensusFairOdds: number;
  overround: number;
  marketEfficiencyScore: number;
  lowLiquidity: boolean;
}

export function buildOddsMarketAnalytics(quotes: OddsQuote[]): Map<string, OddsMarketAnalytics> {
  const groups = new Map<string, OddsQuote[]>();
  for (const quote of quotes) {
    const key = [quote.market, quote.line ?? 'null'].join(':');
    groups.set(key, [...(groups.get(key) ?? []), quote]);
  }

  const result = new Map<string, OddsMarketAnalytics>();
  for (const group of groups.values()) {
    const fairPrices = consensusFairPrices(group.map((quote) => ({
      selection: quote.selection,
      odds: quote.price,
      bookmaker: quote.bookmaker,
    })), group[0]?.market);
    const dispersion = averageSelectionDispersion(group);
    for (const fair of fairPrices) {
      const efficiency = marketEfficiencyScore({
        bookmakerCount: fair.bookmakerCount,
        overround: fair.overround,
        dispersion,
        freshnessMinutes: 0,
      });
      const lowLiquidity = isLowLiquidity({
        bookmakerCount: fair.bookmakerCount,
        overround: fair.overround,
        dispersion,
        freshnessMinutes: 0,
      });
      for (const quote of group.filter((item) => item.selection === fair.selection)) {
        result.set(marketAnalyticsKey(quote), {
          marketBookmakerCount: fair.bookmakerCount,
          marketImpliedProbability: round6(fair.marketImpliedProbability),
          marketFairProbability: round6(fair.marketFairProbability),
          consensusFairOdds: Number.isFinite(fair.consensusFairOdds) ? round6(fair.consensusFairOdds) : 0,
          overround: round6(fair.overround),
          marketEfficiencyScore: efficiency,
          lowLiquidity,
        });
      }
    }
  }
  return result;
}

function marketAnalyticsKey(quote: OddsQuote): string {
  return [
    quote.bookmaker ?? 'unknown',
    quote.market,
    quote.selection,
    quote.line ?? 'null',
  ].join('|');
}

function averageSelectionDispersion(quotes: OddsQuote[]): number {
  const bySelection = new Map<string, number[]>();
  for (const quote of quotes) {
    bySelection.set(quote.selection, [...(bySelection.get(quote.selection) ?? []), quote.impliedProbability]);
  }
  const dispersions = [...bySelection.values()].map((values) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance);
  });
  return dispersions.length ? dispersions.reduce((sum, value) => sum + value, 0) / dispersions.length : 0;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function dedupeQuotes(quotes: OddsQuote[]): OddsQuote[] {
  const byKey = new Map<string, OddsQuote>();
  for (const quote of quotes) byKey.set(oddsQuoteDedupeKey(quote), quote);
  return [...byKey.values()];
}

function buildApiFootballUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean>,
): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch (err) {
    throw new ApiFootballProviderError({
      code: 'provider_unavailable',
      message: 'API_FOOTBALL_BASE_URL is not a valid URL.',
      expected: 'Valid API-Football base URL.',
      received: baseUrl,
      nextAction: 'Set API_FOOTBALL_BASE_URL to https://v3.football.api-sports.io.',
      cause: err,
    });
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  url.search = '';
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function toQuotaStatus(quota: ApiFootballQuotaStatus, responseMs: number | undefined): QuotaStatus {
  const metadata = quota.status === 'known'
    ? {
        daily: quota.daily ?? null,
        minute: quota.minute ?? null,
        retryAfterSeconds: quota.retryAfterSeconds ?? null,
        providerRequestId: quota.providerRequestId ?? null,
      }
    : {
        providerRequestId: quota.providerRequestId ?? null,
      };

  return {
    status: quota.status,
    lastCheckedAt: quota.lastCheckedAt,
    responseMs,
    quotaLimit: quota.status === 'known' ? quota.daily?.limit : undefined,
    quotaRemaining: quota.status === 'known' ? quota.daily?.remaining : undefined,
    rateLimitRemaining: quota.status === 'known' ? quota.minute?.remaining : undefined,
    metadata: metadata as Record<string, JsonValue>,
  };
}

async function readJsonResponse(response: Response, endpointName: ApiFootballEndpointName): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    throw new ApiFootballProviderError({
      code: 'invalid_provider_response',
      endpointName,
      statusCode: response.status,
      message: 'API-Football returned a non-JSON response.',
      expected: 'JSON response wrapper.',
      received: response.statusText,
      nextAction: 'Retry later or inspect provider response.',
      cause: err,
    });
  }
}

function assertNoProviderErrors(payload: unknown, endpointName: ApiFootballEndpointName): void {
  if (!payload || typeof payload !== 'object') return;
  const errors = (payload as { errors?: unknown }).errors;
  const hasErrors = Array.isArray(errors)
    ? errors.length > 0
    : Boolean(errors && typeof errors === 'object' && Object.keys(errors).length > 0);
  if (!hasErrors) return;

  const serializedErrors = typeof errors === 'string' ? errors : JSON.stringify(errors);
  const code = /(?:quota|request limit for the day|daily request limit)/i.test(serializedErrors)
    ? 'quota_exceeded'
    : /(?:too many requests|rate[ _-]?limit|per minute)/i.test(serializedErrors)
      ? 'rate_limited'
      : 'provider_unavailable';

  throw new ApiFootballProviderError({
    code,
    operation: 'provider request',
    endpointName,
    expected: 'API-Football response without provider errors.',
    received: errors,
    ...(code === 'provider_unavailable'
      ? { nextAction: 'Check request parameters, API key and API-Football dashboard.' }
      : {}),
  });
}

function fixtureFromRecord(record: {
  id: string;
  providerFixtureId: string;
  competitionId: string | null;
  season: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: Date | null;
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  includedByFilters: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}, normalized: NormalizedFixture): Fixture {
  return {
    id: record.id,
    provider: API_FOOTBALL_PROVIDER,
    providerFixtureId: record.providerFixtureId,
    competitionId: record.competitionId ?? undefined,
    competitionName: normalized.competition?.name,
    leagueId: normalized.competition ? Number(normalized.competition.providerCompetitionId) : undefined,
    season: record.season ?? undefined,
    homeTeamId: record.homeTeamId ?? normalized.homeTeam?.providerTeamId ?? 'unknown-home-team',
    awayTeamId: record.awayTeamId ?? normalized.awayTeam?.providerTeamId ?? 'unknown-away-team',
    homeTeamName: normalized.homeTeam?.name,
    awayTeamName: normalized.awayTeam?.name,
    providerHomeTeamId: normalized.homeTeam?.providerTeamId,
    providerAwayTeamId: normalized.awayTeam?.providerTeamId,
    scheduledAt: (record.scheduledAt ?? normalized.scheduledAt ?? new Date(0)).toISOString(),
    status: normalized.status,
    scoreHome: record.scoreHome ?? undefined,
    scoreAway: record.scoreAway ?? undefined,
    includedByFilters: Array.isArray(record.includedByFilters)
      ? record.includedByFilters.map(String)
      : normalized.includedByFilters,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function fixtureWithNormalizedNames(fixture: Fixture, normalized: NormalizedFixture): Fixture {
  return {
    ...fixture,
    competitionName: fixture.competitionName ?? normalized.competition?.name,
    homeTeamName: fixture.homeTeamName ?? normalized.homeTeam?.name,
    awayTeamName: fixture.awayTeamName ?? normalized.awayTeam?.name,
    providerHomeTeamId: fixture.providerHomeTeamId ?? normalized.homeTeam?.providerTeamId,
    providerAwayTeamId: fixture.providerAwayTeamId ?? normalized.awayTeam?.providerTeamId,
  };
}

interface StoredFixtureRelations {
  providerHomeTeamId?: string;
  providerAwayTeamId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  competitionName?: string;
  leagueId?: number;
}

function fixtureFromStoredRecord(record: {
  id: string;
  providerFixtureId: string;
  competitionId: string | null;
  season: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: Date | null;
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  includedByFilters: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}, relations: StoredFixtureRelations = {}): Fixture {
  return {
    id: record.id,
    provider: API_FOOTBALL_PROVIDER,
    providerFixtureId: record.providerFixtureId,
    competitionId: record.competitionId ?? undefined,
    competitionName: relations.competitionName,
    leagueId: relations.leagueId,
    season: record.season ?? undefined,
    homeTeamId: record.homeTeamId ?? 'unknown-home-team',
    awayTeamId: record.awayTeamId ?? 'unknown-away-team',
    homeTeamName: relations.homeTeamName,
    awayTeamName: relations.awayTeamName,
    providerHomeTeamId: relations.providerHomeTeamId,
    providerAwayTeamId: relations.providerAwayTeamId,
    scheduledAt: (record.scheduledAt ?? new Date(0)).toISOString(),
    status: toFixtureStatus(record.status),
    scoreHome: record.scoreHome ?? undefined,
    scoreAway: record.scoreAway ?? undefined,
    includedByFilters: Array.isArray(record.includedByFilters)
      ? record.includedByFilters.map(String)
      : [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toFixtureStatus(status: string): FixtureStatus {
  return status === 'scheduled' || status === 'live' || status === 'completed' || status === 'cancelled'
    ? status
    : 'unknown';
}

function fallbackFixtureFromNormalized(normalized: NormalizedFixture): Fixture {
  const now = new Date().toISOString();
  return {
    id: `${API_FOOTBALL_PROVIDER}:${normalized.providerFixtureId}`,
    provider: API_FOOTBALL_PROVIDER,
    providerFixtureId: normalized.providerFixtureId,
    competitionName: normalized.competition?.name,
    leagueId: normalized.competition ? Number(normalized.competition.providerCompetitionId) : undefined,
    season: normalized.season ?? undefined,
    homeTeamId: normalized.homeTeam?.providerTeamId ?? 'unknown-home-team',
    awayTeamId: normalized.awayTeam?.providerTeamId ?? 'unknown-away-team',
    homeTeamName: normalized.homeTeam?.name,
    awayTeamName: normalized.awayTeam?.name,
    providerHomeTeamId: normalized.homeTeam?.providerTeamId,
    providerAwayTeamId: normalized.awayTeam?.providerTeamId,
    scheduledAt: (normalized.scheduledAt ?? new Date(0)).toISOString(),
    status: normalized.status,
    scoreHome: normalized.scoreHome ?? undefined,
    scoreAway: normalized.scoreAway ?? undefined,
    includedByFilters: normalized.includedByFilters,
    createdAt: now,
    updatedAt: now,
  };
}

function rawFixtureMetadata(metadata: JsonValue | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const raw = (metadata as { raw?: unknown }).raw;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function rawNestedString(source: Record<string, unknown>, ...path: string[]): string | undefined {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === 'number' && Number.isFinite(current)) return String(current);
  return typeof current === 'string' && current.trim() ? current.trim() : undefined;
}

function numericString(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
