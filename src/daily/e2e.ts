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
  bankrollUnits?: number;
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
const DAILY_ATOMIC_RECOMMENDATION_LIMIT = 10;
const ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR = 0.9;
const ATOMIC_RECOMMENDATION_EDGE_FLOOR = 0;
const ATOMIC_RECOMMENDATION_PROFILE = 'atomic-high-confidence';
const DEFAULT_DAILY_BANKROLL_UNITS = 100;

export type DailyFinalRecommendation =
  | (ParlayAnalysisRecommendation & { kind: 'parlay'; stakeRecommendation?: DailyStakeRecommendation })
  | AtomicPredictionRecommendation;

export interface DailyStakeRecommendation {
  units: number;
  percentOfBankroll: number;
  bankrollUnits: number;
  policy: 'full-bankroll-proportional-confidence-edge-allocation';
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
  const bankrollUnits = normalizeDailyBankrollUnits(input.bankrollUnits);
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
  const parlayRecommendations: DailyFinalRecommendation[] = selectDailyParlayRecommendations(
    parlayAnalysis?.top ?? [],
    DAILY_PARLAY_RECOMMENDATION_LIMIT,
  )
    .map((recommendation) => hydrateRecommendationDisplay({ ...recommendation, kind: 'parlay' as const }, providerPipelineResults));
  const parlayLegPredictionIds = recommendationLegPredictionIds(parlayRecommendations);
  const parlayLegSelectionKeys = recommendationLegSelectionKeys(parlayRecommendations);
  const atomicRecommendations = buildAtomicPredictionRecommendations(
    providerPipelineResults,
    providers,
    effectiveConfig,
    input.models,
    parlayRecommendations.length,
    parlayLegPredictionIds,
    parlayLegSelectionKeys,
  ).slice(0, DAILY_ATOMIC_RECOMMENDATION_LIMIT);
  const finalRecommendations: DailyFinalRecommendation[] = applyDailyStakeRecommendations(
    [...parlayRecommendations, ...atomicRecommendations],
    bankrollUnits,
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
  const ok = hasAnySuccessfulProvider
    && hasAnyValidParlayFamily
    && (parlayAnalysis?.ok ?? false)
    && metrics.ok;
  const verdict = ok && hasConsensus && allProvidersSucceeded
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
      bankrollUnits,
    },
    counts: {
      providers: providerCounts,
      parlayFamilies: parlayFamilyCounts,
      recommendations: finalRecommendations.length,
      parlayRecommendations: parlayRecommendations.length,
      atomicRecommendations: atomicRecommendations.length,
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
      parlayDiversity: 'first-pass unique profile, then score fill',
      parlayDiamanteOddsWindow: { min: 1.1, max: 1.3 },
      atomicExcludesSelectedParlayLegs: true,
      stakeAllocation: {
        bankrollUnits,
        unitLabel: 'bank-units',
        totalRecommendedUnits: bankrollUnits,
        totalRecommendedPercentOfBankroll: 1,
        policy: 'full-bankroll-proportional-confidence-edge-allocation',
      },
      atomicConfidenceFloor: ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR,
      atomicEdgeFloor: ATOMIC_RECOMMENDATION_EDGE_FLOOR,
      atomicStatuses: ['promotable'],
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
  const add = (recommendation: ParlayAnalysisRecommendation) => {
    if (selected.length >= limit || usedIds.has(recommendation.parlayId)) return;
    selected.push(recommendation);
    usedIds.add(recommendation.parlayId);
    usedProfiles.add(recommendation.profile);
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

function buildAtomicPredictionRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  config: AgentConfig,
  models: RunDailyE2EInput['models'],
  rankOffset: number,
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
): AtomicPredictionRecommendation[] {
  const groups = new Map<string, AtomicPredictionCandidate[]>();
  for (const provider of providers) {
    const result = providerPipelineResults[provider];
    if (!result?.ok) continue;
    const fixtureDisplays = fixtureDisplayMap(result.fixtures);
    for (const scoring of result.scoring) {
      for (const prediction of scoring.predictions) {
        const edge = atomicPredictionEdge(prediction);
        if (!isAtomicRecommendationEligible(prediction, edge)) continue;
        const key = atomicPredictionKey(prediction);
        if (excludedPredictionIds.has(prediction.id) || excludedSelectionKeys.has(key)) continue;
        const display = fixtureDisplays.get(prediction.fixtureId);
        groups.set(key, [...(groups.get(key) ?? []), {
          provider,
          model: modelForProvider(config, provider, models),
          runId: result.runId,
          prediction,
          fixture: display?.fixtureLabel ?? scoring.fixtureId ?? prediction.fixtureId,
          display,
          edge,
        }]);
      }
    }
  }

  return [...groups.values()]
    .map(toAtomicRecommendationDraft)
    .sort((a, b) => b.score - a.score || b.aggregateConfidence - a.aggregateConfidence || a.combinedOdds - b.combinedOdds)
    .map((recommendation, index) => ({ ...recommendation, rank: rankOffset + index + 1 }));
}

function applyDailyStakeRecommendations<T extends DailyFinalRecommendation>(
  recommendations: readonly T[],
  bankrollUnits: number,
): T[] {
  if (!recommendations.length) return [];
  const weights = recommendations.map(dailyStakeWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || recommendations.length;
  let assignedPercent = 0;
  let assignedUnits = 0;
  return recommendations.map((recommendation, index) => {
    const isLast = index === recommendations.length - 1;
    const rawPercent = totalWeight > 0 ? weights[index] / totalWeight : 1 / recommendations.length;
    const percentOfBankroll = isLast ? round(Math.max(0, 1 - assignedPercent), 6) : round(rawPercent, 6);
    const units = isLast ? round(Math.max(0, bankrollUnits - assignedUnits), 4) : round(bankrollUnits * percentOfBankroll, 4);
    assignedPercent = round(assignedPercent + percentOfBankroll, 6);
    assignedUnits = round(assignedUnits + units, 4);
    return {
      ...recommendation,
      stakeRecommendation: {
        units,
        percentOfBankroll,
        bankrollUnits,
        policy: 'full-bankroll-proportional-confidence-edge-allocation',
      },
    };
  });
}

function dailyStakeWeight(recommendation: DailyFinalRecommendation): number {
  const confidence = clamp(Number(recommendation.aggregateConfidence), 0.01, 0.99);
  const edge = Math.max(0, Number.isFinite(recommendation.expectedEdge) ? recommendation.expectedEdge : 0);
  const odds = Math.max(1.01, Number(recommendation.combinedOdds) || 1.01);
  const profileMultiplier = recommendation.profile === 'parlay-diamante'
    ? 1.3
    : recommendation.profile === 'high-conviction' || recommendation.profile === 'low-variance'
      ? 1.12
      : recommendation.kind === 'atomic-prediction'
        ? 0.82
        : 1;
  const riskPenalty = Math.max(0.55, 1 - ((recommendation.riskFlags?.length ?? 0) * 0.04));
  const oddsDiscipline = 1 / Math.sqrt(odds);
  return Math.max(0.01, (confidence ** 2) * (1 + Math.min(edge, 0.35)) * profileMultiplier * riskPenalty * oddsDiscipline);
}

function normalizeDailyBankrollUnits(value: number | undefined): number {
  const fromEnv = Number(process.env.GANA_DAILY_BANKROLL_UNITS);
  const candidate = value ?? (Number.isFinite(fromEnv) ? fromEnv : DEFAULT_DAILY_BANKROLL_UNITS);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw new Error('daily-e2e bankrollUnits must be a positive number.');
  }
  return round(candidate, 4);
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
  const warnings = prediction.warnings ?? [];
  if (warnings.some((warning) => /stale (?:news|source|odds) source|stale odds|unverified corners|low[-_ ]liquidity h2h short favorite|low_liquidity_h2h_favorite/i.test(warning))) {
    return false;
  }
  return true;
}

function atomicPredictionEdge(prediction: PredictionRecordView): number {
  if (Number.isFinite(prediction.edge)) return prediction.edge as number;
  const probability = prediction.probability ?? prediction.modelProbability ?? prediction.marketFairProbability;
  return Number.isFinite(probability) ? prediction.odds * (probability as number) - 1 : 0;
}

function atomicRiskFlags(prediction: PredictionRecordView, providerCount: number): string[] {
  const flags: string[] = ['single-selection'];
  if (providerCount > 1) flags.push('provider-consensus');
  if (prediction.market === 'corners_over_under') flags.push('corners-market');
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
  const displays = fixtureDisplayMap(Object.values(providerPipelineResults).flatMap((result) => result?.fixtures ?? []));
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
    `top: ${summary.parlayAnalysis?.top?.length ?? 0}`,
    '',
    'Artifact analitico. No ejecuta apuestas ni garantiza resultados.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
