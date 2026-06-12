import { randomUUID } from 'crypto';
import { basename, join } from 'path';
import { runAgentWithRetry } from '../agent.js';
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
import { generateParlayCandidatesForLegRange, type ParlayCandidate } from './candidate-generator.js';
import { correlationBlockers, correlationPenalty } from './correlation.js';
import { diversifyParlays } from './diversifier.js';
import {
  LOW_ODDS_TOP_MAX_LEG_ODDS,
  automaticParlayRiskReasons,
} from './eligibility.js';
import { rankParlayCandidates } from './ranker.js';
import {
  calculateAggregateConfidence,
  calculateAggregateQuality,
  calculateCombinedOdds,
  PARLAY_BUILDER_RULE_VERSION,
} from './rules.js';
import type {
  BuildParlayResult,
  Parlay,
  ParlayConfig,
  ParlayLeg,
  ParlayPredictionEvaluation,
  ParlaySourcePrediction,
  ResolvedParlayConfig,
} from './types.js';
import { marketFamily } from '../domain/markets.js';
import {
  deterministicFallbackProfileSpec,
  deterministicProfileSpec,
  LOW_ODDS_TOP_FALLBACK_MAX_LEG_ODDS,
  LOW_ODDS_TOP_PROFILE,
  PARLAY_REFINADO_RETROSPECTIVE,
  PORTFOLIO_PROFILES,
  PORTFOLIO_MIN_CONFIDENCE,
  type DeterministicParlayProfile,
  type DeterministicProfileSpec,
  type ParlayPortfolioProfile,
  type ParlayPortfolioProfileSpec,
} from './profile-specs.js';
import {
  decoratePortfolioPrediction,
  hasHardResearchWarning,
  hasRiskTag,
  isPortfolioPoolEligible,
  lowOddsTopFallbackExclusionReasons,
  lowOddsTopPoolExclusionReasons,
  portfolioPoolExclusionReasons,
} from './portfolio-risk.js';

const MAIN_PARLAY_PREDICTION_STATUSES: PredictionStatus[] = ['candidate', 'promotable'];
const PORTFOLIO_PREDICTION_STATUSES: PredictionStatus[] = ['candidate', 'review-required', 'promotable'];
const PARLAY_PORTFOLIO_PROMPT_VERSION = 'parlay-portfolio-v3';
const PARLAY_ALL_IN_PROMPT_VERSION = 'llm-parlay-all-in-v1';
const PARLAY_REFINADO_PROMPT_VERSION = 'llm-parlay-refinado-v1';
const PARLAY_PORTFOLIO_SCHEMA_PATH = join(process.cwd(), 'skills/parlay-portfolio-v1/output.schema.json');
const PARLAY_PORTFOLIO_AGENT_TIMEOUT_MS = positiveIntegerFromEnv('GANA_PARLAY_PORTFOLIO_AGENT_TIMEOUT_MS', 120_000);
const CONSERVATIVE_MIN_AGGREGATE_CONFIDENCE = 0.62;
const BALANCED_MIN_AGGREGATE_CONFIDENCE = 0.55;

interface ParsedPortfolioParlay {
  title?: string;
  predictionIds: string[];
  rationale: string;
  riskNotes?: string[];
  duplicateFixtureJustification?: string;
}

interface ParsedPortfolioOutput {
  parlays: ParsedPortfolioParlay[];
  noParlayReason?: string;
}

interface DeterministicCandidateSelection {
  candidates: ParlayCandidate[];
  prompt?: string;
  rawOutput: string;
  warnings: string[];
}

interface PortfolioBuild {
  profile: ParlayPortfolioProfile;
  build: BuildParlayResult;
}

type PortfolioValidationResult =
  | { ok: true; profile: ParlayPortfolioProfile; build: BuildParlayResult; signature: string }
  | { ok: false; reasons: string[] };

export interface RunParlayBuildInput {
  date: string;
  sourceRunId?: string;
  sourceRunIds?: string[];
  portfolio?: 'llm' | 'low-odds-top' | DeterministicParlayProfile;
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
  portfolio?: ParlayPortfolio;
  persistedParlayId?: string;
  persistedParlayIds?: string[];
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
  agentRunner?: typeof runAgentWithRetry;
}

export interface ParlayPortfolio {
  id: string;
  sourceRunId: string;
  promptVersion: string;
  profiles: Array<{
    profile: ParlayPortfolioProfile;
    promptVersion: string;
    requested: number;
    included: number;
    rejected: number;
    warnings: string[];
  }>;
  parlays: PortfolioBuild[];
  rejected: Array<{
    profile: ParlayPortfolioProfile;
    index: number;
    reasons: string[];
  }>;
  diagnostics?: {
    sourcePredictions: number;
    pool: Array<{
      profile: ParlayPortfolioProfile;
      eligible: number;
      excluded: number;
      excludedReasons: Array<{ predictionId: string; reasons: string[] }>;
      fallback?: boolean;
      strictEligible?: number;
      strictExcluded?: number;
    }>;
    agentOutputs?: Array<{
      profile: ParlayPortfolioProfile;
      prompt?: string;
      rawOutput: string;
      noParlayReason?: string;
      warnings: string[];
    }>;
  };
}

export interface ParlayServiceRepositories {
  predictions: {
    list(query: {
      runId?: string;
      runIds?: string[];
      fixtureId?: string;
      status?: PredictionStatus | string | Array<PredictionStatus | string>;
      take?: number;
    }): Promise<PredictionRecord[]>;
    listForFixtureDate(date: Date | string, query: {
      runId?: string;
      runIds?: string[];
      fixtureId?: string;
      status?: PredictionStatus | string | Array<PredictionStatus | string>;
      take?: number;
      skip?: number;
      timezone?: string;
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
  if (input.portfolio === 'llm') {
    return runParlayPortfolio(config, input, runtime, repositories, artifactWriter, deps, now);
  }
  if (input.portfolio === 'low-odds-top') {
    return runLowOddsTopPortfolio(config, input, runtime, repositories, artifactWriter, deps, now);
  }
  if (isDeterministicParlayProfile(input.portfolio)) {
    return runDeterministicParlayProfile(config, input, runtime, repositories, artifactWriter, deps, now, input.portfolio);
  }

  const predictionQuery = {
    status: MAIN_PARLAY_PREDICTION_STATUSES,
    take: 500,
    timezone: config.apiFootball.timezone,
  };
  const predictionSourceRunId = input.sourceRunId;
  const predictionSourceRunIds = normalizeSourceRunIds(input.sourceRunIds, predictionSourceRunId);
  const sourceScopeLabel = predictionSourceRunIds.length > 1
    ? predictionSourceRunIds.join(',')
    : predictionSourceRunId;
  const predictions = predictionSourceRunIds.length > 1
    ? await repositories.predictions.listForFixtureDate(input.date, { ...predictionQuery, runIds: predictionSourceRunIds })
    : predictionSourceRunId
    ? await repositories.predictions.listForFixtureDate(input.date, { ...predictionQuery, runId: predictionSourceRunId })
    : await repositories.predictions.listForFixtureDate(input.date, predictionQuery);
  const build = buildParlay({
    id: randomUUID(),
    sourceRunId: sourceScopeLabel ?? runId,
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

function normalizeSourceRunIds(sourceRunIds: string[] | undefined, sourceRunId?: string): string[] {
  const values = [
    ...(sourceRunIds ?? []),
    ...(sourceRunId ? [sourceRunId] : []),
  ].map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(values));
}

function sourceRunScopeFor(input: RunParlayBuildInput): { sourceRunIds: string[]; sourceRunId: string } {
  const sourceRunIds = normalizeSourceRunIds(input.sourceRunIds, input.sourceRunId);
  return {
    sourceRunIds,
    sourceRunId: sourceRunIds.join(','),
  };
}

function sourcePredictionScopeQuery(sourceRunIds: string[]): { runId?: string; runIds?: string[] } {
  return sourceRunIds.length > 1
    ? { runIds: sourceRunIds }
    : { runId: sourceRunIds[0] };
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
        qualityVerdict: payloadVerdict(input.payload),
        executionCapability: 'none',
      }),
    });
  };
}

function payloadVerdict(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const gateResult = (payload as { gateResult?: unknown }).gateResult;
  if (!gateResult || typeof gateResult !== 'object' || Array.isArray(gateResult)) return undefined;
  const verdict = (gateResult as { verdict?: unknown }).verdict;
  return typeof verdict === 'string' ? verdict : undefined;
}

async function runParlayPortfolio(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  repositories: ParlayServiceRepositories,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  deps: ParlayBuildDependencies,
  now: () => Date,
): Promise<ParlayBuildRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const sourceRunId = input.sourceRunId;
  const generatedAt = now().toISOString();
  const date = input.date;
  if (!sourceRunId) {
    return blockedResult(runId, input, artifactWriter, generatedAt, {
      error: '--run-id is required when --portfolio llm is used.',
      reasons: ['missing source run id'],
    });
  }

  const records = await repositories.predictions.list({
    runId: sourceRunId,
    status: PORTFOLIO_PREDICTION_STATUSES,
    take: 500,
  });
  const sourcePredictions = records.map(toSourcePrediction);
  const decoratedPredictions = sourcePredictions.map(decoratePortfolioPrediction);
  const portfolioId = randomUUID();
  const poolDiagnostics = PORTFOLIO_PROFILES.map((profile) => {
    const excludedReasons = decoratedPredictions
      .map((prediction) => ({ predictionId: prediction.id, reasons: portfolioPoolExclusionReasons(prediction, profile) }))
      .filter((item) => item.reasons.length > 0);
    return {
      profile: profile.key,
      eligible: decoratedPredictions.length - excludedReasons.length,
      excluded: excludedReasons.length,
      excludedReasons,
    };
  });
  const profileOutputs = await Promise.all(PORTFOLIO_PROFILES.map(async (profile) => {
    const pool = decoratedPredictions.filter((prediction) => isPortfolioPoolEligible(prediction, profile));
    if (!pool.length) {
      return {
        profile: profile.key,
        rawOutput: '',
        output: { parlays: [] as ParsedPortfolioParlay[], noParlayReason: `${profile.key} pool is empty after portfolio filters` },
        warnings: [`empty-pool: ${profile.key} pool is empty after portfolio filters`],
        pool,
      };
    }
    let rawOutput = '';
    try {
      const prompt = buildPortfolioProfilePrompt({
        portfolioId,
        sourceRunId,
        date,
        generatedAt,
        profile,
        predictions: pool,
      });
      const result = await runParlayPortfolioAgent(deps.agentRunner ?? runAgentWithRetry, config, prompt, { runtime });
      rawOutput = result.text;
      const output = parsePortfolioAgentOutput(rawOutput);
      const warnings = output.noParlayReason ? [`no-parlay-reason: ${output.noParlayReason}`] : [];
      return {
        profile: profile.key,
        rawOutput,
        output,
        warnings,
        pool,
      };
    } catch (err: any) {
      return {
        profile: profile.key,
        rawOutput,
        output: { parlays: [] as ParsedPortfolioParlay[] },
        warnings: [`${profile.key} parlay prompt failed: ${err?.message ?? String(err)}`],
        pool,
      };
    }
  }));

  const usedSignatures = new Set<string>();
  const builds: PortfolioBuild[] = [];
  const rejected: ParlayPortfolio['rejected'] = [];
  const profileSummaries: ParlayPortfolio['profiles'] = [];
  for (const profileSpec of PORTFOLIO_PROFILES) {
    const output = profileOutputs.find((item) => item.profile === profileSpec.key);
    const poolById = new Map((output?.pool ?? []).map((prediction) => [prediction.id, prediction]));
    const parsedParlays = output?.output.parlays.slice(0, profileSpec.targetParlays) ?? [];
    let included = 0;
    let rejectedCount = 0;
    for (const [index, parsed] of parsedParlays.entries()) {
      const validation = validateParsedPortfolioParlay(parsed, profileSpec, poolById, usedSignatures, generatedAt, sourceRunId);
      if (!validation.ok) {
        rejected.push({ profile: profileSpec.key, index, reasons: validation.reasons });
        rejectedCount++;
        continue;
      }
      usedSignatures.add(validation.signature);
      builds.push({ profile: validation.profile, build: validation.build });
      included++;
    }
    const deterministicFills = shouldGenerateDeterministicPortfolioFills({
      profile: profileSpec,
      priorBuilds: builds.length,
      outputWarnings: output?.warnings ?? [],
      outputNoParlayReason: output?.output.noParlayReason,
      pool: output?.pool ?? [],
    }) ? generateDeterministicPortfolioFills({
      profile: profileSpec,
      pool: output?.pool ?? [],
      usedSignatures,
      generatedAt,
      sourceRunId,
      needed: Math.max(0, profileSpec.targetParlays - included),
    }) : [];
    for (const validation of deterministicFills) {
      usedSignatures.add(validation.signature);
      builds.push({ profile: validation.profile, build: validation.build });
      included++;
    }
    const fallbackWarning = deterministicFills.length
      ? [`deterministic portfolio fallback filled ${deterministicFills.length} ${profileSpec.key} parlay(s)`]
      : [];
    profileSummaries.push({
      profile: profileSpec.key,
      promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
      requested: profileSpec.targetParlays,
      included,
      rejected: rejectedCount,
      warnings: [...(output?.warnings ?? []), ...fallbackWarning],
    });
  }

  const portfolio: ParlayPortfolio = {
    id: portfolioId,
    sourceRunId,
    promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
    profiles: profileSummaries,
    parlays: builds,
    rejected,
    diagnostics: {
      sourcePredictions: sourcePredictions.length,
      pool: poolDiagnostics,
      agentOutputs: profileOutputs.map((output) => ({
        profile: output.profile,
        rawOutput: output.rawOutput,
        noParlayReason: output.output.noParlayReason,
        warnings: output.warnings,
      })),
    },
  };
  const gateResult = gateFromPortfolio(portfolio);
  const representativeBuild = builds[0]?.build ?? buildParlay({
    id: randomUUID(),
    sourceRunId,
    generatedAt,
    predictions: [],
    config: { minLegs: 2, maxLegs: 3, minPredictionConfidence: PORTFOLIO_MIN_CONFIDENCE },
  });
  const artifactPayload = portfolioArtifactPayloadFor(runId, date, generatedAt, portfolio, gateResult);
  const artifactPath = artifactWriter(
    runId,
    builds.length ? 'parlay-portfolio.json' : 'parlay-portfolio-blocked.json',
    artifactPayload,
  );
  if (builds.length) {
    artifactWriter(
      runId,
      'parlays.json',
      artifactPayloadFor(runId, date, generatedAt, representativeBuild, gateFromBuild(representativeBuild)),
    );
  }

  try {
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, gateResult.verdict === 'blocked' ? 'failed' : 'succeeded', now(), date);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      date,
    });
    const persistedParlayIds: string[] = [];
    for (const entry of builds) {
      const persisted = await (deps.persistParlay ?? defaultPersistParlay(repositories))({
        parlay: toParlayInput(entry.build, runId, artifact?.id ?? null, date, {
          portfolioId,
          portfolioProfile: entry.profile,
          sourceRunId,
          promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
        }),
        legs: entry.build.parlay.legs.map(toParlayLegInput),
      });
      if (persisted?.id) persistedParlayIds.push(persisted.id);
    }

    return {
      ok: gateResult.verdict !== 'blocked',
      runId,
      date,
      gateResult,
      build: representativeBuild,
      portfolio,
      persistedParlayId: persistedParlayIds[0],
      persistedParlayIds,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const result = blockedResult(runId, input, artifactWriter, generatedAt, {
      error,
      reasons: ['parlay portfolio persistence failed'],
    });
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), date).catch(() => undefined);
    return { ...result, portfolio, error };
  }
}

async function runLowOddsTopPortfolio(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  repositories: ParlayServiceRepositories,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  deps: ParlayBuildDependencies,
  now: () => Date,
): Promise<ParlayBuildRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const { sourceRunId, sourceRunIds } = sourceRunScopeFor(input);
  const generatedAt = now().toISOString();
  const date = input.date;
  if (!sourceRunId) {
    return blockedResult(runId, input, artifactWriter, generatedAt, {
      error: '--run-id or --run-ids is required when --portfolio low-odds-top is used.',
      reasons: ['missing source run id'],
    });
  }

  const threshold = Math.min(config.apiFootball.lowOddsThreshold, LOW_ODDS_TOP_MAX_LEG_ODDS);
  const records = await repositories.predictions.list({
    ...sourcePredictionScopeQuery(sourceRunIds),
    status: PORTFOLIO_PREDICTION_STATUSES,
    take: 500,
  });
  const sourcePredictions = records.map(toSourcePrediction);
  const decoratedPredictions = sourcePredictions.map(decoratePortfolioPrediction);
  const strictExcludedReasons = decoratedPredictions
    .map((prediction) => ({ predictionId: prediction.id, reasons: lowOddsTopPoolExclusionReasons(prediction, LOW_ODDS_TOP_PROFILE, threshold) }))
    .filter((item) => item.reasons.length > 0);
  const strictPool = decoratedPredictions.filter((prediction) => lowOddsTopPoolExclusionReasons(prediction, LOW_ODDS_TOP_PROFILE, threshold).length === 0);
  const fallbackEnabled = strictPool.length < LOW_ODDS_TOP_PROFILE.minLegs;
  const excludedReasons = fallbackEnabled
    ? decoratedPredictions
      .map((prediction) => ({ predictionId: prediction.id, reasons: lowOddsTopFallbackExclusionReasons(prediction, LOW_ODDS_TOP_PROFILE, LOW_ODDS_TOP_FALLBACK_MAX_LEG_ODDS) }))
      .filter((item) => item.reasons.length > 0)
    : strictExcludedReasons;
  const pool = fallbackEnabled
    ? decoratedPredictions.filter((prediction) => lowOddsTopFallbackExclusionReasons(prediction, LOW_ODDS_TOP_PROFILE, LOW_ODDS_TOP_FALLBACK_MAX_LEG_ODDS).length === 0)
    : strictPool;
  const portfolioId = randomUUID();
  const usedSignatures = new Set<string>();
  const fills = generateDeterministicPortfolioFills({
    profile: LOW_ODDS_TOP_PROFILE,
    pool,
    usedSignatures,
    generatedAt,
    sourceRunId,
    needed: LOW_ODDS_TOP_PROFILE.targetParlays,
  });
  const builds: PortfolioBuild[] = [];
  for (const validation of fills) {
    usedSignatures.add(validation.signature);
    builds.push({ profile: validation.profile, build: validation.build });
  }
  const warnings = builds.length
    ? [
      fallbackEnabled
        ? `deterministic low-odds-top fallback selected ${builds.length} parlay(s) from h2h/double_chance/goals_over_under predictions with odds <= ${LOW_ODDS_TOP_FALLBACK_MAX_LEG_ODDS}`
        : `deterministic low-odds-top selected ${builds.length} parlay(s) from h2h home/away and safe double-chance predictions with odds <= ${threshold}`,
    ]
    : [`low-odds-top pool has ${pool.length} eligible prediction(s); ${LOW_ODDS_TOP_PROFILE.minLegs} required`];
  const portfolio: ParlayPortfolio = {
    id: portfolioId,
    sourceRunId,
    promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
    profiles: [{
      profile: LOW_ODDS_TOP_PROFILE.key,
      promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
      requested: LOW_ODDS_TOP_PROFILE.targetParlays,
      included: builds.length,
      rejected: 0,
      warnings,
    }],
    parlays: builds,
    rejected: [],
    diagnostics: {
      sourcePredictions: sourcePredictions.length,
      pool: [{
        profile: LOW_ODDS_TOP_PROFILE.key,
        eligible: pool.length,
        excluded: excludedReasons.length,
        excludedReasons,
        ...(fallbackEnabled ? {
          strictEligible: strictPool.length,
          strictExcluded: strictExcludedReasons.length,
          fallback: true,
        } : {}),
      }],
      agentOutputs: [{
        profile: LOW_ODDS_TOP_PROFILE.key,
        rawOutput: '',
        noParlayReason: builds.length ? undefined : warnings[0],
        warnings,
      }],
    },
  };
  const gateResult = gateFromPortfolio(portfolio);
  const representativeBuild = builds[0]?.build ?? buildParlay({
    id: randomUUID(),
    sourceRunId,
    generatedAt,
    predictions: [],
    config: {
      minLegs: LOW_ODDS_TOP_PROFILE.minLegs,
      maxLegs: LOW_ODDS_TOP_PROFILE.maxLegs,
      minPredictionConfidence: LOW_ODDS_TOP_PROFILE.minConfidence,
    },
  });
  const artifactPayload = portfolioArtifactPayloadFor(runId, date, generatedAt, portfolio, gateResult);
  const artifactPath = artifactWriter(
    runId,
    builds.length ? 'parlay-low-odds-top.json' : 'parlay-low-odds-top-blocked.json',
    artifactPayload,
  );
  if (builds.length) {
    artifactWriter(
      runId,
      'parlays.json',
      artifactPayloadFor(runId, date, generatedAt, representativeBuild, gateFromBuild(representativeBuild)),
    );
  }

  try {
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, gateResult.verdict === 'blocked' ? 'failed' : 'succeeded', now(), date);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      date,
    });
    const persistedParlayIds: string[] = [];
    for (const entry of builds) {
      const persisted = await (deps.persistParlay ?? defaultPersistParlay(repositories))({
        parlay: toParlayInput(entry.build, runId, artifact?.id ?? null, date, {
          portfolioId,
          portfolioProfile: entry.profile,
          sourceRunId,
          promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
          lowOddsThreshold: threshold,
        }),
        legs: entry.build.parlay.legs.map(toParlayLegInput),
      });
      if (persisted?.id) persistedParlayIds.push(persisted.id);
    }

    return {
      ok: gateResult.verdict !== 'blocked',
      runId,
      date,
      gateResult,
      build: representativeBuild,
      portfolio,
      persistedParlayId: persistedParlayIds[0],
      persistedParlayIds,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const result = blockedResult(runId, input, artifactWriter, generatedAt, {
      error,
      reasons: ['low-odds-top portfolio persistence failed'],
    });
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), date).catch(() => undefined);
    return { ...result, portfolio, error };
  }
}

function isDeterministicParlayProfile(value: unknown): value is DeterministicParlayProfile {
  return value === 'low-variance'
    || value === 'balanced'
    || value === 'totals'
    || value === 'high-conviction'
    || value === 'market-diverse'
    || value === 'parlay-oro'
    || value === 'parlay-diamante'
    || value === 'parlay-all-in'
    || value === 'parlay-refinado';
}

async function runDeterministicParlayProfile(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  repositories: ParlayServiceRepositories,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  deps: ParlayBuildDependencies,
  now: () => Date,
  profile: DeterministicParlayProfile,
): Promise<ParlayBuildRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const { sourceRunId, sourceRunIds } = sourceRunScopeFor(input);
  const generatedAt = now().toISOString();
  if (!sourceRunId) {
    return blockedResult(runId, input, artifactWriter, generatedAt, {
      error: `--run-id or --run-ids is required when --portfolio ${profile} is used.`,
      reasons: ['missing source run id'],
    });
  }

  const baseSpec = deterministicProfileSpec(profile);
  const records = await repositories.predictions.list({
    ...sourcePredictionScopeQuery(sourceRunIds),
    status: PORTFOLIO_PREDICTION_STATUSES,
    take: 500,
  });
  const sourcePredictions = records.map(toSourcePrediction).map(decoratePortfolioPrediction);
  const portfolioId = randomUUID();
  const strictExcludedReasons = sourcePredictions
    .map((prediction) => ({ predictionId: prediction.id, reasons: deterministicProfileExclusionReasons(prediction, baseSpec) }))
    .filter((item) => item.reasons.length > 0);
  const strictPool = sourcePredictions.filter((prediction) => deterministicProfileExclusionReasons(prediction, baseSpec).length === 0);
  const fallbackSpec = deterministicFallbackProfileSpec(profile, baseSpec, strictPool.length);
  const spec = fallbackSpec ?? baseSpec;
  const fallbackEnabled = Boolean(fallbackSpec);
  const excludedReasons = sourcePredictions
    .map((prediction) => ({ predictionId: prediction.id, reasons: deterministicProfileExclusionReasons(prediction, spec) }))
    .filter((item) => item.reasons.length > 0);
  const pool = sourcePredictions.filter((prediction) => deterministicProfileExclusionReasons(prediction, spec).length === 0);
  const candidateSelection = profile === 'parlay-all-in'
    ? await generateParlayAllInLlmCandidates(config, runtime, deps, pool, spec, {
      portfolioId,
      sourceRunId,
      date: input.date,
      generatedAt,
    })
    : profile === 'parlay-refinado'
      ? await generateParlayRefinadoLlmCandidates(config, runtime, deps, pool, spec, {
        portfolioId,
        sourceRunId,
        date: input.date,
        generatedAt,
      })
    : {
      candidates: deterministicCandidatesForProfile(profile, pool, spec),
      rawOutput: '',
      warnings: [],
    };
  const generatedCandidates = candidateSelection.candidates
    .map((candidate) => ({
      ...candidate,
      blockers: uniqueStrings([
        ...candidate.blockers,
        ...deterministicCandidateBlockers(candidate, pool, spec),
      ]),
    }));
  const ranked = profile === 'parlay-oro'
    ? rankParlayOroCandidates(generatedCandidates)
    : profile === 'parlay-diamante'
      ? rankParlayDiamanteCandidates(generatedCandidates)
      : profile === 'parlay-all-in'
        ? generatedCandidates
    : rankParlayCandidates(generatedCandidates, spec.riskWeight);
  const diversified = profile === 'market-diverse'
    ? diversifyMarketDiverseCandidates(ranked, pool, spec.targetParlays)
    : profile === 'parlay-oro' || profile === 'parlay-diamante' || profile === 'parlay-all-in'
      ? ranked.filter((candidate) => !candidate.blockers.length).slice(0, spec.targetParlays)
      : diversifyParlays(ranked).concat(ranked.filter((candidate) => !candidate.blockers.length)).slice(0, spec.targetParlays);
  const accepted = uniqueCandidates(diversified).filter((candidate) => !candidate.blockers.length).slice(0, spec.targetParlays);
  const exposureCappedAccepted = selectCandidatesWithExposureCap(accepted, pool, spec.targetParlays);
  const builds = exposureCappedAccepted.map((candidate) => ({
    profile,
    build: buildFromCandidate(candidate, pool, profile, sourceRunId, generatedAt, spec),
  }));
  const rejected = generatedCandidates
    .filter((candidate) => candidate.blockers.length > 0)
    .slice(0, 100)
    .map((candidate, index) => ({
      profile,
      index,
      reasons: candidate.blockers,
    }));
  const warnings = builds.length
    ? [
      fallbackEnabled
        ? `deterministic ${profile} generated ${builds.length} analytical parlay(s) using fallback eligibility after strict pool had ${strictPool.length}/${baseSpec.minLegs} required leg(s)`
        : profile === 'parlay-all-in'
          ? `LLM-guided ${profile} generated ${builds.length} analytical parlay(s) from guarded safe pool`
          : profile === 'parlay-refinado'
            ? `LLM-guided ${profile} generated ${builds.length} analytical parlay(s) from retrospective guardrails`
          : `deterministic ${profile} generated ${builds.length} analytical parlay(s)`,
      ...candidateSelection.warnings,
    ]
    : [`${profile} pool has ${pool.length} eligible prediction(s); ${spec.minLegs} required`, ...candidateSelection.warnings];
  const promptVersion = profile === 'parlay-all-in'
    ? PARLAY_ALL_IN_PROMPT_VERSION
    : profile === 'parlay-refinado'
      ? PARLAY_REFINADO_PROMPT_VERSION
      : `deterministic-${profile}-v1`;
  const portfolio: ParlayPortfolio = {
    id: portfolioId,
    sourceRunId,
    promptVersion,
    profiles: [{
      profile,
      promptVersion,
      requested: spec.targetParlays,
      included: builds.length,
      rejected: rejected.length + excludedReasons.length,
      warnings,
    }],
    parlays: builds,
    rejected,
    diagnostics: {
      sourcePredictions: sourcePredictions.length,
      pool: [{
        profile,
        eligible: pool.length,
        excluded: excludedReasons.length,
        excludedReasons,
        ...(fallbackEnabled ? {
          strictEligible: strictPool.length,
          strictExcluded: strictExcludedReasons.length,
          fallback: true,
        } : {}),
      }],
      agentOutputs: [{
        profile,
        prompt: candidateSelection.prompt,
        rawOutput: candidateSelection.rawOutput,
        noParlayReason: builds.length ? undefined : warnings[0],
        warnings,
      }],
    },
  };
  const gateResult = gateFromPortfolio(portfolio);
  const representativeBuild = builds[0]?.build ?? buildParlay({
    id: randomUUID(),
    sourceRunId,
    generatedAt,
    predictions: [],
    config: {
      minLegs: spec.minLegs,
      maxLegs: spec.maxLegs,
      minPredictionConfidence: spec.minConfidence,
      maxCombinedOdds: spec.maxOdds,
    },
  });
  const artifactPayload = portfolioArtifactPayloadFor(runId, input.date, generatedAt, portfolio, gateResult);
  const artifactPath = artifactWriter(
    runId,
    deterministicArtifactName(profile, builds.length === 0),
    artifactPayload,
  );
  if (builds.length) {
    artifactWriter(
      runId,
      'parlays.json',
      artifactPayloadFor(runId, input.date, generatedAt, representativeBuild, gateFromBuild(representativeBuild)),
    );
  }

  try {
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, gateResult.verdict === 'blocked' ? 'failed' : 'succeeded', now(), input.date);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      date: input.date,
    });
    const persistedParlayIds: string[] = [];
    for (const entry of builds) {
      const persisted = await (deps.persistParlay ?? defaultPersistParlay(repositories))({
        parlay: toParlayInput(entry.build, runId, artifact?.id ?? null, input.date, {
          portfolioId,
          portfolioProfile: profile,
          sourceRunId,
          promptVersion,
          candidateDiagnostics: {
            expectedEdge: candidateMetricForBuild(entry.build, exposureCappedAccepted, 'expectedEdge'),
            correlationPenalty: candidateMetricForBuild(entry.build, exposureCappedAccepted, 'correlationPenalty'),
            ...(profile === 'parlay-refinado' ? {
              retrospective: PARLAY_REFINADO_RETROSPECTIVE,
              llmPrompt: candidateSelection.prompt,
              llmRawOutput: candidateSelection.rawOutput,
            } : {}),
          },
        }),
        legs: entry.build.parlay.legs.map(toParlayLegInput),
      });
      if (persisted?.id) persistedParlayIds.push(persisted.id);
    }
    return {
      ok: gateResult.verdict !== 'blocked',
      runId,
      date: input.date,
      gateResult,
      build: representativeBuild,
      portfolio,
      persistedParlayId: persistedParlayIds[0],
      persistedParlayIds,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const result = blockedResult(runId, input, artifactWriter, generatedAt, {
      error,
      reasons: [`${profile} portfolio persistence failed`],
    });
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), input.date).catch(() => undefined);
    return { ...result, portfolio, error };
  }
}

function deterministicProfileExclusionReasons(
  prediction: ParlaySourcePrediction,
  spec: DeterministicProfileSpec,
): string[] {
  const reasons: string[] = [];
  if (prediction.parlayEligible === false && !isAllInLowOddsSafeReview(prediction, spec)) reasons.push('not parlay eligible');
  const automaticReasons = spec.allInSafeMode
    ? automaticParlayRiskReasons(prediction).filter((reason) => !isAllInAllowedRiskReason(prediction, reason))
    : spec.profile === 'parlay-refinado'
      ? automaticParlayRiskReasons(prediction).filter((reason) => !isParlayRefinadoAllowedRiskReason(prediction, reason))
    : automaticParlayRiskReasons(prediction);
  reasons.push(...automaticReasons);
  if (hasHardResearchWarning(prediction) && !isAllInLowOddsSafeReview(prediction, spec)) reasons.push('hard research warning');
  if (prediction.confidence < spec.minConfidence && !isAllInLowOddsSafeReview(prediction, spec)) reasons.push(`below ${spec.profile} confidence floor`);
  if (spec.maxLegOdds !== undefined && prediction.odds > spec.maxLegOdds) reasons.push(`above ${spec.profile} leg odds ceiling ${spec.maxLegOdds}`);
  if (hasRiskTag(prediction, 'negative_edge')) reasons.push('negative edge');
  if (hasRiskTag(prediction, 'draw_exposure') && spec.avoidDrawExposure) reasons.push('draw exposure');
  if (!isAllInLowOddsSafeReview(prediction, spec) && hasRiskTag(prediction, 'fragile_low_total_over') && hasRiskTag(prediction, 'low_edge')) {
    reasons.push('fragile low total over with low edge');
  }
  if (!spec.allowFragileLowPriceDc && hasRiskTag(prediction, 'fragile_low_price_dc') && hasRiskTag(prediction, 'low_edge')) {
    reasons.push('fragile low-price double chance with low edge');
  }
  if (spec.markets && !spec.markets.includes(prediction.market)) reasons.push(`market not allowed for ${spec.profile}`);
  if (spec.requireLine && !Number.isFinite(prediction.line)) reasons.push('line required for totals profile');
  if ((prediction.edge ?? 0) < spec.minEdge) reasons.push(`edge below ${spec.profile} floor`);
  if (spec.avoidDrawExposure && (prediction.market === 'h2h' && prediction.selection === 'draw')) reasons.push('draw exposure');
  if (spec.avoidDrawExposure && (prediction.market === 'double_chance' && prediction.selection === 'home_or_away')) reasons.push('draw exposure');
  return [...new Set(reasons)];
}

function isParlayRefinadoAllowedRiskReason(prediction: ParlaySourcePrediction, reason: string): boolean {
  const shortPrice = prediction.odds <= 1.25;
  const strongLeg = prediction.confidence >= 0.8 && (prediction.edge ?? 0) >= 0.02;
  if (reason === 'low-liquidity h2h short favorite' && prediction.odds <= 1.2 && prediction.confidence >= 0.86 && (prediction.edge ?? 0) >= 0.02) {
    return true;
  }
  if (reason === 'low-liquidity prediction' && shortPrice && strongLeg && prediction.status === 'promotable') {
    return true;
  }
  return false;
}

function deterministicCandidateBlockers(
  candidate: ParlayCandidate,
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): string[] {
  const legs = candidate.legs.flatMap((id) => {
    const prediction = pool.find((item) => item.id === id);
    return prediction ? [prediction] : [];
  });
  const combinedOdds = candidate.combinedMarketOdds;
  const families = new Set(legs.map((prediction) => marketFamily(prediction.market)));
  const markets = new Set(legs.map((prediction) => prediction.market));
  const blockers = correlationBlockers(legs);
  if (spec.allInSafeMode) {
    if (legs.length < spec.minLegs) blockers.push(`leg count below ${spec.minLegs}`);
    return [...new Set(blockers.filter((blocker) => !/same-fixture|correlation/.test(blocker)))];
  }
  if (legs.length < spec.minLegs || legs.length > spec.maxLegs) blockers.push(`leg count outside ${spec.minLegs}-${spec.maxLegs}`);
  if (combinedOdds < spec.minOdds || combinedOdds > spec.maxOdds) blockers.push(`combined odds outside ${spec.minOdds}-${spec.maxOdds}`);
  if (spec.profile === 'parlay-refinado' && candidate.expectedEdge <= 0) blockers.push('expected edge must be positive');
  if (spec.requireMarketDiversity && markets.size < Math.min(3, legs.length)) blockers.push('insufficient market diversity');
  if (spec.requireMarketDiversity && families.size < Math.min(2, legs.length)) blockers.push('insufficient market-family diversity');
  if (spec.minAggregateConfidence !== undefined) {
    const aggregateConfidence = calculateAggregateConfidence(legs);
    if (aggregateConfidence < spec.minAggregateConfidence) {
      blockers.push(`aggregate confidence below ${spec.minAggregateConfidence}`);
    }
  }
  if (correlationPenalty(legs) >= 0.35) blockers.push('correlation penalty too high');
  return [...new Set(blockers)];
}

function deterministicCandidatesForProfile(
  profile: DeterministicParlayProfile,
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlayCandidate[] {
  if (profile === 'parlay-oro') {
    return generateParlayOroCandidates(pool, spec);
  }
  if (profile === 'parlay-diamante') {
    return generateParlayDiamanteCandidates(pool, spec);
  }
  if (profile === 'parlay-all-in') {
    return generateParlayAllInCandidates(pool, spec);
  }
  return generateParlayCandidatesForLegRange([...pool], spec.minLegs, spec.maxLegs);
}

async function generateParlayAllInLlmCandidates(
  config: AgentConfig,
  runtime: RuntimeContext,
  deps: ParlayBuildDependencies,
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
  context: {
    portfolioId: string;
    sourceRunId: string;
    date: string;
    generatedAt: string;
  },
): Promise<DeterministicCandidateSelection> {
  const eligible = normalizeAllInSafeLines(pool
    .filter((prediction) => isAllInEligiblePrediction(prediction, spec))
    .sort(compareAllInSafety));
  if (eligible.length < spec.minLegs) {
    return {
      candidates: [buildRejectedAllInCandidate(pool)],
      rawOutput: '',
      warnings: [`parlay-all-in guarded pool has ${eligible.length} safe leg(s); ${spec.minLegs} required`],
    };
  }

  const prompt = buildParlayAllInSelectionPrompt({
    ...context,
    spec,
    predictions: eligible,
  });
  let rawOutput = '';
  try {
    const result = await runParlayPortfolioAgent(deps.agentRunner ?? runAgentWithRetry, config, prompt, { runtime });
    rawOutput = result.text;
    const output = parsePortfolioAgentOutput(rawOutput);
    const poolById = new Map(eligible.map((prediction) => [prediction.id, prediction]));
    const rejectedReasons: string[] = [];
    for (const [index, parsed] of output.parlays.entries()) {
      const validation = validateParsedParlayAllInSelection(parsed, spec, poolById);
      if (!validation.ok) {
        rejectedReasons.push(`llm parlay ${index + 1} rejected: ${validation.reasons.join('; ')}`);
        continue;
      }
      return {
        candidates: [buildParlayAllInCandidate(validation.predictions)],
        rawOutput,
        warnings: uniqueStrings([
          `parlay-all-in selected by ${PARLAY_ALL_IN_PROMPT_VERSION}`,
          ...(output.noParlayReason ? [`no-parlay-reason: ${output.noParlayReason}`] : []),
          ...rejectedReasons,
        ]),
      };
    }

    const fallback = generateParlayAllInCandidates(pool, spec);
    return {
      candidates: fallback,
      rawOutput,
      warnings: uniqueStrings([
        output.noParlayReason ? `no-parlay-reason: ${output.noParlayReason}` : 'parlay-all-in LLM returned no valid parlay',
        ...rejectedReasons,
        'deterministic parlay-all-in fallback selected guarded top-safe legs',
      ]),
    };
  } catch (err: any) {
    return {
      candidates: generateParlayAllInCandidates(pool, spec),
      rawOutput,
      warnings: [
        `parlay-all-in LLM selection failed: ${err?.message ?? String(err)}`,
        'deterministic parlay-all-in fallback selected guarded top-safe legs',
      ],
    };
  }
}

function buildParlayAllInSelectionPrompt(input: {
  portfolioId: string;
  sourceRunId: string;
  date: string;
  generatedAt: string;
  spec: DeterministicProfileSpec;
  predictions: readonly ParlaySourcePrediction[];
}): string {
  const compactPredictions = input.predictions.map((prediction, index) => ({
    rank: index + 1,
    id: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    fairProbability: probabilityForParlayOroLeg(prediction),
    impliedProbability: prediction.impliedProbability ?? null,
    estimatedProbability: prediction.estimatedProbability ?? null,
    edge: prediction.edge ?? null,
    confidence: prediction.confidence,
    quality: prediction.quality,
    status: prediction.status,
    warnings: prediction.warnings ?? [],
    riskTags: prediction.riskTags ?? [],
    riskScore: prediction.riskScore ?? 0,
    rationale: prediction.rationale ? truncateText(prediction.rationale, 180) : undefined,
  }));

  return [
    `System prompt - Parlay all-in (${PARLAY_ALL_IN_PROMPT_VERSION})`,
    'You are selecting the safest analytical soccer accumulator from an already guarded prediction pool.',
    'This is LLM-first: use judgment to choose only the safest legs, not every available leg.',
    'Return JSON only. Do not include Markdown or commentary outside JSON.',
    'Use only predictionIds from the provided pool.',
    `Create exactly 1 parlay with ${input.spec.minLegs}-${input.spec.maxLegs} legs.`,
    `Combined decimal odds must stay between ${input.spec.minOdds} and ${input.spec.maxOdds}.`,
    `Use at most ${input.spec.maxReviewLegs ?? 0} review-required legs.`,
    'Use at most one leg per fixture.',
    'Prefer promotable h2h and double_chance favorites priced at or below 1.20.',
    'When totals are safer than match result, prefer low lines such as Over 1.5 or Over 2.5 over higher lines like Over 5.5.',
    'Avoid corners, draw-only exposure, home_or_away double chance, stale/research-warning legs unless the low price and rationale make them among the safest available.',
    'If two predictions describe the same fixture, choose the one with the safer market, lower line, lower odds, stronger fair probability, and clearer rationale.',
    'Reject volume when it adds fragility. A 6-leg parlay is better than 8 if the last two are meaningfully weaker.',
    'The artifact is analytical only and has no monetary action capability.',
    '',
    'JSON schema:',
    JSON.stringify({
      parlays: [
        {
          title: 'Parlay all-in seguro',
          predictionIds: ['prediction-id-1', 'prediction-id-2'],
          rationale: 'why these are the safest legs and why omitted legs were weaker',
          riskNotes: ['short risk note'],
        },
      ],
      noParlayReason: 'optional short reason when no parlay should be generated',
    }),
    '',
    'Context:',
    JSON.stringify({
      portfolioId: input.portfolioId,
      sourceRunId: input.sourceRunId,
      date: input.date,
      generatedAt: input.generatedAt,
      promptVersion: PARLAY_ALL_IN_PROMPT_VERSION,
      maxLegs: input.spec.maxLegs,
      maxReviewLegs: input.spec.maxReviewLegs ?? 0,
      predictionPool: compactPredictions,
    }),
  ].join('\n');
}

function validateParsedParlayAllInSelection(
  parsed: ParsedPortfolioParlay,
  spec: DeterministicProfileSpec,
  poolById: Map<string, ParlaySourcePrediction>,
): { ok: true; predictions: ParlaySourcePrediction[] } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const uniquePredictionIds = [...new Set(parsed.predictionIds)];
  if (uniquePredictionIds.length !== parsed.predictionIds.length) {
    reasons.push('duplicate prediction id in same parlay');
  }
  if (uniquePredictionIds.length < spec.minLegs || uniquePredictionIds.length > spec.maxLegs) {
    reasons.push(`selected ${uniquePredictionIds.length} legs, expected ${spec.minLegs}-${spec.maxLegs}`);
  }
  if (!parsed.rationale.trim()) reasons.push('missing rationale');

  const predictions = uniquePredictionIds.map((id) => poolById.get(id));
  for (const [index, prediction] of predictions.entries()) {
    if (!prediction) reasons.push(`unknown prediction id: ${uniquePredictionIds[index]}`);
  }
  if (reasons.length) return { ok: false, reasons };

  const selected = predictions.filter((prediction): prediction is ParlaySourcePrediction => Boolean(prediction));
  const fixtureIds = selected.map((prediction) => prediction.fixtureId);
  if (!spec.allowMultipleLegsPerFixture && new Set(fixtureIds).size !== fixtureIds.length) {
    reasons.push('duplicate fixture in parlay-all-in selection');
  }
  const reviewLegs = selected.filter((prediction) => prediction.status === 'review-required').length;
  if (spec.maxReviewLegs !== undefined && reviewLegs > spec.maxReviewLegs) {
    reasons.push(`selected ${reviewLegs} review-required legs, max ${spec.maxReviewLegs}`);
  }
  const combinedOdds = selected.reduce((product, prediction) => product * prediction.odds, 1);
  if (combinedOdds < spec.minOdds || combinedOdds > spec.maxOdds) {
    reasons.push(`combined odds ${round(combinedOdds)} outside parlay-all-in target ${spec.minOdds}-${spec.maxOdds}`);
  }
  const blockers = correlationBlockers(selected);
  if (blockers.length) reasons.push(...blockers);
  return reasons.length ? { ok: false, reasons: uniqueStrings(reasons) } : { ok: true, predictions: selected };
}

async function generateParlayRefinadoLlmCandidates(
  config: AgentConfig,
  runtime: RuntimeContext,
  deps: ParlayBuildDependencies,
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
  context: {
    portfolioId: string;
    sourceRunId: string;
    date: string;
    generatedAt: string;
  },
): Promise<DeterministicCandidateSelection> {
  const eligible = normalizeParlayRefinadoPool(pool
    .filter((prediction) => isParlayRefinadoEligiblePrediction(prediction, spec))
    .sort(compareParlayRefinadoSafety));
  if (eligible.length < spec.minLegs) {
    return {
      candidates: [buildRejectedParlayRefinadoCandidate(pool)],
      rawOutput: '',
      warnings: [`parlay-refinado guarded pool has ${eligible.length} eligible leg(s); ${spec.minLegs} required`],
    };
  }

  const prompt = buildParlayRefinadoSelectionPrompt({
    ...context,
    spec,
    predictions: eligible.slice(0, 48),
  });
  let rawOutput = '';
  try {
    const result = await runParlayPortfolioAgent(deps.agentRunner ?? runAgentWithRetry, config, prompt, { runtime });
    rawOutput = result.text;
    const output = parsePortfolioAgentOutput(rawOutput);
    const poolById = new Map(eligible.map((prediction) => [prediction.id, prediction]));
    const rejectedReasons: string[] = [];
    for (const [index, parsed] of output.parlays.entries()) {
      const validation = validateParsedParlayRefinadoSelection(parsed, spec, poolById);
      if (!validation.ok) {
        rejectedReasons.push(`llm parlay ${index + 1} rejected: ${validation.reasons.join('; ')}`);
        continue;
      }
      return {
        candidates: [buildParlayRefinadoCandidate(validation.predictions, 'llm-refined-selection')],
        prompt,
        rawOutput,
        warnings: uniqueStrings([
          `parlay-refinado selected by ${PARLAY_REFINADO_PROMPT_VERSION}`,
          ...(output.noParlayReason ? [`no-parlay-reason: ${output.noParlayReason}`] : []),
          ...rejectedReasons,
        ]),
      };
    }

    return {
      candidates: generateParlayRefinadoFallbackCandidates(eligible, spec),
      prompt,
      rawOutput,
      warnings: uniqueStrings([
        output.noParlayReason ? `no-parlay-reason: ${output.noParlayReason}` : 'parlay-refinado LLM returned no valid parlay',
        ...rejectedReasons,
        'deterministic parlay-refinado fallback selected guarded retrospective legs',
      ]),
    };
  } catch (err: any) {
    return {
      candidates: generateParlayRefinadoFallbackCandidates(eligible, spec),
      prompt,
      rawOutput,
      warnings: [
        `parlay-refinado LLM selection failed: ${err?.message ?? String(err)}`,
        'deterministic parlay-refinado fallback selected guarded retrospective legs',
      ],
    };
  }
}

function buildParlayRefinadoSelectionPrompt(input: {
  portfolioId: string;
  sourceRunId: string;
  date: string;
  generatedAt: string;
  spec: DeterministicProfileSpec;
  predictions: readonly ParlaySourcePrediction[];
}): string {
  const compactPredictions = input.predictions.map((prediction, index) => ({
    rank: index + 1,
    id: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    fairProbability: probabilityForParlayOroLeg(prediction),
    impliedProbability: prediction.impliedProbability ?? null,
    estimatedProbability: prediction.estimatedProbability ?? null,
    edge: prediction.edge ?? null,
    confidence: prediction.confidence,
    quality: prediction.quality,
    status: prediction.status,
    warnings: prediction.warnings ?? [],
    riskTags: prediction.riskTags ?? [],
    riskScore: prediction.riskScore ?? 0,
    rationale: prediction.rationale ? truncateText(prediction.rationale, 180) : undefined,
  }));

  return [
    `System prompt - Parlay refinado (${PARLAY_REFINADO_PROMPT_VERSION})`,
    'You select exactly one refined analytical soccer parlay from already-scored atomic predictions.',
    'Use the retrospective summary as decision context, but select only from today/run predictionPool. Do not use outcomes or future information.',
    'Return JSON only. Do not include Markdown or commentary outside JSON.',
    'Use only predictionIds from the provided pool.',
    `Create exactly 1 parlay with ${input.spec.minLegs}-${input.spec.maxLegs} legs; prefer 2 legs unless the third is clearly as safe as the first two.`,
    `Combined decimal odds must stay between ${input.spec.minOdds} and ${input.spec.maxOdds}; prefer 1.30-1.99.`,
    'Use at most one leg per fixture. Duplicate fixture selections will be rejected.',
    'Do not choose corners, draw-only h2h, home_or_away double chance, stale/research-warning legs, negative-edge legs, hard blockers, inflated double-chance edge, or fragile low total over legs.',
    'Prefer independent short-price h2h home favorites, safe double chance home_or_draw/draw_or_away, and conservative under/BTTS no only when the rationale is stronger than result-market alternatives.',
    'A low-liquidity tag alone may be tolerated only for very short, high-confidence, positive-edge legs; explain why it remains acceptable.',
    'Reject volume when it adds fragility. A clean 2-leg parlay is better than a weaker 3-leg parlay.',
    'The artifact is analytical only and has no monetary action capability.',
    '',
    'Retrospective summary:',
    JSON.stringify(PARLAY_REFINADO_RETROSPECTIVE),
    '',
    'JSON schema:',
    JSON.stringify({
      parlays: [
        {
          title: 'Parlay refinado',
          predictionIds: ['prediction-id-1', 'prediction-id-2'],
          rationale: 'why these legs are the strongest available and why omitted candidates were weaker',
          riskNotes: ['short risk note'],
        },
      ],
      noParlayReason: 'optional short reason when no parlay should be generated',
    }),
    '',
    'Context:',
    JSON.stringify({
      portfolioId: input.portfolioId,
      sourceRunId: input.sourceRunId,
      date: input.date,
      generatedAt: input.generatedAt,
      promptVersion: PARLAY_REFINADO_PROMPT_VERSION,
      predictionPool: compactPredictions,
    }),
  ].join('\n');
}

function validateParsedParlayRefinadoSelection(
  parsed: ParsedPortfolioParlay,
  spec: DeterministicProfileSpec,
  poolById: Map<string, ParlaySourcePrediction>,
): { ok: true; predictions: ParlaySourcePrediction[] } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const uniquePredictionIds = [...new Set(parsed.predictionIds)];
  if (uniquePredictionIds.length !== parsed.predictionIds.length) {
    reasons.push('duplicate prediction id in same parlay');
  }
  if (uniquePredictionIds.length < spec.minLegs || uniquePredictionIds.length > spec.maxLegs) {
    reasons.push(`selected ${uniquePredictionIds.length} legs, expected ${spec.minLegs}-${spec.maxLegs}`);
  }
  if (!parsed.rationale.trim()) reasons.push('missing rationale');

  const predictions = uniquePredictionIds.map((id) => poolById.get(id));
  for (const [index, prediction] of predictions.entries()) {
    if (!prediction) reasons.push(`unknown prediction id: ${uniquePredictionIds[index]}`);
  }
  if (reasons.length) return { ok: false, reasons };

  const selected = predictions.filter((prediction): prediction is ParlaySourcePrediction => Boolean(prediction));
  const fixtureIds = selected.map((prediction) => prediction.fixtureId);
  if (new Set(fixtureIds).size !== fixtureIds.length) reasons.push('duplicate fixture in parlay-refinado selection');
  const reviewLegs = selected.filter((prediction) => prediction.status === 'review-required').length;
  if (spec.maxReviewLegs !== undefined && reviewLegs > spec.maxReviewLegs) {
    reasons.push(`selected ${reviewLegs} review-required legs, max ${spec.maxReviewLegs}`);
  }
  for (const prediction of selected) {
    const blockers = parlayRefinadoHardBlockers(prediction, spec);
    reasons.push(...blockers.map((blocker) => `${prediction.id}: ${blocker}`));
  }
  const combinedOdds = selected.reduce((product, prediction) => product * prediction.odds, 1);
  if (combinedOdds < spec.minOdds || combinedOdds > spec.maxOdds) {
    reasons.push(`combined odds ${round(combinedOdds)} outside parlay-refinado target ${spec.minOdds}-${spec.maxOdds}`);
  }
  const aggregateConfidence = calculateAggregateConfidence(selected);
  if (spec.minAggregateConfidence !== undefined && aggregateConfidence < spec.minAggregateConfidence) {
    reasons.push(`aggregate confidence ${round(aggregateConfidence)} below parlay-refinado floor ${spec.minAggregateConfidence}`);
  }
  const candidate = buildParlayRefinadoCandidate(selected, 'llm-refined-selection');
  if (candidate.expectedEdge <= 0) {
    reasons.push(`expected edge ${round(candidate.expectedEdge)} must be positive`);
  }
  const blockers = correlationBlockers(selected);
  if (blockers.length) reasons.push(...blockers);
  return reasons.length ? { ok: false, reasons: uniqueStrings(reasons) } : { ok: true, predictions: selected };
}

function generateParlayRefinadoFallbackCandidates(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlayCandidate[] {
  const combinations: ParlaySourcePrediction[][] = [];
  const sortedPool = [...pool].sort(compareParlayRefinadoSafety).slice(0, 36);
  for (let size = spec.minLegs; size <= spec.maxLegs; size += 1) {
    collectParlayRefinadoCombinations(sortedPool, spec, size, 0, [], combinations, 800);
  }
  const candidates = combinations
    .map((predictions) => buildParlayRefinadoCandidate(predictions, 'deterministic-refined-fallback'))
    .filter((candidate) => !deterministicCandidateBlockers(candidate, pool, spec).length)
    .sort((a, b) =>
      b.expectedEdge - a.expectedEdge
      || b.combinedFairProbability - a.combinedFairProbability
      || a.combinedMarketOdds - b.combinedMarketOdds
      || a.riskScore - b.riskScore,
    );
  return candidates.length ? [candidates[0]] : [buildRejectedParlayRefinadoCandidate(pool)];
}

function collectParlayRefinadoCombinations(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
  size: number,
  start: number,
  current: ParlaySourcePrediction[],
  output: ParlaySourcePrediction[][],
  limit: number,
): void {
  if (output.length >= limit) return;
  const currentOdds = current.reduce((product, prediction) => product * prediction.odds, 1);
  if (currentOdds > spec.maxOdds) return;
  if (current.length === size) {
    if (currentOdds >= spec.minOdds && currentOdds <= spec.maxOdds) output.push([...current]);
    return;
  }
  const remainingNeeded = size - current.length;
  for (let index = start; index <= pool.length - remainingNeeded; index += 1) {
    if (current.some((prediction) => prediction.fixtureId === pool[index].fixtureId)) continue;
    current.push(pool[index]);
    collectParlayRefinadoCombinations(pool, spec, size, index + 1, current, output, limit);
    current.pop();
    if (output.length >= limit) return;
  }
}

function normalizeParlayRefinadoPool(pool: readonly ParlaySourcePrediction[]): ParlaySourcePrediction[] {
  const byFixture = new Map<string, ParlaySourcePrediction[]>();
  for (const prediction of pool) {
    const group = byFixture.get(prediction.fixtureId) ?? [];
    group.push(prediction);
    byFixture.set(prediction.fixtureId, group);
  }
  return [...byFixture.values()]
    .map((group) => [...group].sort(compareParlayRefinadoSafety)[0])
    .sort(compareParlayRefinadoSafety);
}

function compareParlayRefinadoSafety(a: ParlaySourcePrediction, b: ParlaySourcePrediction): number {
  return parlayRefinadoRiskTier(a) - parlayRefinadoRiskTier(b)
    || a.odds - b.odds
    || (probabilityForParlayOroLeg(b) - probabilityForParlayOroLeg(a))
    || b.confidence - a.confidence
    || (b.edge ?? 0) - (a.edge ?? 0)
    || a.id.localeCompare(b.id);
}

function parlayRefinadoRiskTier(prediction: ParlaySourcePrediction): number {
  if (prediction.status === 'promotable' && prediction.market === 'double_chance' && prediction.odds <= 1.22) return 0;
  if (prediction.status === 'promotable' && prediction.market === 'h2h' && prediction.selection === 'home' && prediction.odds <= 1.25) return 1;
  if (prediction.status === 'promotable' && prediction.market === 'double_chance' && prediction.odds <= 1.35) return 2;
  if (prediction.status === 'promotable' && prediction.market === 'h2h' && prediction.odds <= 1.45) return 3;
  if (prediction.status === 'promotable' && prediction.market === 'goals_over_under' && prediction.selection === 'under') return 4;
  if (prediction.status === 'promotable' && prediction.market === 'btts' && prediction.selection === 'no') return 5;
  return 8;
}

function selectParlayRefinadoLegs(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlaySourcePrediction[] {
  const selected: ParlaySourcePrediction[] = [];
  const usedFixtures = new Set<string>();
  let combinedOdds = 1;
  for (const prediction of pool) {
    if (usedFixtures.has(prediction.fixtureId)) continue;
    if (parlayRefinadoHardBlockers(prediction, spec).length) continue;
    const nextOdds = combinedOdds * prediction.odds;
    if (nextOdds > spec.maxOdds && selected.length >= spec.minLegs) continue;
    selected.push(prediction);
    usedFixtures.add(prediction.fixtureId);
    combinedOdds = nextOdds;
    if (selected.length >= spec.maxLegs) break;
  }
  if (selected.length > 2 && selected.reduce((product, prediction) => product * prediction.odds, 1) > 1.99) {
    return selected.slice(0, 2);
  }
  return selected;
}

function isParlayRefinadoEligiblePrediction(prediction: ParlaySourcePrediction, spec: DeterministicProfileSpec): boolean {
  if (prediction.blockers?.length) return false;
  if (!['promotable', 'candidate'].includes(prediction.status)) return false;
  if (spec.markets && !spec.markets.includes(prediction.market)) return false;
  return parlayRefinadoHardBlockers(prediction, spec).length === 0;
}

function parlayRefinadoHardBlockers(prediction: ParlaySourcePrediction, spec: DeterministicProfileSpec): string[] {
  const reasons: string[] = [];
  if (prediction.blockers?.length) reasons.push('prediction blockers present');
  if (prediction.parlayEligible === false) reasons.push('not parlay eligible');
  if (prediction.status === 'review-required' || prediction.status === 'blocked' || prediction.status === 'draft') reasons.push(`status ${prediction.status} not allowed`);
  if (prediction.confidence < spec.minConfidence) reasons.push(`below confidence floor ${spec.minConfidence}`);
  if ((prediction.edge ?? 0) < spec.minEdge) reasons.push(`edge below floor ${spec.minEdge}`);
  if (spec.maxLegOdds !== undefined && prediction.odds > spec.maxLegOdds) reasons.push(`above leg odds ceiling ${spec.maxLegOdds}`);
  if (prediction.market === 'corners_over_under') reasons.push('corners not allowed');
  if (prediction.market === 'h2h' && prediction.selection === 'draw') reasons.push('draw h2h not allowed');
  if (prediction.market === 'double_chance' && prediction.selection === 'home_or_away') reasons.push('draw exposure not allowed');
  if (hasHardResearchWarning(prediction)) reasons.push('hard research warning');
  if (hasRiskTag(prediction, 'negative_edge')) reasons.push('negative edge');
  if (hasRiskTag(prediction, 'stale_low_liquidity')) reasons.push('stale low liquidity');
  if (hasRiskTag(prediction, 'research_warning')) reasons.push('research warning');
  if (hasRiskTag(prediction, 'inflated_double_chance_edge')) reasons.push('inflated double-chance edge');
  if (hasRiskTag(prediction, 'fragile_low_total_over')) reasons.push('fragile low total over');
  if (hasRiskTag(prediction, 'lineup_pending')) reasons.push('lineup pending');
  if (hasRiskTag(prediction, 'selection_evidence_missing')) reasons.push('selection evidence missing');
  if (hasRiskTag(prediction, 'h2h_away') && prediction.odds > 1.2) reasons.push('h2h away above short-price limit');
  return uniqueStrings(reasons);
}

function buildParlayRefinadoCandidate(
  predictions: readonly ParlaySourcePrediction[],
  reason: string,
): ParlayCandidate {
  const legs = [...predictions];
  const penalty = correlationPenalty(legs);
  const combinedFairProbability = predictions.reduce((product, prediction) => product * probabilityForParlayOroLeg(prediction), 1) * (1 - penalty);
  const combinedMarketOdds = predictions.reduce((product, prediction) => product * prediction.odds, 1);
  const combinedFairOdds = combinedFairProbability > 0 ? 1 / combinedFairProbability : Infinity;
  const expectedEdge = (combinedMarketOdds * combinedFairProbability) - 1;
  const averageConfidence = predictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / Math.max(1, predictions.length);
  const sourceRisk = predictions.reduce((sum, prediction) => sum + (prediction.riskScore ?? 0), 0) / Math.max(1, predictions.length);
  return {
    parlayId: randomUUID(),
    legs: predictions.map((prediction) => prediction.id),
    combinedFairProbability,
    combinedMarketOdds,
    combinedFairOdds,
    expectedEdge,
    correlationPenalty: penalty,
    diversityScore: new Set(predictions.map((prediction) => prediction.fixtureId)).size / Math.max(1, predictions.length),
    riskScore: penalty + sourceRisk * 0.06 + (1 - averageConfidence) * 0.45,
    reason: expectedEdge > 0.05 ? 'top-ev' : reason === 'llm-refined-selection' ? 'high-conviction' : 'low-variance',
    blockers: [],
  };
}

function buildRejectedParlayRefinadoCandidate(pool: readonly ParlaySourcePrediction[]): ParlayCandidate {
  return {
    parlayId: randomUUID(),
    legs: [],
    combinedFairProbability: 0,
    combinedMarketOdds: 0,
    combinedFairOdds: Infinity,
    expectedEdge: 0,
    correlationPenalty: 0,
    diversityScore: 0,
    riskScore: 1,
    reason: 'rejected',
    blockers: pool.length ? ['no-parlay-refinado-eligible-legs'] : ['no-predictions'],
  };
}

function generateParlayAllInCandidates(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlayCandidate[] {
  const eligible = normalizeAllInSafeLines(pool
    .filter((prediction) => isAllInEligiblePrediction(prediction, spec))
    .sort(compareAllInSafety));
  const selected = selectParlayAllInLegs(eligible, spec);
  if (selected.length < spec.minLegs) return [buildRejectedAllInCandidate(pool)];
  return [buildParlayAllInCandidate(selected)];
}

function normalizeAllInSafeLines(pool: readonly ParlaySourcePrediction[]): ParlaySourcePrediction[] {
  const selectionGroups = new Map<string, ParlaySourcePrediction[]>();
  for (const prediction of pool) {
    const key = `${prediction.fixtureId}:${prediction.market}:${prediction.selection}`;
    const group = selectionGroups.get(key) ?? [];
    group.push(prediction);
    selectionGroups.set(key, group);
  }

  const bestBySelection = [...selectionGroups.values()].map((group) => [...group].sort(compareAllInSafety)[0]);
  const marketGroups = new Map<string, ParlaySourcePrediction[]>();
  for (const prediction of bestBySelection) {
    const key = `${prediction.fixtureId}:${prediction.market}`;
    const group = marketGroups.get(key) ?? [];
    group.push(prediction);
    marketGroups.set(key, group);
  }

  return [...marketGroups.values()]
    .map((group) => [...group].sort(compareAllInSafety)[0])
    .sort(compareAllInSafety);
}

function compareAllInSafety(a: ParlaySourcePrediction, b: ParlaySourcePrediction): number {
  return allInRiskTier(a) - allInRiskTier(b)
    || a.odds - b.odds
    || allInLineSafetyRank(a) - allInLineSafetyRank(b)
    || (probabilityForParlayOroLeg(b) - probabilityForParlayOroLeg(a))
    || b.confidence - a.confidence
    || (b.edge ?? 0) - (a.edge ?? 0)
    || a.id.localeCompare(b.id);
}

function selectParlayAllInLegs(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlaySourcePrediction[] {
  const selected: ParlaySourcePrediction[] = [];
  const usedFixtures = new Set<string>();
  let reviewLegs = 0;
  let combinedOdds = 1;
  for (const prediction of pool) {
    if (!spec.allowMultipleLegsPerFixture && usedFixtures.has(prediction.fixtureId)) continue;
    if (prediction.status === 'review-required' && spec.maxReviewLegs !== undefined && reviewLegs >= spec.maxReviewLegs) continue;
    const nextOdds = combinedOdds * prediction.odds;
    if (nextOdds > spec.maxOdds && selected.length >= spec.minLegs) continue;
    selected.push(prediction);
    usedFixtures.add(prediction.fixtureId);
    combinedOdds = nextOdds;
    if (prediction.status === 'review-required') reviewLegs += 1;
    if (selected.length >= spec.maxLegs) break;
  }
  return selected;
}

function allInRiskTier(prediction: ParlaySourcePrediction): number {
  const resultMarket = prediction.market === 'h2h' || prediction.market === 'double_chance';
  const lowOdds = prediction.odds <= 1.2;
  if (prediction.status === 'promotable' && resultMarket && prediction.odds <= 1.1) return 0;
  if (prediction.status === 'promotable' && resultMarket && lowOdds) return 1;
  if (prediction.status === 'promotable' && isAllInLowOddsTotalOver(prediction)) return 2;
  if (prediction.status === 'review-required' && isAllInLowOddsSafePrediction(prediction)) return 3;
  if (prediction.status === 'promotable' && resultMarket && prediction.odds <= 1.25) return 4;
  if (prediction.status === 'promotable' && prediction.odds <= 1.25) return 5;
  return 9;
}

function allInLineSafetyRank(prediction: ParlaySourcePrediction): number {
  if (prediction.market !== 'goals_over_under') return 0;
  const line = Number(prediction.line ?? NaN);
  if (!Number.isFinite(line)) return 10;
  if (prediction.selection === 'over') return line;
  if (prediction.selection === 'under') return -line;
  return 0;
}

function isAllInEligiblePrediction(prediction: ParlaySourcePrediction, spec: DeterministicProfileSpec): boolean {
  if (prediction.blockers?.length) return false;
  if (!['promotable', 'candidate', 'review-required'].includes(prediction.status)) return false;
  if (spec.markets && !spec.markets.includes(prediction.market)) return false;
  if (prediction.market === 'h2h' && prediction.selection === 'draw') return false;
  if (prediction.market === 'double_chance' && prediction.selection === 'home_or_away') return false;
  return true;
}

function isAllInAllowedRiskReason(prediction: ParlaySourcePrediction, reason: string): boolean {
  if (reason === 'low-liquidity h2h short favorite' && prediction.odds <= 1.2) return true;
  if (/fragile low-priced total over/.test(reason) && isAllInLowOddsTotalOver(prediction)) return true;
  if (reason === 'low-liquidity prediction' && isAllInLowOddsSafePrediction(prediction)) return true;
  if (reason === 'stale low-liquidity prediction' && isAllInLowOddsSafePrediction(prediction)) return true;
  return false;
}

function isAllInLowOddsSafeReview(prediction: ParlaySourcePrediction, spec: DeterministicProfileSpec): boolean {
  return Boolean(spec.allInSafeMode) && isAllInLowOddsSafePrediction(prediction);
}

function isAllInLowOddsSafePrediction(prediction: ParlaySourcePrediction): boolean {
  if ((prediction.edge ?? 0) < 0) return false;
  if (prediction.odds <= 1.2 && prediction.confidence >= 0.45) return true;
  return isAllInLowOddsTotalOver(prediction);
}

function isAllInLowOddsTotalOver(prediction: ParlaySourcePrediction): boolean {
  return prediction.market === 'goals_over_under'
    && prediction.selection === 'over'
    && Number(prediction.line ?? Infinity) <= 2.5
    && prediction.odds <= 1.2
    && prediction.confidence >= 0.45
    && (prediction.edge ?? 0) >= 0;
}

function buildParlayAllInCandidate(predictions: readonly ParlaySourcePrediction[]): ParlayCandidate {
  const combinedMarketOdds = predictions.reduce((product, prediction) => product * prediction.odds, 1);
  const combinedFairProbability = predictions.reduce((product, prediction) => product * probabilityForParlayOroLeg(prediction), 1);
  const combinedFairOdds = combinedFairProbability > 0 ? 1 / combinedFairProbability : Infinity;
  const expectedEdge = (combinedMarketOdds * combinedFairProbability) - 1;
  const sourceRisk = predictions.reduce((sum, prediction) => sum + (prediction.riskScore ?? 0), 0) / Math.max(1, predictions.length);
  const averageConfidence = predictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / Math.max(1, predictions.length);
  return {
    parlayId: randomUUID(),
    legs: predictions.map((prediction) => prediction.id),
    combinedFairProbability,
    combinedMarketOdds,
    combinedFairOdds,
    expectedEdge,
    correlationPenalty: correlationPenalty([...predictions]),
    diversityScore: new Set(predictions.map((prediction) => prediction.fixtureId)).size / Math.max(1, predictions.length),
    riskScore: sourceRisk + (1 - averageConfidence) * 0.35,
    reason: 'high-conviction',
    blockers: [],
  };
}

function buildRejectedAllInCandidate(pool: readonly ParlaySourcePrediction[]): ParlayCandidate {
  return {
    parlayId: randomUUID(),
    legs: [],
    combinedFairProbability: 0,
    combinedMarketOdds: 0,
    combinedFairOdds: Infinity,
    expectedEdge: 0,
    correlationPenalty: 0,
    diversityScore: 0,
    riskScore: 1,
    reason: 'rejected',
    blockers: pool.length ? ['no-parlay-all-in-safe-legs'] : ['no-predictions'],
  };
}

function generateParlayDiamanteCandidates(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlayCandidate[] {
  const eligible = pool
    .filter((prediction) => (prediction.status === 'promotable' || prediction.status === 'candidate') && !(prediction.blockers?.length))
    .sort((a, b) =>
      probabilityForParlayOroLeg(b) - probabilityForParlayOroLeg(a)
      || b.confidence - a.confidence
      || (b.edge ?? 0) - (a.edge ?? 0)
      || a.odds - b.odds,
    )
    .slice(0, 32);
  const candidates: ParlayCandidate[] = [];
  for (let size = spec.minLegs; size <= Math.min(spec.maxLegs, eligible.length); size += 1) {
    collectParlayOroCombinations(eligible, spec, size, 0, [], candidates, 1200);
  }
  return candidates.length ? candidates : [buildRejectedDiamanteCandidate(pool)];
}

function buildRejectedDiamanteCandidate(pool: readonly ParlaySourcePrediction[]): ParlayCandidate {
  return {
    parlayId: randomUUID(),
    legs: [],
    combinedFairProbability: 0,
    combinedMarketOdds: 0,
    combinedFairOdds: Infinity,
    expectedEdge: 0,
    correlationPenalty: 0,
    diversityScore: 0,
    riskScore: 1,
    reason: 'rejected',
    blockers: pool.length ? ['no-parlay-diamante-combinations-within-odds-window'] : ['no-predictions'],
  };
}

function generateParlayOroCandidates(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
): ParlayCandidate[] {
  const eligible = pool
    .filter((prediction) => (prediction.status === 'promotable' || prediction.status === 'candidate') && !(prediction.blockers?.length))
    .sort((a, b) =>
      b.odds - a.odds
      || probabilityForParlayOroLeg(b) - probabilityForParlayOroLeg(a)
      || b.confidence - a.confidence
      || (b.edge ?? 0) - (a.edge ?? 0),
    )
    .slice(0, 28);
  const candidates: ParlayCandidate[] = [];
  const maxSize = Math.min(spec.maxLegs, eligible.length);
  for (let size = maxSize; size >= spec.minLegs; size--) {
    collectParlayOroCombinations(eligible, spec, size, 0, [], candidates, 1800);
  }
  return candidates.length ? candidates : [buildRejectedParlayOroCandidate(pool)];
}

function collectParlayOroCombinations(
  pool: readonly ParlaySourcePrediction[],
  spec: DeterministicProfileSpec,
  size: number,
  start: number,
  current: ParlaySourcePrediction[],
  output: ParlayCandidate[],
  limit: number,
): void {
  if (output.length >= limit) return;
  const currentOdds = current.reduce((product, prediction) => product * prediction.odds, 1);
  if (currentOdds > spec.maxOdds) return;
  if (current.length === size) {
    if (currentOdds >= spec.minOdds && currentOdds <= spec.maxOdds) {
      output.push(buildParlayOroCandidate(current));
    }
    return;
  }
  const remainingNeeded = size - current.length;
  for (let index = start; index <= pool.length - remainingNeeded; index++) {
    current.push(pool[index]);
    collectParlayOroCombinations(pool, spec, size, index + 1, current, output, limit);
    current.pop();
    if (output.length >= limit) return;
  }
}

function buildParlayOroCandidate(predictions: readonly ParlaySourcePrediction[]): ParlayCandidate {
  const legs = [...predictions];
  const penalty = correlationPenalty(legs);
  const combinedFairProbability = predictions.reduce((product, prediction) => product * probabilityForParlayOroLeg(prediction), 1) * (1 - penalty);
  const combinedMarketOdds = predictions.reduce((product, prediction) => product * prediction.odds, 1);
  const combinedFairOdds = combinedFairProbability > 0 ? 1 / combinedFairProbability : Infinity;
  const expectedEdge = (combinedMarketOdds * combinedFairProbability) - 1;
  const teams = new Set(predictions.map((prediction: any) => prediction.teamId ?? prediction.fixtureId));
  const blockers: string[] = [];
  if (combinedFairProbability < 0.12) blockers.push('low-conviction');
  if (teams.size < predictions.length) blockers.push('duplicate-team');
  blockers.push(...correlationBlockers(legs));
  const averageConfidence = predictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / Math.max(1, predictions.length);
  const sourceRisk = predictions.reduce((sum, prediction) => sum + (prediction.riskScore ?? 0), 0) / Math.max(1, predictions.length);
  return {
    parlayId: randomUUID(),
    legs: predictions.map((prediction) => prediction.id),
    combinedFairProbability,
    combinedMarketOdds,
    combinedFairOdds,
    expectedEdge,
    correlationPenalty: penalty,
    diversityScore: teams.size / Math.max(1, predictions.length),
    riskScore: penalty + blockers.length * 0.25 + sourceRisk * 0.04 + (1 - averageConfidence) * 0.5,
    reason: blockers.length ? 'rejected' : 'high-conviction',
    blockers,
  };
}

function buildRejectedParlayOroCandidate(pool: readonly ParlaySourcePrediction[]): ParlayCandidate {
  return {
    parlayId: randomUUID(),
    legs: [],
    combinedFairProbability: 0,
    combinedMarketOdds: 0,
    combinedFairOdds: Infinity,
    expectedEdge: 0,
    correlationPenalty: 0,
    diversityScore: 0,
    riskScore: 1,
    reason: 'rejected',
    blockers: pool.length ? ['no-parlay-oro-combinations-within-odds-window'] : ['no-predictions'],
  };
}

function probabilityForParlayOroLeg(prediction: ParlaySourcePrediction): number {
  return prediction.marketFairProbability ?? prediction.estimatedProbability ?? prediction.confidence;
}

function rankParlayOroCandidates(candidates: ParlayCandidate[]): ParlayCandidate[] {
  return [...candidates].sort((a, b) =>
    Number(a.blockers.length > 0) - Number(b.blockers.length > 0)
    || b.combinedMarketOdds - a.combinedMarketOdds
    || b.combinedFairProbability - a.combinedFairProbability
    || b.expectedEdge - a.expectedEdge
    || a.riskScore - b.riskScore,
  );
}

function rankParlayDiamanteCandidates(candidates: ParlayCandidate[]): ParlayCandidate[] {
  return [...candidates].sort((a, b) =>
    Number(a.blockers.length > 0) - Number(b.blockers.length > 0)
    || b.combinedFairProbability - a.combinedFairProbability
    || a.correlationPenalty - b.correlationPenalty
    || a.riskScore - b.riskScore
    || Math.abs(a.combinedMarketOdds - 1.1) - Math.abs(b.combinedMarketOdds - 1.1)
    || b.expectedEdge - a.expectedEdge,
  );
}

function buildFromCandidate(
  candidate: ParlayCandidate,
  pool: readonly ParlaySourcePrediction[],
  profile: DeterministicParlayProfile,
  sourceRunId: string,
  generatedAt: string,
  spec: DeterministicProfileSpec,
): BuildParlayResult {
  const selected = candidate.legs.flatMap((id) => {
    const prediction = pool.find((item) => item.id === id);
    return prediction ? [prediction] : [];
  });
  const parlayId = candidate.parlayId;
  const legs: ParlayLeg[] = selected.map((prediction, index) => ({
    parlayId,
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line,
    odds: prediction.odds,
    status: prediction.status,
    index,
    inclusionReason: 'included-eligible-prediction',
  }));
  const warnings = uniqueStrings([
    profile === 'parlay-all-in' || profile === 'parlay-refinado'
      ? `included by LLM-guided ${profile}: ${candidate.reason}`
      : `included by deterministic ${profile}: ${candidate.reason}`,
    ...(candidate.correlationPenalty > 0 ? [`correlation penalty ${round(candidate.correlationPenalty)}`] : []),
  ]);
  const status: PredictionStatus = spec.reviewOnly || selected.some((prediction) => prediction.status === 'review-required' || prediction.warnings?.length)
    ? 'review-required'
    : selected.every((prediction) => prediction.status === 'promotable')
      ? 'promotable'
      : 'candidate';
  const aggregateConfidence = spec.averageAggregateConfidence
    ? selected.reduce((sum, prediction) => sum + prediction.confidence, 0) / Math.max(1, selected.length)
    : calculateAggregateConfidence(selected);
  return {
    parlay: {
      id: parlayId,
      sourceRunId,
      legs,
      combinedOdds: round(candidate.combinedMarketOdds),
      aggregateConfidence: round(aggregateConfidence),
      aggregateQuality: round(calculateAggregateQuality(selected)),
      rationale: [
        profile === 'parlay-all-in' || profile === 'parlay-refinado'
          ? `LLM-guided ${profile} analytical parlay selected from a guarded safe pool and validated before persistence.`
          : `Deterministic ${profile} analytical parlay selected by candidate-generator, ranker, diversifier, and correlation checks.`,
        `Expected edge ${round(candidate.expectedEdge)}; combined fair probability ${round(candidate.combinedFairProbability)}.`,
      ].join(' '),
      warnings,
      status,
      generatedAt,
    },
    evaluations: selected.map((prediction) => ({
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      includedReasons: ['included-eligible-prediction'],
      excludedReasons: [],
      eligible: true,
    })),
    config: {
      minLegs: spec.minLegs,
      maxLegs: spec.maxLegs,
      allowMultipleLegsPerFixture: Boolean(spec.allowMultipleLegsPerFixture),
      minPredictionConfidence: spec.minConfidence,
      maxCombinedOdds: spec.maxOdds,
    },
  };
}

function deterministicArtifactName(profile: DeterministicParlayProfile, blocked: boolean): string {
  const base = profile === 'parlay-oro' || profile === 'parlay-diamante' || profile === 'parlay-all-in' || profile === 'parlay-refinado' ? profile : `parlay-${profile}`;
  return blocked ? `${base}-blocked.json` : `${base}.json`;
}

function diversifyMarketDiverseCandidates(
  candidates: ParlayCandidate[],
  pool: readonly ParlaySourcePrediction[],
  take: number,
): ParlayCandidate[] {
  return candidates
    .filter((candidate) => !candidate.blockers.length)
    .sort((a, b) => marketDiversityScore(b, pool) - marketDiversityScore(a, pool) || b.expectedEdge - a.expectedEdge)
    .slice(0, take);
}

function marketDiversityScore(candidate: ParlayCandidate, pool: readonly ParlaySourcePrediction[]): number {
  const legs = candidate.legs.flatMap((id) => {
    const prediction = pool.find((item) => item.id === id);
    return prediction ? [prediction] : [];
  });
  const markets = new Set(legs.map((prediction) => prediction.market));
  const families = new Set(legs.map((prediction) => marketFamily(prediction.market)));
  return markets.size + families.size * 0.5 + candidate.diversityScore;
}

function uniqueCandidates(candidates: ParlayCandidate[]): ParlayCandidate[] {
  const seen = new Set<string>();
  const result: ParlayCandidate[] = [];
  for (const candidate of candidates) {
    const signature = candidate.legs.slice().sort().join('|');
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    result.push(candidate);
  }
  return result;
}

function selectCandidatesWithExposureCap(
  candidates: readonly ParlayCandidate[],
  pool: readonly ParlaySourcePrediction[],
  take: number,
): ParlayCandidate[] {
  const byId = new Map(pool.map((prediction) => [prediction.id, prediction]));
  const usedPredictions = new Set<string>();
  const usedFixtures = new Set<string>();
  const selected: ParlayCandidate[] = [];
  for (const candidate of candidates) {
    const legs = candidate.legs.flatMap((id) => {
      const prediction = byId.get(id);
      return prediction ? [prediction] : [];
    });
    if (legs.some((prediction) => usedPredictions.has(prediction.id) || usedFixtures.has(prediction.fixtureId))) {
      continue;
    }
    selected.push(candidate);
    for (const prediction of legs) {
      usedPredictions.add(prediction.id);
      usedFixtures.add(prediction.fixtureId);
    }
    if (selected.length >= take) break;
  }
  return selected;
}

function candidateMetricForBuild(
  build: BuildParlayResult,
  candidates: readonly ParlayCandidate[],
  key: 'expectedEdge' | 'correlationPenalty',
): number | undefined {
  const signature = build.parlay.legs.map((leg) => leg.predictionId).sort().join('|');
  const candidate = candidates.find((item) => item.legs.slice().sort().join('|') === signature);
  return candidate ? round(candidate[key]) : undefined;
}

function defaultPersistParlay(repositories: ParlayServiceRepositories) {
  return async (input: { parlay: ParlayInput; legs: Array<Omit<ParlayLegInput, 'parlayId'>> }) => {
    if (!repositories.parlays) throw new Error('Parlay repository is unavailable.');
    return repositories.parlays.createWithLegs(input);
  };
}

function buildPortfolioProfilePrompt(input: {
  portfolioId: string;
  sourceRunId: string;
  date: string;
  generatedAt: string;
  profile: ParlayPortfolioProfileSpec;
  predictions: ParlaySourcePrediction[];
}): string {
  const compactPredictions = input.predictions.map((prediction) => ({
    id: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    impliedProbability: prediction.impliedProbability ?? null,
    estimatedProbability: prediction.estimatedProbability ?? null,
    edge: prediction.edge ?? null,
    confidence: prediction.confidence,
    quality: prediction.quality,
    status: prediction.status,
    warnings: prediction.warnings ?? [],
    riskTags: prediction.riskTags ?? [],
    riskScore: prediction.riskScore ?? 0,
    rationale: prediction.rationale ? truncateText(prediction.rationale, 220) : undefined,
  }));

  return [
    `System prompt - ${input.profile.label} (${input.profile.key})`,
    'You create analytical soccer parlay portfolios from already-scored atomic predictions.',
    'Precision mode: generate fewer, cleaner parlays instead of forcing volume.',
    'Return JSON only. Do not include Markdown or commentary outside JSON.',
    'Use only prediction ids from the provided pool.',
    `Create up to ${input.profile.targetParlays} parlays for this profile.`,
    `Each parlay must contain ${input.profile.minLegs}-${input.profile.maxLegs} legs.`,
    `Target combined decimal odds: ${input.profile.minOdds}-${input.profile.maxOdds}. Parlays outside this range will be rejected.`,
    `Minimum leg confidence for this profile: ${input.profile.minConfidence}.`,
    input.profile.reviewOnly
      ? 'Review profile: weaker legs are allowed only as review-required analytical output.'
      : 'Strict profile: preserve promotable/candidate status only when validation allows it.',
    input.profile.allowDrawExposure
      ? 'Draw exposure is allowed only with a specific risk note explaining why it remains review-required.'
      : 'Do not use legs tagged negative_edge or draw_exposure.',
    input.profile.allowDrawExposure ? 'Do not use legs tagged negative_edge.' : undefined,
    'Do not use fragile_low_total_over when it is also low_edge.',
    'Do not use fragile_low_price_dc when it is also low_edge.',
    `Use at most ${input.profile.maxReviewOrWarningLegs} leg(s) tagged review_required or research_warning per parlay.`,
    'Prefer 2-3 independent conservative legs over higher combined odds.',
    'Each rationale must explain why every selected leg survives its main risk tag.',
    'Prefer diversity across fixtures, leagues and market types when quality is similar.',
    'Use predictionIds only. Do not use fixtureId, team id, odds quote id, or any other id in predictionIds.',
    'A fixture may appear more than once in the same parlay only when duplicateFixtureJustification is specific and non-empty.',
    'The artifact is analytical only and has no monetary action capability.',
    '',
    'JSON schema:',
    JSON.stringify({
      parlays: [
        {
          title: 'short descriptive title',
          predictionIds: ['prediction-id-1', 'prediction-id-2'],
          rationale: 'why these legs work together',
          riskNotes: ['short risk note'],
          duplicateFixtureJustification: 'required only when one fixture appears more than once',
        },
      ],
      noParlayReason: 'optional short reason when no parlay should be generated',
    }),
    '',
    'Context:',
    JSON.stringify({
      portfolioId: input.portfolioId,
      sourceRunId: input.sourceRunId,
      date: input.date,
      generatedAt: input.generatedAt,
      promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
      minConfidence: input.profile.minConfidence,
      profile: input.profile,
      predictionPool: compactPredictions,
    }),
  ].filter((line): line is string => typeof line === 'string').join('\n');
}

async function runParlayPortfolioAgent(
  agentRunner: typeof runAgentWithRetry,
  config: AgentConfig,
  prompt: string,
  options: { runtime: RuntimeContext },
): Promise<{ text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARLAY_PORTFOLIO_AGENT_TIMEOUT_MS);
  try {
    return await agentRunner(config, prompt, {
      runtime: options.runtime,
      signal: controller.signal,
      maxRetries: 1,
      outputSchemaPath: PARLAY_PORTFOLIO_SCHEMA_PATH,
      useStdinPrompt: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parsePortfolioAgentOutput(text: string): ParsedPortfolioOutput {
  const parsed = parseJsonObject(text);
  const parlays = Array.isArray(parsed?.parlays) ? parsed.parlays : [];
  return {
    noParlayReason: typeof parsed?.noParlayReason === 'string' ? parsed.noParlayReason : undefined,
    parlays: parlays.map((item: any) => ({
      title: typeof item?.title === 'string' ? item.title : undefined,
      predictionIds: Array.isArray(item?.predictionIds) ? item.predictionIds.map(String).filter(Boolean) : [],
      rationale: typeof item?.rationale === 'string' ? item.rationale : '',
      riskNotes: Array.isArray(item?.riskNotes) ? item.riskNotes.map(String).filter(Boolean) : undefined,
      duplicateFixtureJustification: typeof item?.duplicateFixtureJustification === 'string'
        ? item.duplicateFixtureJustification
        : undefined,
    })),
  };
}

function parseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try { return JSON.parse(fenced); } catch { /* fall through */ }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
  }
  throw new Error(`invalid-json: portfolio agent output was not valid JSON (${truncateText(text, 160) || 'empty output'})`);
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateParsedPortfolioParlay(
  parsed: ParsedPortfolioParlay,
  profile: ParlayPortfolioProfileSpec,
  poolById: Map<string, ParlaySourcePrediction>,
  usedSignatures: Set<string>,
  generatedAt: string,
  sourceRunId: string,
): PortfolioValidationResult {
  const reasons: string[] = [];
  const uniquePredictionIds = [...new Set(parsed.predictionIds)];
  if (uniquePredictionIds.length !== parsed.predictionIds.length) {
    reasons.push('duplicate prediction id in same parlay');
  }
  if (uniquePredictionIds.length < profile.minLegs || uniquePredictionIds.length > profile.maxLegs) {
    reasons.push(`selected ${uniquePredictionIds.length} legs, expected ${profile.minLegs}-${profile.maxLegs}`);
  }

  const predictions = uniquePredictionIds.map((id) => poolById.get(id));
  for (const [index, prediction] of predictions.entries()) {
    if (!prediction) reasons.push(`unknown prediction id: ${uniquePredictionIds[index]}`);
    else if (prediction.confidence < profile.minConfidence) reasons.push(`prediction below ${profile.label} confidence floor: ${prediction.id}`);
  }
  if (!parsed.rationale.trim()) reasons.push('missing rationale');

  const signature = uniquePredictionIds.slice().sort().join('|');
  if (usedSignatures.has(signature)) reasons.push('duplicate parlay composition');
  if (reasons.length) return { ok: false, reasons };

  const selected = predictions.filter((prediction): prediction is ParlaySourcePrediction => Boolean(prediction));
  const riskRejections = validatePortfolioRisk(selected, profile);
  reasons.push(...riskRejections);
  if (reasons.length) return { ok: false, reasons };

  const fixtureCounts = new Map<string, number>();
  for (const prediction of selected) fixtureCounts.set(prediction.fixtureId, (fixtureCounts.get(prediction.fixtureId) ?? 0) + 1);
  const duplicateFixtures = [...fixtureCounts.entries()].filter(([, count]) => count > 1).map(([fixtureId]) => fixtureId);
  const duplicateJustification = parsed.duplicateFixtureJustification?.trim();
  if (duplicateFixtures.length && !duplicateJustification) {
    return { ok: false, reasons: [`duplicate fixture without justification: ${duplicateFixtures.join(', ')}`] };
  }

  const parlayId = randomUUID();
  const legs: ParlayLeg[] = selected.map((prediction, index) => ({
    parlayId,
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line,
    odds: prediction.odds,
    status: prediction.status,
    index,
    inclusionReason: duplicateFixtures.includes(prediction.fixtureId)
      ? 'included-with-duplicate-fixture-override'
      : 'included-eligible-prediction',
  }));
  const combinedOdds = calculateCombinedOdds(legs);
  const aggregateConfidence = calculateAggregateConfidence(selected);
  if (combinedOdds !== undefined && (combinedOdds < profile.minOdds || combinedOdds > profile.maxOdds)) {
    return {
      ok: false,
      reasons: [`combined odds ${round(combinedOdds)} outside ${profile.label} target ${profile.minOdds}-${profile.maxOdds}`],
    };
  }
  const minAggregateConfidence = profile.key === 'conservative'
    ? CONSERVATIVE_MIN_AGGREGATE_CONFIDENCE
    : profile.key === 'balanced'
      ? BALANCED_MIN_AGGREGATE_CONFIDENCE
      : 0;
  if (aggregateConfidence < minAggregateConfidence) {
    return {
      ok: false,
      reasons: [`aggregate confidence ${round(aggregateConfidence)} below ${profile.label} floor ${minAggregateConfidence}`],
    };
  }
  const constraintWarnings = [
    ...(duplicateFixtures.length ? [`duplicate fixture override: ${duplicateJustification}`] : []),
  ].filter(Boolean);
  const warnings = [
    ...constraintWarnings,
    ...(parsed.riskNotes ?? []),
  ].filter(Boolean);
  const status: PredictionStatus = constraintWarnings.length || profile.reviewOnly || selected.some((prediction) => prediction.status === 'review-required')
    ? 'review-required'
    : selected.some((prediction) => prediction.status === 'candidate')
      ? 'candidate'
      : 'promotable';
  const evaluations: ParlayPredictionEvaluation[] = selected.map((prediction) => ({
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    includedReasons: [
      duplicateFixtures.includes(prediction.fixtureId)
        ? 'included-with-duplicate-fixture-override'
        : 'included-eligible-prediction',
    ],
    excludedReasons: [],
    eligible: true,
  }));
  const config: ResolvedParlayConfig = {
    minLegs: profile.minLegs,
    maxLegs: profile.maxLegs,
    allowMultipleLegsPerFixture: Boolean(duplicateFixtures.length),
    minPredictionConfidence: profile.minConfidence,
    maxCombinedOdds: profile.maxOdds,
  };
  const rationaleParts = [
    parsed.title ? `${parsed.title}: ${parsed.rationale.trim()}` : parsed.rationale.trim(),
    `Profile ${profile.label}; target odds ${profile.minOdds}-${profile.maxOdds}.`,
  ];
  const parlay: Parlay = {
    id: parlayId,
    sourceRunId,
    legs,
    combinedOdds: combinedOdds === undefined ? undefined : round(combinedOdds),
    aggregateConfidence: round(aggregateConfidence),
    aggregateQuality: round(calculateAggregateQuality(selected)),
    rationale: rationaleParts.join(' '),
    warnings,
    status,
    generatedAt,
  };

  return {
    ok: true,
    profile: profile.key,
    signature,
    build: {
      parlay,
      evaluations,
      config,
    },
  };
}

function generateDeterministicPortfolioFills(input: {
  profile: ParlayPortfolioProfileSpec;
  pool: readonly ParlaySourcePrediction[];
  usedSignatures: Set<string>;
  generatedAt: string;
  sourceRunId: string;
  needed: number;
}): Array<Extract<PortfolioValidationResult, { ok: true }>> {
  if (input.needed <= 0) return [];
  const combinations: ParlaySourcePrediction[][] = [];
  const sortedPool = [...input.pool].sort(comparePortfolioPredictions);
  for (let size = input.profile.minLegs; size <= input.profile.maxLegs; size++) {
    collectCombinations(sortedPool, size, 0, [], combinations, 500);
  }
  const validations = combinations
    .sort((a, b) => scorePortfolioCombination(b) - scorePortfolioCombination(a))
    .map((combination) => validateParsedPortfolioParlay({
      title: `Deterministic ${input.profile.label}`,
      predictionIds: combination.map((prediction) => prediction.id),
      rationale: 'Deterministic fallback selected independent high-confidence, positive-edge legs inside the profile odds range.',
    }, input.profile, new Map(input.pool.map((prediction) => [prediction.id, prediction])), input.usedSignatures, input.generatedAt, input.sourceRunId))
    .filter((validation): validation is Extract<PortfolioValidationResult, { ok: true }> => validation.ok);
  return selectPortfolioBuildsWithExposureCap(validations, input.needed);
}

function selectPortfolioBuildsWithExposureCap(
  validations: readonly Extract<PortfolioValidationResult, { ok: true }>[],
  take: number,
): Array<Extract<PortfolioValidationResult, { ok: true }>> {
  const selected: Array<Extract<PortfolioValidationResult, { ok: true }>> = [];
  const usedPredictions = new Set<string>();
  const usedFixtures = new Set<string>();
  for (const validation of validations) {
    const legs = validation.build.parlay.legs;
    if (legs.some((leg) => usedPredictions.has(leg.predictionId) || usedFixtures.has(leg.fixtureId))) {
      continue;
    }
    selected.push(validation);
    for (const leg of legs) {
      usedPredictions.add(leg.predictionId);
      usedFixtures.add(leg.fixtureId);
    }
    if (selected.length >= take) break;
  }
  return selected;
}

function shouldGenerateDeterministicPortfolioFills(input: {
  profile: ParlayPortfolioProfileSpec;
  priorBuilds: number;
  outputWarnings: readonly string[];
  outputNoParlayReason?: string;
  pool: readonly ParlaySourcePrediction[];
}): boolean {
  if (!input.profile.reviewOnly) return true;
  if (input.priorBuilds > 0) return false;
  if (!input.outputNoParlayReason) return false;
  if (input.outputWarnings.some((warning) => /prompt failed/i.test(warning))) return false;
  return input.pool.some((prediction) => hasHardResearchWarning(prediction));
}

function collectCombinations(
  pool: readonly ParlaySourcePrediction[],
  size: number,
  start: number,
  current: ParlaySourcePrediction[],
  output: ParlaySourcePrediction[][],
  limit: number,
): void {
  if (output.length >= limit) return;
  if (current.length === size) {
    output.push([...current]);
    return;
  }
  for (let index = start; index < pool.length; index++) {
    current.push(pool[index]);
    collectCombinations(pool, size, index + 1, current, output, limit);
    current.pop();
    if (output.length >= limit) return;
  }
}

function comparePortfolioPredictions(a: ParlaySourcePrediction, b: ParlaySourcePrediction): number {
  return b.confidence - a.confidence
    || (b.edge ?? -1) - (a.edge ?? -1)
    || qualityRank(b.quality) - qualityRank(a.quality)
    || a.odds - b.odds
    || a.id.localeCompare(b.id);
}

function scorePortfolioCombination(predictions: readonly ParlaySourcePrediction[]): number {
  const aggregateConfidence = calculateAggregateConfidence(predictions);
  const avgEdge = predictions.reduce((sum, prediction) => sum + Math.max(0, prediction.edge ?? 0), 0) / predictions.length;
  const avgQuality = calculateAggregateQuality(predictions);
  const combinedOdds = calculateCombinedOdds(predictions) ?? 1;
  const lowPricePenalty = predictions.filter((prediction) => prediction.odds < 1.15).length * 0.05;
  return aggregateConfidence + avgEdge + avgQuality * 0.1 + Math.min(combinedOdds, 3.5) * 0.01 - lowPricePenalty;
}

function qualityRank(quality: PredictionQuality): number {
  if (quality === 'high') return 3;
  if (quality === 'medium') return 2;
  return 1;
}

function validatePortfolioRisk(
  selected: readonly ParlaySourcePrediction[],
  profile: ParlayPortfolioProfileSpec,
): string[] {
  const reasons: string[] = [];
  const reviewOrWarningCount = selected.filter((prediction) =>
    hasRiskTag(prediction, 'review_required') || hasRiskTag(prediction, 'research_warning'),
  ).length;

  for (const prediction of selected) {
    if (hasRiskTag(prediction, 'negative_edge')) {
      reasons.push(`prediction has negative edge: ${prediction.id}`);
    }
    if (hasRiskTag(prediction, 'draw_exposure') && !profile.allowDrawExposure) {
      reasons.push(`prediction has draw exposure: ${prediction.id}`);
    }
    if (hasRiskTag(prediction, 'fragile_low_total_over') && hasRiskTag(prediction, 'low_edge')) {
      reasons.push(`fragile low total over with low edge: ${prediction.id}`);
    }
    if (hasRiskTag(prediction, 'fragile_low_price_dc') && hasRiskTag(prediction, 'low_edge')) {
      reasons.push(`fragile low-price double chance with low edge: ${prediction.id}`);
    }
  }

  if (reviewOrWarningCount > profile.maxReviewOrWarningLegs) {
    reasons.push(`too many review-required or warning legs for ${profile.label}: ${reviewOrWarningCount}`);
  }

  return [...new Set(reasons)];
}

function gateFromPortfolio(portfolio: ParlayPortfolio): ParlayGateResult {
  if (!portfolio.parlays.length) {
    const diagnostics = [...new Set([
      ...portfolio.profiles.flatMap((profile) => profile.warnings),
      ...portfolio.rejected.flatMap((rejection) => rejection.reasons.map((reason) => `${rejection.profile}[${rejection.index}]: ${reason}`)),
    ])];
    return {
      verdict: 'blocked',
      reasons: diagnostics.length
        ? ['no valid analytical parlays generated', ...diagnostics]
        : ['no valid analytical parlays generated'],
      warnings: diagnostics,
    };
  }
  const warnings = [...new Set([
    ...portfolio.profiles.flatMap((profile) => profile.warnings),
    ...portfolio.parlays.flatMap((entry) => entry.build.parlay.warnings),
    ...portfolio.rejected.flatMap((rejection) => rejection.reasons.map((reason) => `${rejection.profile}[${rejection.index}]: ${reason}`)),
  ])];
  const verdict: PredictionStatus = portfolio.parlays.some((entry) => entry.build.parlay.status === 'review-required') || portfolio.rejected.length
    ? 'review-required'
    : portfolio.parlays.some((entry) => entry.build.parlay.status === 'candidate')
      ? 'candidate'
      : 'promotable';

  return {
    verdict,
    reasons: [`generated ${portfolio.parlays.length} analytical parlays across ${portfolio.profiles.length} profile(s)`],
    warnings,
  };
}

function portfolioArtifactPayloadFor(
  runId: string,
  date: string,
  generatedAt: string,
  portfolio: ParlayPortfolio,
  gateResult: ParlayGateResult,
): Record<string, unknown> {
  return {
    runId,
    date,
    generatedAt,
    parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    promptVersion: portfolio.promptVersion,
    analyticalArtifactOnly: true,
    qualityVerdict: gateResult.verdict,
    executionCapability: 'none',
    notice: 'This portfolio is an analytical artifact only; it has no monetary action capability.',
    gateResult,
    portfolio: {
      ...portfolio,
      parlays: portfolio.parlays.map((entry) => ({
        profile: entry.profile,
        ...entry.build,
      })),
    },
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
    impliedProbability: numberOrUndefined(prediction.impliedProbability),
    estimatedProbability: numberOrUndefined(prediction.estimatedProbability),
    edge: numberOrUndefined(prediction.edge),
    blockers: metadataStringArray(prediction.metadata, 'blockers'),
    marketFairProbability: metadataNumber(prediction.metadata, 'marketFairProbability'),
    parlayEligible: metadataBool(prediction.metadata, 'parlayEligible'),
    confidence: numberValue(prediction.confidence),
    quality: qualityValue(prediction.quality),
    status: prediction.status as PredictionStatus,
    rationale: prediction.rationaleRedacted,
    warnings: jsonStringArray(prediction.warnings),
  };
}

function metadataStringArray(metadata: unknown, key: string): string[] | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function metadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;
}

function metadataBool(metadata: unknown, key: string): boolean | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function toParlayInput(
  build: BuildParlayResult,
  runId: string,
  artifactId: string | null,
  date: string,
  metadataExtra: Record<string, unknown> = {},
): ParlayInput {
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
      qualityVerdict: build.parlay.status,
      executionCapability: 'none',
      ...metadataExtra,
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
    reasons: build.parlay.status === 'blocked' ? ['handoff.parlay = no-parlay-today', ...reasons] : reasons,
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
  const parlay = {
    ...build.parlay,
    warnings: [...build.parlay.warnings],
    legs: build.parlay.legs.map((leg) => ({ ...leg })),
  };
  return {
    runId,
    date,
    generatedAt,
    parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    analyticalArtifactOnly: true,
    qualityVerdict: gateResult.verdict,
    executionCapability: 'none',
    handoff: {
      parlay: build.parlay.status === 'blocked' ? 'no-parlay-today' : 'analytical-candidate',
      disclaimer: 'uso analitico, no constituye recomendacion de apuesta, no garantiza resultado',
    },
    notice: 'This parlay candidate is an analytical artifact only; it cannot execute wagers or monetary actions.',
    config: build.config,
    gateResult: {
      ...gateResult,
      reasons: [...gateResult.reasons],
      warnings: [...gateResult.warnings],
    },
    parlay,
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

function jsonStringArray(value: JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}
