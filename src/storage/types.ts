export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export type DbDate = Date;
export type DbDecimal = number | string | { toString(): string };

export type FixtureStatus = 'scheduled' | 'live' | 'completed' | 'cancelled' | 'unknown';
export type HarnessStatus = 'created' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type HarnessTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type LowOddsScanStatus = 'created' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ResearchBundleStatus = 'created' | 'running' | 'succeeded' | 'failed' | 'review-required' | 'blocked';
export type ResearchSourceType = 'api-football' | 'provider-snapshot' | 'web-search' | 'db' | 'artifact' | string;
export type ClaimConflictStatus = 'none' | 'conflict' | 'unknown' | string;
export type PredictionStatus = 'draft' | 'candidate' | 'review-required' | 'promotable' | 'blocked' | string;
export type ParlayStatus = 'draft' | 'candidate' | 'review-required' | 'promotable' | 'blocked' | string;
export type ParlayLegStatus = 'pending' | 'won' | 'lost' | 'push' | 'voided' | 'error' | 'blocked' | string;
export type ValidationArtifactStatus = 'pending' | 'won' | 'lost' | 'push' | 'voided' | 'error' | 'blocked' | string;

export interface PrismaBatchPayload {
  count: number;
}

export interface PrismaModelDelegate<Record> {
  create(args: any): Promise<Record>;
  createMany(args: any): Promise<PrismaBatchPayload>;
  findFirst(args?: any): Promise<Record | null>;
  findMany(args?: any): Promise<Record[]>;
  findUnique(args: any): Promise<Record | null>;
  update(args: any): Promise<Record>;
  upsert(args: any): Promise<Record>;
  count?(args?: any): Promise<number>;
}

export interface StoragePrismaClient {
  $transaction?<T>(fn: (tx: StoragePrismaClient) => Promise<T>): Promise<T>;
  sportsProvider: PrismaModelDelegate<SportsProviderRecord>;
  competition: PrismaModelDelegate<CompetitionRecord>;
  team: PrismaModelDelegate<TeamRecord>;
  fixture: PrismaModelDelegate<FixtureRecord>;
  providerSnapshot: PrismaModelDelegate<ProviderSnapshotRecord>;
  oddsSnapshot: PrismaModelDelegate<OddsSnapshotRecord>;
  oddsQuote: PrismaModelDelegate<OddsQuoteRecord>;
  harnessRun: PrismaModelDelegate<HarnessRunRecord>;
  harnessTask: PrismaModelDelegate<HarnessTaskRecord>;
  artifact: PrismaModelDelegate<ArtifactRecord>;
  auditLog: PrismaModelDelegate<AuditLogRecord>;
  providerQuotaSample: PrismaModelDelegate<ProviderQuotaSampleRecord>;
  leaguePreset: PrismaModelDelegate<LeaguePresetRecord>;
  teamPreset: PrismaModelDelegate<TeamPresetRecord>;
  searchFilterPreset: PrismaModelDelegate<SearchFilterPresetRecord>;
  lowOddsScan: PrismaModelDelegate<LowOddsScanRecord>;
  lowOddsHit: PrismaModelDelegate<LowOddsHitRecord>;
  researchBundle: PrismaModelDelegate<ResearchBundleRecord>;
  sourceRecord: PrismaModelDelegate<SourceRecordRecord>;
  evidenceItem: PrismaModelDelegate<EvidenceItemRecord>;
  claim: PrismaModelDelegate<ClaimRecord>;
  prediction: PrismaModelDelegate<PredictionRecord>;
  parlay: PrismaModelDelegate<ParlayRecord>;
  parlayLeg: PrismaModelDelegate<ParlayLegRecord>;
  validationArtifact: PrismaModelDelegate<ValidationArtifactRecord>;
}

export interface SportsProviderRecord {
  id: string;
  code: string;
  name: string;
  baseUrl: string | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface SportsProviderInput {
  code: string;
  name: string;
  baseUrl?: string | null;
  metadata?: JsonValue | null;
}

export interface CompetitionRecord {
  id: string;
  providerId: string;
  providerCompetitionId: string;
  name: string;
  country: string | null;
  type: string | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface CompetitionInput {
  providerId: string;
  providerCompetitionId: string;
  name: string;
  country?: string | null;
  type?: string | null;
  metadata?: JsonValue | null;
}

export interface TeamRecord {
  id: string;
  providerId: string;
  providerTeamId: string;
  name: string;
  country: string | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface TeamInput {
  providerId: string;
  providerTeamId: string;
  name: string;
  country?: string | null;
  metadata?: JsonValue | null;
}

export interface FixtureRecord {
  id: string;
  providerId: string;
  providerFixtureId: string;
  competitionId: string | null;
  season: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: DbDate | null;
  status: FixtureStatus | string;
  scoreHome: number | null;
  scoreAway: number | null;
  includedByFilters: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface FixtureInput {
  providerId: string;
  providerFixtureId: string;
  status: FixtureStatus | string;
  competitionId?: string | null;
  season?: number | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  scheduledAt?: Date | null;
  scoreHome?: number | null;
  scoreAway?: number | null;
  includedByFilters?: string[] | JsonValue | null;
  metadata?: JsonValue | null;
}

export interface ProviderSnapshotRecord {
  id: string;
  providerId: string;
  endpointName: string;
  requestHash: string;
  responseHash: string | null;
  payloadHash: string | null;
  capturedAt: DbDate;
  quotaMetadata: JsonValue | null;
  requestMetadata: JsonValue | null;
  rawPayload: JsonValue | null;
  runId: string | null;
  taskId: string | null;
  correlationId: string | null;
  traceId: string | null;
  createdAt: DbDate;
}

export interface ProviderSnapshotInput {
  providerId: string;
  endpointName: string;
  requestHash: string;
  capturedAt?: Date;
  responseHash?: string | null;
  payloadHash?: string | null;
  quotaMetadata?: JsonValue | null;
  requestMetadata?: JsonValue | null;
  rawPayload?: JsonValue | null;
  runId?: string | null;
  taskId?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
}

export interface OddsSnapshotRecord {
  id: string;
  fixtureId: string;
  providerSnapshotId: string | null;
  providerFixtureId: string;
  bookmakerCount: number;
  capturedAt: DbDate;
  payloadHash: string | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
}

export interface OddsSnapshotInput {
  fixtureId: string;
  providerFixtureId: string;
  capturedAt?: Date;
  providerSnapshotId?: string | null;
  bookmakerCount?: number;
  payloadHash?: string | null;
  metadata?: JsonValue | null;
}

export interface OddsQuoteRecord {
  id: string;
  snapshotId: string;
  fixtureId: string;
  bookmaker: string;
  bookmakerKey: string | null;
  marketKey: string;
  selectionKey: string;
  line: DbDecimal | null;
  price: DbDecimal;
  impliedProbability: DbDecimal | null;
  capturedAt: DbDate;
  metadata: JsonValue | null;
  createdAt: DbDate;
}

export interface OddsQuoteInput {
  snapshotId: string;
  fixtureId: string;
  bookmaker: string;
  marketKey: string;
  selectionKey: string;
  price: number;
  capturedAt?: Date;
  bookmakerKey?: string | null;
  impliedProbability?: number | null;
  line?: number | null;
  metadata?: JsonValue | null;
}

export interface HarnessRunRecord {
  id: string;
  runtime: string;
  profile: string;
  providerSports: string;
  providerAgentic: string | null;
  model: string | null;
  filterPresetId: string | null;
  status: HarnessStatus | string;
  verdict: string | null;
  artifactDir: string | null;
  startedAt: DbDate | null;
  completedAt: DbDate | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface HarnessRunInput {
  id?: string;
  runtime: string;
  profile: string;
  providerSports: string;
  status?: HarnessStatus | string;
  providerAgentic?: string | null;
  model?: string | null;
  filterPresetId?: string | null;
  verdict?: string | null;
  artifactDir?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  metadata?: JsonValue | null;
}

export interface HarnessTaskRecord {
  id: string;
  runId: string | null;
  type: string;
  status: HarnessTaskStatus | string;
  priority: number;
  scheduledFor: DbDate | null;
  leaseExpiresAt: DbDate | null;
  attempts: number;
  maxAttempts: number;
  payload: JsonValue | null;
  lastErrorRedacted: string | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface HarnessTaskInput {
  type: string;
  status?: HarnessTaskStatus | string;
  priority?: number;
  runId?: string | null;
  scheduledFor?: Date | null;
  leaseExpiresAt?: Date | null;
  attempts?: number;
  maxAttempts?: number;
  payload?: JsonValue | null;
  lastErrorRedacted?: string | null;
}

export interface ArtifactRecord {
  id: string;
  runId: string | null;
  name: string;
  kind: string;
  path: string;
  sha256: string | null;
  sizeBytes: bigint | number | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
}

export interface ArtifactInput {
  name: string;
  kind: string;
  path: string;
  runId?: string | null;
  sha256?: string | null;
  sizeBytes?: bigint | number | null;
  metadata?: JsonValue | null;
}

export interface AuditLogRecord {
  id: string;
  runId: string | null;
  taskId: string | null;
  eventType: string;
  actor: string;
  severity: string;
  correlationId: string | null;
  traceId: string | null;
  payloadRedacted: JsonValue | null;
  createdAt: DbDate;
}

export interface AuditLogInput {
  eventType: string;
  runId?: string | null;
  taskId?: string | null;
  actor?: string;
  severity?: string;
  correlationId?: string | null;
  traceId?: string | null;
  payloadRedacted?: JsonValue | null;
}

export interface ProviderQuotaSampleRecord {
  id: string;
  providerId: string | null;
  providerCode: string;
  endpointName: string | null;
  status: string;
  quotaLimit: number | null;
  quotaRemaining: number | null;
  resetAt: DbDate | null;
  responseMs: number | null;
  errorRedacted: string | null;
  metadata: JsonValue | null;
  sampledAt: DbDate;
  createdAt: DbDate;
}

export interface ProviderQuotaSampleInput {
  providerCode: string;
  status: string;
  providerId?: string | null;
  endpointName?: string | null;
  sampledAt?: Date;
  quotaLimit?: number | null;
  quotaRemaining?: number | null;
  resetAt?: Date | null;
  responseMs?: number | null;
  errorRedacted?: string | null;
  metadata?: JsonValue | null;
}

export interface LeaguePresetRecord {
  id: string;
  presetKey: string;
  providerId: string;
  providerCompetitionId: string;
  competitionId: string | null;
  name: string;
  country: string | null;
  season: number | null;
  enabled: boolean;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface LeaguePresetInput {
  providerId: string;
  providerCompetitionId: string;
  name: string;
  presetKey?: string;
  competitionId?: string | null;
  country?: string | null;
  season?: number | null;
  enabled?: boolean;
  metadata?: JsonValue | null;
}

export interface TeamPresetRecord {
  id: string;
  presetKey: string;
  providerId: string;
  providerTeamId: string;
  teamId: string | null;
  name: string;
  country: string | null;
  providerLeagueId: string | null;
  enabled: boolean;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface TeamPresetInput {
  providerId: string;
  providerTeamId: string;
  name: string;
  presetKey?: string;
  teamId?: string | null;
  country?: string | null;
  providerLeagueId?: string | null;
  enabled?: boolean;
  metadata?: JsonValue | null;
}

export interface SearchFilterPresetRecord {
  id: string;
  key: string;
  name: string;
  season: number | null;
  markets: JsonValue | null;
  threshold: DbDecimal | null;
  kickoffWindowHours: number | null;
  includeLiveFixtures: boolean;
  includeCompletedFixtures: boolean;
  maxFixtures: number | null;
  bookmakerAllowlist: JsonValue | null;
  combineMode: string;
  configSnapshot: JsonValue | null;
  enabled: boolean;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface SearchFilterPresetInput {
  key: string;
  name: string;
  season?: number | null;
  markets?: string[] | JsonValue | null;
  threshold?: number | null;
  kickoffWindowHours?: number | null;
  includeLiveFixtures?: boolean;
  includeCompletedFixtures?: boolean;
  maxFixtures?: number | null;
  bookmakerAllowlist?: string[] | JsonValue | null;
  combineMode?: string;
  configSnapshot?: JsonValue | null;
  enabled?: boolean;
}

export interface LowOddsScanRecord {
  id: string;
  runId: string | null;
  filterPresetId: string | null;
  querySnapshot: JsonValue | null;
  threshold: DbDecimal;
  comparison: string;
  status: LowOddsScanStatus | string;
  fixtureCount: number;
  hitCount: number;
  startedAt: DbDate | null;
  completedAt: DbDate | null;
  errorRedacted: string | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface LowOddsScanInput {
  threshold: number;
  status?: LowOddsScanStatus | string;
  runId?: string | null;
  filterPresetId?: string | null;
  querySnapshot?: JsonValue | null;
  comparison?: string;
  fixtureCount?: number;
  hitCount?: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorRedacted?: string | null;
}

export interface LowOddsHitRecord {
  id: string;
  scanId: string;
  fixtureId: string;
  oddsQuoteId: string | null;
  marketKey: string;
  selectionKey: string;
  line: DbDecimal | null;
  odds: DbDecimal;
  impliedProbability: DbDecimal | null;
  bookmaker: string | null;
  includedReasons: JsonValue | null;
  excludedReasons: JsonValue | null;
  eligible: boolean;
  metadata: JsonValue | null;
  createdAt: DbDate;
}

export interface LowOddsHitInput {
  scanId: string;
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  odds: number;
  oddsQuoteId?: string | null;
  impliedProbability?: number | null;
  line?: number | null;
  bookmaker?: string | null;
  includedReasons?: string[] | JsonValue | null;
  excludedReasons?: string[] | JsonValue | null;
  eligible?: boolean;
  metadata?: JsonValue | null;
}

export interface ResearchBundleRecord {
  id: string;
  runId: string | null;
  fixtureId: string | null;
  providerFixtureId: string | null;
  artifactId: string | null;
  status: ResearchBundleStatus | string;
  gateResult: JsonValue | null;
  providerAgentic: string | null;
  model: string | null;
  promptVersion: string | null;
  warnings: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface ResearchBundleInput {
  id?: string;
  runId?: string | null;
  fixtureId?: string | null;
  providerFixtureId?: string | null;
  artifactId?: string | null;
  status?: ResearchBundleStatus | string;
  gateResult?: JsonValue | null;
  providerAgentic?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  warnings?: JsonValue | null;
  metadata?: JsonValue | null;
  createdAt?: Date;
}

export interface SourceRecordRecord {
  id: string;
  bundleId: string;
  runId: string | null;
  fixtureId: string | null;
  artifactId: string | null;
  providerSnapshotId: string | null;
  sourceType: ResearchSourceType;
  url: string | null;
  title: string | null;
  externalId: string | null;
  hash: string | null;
  capturedAt: DbDate;
  warnings: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
}

export interface SourceRecordInput {
  id?: string;
  bundleId: string;
  sourceType: ResearchSourceType;
  runId?: string | null;
  fixtureId?: string | null;
  artifactId?: string | null;
  providerSnapshotId?: string | null;
  url?: string | null;
  title?: string | null;
  externalId?: string | null;
  hash?: string | null;
  capturedAt?: Date;
  warnings?: JsonValue | null;
  metadata?: JsonValue | null;
}

export interface EvidenceItemRecord {
  id: string;
  bundleId: string;
  sourceId: string;
  fixtureId: string | null;
  artifactId: string | null;
  kind: string | null;
  snippetRedacted: string | null;
  summaryRedacted: string | null;
  confidence: DbDecimal | null;
  claimIds: JsonValue | null;
  warnings: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface EvidenceItemInput {
  id?: string;
  bundleId: string;
  sourceId: string;
  fixtureId?: string | null;
  artifactId?: string | null;
  kind?: string | null;
  snippetRedacted?: string | null;
  summaryRedacted?: string | null;
  confidence?: number | null;
  claimIds?: string[] | JsonValue | null;
  warnings?: JsonValue | null;
  metadata?: JsonValue | null;
}

export interface ClaimRecord {
  id: string;
  bundleId: string;
  fixtureId: string | null;
  sourceId: string | null;
  statement: string;
  subjectType: string | null;
  subjectKey: string | null;
  marketKey: string | null;
  selectionKey: string | null;
  line: DbDecimal | null;
  supportLevel: string;
  confidence: DbDecimal | null;
  evidenceIds: JsonValue | null;
  conflictStatus: ClaimConflictStatus;
  critical: boolean;
  warnings: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface ClaimInput {
  id?: string;
  bundleId: string;
  statement: string;
  fixtureId?: string | null;
  sourceId?: string | null;
  subjectType?: string | null;
  subjectKey?: string | null;
  marketKey?: string | null;
  selectionKey?: string | null;
  line?: number | null;
  supportLevel?: string;
  confidence?: number | null;
  evidenceIds?: string[] | JsonValue | null;
  conflictStatus?: ClaimConflictStatus;
  critical?: boolean;
  warnings?: JsonValue | null;
  metadata?: JsonValue | null;
}

export interface PredictionRecord {
  id: string;
  runId: string | null;
  fixtureId: string;
  oddsSnapshotId: string;
  oddsQuoteId: string;
  researchBundleId: string | null;
  artifactId: string | null;
  marketKey: string;
  selectionKey: string;
  line: DbDecimal | null;
  odds: DbDecimal;
  impliedProbability: DbDecimal;
  estimatedProbability: DbDecimal | null;
  edge: DbDecimal | null;
  confidence: DbDecimal;
  quality: string;
  rationaleRedacted: string;
  warnings: JsonValue | null;
  evidenceIds: JsonValue | null;
  includedByFilters: JsonValue | null;
  providerAgentic: string | null;
  model: string | null;
  promptVersion: string;
  scoringRuleVersion: string;
  status: PredictionStatus;
  generatedAt: DbDate;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface PredictionInput {
  id?: string;
  runId?: string | null;
  fixtureId: string;
  oddsSnapshotId: string;
  oddsQuoteId: string;
  researchBundleId?: string | null;
  artifactId?: string | null;
  marketKey: string;
  selectionKey: string;
  odds: number;
  impliedProbability: number;
  confidence: number;
  rationaleRedacted: string;
  promptVersion: string;
  scoringRuleVersion: string;
  status?: PredictionStatus;
  line?: number | null;
  estimatedProbability?: number | null;
  edge?: number | null;
  quality?: string;
  warnings?: string[] | JsonValue | null;
  evidenceIds?: string[] | JsonValue | null;
  includedByFilters?: string[] | JsonValue | null;
  providerAgentic?: string | null;
  model?: string | null;
  generatedAt?: Date;
  metadata?: JsonValue | null;
}

export interface ParlayRecord {
  id: string;
  runId: string | null;
  artifactId: string | null;
  combinedOdds: DbDecimal | null;
  aggregateConfidence: DbDecimal;
  aggregateQuality: DbDecimal;
  rationaleRedacted: string;
  warnings: JsonValue | null;
  status: ParlayStatus;
  generatedAt: DbDate;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface ParlayInput {
  id?: string;
  runId?: string | null;
  artifactId?: string | null;
  combinedOdds?: number | null;
  aggregateConfidence: number;
  aggregateQuality: number;
  rationaleRedacted: string;
  warnings?: string[] | JsonValue | null;
  status?: ParlayStatus;
  generatedAt?: Date;
  metadata?: JsonValue | null;
}

export interface ParlayLegRecord {
  id: string;
  parlayId: string;
  predictionId: string;
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  line: DbDecimal | null;
  odds: DbDecimal;
  status: ParlayLegStatus;
  legIndex: number;
  inclusionReason: string | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface ParlayLegInput {
  id?: string;
  parlayId: string;
  predictionId: string;
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  odds: number;
  status?: ParlayLegStatus;
  legIndex: number;
  line?: number | null;
  inclusionReason?: string | null;
  metadata?: JsonValue | null;
}

export interface ValidationArtifactRecord {
  id: string;
  runId: string | null;
  predictionId: string | null;
  parlayId: string | null;
  fixtureId: string | null;
  providerSnapshotId: string | null;
  artifactId: string | null;
  settlementRuleVersion: string;
  status: ValidationArtifactStatus;
  reason: string | null;
  evaluatedAt: DbDate;
  resultInput: JsonValue | null;
  outcome: JsonValue | null;
  evidenceIds: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: DbDate;
  updatedAt: DbDate;
}

export interface ValidationArtifactInput {
  id?: string;
  runId?: string | null;
  predictionId?: string | null;
  parlayId?: string | null;
  fixtureId?: string | null;
  providerSnapshotId?: string | null;
  artifactId?: string | null;
  settlementRuleVersion: string;
  status: ValidationArtifactStatus;
  reason?: string | null;
  evaluatedAt?: Date;
  resultInput?: JsonValue | null;
  outcome?: JsonValue | null;
  evidenceIds?: string[] | JsonValue | null;
  metadata?: JsonValue | null;
}
