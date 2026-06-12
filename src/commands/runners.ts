import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from '../runtime/context.js';
import type { MarketKey } from '../domain/markets.js';
import type { ResearchWebMode } from '../prediction/prompts.js';
import { runFixtureScoring as scoreFixtureDirect, type FixtureScoringResult } from '../prediction/service.js';
import { runParlayAnalysis, type ParlayAnalysisRunResult } from '../parlay/analysis.js';
import { runParlayBuild, type ParlayBuildRunResult } from '../parlay/service.js';
import { runValidation, type ValidationRunResult } from '../validation/service.js';
import { runDailyMetrics, type DailyMetricsRunResult } from '../metrics/daily.js';
import { runDailyE2E, type DailyE2ERunResult } from '../daily/e2e.js';
import { runStrategyReview, type StrategyReviewResult } from '../strategy-review/daily.js';
import {
  exportRunArtifacts as runServiceExportRunArtifacts,
  runFixtureScoring as runServiceFixtureScoring,
  runParlayBuild as runServiceParlayBuild,
  runPipeline as runServicePipeline,
  runValidation as runServiceValidation,
} from '../runtime/run-service.js';
import {
  formatLocalDate,
  optionalDailyParlayProfileFlag,
  optionalDailyProviderModelsFlag,
  optionalDailyProvidersFlag,
  optionalDailyRequiredLeaguesFlag,
  optionalFloatFlag,
  optionalMarketsFlag,
  optionalParlayAnalysisProfileScope,
  optionalParlayConfig,
  optionalPositiveFloatFlag,
  optionalPositiveIntegerFlag,
  optionalResearchWebMode,
  optionalResearchWebModeFlag,
  optionalRunIdsFlag,
  optionalRunValidationMode,
  optionalStringFlag,
  requireDateFlag,
  requiredRunId,
  requiredRunInput,
  requiredValidationTarget,
  requireStringFlag,
  type CommandFlags,
} from './flags.js';

export interface CommandRunnerContext {
  config: AgentConfig;
  runtime: RuntimeContext;
}

type OptionalRunService = {
  runFixtureScoring?: typeof scoreFixtureDirect;
  runParlayBuild?: typeof runParlayBuild;
  runValidation?: typeof runValidation;
  runPipeline?: (config: AgentConfig, input: { date: string; validate?: 'auto' | 'force' | false; web?: ResearchWebMode; markets?: MarketKey[]; metadata?: Record<string, unknown> }, runtime: RuntimeContext) => Promise<RunPipelineResult>;
  exportRunArtifacts?: (config: AgentConfig, input: { runId: string }, runtime: RuntimeContext) => Promise<RunExportResult>;
};

export type RunPipelineResult = {
  ok: boolean;
  runId?: string;
  date?: string;
  verdict?: string;
  artifactPath?: string;
  handoffPath?: string;
  evidencePackPath?: string;
  error?: string;
};

type DailyE2EValidationMode = 'auto' | 'force' | false;

export type RunExportResult = {
  ok: boolean;
  runId: string;
  artifactPath?: string;
  handoffPath?: string;
  evidencePackPath?: string;
  files?: string[];
  error?: string;
};

let runServicePromise: Promise<OptionalRunService> | undefined;

async function loadOptionalRunService(): Promise<OptionalRunService> {
  runServicePromise ??= importOptionalRunService();
  return runServicePromise;
}

async function importOptionalRunService(): Promise<OptionalRunService> {
  return {
    runFixtureScoring: runServiceFixtureScoring,
    runParlayBuild: runServiceParlayBuild,
    runValidation: runServiceValidation,
    runPipeline: runServicePipeline,
    exportRunArtifacts: runServiceExportRunArtifacts,
  };
}

export async function scoreFixture(ctx: CommandRunnerContext, flags: CommandFlags): Promise<FixtureScoringResult> {
  const fixtureId = requireStringFlag(flags, 'fixture-id');
  const service = await loadOptionalRunService();
  const runner = service.runFixtureScoring ?? scoreFixtureDirect;
  return runner(ctx.config, { fixtureId, web: optionalResearchWebMode(flags), markets: optionalMarketsFlag(flags) }, ctx.runtime);
}

export async function buildParlay(ctx: CommandRunnerContext, flags: CommandFlags): Promise<ParlayBuildRunResult> {
  const portfolio = optionalStringFlag(flags, 'portfolio');
  const deterministicPortfolios = new Set(['low-variance', 'balanced', 'totals', 'high-conviction', 'market-diverse', 'parlay-oro', 'parlay-diamante', 'parlay-all-in', 'parlay-refinado']);
  if (portfolio !== undefined && portfolio !== 'llm' && portfolio !== 'low-odds-top' && !deterministicPortfolios.has(portfolio)) {
    throw new Error('--portfolio must be llm, low-odds-top, low-variance, balanced, totals, high-conviction, market-diverse, parlay-oro, parlay-diamante, parlay-all-in, or parlay-refinado when provided.');
  }
  if (portfolio === 'llm' || portfolio === 'low-odds-top' || deterministicPortfolios.has(portfolio ?? '')) {
    const selectedPortfolio = portfolio as NonNullable<Parameters<typeof runParlayBuild>[1]['portfolio']>;
    const sourceRunId = portfolio === 'llm'
      ? requireStringFlag(flags, 'run-id')
      : optionalStringFlag(flags, 'run-id');
    const input = {
      date: typeof flags.date === 'string' ? requireDateFlag(flags) : formatLocalDate(new Date()),
      sourceRunId,
      sourceRunIds: portfolio === 'llm' ? undefined : optionalRunIdsFlag(flags),
      portfolio: selectedPortfolio,
      configOverrides: optionalParlayConfig(flags),
    };
    const service = await loadOptionalRunService();
    const runner = service.runParlayBuild ?? runParlayBuild;
    return runner(ctx.config, input, ctx.runtime);
  }

  const input = {
    date: requireDateFlag(flags),
    sourceRunId: optionalStringFlag(flags, 'run-id'),
    sourceRunIds: optionalRunIdsFlag(flags),
    configOverrides: optionalParlayConfig(flags),
  };
  const service = await loadOptionalRunService();
  const runner = service.runParlayBuild ?? runParlayBuild;
  return runner(ctx.config, input, ctx.runtime);
}

export async function analyzeParlays(ctx: CommandRunnerContext, flags: CommandFlags): Promise<ParlayAnalysisRunResult> {
  return runParlayAnalysis(ctx.config, {
    date: optionalStringFlag(flags, 'date'),
    runId: optionalStringFlag(flags, 'run-id'),
    runIds: optionalRunIdsFlag(flags),
    top: optionalPositiveIntegerFlag(flags, 'top'),
    bankrollUnits: optionalPositiveFloatFlag(flags, 'bankroll') ?? optionalPositiveFloatFlag(flags, 'bank'),
    maxPortfolioExposure: optionalFloatFlag(flags, 'max-portfolio-exposure'),
    maxParlayExposure: optionalFloatFlag(flags, 'max-parlay-exposure'),
    profileScope: optionalParlayAnalysisProfileScope(flags),
  }, ctx.runtime);
}

export async function validateResults(ctx: CommandRunnerContext, flags: CommandFlags): Promise<ValidationRunResult> {
  const input = requiredValidationTarget(flags);
  const service = await loadOptionalRunService();
  const runner = service.runValidation ?? runValidation;
  return runner(ctx.config, input, ctx.runtime);
}

export async function buildDailyMetrics(ctx: CommandRunnerContext, flags: CommandFlags): Promise<DailyMetricsRunResult> {
  const persistFlag = optionalStringFlag(flags, 'persist');
  const persist = flags.persist === true || persistFlag === undefined
    ? true
    : !['false', 'off', 'no', '0'].includes(persistFlag.toLowerCase());
  return runDailyMetrics(ctx.config, {
    date: requireDateFlag(flags),
    days: optionalPositiveIntegerFlag(flags, 'days'),
    scope: optionalStringFlag(flags, 'scope'),
    recommendationArtifact: optionalStringFlag(flags, 'recommendation-artifact'),
    persist,
  }, ctx.runtime);
}

export async function buildStrategyReview(ctx: CommandRunnerContext, flags: CommandFlags): Promise<StrategyReviewResult> {
  const agentFlag = optionalStringFlag(flags, 'agent');
  const agent = flags.agent === true || agentFlag === undefined
    ? true
    : !['false', 'off', 'no', '0'].includes(agentFlag.toLowerCase());
  return runStrategyReview(ctx.config, {
    date: optionalStringFlag(flags, 'date'),
    from: optionalStringFlag(flags, 'from'),
    through: optionalStringFlag(flags, 'through'),
    all: flags.all === true,
    scope: optionalStringFlag(flags, 'scope'),
    docPath: optionalStringFlag(flags, 'doc'),
    agent,
  }, ctx.runtime);
}

export async function runPipeline(ctx: CommandRunnerContext, flags: CommandFlags): Promise<RunPipelineResult> {
  const input = requiredRunInput(flags);
  const service = await loadOptionalRunService();
  if (!service.runPipeline) {
    throw new Error('run-service is not available yet; expected runPipeline in src/runtime/run-service.ts.');
  }
  return service.runPipeline(ctx.config, input, ctx.runtime);
}

export async function runDailyE2ECommand(ctx: CommandRunnerContext, flags: CommandFlags): Promise<DailyE2ERunResult> {
  const persistMetricsFlag = optionalStringFlag(flags, 'persist-metrics');
  const persistMetrics = flags['persist-metrics'] === true || persistMetricsFlag === undefined
    ? true
    : !['false', 'off', 'no', '0'].includes(persistMetricsFlag.toLowerCase());
  return runDailyE2E(ctx.config, {
    date: requireDateFlag(flags),
    providers: optionalDailyProvidersFlag(flags),
    providerConcurrency: optionalPositiveIntegerFlag(flags, 'provider-concurrency'),
    models: optionalDailyProviderModelsFlag(flags),
    maxFixtures: optionalPositiveIntegerFlag(flags, 'max-fixtures'),
    threshold: optionalFloatFlag(flags, 'threshold'),
    web: optionalResearchWebModeFlag(flags),
    validate: optionalRunValidationMode(flags) as DailyE2EValidationMode | undefined,
    markets: optionalMarketsFlag(flags),
    parlayProfile: optionalDailyParlayProfileFlag(flags),
    requiredLeagues: optionalDailyRequiredLeaguesFlag(flags),
    persistMetrics,
    dailyBatchId: optionalStringFlag(flags, 'daily-batch-id'),
  }, ctx.runtime);
}

export async function exportRun(ctx: CommandRunnerContext, flags: CommandFlags): Promise<RunExportResult> {
  const input = { runId: requiredRunId(flags) };
  const service = await loadOptionalRunService();
  if (!service.exportRunArtifacts) {
    throw new Error('run-service is not available yet; expected exportRunArtifacts in src/runtime/run-service.ts.');
  }
  return service.exportRunArtifacts(ctx.config, input, ctx.runtime);
}
