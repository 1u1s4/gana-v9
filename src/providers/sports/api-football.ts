import type { AgentConfig } from '../../config.js';
import { evaluateEgress } from '../../permissions/egress-policy.js';
import type { Fixture } from '../../domain/fixtures.js';
import type { FixtureStatus } from '../../domain/fixtures.js';
import type { SportsProvider } from '../../domain/ids.js';
import type { OddsQuote } from '../../domain/odds.js';
import { consensusFairPrices } from '../../markets/fair-price.js';
import { isLowLiquidity, marketEfficiencyScore } from '../../markets/efficiency.js';
import { redactSecrets } from '../../permissions/redaction.js';
import type { RuntimeContext } from '../../runtime/context.js';
import { createStorageRepositories } from '../../storage/repositories/index.js';
import { getPrismaClient } from '../../storage/db.js';
import type { JsonValue, StoragePrismaClient } from '../../storage/types.js';
import type { ServiceStatusReport } from '../../filters/status.js';
import { ApiFootballProviderError, isApiFootballProviderError, mapHttpStatusToProviderError } from './api-football-errors.js';
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
} from './types.js';

export interface ApiFootballDateOddsSlate {
  fixtures: Fixture[];
  snapshots: CanonicalOddsSnapshot[];
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

export function createApiFootballProvider(
  config: ApiFootballProviderConfig,
  persistence: ApiFootballPersistence = {},
): SportsDataProvider {
  return new ApiFootballProvider(config, persistence);
}

export class ApiFootballProvider implements SportsDataProvider {
  readonly name: SportsProvider = API_FOOTBALL_PROVIDER;

  constructor(
    private readonly config: ApiFootballProviderConfig,
    private readonly persistence: ApiFootballPersistence = {},
  ) {}

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
    return persisted?.map((item) => item.fixture) ?? normalized.map(fallbackFixtureFromNormalized);
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

  async getCanonicalOddsSnapshot(input: OddsQuery): Promise<CanonicalOddsSnapshot> {
    const fixture = await this.resolveFixtureForOdds(input.fixtureId);
    const pages = await this.requestPagedOdds(input.fixtureId);
    const mappedQuotes = pages.flatMap((page) => mapApiFootballOdds(page.payload, {
      fixtureId: fixture.id,
      providerSnapshotId: page.providerSnapshotId ?? `provider-snapshot:${page.payloadHash ?? 'unknown'}`,
      capturedAt: page.capturedAt,
    }));
    return this.buildAndPersistOddsSnapshot({
      fixture,
      providerFixtureId: input.fixtureId,
      pages,
      mappedQuotes,
      extraMetadata: {},
    });
  }

  async getCanonicalOddsSnapshotsForDate(input: { date: string; fixtures?: Fixture[] }): Promise<CanonicalOddsSnapshot[]> {
    return (await this.getCanonicalOddsSlateForDate(input)).snapshots;
  }

  async getCanonicalOddsSlateForDate(input: { date: string; fixtures?: Fixture[] }): Promise<ApiFootballDateOddsSlate> {
    const pages = await this.requestPagedDateOdds(input.date);
    const fixtureIds = uniqueStrings(pages.flatMap((page) => extractApiFootballResponseArray(page.payload, 'odds')
      .map((fixtureOdds) => stringifyFixtureProviderId((fixtureOdds as any)?.fixture?.id))
      .filter((value): value is string => Boolean(value))));
    const fixtures = input.fixtures?.length
      ? input.fixtures
      : await this.resolveFixturesByProviderIds(fixtureIds);
    const fixturesByProviderId = new Map(fixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
    const snapshots: CanonicalOddsSnapshot[] = [];

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
        snapshots.push(await this.buildAndPersistOddsSnapshot({
          fixture,
          providerFixtureId,
          pages: [page],
          mappedQuotes,
          extraMetadata: { source: 'api-football.odds.date', date: input.date },
        }));
      }
    }

    return { fixtures, snapshots };
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
      metadata: {
        ...input.extraMetadata,
        bookmakerAllowlist: this.config.apiFootball.bookmakerAllowlist ?? [],
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
      fixtures.push(...(persisted?.map((item) => item.fixture) ?? normalized.map(fallbackFixtureFromNormalized)));
    }
    return fixtures;
  }

  private async requestPagedOdds(providerFixtureId: string): Promise<Array<ApiFootballResponse<unknown>>> {
    const first = await this.request('odds', '/odds', { fixture: providerFixtureId });
    const pages = [first];
    const total = readPagingTotal(first.payload);
    for (let page = 2; page <= total; page++) {
      pages.push(await this.request('odds', '/odds', { fixture: providerFixtureId, page }));
    }
    return pages;
  }

  private async requestPagedDateOdds(date: string): Promise<Array<ApiFootballResponse<unknown>>> {
    const first = await this.request('odds', '/odds', { date });
    const pages = [first];
    const total = readPagingTotal(first.payload);
    for (let page = 2; page <= total; page++) {
      pages.push(await this.request('odds', '/odds', { date, page }));
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
      includeRawPayload: false,
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
  const provider = createApiFootballProvider(config, persistence);
  return provider.listFixtures(query);
}

export async function getApiFootballOddsSnapshot(
  config: AgentConfig,
  providerFixtureId: string,
  runtime?: RuntimeContext,
): Promise<CanonicalOddsSnapshot> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to persist odds snapshots and quotes.');
  }
  const persistence = await createApiFootballPersistence(config, runtime);
  if (!persistence.providerId || !persistence.persistOddsSnapshot) {
    throw new Error('Database persistence is required to store odds snapshots and quotes.');
  }
  const provider = createApiFootballProvider(config, persistence) as ApiFootballProvider;
  return provider.getCanonicalOddsSnapshot({ fixtureId: providerFixtureId });
}

export async function getApiFootballDateOddsSnapshots(
  config: AgentConfig,
  date: string,
  fixtures?: Fixture[],
  runtime?: RuntimeContext,
): Promise<CanonicalOddsSnapshot[]> {
  return (await getApiFootballDateOddsSlate(config, date, runtime, fixtures)).snapshots;
}

export async function getApiFootballDateOddsSlate(
  config: AgentConfig,
  date: string,
  runtime?: RuntimeContext,
  fixtures?: Fixture[],
): Promise<ApiFootballDateOddsSlate> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to persist odds snapshots and quotes.');
  }
  const persistence = await createApiFootballPersistence(config, runtime);
  if (!persistence.providerId || !persistence.persistOddsSnapshot) {
    throw new Error('Database persistence is required to store odds snapshots and quotes.');
  }
  const provider = createApiFootballProvider(config, persistence) as ApiFootballProvider;
  return provider.getCanonicalOddsSlateForDate({ date, fixtures });
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
        return record ? fixtureFromStoredRecord(record) : null;
      },
      persistOddsSnapshot: async (snapshot) => {
        const marketAnalytics = buildOddsMarketAnalytics(snapshot.quotes);
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
                lowLiquidity: analytics?.lowLiquidity ?? false,
              },
            };
          }),
        });
        const quoteRecordIds: Record<string, string> = {};
        const records = await repositories.oddsQuotes.listLatest({
          fixtureId: snapshot.fixtureId,
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
              metadata: null,
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
                metadata: null,
              });
              teams.set(team.providerTeamId, record);
            }
          }
        }

        return Promise.all(fixtures.map(async (normalized) => {
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
        }));
      },
    };
  } catch (err) {
    throw new Error(`API-Football persistence initialization failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readPagingTotal(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 1;
  const total = (payload as any).paging?.total;
  return typeof total === 'number' && Number.isInteger(total) && total > 1 ? total : 1;
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

function dedupeNormalizedFixtures(fixtures: NormalizedFixture[]): NormalizedFixture[] {
  const byProviderFixtureId = new Map<string, NormalizedFixture>();
  for (const fixture of fixtures) byProviderFixtureId.set(fixture.providerFixtureId, fixture);
  return [...byProviderFixtureId.values()];
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
  marketImpliedProbability: number;
  marketFairProbability: number;
  consensusFairOdds: number;
  overround: number;
  marketEfficiencyScore: number;
  lowLiquidity: boolean;
}

function buildOddsMarketAnalytics(quotes: OddsQuote[]): Map<string, OddsMarketAnalytics> {
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
    })));
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

  throw new ApiFootballProviderError({
    code: 'provider_unavailable',
    operation: 'provider request',
    endpointName,
    expected: 'API-Football response without provider errors.',
    received: errors,
    nextAction: 'Check request parameters, API key and API-Football dashboard.',
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
    leagueId: normalized.competition ? Number(normalized.competition.providerCompetitionId) : undefined,
    season: record.season ?? undefined,
    homeTeamId: record.homeTeamId ?? normalized.homeTeam?.providerTeamId ?? 'unknown-home-team',
    awayTeamId: record.awayTeamId ?? normalized.awayTeam?.providerTeamId ?? 'unknown-away-team',
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
  createdAt: Date;
  updatedAt: Date;
}): Fixture {
  return {
    id: record.id,
    provider: API_FOOTBALL_PROVIDER,
    providerFixtureId: record.providerFixtureId,
    competitionId: record.competitionId ?? undefined,
    season: record.season ?? undefined,
    homeTeamId: record.homeTeamId ?? 'unknown-home-team',
    awayTeamId: record.awayTeamId ?? 'unknown-away-team',
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
    leagueId: normalized.competition ? Number(normalized.competition.providerCompetitionId) : undefined,
    season: normalized.season ?? undefined,
    homeTeamId: normalized.homeTeam?.providerTeamId ?? 'unknown-home-team',
    awayTeamId: normalized.awayTeam?.providerTeamId ?? 'unknown-away-team',
    homeTeamName: normalized.homeTeam?.name,
    awayTeamName: normalized.awayTeam?.name,
    scheduledAt: (normalized.scheduledAt ?? new Date(0)).toISOString(),
    status: normalized.status,
    scoreHome: normalized.scoreHome ?? undefined,
    scoreAway: normalized.scoreAway ?? undefined,
    includedByFilters: normalized.includedByFilters,
    createdAt: now,
    updatedAt: now,
  };
}
