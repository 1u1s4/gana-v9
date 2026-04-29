import type { AgentConfig } from '../../config.js';
import type { Fixture, FixtureStatus } from '../../domain/fixtures.js';
import type { SportsProvider } from '../../domain/ids.js';
import type { OddsQuote } from '../../domain/odds.js';
import type { JsonValue, ProviderQuotaSampleInput, ProviderSnapshotInput } from '../../storage/types.js';

export const API_FOOTBALL_PROVIDER: SportsProvider = 'api-football';

export type ApiFootballEndpointName =
  | 'status'
  | 'fixtures'
  | 'odds'
  | 'fixture_result'
  | 'fixture_statistics'
  | 'leagues'
  | 'teams';

export interface ApiFootballProviderConfig {
  apiFootballKey: string;
  apiFootballBaseUrl: string;
  apiFootball: AgentConfig['apiFootball'];
}

export interface FixtureQuery {
  date: string;
  league?: number;
  team?: number;
  season?: number;
  maxFixtures?: number;
}

export interface FixtureByIdQuery {
  providerFixtureId: string;
}

export interface OddsQuery {
  fixtureId: string;
}

export interface OddsScanQuery {
  date: string;
}

export interface ResultQuery {
  providerFixtureId: string;
}

export interface FixtureStatisticsQuery {
  providerFixtureId: string;
}

export interface QuotaStatus {
  status: 'known' | 'unknown';
  lastCheckedAt: string;
  responseMs?: number;
  quotaLimit?: number;
  quotaRemaining?: number;
  rateLimitRemaining?: number;
  resetAt?: string;
  metadata: Record<string, JsonValue>;
}

export interface ProviderStatus {
  provider: SportsProvider;
  ready: boolean;
  checkedAt: string;
  responseMs?: number;
  quota: QuotaStatus;
  message: string;
}

export interface FinalResult {
  fixture: Fixture;
  scoreHome: number;
  scoreAway: number;
  providerSnapshotId?: string;
}

export interface FixtureStatistics {
  providerFixtureId: string;
  cornersHome?: number;
  cornersAway?: number;
  totalCorners?: number;
  capturedAt: string;
  providerSnapshotId?: string;
}

export interface OddsScanResult {
  fixtureId: string;
  quotes: OddsQuote[];
}

export interface CanonicalOddsSnapshot {
  fixtureId: string;
  providerFixtureId: string;
  providerSnapshotId: string;
  oddsSnapshotId?: string;
  capturedAt: string;
  bookmakerCount: number;
  payloadHash: string;
  quotes: OddsQuote[];
  quoteRecordIds?: Record<string, string>;
}

export interface SportsDataProvider {
  name: SportsProvider;
  getStatus(): Promise<ProviderStatus>;
  getQuota(): Promise<QuotaStatus>;
  listFixtures(input: FixtureQuery): Promise<Fixture[]>;
  getFixture(input: FixtureByIdQuery): Promise<Fixture>;
  getOdds(input: OddsQuery): Promise<OddsQuote[]>;
  scanOdds(input: OddsScanQuery): Promise<OddsScanResult[]>;
  getFinalResult(input: ResultQuery): Promise<FinalResult>;
  getFixtureStatistics(input: FixtureStatisticsQuery): Promise<FixtureStatistics>;
}

export interface NormalizedCompetition {
  providerCompetitionId: string;
  name: string;
  country?: string | null;
  type?: string | null;
}

export interface NormalizedTeam {
  providerTeamId: string;
  name: string;
  country?: string | null;
}

export interface NormalizedFixture {
  provider: SportsProvider;
  providerFixtureId: string;
  competition?: NormalizedCompetition;
  season?: number | null;
  homeTeam?: NormalizedTeam;
  awayTeam?: NormalizedTeam;
  scheduledAt?: Date | null;
  status: FixtureStatus;
  scoreHome?: number | null;
  scoreAway?: number | null;
  includedByFilters: string[];
  metadata: Record<string, JsonValue>;
}

export interface PersistedFixtureBundle {
  normalized: NormalizedFixture;
  fixture: Fixture;
}

export interface ProviderRequestMetadata {
  method: 'GET';
  url: string;
  endpointName: ApiFootballEndpointName;
  query: Record<string, string | number | boolean>;
  headers: Record<string, string>;
}

export interface ProviderResponseSnapshot {
  endpointName: ApiFootballEndpointName;
  requestHash: string;
  responseHash: string | null;
  payloadHash: string | null;
  requestMetadata: Record<string, JsonValue>;
  quotaMetadata: Record<string, JsonValue>;
  rawPayload?: JsonValue | null;
  capturedAt: Date;
  responseMs?: number;
}

export interface ProviderSnapshotSink {
  capture(input: ProviderSnapshotInput): Promise<{ id: string } | null>;
}

export interface ProviderQuotaSink {
  record(input: ProviderQuotaSampleInput): Promise<unknown>;
}

export interface ApiFootballPersistence {
  upsertFixtures?(fixtures: NormalizedFixture[]): Promise<PersistedFixtureBundle[]>;
  resolveFixtureByProviderFixtureId?(providerFixtureId: string): Promise<Fixture | null>;
  persistOddsSnapshot?(snapshot: CanonicalOddsSnapshot): Promise<CanonicalOddsSnapshot>;
  snapshotSink?: ProviderSnapshotSink;
  quotaSink?: ProviderQuotaSink;
  providerId?: string | null;
}
