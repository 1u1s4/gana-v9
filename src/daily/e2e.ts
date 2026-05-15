import { createHash } from 'node:crypto';
import type { AgentConfig } from '../config.js';
import { discoverFixtures, type FixtureDiscoveryResult } from '../filters/engine.js';
import { normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import { getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { selectDefaultModelForProvider } from '../providers/agentic/helpers.js';
import type { AgentProvider } from '../providers/agentic/types.js';
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

export type DailyE2EProvider = Extract<AgentProvider, 'codex' | 'gemini'>;

export type DailyParlayProfile =
  | 'safe-consensus'
  | 'balanced'
  | 'aggressive-analytical'
  | 'low-variance'
  | 'high-conviction'
  | 'market-diverse'
  | 'parlay-oro';

export interface RunDailyE2EInput {
  date: string;
  providers?: DailyE2EProvider[];
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

export interface DailyParlayFamilyResult {
  family: 'codex-only' | 'gemini-only' | 'consensus-mixed';
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
  const pairedProviders = providers;
  const providerAgentic = providers.join(',');
  const marketScope = normalizeMarketScope(input.markets, effectiveConfig.apiFootball.defaultMarkets);

  await repositories?.harnessRuns?.upsertForRun?.({
    id: dailyBatchId,
    runtime: effectiveConfig.runtime,
    profile: effectiveConfig.profile,
    providerSports: runtime.providerSports,
    providerAgentic,
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider)).join(','),
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
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider)).join(','),
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

  for (const provider of providers) {
    const providerConfig = configForProvider(effectiveConfig, provider);
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
    providerPipelineResults[provider] = result;
    providerRuns.push({
      provider,
      model: providerConfig.model,
      runId: result.runId,
      ok: result.ok,
      verdict: result.verdict,
      artifactPath: result.artifactPath,
      error: result.error,
    });
  }

  const successfulProviderRunIds = providerRuns
    .filter((run) => run.ok && run.runId)
    .map((run) => run.runId as string);
  const parlayProfile = profileToPortfolio(input.parlayProfile);
  const parlayFamilies: DailyParlayFamilyResult[] = [];

  for (const provider of providers) {
    const runId = providerPipelineResults[provider]?.runId;
    if (!runId || !parlayProfile) {
      parlayFamilies.push({
        family: provider === 'codex' ? 'codex-only' : 'gemini-only',
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
    const parlayRunId = boundedDailyChildRunId(dailyBatchId, provider, parlayProfile);
    const parlayRuntime = childRuntime(runtime, configForProvider(effectiveConfig, provider), parlayRunId);
    const result = await buildParlay(configForProvider(effectiveConfig, provider), {
      date: input.date,
      sourceRunId: runId,
      portfolio: parlayProfile,
    }, parlayRuntime);
    parlayFamilies.push(toParlayFamily(provider === 'codex' ? 'codex-only' : 'gemini-only', [runId], result));
  }

  if (successfulProviderRunIds.length >= 2) {
    const mixedRuntime = childRuntime(runtime, effectiveConfig, boundedDailyChildRunId(dailyBatchId, 'mixed'));
    const mixed = await buildParlay(effectiveConfig, {
      date: input.date,
      sourceRunIds: successfulProviderRunIds,
      ...(parlayProfile ? { portfolio: parlayProfile } : {}),
    } satisfies RunParlayBuildInput, mixedRuntime);
    parlayFamilies.push(toParlayFamily('consensus-mixed', successfulProviderRunIds, mixed));
  } else {
    parlayFamilies.push({
      family: 'consensus-mixed',
      sourceRunIds: successfulProviderRunIds,
      ok: false,
      verdict: 'blocked',
      error: 'mixed parlays require successful Codex and Gemini source runs',
    });
  }

  const parlayAnalysisRunIds = uniqueStrings([
    ...successfulProviderRunIds,
    ...parlayFamilies.map((family) => family.runId).filter((runId): runId is string => Boolean(runId)),
  ]);
  const analysisRuntime = childRuntime(runtime, effectiveConfig, boundedDailyChildRunId(dailyBatchId, 'recommendations'));
  const parlayAnalysis = parlayAnalysisRunIds.length
    ? await analyzeParlays(effectiveConfig, {
      date: input.date,
      runIds: parlayAnalysisRunIds,
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
      model: modelForProvider(effectiveConfig, provider),
      runId: providerPipelineResults[provider]?.runId,
      result: providerPipelineResults[provider],
    })),
  });
  const hasAnyValidParlayFamily = parlayFamilies.some((family) => family.ok);
  const hasConsensus = parlayFamilies.some((family) => family.family === 'consensus-mixed' && family.ok);
  const ok = providerRuns.every((run) => run.ok)
    && hasAnyValidParlayFamily
    && (parlayAnalysis?.ok ?? false)
    && metrics.ok;
  const verdict = ok && hasConsensus
    ? 'promotable'
    : ok
      ? 'review-required'
      : providerRuns.some((run) => !run.ok)
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
  const parlayFamilyCounts = Object.fromEntries(parlayFamilies.map((family) => [family.family, {
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
      marketScope,
      web: input.web ?? effectiveConfig.nativeWebSearchMode,
      maxFixturesPerRun: effectiveConfig.apiFootball.maxFixturesPerRun,
      lowOddsThreshold: effectiveConfig.apiFootball.lowOddsThreshold,
      parlayProfile: input.parlayProfile ?? null,
    },
    counts: {
      providers: providerCounts,
      parlayFamilies: parlayFamilyCounts,
      recommendations: parlayAnalysis?.top?.length ?? 0,
      comparisonItems: providerComparison.items.length,
      consensusPredictions: providerConsensus.summary.consensusPredictions,
    },
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
  const providerComparisonPath = writeJsonArtifact(dailyBatchId, 'daily-provider-comparison.json', providerComparison);
  const providerConsensusPath = writeJsonArtifact(dailyBatchId, 'daily-provider-consensus.json', providerConsensus);
  const summaryPath = writeJsonArtifact(dailyBatchId, 'daily-e2e-summary.json', summary);
  const recommendationsPath = writeJsonArtifact(dailyBatchId, 'daily-parlay-recommendations.json', {
    dailyBatchId,
    date: input.date,
    sourceRunIds: parlayAnalysisRunIds,
    recommendations: parlayAnalysis?.top ?? [],
    diagnostics: parlayAnalysis?.diagnostics ?? null,
    providerComparisonPath,
    providerConsensusPath,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  });
  const reportPath = writeJsonArtifact(dailyBatchId, 'daily-report.md', buildDailyReport(summary, recommendationsPath));

  writeRun(effectiveConfig, dailyBatchId, {
    id: dailyBatchId,
    runtime: effectiveConfig.runtime,
    profile: effectiveConfig.profile,
    providerSports: runtime.providerSports,
    providerAgentic,
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider)).join(','),
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
    model: providers.map((provider) => modelForProvider(effectiveConfig, provider)).join(','),
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
      let snapshot = oddsSnapshots.get(key);
      if (!snapshot) {
        snapshot = getApiFootballOddsSnapshot(configForSports(runConfig, config), fixtureId, runRuntime, markets);
        oddsSnapshots.set(key, snapshot);
      }
      return snapshot;
    },
  };
}

function validateDailyInput(input: RunDailyE2EInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('daily-e2e requires --date YYYY-MM-DD.');
  if (input.maxFixtures !== undefined && (!Number.isInteger(input.maxFixtures) || input.maxFixtures < 1)) {
    throw new Error('--max-fixtures must be a positive integer.');
  }
  if (input.threshold !== undefined && (!Number.isFinite(input.threshold) || input.threshold <= 1)) {
    throw new Error('--threshold must be greater than 1.');
  }
}

function normalizeProviders(providers: DailyE2EProvider[] | undefined): DailyE2EProvider[] {
  const values = providers?.length ? providers : DEFAULT_DAILY_PROVIDERS;
  const invalid = values.filter((provider) => provider !== 'codex' && provider !== 'gemini');
  if (invalid.length) throw new Error(`--providers only supports codex,gemini for daily-e2e. Invalid: ${invalid.join(',')}`);
  return Array.from(new Set(values));
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

function configForProvider(config: AgentConfig, provider: DailyE2EProvider): AgentConfig {
  return {
    ...config,
    provider,
    model: modelForProvider(config, provider),
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

function modelForProvider(config: AgentConfig, provider: DailyE2EProvider): string {
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

function profileToPortfolio(profile: DailyParlayProfile | undefined): RunParlayBuildInput['portfolio'] | undefined {
  if (!profile) return undefined;
  if (profile === 'safe-consensus') return 'low-variance';
  if (profile === 'aggressive-analytical') return 'high-conviction';
  if (profile === 'balanced') return 'balanced';
  return profile;
}

function toParlayFamily(
  family: DailyParlayFamilyResult['family'],
  sourceRunIds: string[],
  result: ParlayBuildRunResult,
): DailyParlayFamilyResult {
  return {
    family,
    runId: result.runId,
    sourceRunIds,
    ok: result.ok,
    verdict: result.gateResult.verdict,
    artifactPath: result.artifactPath,
    persistedParlayIds: result.persistedParlayIds ?? (result.persistedParlayId ? [result.persistedParlayId] : undefined),
    error: result.error,
  };
}

function oddsCacheKey(fixtureId: string, markets: readonly MarketKey[] | undefined): string {
  return `${fixtureId}:${[...(markets ?? [])].sort().join(',')}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
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
