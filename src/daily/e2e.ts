import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { applyCouncilDecisions, runRecommendationCouncil } from '../council/recommendation-council.js';
import { recommendationArtifactTargets } from '../recommendations/artifact.js';

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
  | 'parlay-all-in'
  | 'parlay-refinado'
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
  requiredLeagues?: DailyRequiredLeagueInput[];
}

export interface DailyRequiredLeagueInput {
  providerCompetitionId: string;
  name?: string;
  country?: string;
  season?: number | null;
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

const DEFAULT_DAILY_PROVIDERS: DailyE2EProvider[] = ['codex', 'gemini'];
const DAILY_PARLAY_RECOMMENDATION_LIMIT = 3;
const DAILY_PARLAY_ANALYSIS_TOP = 12;
const DAILY_FALLBACK_PARLAY_LIMIT = 3;
const DAILY_FALLBACK_PARLAY_LEGS = 2;
const DAILY_COUNCIL_COMPOSED_PARLAY_LIMIT = 3;
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
const DAILY_PREFERRED_PARLAY_PROFILE_ORDER = ['parlay-diamante', 'parlay-refinado', 'low-variance'] as const;
const DAILY_FINAL_PARLAY_ALLOWED_PROFILES = ['parlay-diamante', 'parlay-refinado', 'parlay-all-in', 'low-odds-top', 'low-variance'] as const;
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
const DAILY_REQUIRED_LEAGUE_DEFAULTS: DailyRequiredLeagueInput[] = [
  { providerCompetitionId: '1', name: 'World Cup', country: 'World', season: 2026 },
];
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

type DailyRequiredLeagueGoalStatus = 'passed' | 'review-required';

interface DailyRequiredLeagueDefinition {
  providerCompetitionId: string;
  name?: string;
  country?: string;
  season?: number | null;
}

interface DailyRequiredLeagueCoverageFixture {
  fixtureId: string;
  providerFixtureId: string;
  fixture: string;
  display?: RecommendationLegDisplay;
  league: DailyRequiredLeagueDefinition;
  scheduledAt: string;
  status: 'covered' | 'missing-predictions';
  predictionCount: number;
  promotableCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
  providers: Record<string, {
    runId: string | null;
    fixtureSelected: boolean;
    predictionCount: number;
    promotableCount: number;
    reviewRequiredCount: number;
    blockedCount: number;
    gateVerdict: string | null;
    reasons: string[];
    warnings: string[];
  }>;
  reasons: string[];
}

interface DailyRequiredLeagueAtomicProjection {
  kind: 'required-league-atomic-projection';
  rank: number;
  projectionId: string;
  predictionId: string;
  sourceRunId: string | null;
  sourceRunIds: string[];
  provider: DailyE2EProvider;
  providers: DailyE2EProvider[];
  model: string;
  league: DailyRequiredLeagueDefinition;
  fixtureId: string;
  providerFixtureId: string;
  fixture: string;
  display?: RecommendationLegDisplay;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  confidence: number;
  expectedEdge: number;
  status: string;
  warnings: string[];
  reasons: string[];
  rationale?: string;
}

interface DailyRequiredLeagueParlayProjection {
  kind: 'required-league-parlay-projection';
  profile: typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number];
  status: 'selected' | 'blocked';
  parlayId: string | null;
  league: DailyRequiredLeagueDefinition;
  combinedOdds: number | null;
  aggregateConfidence: number | null;
  adjustedProbability: number | null;
  expectedEdge: number | null;
  sourceRunIds: string[];
  providers: DailyE2EProvider[];
  legs: ParlayAnalysisRecommendation['legs'];
  reasons: string[];
  riskFlags: string[];
}

interface DailyRequiredLeagueArtifact {
  dailyBatchId: string;
  date: string;
  generatedAt: string;
  requiredLeagues: DailyRequiredLeagueDefinition[];
  coverage: {
    status: 'complete' | 'review-required' | 'not-scheduled';
    fixtureCount: number;
    coveredFixtures: number;
    missingPredictionFixtures: number;
    fixtures: DailyRequiredLeagueCoverageFixture[];
  };
  atomicProjections: DailyRequiredLeagueAtomicProjection[];
  parlayProjections: DailyRequiredLeagueParlayProjection[];
  goalCheck: {
    objective: string;
    status: DailyRequiredLeagueGoalStatus;
    checks: Array<{
      name: string;
      status: 'passed' | 'blocked';
      reasons: string[];
    }>;
    nextActions: string[];
  };
  recommendationPolicy: {
    scope: 'required-league-addendum';
    defaultRequiredLeagues: DailyRequiredLeagueInput[];
    parlayProfiles: readonly typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number][];
    atomicSelection: string;
    parlaySelection: string;
  };
  analyticalArtifactOnly: true;
  executionCapability: 'none';
}

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

interface DailyRunDiagnostics {
  emptyRun: boolean;
  reasons: string[];
  totalProviderPredictions: number;
  totalProviderPromotablePredictions: number;
  persistedParlays: number;
  analyzedParlays: number;
  recommendations: number;
  providerPredictionCounts: Record<string, { predictions: number; promotable: number }>;
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
  let finalRecommendations: DailyFinalRecommendation[] = applyDailyStakeRecommendations(
    [...parlayRecommendations, ...atomicRecommendations],
  );
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
      finalRecommendations = applyCouncilDecisions(councilCandidateRecommendations, council);
    }
  }
  parlayRecommendations = finalRecommendations.filter((recommendation) => recommendation.kind === 'parlay');
  atomicRecommendations = finalRecommendations.filter((recommendation): recommendation is AtomicPredictionRecommendation => recommendation.kind === 'atomic-prediction');
  const parlayApproaches = buildDailyParlayApproaches({
    recommendations: parlayRecommendations,
    analysisTop: parlayAnalysis?.top ?? [],
    rejected: (parlayAnalysis?.diagnostics as any)?.rejected ?? [],
  });
  const publishedTargets = recommendationArtifactTargets({ recommendations: finalRecommendations });
  const offDateLegs = recommendationLegsOutsideRequestedDate(
    finalRecommendations,
    input.date,
    effectiveConfig.apiFootball.timezone,
  );
  if (offDateLegs.length) {
    throw new Error(`daily recommendations include fixture legs outside requested date ${input.date}: ${offDateLegs.slice(0, 5).join('; ')}`);
  }
  const requiredLeagueArtifact = buildRequiredLeagueRecommendations({
    dailyBatchId,
    date: input.date,
    generatedAt: completedAt.toISOString(),
    providers,
    providerPipelineResults,
    config: effectiveConfig,
    models: input.models,
    requiredLeagues,
  });
  const requiredLeagueGoalPassed = requiredLeagueArtifact.goalCheck.status === 'passed';
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
  const verdict = ok && hasConsensus && allProvidersSucceeded && validationFreshEnoughForPromotion && requiredLeagueGoalPassed
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
    requiredLeagueRecommendationsPath,
    requiredLeagueCoverage: requiredLeagueArtifact.coverage,
    requiredLeagueGoalCheck: requiredLeagueArtifact.goalCheck,
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
    requiredLeagueRecommendationsPath,
    requiredLeagueCoverage: requiredLeagueArtifact.coverage,
    requiredLeagueGoalCheck: requiredLeagueArtifact.goalCheck,
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
        feedbackLoopArtifact: council.feedbackLoop.outcomeArtifact,
      },
      requiredLeagueAddendum: {
        enabled: true,
        artifact: 'daily-required-league-recommendations.json',
        leagues: requiredLeagues,
        goalStatus: requiredLeagueArtifact.goalCheck.status,
        missingPredictionFixtures: requiredLeagueArtifact.coverage.missingPredictionFixtures,
        parlayProfiles: DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
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
      finalOperationalStore: 'daily-parlay-recommendations.json',
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

function dailyRunDiagnostics(input: {
  providers: readonly DailyE2EProvider[];
  providerRuns: readonly DailyProviderRunResult[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  parlayFamilies: readonly DailyParlayFamilyResult[];
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
  const analyzedParlays = input.parlayAnalysis?.analyzed ?? 0;
  const recommendations = input.recommendations.length;
  const reasons: string[] = [];

  if (totalProviderPredictions === 0) reasons.push('provider pipelines produced zero predictions');
  if (totalProviderPromotablePredictions === 0 && totalProviderPredictions > 0) reasons.push('provider pipelines produced zero promotable predictions');
  for (const run of input.providerRuns) {
    if (!run.ok) reasons.push(`${run.provider} provider blocked${run.error ? `: ${run.error}` : ''}`);
  }
  if (!persistedParlays) reasons.push('no persisted parlay candidates were produced');
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
    analyzedParlays,
    recommendations,
    providerPredictionCounts: providerPredictionCountsByProvider,
  };
}

function normalizeRequiredLeagues(input: DailyRequiredLeagueInput[] | undefined): DailyRequiredLeagueDefinition[] {
  const fromEnv = parseRequiredLeaguesEnv(process.env.GANA_DAILY_REQUIRED_LEAGUES);
  const source = input ?? fromEnv ?? DAILY_REQUIRED_LEAGUE_DEFAULTS;
  const defaultsById = new Map(DAILY_REQUIRED_LEAGUE_DEFAULTS.map((league) => [league.providerCompetitionId, league]));
  const seen = new Set<string>();
  const normalized: DailyRequiredLeagueDefinition[] = [];

  for (const league of source) {
    const providerCompetitionId = String(league.providerCompetitionId ?? '').trim();
    if (!providerCompetitionId) continue;
    const defaultLeague = defaultsById.get(providerCompetitionId);
    const season = league.season === undefined
      ? defaultLeague?.season ?? null
      : league.season;
    if (season !== null && season !== undefined && (!Number.isInteger(season) || season < 1900)) {
      throw new Error(`required league ${providerCompetitionId} has invalid season ${String(season)}.`);
    }
    const key = `${providerCompetitionId}:${season ?? 'any'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      providerCompetitionId,
      name: league.name ?? defaultLeague?.name,
      country: league.country ?? defaultLeague?.country,
      season: season ?? null,
    });
  }

  return normalized;
}

function parseRequiredLeaguesEnv(value: string | undefined): DailyRequiredLeagueInput[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(off|false|none|disabled|0)$/i.test(trimmed)) return [];
  return trimmed.split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [providerCompetitionId, name, country, seasonText] = token.split(':').map((part) => part.trim());
      const season = seasonText ? Number(seasonText) : undefined;
      return {
        providerCompetitionId,
        ...(name ? { name } : {}),
        ...(country ? { country } : {}),
        ...(season !== undefined ? { season } : {}),
      };
    });
}

function buildRequiredLeagueRecommendations(input: {
  dailyBatchId: string;
  date: string;
  generatedAt: string;
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  config: AgentConfig;
  models: RunDailyE2EInput['models'];
  requiredLeagues: readonly DailyRequiredLeagueDefinition[];
}): DailyRequiredLeagueArtifact {
  const coverageFixtures = collectRequiredLeagueCoverageFixtures(input);
  const atomicProjections = buildRequiredLeagueAtomicProjections({
    ...input,
    coverageFixtures,
  });
  const parlayProjections = input.requiredLeagues.flatMap((league) => {
    const leagueFixtures = coverageFixtures.filter((fixture) => sameRequiredLeague(fixture.league, league));
    if (!leagueFixtures.length) return [];
    return buildRequiredLeagueParlayProjections(
      league,
      atomicProjections.filter((projection) => sameRequiredLeague(projection.league, league)),
      leagueFixtures.length,
    );
  });

  const missingPredictionFixtures = coverageFixtures.filter((fixture) => fixture.status === 'missing-predictions');
  const coveredFixtures = coverageFixtures.length - missingPredictionFixtures.length;
  const selectedParlayApproaches = parlayProjections.filter((projection) => projection.status === 'selected').length;
  const parlayBlocked = coverageFixtures.length > 1
    && input.requiredLeagues.some((league) => {
      const leagueFixtureCount = coverageFixtures.filter((fixture) => sameRequiredLeague(fixture.league, league)).length;
      if (leagueFixtureCount <= 1) return false;
      return parlayProjections
        .filter((projection) => sameRequiredLeague(projection.league, league))
        .some((projection) => projection.status === 'blocked');
    });
  const coverageStatus = !coverageFixtures.length
    ? 'not-scheduled'
    : missingPredictionFixtures.length || parlayBlocked
      ? 'review-required'
      : 'complete';

  const goalChecks = [
    {
      name: 'fixtures-discovered',
      status: 'passed' as const,
      reasons: coverageFixtures.length
        ? [`${coverageFixtures.length} required-league fixture(s) discovered for ${input.date}`]
        : [`no required-league fixtures discovered for ${input.date}`],
    },
    {
      name: 'atomic-projection-coverage',
      status: missingPredictionFixtures.length ? 'blocked' as const : 'passed' as const,
      reasons: missingPredictionFixtures.length
        ? missingPredictionFixtures.map((fixture) => `${fixture.fixture} has no non-blocked prediction`)
        : [`${coveredFixtures} required-league fixture(s) have non-blocked projections`],
    },
    {
      name: 'three-parlay-approaches',
      status: parlayBlocked ? 'blocked' as const : 'passed' as const,
      reasons: parlayBlocked
        ? parlayProjections
          .filter((projection) => projection.status === 'blocked')
          .flatMap((projection) => projection.reasons.map((reason) => `${projection.league.name ?? projection.league.providerCompetitionId} ${projection.profile}: ${reason}`))
        : selectedParlayApproaches
          ? [`${selectedParlayApproaches} required-league parlay approach(es) generated`]
          : ['no required-league parlay was needed because fewer than two fixtures were scheduled or discovered'],
    },
  ];
  const goalStatus: DailyRequiredLeagueGoalStatus = goalChecks.some((check) => check.status === 'blocked')
    ? 'review-required'
    : 'passed';
  const nextActions = goalStatus === 'passed'
    ? []
    : uniqueStrings([
      ...missingPredictionFixtures.map((fixture) => `retry research/scoring for ${fixture.providerFixtureId} (${fixture.fixture}) with fresh web evidence`),
      ...(parlayBlocked ? ['rerun required-league addendum after every required fixture has a non-blocked projection'] : []),
    ]);

  return {
    dailyBatchId: input.dailyBatchId,
    date: input.date,
    generatedAt: input.generatedAt,
    requiredLeagues: [...input.requiredLeagues],
    coverage: {
      status: coverageStatus,
      fixtureCount: coverageFixtures.length,
      coveredFixtures,
      missingPredictionFixtures: missingPredictionFixtures.length,
      fixtures: coverageFixtures,
    },
    atomicProjections,
    parlayProjections,
    goalCheck: {
      objective: 'required league daily projections and three parlay approaches',
      status: goalStatus,
      checks: goalChecks,
      nextActions,
    },
    recommendationPolicy: {
      scope: 'required-league-addendum',
      defaultRequiredLeagues: DAILY_REQUIRED_LEAGUE_DEFAULTS,
      parlayProfiles: DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
      atomicSelection: 'best non-blocked prediction per required fixture, promotable preferred over review-required',
      parlaySelection: 'two distinct required-league fixtures per approach, review-only analytical addendum',
    },
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
}

function collectRequiredLeagueCoverageFixtures(input: {
  date: string;
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  config: AgentConfig;
  requiredLeagues: readonly DailyRequiredLeagueDefinition[];
}): DailyRequiredLeagueCoverageFixture[] {
  const fixturesById = new Map<string, Fixture>();
  for (const result of Object.values(input.providerPipelineResults)) {
    for (const fixture of displayFixturesFromPipelineResult(result)) {
      const league = requiredLeagueForFixture(fixture, input.requiredLeagues);
      if (!league) continue;
      if (!fixtureFallsOnDate(fixture, input.date, input.config.apiFootball.timezone)) continue;
      const key = fixture.id || fixture.providerFixtureId;
      const current = fixturesById.get(key);
      if (!current || fixtureDisplayQuality(fixtureDisplay(fixture) ?? emptyFixtureDisplay()) > fixtureDisplayQuality(fixtureDisplay(current) ?? emptyFixtureDisplay())) {
        fixturesById.set(key, fixture);
      }
    }
  }

  return [...fixturesById.values()]
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .map((fixture) => coverageFixtureFromPipelineResults(fixture, input));
}

function coverageFixtureFromPipelineResults(
  fixture: Fixture,
  input: {
    providers: readonly DailyE2EProvider[];
    providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
    requiredLeagues: readonly DailyRequiredLeagueDefinition[];
  },
): DailyRequiredLeagueCoverageFixture {
  const league = requiredLeagueForFixture(fixture, input.requiredLeagues) ?? {
    providerCompetitionId: String(fixture.leagueId ?? fixture.competitionId ?? ''),
    name: fixture.competitionName,
    season: fixture.season ?? null,
  };
  const display = fixtureDisplay(fixture);
  const providers = Object.fromEntries(input.providers.map((provider) => {
    const result = input.providerPipelineResults[provider];
    const scoring = (result?.scoring ?? []).filter((item) => scoringMatchesFixture(item, fixture));
    const predictions = scoring.flatMap((item) => item.predictions);
    return [provider, {
      runId: result?.runId ?? null,
      fixtureSelected: displayFixturesFromPipelineResult(result).some((item) => sameFixture(item, fixture)),
      predictionCount: predictions.length,
      promotableCount: predictions.filter((prediction) => prediction.status === 'promotable').length,
      reviewRequiredCount: predictions.filter((prediction) => prediction.status === 'review-required').length,
      blockedCount: predictions.filter((prediction) => prediction.status === 'blocked').length,
      gateVerdict: uniqueStrings(scoring.map((item) => item.gateResult.verdict)).join(',') || null,
      reasons: uniqueStrings(scoring.flatMap((item) => item.gateResult.reasons ?? [])),
      warnings: uniqueStrings(scoring.flatMap((item) => item.gateResult.warnings ?? [])),
    }];
  }));
  const providerValues = Object.values(providers);
  const predictionCount = providerValues.reduce((sum, provider) => sum + provider.predictionCount, 0);
  const promotableCount = providerValues.reduce((sum, provider) => sum + provider.promotableCount, 0);
  const reviewRequiredCount = providerValues.reduce((sum, provider) => sum + provider.reviewRequiredCount, 0);
  const blockedCount = providerValues.reduce((sum, provider) => sum + provider.blockedCount, 0);
  const projectableCount = predictionCount - blockedCount;
  const reasons = uniqueStrings([
    ...(projectableCount > 0 ? [] : ['no non-blocked prediction was produced for this required fixture']),
    ...providerValues.flatMap((provider) => provider.reasons),
    ...providerValues.flatMap((provider) => provider.warnings),
  ]);

  return {
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    fixture: display?.fixtureLabel ?? `${fixture.homeTeamName ?? fixture.homeTeamId} vs ${fixture.awayTeamName ?? fixture.awayTeamId}`,
    ...(display ? { display } : {}),
    league,
    scheduledAt: fixture.scheduledAt,
    status: projectableCount > 0 ? 'covered' : 'missing-predictions',
    predictionCount,
    promotableCount,
    reviewRequiredCount,
    blockedCount,
    providers,
    reasons,
  };
}

function buildRequiredLeagueAtomicProjections(input: {
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  config: AgentConfig;
  models: RunDailyE2EInput['models'];
  coverageFixtures: readonly DailyRequiredLeagueCoverageFixture[];
}): DailyRequiredLeagueAtomicProjection[] {
  const requiredFixturesById = new Map(input.coverageFixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const requiredFixturesByProviderId = new Map(input.coverageFixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
  const groups = new Map<string, AtomicPredictionCandidate[]>();

  for (const provider of input.providers) {
    const result = input.providerPipelineResults[provider];
    if (!result?.runId) continue;
    const providerModel = modelForProvider(input.config, provider, input.models);
    for (const scoring of result.scoring) {
      const requiredFixture = requiredFixturesById.get(scoring.fixtureId ?? '')
        ?? requiredFixturesByProviderId.get(scoring.providerFixtureId ?? '');
      if (!requiredFixture) continue;
      for (const prediction of scoring.predictions) {
        if (prediction.status === 'blocked') continue;
        if (!isFallbackPredictionCandidate(prediction)) continue;
        const display = requiredFixture.display;
        const candidate: AtomicPredictionCandidate = {
          provider,
          model: prediction.model ?? providerModel,
          runId: result.runId,
          prediction,
          fixture: requiredFixture.fixture,
          display,
          edge: atomicPredictionEdge(prediction),
        };
        const key = `${prediction.fixtureId}:${atomicPredictionKey(prediction)}`;
        groups.set(key, [...(groups.get(key) ?? []), candidate]);
      }
    }
  }

  const drafts = [...groups.values()]
    .map((candidates) => toRequiredLeagueAtomicProjection(candidates, requiredFixturesById, requiredFixturesByProviderId))
    .filter((projection): projection is DailyRequiredLeagueAtomicProjection => Boolean(projection))
    .sort((a, b) =>
      requiredAtomicProjectionScore(b) - requiredAtomicProjectionScore(a)
      || b.confidence - a.confidence
      || a.odds - b.odds
    );
  const selected: DailyRequiredLeagueAtomicProjection[] = [];
  const usedFixtureIds = new Set<string>();
  for (const projection of drafts) {
    if (usedFixtureIds.has(projection.fixtureId)) continue;
    usedFixtureIds.add(projection.fixtureId);
    selected.push({ ...projection, rank: selected.length + 1 });
  }
  return selected;
}

function toRequiredLeagueAtomicProjection(
  candidates: AtomicPredictionCandidate[],
  requiredFixturesById: ReadonlyMap<string, DailyRequiredLeagueCoverageFixture>,
  requiredFixturesByProviderId: ReadonlyMap<string, DailyRequiredLeagueCoverageFixture>,
): DailyRequiredLeagueAtomicProjection | undefined {
  const ordered = [...candidates].sort((a, b) =>
    requiredPredictionCandidateScore(b) - requiredPredictionCandidateScore(a)
    || b.prediction.confidence - a.prediction.confidence
    || a.prediction.odds - b.prediction.odds
  );
  const primary = ordered[0];
  if (!primary) return undefined;
  const fixture = requiredFixturesById.get(primary.prediction.fixtureId)
    ?? requiredFixturesByProviderId.get(primary.prediction.providerFixtureId ?? '');
  if (!fixture) return undefined;
  const providers = uniqueStrings(ordered.map((candidate) => candidate.provider)) as DailyE2EProvider[];
  const sourceRunIds = uniqueStrings(ordered.map((candidate) => candidate.runId));
  const confidence = round(average(ordered.map((candidate) => candidate.prediction.confidence)), 6);
  const edge = round(average(ordered.map((candidate) => candidate.edge)), 6);
  const warnings = uniqueStrings(ordered.flatMap((candidate) => [
    ...(candidate.prediction.warnings ?? []),
    ...(candidate.prediction.blockers ?? []),
  ]));

  return {
    kind: 'required-league-atomic-projection',
    rank: 0,
    projectionId: `required-atomic-${createHash('sha256')
      .update(ordered.map((candidate) => candidate.prediction.id).join('|'))
      .digest('hex')
      .slice(0, 16)}`,
    predictionId: primary.prediction.id,
    sourceRunId: primary.runId,
    sourceRunIds,
    provider: primary.provider,
    providers,
    model: primary.model,
    league: fixture.league,
    fixtureId: fixture.fixtureId,
    providerFixtureId: fixture.providerFixtureId,
    fixture: fixture.fixture,
    ...(fixture.display ? { display: fixture.display } : {}),
    market: primary.prediction.market,
    selection: primary.prediction.selection,
    line: primary.prediction.line ?? null,
    odds: round(primary.prediction.odds, 6),
    confidence,
    expectedEdge: edge,
    status: primary.prediction.status,
    warnings,
    reasons: uniqueStrings([
      `required league ${fixture.league.name ?? fixture.league.providerCompetitionId}`,
      `best available non-blocked projection for ${fixture.fixture}`,
      providers.length > 1 ? `provider agreement: ${providers.join(', ')}` : `provider: ${primary.provider}`,
      `confidence ${round(confidence, 3)}`,
      `edge ${round(edge, 3)}`,
    ]),
    ...(primary.prediction.rationale ? { rationale: primary.prediction.rationale } : {}),
  };
}

function buildRequiredLeagueParlayProjections(
  league: DailyRequiredLeagueDefinition,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  fixtureCount: number,
): DailyRequiredLeagueParlayProjection[] {
  return DAILY_PREFERRED_PARLAY_PROFILE_ORDER.map((profile) => {
    const legs = selectRequiredLeagueParlayLegs(profile, atomicProjections);
    if (fixtureCount < 2 || legs.length < 2) {
      return {
        kind: 'required-league-parlay-projection',
        profile,
        status: 'blocked',
        parlayId: null,
        league,
        combinedOdds: null,
        aggregateConfidence: null,
        adjustedProbability: null,
        expectedEdge: null,
        sourceRunIds: [],
        providers: [],
        legs: [],
        reasons: uniqueStrings([
          fixtureCount < 2 ? 'fewer than two required-league fixtures were scheduled or discovered' : '',
          legs.length < 2 ? 'fewer than two required-league fixtures have non-blocked projections' : '',
        ]),
        riskFlags: ['required-league-addendum', 'blocked'],
      } satisfies DailyRequiredLeagueParlayProjection;
    }
    const combinedOdds = round(legs.reduce((product, projection) => product * projection.odds, 1), 6);
    const aggregateConfidence = round(legs.reduce((product, projection) => product * clamp(projection.confidence, 0.01, 0.99), 1), 6);
    const adjustedProbability = round(clamp(aggregateConfidence, 0.01, 0.99), 6);
    const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
    const sourceRunIds = uniqueStrings(legs.flatMap((projection) => projection.sourceRunIds));
    const providers = uniqueStrings(legs.flatMap((projection) => projection.providers)) as DailyE2EProvider[];
    return {
      kind: 'required-league-parlay-projection',
      profile,
      status: 'selected',
      parlayId: `required-${profile}-${createHash('sha256')
        .update(legs.map((projection) => projection.predictionId).join('|'))
        .digest('hex')
        .slice(0, 16)}`,
      league,
      combinedOdds,
      aggregateConfidence,
      adjustedProbability,
      expectedEdge,
      sourceRunIds,
      providers,
      legs: legs.map(requiredLeagueParlayLeg),
      reasons: [
        `required league ${league.name ?? league.providerCompetitionId}`,
        `generated ${profile} addendum from ${legs.length} distinct required fixtures`,
        `providers: ${providers.join(', ') || 'unknown'}`,
      ],
      riskFlags: uniqueStrings([
        'required-league-addendum',
        'review-required',
        ...(expectedEdge <= 0 ? ['non-positive-expected-edge'] : []),
      ]),
    } satisfies DailyRequiredLeagueParlayProjection;
  });
}

function selectRequiredLeagueParlayLegs(
  profile: typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number],
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
): DailyRequiredLeagueAtomicProjection[] {
  const ordered = [...atomicProjections]
    .sort((a, b) => requiredLeagueParlayLegScore(profile, b) - requiredLeagueParlayLegScore(profile, a));
  const selected: DailyRequiredLeagueAtomicProjection[] = [];
  const usedFixtureIds = new Set<string>();
  for (const projection of ordered) {
    if (usedFixtureIds.has(projection.fixtureId)) continue;
    selected.push(projection);
    usedFixtureIds.add(projection.fixtureId);
    if (selected.length >= 2) break;
  }
  return selected;
}

function requiredLeagueParlayLegScore(
  profile: typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number],
  projection: DailyRequiredLeagueAtomicProjection,
): number {
  const oddsPenalty = Math.log2(Math.max(1.01, projection.odds)) * (profile === 'parlay-diamante' ? 0.12 : 0.04);
  const confidenceWeight = profile === 'low-variance' ? 0.85 : 0.72;
  const edgeWeight = profile === 'parlay-refinado' ? 0.32 : 0.2;
  const statusBonus = projection.status === 'promotable' ? 0.18 : projection.status === 'review-required' ? 0.08 : 0;
  const diamanteWindowBonus = profile === 'parlay-diamante' && projection.odds >= 1.08 && projection.odds <= 1.35 ? 0.08 : 0;
  return round((projection.confidence * confidenceWeight) + (Math.max(0, projection.expectedEdge) * edgeWeight) + statusBonus + diamanteWindowBonus - oddsPenalty, 6);
}

function requiredLeagueParlayLeg(projection: DailyRequiredLeagueAtomicProjection): ParlayAnalysisRecommendation['legs'][number] {
  return {
    predictionId: projection.predictionId,
    fixtureId: projection.fixtureId,
    fixture: projection.fixture,
    ...(projection.display ? { display: projection.display } : {}),
    market: projection.market,
    selection: projection.selection,
    line: projection.line,
    odds: projection.odds,
    confidence: projection.confidence,
    validationStatus: 'unvalidated',
    warnings: projection.warnings,
    banker: true,
    bankerReason: `required-league addendum leg: confidence ${round(projection.confidence, 3)} edge ${round(projection.expectedEdge, 3)}`,
  };
}

function requiredPredictionCandidateScore(candidate: AtomicPredictionCandidate): number {
  const prediction = candidate.prediction;
  const statusBonus = prediction.status === 'promotable'
    ? 0.5
    : prediction.status === 'candidate'
      ? 0.3
      : prediction.status === 'review-required'
        ? 0.2
        : prediction.status === 'draft'
          ? 0.05
          : -0.5;
  const oddsPenalty = Math.log2(Math.max(1.01, prediction.odds)) * 0.04;
  return round(statusBonus + (prediction.confidence * 0.72) + (Math.max(0, candidate.edge) * 0.3) - oddsPenalty, 6);
}

function requiredAtomicProjectionScore(projection: DailyRequiredLeagueAtomicProjection): number {
  const statusBonus = projection.status === 'promotable' ? 0.2 : projection.status === 'review-required' ? 0.08 : 0;
  return round(statusBonus + (projection.confidence * 0.72) + (Math.max(0, projection.expectedEdge) * 0.3), 6);
}

function requiredLeagueForFixture(
  fixture: Fixture,
  requiredLeagues: readonly DailyRequiredLeagueDefinition[],
): DailyRequiredLeagueDefinition | undefined {
  return requiredLeagues.find((league) => {
    const idMatches = String(fixture.leagueId ?? fixture.competitionId ?? '') === league.providerCompetitionId;
    const nameMatches = league.name && fixture.competitionName
      ? fixture.competitionName.trim().toLowerCase() === league.name.trim().toLowerCase()
      : false;
    if (!idMatches && !nameMatches) return false;
    if (league.season !== null && league.season !== undefined && fixture.season !== undefined && fixture.season !== league.season) return false;
    return true;
  });
}

function sameRequiredLeague(a: DailyRequiredLeagueDefinition, b: DailyRequiredLeagueDefinition): boolean {
  return a.providerCompetitionId === b.providerCompetitionId
    && (a.season ?? null) === (b.season ?? null);
}

function fixtureFallsOnDate(fixture: Fixture, date: string, timezone?: string): boolean {
  const scheduledAt = new Date(fixture.scheduledAt);
  if (!Number.isFinite(scheduledAt.getTime())) return false;
  const window = fixtureDateRange(date, timezone);
  return scheduledAt >= window.start && scheduledAt < window.end;
}

function scoringMatchesFixture(
  scoring: RunPipelineResult['scoring'][number],
  fixture: Fixture,
): boolean {
  return scoring.fixtureId === fixture.id
    || scoring.providerFixtureId === fixture.providerFixtureId
    || scoring.predictions.some((prediction) =>
      prediction.fixtureId === fixture.id || prediction.providerFixtureId === fixture.providerFixtureId
    );
}

function sameFixture(a: Fixture, b: Fixture): boolean {
  return a.id === b.id || a.providerFixtureId === b.providerFixtureId;
}

function emptyFixtureDisplay(): RecommendationLegDisplay {
  return {
    fixtureLabel: '',
    homeTeamName: '',
    awayTeamName: '',
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
  if (profile === 'portfolio-v2') return ['parlay-diamante', 'parlay-refinado', 'parlay-all-in', 'low-odds-top', 'low-variance', 'balanced', 'market-diverse', 'high-conviction', 'parlay-oro'];
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

  for (const profile of DAILY_PREFERRED_PARLAY_PROFILE_ORDER) {
    for (const recommendation of recommendations) {
      if (recommendation.profile !== profile) continue;
      add(recommendation);
      if (usedProfiles.has(profile)) break;
    }
  }

  for (const recommendation of recommendations) {
    if (!usedProfiles.has(recommendation.profile)) add(recommendation);
  }
  for (const recommendation of recommendations) add(recommendation);

  return selected.slice(0, limit).map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1,
  }));
}

function buildDailyParlayApproaches(input: {
  recommendations: readonly DailyFinalRecommendation[];
  analysisTop: readonly ParlayAnalysisRecommendation[];
  rejected: readonly any[];
}) {
  return DAILY_PREFERRED_PARLAY_PROFILE_ORDER.map((profile) => {
    const selected = input.recommendations.find((recommendation) => recommendation.profile === profile);
    if (selected) {
      return {
        profile,
        status: 'selected',
        parlayId: selected.parlayId,
        rank: selected.rank,
        combinedOdds: round(selected.combinedOdds, 4),
        aggregateConfidence: round(selected.aggregateConfidence, 4),
        expectedEdge: round(selected.expectedEdge, 6),
        warnings: selected.riskFlags ?? [],
        reasons: selected.reasons ?? [],
      };
    }

    const candidate = input.analysisTop.find((recommendation) => recommendation.profile === profile);
    const rejected = input.rejected.find((item) => item?.profile === profile);
    return {
      profile,
      status: 'blocked',
      parlayId: candidate?.parlayId ?? rejected?.parlayId ?? null,
      combinedOdds: candidate && Number.isFinite(candidate.combinedOdds) ? round(candidate.combinedOdds, 4) : null,
      aggregateConfidence: candidate && Number.isFinite(candidate.aggregateConfidence) ? round(candidate.aggregateConfidence, 4) : null,
      expectedEdge: candidate && Number.isFinite(candidate.expectedEdge) ? round(candidate.expectedEdge, 6) : null,
      warnings: uniqueStrings([
        ...(candidate?.riskFlags ?? []),
      ]),
      reasons: uniqueStrings([
        ...dailyParlayApproachBlockReasons(candidate),
        ...((rejected?.reasons ?? []) as string[]),
        ...(!candidate && !rejected ? ['no same-day analyzed candidate for preferred profile'] : []),
      ]),
    };
  });
}

function dailyParlayApproachBlockReasons(recommendation: ParlayAnalysisRecommendation | undefined): string[] {
  if (!recommendation) return [];
  const reasons: string[] = [];
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') reasons.push(`validation status ${recommendation.validationStatus}`);
  if (!DAILY_FINAL_PARLAY_ALLOWED_PROFILES.includes(recommendation.profile as any)) reasons.push('profile not allowed for daily final parlays');
  if (DAILY_FINAL_PARLAY_BLOCKED_PROFILES.includes(recommendation.profile as any)) reasons.push('profile blocked for daily final parlays');
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) reasons.push('invalid combined odds');
  if (!Number.isFinite(recommendation.aggregateConfidence)) reasons.push('invalid aggregate confidence');
  if (!Number.isFinite(recommendation.expectedEdge) || recommendation.expectedEdge <= 0) reasons.push('non-positive expected edge');
  if ((recommendation.legs?.length ?? 0) < 2) reasons.push('leg count below daily minimum');
  if (recommendation.profile === 'parlay-refinado') {
    const riskFlags = new Set(recommendation.riskFlags ?? []);
    for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
      if (riskFlags.has(flag)) reasons.push(`blocked risk flag: ${flag}`);
    }
    if (recommendation.combinedOdds > 2.1) reasons.push('combined odds above parlay-refinado daily max');
    if (recommendation.aggregateConfidence < DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE) reasons.push('aggregate confidence below parlay-refinado daily floor');
    return reasons;
  }
  if (recommendation.profile === 'parlay-diamante') {
    if (recommendation.combinedOdds < 1.1 || recommendation.combinedOdds > 1.3) reasons.push('combined odds outside parlay-diamante daily window');
    if (recommendation.aggregateConfidence < DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE) reasons.push('aggregate confidence below parlay-diamante daily floor');
  } else {
    if ((recommendation.legs?.length ?? 0) > 3) reasons.push('leg count above conservative daily maximum');
    if (recommendation.combinedOdds > DAILY_PARLAY_CONSERVATIVE_MAX_ODDS) reasons.push('combined odds above conservative daily max');
    if (recommendation.aggregateConfidence < DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE) reasons.push('aggregate confidence below conservative daily floor');
  }
  const riskFlags = new Set(recommendation.riskFlags ?? []);
  for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
    if (riskFlags.has(flag)) reasons.push(`blocked risk flag: ${flag}`);
  }
  if (!reasons.length) reasons.push('not selected after diversity, council, or duplicate-signature gates');
  return reasons;
}

function isConservativeDailyParlayRecommendation(recommendation: ParlayAnalysisRecommendation): boolean {
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') return false;
  if (!DAILY_FINAL_PARLAY_ALLOWED_PROFILES.includes(recommendation.profile as any)) return false;
  if (DAILY_FINAL_PARLAY_BLOCKED_PROFILES.includes(recommendation.profile as any)) return false;
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) return false;
  if (!Number.isFinite(recommendation.aggregateConfidence)) return false;
  if (!Number.isFinite(recommendation.expectedEdge) || recommendation.expectedEdge <= 0) return false;
  if ((recommendation.legs?.length ?? 0) < 2) return false;
  if (recommendation.profile === 'parlay-all-in') {
    const riskFlags = new Set(recommendation.riskFlags ?? []);
    const blocked = ['stale-source', 'corners-unverified', 'negative-portfolio-edge', 'historically-weak-profile'];
    if (blocked.some((flag) => riskFlags.has(flag))) return false;
    return recommendation.aggregateConfidence >= 0.48;
  }
  if (recommendation.profile === 'parlay-refinado') {
    const riskFlags = new Set(recommendation.riskFlags ?? []);
    for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
      if (riskFlags.has(flag)) return false;
    }
    if (riskFlags.has('high-combined-odds') || recommendation.combinedOdds > 2.1) return false;
    return recommendation.aggregateConfidence >= DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE;
  }
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
  const focusBonus = fixtureFocusScore(candidate);
  return round(statusBonus + parlayEligibleBonus + (prediction.confidence * 0.7) + (Math.max(0, candidate.edge) * 0.35) + focusBonus - riskPenalty - oddsPenalty, 6);
}

function fixtureFocusScore(candidate: Pick<AtomicPredictionCandidate, 'fixture' | 'display' | 'prediction'>): number {
  const signals = fixtureFocusSignals(candidate);
  return (signals.includes('low-odds') ? 0.035 : 0)
    + (signals.includes('women-youth-development') ? 0.03 : 0);
}

function fixtureFocusSignals(candidate: Pick<AtomicPredictionCandidate, 'fixture' | 'display' | 'prediction'>): string[] {
  const signals: string[] = [];
  if (candidate.prediction.odds <= 1.3) signals.push('low-odds');
  const text = [
    candidate.fixture,
    candidate.display?.fixtureLabel,
    candidate.display?.homeTeamName,
    candidate.display?.awayTeamName,
    candidate.display?.leagueName,
    ...(candidate.prediction.warnings ?? []),
    candidate.prediction.rationale ?? '',
  ].filter(Boolean).join(' ');
  if (/\b(w|women|femenil|femenino|femenina|u-?1[7-9]|u-?2[0-3]|sub[- ]?1[7-9]|sub[- ]?2[0-3]|reserves?|ii|b)\b/i.test(text)) {
    signals.push('women-youth-development');
  }
  return uniqueStrings(signals);
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
    : recommendation.profile === 'parlay-all-in'
      ? -0.5
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

function buildCouncilComposedParlayRecommendations(
  recommendations: readonly DailyFinalRecommendation[],
): DailyFinalRecommendation[] {
  const atomic = recommendations
    .filter((recommendation): recommendation is AtomicPredictionRecommendation => recommendation.kind === 'atomic-prediction')
    .filter((recommendation) => recommendation.legs.length > 0)
    .sort((a, b) =>
      b.score - a.score
      || b.expectedEdge - a.expectedEdge
      || b.aggregateConfidence - a.aggregateConfidence
      || a.combinedOdds - b.combinedOdds
    );
  const parlays: DailyFinalRecommendation[] = [];
  const usedPredictionIds = new Set<string>();
  const usedFixtureIds = new Set<string>();

  for (let index = 0; index < atomic.length && parlays.length < DAILY_COUNCIL_COMPOSED_PARLAY_LIMIT; index += 1) {
    const first = atomic[index] as AtomicPredictionRecommendation;
    if (usedPredictionIds.has(first.predictionId) || usedFixtureIds.has(first.legs[0]?.fixtureId ?? '')) continue;
    const second = atomic.find((candidate, candidateIndex) =>
      candidateIndex > index
      && !usedPredictionIds.has(candidate.predictionId)
      && !usedFixtureIds.has(candidate.legs[0]?.fixtureId ?? '')
      && candidate.legs[0]?.fixtureId !== first.legs[0]?.fixtureId
    );
    if (!second) break;
    const parlay = councilComposedParlay([first, second], parlays.length + 1);
    parlays.push(parlay);
    for (const recommendation of [first, second]) {
      usedPredictionIds.add(recommendation.predictionId);
      const fixtureId = recommendation.legs[0]?.fixtureId;
      if (fixtureId) usedFixtureIds.add(fixtureId);
    }
  }

  return parlays;
}

function councilComposedParlay(
  recommendations: [AtomicPredictionRecommendation, AtomicPredictionRecommendation],
  rank: number,
): DailyFinalRecommendation {
  const legs = recommendations.map((recommendation) => ({
    ...recommendation.legs[0],
    banker: true,
    bankerReason: `council-composed parlay leg: confidence ${round(recommendation.aggregateConfidence, 3)} edge ${round(recommendation.expectedEdge, 3)}`,
  }));
  const combinedOdds = round(legs.reduce((product, leg) => product * Number(leg.odds ?? 1), 1), 6);
  const aggregateConfidence = round(legs.reduce((product, leg) => product * clamp(Number(leg.confidence ?? 0), 0.01, 0.99), 1), 6);
  const adjustedProbability = round(clamp(aggregateConfidence, 0.01, 0.99), 6);
  const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
  const sourceRunIds = uniqueStrings(recommendations.flatMap((recommendation) => recommendation.sourceRunIds));
  const providers = uniqueStrings(recommendations.flatMap((recommendation) => recommendation.providers));
  const riskFlags = uniqueStrings([
    'council-composed',
    'review-required',
    ...recommendations.flatMap((recommendation) => recommendation.riskFlags ?? [])
      .filter((flag) => flag !== 'single-selection'),
  ]);
  const parlayId = `council-parlay-${createHash('sha256')
    .update(legs.map((leg) => leg.predictionId).join('|'))
    .digest('hex')
    .slice(0, 16)}`;

  return {
    kind: 'parlay',
    rank,
    parlayId,
    sourceRunId: sourceRunIds[0] ?? null,
    sourceRunIds,
    profile: 'low-variance',
    validationStatus: 'unvalidated',
    harnessStatus: 'review-required',
    selectionMode: recommendations.some((recommendation) => recommendation.selectionMode === 'analytical-fallback')
      ? 'analytical-fallback'
      : 'promotion-gate',
    fallbackReasons: ['council composed parlay from reviewed simple recommendations'],
    combinedOdds,
    aggregateConfidence,
    adjustedProbability,
    expectedEdge,
    score: round((aggregateConfidence * 0.62) + (Math.max(0, expectedEdge) * 0.28) - (riskFlags.length * 0.01), 6),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'council-composed-review-only-exposure',
    },
    stake: {
      units: 0,
      percentOfBankroll: 0,
      policy: 'council-composed-review-only-stake',
    },
    bankerLegs: legs.map((leg) => ({
      predictionId: leg.predictionId,
      fixtureId: leg.fixtureId,
      fixture: leg.fixture,
      ...(leg.display ? { display: leg.display } : {}),
      market: leg.market,
      selection: leg.selection,
      line: leg.line,
      odds: leg.odds,
      confidence: leg.confidence,
      reason: leg.bankerReason ?? 'council-composed parlay leg',
    })),
    reasons: [
      'council composed parlay: daily output requires parlay coverage',
      'built from simple recommendations that passed the council review gate',
      `providers: ${providers.join(', ') || 'unknown'}`,
      `aggregate confidence ${round(aggregateConfidence, 3)}`,
      `adjusted edge ${round(expectedEdge, 3)}`,
    ],
    riskFlags,
    legs,
  };
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
  const focusSignals = fixtureFocusSignals(primary);
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
    score: round(atomicRecommendationScore(confidence, edge, providers.length, riskFlags.length) + fixtureFocusScore(primary), 6),
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
      ...focusSignals.map((signal) => `focus signal: ${signal}`),
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
  const displays = new Map<string, RecommendationLegDisplay>();
  for (const fixture of fixtures) {
    const display = fixtureDisplay(fixture);
    if (!display) continue;
    const existing = displays.get(fixture.id);
    if (!existing || fixtureDisplayQuality(display) > fixtureDisplayQuality(existing)) {
      displays.set(fixture.id, display);
    }
  }
  return displays;
}

function displayFixturesFromPipelineResult(result: RunPipelineResult | undefined): Fixture[] {
  if (!result) return [];
  return [
    ...displayFixturesFromArtifactDir(result.artifactDir),
    ...(result.fixtures ?? []),
    ...(result.lowOddsScan?.candidateFixtures ?? []),
  ];
}

function displayFixturesFromArtifactDir(artifactDir: string | undefined): Fixture[] {
  if (!artifactDir) return [];
  try {
    const payload = JSON.parse(readFileSync(join(artifactDir, 'fixtures.json'), 'utf-8')) as unknown;
    const fixtures = fixtureArrayFromPayload(payload);
    return fixtures.filter(isFixtureLike);
  } catch {
    return [];
  }
}

function fixtureArrayFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as { fixtures?: unknown }).fixtures)) {
    return (payload as { fixtures: unknown[] }).fixtures;
  }
  return [];
}

function isFixtureLike(value: unknown): value is Fixture {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { id?: unknown }).id === 'string';
}

function fixtureDisplay(fixture: Fixture): RecommendationLegDisplay | undefined {
  const homeTeamName = preferredDisplayName(fixture.homeTeamName, fixture.homeTeamId);
  const awayTeamName = preferredDisplayName(fixture.awayTeamName, fixture.awayTeamId);
  if (!homeTeamName || !awayTeamName) return undefined;
  const leagueName = preferredDisplayName((fixture as { competitionName?: unknown }).competitionName, fixture.competitionId);
  return {
    fixtureLabel: `${homeTeamName} vs ${awayTeamName}`,
    homeTeamName,
    awayTeamName,
    ...(leagueName ? { leagueName } : {}),
    kickoffLocal: fixture.scheduledAt,
  };
}

function preferredDisplayName(...values: unknown[]): string | undefined {
  const strings = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  return strings.find((value) => !isUuidLike(value));
}

function fixtureDisplayQuality(display: RecommendationLegDisplay): number {
  return [
    display.homeTeamName,
    display.awayTeamName,
    display.fixtureLabel,
    display.leagueName,
  ].reduce((score, value) => {
    if (!value) return score;
    return score + (shouldReplaceFixtureLabel(value) ? 0 : 1);
  }, display.kickoffLocal ? 1 : 0);
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
    '## Diagnostics',
    `emptyRun: ${Boolean(summary.runDiagnostics?.emptyRun)}`,
    ...((summary.runDiagnostics?.reasons ?? []).map((reason: string) => `- ${reason}`)),
    '',
    'Artifact analitico. No ejecuta apuestas ni garantiza resultados.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
