import { createHash } from 'node:crypto';
import type { AgentConfig } from '../config.js';
import { discoverFixtures, type FixtureDiscoveryResult } from '../filters/engine.js';
import { lowOddsScanProviderConfig } from '../filters/low-odds.js';
import { normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import type { Fixture } from '../domain/fixtures.js';
import { getApiFootballDateOddsSlate, getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { selectDefaultModelForProvider } from '../providers/agentic/helpers.js';
import type { AgentProvider } from '../providers/agentic/types.js';
import { runDailyMetrics, type DailyMetricsRunResult } from '../metrics/daily.js';
import { runParlayAnalysis, type ParlayAnalysisRecommendation, type ParlayAnalysisRunResult } from '../parlay/analysis.js';
import { runParlayBuild, type ParlayBuildRunResult, type RunParlayBuildInput } from '../parlay/service.js';
import type { PredictionRecordView } from '../prediction/types.js';
import type { ResearchWebMode } from '../prediction/prompts.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';
import { getPrismaClient } from '../storage/db.js';
import type { JsonValue, StoragePrismaClient } from '../storage/types.js';
import { createRunArtifactDir, writeArtifact, writeRunJson } from '../runtime/artifacts.js';
import { updateRuntimeContext, type RuntimeContext } from '../runtime/context.js';
import { runPipeline, type RunPipelineResult } from '../runtime/run-service.js';
import type { PipelineValidationMode, RunPipelineDependencies, RunPipelineInput } from '../runtime/pipeline.js';
import { buildDailyProviderComparison, type DailyProviderComparison, type DailyProviderConsensus } from './comparison.js';

export type DailyE2EProvider = Extract<AgentProvider, 'codex' | 'gemini'>;

export type DailyParlayProfile =
  | 'safe-consensus'
  | 'balanced'
  | 'aggressive-analytical'
  | 'low-variance'
  | 'high-conviction'
  | 'market-diverse'
  | 'parlay-oro'
  | 'parlay-diamante'
  | 'portfolio-v2';

export interface RunDailyE2EInput {
  date: string;
  providers?: DailyE2EProvider[];
  providerConcurrency?: number;
  models?: Partial<Record<DailyE2EProvider, string>>;
  web?: ResearchWebMode;
  validate?: PipelineValidationMode;
  markets?: MarketKey[];
  maxFixtures?: number;
  threshold?: number;
  parlayProfile?: DailyParlayProfile;
  persistMetrics?: boolean;
  dailyBatchId?: string;
}

export interface DailyProviderRunResult {
  provider: DailyE2EProvider;
  model: string;
  runId?: string;
  ok: boolean;
  verdict?: string;
  artifactPath?: string;
  error?: string;
}

type DailyProviderProgressStatus = 'queued' | 'running' | 'completed' | 'blocked';

interface DailyProviderProgress {
  provider: DailyE2EProvider;
  model: string;
  status: DailyProviderProgressStatus;
  phase: string;
  runId?: string | null;
  verdict?: string | null;
  predictions: number;
  promotable: number;
  updatedAt: string;
  error?: string;
}

interface DailyProgressSnapshot {
  batchId: string;
  date: string;
  status: 'running' | 'succeeded' | 'failed';
  phase: string;
  providerConcurrency: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  providers: Partial<Record<DailyE2EProvider, DailyProviderProgress>>;
}

export interface DailyParlayFamilyResult {
  family: 'codex-only' | 'gemini-only' | 'consensus-mixed';
  profile?: string | null;
  runId?: string;
  sourceRunIds: string[];
  ok: boolean;
  verdict?: string;
  artifactPath?: string;
  persistedParlayIds?: string[];
  error?: string;
}

export interface DailyE2ERunResult {
  ok: boolean;
  dailyBatchId: string;
  date: string;
  providers: DailyProviderRunResult[];
  parlays: DailyParlayFamilyResult[];
  recommendations: {
    total: number;
    parlays: number;
    atomic: number;
  };
  providerComparison?: DailyProviderComparison;
  providerConsensus?: DailyProviderConsensus;
  parlayAnalysis?: ParlayAnalysisRunResult;
  metrics?: DailyMetricsRunResult;
  artifactDir: string;
  summaryPath: string;
  reportPath: string;
  error?: string;
}

export interface DailyE2EDependencies {
  runPipeline?: (
    config: AgentConfig,
    input: RunPipelineInput,
    runtime: RuntimeContext,
    deps?: RunPipelineDependencies,
  ) => Promise<RunPipelineResult>;
  buildParlay?: typeof runParlayBuild;
  analyzeParlays?: typeof runParlayAnalysis;
  buildDailyMetrics?: typeof runDailyMetrics;
  repositories?: ReturnType<typeof createStorageRepositories>;
  sharedPipelineDeps?: RunPipelineDependencies;
  now?: () => Date;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  writeRunJson?: (config: Pick<AgentConfig, 'artifactRoot'>, runId: string, run: unknown) => string;
}

const DEFAULT_DAILY_PROVIDERS: DailyE2EProvider[] = ['codex', 'gemini'];
const DAILY_PARLAY_RECOMMENDATION_LIMIT = 4;
const DAILY_PARLAY_ANALYSIS_TOP = 12;
const DAILY_FALLBACK_PARLAY_LIMIT = 3;
const DAILY_FALLBACK_PARLAY_LEGS = 2;
const DAILY_PARLAY_CONSERVATIVE_MAX_ODDS = 2.2;
const DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE = 0.7;
const DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE = 0.78;
const DAILY_ATOMIC_RECOMMENDATION_LIMIT = 10;
const ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR = 0.9;
const ATOMIC_RECOMMENDATION_EDGE_FLOOR = 0;
const ATOMIC_RECOMMENDATION_PROFILE = 'atomic-high-confidence';
const DAILY_STAKE_BUCKETS = [1, 5, 10, 15, 20, 25] as const;
const VALIDATION_FRESHNESS_MIN_COVERAGE = 0.6;
const VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE = 0.25;
const DAILY_FINAL_PARLAY_ALLOWED_PROFILES = ['parlay-diamante', 'low-odds-top', 'low-variance'] as const;
const DAILY_FINAL_PARLAY_BLOCKED_PROFILES = ['balanced', 'high-conviction', 'market-diverse', 'parlay-oro', 'default', 'review', 'totals', 'aggressive'] as const;
const DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS = [
  'high-combined-odds',
  'stale-source',
  'corners-unverified',
  'negative-portfolio-edge',
  'duplicate-leg-set',
  'historically-weak-profile',
  'low-liquidity-h2h-favorite',
] as const;
const DAILY_FINAL_DEMOTED_MODELS = ['gpt-5.4-mini'] as const;
const ATOMIC_BLOCKED_RISK_FLAGS = [
  'stale-source',
  'corners-market',
  'corners-unverified',
  'low-liquidity-h2h-favorite',
  'low-liquidity',
  'lineup-pending',
  'selection-evidence-missing',
  'h2h-away',
  'inflated-double-chance-edge',
  'overinflated-edge',
] as const;

export type DailyRecommendationSelectionMode = 'promotion-gate' | 'analytical-fallback';

interface DailyRecommendationSelectionMetadata {
  selectionMode?: DailyRecommendationSelectionMode;
  fallbackReasons?: string[];
  sourceRunIds?: string[];
}

export type DailyFinalRecommendation =
  | (ParlayAnalysisRecommendation & DailyRecommendationSelectionMetadata & { kind: 'parlay'; stakeRecommendation?: DailyStakeRecommendation })
  | (AtomicPredictionRecommendation & DailyRecommendationSelectionMetadata);

export interface DailyStakeRecommendation {
  stake: number;
  percentOfBankroll: number;
  unitLabel: 'percent-of-bankroll';
  allowedStakes: readonly number[];
  policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation';
}

interface DailyValidationFreshness {
  status: 'fresh' | 'thin' | 'empty';
  date: string;
  minCoverage: number;
  maxUnresolvedRate: number;
  predictionCoverage: number | null;
  parlayCoverage: number | null;
  predictionUnresolvedRate: number | null;
  parlayUnresolvedRate: number | null;
  predictionSettled: number;
  parlaySettled: number;
  predictionTotal: number;
  parlayTotal: number;
  predictionUnvalidated: number;
  parlayUnvalidated: number;
  predictionPending: number;
  parlayPending: number;
  reasons: string[];
}

export interface AtomicPredictionRecommendation {
  kind: 'atomic-prediction';
  rank: number;
  parlayId: string;
  predictionId: string;
  predictionIds: string[];
  sourceRunId: string | null;
  sourceRunIds: string[];
  provider: DailyE2EProvider;
  providers: DailyE2EProvider[];
  model: string;
  profile: typeof ATOMIC_RECOMMENDATION_PROFILE;
  validationStatus: 'unvalidated';
  harnessStatus: string;
  combinedOdds: number;
  aggregateConfidence: number;
  adjustedProbability: number;
  expectedEdge: number;
  score: number;
  exposure: {
    units: number;
    percentOfAnalyticalBankroll: number;
    policy: 'single-selection-analytical-watchlist';
  };
  stakeRecommendation?: DailyStakeRecommendation;
  bankerLegs: ParlayAnalysisRecommendation['bankerLegs'];
  reasons: string[];
  riskFlags: string[];
  legs: ParlayAnalysisRecommendation['legs'];
  selectionMode?: DailyRecommendationSelectionMode;
  fallbackReasons?: string[];
}

export async function runDailyE2E(
  config: AgentConfig,
  input: RunDailyE2EInput,
  runtime: RuntimeContext,
  deps: DailyE2EDependencies = {},
): Promise<DailyE2ERunResult> {
  validateDailyInput(input);
  const startedAt = (deps.now ?? (() => new Date()))();
  const providers = normalizeProviders(input.providers);
  const dailyBatchId = input.dailyBatchId ?? `daily-${input.date}`;
  const effectiveConfig = withDailyOverrides(config, input);
  const artifactDir = createRunArtifactDir(effectiveConfig, dailyBatchId);
  const writeJsonArtifact = deps.writeArtifact ?? ((runId, name, payload) => writeArtifact(effectiveConfig, runId, name, payload));
  const writeRun = deps.writeRunJson ?? writeRunJson;
  const repositories = deps.repositories ?? defaultRepositories(effectiveConfig);
  const sharedDeps = deps.sharedPipelineDeps ?? createSharedPipelineDeps(effectiveConfig, input);
  const runner = deps.runPipeline ?? runPipeline;
  const buildParlay = deps.buildParlay ?? runParlayBuild;
  const analyzeParlays = deps.analyzeParlays ?? runParlayAnalysis;
  const buildDailyMetrics = deps.buildDailyMetrics ?? runDailyMetrics;
  const providerConcurrency = normalizeProviderConcurrency(input.providerConcurrency, providers.length);
  const pairedProviders = providers;
  const providerAgentic = providers.join(',');
  const marketScope = normalizeMarketScope(input.markets, effectiveConfig.apiFootball.defaultMarkets);
  const progress = createDailyProgressSnapshot({
    dailyBatchId,
    date: input.date,
    startedAt,
    providers,
    providerConcurrency,
    config: effectiveConfig,
    models: input.models,
  });
  const writeProgress = (phase: string, status: DailyProgressSnapshot['status'] = 'running', completedAt?: Date) => {
    progress.phase = phase;
    progress.status = status;
    progress.updatedAt = (deps.now ?? (() => new Date()))().toISOString();
    if (completedAt) progress.completedAt = completedAt.toISOString();
    writeJsonArtifact(dailyBatchId, 'daily-progress.json', jsonValue(progress));
  };

  await repositories?.harnessRuns?.upsertForRun?.({
    id: dailyBatchId,
    runtime: effectiveConfig.runtime,
    profile: effectiveConfig.profile,
    providerSports: runtime.providerSports,
    providerAgentic,
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider, input.models)).join(','),
    status: 'running',
    verdict: null,
    artifactDir,
    startedAt,
    metadata: jsonValue({
      dailyBatchId,
      dailyRole: 'batch',
      date: input.date,
      pairedProviders,
      marketScope,
      analyticalArtifactOnly: true,
      executionCapability: 'none',
    }),
  }).catch(() => undefined);

  writeRun(effectiveConfig, dailyBatchId, {
    id: dailyBatchId,
    runtime: effectiveConfig.runtime,
    profile: effectiveConfig.profile,
    providerSports: runtime.providerSports,
    providerAgentic,
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider, input.models)).join(','),
    status: 'running',
    date: input.date,
    startedAt: startedAt.toISOString(),
    marketScope,
    metadata: {
      dailyBatchId,
      dailyRole: 'batch',
      pairedProviders,
      analyticalArtifactOnly: true,
      executionCapability: 'none',
    },
  });

  const providerRuns: DailyProviderRunResult[] = [];
  const providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>> = {};
  writeProgress(providers.length > 1 && providerConcurrency > 1 ? 'providers.parallel' : 'providers.serial');

  const providerSettled = await allSettledWithConcurrency(providers, providerConcurrency, async (provider) => {
    const previousProgress = progress.providers[provider] as DailyProviderProgress;
    progress.providers[provider] = {
      ...previousProgress,
      status: 'running',
      phase: 'pipeline',
      updatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    };
    writeProgress(`provider.${provider}.running`);
    const providerConfig = configForProvider(effectiveConfig, provider, input.models);
    const providerRuntime = childRuntime(runtime, providerConfig);
    const result = await runner(providerConfig, {
      date: input.date,
      web: input.web,
      validate: input.validate,
      markets: marketScope,
      metadata: {
        dailyBatchId,
        dailyRole: provider,
        providerAgentic: provider,
        pairedProviders,
      },
    }, providerRuntime, sharedDeps);
    progress.providers[provider] = progressFromProviderRun(provider, providerConfig.model, result, deps.now);
    writeProgress(`provider.${provider}.${result.ok ? 'completed' : 'blocked'}`);
    return {
      provider,
      model: providerConfig.model,
      result,
    };
  });

  for (const [index, item] of providerSettled.entries()) {
    const provider = providers[index] as DailyE2EProvider;
    if (item.status === 'fulfilled') {
      const { result, model } = item.value;
      providerPipelineResults[provider] = result;
      providerRuns.push({
        provider,
        model,
        runId: result.runId,
        ok: result.ok,
        verdict: result.verdict,
        artifactPath: result.artifactPath,
        error: result.error,
      });
      continue;
    }
    const model = modelForProvider(effectiveConfig, provider, input.models);
    const error = errorMessage(item.reason);
    const previousProgress = progress.providers[provider] as DailyProviderProgress;
    providerRuns.push({
      provider,
      model,
      ok: false,
      verdict: 'blocked',
      error,
    });
    progress.providers[provider] = {
      ...previousProgress,
      status: 'blocked',
      phase: 'failed',
      verdict: 'blocked',
      predictions: 0,
      promotable: 0,
      updatedAt: (deps.now ?? (() => new Date()))().toISOString(),
      error,
    };
    writeProgress(`provider.${provider}.blocked`);
  }

  const usableProviderRunIds = providerRuns
    .flatMap((run) => {
      if (!run.runId) return [];
      const result = providerPipelineResults[run.provider];
      return run.ok || (result && providerHasUsablePredictions(result)) ? [run.runId] : [];
    });
  const parlayProfiles = profilesToPortfolios(input.parlayProfile);
  const parlayFamilies: DailyParlayFamilyResult[] = [];

  for (const provider of providers) {
    const runId = providerPipelineResults[provider]?.runId;
    if (!runId || parlayProfiles.length === 0) {
      parlayFamilies.push({
        family: provider === 'codex' ? 'codex-only' : 'gemini-only',
        profile: null,
        runId,
        sourceRunIds: runId ? [runId] : [],
        ok: Boolean(providerPipelineResults[provider]?.parlay?.ok),
        verdict: providerPipelineResults[provider]?.parlay?.gateResult.verdict,
        artifactPath: providerPipelineResults[provider]?.parlay?.artifactPath,
        persistedParlayIds: providerPipelineResults[provider]?.parlay?.persistedParlayIds,
        error: providerPipelineResults[provider]?.parlay?.error,
      });
      continue;
    }
    for (const parlayProfile of parlayProfiles) {
      const parlayRunId = boundedDailyChildRunId(dailyBatchId, provider, parlayProfile);
      const providerConfig = configForProvider(effectiveConfig, provider, input.models);
      const parlayRuntime = childRuntime(runtime, providerConfig, parlayRunId);
      const result = await buildParlay(providerConfig, {
        date: input.date,
        sourceRunId: runId,
        portfolio: parlayProfile,
      }, parlayRuntime);
      parlayFamilies.push(toParlayFamily(provider === 'codex' ? 'codex-only' : 'gemini-only', [runId], result, parlayProfile));
    }
  }

  if (usableProviderRunIds.length >= 2) {
    for (const parlayProfile of (parlayProfiles.length ? parlayProfiles : [undefined])) {
      const mixedRunId = parlayProfile
        ? boundedDailyChildRunId(dailyBatchId, 'mixed', parlayProfile)
        : boundedDailyChildRunId(dailyBatchId, 'mixed');
      const mixedRuntime = childRuntime(runtime, effectiveConfig, mixedRunId);
      const mixed = await buildParlay(effectiveConfig, {
        date: input.date,
        sourceRunIds: usableProviderRunIds,
        ...(parlayProfile ? { portfolio: parlayProfile } : {}),
      } satisfies RunParlayBuildInput, mixedRuntime);
      parlayFamilies.push(toParlayFamily('consensus-mixed', usableProviderRunIds, mixed, parlayProfile ?? null));
    }
  } else {
    parlayFamilies.push({
      family: 'consensus-mixed',
      profile: null,
      sourceRunIds: usableProviderRunIds,
      ok: false,
      verdict: 'blocked',
      error: 'mixed parlays require usable Codex and Gemini source runs with predictions',
    });
  }

  const parlayAnalysisRunIds = uniqueStrings([
    ...usableProviderRunIds,
    ...parlayFamilies.map((family) => family.runId).filter((runId): runId is string => Boolean(runId)),
  ]);
  const analysisRuntime = childRuntime(runtime, effectiveConfig, boundedDailyChildRunId(dailyBatchId, 'recommendations'));
  const parlayAnalysis = parlayAnalysisRunIds.length
    ? await analyzeParlays(effectiveConfig, {
      date: input.date,
      runIds: parlayAnalysisRunIds,
      top: DAILY_PARLAY_ANALYSIS_TOP,
      profileScope: 'all',
    }, analysisRuntime)
    : undefined;

  const metricsRuntime = childRuntime(runtime, effectiveConfig, boundedDailyChildRunId(dailyBatchId, 'metrics'));
  const metrics = await buildDailyMetrics(effectiveConfig, {
    date: input.date,
    days: 1,
    scope: dailyBatchId,
    persist: input.persistMetrics !== false,
  }, metricsRuntime);
  const validationFreshness = dailyValidationFreshness(metrics, input.date);

  const completedAt = (deps.now ?? (() => new Date()))();
  const { comparison: providerComparison, consensus: providerConsensus } = buildDailyProviderComparison({
    dailyBatchId,
    date: input.date,
    providers: providers.map((provider) => ({
      provider,
      model: modelForProvider(effectiveConfig, provider, input.models),
      runId: providerPipelineResults[provider]?.runId,
      result: providerPipelineResults[provider],
    })),
  });
  let parlayRecommendations: DailyFinalRecommendation[] = selectDailyParlayRecommendations(
    parlayAnalysis?.top ?? [],
    DAILY_PARLAY_RECOMMENDATION_LIMIT,
  )
    .map((recommendation) => hydrateRecommendationDisplay({ ...recommendation, kind: 'parlay' as const }, providerPipelineResults));
  const strictParlayRecommendationCount = parlayRecommendations.length;
  if (!parlayRecommendations.length) {
    const analysisFallbackParlays = selectDailyFallbackParlayRecommendations(
      parlayAnalysis?.top ?? [],
      DAILY_PARLAY_RECOMMENDATION_LIMIT,
    )
      .map((recommendation) => hydrateRecommendationDisplay(recommendation, providerPipelineResults));
    parlayRecommendations = analysisFallbackParlays.length
      ? analysisFallbackParlays
      : buildFallbackParlayRecommendations(
        providerPipelineResults,
        providers,
        effectiveConfig,
        input.models,
        DAILY_FALLBACK_PARLAY_LIMIT,
      ).map((recommendation) => hydrateRecommendationDisplay(recommendation, providerPipelineResults));
  }
  const parlayLegPredictionIds = recommendationLegPredictionIds(parlayRecommendations);
  const parlayLegSelectionKeys = recommendationLegSelectionKeys(parlayRecommendations);
  const parlayLegFixtureIds = recommendationLegFixtureIds(parlayRecommendations);
  let atomicRecommendations = buildAtomicPredictionRecommendations(
    providerPipelineResults,
    providers,
    effectiveConfig,
    input.models,
    parlayRecommendations.length,
    parlayLegPredictionIds,
    parlayLegSelectionKeys,
    parlayLegFixtureIds,
  ).slice(0, DAILY_ATOMIC_RECOMMENDATION_LIMIT);
  const strictAtomicRecommendationCount = atomicRecommendations.length;
  if (!atomicRecommendations.length) {
    atomicRecommendations = buildFallbackAtomicPredictionRecommendations(
      providerPipelineResults,
      providers,
      effectiveConfig,
      input.models,
      parlayRecommendations.length,
      parlayLegPredictionIds,
      parlayLegSelectionKeys,
      parlayLegFixtureIds,
    ).slice(0, DAILY_ATOMIC_RECOMMENDATION_LIMIT);
  }
  const finalRecommendations: DailyFinalRecommendation[] = applyDailyStakeRecommendations(
    [...parlayRecommendations, ...atomicRecommendations],
  );
  const offDateLegs = recommendationLegsOutsideRequestedDate(
    finalRecommendations,
    input.date,
    effectiveConfig.apiFootball.timezone,
  );
  if (offDateLegs.length) {
    throw new Error(`daily recommendations include fixture legs outside requested date ${input.date}: ${offDateLegs.slice(0, 5).join('; ')}`);
  }
  const hasAnyValidParlayFamily = parlayFamilies.some((family) => family.ok);
  const hasConsensus = parlayFamilies.some((family) => family.family === 'consensus-mixed' && family.ok);
  const hasAnySuccessfulProvider = providerRuns.some((run) => run.ok);
  const allProvidersSucceeded = providerRuns.every((run) => run.ok);
  const validationFreshEnoughForPromotion = validationFreshness.status === 'fresh';
  const hasAnalyticalRecommendations = finalRecommendations.length > 0;
  const ok = hasAnySuccessfulProvider
    && (hasAnyValidParlayFamily || hasAnalyticalRecommendations)
    && (parlayAnalysis?.ok ?? false)
    && metrics.ok;
  const verdict = ok && hasConsensus && allProvidersSucceeded && validationFreshEnoughForPromotion
    ? 'promotable'
    : ok
      ? 'review-required'
      : !hasAnySuccessfulProvider
        ? 'blocked'
        : 'review-required';
  const providerCounts = Object.fromEntries(providerRuns.map((run) => [run.provider, {
    ok: run.ok,
    runId: run.runId ?? null,
    verdict: run.verdict ?? null,
    predictions: providerPipelineResults[run.provider]?.scoring.reduce((sum, item) => sum + item.predictions.length, 0) ?? 0,
    parlays: providerPipelineResults[run.provider]?.parlay?.persistedParlayIds?.length
      ?? (providerPipelineResults[run.provider]?.parlay?.persistedParlayId ? 1 : 0),
  }]));
  const parlayFamilyCounts = Object.fromEntries(parlayFamilies.map((family) => [parlayFamilyCountKey(family), {
    ok: family.ok,
    runId: family.runId ?? null,
    verdict: family.verdict ?? null,
    persistedParlays: family.persistedParlayIds?.length ?? 0,
  }]));
  const summary = {
    dailyBatchId,
    date: input.date,
    status: ok ? 'succeeded' : 'failed',
    verdict,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    providers: providerRuns,
    parlays: parlayFamilies,
    providerComparison: {
      summary: providerComparison.summary,
      providerSummaries: providerComparison.providerSummaries,
    },
    providerConsensus: providerConsensus.summary,
    parlayAnalysis: parlayAnalysis ? {
      runId: parlayAnalysis.runId,
      ok: parlayAnalysis.ok,
      analyzed: parlayAnalysis.analyzed,
      top: parlayAnalysis.top,
      diagnostics: parlayAnalysis.diagnostics,
      artifactPath: parlayAnalysis.artifactPath,
      error: parlayAnalysis.error,
    } : null,
    metrics: metrics ? {
      runId: metrics.runId,
      ok: metrics.ok,
      persisted: metrics.persisted,
      artifactPath: metrics.artifactPath,
      error: metrics.error,
    } : null,
    validationFreshness,
    sharedInputs: {
      pairedProviders,
      providerModels: Object.fromEntries(providers.map((provider) => [
        provider,
        modelForProvider(effectiveConfig, provider, input.models),
      ])),
      marketScope,
      web: input.web ?? effectiveConfig.nativeWebSearchMode,
      maxFixturesPerRun: effectiveConfig.apiFootball.maxFixturesPerRun,
      lowOddsThreshold: effectiveConfig.apiFootball.lowOddsThreshold,
      parlayProfile: input.parlayProfile ?? null,
      providerConcurrency,
    },
    counts: {
      providers: providerCounts,
      parlayFamilies: parlayFamilyCounts,
      recommendations: finalRecommendations.length,
      parlayRecommendations: parlayRecommendations.length,
      atomicRecommendations: atomicRecommendations.length,
      strictParlayRecommendations: strictParlayRecommendationCount,
      fallbackParlayRecommendations: Math.max(0, parlayRecommendations.length - strictParlayRecommendationCount),
      strictAtomicRecommendations: strictAtomicRecommendationCount,
      fallbackAtomicRecommendations: Math.max(0, atomicRecommendations.length - strictAtomicRecommendationCount),
      comparisonItems: providerComparison.items.length,
      consensusPredictions: providerConsensus.summary.consensusPredictions,
    },
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
  const providerComparisonPath = writeJsonArtifact(dailyBatchId, 'daily-provider-comparison.json', providerComparison);
  const providerConsensusPath = writeJsonArtifact(dailyBatchId, 'daily-provider-consensus.json', providerConsensus);
  const summaryPath = writeJsonArtifact(dailyBatchId, 'daily-e2e-summary.json', summary);
  const recommendationsPath = writeJsonArtifact(dailyBatchId, 'daily-parlay-recommendations.json', jsonValue({
    dailyBatchId,
    date: input.date,
    sourceRunIds: parlayAnalysisRunIds,
    recommendations: finalRecommendations,
    parlayRecommendations,
    atomicRecommendations,
    recommendationPolicy: {
      parlayRecommendationLimit: DAILY_PARLAY_RECOMMENDATION_LIMIT,
      parlayAnalysisTop: DAILY_PARLAY_ANALYSIS_TOP,
      atomicRecommendationLimit: DAILY_ATOMIC_RECOMMENDATION_LIMIT,
      fallbackRecommendations: {
        enabled: true,
        mode: 'analytical-fallback',
        parlayLimit: DAILY_FALLBACK_PARLAY_LIMIT,
        parlayLegs: DAILY_FALLBACK_PARLAY_LEGS,
        when: 'strict promotion gates select zero parlays or zero simples from available analytical candidates',
        harnessStatus: 'review-required',
        riskFlags: ['analytical-fallback', 'review-required'],
      },
      parlayDiversity: 'semantic leg signature plus first-pass unique profile, then score fill',
      parlayDiamanteOddsWindow: { min: 1.1, max: 1.3 },
      parlayConservativeGate: {
        maxCombinedOdds: DAILY_PARLAY_CONSERVATIVE_MAX_ODDS,
        minAggregateConfidence: DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE,
        diamanteMinAggregateConfidence: DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE,
        semanticDuplicateSignature: 'fixtureId:market:selection:line',
        allowedProfiles: DAILY_FINAL_PARLAY_ALLOWED_PROFILES,
        blockedProfiles: DAILY_FINAL_PARLAY_BLOCKED_PROFILES,
        blockedRiskFlags: DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS,
      },
      validationFreshness,
      atomicExcludesSelectedParlayLegs: true,
      atomicExcludesSelectedParlayFixtures: true,
      atomicMaxPerFixture: 1,
      demotedModels: DAILY_FINAL_DEMOTED_MODELS,
      stakeRecommendation: {
        unitLabel: 'percent-of-bankroll',
        allowedStakes: DAILY_STAKE_BUCKETS,
        totalRecommendedPercentOfBankroll: round(finalRecommendations.reduce((sum, item) => sum + (item.stakeRecommendation?.percentOfBankroll ?? 0), 0), 6),
        policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
      },
      atomicConfidenceFloor: ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR,
      atomicEdgeFloor: ATOMIC_RECOMMENDATION_EDGE_FLOOR,
      atomicStatuses: ['promotable'],
      atomicBlockedRiskFlags: ATOMIC_BLOCKED_RISK_FLAGS,
      atomicProfile: ATOMIC_RECOMMENDATION_PROFILE,
      portfolioBuckets: [
        'parlay-diamante',
        'single-top',
        'two-leg-safe',
        'three-leg-balanced',
        'four-leg-aggressive-analytical',
        'corners-watchlist',
        'corners-mixed',
      ],
    },
    diagnostics: parlayAnalysis?.diagnostics ?? null,
    providerComparisonPath,
    providerConsensusPath,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  }));
  const reportPath = writeJsonArtifact(dailyBatchId, 'daily-report.md', buildDailyReport(summary, recommendationsPath));
  writeProgress('completed', ok ? 'succeeded' : 'failed', completedAt);

  writeRun(effectiveConfig, dailyBatchId, {
    id: dailyBatchId,
    runtime: effectiveConfig.runtime,
    profile: effectiveConfig.profile,
    providerSports: runtime.providerSports,
    providerAgentic,
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider, input.models)).join(','),
    status: ok ? 'succeeded' : 'failed',
    verdict,
    date: input.date,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    artifactDir,
    marketScope,
    metadata: summary,
  });

  await repositories?.harnessRuns?.upsertForRun?.({
    id: dailyBatchId,
    runtime: effectiveConfig.runtime,
    profile: effectiveConfig.profile,
    providerSports: runtime.providerSports,
    providerAgentic,
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider, input.models)).join(','),
    status: ok ? 'succeeded' : 'failed',
    verdict,
    artifactDir,
    startedAt,
    completedAt,
    metadata: jsonValue(summary),
  }).catch(() => undefined);

  return {
    ok,
    dailyBatchId,
    date: input.date,
    providers: providerRuns,
    parlays: parlayFamilies,
    recommendations: {
      total: finalRecommendations.length,
      parlays: parlayRecommendations.length,
      atomic: atomicRecommendations.length,
    },
    providerComparison,
    providerConsensus,
    parlayAnalysis,
    metrics,
    artifactDir,
    summaryPath,
    reportPath,
    error: ok ? undefined : firstError(providerRuns, parlayFamilies, parlayAnalysis, metrics),
  };
}

export function createSharedPipelineDeps(config: AgentConfig, input: Pick<RunDailyE2EInput, 'date'>): RunPipelineDependencies {
  let primaryDiscovery: Promise<FixtureDiscoveryResult> | undefined;
  let lowOddsDiscovery: Promise<FixtureDiscoveryResult> | undefined;
  let lowOddsSlate: Promise<Awaited<ReturnType<typeof getApiFootballDateOddsSlate>>> | undefined;
  const oddsSnapshots = new Map<string, Promise<Awaited<ReturnType<typeof getApiFootballOddsSnapshot>>>>();

  return {
    discoverFixtures: async (runConfig, discoveryInput, runRuntime) => {
      if (discoveryInput.date === input.date && discoveryInput.leaguesDefault === true && discoveryInput.teamsDefault === true) {
        primaryDiscovery ??= discoverFixtures(configForSports(runConfig, config), discoveryInput, runRuntime);
        return primaryDiscovery;
      }
      return discoverFixtures(runConfig, discoveryInput, runRuntime);
    },
    discoverLowOddsFixtures: async (runConfig, discoveryInput, runRuntime) => {
      if (discoveryInput.date === input.date) {
        lowOddsDiscovery ??= discoverFixtures(configForSports(runConfig, config), discoveryInput, runRuntime);
        return lowOddsDiscovery;
      }
      return discoverFixtures(runConfig, discoveryInput, runRuntime);
    },
    fetchLowOddsSlate: async (runConfig, date, runRuntime, fixtures, markets) => {
      const sportsConfig = lowOddsScanProviderConfig(configForSports(runConfig, config));
      if (date === input.date && !fixtures?.length) {
        lowOddsSlate ??= getApiFootballDateOddsSlate(sportsConfig, date, runRuntime, fixtures, markets);
        return lowOddsSlate;
      }
      return getApiFootballDateOddsSlate(sportsConfig, date, runRuntime, fixtures, markets);
    },
    fetchOddsSnapshot: async (runConfig, fixtureId, runRuntime, markets) => {
      const key = oddsCacheKey(fixtureId, markets);
      let snapshot = oddsSnapshots.get(key);
      if (!snapshot) {
        snapshot = getApiFootballOddsSnapshot(configForSports(runConfig, config), fixtureId, runRuntime, markets);
        oddsSnapshots.set(key, snapshot);
      }
      return snapshot;
    },
    fetchLowOddsSnapshot: async (runConfig, fixtureId, runRuntime, markets) => {
      const key = oddsCacheKey(fixtureId, markets);
      let snapshot = oddsSnapshots.get(key) ?? findCompatibleOddsSnapshot(oddsSnapshots, fixtureId, markets);
      if (!snapshot) {
        snapshot = getApiFootballOddsSnapshot(lowOddsScanProviderConfig(configForSports(runConfig, config)), fixtureId, runRuntime, markets);
        oddsSnapshots.set(key, snapshot);
      } else {
        oddsSnapshots.set(key, snapshot);
      }
      return snapshot;
    },
  };
}

function findCompatibleOddsSnapshot(
  oddsSnapshots: Map<string, Promise<Awaited<ReturnType<typeof getApiFootballOddsSnapshot>>>>,
  fixtureId: string,
  markets: readonly MarketKey[] | undefined,
): Promise<Awaited<ReturnType<typeof getApiFootballOddsSnapshot>>> | undefined {
  const requestedMarkets = new Set(markets ?? []);
  if (!requestedMarkets.size) return undefined;
  for (const [key, snapshot] of oddsSnapshots) {
    const cached = parseOddsCacheKey(key);
    if (cached.fixtureId !== fixtureId) continue;
    if (isMarketSuperset(cached.markets, requestedMarkets)) return snapshot;
  }
  return undefined;
}

function parseOddsCacheKey(key: string): { fixtureId: string; markets: Set<string> } {
  const delimiter = key.indexOf(':');
  if (delimiter < 0) return { fixtureId: key, markets: new Set() };
  return {
    fixtureId: key.slice(0, delimiter),
    markets: new Set(key.slice(delimiter + 1).split(',').filter(Boolean)),
  };
}

function isMarketSuperset(cachedMarkets: Set<string>, requestedMarkets: Set<MarketKey>): boolean {
  for (const market of requestedMarkets) {
    if (!cachedMarkets.has(market)) return false;
  }
  return true;
}

function validateDailyInput(input: RunDailyE2EInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('daily-e2e requires --date YYYY-MM-DD.');
  if (input.maxFixtures !== undefined && (!Number.isInteger(input.maxFixtures) || input.maxFixtures < 1)) {
    throw new Error('--max-fixtures must be a positive integer.');
  }
  if (input.threshold !== undefined && (!Number.isFinite(input.threshold) || input.threshold <= 1)) {
    throw new Error('--threshold must be greater than 1.');
  }
  if (input.providerConcurrency !== undefined && (!Number.isInteger(input.providerConcurrency) || input.providerConcurrency < 1)) {
    throw new Error('--provider-concurrency must be a positive integer.');
  }
}

function normalizeProviders(providers: DailyE2EProvider[] | undefined): DailyE2EProvider[] {
  const values = providers?.length ? providers : DEFAULT_DAILY_PROVIDERS;
  const invalid = values.filter((provider) => provider !== 'codex' && provider !== 'gemini');
  if (invalid.length) throw new Error(`--providers only supports codex,gemini for daily-e2e. Invalid: ${invalid.join(',')}`);
  return Array.from(new Set(values));
}

function normalizeProviderConcurrency(inputConcurrency: number | undefined, providerCount: number): number {
  const envValue = process.env.GANA_DAILY_PROVIDER_CONCURRENCY;
  const parsedEnv = envValue === undefined ? undefined : Number(envValue);
  if (parsedEnv !== undefined && (!Number.isInteger(parsedEnv) || parsedEnv < 1)) {
    throw new Error('GANA_DAILY_PROVIDER_CONCURRENCY must be a positive integer.');
  }
  const requested = inputConcurrency ?? parsedEnv ?? 2;
  return Math.min(Math.max(1, requested), Math.max(1, providerCount));
}

async function allSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index] as T, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

function createDailyProgressSnapshot(input: {
  dailyBatchId: string;
  date: string;
  startedAt: Date;
  providers: DailyE2EProvider[];
  providerConcurrency: number;
  config: AgentConfig;
  models: RunDailyE2EInput['models'];
}): DailyProgressSnapshot {
  return {
    batchId: input.dailyBatchId,
    date: input.date,
    status: 'running',
    phase: 'created',
    providerConcurrency: input.providerConcurrency,
    startedAt: input.startedAt.toISOString(),
    updatedAt: input.startedAt.toISOString(),
    providers: Object.fromEntries(input.providers.map((provider) => [provider, {
      provider,
      model: modelForProvider(input.config, provider, input.models),
      status: 'queued',
      phase: 'queued',
      runId: null,
      verdict: null,
      predictions: 0,
      promotable: 0,
      updatedAt: input.startedAt.toISOString(),
    } satisfies DailyProviderProgress])),
  };
}

function progressFromProviderRun(
  provider: DailyE2EProvider,
  model: string,
  result: RunPipelineResult,
  now: (() => Date) | undefined,
): DailyProviderProgress {
  const counts = providerPredictionCounts(result);
  return {
    provider,
    model,
    status: result.ok ? 'completed' : 'blocked',
    phase: result.ok ? 'completed' : 'blocked',
    runId: result.runId ?? null,
    verdict: result.verdict ?? null,
    predictions: counts.predictions,
    promotable: counts.promotable,
    updatedAt: (now ?? (() => new Date()))().toISOString(),
    ...(result.error ? { error: result.error } : {}),
  };
}

function providerPredictionCounts(result: RunPipelineResult | undefined): { predictions: number; promotable: number } {
  const predictions = result?.scoring.flatMap((item) => item.predictions) ?? [];
  return {
    predictions: predictions.length,
    promotable: predictions.filter((prediction) => prediction.status === 'promotable').length,
  };
}

function withDailyOverrides(config: AgentConfig, input: RunDailyE2EInput): AgentConfig {
  return {
    ...config,
    apiFootball: {
      ...config.apiFootball,
      ...(input.maxFixtures !== undefined ? {
        maxFixturesPerRun: input.maxFixtures,
        maxAgenticResearchCallsPerRun: Math.min(config.apiFootball.maxAgenticResearchCallsPerRun, input.maxFixtures),
      } : {}),
      ...(input.threshold !== undefined ? { lowOddsThreshold: input.threshold } : {}),
      ...(input.markets ? { defaultMarkets: input.markets } : {}),
    },
  };
}

function configForProvider(
  config: AgentConfig,
  provider: DailyE2EProvider,
  models: RunDailyE2EInput['models'] = {},
): AgentConfig {
  return {
    ...config,
    provider,
    model: modelForProvider(config, provider, models),
    codexThreadId: undefined,
    geminiSessionId: undefined,
  };
}

function configForSports(runConfig: AgentConfig, sportsConfig: AgentConfig): AgentConfig {
  return {
    ...runConfig,
    apiFootball: sportsConfig.apiFootball,
    apiFootballKey: sportsConfig.apiFootballKey,
    apiFootballBaseUrl: sportsConfig.apiFootballBaseUrl,
    databaseUrl: sportsConfig.databaseUrl,
  };
}

function modelForProvider(
  config: AgentConfig,
  provider: DailyE2EProvider,
  models: RunDailyE2EInput['models'] = {},
): string {
  const explicit = models[provider]?.trim();
  if (explicit) return explicit;
  if (config.provider === provider && config.model) return config.model;
  return selectDefaultModelForProvider(provider);
}

function childRuntime(runtime: RuntimeContext, config: AgentConfig, runId?: string): RuntimeContext {
  return updateRuntimeContext({
    ...runtime,
    runId,
    taskId: undefined,
    traceId: undefined,
    providerRequestCount: 0,
    agenticResearchCallCount: 0,
  }, config, { runId });
}

function profilesToPortfolios(profile: DailyParlayProfile | undefined): Array<NonNullable<RunParlayBuildInput['portfolio']>> {
  if (!profile) return [];
  if (profile === 'safe-consensus') return ['low-variance'];
  if (profile === 'aggressive-analytical') return ['high-conviction'];
  if (profile === 'portfolio-v2') return ['parlay-diamante', 'low-odds-top', 'low-variance', 'balanced', 'market-diverse', 'high-conviction', 'parlay-oro'];
  if (profile === 'balanced') return ['balanced'];
  return [profile];
}

function selectDailyParlayRecommendations(
  recommendations: readonly ParlayAnalysisRecommendation[],
  limit: number,
): ParlayAnalysisRecommendation[] {
  const selected: ParlayAnalysisRecommendation[] = [];
  const usedIds = new Set<string>();
  const usedProfiles = new Set<string>();
  const usedSignatures = new Set<string>();
  const add = (recommendation: ParlayAnalysisRecommendation) => {
    if (selected.length >= limit || usedIds.has(recommendation.parlayId)) return;
    if (usedProfiles.has(recommendation.profile)) return;
    if (!isConservativeDailyParlayRecommendation(recommendation)) return;
    const signature = parlayLogicalSignature(recommendation);
    if (!signature || usedSignatures.has(signature)) return;
    selected.push(recommendation);
    usedIds.add(recommendation.parlayId);
    usedProfiles.add(recommendation.profile);
    usedSignatures.add(signature);
  };

  const diamante = recommendations.find((recommendation) =>
    recommendation.profile === 'parlay-diamante'
    && recommendation.combinedOdds >= 1.1
    && recommendation.combinedOdds <= 1.3,
  );
  if (diamante) add(diamante);

  for (const recommendation of recommendations) {
    if (!usedProfiles.has(recommendation.profile)) add(recommendation);
  }
  for (const recommendation of recommendations) add(recommendation);

  return selected.slice(0, limit).map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1,
  }));
}

function isConservativeDailyParlayRecommendation(recommendation: ParlayAnalysisRecommendation): boolean {
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') return false;
  if (!DAILY_FINAL_PARLAY_ALLOWED_PROFILES.includes(recommendation.profile as any)) return false;
  if (DAILY_FINAL_PARLAY_BLOCKED_PROFILES.includes(recommendation.profile as any)) return false;
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) return false;
  if (!Number.isFinite(recommendation.aggregateConfidence)) return false;
  if (!Number.isFinite(recommendation.expectedEdge) || recommendation.expectedEdge <= 0) return false;
  if ((recommendation.legs?.length ?? 0) < 2) return false;
  if ((recommendation.legs?.length ?? 0) > 3) return false;
  const riskFlags = new Set(recommendation.riskFlags ?? []);
  for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
    if (riskFlags.has(flag)) return false;
  }
  if (recommendation.profile === 'parlay-diamante') {
    return recommendation.combinedOdds >= 1.1
      && recommendation.combinedOdds <= 1.3
      && recommendation.aggregateConfidence >= DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE;
  }
  if (recommendation.combinedOdds > DAILY_PARLAY_CONSERVATIVE_MAX_ODDS || riskFlags.has('high-combined-odds')) return false;
  return recommendation.aggregateConfidence >= DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE;
}

function selectDailyFallbackParlayRecommendations(
  recommendations: readonly ParlayAnalysisRecommendation[],
  limit: number,
): DailyFinalRecommendation[] {
  const selected: DailyFinalRecommendation[] = [];
  const usedIds = new Set<string>();
  const usedSignatures = new Set<string>();
  for (const recommendation of recommendations) {
    if (selected.length >= limit || usedIds.has(recommendation.parlayId)) continue;
    if (!isAnalyticalFallbackParlayRecommendation(recommendation)) continue;
    const signature = parlayLogicalSignature(recommendation);
    if (!signature || usedSignatures.has(signature)) continue;
    selected.push(markParlayAsAnalyticalFallback(recommendation, selected.length + 1));
    usedIds.add(recommendation.parlayId);
    usedSignatures.add(signature);
  }
  return selected;
}

function isAnalyticalFallbackParlayRecommendation(recommendation: ParlayAnalysisRecommendation): boolean {
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') return false;
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) return false;
  if (!Number.isFinite(recommendation.aggregateConfidence) || recommendation.aggregateConfidence <= 0) return false;
  if ((recommendation.legs?.length ?? 0) < 2) return false;
  return true;
}

function markParlayAsAnalyticalFallback(recommendation: ParlayAnalysisRecommendation, rank: number): DailyFinalRecommendation {
  return {
    ...recommendation,
    kind: 'parlay',
    rank,
    harnessStatus: 'review-required',
    selectionMode: 'analytical-fallback',
    fallbackReasons: ['strict daily parlay promotion gate selected 0 parlays'],
    riskFlags: uniqueStrings([
      ...(recommendation.riskFlags ?? []),
      'analytical-fallback',
      'review-required',
    ]),
    reasons: uniqueStrings([
      ...(recommendation.reasons ?? []),
      'analytical fallback: strict daily parlay promotion gate selected 0 parlays',
    ]),
  };
}

function parlayLogicalSignature(recommendation: Pick<ParlayAnalysisRecommendation, 'legs'>): string {
  return (recommendation.legs ?? [])
    .map((leg) => legSelectionKey(leg.fixtureId, leg.market, leg.selection, leg.line))
    .filter(Boolean)
    .sort()
    .join('|');
}

function recommendationLegPredictionIds(recommendations: readonly Pick<DailyFinalRecommendation, 'legs'>[]): Set<string> {
  return new Set(recommendations.flatMap((recommendation) =>
    recommendation.legs
      .map((leg) => leg.predictionId)
      .filter((predictionId): predictionId is string => Boolean(predictionId)),
  ));
}

function recommendationLegSelectionKeys(recommendations: readonly Pick<DailyFinalRecommendation, 'legs'>[]): Set<string> {
  return new Set(recommendations.flatMap((recommendation) =>
    recommendation.legs
      .map((leg) => legSelectionKey(leg.fixtureId, leg.market, leg.selection, leg.line))
      .filter((key): key is string => Boolean(key)),
  ));
}

function recommendationLegFixtureIds(recommendations: readonly Pick<DailyFinalRecommendation, 'legs'>[]): Set<string> {
  return new Set(recommendations.flatMap((recommendation) =>
    recommendation.legs
      .map((leg) => typeof leg.fixtureId === 'string' ? leg.fixtureId : null)
      .filter((fixtureId): fixtureId is string => Boolean(fixtureId)),
  ));
}

function dailyValidationFreshness(metrics: DailyMetricsRunResult | undefined, date: string): DailyValidationFreshness {
  const snapshot = metrics?.metrics?.find((item) => item.metricDate === date) ?? metrics?.metrics?.[0];
  if (!metrics?.ok || !snapshot) {
    return {
      status: 'empty',
      date,
      minCoverage: VALIDATION_FRESHNESS_MIN_COVERAGE,
      maxUnresolvedRate: VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE,
      predictionCoverage: null,
      parlayCoverage: null,
      predictionUnresolvedRate: null,
      parlayUnresolvedRate: null,
      predictionSettled: 0,
      parlaySettled: 0,
      predictionTotal: 0,
      parlayTotal: 0,
      predictionUnvalidated: 0,
      parlayUnvalidated: 0,
      predictionPending: 0,
      parlayPending: 0,
      reasons: ['daily metrics unavailable for validation freshness gate'],
    };
  }
  const prediction = snapshot.predictionMetrics;
  const parlay = snapshot.parlayMetrics;
  const predictionCoverage = validationCoverage(prediction);
  const parlayCoverage = validationCoverage(parlay);
  const predictionUnresolvedRate = unresolvedRate(prediction);
  const parlayUnresolvedRate = unresolvedRate(parlay);
  const reasons: string[] = [];
  if (prediction.total === 0 && parlay.total === 0) reasons.push('no predictions or parlays found for validation freshness gate');
  if (predictionCoverage !== null && predictionCoverage < VALIDATION_FRESHNESS_MIN_COVERAGE) {
    reasons.push(`prediction validation coverage ${round(predictionCoverage, 3)} below ${VALIDATION_FRESHNESS_MIN_COVERAGE}`);
  }
  if (parlay.total > 0 && parlayCoverage !== null && parlayCoverage < VALIDATION_FRESHNESS_MIN_COVERAGE) {
    reasons.push(`parlay validation coverage ${round(parlayCoverage, 3)} below ${VALIDATION_FRESHNESS_MIN_COVERAGE}`);
  }
  if (predictionUnresolvedRate !== null && predictionUnresolvedRate > VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE) {
    reasons.push(`prediction unresolved rate ${round(predictionUnresolvedRate, 3)} above ${VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE}`);
  }
  if (parlay.total > 0 && parlayUnresolvedRate !== null && parlayUnresolvedRate > VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE) {
    reasons.push(`parlay unresolved rate ${round(parlayUnresolvedRate, 3)} above ${VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE}`);
  }
  const status = reasons.length
    ? prediction.total === 0 && parlay.total === 0 ? 'empty' : 'thin'
    : 'fresh';
  return {
    status,
    date: snapshot.metricDate,
    minCoverage: VALIDATION_FRESHNESS_MIN_COVERAGE,
    maxUnresolvedRate: VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE,
    predictionCoverage,
    parlayCoverage,
    predictionUnresolvedRate,
    parlayUnresolvedRate,
    predictionSettled: prediction.settled,
    parlaySettled: parlay.settled,
    predictionTotal: prediction.total,
    parlayTotal: parlay.total,
    predictionUnvalidated: prediction.unvalidated,
    parlayUnvalidated: parlay.unvalidated,
    predictionPending: prediction.pending,
    parlayPending: parlay.pending,
    reasons,
  };
}

function validationCoverage(metrics: { total: number; settled: number; voided: number; blocked: number }): number | null {
  if (!metrics.total) return null;
  return round((metrics.settled + metrics.voided + metrics.blocked) / metrics.total, 6);
}

function unresolvedRate(metrics: { total: number; pending: number; unvalidated: number }): number | null {
  if (!metrics.total) return null;
  return round((metrics.pending + metrics.unvalidated) / metrics.total, 6);
}

function toParlayFamily(
  family: DailyParlayFamilyResult['family'],
  sourceRunIds: string[],
  result: ParlayBuildRunResult,
  profile?: string | null,
): DailyParlayFamilyResult {
  return {
    family,
    profile: profile ?? null,
    runId: result.runId,
    sourceRunIds,
    ok: result.ok,
    verdict: result.gateResult.verdict,
    artifactPath: result.artifactPath,
    persistedParlayIds: result.persistedParlayIds ?? (result.persistedParlayId ? [result.persistedParlayId] : undefined),
    error: result.error,
  };
}

function parlayFamilyCountKey(family: DailyParlayFamilyResult): string {
  return family.profile ? `${family.family}:${family.profile}` : family.family;
}

function providerHasUsablePredictions(result: RunPipelineResult): boolean {
  return result.scoring.some((item) => item.predictions.length > 0);
}

function oddsCacheKey(fixtureId: string, markets: readonly MarketKey[] | undefined): string {
  return `${fixtureId}:${[...(markets ?? [])].sort().join(',')}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

interface AtomicPredictionCandidate {
  provider: DailyE2EProvider;
  model: string;
  runId: string;
  prediction: PredictionRecordView;
  fixture: string;
  display?: RecommendationLegDisplay;
  edge: number;
}

interface RecommendationLegDisplay {
  fixtureLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName?: string;
  kickoffLocal?: string;
}

function buildFallbackParlayRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  config: AgentConfig,
  models: RunDailyE2EInput['models'],
  limit: number,
): DailyFinalRecommendation[] {
  let remaining = selectFallbackParlayCandidatePool(collectFallbackPredictionCandidates(
    providerPipelineResults,
    providers,
    config,
    models,
  ));
  const recommendations: DailyFinalRecommendation[] = [];
  const usedSignatures = new Set<string>();

  while (recommendations.length < limit && remaining.length >= DAILY_FALLBACK_PARLAY_LEGS) {
    const legs: AtomicPredictionCandidate[] = [];
    const usedFixtureIds = new Set<string>();
    for (const candidate of remaining) {
      const fixtureId = candidate.prediction.fixtureId;
      if (usedFixtureIds.has(fixtureId)) continue;
      legs.push(candidate);
      usedFixtureIds.add(fixtureId);
      if (legs.length >= DAILY_FALLBACK_PARLAY_LEGS) break;
    }
    if (legs.length < DAILY_FALLBACK_PARLAY_LEGS) break;

    const signature = legs.map((candidate) => atomicPredictionKey(candidate.prediction)).sort().join('|');
    if (!usedSignatures.has(signature)) {
      recommendations.push(toFallbackParlayRecommendation(legs, recommendations.length + 1));
      usedSignatures.add(signature);
    }

    const selectedFixtureIds = new Set(legs.map((candidate) => candidate.prediction.fixtureId));
    const selectedPredictionIds = new Set(legs.map((candidate) => candidate.prediction.id));
    remaining = remaining.filter((candidate) =>
      !selectedFixtureIds.has(candidate.prediction.fixtureId)
      && !selectedPredictionIds.has(candidate.prediction.id)
    );
  }

  return recommendations;
}

function buildFallbackAtomicPredictionRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  config: AgentConfig,
  models: RunDailyE2EInput['models'],
  rankOffset: number,
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
  excludedFixtureIds: ReadonlySet<string> = new Set(),
): AtomicPredictionRecommendation[] {
  const groups = new Map<string, AtomicPredictionCandidate[]>();
  const candidates = collectFallbackPredictionCandidates(
    providerPipelineResults,
    providers,
    config,
    models,
    excludedPredictionIds,
    excludedSelectionKeys,
    excludedFixtureIds,
  );
  const nonBlocked = candidates.filter((candidate) => candidate.prediction.status !== 'blocked');
  for (const candidate of nonBlocked.length ? nonBlocked : candidates) {
    const key = atomicPredictionKey(candidate.prediction);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const ordered = [...groups.values()]
    .map(toAtomicRecommendationDraft)
    .map(markAtomicAsAnalyticalFallback)
    .sort((a, b) => b.score - a.score || b.aggregateConfidence - a.aggregateConfidence || a.combinedOdds - b.combinedOdds);
  const selected: AtomicPredictionRecommendation[] = [];
  const usedFixtureIds = new Set<string>();
  for (const recommendation of ordered) {
    const fixtureId = recommendation.legs[0]?.fixtureId;
    if (fixtureId && usedFixtureIds.has(fixtureId)) continue;
    if (fixtureId) usedFixtureIds.add(fixtureId);
    selected.push(recommendation);
  }
  return selected.map((recommendation, index) => ({ ...recommendation, rank: rankOffset + index + 1 }));
}

function collectFallbackPredictionCandidates(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  config: AgentConfig,
  models: RunDailyE2EInput['models'],
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
  excludedFixtureIds: ReadonlySet<string> = new Set(),
): AtomicPredictionCandidate[] {
  const bestByKey = new Map<string, AtomicPredictionCandidate>();
  for (const provider of providers) {
    const result = providerPipelineResults[provider];
    if (!result?.runId) continue;
    const fixtureDisplays = fixtureDisplayMap(displayFixturesFromPipelineResult(result));
    const providerModel = modelForProvider(config, provider, models);
    for (const scoring of result.scoring) {
      for (const prediction of scoring.predictions) {
        const edge = atomicPredictionEdge(prediction);
        const model = prediction.model ?? providerModel;
        const key = atomicPredictionKey(prediction);
        if (!isFallbackPredictionCandidate(prediction)) continue;
        if (DAILY_FINAL_DEMOTED_MODELS.includes(model as any)) continue;
        if (excludedPredictionIds.has(prediction.id) || excludedSelectionKeys.has(key)) continue;
        if (excludedFixtureIds.has(prediction.fixtureId)) continue;
        const display = fixtureDisplays.get(prediction.fixtureId);
        const candidate: AtomicPredictionCandidate = {
          provider,
          model,
          runId: result.runId,
          prediction,
          fixture: display?.fixtureLabel ?? scoring.fixtureId ?? prediction.fixtureId,
          display,
          edge,
        };
        const current = bestByKey.get(key);
        if (!current || fallbackCandidateScore(candidate) > fallbackCandidateScore(current)) {
          bestByKey.set(key, candidate);
        }
      }
    }
  }
  return [...bestByKey.values()].sort((a, b) =>
    fallbackCandidateScore(b) - fallbackCandidateScore(a)
    || b.prediction.confidence - a.prediction.confidence
    || a.prediction.odds - b.prediction.odds
  );
}

function selectFallbackParlayCandidatePool(candidates: AtomicPredictionCandidate[]): AtomicPredictionCandidate[] {
  const pools = [
    candidates.filter((candidate) => candidate.prediction.parlayEligible !== false && candidate.prediction.status === 'promotable'),
    candidates.filter((candidate) => candidate.prediction.parlayEligible !== false && candidate.prediction.status !== 'blocked'),
    candidates.filter((candidate) => candidate.prediction.status !== 'blocked'),
    candidates,
  ];
  return pools.find((pool) => uniqueFixtureCount(pool) >= DAILY_FALLBACK_PARLAY_LEGS) ?? [];
}

function uniqueFixtureCount(candidates: readonly AtomicPredictionCandidate[]): number {
  return new Set(candidates.map((candidate) => candidate.prediction.fixtureId)).size;
}

function isFallbackPredictionCandidate(prediction: PredictionRecordView): boolean {
  return Number.isFinite(prediction.odds)
    && prediction.odds > 1
    && Number.isFinite(prediction.confidence)
    && prediction.confidence > 0
    && Boolean(prediction.id)
    && Boolean(prediction.fixtureId);
}

function fallbackCandidateScore(candidate: AtomicPredictionCandidate): number {
  const prediction = candidate.prediction;
  const statusBonus = prediction.status === 'promotable'
    ? 0.5
    : prediction.status === 'candidate'
      ? 0.35
      : prediction.status === 'review-required'
        ? 0.2
        : prediction.status === 'draft'
          ? 0.1
          : -0.3;
  const parlayEligibleBonus = prediction.parlayEligible === false ? -0.25 : 0.08;
  const riskPenalty = fallbackRiskFlags(prediction).length * 0.025;
  const oddsPenalty = Math.log2(Math.max(1.01, prediction.odds)) * 0.04;
  return round(statusBonus + parlayEligibleBonus + (prediction.confidence * 0.7) + (Math.max(0, candidate.edge) * 0.35) - riskPenalty - oddsPenalty, 6);
}

function toFallbackParlayRecommendation(candidates: AtomicPredictionCandidate[], rank: number): DailyFinalRecommendation {
  const combinedOdds = round(candidates.reduce((product, candidate) => product * candidate.prediction.odds, 1), 6);
  const aggregateConfidence = round(candidates.reduce((product, candidate) => product * clamp(candidate.prediction.confidence, 0.01, 0.99), 1), 6);
  const providerCount = new Set(candidates.map((candidate) => candidate.provider)).size;
  const adjustedProbability = round(clamp(aggregateConfidence * (providerCount > 1 ? 1.02 : 1), 0.01, 0.99), 6);
  const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
  const riskFlags = uniqueStrings([
    'analytical-fallback',
    'review-required',
    ...candidates.flatMap((candidate) => fallbackRiskFlags(candidate.prediction)),
  ]);
  const legs = candidates.map(parlayLegFromFallbackCandidate);
  const sourceRunIds = uniqueStrings(candidates.map((candidate) => candidate.runId));

  return {
    kind: 'parlay',
    rank,
    parlayId: `analytical-fallback-${candidates.map((candidate) => candidate.prediction.id).join('-').slice(0, 48)}`,
    sourceRunId: sourceRunIds[0] ?? null,
    sourceRunIds,
    profile: 'analytical-fallback',
    validationStatus: 'unvalidated',
    harnessStatus: 'review-required',
    selectionMode: 'analytical-fallback',
    fallbackReasons: ['strict daily parlay promotion gate selected 0 parlays'],
    combinedOdds,
    aggregateConfidence,
    adjustedProbability,
    expectedEdge,
    score: round((adjustedProbability * 0.65) + (Math.max(0, expectedEdge) * 0.2) - (riskFlags.length * 0.01), 6),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'analytical-fallback-review-only-exposure',
    },
    stake: {
      units: 0,
      percentOfBankroll: 0,
      policy: 'analytical-fallback-review-only-stake',
    },
    bankerLegs: legs
      .filter((leg) => leg.banker)
      .map((leg) => ({
        predictionId: leg.predictionId,
        fixtureId: leg.fixtureId,
        fixture: leg.fixture,
        ...(leg.display ? { display: leg.display } : {}),
        market: leg.market,
        selection: leg.selection,
        line: leg.line,
        odds: leg.odds,
        confidence: leg.confidence,
        reason: leg.bankerReason ?? 'analytical fallback banker leg',
      })),
    reasons: [
      'analytical fallback: strict daily parlay promotion gate selected 0 parlays',
      `selected ${legs.length} review-required leg(s) from available predictions`,
      `source runs: ${sourceRunIds.join(', ') || 'unknown'}`,
      `aggregate confidence ${round(aggregateConfidence, 3)}`,
      `adjusted edge ${round(expectedEdge, 3)}`,
    ],
    riskFlags,
    legs,
  };
}

function parlayLegFromFallbackCandidate(candidate: AtomicPredictionCandidate): ParlayAnalysisRecommendation['legs'][number] {
  const prediction = candidate.prediction;
  const warnings = uniqueStrings([
    ...(prediction.warnings ?? []),
    ...(prediction.blockers ?? []),
  ]);
  const banker = prediction.confidence >= 0.65
    && prediction.odds <= 1.5
    && prediction.market !== 'corners_over_under'
    && prediction.status !== 'blocked';
  return {
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    fixture: candidate.fixture,
    ...(candidate.display ? { display: candidate.display } : {}),
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: round(prediction.odds, 6),
    confidence: round(prediction.confidence, 6),
    validationStatus: 'unvalidated',
    warnings,
    banker,
    ...(banker ? { bankerReason: `analytical fallback banker: confidence ${round(prediction.confidence, 3)} with odds ${round(prediction.odds, 3)}` } : {}),
  };
}

function markAtomicAsAnalyticalFallback(recommendation: AtomicPredictionRecommendation): AtomicPredictionRecommendation {
  return {
    ...recommendation,
    harnessStatus: recommendation.harnessStatus === 'blocked' ? 'review-required' : recommendation.harnessStatus,
    selectionMode: 'analytical-fallback',
    fallbackReasons: ['strict daily atomic promotion gate selected 0 simples'],
    riskFlags: uniqueStrings([
      ...(recommendation.riskFlags ?? []),
      'analytical-fallback',
      'review-required',
    ]),
    reasons: uniqueStrings([
      ...(recommendation.reasons ?? []),
      'analytical fallback: strict daily atomic promotion gate selected 0 simples',
    ]),
  };
}

function fallbackRiskFlags(prediction: PredictionRecordView): string[] {
  const flags = atomicRiskFlags(prediction, 1).filter((flag) => flag !== 'single-selection');
  if (prediction.status !== 'promotable') flags.push(`source-${prediction.status}`);
  if (prediction.status === 'blocked') flags.push('blocked-source-prediction');
  if (prediction.parlayEligible === false) flags.push('parlay-ineligible-source');
  return uniqueStrings(flags);
}

function buildAtomicPredictionRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  config: AgentConfig,
  models: RunDailyE2EInput['models'],
  rankOffset: number,
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
  excludedFixtureIds: ReadonlySet<string> = new Set(),
): AtomicPredictionRecommendation[] {
  const groups = new Map<string, AtomicPredictionCandidate[]>();
  for (const provider of providers) {
    const result = providerPipelineResults[provider];
    if (!result?.ok) continue;
    const fixtureDisplays = fixtureDisplayMap(displayFixturesFromPipelineResult(result));
    const providerModel = modelForProvider(config, provider, models);
    for (const scoring of result.scoring) {
      for (const prediction of scoring.predictions) {
        const edge = atomicPredictionEdge(prediction);
        const model = prediction.model ?? providerModel;
        if (DAILY_FINAL_DEMOTED_MODELS.includes(model as any)) continue;
        if (!isAtomicRecommendationEligible(prediction, edge)) continue;
        const key = atomicPredictionKey(prediction);
        if (excludedPredictionIds.has(prediction.id) || excludedSelectionKeys.has(key)) continue;
        if (excludedFixtureIds.has(prediction.fixtureId)) continue;
        const display = fixtureDisplays.get(prediction.fixtureId);
        groups.set(key, [...(groups.get(key) ?? []), {
          provider,
          model,
          runId: result.runId,
          prediction,
          fixture: display?.fixtureLabel ?? scoring.fixtureId ?? prediction.fixtureId,
          display,
          edge,
        }]);
      }
    }
  }

  const ordered = [...groups.values()]
    .map(toAtomicRecommendationDraft)
    .sort((a, b) => b.score - a.score || b.aggregateConfidence - a.aggregateConfidence || a.combinedOdds - b.combinedOdds);
  const selected: AtomicPredictionRecommendation[] = [];
  const usedFixtureIds = new Set<string>();
  for (const recommendation of ordered) {
    const fixtureId = recommendation.legs[0]?.fixtureId;
    if (fixtureId && usedFixtureIds.has(fixtureId)) continue;
    if (fixtureId) usedFixtureIds.add(fixtureId);
    selected.push(recommendation);
  }
  return selected.map((recommendation, index) => ({ ...recommendation, rank: rankOffset + index + 1 }));
}

function applyDailyStakeRecommendations<T extends DailyFinalRecommendation>(
  recommendations: readonly T[],
): T[] {
  if (!recommendations.length) return [];
  return recommendations.map((recommendation) => {
    const stake = dailyStakeBucket(recommendation);
    return {
      ...recommendation,
      stakeRecommendation: {
        stake,
        percentOfBankroll: round(stake / 100, 6),
        unitLabel: 'percent-of-bankroll',
        allowedStakes: DAILY_STAKE_BUCKETS,
        policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
      },
    };
  });
}

function dailyStakeBucket(recommendation: DailyFinalRecommendation): number {
  const confidence = clamp(Number(recommendation.aggregateConfidence), 0.01, 0.99);
  const edge = Math.max(0, Number.isFinite(recommendation.expectedEdge) ? recommendation.expectedEdge : 0);
  const odds = Math.max(1.01, Number(recommendation.combinedOdds) || 1.01);
  const profileBonus = recommendation.profile === 'parlay-diamante'
    ? 2
    : recommendation.profile === 'low-variance'
      ? 1.5
      : recommendation.kind === 'atomic-prediction'
        ? -1.5
        : 0;
  const riskPenalty = (recommendation.riskFlags?.length ?? 0) * 0.75;
  const oddsPenalty = Math.log2(odds) * 1.5;
  const rawStake = (confidence * 10)
    + (Math.min(edge, 0.35) * 20)
    + profileBonus
    - riskPenalty
    - oddsPenalty;
  return nearestStakeBucket(rawStake);
}

function nearestStakeBucket(value: number): number {
  return DAILY_STAKE_BUCKETS.reduce((best, bucket) =>
    Math.abs(bucket - value) < Math.abs(best - value) ? bucket : best,
  DAILY_STAKE_BUCKETS[0]);
}

function toAtomicRecommendationDraft(candidates: AtomicPredictionCandidate[]): AtomicPredictionRecommendation {
  const ordered = [...candidates].sort((a, b) =>
    b.prediction.confidence - a.prediction.confidence
    || b.edge - a.edge
    || a.prediction.odds - b.prediction.odds,
  );
  const primary = ordered[0] as AtomicPredictionCandidate;
  const providers = uniqueStrings(ordered.map((candidate) => candidate.provider)) as DailyE2EProvider[];
  const sourceRunIds = uniqueStrings(ordered.map((candidate) => candidate.runId));
  const predictionIds = uniqueStrings(ordered.map((candidate) => candidate.prediction.id));
  const confidence = round(average(ordered.map((candidate) => candidate.prediction.confidence)), 6);
  const edge = round(average(ordered.map((candidate) => candidate.edge)), 6);
  const adjustedProbability = round(clamp(confidence * (providers.length > 1 ? 1.02 : 1), 0.01, 0.99), 6);
  const riskFlags = atomicRiskFlags(primary.prediction, providers.length);
  const leg = {
    predictionId: primary.prediction.id,
    fixtureId: primary.prediction.fixtureId,
    fixture: primary.fixture,
    ...(primary.display ? { display: primary.display } : {}),
    market: primary.prediction.market,
    selection: primary.prediction.selection,
    line: primary.prediction.line ?? null,
    odds: round(primary.prediction.odds, 6),
    confidence: round(primary.prediction.confidence, 6),
    validationStatus: 'unvalidated',
    warnings: primary.prediction.warnings ?? [],
    banker: true,
    bankerReason: `atomic high-confidence selection ${round(primary.prediction.confidence, 3)}`,
  };

  return {
    kind: 'atomic-prediction',
    rank: 0,
    parlayId: `atomic-${primary.prediction.id}`,
    predictionId: primary.prediction.id,
    predictionIds,
    sourceRunId: primary.runId,
    sourceRunIds,
    provider: primary.provider,
    providers,
    model: primary.model,
    profile: ATOMIC_RECOMMENDATION_PROFILE,
    validationStatus: 'unvalidated',
    harnessStatus: primary.prediction.status,
    combinedOdds: round(primary.prediction.odds, 6),
    aggregateConfidence: confidence,
    adjustedProbability,
    expectedEdge: edge,
    score: atomicRecommendationScore(confidence, edge, providers.length, riskFlags.length),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'single-selection-analytical-watchlist',
    },
    bankerLegs: [{
      predictionId: leg.predictionId,
      fixtureId: leg.fixtureId,
      fixture: leg.fixture,
      ...(primary.display ? { display: primary.display } : {}),
      market: leg.market,
      selection: leg.selection,
      line: leg.line,
      odds: leg.odds,
      confidence: leg.confidence,
      reason: leg.bankerReason,
    }],
    reasons: [
      `profile ${ATOMIC_RECOMMENDATION_PROFILE}`,
      `confidence ${round(confidence, 3)}`,
      `edge ${round(edge, 3)}`,
      providers.length > 1 ? `provider agreement: ${providers.join(', ')}` : `provider: ${primary.provider}`,
    ],
    riskFlags,
    legs: [leg],
  };
}

function isAtomicRecommendationEligible(prediction: PredictionRecordView, edge: number): boolean {
  if (prediction.status !== 'promotable') return false;
  if (!Number.isFinite(prediction.confidence) || prediction.confidence < ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR) return false;
  if (!Number.isFinite(prediction.odds) || prediction.odds <= 1) return false;
  if (!Number.isFinite(edge) || edge <= ATOMIC_RECOMMENDATION_EDGE_FLOOR) return false;
  if (prediction.model && DAILY_FINAL_DEMOTED_MODELS.includes(prediction.model as any)) return false;
  const riskFlags = atomicRiskFlags(prediction, 1);
  return !riskFlags.some((flag) => ATOMIC_BLOCKED_RISK_FLAGS.includes(flag as any));
}

function atomicPredictionEdge(prediction: PredictionRecordView): number {
  if (Number.isFinite(prediction.edge)) return prediction.edge as number;
  const probability = prediction.probability ?? prediction.modelProbability ?? prediction.marketFairProbability;
  return Number.isFinite(probability) ? prediction.odds * (probability as number) - 1 : 0;
}

function atomicRiskFlags(prediction: PredictionRecordView, providerCount: number): string[] {
  const flags: string[] = ['single-selection'];
  if (providerCount > 1) flags.push('provider-consensus');
  const text = [
    prediction.rationale ?? '',
    ...(prediction.warnings ?? []),
    ...(prediction.blockers ?? []),
  ].join('\n');
  if (prediction.market === 'corners_over_under') {
    flags.push('corners-market');
    if (!/corners[- ]settlement[- ]reliable|corner settlement reliable|settlement reliable for corners/i.test(text)) {
      flags.push('corners-unverified');
    }
  }
  if (/stale (?:news|source|odds) source|stale odds/i.test(text)) flags.push('stale-source');
  if (/low[-_ ]liquidity|low liquidity|single[-_ ]bookmaker/i.test(text)) flags.push('low-liquidity');
  if (
    prediction.market === 'h2h'
    && prediction.selection !== 'draw'
    && prediction.odds <= 1.2
    && /low[-_ ]liquidity|low liquidity|single[-_ ]bookmaker|low_liquidity_h2h_favorite/i.test(text)
  ) {
    flags.push('low-liquidity-h2h-favorite');
  }
  if (/lineup[-_ ]pending|lineup pending|lineups? unconfirmed|lineup confirmation pending/i.test(text)) flags.push('lineup-pending');
  if (/no selection(?:\/line)?[- ]specific|selection[- ]level .*not supplied|selection[- ]level .*missing|market[- ]level only|support is market[- ]level only|fixture[- ]level evidence/i.test(text)) {
    flags.push('selection-evidence-missing');
  }
  if (prediction.market === 'h2h' && prediction.selection === 'away' && prediction.odds > 1.2) flags.push('h2h-away');
  if (prediction.market === 'double_chance' && prediction.odds <= 1.25 && Number(prediction.edge ?? 0) >= 0.25) flags.push('inflated-double-chance-edge');
  if (Number(prediction.edge ?? 0) >= 0.2) flags.push('overinflated-edge');
  return flags;
}

function atomicRecommendationScore(confidence: number, edge: number, providerCount: number, riskFlagCount: number): number {
  return round((confidence * 0.7) + (Math.max(0, edge) * 0.22) + (providerCount > 1 ? 0.06 : 0) - (riskFlagCount * 0.01), 6);
}

function atomicPredictionKey(prediction: PredictionRecordView): string {
  return legSelectionKey(prediction.fixtureId, prediction.market, prediction.selection, prediction.line);
}

function legSelectionKey(fixtureId: unknown, market: unknown, selection: unknown, line: unknown): string {
  return [
    String(fixtureId ?? ''),
    String(market ?? ''),
    String(selection ?? ''),
    line ?? 'none',
  ].join('|');
}

function hydrateRecommendationDisplay<T extends DailyFinalRecommendation>(
  recommendation: T,
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
): T {
  const displays = fixtureDisplayMap(Object.values(providerPipelineResults).flatMap(displayFixturesFromPipelineResult));
  const hydrateLeg = (leg: any) => {
    const display = displays.get(String(leg.fixtureId ?? ''));
    if (!display) return leg;
    return {
      ...leg,
      fixture: shouldReplaceFixtureLabel(leg.fixture) ? display.fixtureLabel : leg.fixture,
      display,
    };
  };
  return {
    ...recommendation,
    legs: Array.isArray(recommendation.legs) ? recommendation.legs.map(hydrateLeg) : recommendation.legs,
    bankerLegs: Array.isArray(recommendation.bankerLegs) ? recommendation.bankerLegs.map(hydrateLeg) : recommendation.bankerLegs,
  };
}

function fixtureDisplayMap(fixtures: Fixture[]): Map<string, RecommendationLegDisplay> {
  return new Map(fixtures.map((fixture) => {
    const homeTeamName = fixture.homeTeamName ?? fixture.homeTeamId;
    const awayTeamName = fixture.awayTeamName ?? fixture.awayTeamId;
    return [fixture.id, {
      fixtureLabel: `${homeTeamName} vs ${awayTeamName}`,
      homeTeamName,
      awayTeamName,
      ...(fixture.competitionId ? { leagueName: String(fixture.competitionId) } : {}),
      kickoffLocal: fixture.scheduledAt,
    }];
  }));
}

function displayFixturesFromPipelineResult(result: RunPipelineResult | undefined): Fixture[] {
  if (!result) return [];
  return [
    ...(result.fixtures ?? []),
    ...(result.lowOddsScan?.candidateFixtures ?? []),
  ];
}

function recommendationLegsOutsideRequestedDate(
  recommendations: readonly Pick<DailyFinalRecommendation, 'rank' | 'legs'>[],
  date: string,
  timezone?: string,
): string[] {
  const window = fixtureDateRange(date, timezone);
  const offDate: string[] = [];
  for (const recommendation of recommendations) {
    for (const leg of recommendation.legs ?? []) {
      const kickoff = leg.display?.kickoffLocal;
      if (!kickoff) continue;
      const scheduledAt = new Date(kickoff);
      if (!Number.isFinite(scheduledAt.getTime())) continue;
      if (scheduledAt < window.start || scheduledAt >= window.end) {
        offDate.push(`#${recommendation.rank ?? '?'} ${leg.fixture ?? leg.fixtureId} @ ${scheduledAt.toISOString()}`);
      }
    }
  }
  return offDate;
}

function shouldReplaceFixtureLabel(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return true;
  const normalized = value.trim();
  return isUuidLike(normalized) || normalized.split(/\s+vs\.?\s+/i).every(isUuidLike);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boundedDailyChildRunId(dailyBatchId: string, ...parts: string[]): string {
  const raw = [dailyBatchId, ...parts].filter(Boolean).join('-').replace(/[^a-zA-Z0-9._-]/g, '-');
  if (raw.length <= 36) return raw;
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 8);
  return `${raw.slice(0, 27)}-${hash}`;
}

function defaultRepositories(config: AgentConfig): ReturnType<typeof createStorageRepositories> | undefined {
  if (!config.databaseUrl) return undefined;
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstError(
  providers: DailyProviderRunResult[],
  parlays: DailyParlayFamilyResult[],
  analysis: ParlayAnalysisRunResult | undefined,
  metrics: DailyMetricsRunResult | undefined,
): string | undefined {
  return providers.find((item) => item.error)?.error
    ?? parlays.find((item) => item.error)?.error
    ?? analysis?.error
    ?? metrics?.error;
}

function buildDailyReport(summary: any, recommendationsPath: string): string {
  const counts = summary.counts ?? {};
  const lines = [
    `# Daily E2E ${summary.date}`,
    '',
    `dailyBatchId: ${summary.dailyBatchId}`,
    `status: ${summary.status}`,
    `verdict: ${summary.verdict}`,
    '',
    '## Runs',
    ...summary.providers.map((run: DailyProviderRunResult) => (
      `- ${run.provider}: ${run.runId ?? 'none'} ${run.ok ? 'ok' : 'blocked'} ${run.verdict ?? ''}`.trim()
    )),
    '',
    '## Parlays',
    ...summary.parlays.map((family: DailyParlayFamilyResult) => (
      `- ${family.family}: ${family.runId ?? 'none'} ${family.ok ? 'ok' : 'blocked'} ${family.verdict ?? ''}`.trim()
    )),
    '',
    '## Recommendations',
    `artifact: ${recommendationsPath}`,
    `total: ${counts.recommendations ?? 0}`,
    `parlays: ${counts.parlayRecommendations ?? 0}`,
    `simples: ${counts.atomicRecommendations ?? 0}`,
    `fallbackParlays: ${counts.fallbackParlayRecommendations ?? 0}`,
    `fallbackSimples: ${counts.fallbackAtomicRecommendations ?? 0}`,
    '',
    'Artifact analitico. No ejecuta apuestas ni garantiza resultados.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
