import { randomUUID } from 'crypto';
import { basename } from 'path';
import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { MarketKey, MarketSelection } from '../domain/markets.js';
import { API_FOOTBALL_PROVIDER } from '../providers/sports/types.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type {
  ArtifactRecord,
  FixtureRecord,
  JsonValue,
  ParlayLegRecord,
  ParlayRecord,
  PredictionRecord,
  StoragePrismaClient,
  ValidationArtifactInput,
  ValidationArtifactRecord,
} from '../storage/types.js';
import { SETTLEMENT_RULE_VERSION, settleMarket } from './settlement-rules.js';
import type { SettlementOutcome, ValidationStatus } from './types.js';
import {
  createApiFootballValidationResultFetcher,
  type ValidationResultFetcher,
  type ValidationResultFetchResult,
} from './result-fetcher.js';

const VALIDATABLE_STATUSES = ['candidate', 'review-required', 'promotable'];
const DATE_PREDICTION_PAGE_SIZE = 500;
const DATE_PARLAY_PAGE_SIZE = 100;
const DATE_VALIDATION_CONCURRENCY = 5;

export interface RunValidationInput {
  date?: string;
  predictionId?: string;
  parlayId?: string;
}

export interface ValidationGateResult {
  verdict: ValidationStatus;
  reasons: string[];
  warnings: string[];
}

export interface ValidationArtifactView {
  id?: string;
  predictionId?: string;
  parlayId?: string;
  fixtureId?: string;
  providerSnapshotId?: string;
  status: ValidationStatus;
  reason?: string;
  outcome: SettlementOutcome | { status: ValidationStatus; reason?: string; legOutcomes?: ValidationArtifactView[] };
  evaluatedAt: string;
}

export interface ValidationRunResult {
  ok: boolean;
  runId: string;
  target: RunValidationInput;
  gateResult: ValidationGateResult;
  validations: ValidationArtifactView[];
  artifactPath?: string;
  error?: string;
}

export interface ValidationDependencies {
  now?: () => Date;
  repositories?: ValidationRepositories;
  fetcher?: ValidationResultFetcher;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  persistArtifact?: (input: { runId: string; path: string; payload: unknown; target: RunValidationInput }) => Promise<Pick<ArtifactRecord, 'id'> | null>;
  persistValidation?: (input: ValidationArtifactInput) => Promise<ValidationArtifactRecord>;
}

export interface ValidationRepositories {
  predictions: {
    findById(id: string): Promise<PredictionRecord | null>;
    listForFixtureDate(date: Date | string, query: { status?: string | string[]; take?: number; skip?: number; timezone?: string }): Promise<PredictionRecord[]>;
  };
  fixtures: {
    findById(id: string): Promise<FixtureRecord | null>;
  };
  parlays: {
    findById(id: string): Promise<ParlayRecord | null>;
    listForFixtureDate(date: Date | string, query?: { status?: string | string[]; take?: number; skip?: number; timezone?: string }): Promise<ParlayRecord[]>;
  };
  parlayLegs: {
    list(query: { parlayId?: string; predictionId?: string; fixtureId?: string; status?: string; take?: number }): Promise<ParlayLegRecord[]>;
    updateStatus(id: string, status: string): Promise<ParlayLegRecord>;
  };
  harnessRuns?: {
    upsertForRun?(input: {
      id: string;
      runtime: string;
      profile: string;
      providerSports: string;
      providerAgentic?: string | null;
      model?: string | null;
      status?: string;
      verdict?: string | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
      metadata?: JsonValue | null;
    }): Promise<unknown>;
  };
  artifacts?: {
    create(input: {
      name: string;
      kind: string;
      path: string;
      runId?: string | null;
      sha256?: string | null;
      metadata?: JsonValue | null;
    }): Promise<ArtifactRecord>;
  };
  validationArtifacts?: {
    create(input: ValidationArtifactInput): Promise<ValidationArtifactRecord>;
  };
}

interface PendingValidation {
  view: ValidationArtifactView;
  input: ValidationArtifactInput;
}

interface ValidationExecutionContext {
  repositories: ValidationRepositories;
  fetcher: ValidationResultFetcher;
  fixtures: Map<string, Promise<FixtureRecord | null>>;
  results: Map<string, Promise<ValidationResultFetchResult>>;
}

export async function runValidation(
  config: AgentConfig,
  input: RunValidationInput,
  runtime: RuntimeContext,
  deps: ValidationDependencies = {},
): Promise<ValidationRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const evaluatedAt = now().toISOString();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));

  try {
    assertSingleTarget(input);
  } catch (err: any) {
    return blockedResult(runId, input, evaluatedAt, artifactWriter, err?.message ?? String(err));
  }

  if (!deps.repositories && !config.databaseUrl) {
    return blockedResult(runId, input, evaluatedAt, artifactWriter, 'DATABASE_URL is required to validate persisted predictions and parlays.');
  }

  const repositories = deps.repositories ?? defaultRepositories();
  const fetcher = deps.fetcher ?? await createApiFootballValidationResultFetcher(config, runtime);
  const validationContext = createValidationExecutionContext(repositories, fetcher);

  try {
    const pending = input.predictionId
      ? [await validatePredictionTarget(validationContext, input.predictionId, evaluatedAt, runId)]
      : input.parlayId
        ? [await validateParlayTarget(validationContext, input.parlayId, evaluatedAt, runId)]
        : await validateDateTarget(validationContext, input.date as string, evaluatedAt, runId, config.apiFootball.timezone);

    const gateResult = gateFromValidations(pending.map((item) => item.view));
    const artifactPayload = buildArtifactPayload(runId, input, evaluatedAt, gateResult, pending.map((item) => item.view));
    const artifactPath = artifactWriter(
      runId,
      gateResult.verdict === 'blocked' ? 'validations-blocked.json' : 'validations.json',
      artifactPayload,
    );
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, 'succeeded', now(), input);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      target: input,
    });
    const persistValidation = deps.persistValidation ?? defaultPersistValidation(repositories);
    const persisted: ValidationArtifactView[] = [];
    for (const item of pending) {
      const record = await persistValidation({
        ...item.input,
        artifactId: artifact?.id ?? null,
      });
      persisted.push({ ...item.view, id: record.id });
    }

    return {
      ok: true,
      runId,
      target: input,
      gateResult,
      validations: persisted,
      artifactPath,
    };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    const result = blockedResult(runId, input, evaluatedAt, artifactWriter, message);
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), input).catch(() => undefined);
    return result;
  }
}

async function validateDateTarget(
  context: ValidationExecutionContext,
  date: string,
  evaluatedAt: string,
  runId: string,
  timezone?: string,
): Promise<PendingValidation[]> {
  const [predictions, parlays] = await Promise.all([
    listAllFixtureDateRecords((query) => context.repositories.predictions.listForFixtureDate(date, query), {
      status: VALIDATABLE_STATUSES,
      take: DATE_PREDICTION_PAGE_SIZE,
      timezone,
    }),
    listAllFixtureDateRecords((query) => context.repositories.parlays.listForFixtureDate(date, query), {
      status: VALIDATABLE_STATUSES,
      take: DATE_PARLAY_PAGE_SIZE,
      timezone,
    }),
  ]);
  const predictionValidations = await mapLimit(
    predictions,
    DATE_VALIDATION_CONCURRENCY,
    (prediction) => validatePredictionRecord(context, prediction, evaluatedAt, runId),
  );
  const parlayValidations = await mapLimit(
    parlays,
    DATE_VALIDATION_CONCURRENCY,
    (parlay) => validateParlayRecord(context, parlay, evaluatedAt, runId),
  );
  return [...predictionValidations, ...parlayValidations];
}

async function validatePredictionTarget(
  context: ValidationExecutionContext,
  predictionId: string,
  evaluatedAt: string,
  runId: string,
): Promise<PendingValidation> {
  const { repositories } = context;
  const prediction = await repositories.predictions.findById(predictionId);
  if (!prediction) throw new Error(`Prediction "${predictionId}" was not found.`);
  return validatePredictionRecord(context, prediction, evaluatedAt, runId);
}

async function validatePredictionRecord(
  context: ValidationExecutionContext,
  prediction: PredictionRecord,
  evaluatedAt: string,
  runId: string,
): Promise<PendingValidation> {
  const fixture = await findFixture(context, prediction.fixtureId);
  if (!fixture) throw new Error(`Fixture "${prediction.fixtureId}" was not found for prediction "${prediction.id}".`);
  const market = marketKey(prediction.marketKey);
  const fetched = await fetchValidationResult(context, fixture, market);
  const selection = selectionFromPrediction(prediction);
  const outcome = settleMarket({
    selection,
    fixture: fetched.fixture,
    statistics: fetched.statistics,
    evaluatedAt,
  });
  const evidenceIds = stringArray(prediction.evidenceIds);
  const resultInput = compactJson({
    selection,
    fixture: fetched.fixture,
    statistics: fetched.statistics,
  });

  return validationFor({
    runId,
    predictionId: prediction.id,
    fixtureId: fixture.id,
    providerSnapshotId: fetched.providerSnapshotId,
    status: outcome.status,
    reason: outcome.reason,
    evaluatedAt,
    outcome,
    resultInput,
    evidenceIds,
    metadata: {
      providerFixtureId: fixture.providerFixtureId,
      resultProviderSnapshotId: fetched.resultProviderSnapshotId ?? null,
      statisticsProviderSnapshotId: fetched.statisticsProviderSnapshotId ?? null,
    },
  });
}

async function validateParlayTarget(
  context: ValidationExecutionContext,
  parlayId: string,
  evaluatedAt: string,
  runId: string,
): Promise<PendingValidation> {
  const { repositories } = context;
  const parlay = await repositories.parlays.findById(parlayId);
  if (!parlay) throw new Error(`Parlay "${parlayId}" was not found.`);
  return validateParlayRecord(context, parlay, evaluatedAt, runId);
}

async function validateParlayRecord(
  context: ValidationExecutionContext,
  parlay: ParlayRecord,
  evaluatedAt: string,
  runId: string,
): Promise<PendingValidation> {
  const { repositories } = context;
  const legs = await repositories.parlayLegs.list({ parlayId: parlay.id, take: 100 });
  const legValidations: ValidationArtifactView[] = [];
  const resultInputs: JsonValue[] = [];
  const providerSnapshotIds = new Set<string>();

  for (const leg of legs) {
    const fixture = await findFixture(context, leg.fixtureId);
    if (!fixture) throw new Error(`Fixture "${leg.fixtureId}" was not found for parlay leg "${leg.id}".`);
    const market = marketKey(leg.marketKey);
    const fetched = await fetchValidationResult(context, fixture, market);
    const selection = selectionFromParlayLeg(leg);
    const outcome = settleMarket({
      selection,
      fixture: fetched.fixture,
      statistics: fetched.statistics,
      evaluatedAt,
    });
    await repositories.parlayLegs.updateStatus(leg.id, outcome.status);
    if (fetched.providerSnapshotId) providerSnapshotIds.add(fetched.providerSnapshotId);
    resultInputs.push(compactJson({ legId: leg.id, selection, fixture: fetched.fixture, statistics: fetched.statistics }));
    legValidations.push({
      predictionId: leg.predictionId,
      fixtureId: leg.fixtureId,
      providerSnapshotId: fetched.providerSnapshotId,
      status: outcome.status,
      reason: outcome.reason,
      outcome,
      evaluatedAt,
    });
  }

  const status = aggregateParlayStatus(legValidations.map((item) => item.status));
  const outcome = {
    status,
    legOutcomes: legValidations,
  };

  return validationFor({
    runId,
    parlayId: parlay.id,
    providerSnapshotId: [...providerSnapshotIds][0],
    status,
    evaluatedAt,
    outcome,
    resultInput: compactJson({ parlayId: parlay.id, legs: resultInputs }),
    metadata: {
      legCount: legs.length,
    },
  });
}

function createValidationExecutionContext(
  repositories: ValidationRepositories,
  fetcher: ValidationResultFetcher,
): ValidationExecutionContext {
  return {
    repositories,
    fetcher,
    fixtures: new Map(),
    results: new Map(),
  };
}

async function listAllFixtureDateRecords<T>(
  listPage: (query: { status?: string | string[]; take: number; skip: number; timezone?: string }) => Promise<T[]>,
  query: { status?: string | string[]; take: number; timezone?: string },
): Promise<T[]> {
  const all: T[] = [];
  const take = query.take;
  let skip = 0;

  while (take > 0) {
    const page = await listPage({ ...query, skip });
    all.push(...page);
    if (page.length < take) break;
    skip += page.length;
  }

  return all;
}

async function mapLimit<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function findFixture(context: ValidationExecutionContext, fixtureId: string): Promise<FixtureRecord | null> {
  let fixture = context.fixtures.get(fixtureId);
  if (!fixture) {
    fixture = context.repositories.fixtures.findById(fixtureId);
    context.fixtures.set(fixtureId, fixture);
  }
  return fixture;
}

async function fetchValidationResult(
  context: ValidationExecutionContext,
  fixture: FixtureRecord,
  market: MarketKey,
): Promise<ValidationResultFetchResult> {
  const resultKey = `${fixture.id}:${market === 'corners_over_under' ? 'corners' : 'result'}`;
  let result = context.results.get(resultKey);
  if (!result) {
    result = context.fetcher.fetch({ providerFixtureId: fixture.providerFixtureId, fixtureId: fixture.id, market });
    context.results.set(resultKey, result);
  }
  return result;
}

function validationFor(input: {
  runId: string;
  predictionId?: string;
  parlayId?: string;
  fixtureId?: string;
  providerSnapshotId?: string;
  status: ValidationStatus;
  reason?: string;
  evaluatedAt: string;
  outcome: ValidationArtifactView['outcome'];
  resultInput?: JsonValue | null;
  evidenceIds?: string[];
  metadata?: Record<string, unknown>;
}): PendingValidation {
  const view: ValidationArtifactView = {
    ...(input.predictionId && { predictionId: input.predictionId }),
    ...(input.parlayId && { parlayId: input.parlayId }),
    ...(input.fixtureId && { fixtureId: input.fixtureId }),
    ...(input.providerSnapshotId && { providerSnapshotId: input.providerSnapshotId }),
    status: input.status,
    ...(input.reason && { reason: input.reason }),
    outcome: input.outcome,
    evaluatedAt: input.evaluatedAt,
  };
  return {
    view,
    input: {
      runId: input.runId,
      predictionId: input.predictionId ?? null,
      parlayId: input.parlayId ?? null,
      fixtureId: input.fixtureId ?? null,
      providerSnapshotId: input.providerSnapshotId ?? null,
      settlementRuleVersion: SETTLEMENT_RULE_VERSION,
      status: input.status,
      reason: input.reason ?? null,
      evaluatedAt: new Date(input.evaluatedAt),
      resultInput: input.resultInput ?? null,
      outcome: compactJson(input.outcome as Record<string, unknown>),
      evidenceIds: input.evidenceIds ?? null,
      metadata: compactJson(input.metadata ?? {}),
    },
  };
}

function selectionFromPrediction(prediction: PredictionRecord): MarketSelection {
  return {
    market: marketKey(prediction.marketKey),
    selection: prediction.selectionKey,
    line: numberOrUndefined(prediction.line),
    odds: numberValue(prediction.odds),
    impliedProbability: numberValue(prediction.impliedProbability),
    sourceSnapshotId: prediction.oddsSnapshotId,
  };
}

function selectionFromParlayLeg(leg: ParlayLegRecord): MarketSelection {
  return {
    market: marketKey(leg.marketKey),
    selection: leg.selectionKey,
    line: numberOrUndefined(leg.line),
    odds: numberValue(leg.odds),
    impliedProbability: 1 / numberValue(leg.odds),
    sourceSnapshotId: leg.id,
  };
}

function aggregateParlayStatus(statuses: ValidationStatus[]): ValidationStatus {
  if (statuses.length === 0) return 'blocked';
  if (statuses.includes('lost')) return 'lost';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.every((status) => status === 'won')) return 'won';
  if (statuses.every((status) => status === 'voided')) return 'voided';
  if (statuses.every((status) => status === 'won' || status === 'push' || status === 'voided')) return 'push';
  return 'error';
}

function gateFromValidations(validations: ValidationArtifactView[]): ValidationGateResult {
  const verdict = aggregateParlayStatus(validations.map((item) => item.status));
  return {
    verdict,
    reasons: validations.length
      ? [...new Set(validations.flatMap((item) => item.reason ? [item.reason] : [`${item.status}:${item.predictionId ?? item.parlayId ?? item.fixtureId ?? 'validation'}`]))]
      : ['no validation targets found'],
    warnings: [],
  };
}

function buildArtifactPayload(
  runId: string,
  target: RunValidationInput,
  evaluatedAt: string,
  gateResult: ValidationGateResult,
  validations: ValidationArtifactView[],
): Record<string, unknown> {
  return {
    runId,
    target,
    evaluatedAt,
    settlementRuleVersion: SETTLEMENT_RULE_VERSION,
    gateResult,
    validations,
  };
}

function defaultRepositories(): ValidationRepositories {
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

function defaultPersistArtifact(repositories: ValidationRepositories) {
  return async (input: { runId: string; path: string; payload: unknown; target: RunValidationInput }) => {
    if (!repositories.artifacts) return null;
    return repositories.artifacts.create({
      name: basename(input.path),
      kind: 'validations',
      path: input.path,
      runId: input.runId,
      sha256: hashPayload(input.payload),
      metadata: compactJson({
        target: input.target,
        settlementRuleVersion: SETTLEMENT_RULE_VERSION,
      }),
    });
  };
}

function defaultPersistValidation(repositories: ValidationRepositories) {
  return async (input: ValidationArtifactInput) => {
    if (!repositories.validationArtifacts) throw new Error('Validation artifact repository is unavailable.');
    return repositories.validationArtifacts.create(input);
  };
}

async function upsertRun(
  config: AgentConfig,
  runtime: RuntimeContext,
  repositories: ValidationRepositories,
  runId: string,
  verdict: string,
  status: string,
  completedAt: Date,
  target: RunValidationInput,
): Promise<void> {
  await repositories.harnessRuns?.upsertForRun?.({
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports ?? API_FOOTBALL_PROVIDER,
    providerAgentic: config.provider,
    model: config.model,
    status,
    verdict,
    startedAt: completedAt,
    completedAt,
    metadata: compactJson({ target, settlementRuleVersion: SETTLEMENT_RULE_VERSION }),
  });
}

function blockedResult(
  runId: string,
  target: RunValidationInput,
  evaluatedAt: string,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  error: string,
): ValidationRunResult {
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: [error],
    warnings: [error],
  };
  const payload = buildArtifactPayload(runId, target, evaluatedAt, gateResult, []);
  const artifactPath = artifactWriter(runId, 'validations-blocked.json', { ...payload, error });
  return {
    ok: false,
    runId,
    target,
    gateResult,
    validations: [],
    artifactPath,
    error,
  };
}

function assertSingleTarget(input: RunValidationInput): void {
  const count = [input.date, input.predictionId, input.parlayId].filter((value) => typeof value === 'string' && value.trim()).length;
  if (count !== 1) throw new Error('validate requires exactly one of --date, --prediction-id, or --parlay-id.');
}

function marketKey(value: string): MarketKey {
  return value as MarketKey;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return NaN;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}
