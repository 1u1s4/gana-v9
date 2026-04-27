import { randomUUID } from 'crypto';
import type { AgentConfig } from '../config.js';
import { API_FOOTBALL_PROVIDER } from '../providers/sports/types.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type {
  ArtifactRecord,
  ClaimRecord,
  EvidenceItemRecord,
  FixtureRecord,
  JsonValue,
  OddsQuoteRecord,
  OddsSnapshotRecord,
  PredictionInput,
  PredictionRecord,
  ResearchBundleRecord,
  StoragePrismaClient,
} from '../storage/types.js';
import { aggregatePredictionGate, evaluateEvidenceGate, evaluatePredictionGates } from './gates.js';
import { buildAtomicPrediction, scorePredictionCandidate } from './scoring.js';
import { SCORE_PREDICTION_PROMPT_VERSION } from './prompts.js';
import { SCORING_RULE_VERSION, type PredictionRecordView } from './types.js';

export interface RunFixtureScoringInput {
  fixtureId: string;
}

export interface FixtureScoringResult {
  ok: boolean;
  runId: string;
  fixtureId?: string;
  providerFixtureId?: string;
  gateResult: ReturnType<typeof aggregatePredictionGate>;
  predictions: PredictionRecordView[];
  artifactPath?: string;
  error?: string;
}

export interface FixtureScoringDependencies {
  now?: () => Date;
  repositories?: PredictionServiceRepositories;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  persistArtifact?: (input: {
    runId: string;
    path: string;
    payload: unknown;
    fixtureId?: string;
  }) => Promise<Pick<ArtifactRecord, 'id'> | null>;
  persistPredictions?: (predictions: PredictionInput[]) => Promise<PredictionRecord[]>;
}

export interface PredictionServiceRepositories {
  sportsProviders: {
    findByCode(code: string): Promise<{ id: string } | null>;
  };
  fixtures: {
    findById(id: string): Promise<FixtureRecord | null>;
    findByProviderKey(providerId: string, providerFixtureId: string): Promise<FixtureRecord | null>;
  };
  oddsSnapshots: {
    listLatestByFixture(fixtureId: string, take?: number): Promise<OddsSnapshotRecord[]>;
  };
  oddsQuotes: {
    listLatest(query: { fixtureId: string; snapshotId?: string; take?: number }): Promise<OddsQuoteRecord[]>;
  };
  researchBundles: {
    list(query: { fixtureId?: string; status?: string; take?: number }): Promise<ResearchBundleRecord[]>;
  };
  evidenceItems: {
    list(query: { bundleId?: string; fixtureId?: string; take?: number }): Promise<EvidenceItemRecord[]>;
  };
  claims: {
    list(query: { bundleId?: string; fixtureId?: string; take?: number }): Promise<ClaimRecord[]>;
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
  predictions?: {
    create(input: PredictionInput): Promise<PredictionRecord>;
  };
}

export async function runFixtureScoring(
  config: AgentConfig,
  input: RunFixtureScoringInput,
  runtime: RuntimeContext,
  deps: FixtureScoringDependencies = {},
): Promise<FixtureScoringResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));

  if (!deps.repositories && !config.databaseUrl) {
    return blockedResult(runId, artifactWriter, {
      error: 'DATABASE_URL is required to score persisted predictions.',
      reasons: ['database write unavailable'],
      fixtureId: input.fixtureId,
    });
  }

  const repositories = deps.repositories ?? defaultRepositories();
  const fixture = await resolveFixture(repositories, input.fixtureId);
  if (!fixture) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Fixture "${input.fixtureId}" was not found in persisted normalized fixtures.`,
      reasons: ['missing fixture'],
      fixtureId: input.fixtureId,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const oddsSnapshot = (await repositories.oddsSnapshots.listLatestByFixture(fixture.id, 1))[0];
  if (!oddsSnapshot) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Fixture "${fixture.providerFixtureId}" has no persisted odds snapshot.`,
      reasons: ['missing persisted odds snapshot'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const oddsQuotes = await repositories.oddsQuotes.listLatest({
    fixtureId: fixture.id,
    snapshotId: oddsSnapshot.id,
    take: 500,
  });
  if (!oddsQuotes.length) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Odds snapshot "${oddsSnapshot.id}" has no persisted quotes.`,
      reasons: ['missing persisted odds quote'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const research = await latestResearchGraph(repositories, fixture.id);
  const evidenceGate = evaluateEvidenceGate(research);
  const includedByFilters = stringArray(fixture.includedByFilters);
  const predictions = oddsQuotes.map((quote) => {
    const candidateScore = scorePredictionCandidate({
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      market: quote.marketKey as any,
      selection: quote.selectionKey,
      line: numberOrUndefined(quote.line),
      odds: numberValue(quote.price),
      oddsSnapshotId: oddsSnapshot.id,
      oddsQuoteId: quote.id,
      evidenceIds: evidenceGate.evidenceIds,
      claimIds: evidenceGate.claimIds,
    });
    const gate = evaluatePredictionGates({
      fixture,
      hasOddsSnapshot: true,
      hasOddsQuote: true,
      marketValid: candidateScore.valid,
      researchBundle: research.researchBundle,
      evidenceItems: research.evidenceItems,
      claims: research.claims,
    });

    return buildAtomicPrediction({
      runId,
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
      oddsQuoteId: quote.id,
      market: quote.marketKey,
      selection: quote.selectionKey,
      line: numberOrUndefined(quote.line),
      odds: numberValue(quote.price),
      estimatedProbability: null,
      evidenceIds: evidenceGate.evidenceIds,
      claimIds: evidenceGate.claimIds,
      status: gate.verdict,
      confidence: evidenceGate.confidence,
      rationale: 'Rule-based scoring v1 from persisted odds snapshot and linked research evidence.',
      warnings: [...gate.warnings, ...candidateScore.reasons],
      providerAgentic: config.provider,
      model: config.model,
      researchBundleId: research.researchBundle?.id,
      generatedAt,
    });
  });

  const aggregate = aggregatePredictionGate(predictions.map((prediction) => ({
    verdict: prediction.status === 'candidate' || prediction.status === 'draft'
      ? 'review-required'
      : prediction.status,
    reasons: prediction.status === 'promotable' ? ['prediction gates passed'] : prediction.warnings,
    warnings: prediction.warnings,
  })));
  const artifactPayload = {
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    oddsSnapshotId: oddsSnapshot.id,
    researchBundleId: research.researchBundle?.id ?? null,
    promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
    scoringRuleVersion: SCORING_RULE_VERSION,
    gateResult: aggregate,
    predictions,
  };
  const artifactPath = artifactWriter(runId, 'predictions.json', artifactPayload);

  try {
    await upsertRun(config, runtime, repositories, runId, aggregate.verdict, 'succeeded', now());
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      fixtureId: fixture.id,
    });
    const persisted = await (deps.persistPredictions ?? defaultPersistPredictions(repositories))(
      predictions.map((prediction) => toPredictionInput(prediction, fixture, oddsSnapshot, artifact?.id ?? null, includedByFilters)),
    );

    return {
      ok: aggregate.verdict !== 'blocked',
      runId,
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      gateResult: aggregate,
      predictions: persisted.length ? predictions : [],
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const errorResult = blockedResult(runId, artifactWriter, {
      error,
      reasons: ['prediction persistence failed'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
    });
    await upsertRun(config, runtime, repositories, runId, errorResult.gateResult.verdict, 'failed', now()).catch(() => undefined);
    return errorResult;
  }
}

export async function runFixturePrediction(
  config: AgentConfig,
  input: RunFixtureScoringInput,
  runtime: RuntimeContext,
  deps: FixtureScoringDependencies = {},
): Promise<FixtureScoringResult> {
  return runFixtureScoring(config, input, runtime, deps);
}

function defaultRepositories(): PredictionServiceRepositories {
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

async function resolveFixture(repositories: PredictionServiceRepositories, fixtureId: string): Promise<FixtureRecord | null> {
  const byId = await repositories.fixtures.findById(fixtureId);
  if (byId) return byId;
  const provider = await repositories.sportsProviders.findByCode(API_FOOTBALL_PROVIDER);
  if (!provider) return null;
  return repositories.fixtures.findByProviderKey(provider.id, fixtureId);
}

async function latestResearchGraph(repositories: PredictionServiceRepositories, fixtureId: string) {
  const researchBundle = (await repositories.researchBundles.list({ fixtureId, take: 1 }))[0] ?? null;
  if (!researchBundle) {
    return {
      researchBundle: null,
      evidenceItems: [] as EvidenceItemRecord[],
      claims: [] as ClaimRecord[],
    };
  }
  const [evidenceItems, claims] = await Promise.all([
    repositories.evidenceItems.list({ bundleId: researchBundle.id, take: 500 }),
    repositories.claims.list({ bundleId: researchBundle.id, take: 500 }),
  ]);
  return { researchBundle, evidenceItems, claims };
}

function defaultPersistArtifact(repositories: PredictionServiceRepositories) {
  return async (input: { runId: string; path: string; payload: unknown; fixtureId?: string }) => {
    if (!repositories.artifacts) return null;
    return repositories.artifacts.create({
      name: basename(input.path),
      kind: 'predictions',
      path: input.path,
      runId: input.runId,
      sha256: hashPayload(input.payload),
      metadata: compactJson({
        fixtureId: input.fixtureId,
        promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
        scoringRuleVersion: SCORING_RULE_VERSION,
      }),
    });
  };
}

function defaultPersistPredictions(repositories: PredictionServiceRepositories) {
  return async (inputs: PredictionInput[]) => {
    if (!repositories.predictions) throw new Error('Prediction repository is unavailable.');
    const records: PredictionRecord[] = [];
    for (const input of inputs) {
      records.push(await repositories.predictions.create(input));
    }
    return records;
  };
}

function toPredictionInput(
  prediction: PredictionRecordView,
  fixture: FixtureRecord,
  oddsSnapshot: OddsSnapshotRecord,
  artifactId: string | null,
  includedByFilters: string[],
): PredictionInput {
  return {
    id: prediction.id,
    runId: prediction.runId,
    fixtureId: fixture.id,
    oddsSnapshotId: oddsSnapshot.id,
    oddsQuoteId: prediction.oddsQuoteId,
    researchBundleId: prediction.researchBundleId ?? null,
    artifactId,
    marketKey: prediction.market,
    selectionKey: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    impliedProbability: prediction.impliedProbability,
    estimatedProbability: prediction.probability ?? null,
    edge: prediction.edge ?? null,
    confidence: prediction.confidence,
    quality: prediction.quality,
    rationaleRedacted: prediction.rationale ?? '',
    warnings: prediction.warnings,
    evidenceIds: prediction.evidenceIds,
    includedByFilters,
    providerAgentic: prediction.providerAgentic ?? null,
    model: prediction.model ?? null,
    promptVersion: prediction.promptVersion,
    scoringRuleVersion: prediction.scoringRuleVersion,
    status: prediction.status,
    generatedAt: prediction.generatedAt ? new Date(prediction.generatedAt) : new Date(),
    metadata: compactJson({
      providerFixtureId: fixture.providerFixtureId,
      claimIds: prediction.claimIds,
    }),
  };
}

async function upsertRun(
  config: AgentConfig,
  runtime: RuntimeContext,
  repositories: PredictionServiceRepositories,
  runId: string,
  verdict: string,
  status: string,
  completedAt: Date,
): Promise<void> {
  await repositories.harnessRuns?.upsertForRun?.({
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status,
    verdict,
    startedAt: completedAt,
    completedAt,
  });
}

function blockedResult(
  runId: string,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  input: {
    error?: string;
    reasons: string[];
    fixtureId?: string;
    providerFixtureId?: string;
    oddsSnapshotId?: string;
  },
): FixtureScoringResult {
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: input.reasons,
    warnings: input.error ? [input.error] : [],
  };
  const artifactPath = artifactWriter(runId, 'predictions-blocked.json', {
    runId,
    fixtureId: input.fixtureId,
    providerFixtureId: input.providerFixtureId,
    oddsSnapshotId: input.oddsSnapshotId,
    gateResult,
    error: input.error,
  });

  return {
    ok: false,
    runId,
    fixtureId: input.fixtureId,
    providerFixtureId: input.providerFixtureId,
    gateResult,
    predictions: [],
    artifactPath,
    error: input.error,
  };
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

function basename(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? 'predictions.json';
}
