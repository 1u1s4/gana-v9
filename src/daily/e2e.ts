import { createHash } from 'node:crypto';
import type { AgentConfig } from '../config.js';
import { discoverFixtures, type FixtureDiscoveryResult } from '../filters/engine.js';
import { lowOddsScanProviderConfig } from '../filters/low-odds.js';
import { normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import { getApiFootballDateOddsSlate, getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { selectDefaultModelForProvider } from '../providers/agentic/helpers.js';
import { runDailyMetrics, type DailyMetricsRunResult } from '../metrics/daily.js';
import { runParlayAnalysis, type ParlayAnalysisRunResult } from '../parlay/analysis.js';
import { runParlayBuild, type ParlayBuildRunResult, type RunParlayBuildInput } from '../parlay/service.js';
import type { ResearchWebMode } from '../prediction/prompts.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import { getPrismaClient } from '../storage/db.js';
import type { JsonValue, StoragePrismaClient } from '../storage/types.js';
import { createRunArtifactDir, writeArtifact, writeRunJson } from '../runtime/artifacts.js';
import { updateRuntimeContext, type RuntimeContext } from '../runtime/context.js';
import { runPipeline, type RunPipelineResult } from '../runtime/run-service.js';
import type { PipelineValidationMode, RunPipelineDependencies, RunPipelineInput } from '../runtime/pipeline.js';
import { buildDailyProviderComparison, type DailyProviderComparison, type DailyProviderConsensus } from './comparison.js';
import { applyCouncilDecisions, runRecommendationCouncil } from '../council/recommendation-council.js';
import { recommendationArtifactTargets } from '../recommendations/artifact.js';
import { selectDailyOddsFloorStrategy, type DailyOddsFloorStrategySelection } from './odds-floor-strategy.js';
import { DAILY_REQUIRED_LEAGUE_PARLAY_APPROACH_ORDER, buildRequiredLeagueRecommendations, normalizeRequiredLeagues } from './required-leagues.js';
import type { DailyRequiredLeagueArtifact, DailyRequiredLeagueGoalStatus, DailyRequiredLeagueInput, DailyRequiredLeagueParlayProjection } from './required-leagues.js';
import {
  ATOMIC_BLOCKED_RISK_FLAGS,
  ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR,
  ATOMIC_RECOMMENDATION_EDGE_FLOOR,
  ATOMIC_RECOMMENDATION_PROFILE,
  ATOMIC_SAFETY_BREAK_EVEN_EDGE_FLOOR,
  ATOMIC_SAFETY_DOUBLE_CHANCE_MAX_ODDS,
  ATOMIC_SAFETY_DOUBLE_CHANCE_MIN_ODDS,
  ATOMIC_SAFETY_MIN_EFFECTIVE_CONFIDENCE,
  ATOMIC_SAFETY_REVIEW_EDGE_FLOOR,
  ATOMIC_SAFETY_TOTALS_MAX_ODDS,
  DAILY_ATOMIC_RECOMMENDATION_LIMIT,
  DAILY_FALLBACK_PARLAY_LEGS,
  DAILY_FALLBACK_PARLAY_LIMIT,
  DAILY_FINAL_DEMOTED_MODELS,
  DAILY_FINAL_PARLAY_ALLOWED_PROFILES,
  DAILY_FINAL_PARLAY_BLOCKED_PROFILES,
  DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS,
  DAILY_PARLAY_ANALYSIS_TOP,
  DAILY_PARLAY_CONSERVATIVE_MAX_ODDS,
  DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE,
  DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE,
  DAILY_PARLAY_RECOMMENDATION_LIMIT,
  DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
  DAILY_STAKE_BUCKETS,
  VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE,
  VALIDATION_FRESHNESS_MIN_COVERAGE,
  applyDailyStakeRecommendations,
  buildAtomicPredictionRecommendations,
  buildCouncilComposedParlayRecommendations,
  buildDailyParlayApproaches,
  buildFallbackAtomicPredictionRecommendations,
  buildFallbackParlayRecommendations,
  buildMissingDailyFocusParlayRecommendations,
  hydrateRecommendationDisplay,
  recommendationLegFixtureIds,
  recommendationLegPredictionIds,
  recommendationLegSelectionKeys,
  recommendationLegsOutsideRequestedDate,
  round,
  selectDailyFallbackParlayRecommendations,
  selectDailyParlayRecommendations,
  uniqueStrings,
} from './recommendation-policy.js';
import type { AtomicPredictionRecommendation, DailyE2EProvider, DailyFinalRecommendation, DailyParlayProfile } from './types.js';
export type { AtomicPredictionRecommendation, DailyE2EProvider, DailyFinalRecommendation, DailyParlayProfile, DailyRecommendationSelectionMode, DailyStakeRecommendation, RecommendationLegDisplay } from './types.js';
export type { DailyRequiredLeagueInput } from './required-leagues.js';

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
  requiredLeagues?: DailyRequiredLeagueInput[];
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
  family: 'codex-only';
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
  dailyOddsFloorStrategy: DailyOddsFloorStrategySelection;
  requiredLeagueRecommendations?: {
    status: DailyRequiredLeagueGoalStatus;
    fixtureCount: number;
    missingPredictionFixtures: number;
    parlayApproaches: number;
    selectedParlayApproaches: number;
    artifactPath: string;
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

const DEFAULT_DAILY_PROVIDERS: DailyE2EProvider[] = ['codex'];
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

interface DailyRunDiagnostics {
  emptyRun: boolean;
  reasons: string[];
  totalProviderPredictions: number;
  totalProviderPromotablePredictions: number;
  persistedParlays: number;
  persistedRequiredLeagueParlays: number;
  analyzedParlays: number;
  recommendations: number;
  providerPredictionCounts: Record<string, { predictions: number; promotable: number }>;
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
  const requiredLeagues = normalizeRequiredLeagues(input.requiredLeagues);
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
      priorityLeagues: requiredLeagues.map((league) => ({
        providerCompetitionId: league.providerCompetitionId,
        name: league.name,
        season: league.season,
      })),
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
        family: 'codex-only',
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
      parlayFamilies.push(toParlayFamily('codex-only', [runId], result, parlayProfile));
    }
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
        (provider) => modelForProvider(effectiveConfig, provider, input.models),
        DAILY_FALLBACK_PARLAY_LIMIT,
      ).map((recommendation) => hydrateRecommendationDisplay(recommendation, providerPipelineResults));
  }
  const parlayLegPredictionIds = recommendationLegPredictionIds(parlayRecommendations);
  const parlayLegSelectionKeys = recommendationLegSelectionKeys(parlayRecommendations);
  const parlayLegFixtureIds = recommendationLegFixtureIds(parlayRecommendations);
  let atomicRecommendations = buildAtomicPredictionRecommendations(
    providerPipelineResults,
    providers,
    (provider) => modelForProvider(effectiveConfig, provider, input.models),
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
      (provider) => modelForProvider(effectiveConfig, provider, input.models),
      parlayRecommendations.length,
      parlayLegPredictionIds,
      parlayLegSelectionKeys,
      parlayLegFixtureIds,
    ).slice(0, DAILY_ATOMIC_RECOMMENDATION_LIMIT);
  }
  let finalRecommendations: DailyFinalRecommendation[] = applyDailyStakeRecommendations(
    [...parlayRecommendations, ...atomicRecommendations],
  );
  const missingDailyFocusParlays = buildMissingDailyFocusParlayRecommendations({
    recommendations: finalRecommendations,
    candidateRecommendations: [...parlayRecommendations, ...atomicRecommendations],
  });
  if (missingDailyFocusParlays.length) {
    const preferredProfiles = new Set<string>(DAILY_PREFERRED_PARLAY_PROFILE_ORDER);
    const preferredParlays = [
      ...finalRecommendations.filter((recommendation) =>
        recommendation.kind === 'parlay' && preferredProfiles.has(recommendation.profile)
      ),
      ...missingDailyFocusParlays,
    ].sort((a, b) =>
      DAILY_PREFERRED_PARLAY_PROFILE_ORDER.indexOf(a.profile as any)
      - DAILY_PREFERRED_PARLAY_PROFILE_ORDER.indexOf(b.profile as any)
    );
    const preferredLegPredictionIds = recommendationLegPredictionIds(preferredParlays);
    const preferredLegSelectionKeys = recommendationLegSelectionKeys(preferredParlays);
    const preferredLegFixtureIds = recommendationLegFixtureIds(preferredParlays);
    const keepNonPreferredParlays = preferredParlays.length < DAILY_PARLAY_RECOMMENDATION_LIMIT;
    finalRecommendations = applyDailyStakeRecommendations([
      ...preferredParlays,
      ...finalRecommendations.filter((recommendation) => {
        if (recommendation.kind === 'parlay') {
          return keepNonPreferredParlays && !preferredProfiles.has(recommendation.profile);
        }
        const leg = recommendation.legs[0];
        if (!leg) return true;
        if (preferredLegPredictionIds.has(recommendation.predictionId)) return false;
        const selectionKey = legSelectionKeyForDailyRecommendation(leg);
        if (selectionKey && preferredLegSelectionKeys.has(selectionKey)) return false;
        return !preferredLegFixtureIds.has(leg.fixtureId);
      }),
    ]);
  }
  let councilCandidateRecommendations = finalRecommendations;
  let council = runRecommendationCouncil({
    date: input.date,
    dailyBatchId,
    generatedAt: completedAt.toISOString(),
    recommendations: councilCandidateRecommendations,
    providerComparison: providerComparison.summary,
    validationFreshness,
  });
  finalRecommendations = applyCouncilDecisions(finalRecommendations, council);
  if (!finalRecommendations.some((recommendation) => recommendation.kind === 'parlay')) {
    const councilKeptRecommendations = finalRecommendations;
    const councilCandidatesBeforeComposition = councilCandidateRecommendations;
    const councilBeforeComposition = council;
    const composedParlays = buildCouncilComposedParlayRecommendations(finalRecommendations);
    if (composedParlays.length) {
      const parlayPredictionIds = recommendationLegPredictionIds(composedParlays);
      const remainingAtomic = finalRecommendations.filter((recommendation) =>
        recommendation.kind !== 'atomic-prediction' || !parlayPredictionIds.has(recommendation.predictionId)
      );
      councilCandidateRecommendations = applyDailyStakeRecommendations([
        ...composedParlays,
        ...remainingAtomic,
      ]);
      council = runRecommendationCouncil({
        date: input.date,
        dailyBatchId,
        generatedAt: completedAt.toISOString(),
        recommendations: councilCandidateRecommendations,
        providerComparison: providerComparison.summary,
        validationFreshness,
      });
      const composedFinalRecommendations = applyCouncilDecisions(councilCandidateRecommendations, council);
      if (composedFinalRecommendations.some((recommendation) => recommendation.kind === 'parlay')) {
        finalRecommendations = composedFinalRecommendations;
      } else {
        finalRecommendations = councilKeptRecommendations;
        councilCandidateRecommendations = councilCandidatesBeforeComposition;
        council = councilBeforeComposition;
      }
    }
  }
  parlayRecommendations = finalRecommendations.filter((recommendation) => recommendation.kind === 'parlay');
  atomicRecommendations = finalRecommendations.filter((recommendation): recommendation is AtomicPredictionRecommendation => recommendation.kind === 'atomic-prediction');
  const parlayApproaches = buildDailyParlayApproaches({
    recommendations: parlayRecommendations,
    analysisTop: parlayAnalysis?.top ?? [],
    rejected: (parlayAnalysis?.diagnostics as any)?.rejected ?? [],
  });
  const offDateLegs = recommendationLegsOutsideRequestedDate(
    finalRecommendations,
    input.date,
    effectiveConfig.apiFootball.timezone,
  );
  if (offDateLegs.length) {
    throw new Error(`daily recommendations include fixture legs outside requested date ${input.date}: ${offDateLegs.slice(0, 5).join('; ')}`);
  }
  let requiredLeagueArtifact = buildRequiredLeagueRecommendations({
    dailyBatchId,
    date: input.date,
    generatedAt: completedAt.toISOString(),
    providers,
    providerPipelineResults,
    timezone: effectiveConfig.apiFootball.timezone,
    resolveModel: (provider) => modelForProvider(effectiveConfig, provider, input.models),
    requiredLeagues,
  });
  requiredLeagueArtifact = await persistRequiredLeagueParlayProjections({
    repositories,
    artifact: requiredLeagueArtifact,
    dailyBatchId,
    date: input.date,
    generatedAt: completedAt,
  });
  const dailyOddsFloorStrategy = selectDailyOddsFloorStrategy({
    recommendations: finalRecommendations,
    requiredLeagueRecommendations: requiredLeagueArtifact,
  });
  const publishedTargets = recommendationArtifactTargets({
    recommendations: finalRecommendations,
    requiredLeagueRecommendations: requiredLeagueArtifact,
  });
  const requiredLeagueGoalPassed = requiredLeagueArtifact.goalCheck.status === 'passed';
  const requiredLeaguePersistenceReady = requiredLeagueArtifact.persistenceLedger?.status === 'persisted'
    || requiredLeagueArtifact.persistenceLedger?.status === 'not-needed';
  const hasAnyValidParlayFamily = parlayFamilies.some((family) => family.ok);
  const hasAnySuccessfulProvider = providerRuns.some((run) => run.ok);
  const allProvidersSucceeded = providerRuns.every((run) => run.ok);
  const validationFreshEnoughForPromotion = validationFreshness.status === 'fresh';
  const hasAnalyticalRecommendations = finalRecommendations.length > 0;
  const ok = hasAnySuccessfulProvider
    && (hasAnyValidParlayFamily || hasAnalyticalRecommendations)
    && (parlayAnalysis?.ok ?? false)
    && metrics.ok
    && requiredLeaguePersistenceReady;
  const verdict = ok && hasAnyValidParlayFamily && allProvidersSucceeded && validationFreshEnoughForPromotion && requiredLeagueGoalPassed && requiredLeaguePersistenceReady
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
  const runDiagnostics = dailyRunDiagnostics({
    providers,
    providerRuns,
    providerPipelineResults,
    parlayFamilies,
    requiredLeagueArtifact,
    parlayAnalysis,
    metrics,
    validationFreshness,
    recommendations: finalRecommendations,
  });
  if (!requiredLeagueGoalPassed) {
    runDiagnostics.reasons = uniqueStrings([
      ...runDiagnostics.reasons,
      ...requiredLeagueArtifact.goalCheck.checks
        .filter((check) => check.status === 'blocked')
        .flatMap((check) => check.reasons.map((reason) => `required league ${check.name}: ${reason}`)),
    ]);
  }
  const requiredLeagueRecommendationsPath = writeJsonArtifact(
    dailyBatchId,
    'daily-required-league-recommendations.json',
    jsonValue(requiredLeagueArtifact),
  );
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
    runDiagnostics,
    parlayApproaches,
    dailyOddsFloorStrategy,
    requiredLeagueRecommendationsPath,
    requiredLeagueCoverage: requiredLeagueArtifact.coverage,
    requiredLeagueGoalCheck: requiredLeagueArtifact.goalCheck,
    requiredLeaguePersistenceLedger: requiredLeagueArtifact.persistenceLedger,
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
      requiredLeagues,
    },
    counts: {
      providers: providerCounts,
      parlayFamilies: parlayFamilyCounts,
      recommendations: finalRecommendations.length,
      parlayRecommendations: parlayRecommendations.length,
      atomicRecommendations: atomicRecommendations.length,
      strictParlayRecommendations: parlayRecommendations.filter((recommendation) => recommendation.selectionMode !== 'analytical-fallback').length,
      fallbackParlayRecommendations: parlayRecommendations.filter((recommendation) => recommendation.selectionMode === 'analytical-fallback').length,
      strictAtomicRecommendations: atomicRecommendations.filter((recommendation) => recommendation.selectionMode !== 'analytical-fallback').length,
      fallbackAtomicRecommendations: atomicRecommendations.filter((recommendation) => recommendation.selectionMode === 'analytical-fallback').length,
      comparisonItems: providerComparison.items.length,
      consensusPredictions: providerConsensus.summary.consensusPredictions,
      councilApproved: council.approvedCount,
      councilReviewRequired: council.reviewCount,
      councilRejected: council.rejectedCount,
      requiredLeagueFixtures: requiredLeagueArtifact.coverage.fixtureCount,
      requiredLeagueMissingPredictionFixtures: requiredLeagueArtifact.coverage.missingPredictionFixtures,
      requiredLeagueAtomicProjections: requiredLeagueArtifact.atomicProjections.length,
      requiredLeagueParlayApproaches: requiredLeagueArtifact.parlayProjections.length,
      requiredLeagueSelectedParlayApproaches: requiredLeagueArtifact.parlayProjections.filter((item) => item.status === 'selected').length,
      requiredLeaguePersistedParlayApproaches: requiredLeagueArtifact.persistenceLedger?.persistedParlayIds.length ?? 0,
    },
    council: {
      version: council.councilVersion,
      status: council.status,
      approved: council.approvedCount,
      reviewRequired: council.reviewCount,
      rejected: council.rejectedCount,
      panel: council.panel,
      inspiredBy: council.inspiredBy,
    },
    publishedTargets,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
  const providerComparisonPath = writeJsonArtifact(dailyBatchId, 'daily-provider-comparison.json', providerComparison);
  const providerConsensusPath = writeJsonArtifact(dailyBatchId, 'daily-provider-consensus.json', providerConsensus);
  const councilPath = writeJsonArtifact(dailyBatchId, 'recommendation-council.json', council);
  const summaryPath = writeJsonArtifact(dailyBatchId, 'daily-e2e-summary.json', summary);
  const recommendationsPath = writeJsonArtifact(dailyBatchId, 'daily-parlay-recommendations.json', jsonValue({
    dailyBatchId,
    date: input.date,
    sourceRunIds: parlayAnalysisRunIds,
    councilCandidateRecommendations,
    recommendations: finalRecommendations,
    parlayRecommendations,
    atomicRecommendations,
    parlayApproaches,
    dailyOddsFloorStrategy,
    requiredLeagueRecommendationsPath,
    requiredLeagueCoverage: requiredLeagueArtifact.coverage,
    requiredLeagueGoalCheck: requiredLeagueArtifact.goalCheck,
    requiredLeaguePersistenceLedger: requiredLeagueArtifact.persistenceLedger,
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
      atomicConservativeSelection: {
        enabled: true,
        sameFixtureReplacement: 'h2h home/away may be replaced only by the matching double-chance no-loss pick; goals over/under may be replaced only by a safer emitted line in the same direction',
        displayConfidence: 'uses modelProbability/probability as the visible confidence metric when available, while ranking keeps the original confidence/edge score',
        doubleChanceMinOdds: ATOMIC_SAFETY_DOUBLE_CHANCE_MIN_ODDS,
        doubleChanceMaxOdds: ATOMIC_SAFETY_DOUBLE_CHANCE_MAX_ODDS,
        totalsMaxOdds: ATOMIC_SAFETY_TOTALS_MAX_ODDS,
        minEffectiveConfidence: ATOMIC_SAFETY_MIN_EFFECTIVE_CONFIDENCE,
        breakEvenEdgeFloor: ATOMIC_SAFETY_BREAK_EVEN_EDGE_FLOOR,
        reviewEdgeFloor: ATOMIC_SAFETY_REVIEW_EDGE_FLOOR,
      },
      parlayDiamanteOddsWindow: { min: 1.1, max: 1.3 },
      parlayAllInPolicy: {
        enabled: true,
        profile: 'parlay-all-in',
        mode: 'all safe legs without leg-count cap',
        harnessStatus: 'review-required',
      },
      parlayConservativeGate: {
        maxCombinedOdds: DAILY_PARLAY_CONSERVATIVE_MAX_ODDS,
        minAggregateConfidence: DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE,
        diamanteMinAggregateConfidence: DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE,
        semanticDuplicateSignature: 'fixtureId:market:selection:line',
        preferredProfileOrder: DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
        allowedProfiles: DAILY_FINAL_PARLAY_ALLOWED_PROFILES,
        blockedProfiles: DAILY_FINAL_PARLAY_BLOCKED_PROFILES,
        blockedRiskFlags: DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS,
      },
      validationFreshness,
      councilGate: {
        version: council.councilVersion,
        panel: council.panel,
        approveAt: council.policy.approveAt,
        reviewAt: council.policy.reviewAt,
        keepDecisions: council.policy.keepDecisions,
        qualityGate: council.policy.qualityGate,
      },
      requiredLeagueAddendum: {
        enabled: true,
        artifact: 'daily-required-league-recommendations.json',
        leagues: requiredLeagues,
        goalStatus: requiredLeagueArtifact.goalCheck.status,
        missingPredictionFixtures: requiredLeagueArtifact.coverage.missingPredictionFixtures,
        parlayProfiles: DAILY_REQUIRED_LEAGUE_PARLAY_APPROACH_ORDER,
      },
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
    runDiagnostics,
    council,
    publishedTargets,
    persistencePolicy: {
      finalOperationalStore: 'database-ledger',
      renderSnapshot: 'daily-parlay-recommendations.json',
      publicationGate: 'Discord publication must match persisted prediction/parlay IDs in publishedTargets and the live database before sending.',
      validationAndMetricsScope: 'published-recommendations-only',
      predictionIds: publishedTargets.predictionIds,
      parlayIds: publishedTargets.parlayIds,
      candidatePredictions: 'used as transient analytical workspace for ranking, council review, and audit; not used as daily published scope',
    },
    providerComparisonPath,
    providerConsensusPath,
    councilPath,
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
    dailyOddsFloorStrategy,
    requiredLeagueRecommendations: {
      status: requiredLeagueArtifact.goalCheck.status,
      fixtureCount: requiredLeagueArtifact.coverage.fixtureCount,
      missingPredictionFixtures: requiredLeagueArtifact.coverage.missingPredictionFixtures,
      parlayApproaches: requiredLeagueArtifact.parlayProjections.length,
      selectedParlayApproaches: requiredLeagueArtifact.parlayProjections.filter((item) => item.status === 'selected').length,
      artifactPath: requiredLeagueRecommendationsPath,
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

async function persistRequiredLeagueParlayProjections(input: {
  repositories: ReturnType<typeof createStorageRepositories> | undefined;
  artifact: DailyRequiredLeagueArtifact;
  dailyBatchId: string;
  date: string;
  generatedAt: Date;
}): Promise<DailyRequiredLeagueArtifact> {
  const selected = input.artifact.parlayProjections.filter((projection) => projection.status === 'selected');
  const emptyLedger = {
    store: 'parlays' as const,
    expectedParlayCount: selected.length,
    persistedParlayIds: [] as string[],
    failedParlayIds: [] as string[],
  };
  if (!selected.length) {
    return {
      ...input.artifact,
      persistenceLedger: {
        status: 'not-needed',
        ...emptyLedger,
      },
    };
  }
  if (!input.repositories?.parlays?.createWithLegs) {
    return {
      ...input.artifact,
      parlayProjections: input.artifact.parlayProjections.map((projection) =>
        projection.status === 'selected'
          ? { ...projection, persistence: { status: 'skipped', reason: 'database repository unavailable' } }
          : projection
      ),
      persistenceLedger: {
        status: 'skipped',
        ...emptyLedger,
        reason: 'database repository unavailable',
      },
    };
  }

  const persistedParlayIds: string[] = [];
  const failedParlayIds: string[] = [];
  const parlayProjections: DailyRequiredLeagueParlayProjection[] = [];
  for (const projection of input.artifact.parlayProjections) {
    if (projection.status !== 'selected') {
      parlayProjections.push(projection);
      continue;
    }

    const id = requiredLeagueParlayPersistenceId(input.dailyBatchId, input.date, projection);
    try {
      const existing = typeof input.repositories.parlays.findById === 'function'
        ? await input.repositories.parlays.findById(id)
        : null;
      const record = existing ?? await input.repositories.parlays.createWithLegs({
        parlay: {
          id,
          runId: input.dailyBatchId.length <= 36 ? input.dailyBatchId : null,
          combinedOdds: projection.combinedOdds,
          aggregateConfidence: clampPersistenceMetric(projection.aggregateConfidence),
          aggregateQuality: clampPersistenceMetric(projection.adjustedProbability ?? projection.aggregateConfidence),
          rationaleRedacted: projection.reasons.join('; ') || `required-league ${projection.profile} addendum`,
          warnings: projection.riskFlags,
          status: 'review-required',
          generatedAt: input.generatedAt,
          metadata: jsonValue({
            dailyBatchId: input.dailyBatchId,
            date: input.date,
            requiredLeagueAddendum: true,
            originalProjectionId: projection.parlayId,
            profile: projection.profile,
            portfolioProfile: projection.profile,
            league: projection.league,
            sourceRunIds: projection.sourceRunIds,
            providers: projection.providers,
            expectedEdge: projection.expectedEdge,
            riskFlags: projection.riskFlags,
          }),
        },
        legs: projection.legs.map((leg, index) => ({
          predictionId: leg.predictionId,
          fixtureId: leg.fixtureId,
          marketKey: leg.market,
          selectionKey: leg.selection,
          line: leg.line,
          odds: leg.odds,
          status: 'pending',
          legIndex: index,
          inclusionReason: `required-league ${projection.profile} addendum`,
          metadata: jsonValue({
            fixture: leg.fixture,
            display: leg.display,
            confidence: leg.confidence,
            validationStatus: leg.validationStatus,
            warnings: leg.warnings,
            banker: leg.banker,
            bankerReason: leg.bankerReason,
          }),
        })),
      });
      persistedParlayIds.push(record.id);
      parlayProjections.push({
        ...projection,
        parlayId: record.id,
        persistence: { status: 'persisted' },
      });
    } catch (err) {
      failedParlayIds.push(projection.parlayId ?? id);
      parlayProjections.push({
        ...projection,
        persistence: { status: 'failed', reason: errorMessage(err) },
      });
    }
  }

  return {
    ...input.artifact,
    parlayProjections,
    persistenceLedger: {
      status: failedParlayIds.length ? 'partial' : 'persisted',
      store: 'parlays',
      expectedParlayCount: selected.length,
      persistedParlayIds,
      failedParlayIds,
      ...(failedParlayIds.length ? { reason: 'one or more required-league parlays failed to persist' } : {}),
    },
  };
}

function requiredLeagueParlayPersistenceId(
  dailyBatchId: string,
  date: string,
  projection: DailyRequiredLeagueParlayProjection,
): string {
  return deterministicUuid([
    'required-league-parlay',
    dailyBatchId,
    date,
    projection.profile,
    ...projection.legs.map((leg) => [
      leg.predictionId,
      leg.fixtureId,
      leg.market,
      leg.selection,
      leg.line ?? '',
    ].join(':')),
  ].join('|'));
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function clampPersistenceMetric(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return round(Math.min(Math.max(Number(value), 0), 0.9999), 4);
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
  const invalid = values.filter((provider) => provider !== 'codex');
  if (invalid.length) throw new Error(`--providers only supports codex for daily-e2e. Invalid: ${invalid.join(',')}`);
  return Array.from(new Set(values));
}

function normalizeProviderConcurrency(inputConcurrency: number | undefined, providerCount: number): number {
  const envValue = process.env.GANA_DAILY_PROVIDER_CONCURRENCY;
  const parsedEnv = envValue === undefined ? undefined : Number(envValue);
  if (parsedEnv !== undefined && (!Number.isInteger(parsedEnv) || parsedEnv < 1)) {
    throw new Error('GANA_DAILY_PROVIDER_CONCURRENCY must be a positive integer.');
  }
  const requested = inputConcurrency ?? parsedEnv ?? 1;
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

function dailyRunDiagnostics(input: {
  providers: readonly DailyE2EProvider[];
  providerRuns: readonly DailyProviderRunResult[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  parlayFamilies: readonly DailyParlayFamilyResult[];
  requiredLeagueArtifact: DailyRequiredLeagueArtifact;
  parlayAnalysis: ParlayAnalysisRunResult | undefined;
  metrics: DailyMetricsRunResult | undefined;
  validationFreshness: DailyValidationFreshness;
  recommendations: readonly DailyFinalRecommendation[];
}): DailyRunDiagnostics {
  const providerPredictionCountsByProvider = Object.fromEntries(input.providers.map((provider) => [
    provider,
    providerPredictionCounts(input.providerPipelineResults[provider]),
  ]));
  const totalProviderPredictions = Object.values(providerPredictionCountsByProvider)
    .reduce((sum, counts) => sum + counts.predictions, 0);
  const totalProviderPromotablePredictions = Object.values(providerPredictionCountsByProvider)
    .reduce((sum, counts) => sum + counts.promotable, 0);
  const persistedParlays = input.parlayFamilies.reduce((sum, family) => sum + (family.persistedParlayIds?.length ?? 0), 0);
  const persistedRequiredLeagueParlays = input.requiredLeagueArtifact.persistenceLedger?.persistedParlayIds.length ?? 0;
  const analyzedParlays = input.parlayAnalysis?.analyzed ?? 0;
  const recommendations = input.recommendations.length;
  const reasons: string[] = [];

  if (totalProviderPredictions === 0) reasons.push('provider pipelines produced zero predictions');
  if (totalProviderPromotablePredictions === 0 && totalProviderPredictions > 0) reasons.push('provider pipelines produced zero promotable predictions');
  for (const run of input.providerRuns) {
    if (!run.ok) reasons.push(`${run.provider} provider blocked${run.error ? `: ${run.error}` : ''}`);
  }
  if (!persistedParlays) reasons.push('no persisted parlay candidates were produced');
  if (input.requiredLeagueArtifact.persistenceLedger?.status === 'partial') {
    reasons.push('required-league addendum parlay persistence was partial');
  }
  if (input.requiredLeagueArtifact.persistenceLedger?.status === 'skipped'
    && input.requiredLeagueArtifact.persistenceLedger.expectedParlayCount > 0) {
    reasons.push(`required-league addendum parlay persistence skipped: ${input.requiredLeagueArtifact.persistenceLedger.reason ?? 'database unavailable'}`);
  }
  if (!input.parlayAnalysis) reasons.push('parlay analysis was skipped because no usable source run ids were available');
  else if (!analyzedParlays) reasons.push('parlay analysis found zero candidates');
  if (!input.metrics?.ok) reasons.push(`daily metrics unavailable${input.metrics?.error ? `: ${input.metrics.error}` : ''}`);
  if (input.validationFreshness.status === 'empty') reasons.push(...input.validationFreshness.reasons);
  if (!recommendations) reasons.push('no final recommendations survived promotion, fallback, and council gates');

  return {
    emptyRun: totalProviderPredictions === 0 && persistedParlays === 0 && analyzedParlays === 0 && recommendations === 0,
    reasons: uniqueStrings(reasons),
    totalProviderPredictions,
    totalProviderPromotablePredictions,
    persistedParlays,
    persistedRequiredLeagueParlays,
    analyzedParlays,
    recommendations,
    providerPredictionCounts: providerPredictionCountsByProvider,
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
  if (profile === 'portfolio-v2') return ['parlay-diamante', 'parlay-refinado', 'parlay-all-in', 'low-odds-top', 'low-variance', 'balanced', 'market-diverse', 'high-conviction', 'parlay-oro'];
  if (profile === 'balanced') return ['balanced'];
  return [profile];
}

function legSelectionKeyForDailyRecommendation(leg: DailyFinalRecommendation['legs'][number]): string {
  return [
    leg.fixtureId,
    leg.market,
    leg.selection,
    leg.line ?? '',
  ].join(':');
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
  const oddsFloorStrategy = summary.dailyOddsFloorStrategy ?? {};
  const oddsFloorPick = oddsFloorStrategy.selectedPick ?? null;
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
    '## Daily Odds Floor Strategy',
    `status: ${oddsFloorStrategy.status ?? 'unknown'}`,
    `rule: publishedOdds >= ${oddsFloorStrategy.rule?.minimumPublishedOdds ?? 1.45}; highest publishedConfidence`,
    `eligible: ${oddsFloorStrategy.eligiblePickCount ?? 0}/${oddsFloorStrategy.evaluatedPickCount ?? 0}`,
    oddsFloorPick
      ? `selection: ${oddsFloorPick.source} | ${oddsFloorPick.profile} | ${oddsFloorPick.id} | odds ${oddsFloorPick.publishedOdds} | confidence ${oddsFloorPick.publishedConfidence}`
      : 'selection: none',
    '',
    '## Diagnostics',
    `emptyRun: ${Boolean(summary.runDiagnostics?.emptyRun)}`,
    ...((summary.runDiagnostics?.reasons ?? []).map((reason: string) => `- ${reason}`)),
    '',
    'Artifact analitico. No ejecuta apuestas ni garantiza resultados.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
