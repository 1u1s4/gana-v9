import { randomUUID } from 'crypto';
import { basename } from 'path';
import type { AgentConfig } from '../config.js';
import type { MarketKey } from '../domain/markets.js';
import type { PredictionQuality, PredictionStatus } from '../prediction/types.js';
import { API_FOOTBALL_PROVIDER } from '../providers/sports/types.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type {
  ArtifactRecord,
  JsonValue,
  ParlayInput,
  ParlayLegInput,
  ParlayRecord,
  PredictionRecord,
  StoragePrismaClient,
} from '../storage/types.js';
import { buildParlay } from './builder.js';
import { PARLAY_BUILDER_RULE_VERSION } from './rules.js';
import type {
  BuildParlayResult,
  ParlayConfig,
  ParlaySourcePrediction,
} from './types.js';

const ELIGIBLE_PREDICTION_STATUSES: PredictionStatus[] = ['candidate', 'review-required', 'promotable'];

export interface RunParlayBuildInput {
  date: string;
  configOverrides?: ParlayConfig;
}

export interface ParlayGateResult {
  verdict: PredictionStatus;
  reasons: string[];
  warnings: string[];
}

export interface ParlayBuildRunResult {
  ok: boolean;
  runId: string;
  date: string;
  gateResult: ParlayGateResult;
  build: BuildParlayResult;
  persistedParlayId?: string;
  artifactPath?: string;
  error?: string;
}

export interface ParlayBuildDependencies {
  now?: () => Date;
  repositories?: ParlayServiceRepositories;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  persistArtifact?: (input: {
    runId: string;
    path: string;
    payload: unknown;
    date: string;
  }) => Promise<Pick<ArtifactRecord, 'id'> | null>;
  persistParlay?: (input: {
    parlay: ParlayInput;
    legs: Array<Omit<ParlayLegInput, 'parlayId'>>;
  }) => Promise<Pick<ParlayRecord, 'id'> | null>;
}

export interface ParlayServiceRepositories {
  predictions: {
    listForFixtureDate(date: Date | string, query: {
      status?: PredictionStatus | string | Array<PredictionStatus | string>;
      take?: number;
    }): Promise<PredictionRecord[]>;
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
  parlays?: {
    createWithLegs(input: {
      parlay: ParlayInput;
      legs: Array<Omit<ParlayLegInput, 'parlayId'>>;
    }): Promise<ParlayRecord>;
  };
}

export async function runParlayBuild(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  deps: ParlayBuildDependencies = {},
): Promise<ParlayBuildRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));

  if (!deps.repositories && !config.databaseUrl) {
    return blockedResult(runId, input, artifactWriter, generatedAt, {
      error: 'DATABASE_URL is required to build parlays from persisted predictions.',
      reasons: ['database read unavailable'],
    });
  }

  const repositories = deps.repositories ?? defaultRepositories();
  const predictions = await repositories.predictions.listForFixtureDate(input.date, {
    status: ELIGIBLE_PREDICTION_STATUSES,
    take: 500,
  });
  const build = buildParlay({
    id: randomUUID(),
    sourceRunId: runId,
    generatedAt,
    predictions: predictions.map(toSourcePrediction),
    config: input.configOverrides,
  });
  const gateResult = gateFromBuild(build);
  const artifactPayload = artifactPayloadFor(runId, input.date, generatedAt, build, gateResult);
  const artifactPath = artifactWriter(
    runId,
    build.parlay.status === 'blocked' ? 'parlays-blocked.json' : 'parlays.json',
    artifactPayload,
  );

  try {
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, 'succeeded', now(), input.date);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      date: input.date,
    });
    const persisted = await (deps.persistParlay ?? defaultPersistParlay(repositories))({
      parlay: toParlayInput(build, runId, artifact?.id ?? null, input.date),
      legs: build.parlay.legs.map(toParlayLegInput),
    });

    return {
      ok: gateResult.verdict !== 'blocked',
      runId,
      date: input.date,
      gateResult,
      build,
      persistedParlayId: persisted?.id,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const result = blockedResult(runId, input, artifactWriter, generatedAt, {
      error,
      reasons: ['parlay persistence failed'],
    });
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), input.date).catch(() => undefined);
    return result;
  }
}

function defaultRepositories(): ParlayServiceRepositories {
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

function defaultPersistArtifact(repositories: ParlayServiceRepositories) {
  return async (input: { runId: string; path: string; payload: unknown; date: string }) => {
    if (!repositories.artifacts) return null;
    return repositories.artifacts.create({
      name: basename(input.path),
      kind: 'parlays',
      path: input.path,
      runId: input.runId,
      sha256: hashPayload(input.payload),
      metadata: compactJson({
        date: input.date,
        parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
        analyticalArtifactOnly: true,
      }),
    });
  };
}

function defaultPersistParlay(repositories: ParlayServiceRepositories) {
  return async (input: { parlay: ParlayInput; legs: Array<Omit<ParlayLegInput, 'parlayId'>> }) => {
    if (!repositories.parlays) throw new Error('Parlay repository is unavailable.');
    return repositories.parlays.createWithLegs(input);
  };
}

function toSourcePrediction(prediction: PredictionRecord): ParlaySourcePrediction {
  return {
    id: prediction.id,
    runId: prediction.runId ?? 'unavailable-run',
    fixtureId: prediction.fixtureId,
    market: prediction.marketKey as MarketKey,
    selection: prediction.selectionKey,
    line: numberOrUndefined(prediction.line),
    odds: numberValue(prediction.odds),
    confidence: numberValue(prediction.confidence),
    quality: qualityValue(prediction.quality),
    status: prediction.status as PredictionStatus,
  };
}

function toParlayInput(build: BuildParlayResult, runId: string, artifactId: string | null, date: string): ParlayInput {
  return {
    id: build.parlay.id,
    runId,
    artifactId,
    combinedOdds: build.parlay.combinedOdds ?? null,
    aggregateConfidence: build.parlay.aggregateConfidence,
    aggregateQuality: build.parlay.aggregateQuality,
    rationaleRedacted: build.parlay.rationale,
    warnings: build.parlay.warnings,
    status: build.parlay.status,
    generatedAt: new Date(build.parlay.generatedAt),
    metadata: compactJson({
      date,
      sourceRunId: build.parlay.sourceRunId,
      parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
      config: build.config,
      evaluations: build.evaluations,
      analyticalArtifactOnly: true,
    }),
  };
}

function toParlayLegInput(leg: BuildParlayResult['parlay']['legs'][number]): Omit<ParlayLegInput, 'parlayId'> {
  return {
    predictionId: leg.predictionId,
    fixtureId: leg.fixtureId,
    marketKey: leg.market,
    selectionKey: leg.selection,
    line: leg.line ?? null,
    odds: leg.odds,
    status: leg.status,
    legIndex: leg.index,
    inclusionReason: leg.inclusionReason,
  };
}

async function upsertRun(
  config: AgentConfig,
  runtime: RuntimeContext,
  repositories: ParlayServiceRepositories,
  runId: string,
  verdict: string,
  status: string,
  completedAt: Date,
  date: string,
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
    metadata: compactJson({
      date,
      parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    }),
  });
}

function blockedResult(
  runId: string,
  input: RunParlayBuildInput,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  generatedAt: string,
  options: { error?: string; reasons: string[] },
): ParlayBuildRunResult {
  const build = buildParlay({
    id: randomUUID(),
    sourceRunId: runId,
    generatedAt,
    predictions: [],
    config: input.configOverrides,
  });
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: options.reasons,
    warnings: options.error ? [options.error] : [],
  };
  const artifactPath = artifactWriter(runId, 'parlays-blocked.json', {
    ...artifactPayloadFor(runId, input.date, generatedAt, build, gateResult),
    error: options.error,
  });

  return {
    ok: false,
    runId,
    date: input.date,
    gateResult,
    build,
    artifactPath,
    error: options.error,
  };
}

function gateFromBuild(build: BuildParlayResult): ParlayGateResult {
  const excludedReasons = build.evaluations.flatMap((evaluation) => evaluation.excludedReasons);
  const reasons = build.parlay.status === 'blocked'
    ? [
        `selected ${build.parlay.legs.length} leg(s), minimum ${build.config.minLegs} required`,
        ...new Set(excludedReasons),
      ]
    : [`selected ${build.parlay.legs.length} analytical leg(s)`];

  return {
    verdict: build.parlay.status,
    reasons,
    warnings: build.parlay.warnings,
  };
}

function artifactPayloadFor(
  runId: string,
  date: string,
  generatedAt: string,
  build: BuildParlayResult,
  gateResult: ParlayGateResult,
): Record<string, unknown> {
  return {
    runId,
    date,
    generatedAt,
    parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    analyticalArtifactOnly: true,
    notice: 'This parlay candidate is an analytical artifact only; it cannot execute wagers or monetary actions.',
    config: build.config,
    gateResult,
    parlay: build.parlay,
    included: build.evaluations
      .filter((evaluation) => evaluation.eligible)
      .map((evaluation) => ({
        predictionId: evaluation.predictionId,
        fixtureId: evaluation.fixtureId,
        reasons: evaluation.includedReasons,
      })),
    excluded: build.evaluations
      .filter((evaluation) => !evaluation.eligible)
      .map((evaluation) => ({
        predictionId: evaluation.predictionId,
        fixtureId: evaluation.fixtureId,
        reasons: evaluation.excludedReasons,
      })),
  };
}

function qualityValue(value: string): PredictionQuality {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
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

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}
