import type { Interface } from 'readline';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import type { AgentConfig } from './config.js';
import type { ChatMessage } from './agent.js';
import type { FilterCombineMode, LowOddsScanView } from './filters/types.js';
import { discoverFixtures } from './filters/engine.js';
import { scanLowOdds } from './filters/low-odds.js';
import {
  addLeaguePreset,
  addTeamPreset,
  listLeaguePresets,
  listTeamPresets,
  removeLeaguePreset,
  removeTeamPreset,
} from './filters/presets.js';
import { getFiltersStatus, type FiltersStatus, type ServiceStatusReport } from './filters/status.js';
import { appendAuditEvent, appendConfigStatusEvent } from './permissions/audit.js';
import { approveAndExecute, denyApproval } from './permissions/approval-executor.js';
import { listApprovals } from './permissions/approval-service.js';
import type { ApprovalRequest } from './permissions/approval-store.js';
import { redactSecrets } from './permissions/redaction.js';
import { listToolMetadata } from './permissions/tool-metadata.js';
import { detectMonetaryAction } from './security/no-monetary-actions.js';
import { saveSessionEvent } from './session.js';
import {
  AGENT_PROVIDER_DEFAULT_MODELS,
  buildAgentProviderState,
  providerLabel as agentProviderLabel,
  redactProviderSessionId,
  selectDefaultModelForProvider,
} from './providers/agentic/helpers.js';
import type { AgentProviderCompat } from './providers/agentic/types.js';
import { actionableProviderErrorMessage } from './providers/sports/api-football-errors.js';
import { checkApiFootballStatus, getApiFootballOddsSnapshot, listApiFootballFixtures } from './providers/sports/api-football.js';
import { updateRuntimeContext, type RuntimeContext } from './runtime/context.js';
import { ensureArtifactRoot } from './runtime/artifacts.js';
import {
  exportRunArtifacts as runServiceExportRunArtifacts,
  runFixtureScoring as runServiceFixtureScoring,
  runParlayBuild as runServiceParlayBuild,
  runPipeline as runServicePipeline,
  runValidation as runServiceValidation,
} from './runtime/run-service.js';
import { getPrismaClient } from './storage/db.js';
import { getDbStatus } from './storage/db-status.js';
import { startDashboardServer, type DashboardOptions } from './dashboard/server.js';
import type { Fixture } from './domain/fixtures.js';
import { isMarketKey, MARKET_KEYS, type MarketKey } from './domain/markets.js';
import type { OddsQuote } from './domain/odds.js';
import { runFixtureResearch, type FixtureResearchResult } from './evidence/research.js';
import { runFixtureScoring, type FixtureScoringResult } from './prediction/service.js';
import { runParlayAnalysis, type ParlayAnalysisRunResult } from './parlay/analysis.js';
import { runParlayBuild, type ParlayBuildRunResult } from './parlay/service.js';
import type { ParlayConfig } from './parlay/types.js';
import { runValidation, type RunValidationInput, type ValidationRunResult } from './validation/service.js';
import type { ResearchWebMode } from './prediction/prompts.js';
import { runCertification } from './evals/runner.js';
import { runDailyMetrics, type DailyMetricsRunResult } from './metrics/daily.js';
import { runDailyE2E, type DailyE2ERunResult, type DailyE2EProvider, type DailyParlayProfile } from './daily/e2e.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

type ModelInfo = {
  id: string;
  name: string;
  supportedReasoning?: string[];
  speedTiers?: string[];
};

type Provider = AgentProviderCompat;

const PROVIDERS: Provider[] = ['codex', 'gemini', 'openrouter'];

const PROVIDER_DEFAULT_MODELS: Record<Provider, string[]> = {
  codex: [...AGENT_PROVIDER_DEFAULT_MODELS.codex],
  gemini: [...AGENT_PROVIDER_DEFAULT_MODELS.gemini],
  openrouter: [...AGENT_PROVIDER_DEFAULT_MODELS.openrouter],
};

export interface CommandContext {
  config: AgentConfig;
  runtime: RuntimeContext;
  rl: Interface;
  messages: ChatMessage[];
  sessionPath: string;
  resetSession: () => string;
  totalTokens: { input: number; output: number };
}

export interface SlashCommand {
  name: string;
  description: string;
  execute: (args: string, ctx: CommandContext) => Promise<void>;
}

export interface HeadlessCommandContext {
  config: AgentConfig;
  runtime: RuntimeContext;
}

export interface CommandResult {
  ok: boolean;
  exitCode: number;
  message?: string;
}

const commands: SlashCommand[] = [];

type OptionalRunService = {
  runFixtureScoring?: typeof runFixtureScoring;
  runParlayBuild?: typeof runParlayBuild;
  runValidation?: typeof runValidation;
  runPipeline?: (config: AgentConfig, input: { date: string; validate?: 'auto' | 'force' | false; web?: ResearchWebMode; markets?: MarketKey[]; metadata?: Record<string, unknown> }, runtime: RuntimeContext) => Promise<RunPipelineResult>;
  exportRunArtifacts?: (config: AgentConfig, input: { runId: string }, runtime: RuntimeContext) => Promise<RunExportResult>;
};

type RunPipelineResult = {
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

type RunExportResult = {
  ok: boolean;
  runId: string;
  artifactPath?: string;
  handoffPath?: string;
  evidencePackPath?: string;
  files?: string[];
  error?: string;
};

type ArtifactListResult = {
  artifactRoot: string;
  runId?: string;
  path: string;
  files: string[];
};

let runServicePromise: Promise<OptionalRunService> | undefined;

function ask(rl: Interface, prompt: string): Promise<string> {
  return new Promise((r) => {
    process.stdin.resume();
    rl.question(prompt, (answer) => {
      r(answer);
    });
  });
}

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

function loadCodexModels(ctx: CommandContext): ModelInfo[] {
  const repoPath = resolve(ctx.config.codexModelListPath);
  const path = existsSync(repoPath) ? repoPath : join(ctx.config.codexHome, 'models_cache.json');
  if (!existsSync(path)) return [];

  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { models?: unknown };
  const models = raw.models;
  if (!Array.isArray(models)) return [];

  return models
    .map((model: any) => ({
      id: String(model.slug ?? model.id ?? model.name ?? ''),
      name: String(model.display_name ?? model.displayName ?? model.name ?? model.slug ?? model.id ?? ''),
      supportedReasoning: Array.isArray(model.supportedReasoning)
        ? model.supportedReasoning.map(String)
        : Array.isArray(model.supported_reasoning_levels)
          ? model.supported_reasoning_levels.map((level: any) => String(level.effort ?? level)).filter(Boolean)
          : undefined,
      speedTiers: Array.isArray(model.speedTiers)
        ? model.speedTiers.map(String)
        : Array.isArray(model.additional_speed_tiers)
          ? model.additional_speed_tiers.map(String)
          : undefined,
    }))
    .filter((model) => model.id);
}

function loadGeminiModels(ctx: CommandContext): { id: string; name: string }[] {
  const settingsPath = join(ctx.config.geminiHome, 'settings.json');
  const settings = existsSync(settingsPath)
    ? JSON.parse(readFileSync(settingsPath, 'utf-8'))
    : {};
  const repoListPath = resolve(ctx.config.geminiModelListPath);
  const repoList = existsSync(repoListPath)
    ? JSON.parse(readFileSync(repoListPath, 'utf-8'))?.models
    : [];

  const configured = settings?.model?.name;

  const models = [
    ...(Array.isArray(repoList) ? repoList : []).map((model: any) => typeof model === 'string' ? model : model?.id ?? model?.name),
    ...Object.keys(settings?.modelConfigs?.modelDefinitions ?? {}),
    ...Object.keys(settings?.modelConfigs?.customAliases ?? {}),
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ];

  if (configured && !models.includes(configured)) {
    models.unshift(configured);
  }

  const names = new Map<string, string>();
  for (const model of Array.isArray(repoList) ? repoList : []) {
    if (typeof model === 'string') names.set(model, model);
    else if (model?.id) names.set(model.id, model.name ?? model.id);
  }

  return [...new Set(models.filter(Boolean))]
    .map((id) => ({ id, name: names.get(id) ?? id }));
}

function loadProviderModels(ctx: CommandContext): ModelInfo[] {
  if (ctx.config.provider === 'codex') return loadCodexModels(ctx);
  if (ctx.config.provider === 'gemini') return loadGeminiModels(ctx);
  return [];
}

function providerLabel(provider: Provider): string {
  return agentProviderLabel(provider);
}

function syncRuntime(ctx: CommandContext): void {
  updateRuntimeContext(ctx.runtime, ctx.config, { sessionPath: ctx.sessionPath });
}

function statusMarker(status: string): string {
  if (status === 'missing' || status === 'warning' || status === 'disconnected' || status === 'degraded') return `${YELLOW}!${RESET}`;
  return `${GREEN}✓${RESET}`;
}

function printKeyValue(key: string, value: unknown): void {
  const safe = redactSecrets(value);
  console.log(`  ${DIM}${key}:${RESET} ${CYAN}${String(safe)}${RESET}`);
}

function saveAgentCommandEvent(ctx: CommandContext, type: string, payload: Record<string, unknown> = {}): void {
  const event = {
    type,
    provider: ctx.config.provider,
    model: ctx.config.model,
    sessionPath: ctx.sessionPath,
    codexThreadId: redactProviderSessionId(ctx.config.codexThreadId) ?? null,
    geminiSessionId: redactProviderSessionId(ctx.config.geminiSessionId) ?? null,
    payload,
  };
  saveSessionEvent(ctx.sessionPath, event);
  appendAuditEvent(ctx.runtime, { type, payload: event });
}

function providerCatalogHint(ctx: CommandContext): { path?: string; script?: string } {
  if (ctx.config.provider === 'codex') {
    return { path: resolve(ctx.config.codexModelListPath), script: 'npm run update:codex-models' };
  }
  if (ctx.config.provider === 'gemini') {
    return { path: resolve(ctx.config.geminiModelListPath), script: 'npm run update:gemini-models' };
  }
  return {};
}

function printServiceStatus(report: ServiceStatusReport): void {
  console.log(`  ${statusMarker(report.status)} ${CYAN}${report.service}${RESET} ${DIM}${report.status}${RESET}`);
  console.log(`  ${DIM}${report.message}${RESET}`);
  if (report.missing.length) {
    console.log(`  ${DIM}missing:${RESET} ${YELLOW}${report.missing.join(', ')}${RESET}`);
  }
  if (report.config && Object.keys(report.config).length) {
    for (const [key, value] of Object.entries(report.config)) {
      if (value !== null) printKeyValue(key, value);
    }
  }
}

function printFiltersStatus(status: FiltersStatus): void {
  console.log(`  ${statusMarker(status.status)} ${CYAN}${status.service}${RESET} ${DIM}${status.status}${RESET}`);
  console.log(`  ${DIM}${status.summary}${RESET}`);
  for (const warning of status.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
  printKeyValue('season', status.filters.defaultSeason);
  printKeyValue('markets', status.filters.defaultMarkets.join(', '));
  printKeyValue('leaguePresetsPath', status.filters.leaguePresetsPath);
  printKeyValue('legacyConfigLeagues', status.filters.defaultLeagues.length ? status.filters.defaultLeagues.length : 'none');
  printKeyValue('legacyConfigTeams', status.filters.defaultTeams.length ? status.filters.defaultTeams.length : 'none');
  printKeyValue('lowOddsThreshold', status.filters.lowOddsThreshold);
  printKeyValue('kickoffWindowHours', status.filters.kickoffWindowHours);
  printKeyValue('includeLiveFixtures', status.filters.includeLiveFixtures);
  printKeyValue('includeCompletedFixtures', status.filters.includeCompletedFixtures);
  printKeyValue('maxFixturesPerRun', status.filters.maxFixturesPerRun);
}

function parseFlags(args: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

const LOW_ODDS_SLASH_KEYS = new Set(['date', 'threshold', 'markets', 'leagues', 'teams', 'combine']);

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function expandLowOddsSlashTokens(tokens: string[]): string[] {
  const expanded: string[] = [];
  let hasDate = false;

  for (const token of tokens) {
    if (token.startsWith('--')) {
      if (token === '--date') hasDate = true;
      expanded.push(token);
      continue;
    }

    const colonIndex = token.indexOf(':');
    if (colonIndex > 0) {
      const key = token.slice(0, colonIndex);
      const value = token.slice(colonIndex + 1);
      if (LOW_ODDS_SLASH_KEYS.has(key) && value) {
        if (key === 'date') hasDate = true;
        expanded.push(`--${key}`, value);
        continue;
      }
    }

    if (!hasDate && token === 'today') {
      expanded.push('--date', formatLocalDate(new Date()));
      hasDate = true;
      continue;
    }

    if (!hasDate && /^\d{4}-\d{2}-\d{2}$/.test(token)) {
      expanded.push('--date', token);
      hasDate = true;
      continue;
    }

    expanded.push(token);
  }

  return expanded;
}

function parseLowOddsSlashFlags(args: string): Record<string, string | true> {
  return parseFlags(expandLowOddsSlashTokens(args.split(' ').filter(Boolean)));
}

function requireDateFlag(flags: Record<string, string | true>): string {
  const date = flags.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('--date YYYY-MM-DD is required.');
  }
  return date;
}

function optionalNumberFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`--${key} must be an integer.`);
  return parsed;
}

function requireStringFlag(flags: Record<string, string | true>, key: string): string {
  const value = flags[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${key} is required.`);
  return value.trim();
}

function optionalStringFlag(flags: Record<string, string | true>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalResearchWebMode(flags: Record<string, string | true>): ResearchWebMode {
  const value = optionalResearchWebModeFlag(flags) ?? 'off';
  return value;
}

function optionalResearchWebModeFlag(flags: Record<string, string | true>): ResearchWebMode | undefined {
  const value = optionalStringFlag(flags, 'web');
  if (value === undefined) return undefined;
  if (value === 'off' || value === 'cached' || value === 'live') return value;
  throw new Error('--web must be off, cached, or live.');
}

function optionalFloatFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number.`);
  return parsed;
}

function optionalMarketsFlag(flags: Record<string, string | true>): MarketKey[] | undefined {
  const value = flags.markets;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`--markets must be a comma-separated list of: ${MARKET_KEYS.join(', ')}.`);
  }

  const marketNames = value.split(',').map((market) => market.trim()).filter(Boolean);
  const invalid = marketNames.filter((market) => !isMarketKey(market));
  if (!marketNames.length || invalid.length) {
    throw new Error(`--markets contains unsupported market(s): ${invalid.join(', ') || value}. Use: ${MARKET_KEYS.join(', ')}.`);
  }

  return [...new Set(marketNames)] as MarketKey[];
}

function optionalRunIdsFlag(flags: Record<string, string | true>): string[] | undefined {
  const value = flags['run-ids'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('--run-ids must be a comma-separated list of run ids.');
  const runIds = value.split(',').map((runId) => runId.trim()).filter(Boolean);
  if (!runIds.length) throw new Error('--run-ids must include at least one run id.');
  return [...new Set(runIds)];
}

function optionalParlayAnalysisProfileScope(flags: Record<string, string | true>): 'core' | 'all' | undefined {
  const value = optionalStringFlag(flags, 'profile-scope');
  if (value === undefined) return undefined;
  if (value === 'core' || value === 'all') return value;
  throw new Error('--profile-scope must be core or all.');
}

function optionalPositiveIntegerFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const value = flags[key];
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${key} must be a positive integer.`);
  return parsed;
}

function optionalPositiveFloatFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const value = optionalFloatFlag(flags, key);
  if (value === undefined) return undefined;
  if (value <= 0) throw new Error(`--${key} must be greater than 0.`);
  return value;
}

function optionalProbabilityFlag(flags: Record<string, string | true>, key: string): number | undefined {
  const value = optionalFloatFlag(flags, key);
  if (value === undefined) return undefined;
  if (value < 0 || value > 1) throw new Error(`--${key} must be between 0 and 1.`);
  return value;
}

function optionalParlayConfig(flags: Record<string, string | true>): ParlayConfig {
  const config: ParlayConfig = {};
  const minLegs = optionalPositiveIntegerFlag(flags, 'min-legs');
  const maxLegs = optionalPositiveIntegerFlag(flags, 'max-legs');
  const minPredictionConfidence = optionalProbabilityFlag(flags, 'min-confidence');
  const maxCombinedOdds = optionalFloatFlag(flags, 'max-combined-odds');
  if (minLegs !== undefined) config.minLegs = minLegs;
  if (maxLegs !== undefined) config.maxLegs = maxLegs;
  if (flags['allow-multiple-legs-per-fixture'] === true) config.allowMultipleLegsPerFixture = true;
  if (minPredictionConfidence !== undefined) config.minPredictionConfidence = minPredictionConfidence;
  if (maxCombinedOdds !== undefined) config.maxCombinedOdds = maxCombinedOdds;
  return config;
}

function requiredValidationTarget(flags: Record<string, string | true>): RunValidationInput {
  const date = typeof flags.date === 'string' ? requireDateFlag(flags) : undefined;
  const predictionId = optionalStringFlag(flags, 'prediction-id');
  const parlayId = optionalStringFlag(flags, 'parlay-id');
  const count = [date, predictionId, parlayId].filter(Boolean).length;
  if (count !== 1) throw new Error('validate requires exactly one of --date, --prediction-id, or --parlay-id.');
  return {
    ...(date && { date }),
    ...(predictionId && { predictionId }),
    ...(parlayId && { parlayId }),
  };
}

function optionalRunValidationMode(flags: Record<string, string | true>): 'auto' | 'force' | false | undefined {
  const value = flags.validate;
  if (value === undefined) return undefined;
  if (value === true) return 'force';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'force') return normalized;
  if (normalized === 'off' || normalized === 'false' || normalized === 'disabled' || normalized === 'none') return false;
  throw new Error('--validate must be auto, force, or off.');
}

function optionalDailyProvidersFlag(flags: Record<string, string | true>): DailyE2EProvider[] | undefined {
  const value = optionalStringFlag(flags, 'providers');
  if (value === undefined) return undefined;
  const providers = value.split(',').map((provider) => provider.trim()).filter(Boolean);
  const invalid = providers.filter((provider) => provider !== 'codex' && provider !== 'gemini');
  if (!providers.length || invalid.length) {
    throw new Error(`--providers must be a comma-separated list using codex,gemini. Invalid: ${invalid.join(',') || value}.`);
  }
  return [...new Set(providers)] as DailyE2EProvider[];
}

function optionalDailyParlayProfileFlag(flags: Record<string, string | true>): DailyParlayProfile | undefined {
  const value = optionalStringFlag(flags, 'parlay-profile');
  if (value === undefined) return undefined;
  if (
    value === 'safe-consensus'
    || value === 'balanced'
    || value === 'aggressive-analytical'
    || value === 'low-variance'
    || value === 'high-conviction'
    || value === 'market-diverse'
    || value === 'parlay-oro'
  ) {
    return value;
  }
  throw new Error('--parlay-profile must be safe-consensus, balanced, aggressive-analytical, low-variance, high-conviction, market-diverse, or parlay-oro.');
}

function requiredRunInput(flags: Record<string, string | true>): { date: string; runId?: string; validate?: 'auto' | 'force' | false; web?: ResearchWebMode; markets?: MarketKey[] } {
  return {
    date: requireDateFlag(flags),
    runId: optionalStringFlag(flags, 'run-id'),
    validate: optionalRunValidationMode(flags),
    web: optionalResearchWebModeFlag(flags),
    markets: optionalMarketsFlag(flags),
  };
}

function requiredRunId(flags: Record<string, string | true>): string {
  return requireStringFlag(flags, 'run-id');
}

async function scoreFixture(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<FixtureScoringResult> {
  const fixtureId = requireStringFlag(flags, 'fixture-id');
  const service = await loadOptionalRunService();
  const runner = service.runFixtureScoring ?? runFixtureScoring;
  return runner(ctx.config, { fixtureId, web: optionalResearchWebMode(flags), markets: optionalMarketsFlag(flags) }, ctx.runtime);
}

async function buildParlay(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<ParlayBuildRunResult> {
  const portfolio = optionalStringFlag(flags, 'portfolio');
  const deterministicPortfolios = new Set(['low-variance', 'balanced', 'totals', 'high-conviction', 'market-diverse', 'parlay-oro']);
  if (portfolio !== undefined && portfolio !== 'llm' && portfolio !== 'low-odds-top' && !deterministicPortfolios.has(portfolio)) {
    throw new Error('--portfolio must be llm, low-odds-top, low-variance, balanced, totals, high-conviction, market-diverse, or parlay-oro when provided.');
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

async function analyzeParlays(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<ParlayAnalysisRunResult> {
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

async function validateResults(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<ValidationRunResult> {
  const input = requiredValidationTarget(flags);
  const service = await loadOptionalRunService();
  const runner = service.runValidation ?? runValidation;
  return runner(ctx.config, input, ctx.runtime);
}

async function buildDailyMetrics(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<DailyMetricsRunResult> {
  const persistFlag = optionalStringFlag(flags, 'persist');
  const persist = flags.persist === true || persistFlag === undefined
    ? true
    : !['false', 'off', 'no', '0'].includes(persistFlag.toLowerCase());
  return runDailyMetrics(ctx.config, {
    date: requireDateFlag(flags),
    days: optionalPositiveIntegerFlag(flags, 'days'),
    scope: optionalStringFlag(flags, 'scope'),
    persist,
  }, ctx.runtime);
}

async function runPipeline(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<RunPipelineResult> {
  const input = requiredRunInput(flags);
  const service = await loadOptionalRunService();
  if (!service.runPipeline) {
    throw new Error('run-service is not available yet; expected runPipeline in src/runtime/run-service.ts.');
  }
  return service.runPipeline(ctx.config, input, ctx.runtime);
}

async function runDailyE2ECommand(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<DailyE2ERunResult> {
  const persistMetricsFlag = optionalStringFlag(flags, 'persist-metrics');
  const persistMetrics = flags['persist-metrics'] === true || persistMetricsFlag === undefined
    ? true
    : !['false', 'off', 'no', '0'].includes(persistMetricsFlag.toLowerCase());
  return runDailyE2E(ctx.config, {
    date: requireDateFlag(flags),
    providers: optionalDailyProvidersFlag(flags),
    maxFixtures: optionalPositiveIntegerFlag(flags, 'max-fixtures'),
    threshold: optionalFloatFlag(flags, 'threshold'),
    web: optionalResearchWebModeFlag(flags),
    validate: optionalRunValidationMode(flags) as DailyE2EValidationMode | undefined,
    markets: optionalMarketsFlag(flags),
    parlayProfile: optionalDailyParlayProfileFlag(flags),
    persistMetrics,
    dailyBatchId: optionalStringFlag(flags, 'daily-batch-id'),
  }, ctx.runtime);
}

async function exportRun(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<RunExportResult> {
  const input = { runId: requiredRunId(flags) };
  const service = await loadOptionalRunService();
  if (!service.exportRunArtifacts) {
    throw new Error('run-service is not available yet; expected exportRunArtifacts in src/runtime/run-service.ts.');
  }
  return service.exportRunArtifacts(ctx.config, input, ctx.runtime);
}

function listArtifacts(config: AgentConfig, flags: Record<string, string | true>): ArtifactListResult {
  const artifactRoot = ensureArtifactRoot(config);
  const runId = optionalStringFlag(flags, 'run-id');
  const path = runId ? join(artifactRoot, 'runs', runId) : artifactRoot;
  const files = existsSync(path) ? readdirSync(path).sort() : [];
  return { artifactRoot, runId, path, files };
}

function optionalCombineModeFlag(flags: Record<string, string | true>): FilterCombineMode | undefined {
  const value = flags.combine;
  if (value === undefined) return undefined;
  const normalized = String(value).toUpperCase();
  if (normalized === 'OR' || normalized === 'AND') return normalized;
  throw new Error('--combine must be OR or AND.');
}

function wantsDefault(flags: Record<string, string | true>, key: string): boolean {
  return flags[key] === true || flags[key] === 'default';
}

function configWithMarketOverride(config: AgentConfig, markets: MarketKey[] | undefined): AgentConfig {
  if (!markets) return config;
  return {
    ...config,
    apiFootball: {
      ...config.apiFootball,
      defaultMarkets: markets,
    },
  };
}

function optionalDashboardOptions(flags: Record<string, string | true>): DashboardOptions {
  return {
    port: optionalPositiveIntegerFlag(flags, 'port'),
    host: optionalStringFlag(flags, 'host'),
  };
}

async function serveDashboard(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<void> {
  const dashboard = await startDashboardServer(ctx.config, optionalDashboardOptions(flags));
  console.log(`  ${GREEN}✓${RESET} ${DIM}dashboard${RESET} ${CYAN}${dashboard.url}${RESET}`);
  console.log(`  ${DIM}Press Ctrl+C to stop.${RESET}`);
  await new Promise<void>((resolve) => dashboard.server.once('close', resolve));
}

async function runLowOddsScan(ctx: HeadlessCommandContext | CommandContext, flags: Record<string, string | true>): Promise<LowOddsScanView> {
  const input = {
    date: requireDateFlag(flags),
    threshold: optionalFloatFlag(flags, 'threshold'),
    leaguesDefault: wantsDefault(flags, 'leagues'),
    teamsDefault: wantsDefault(flags, 'teams'),
    combineMode: optionalCombineModeFlag(flags),
  };
  const markets = optionalMarketsFlag(flags);
  printLongRunningLowOddsNotice(input.date);
  return scanLowOdds(configWithMarketOverride(ctx.config, markets), input, ctx.runtime);
}

function printLongRunningLowOddsNotice(date: string): void {
  console.log(`  ${YELLOW}!${RESET} ${DIM}low-odds scan for ${date} can take several minutes on full slates; quiet output is normal. Wait and verify child processes/artifacts before killing it.${RESET}`);
}

async function printPresetCounts(config: AgentConfig): Promise<void> {
  try {
    const leagues = await listLeaguePresets(config);
    printKeyValue('activeLeaguePresets', leagues.length);
  } catch (err: any) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}Could not load league preset count: ${err?.message ?? err}${RESET}`);
  }
  if (!config.databaseUrl) return;
  try {
    const teams = await listTeamPresets(config);
    printKeyValue('activeTeamPresets', teams.length);
  } catch (err: any) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}Could not load team preset count: ${err?.message ?? err}${RESET}`);
  }
}

function printFixtures(fixtures: Fixture[]): void {
  if (!fixtures.length) {
    console.log(`  ${DIM}No fixtures found.${RESET}`);
    return;
  }

  console.log(`  ${CYAN}fixtures${RESET} ${DIM}${fixtures.length}${RESET}`);
  for (const fixture of fixtures) {
    const kickoff = fixture.scheduledAt.replace('T', ' ').replace('.000Z', 'Z');
    const score = fixture.scoreHome !== undefined && fixture.scoreAway !== undefined
      ? ` ${fixture.scoreHome}-${fixture.scoreAway}`
      : '';
    console.log(
      `  ${GREEN}•${RESET} ${CYAN}${fixture.providerFixtureId}${RESET} ${DIM}${kickoff}${RESET} ${fixture.status}${score}`,
    );
  }
}

function printOdds(quotes: OddsQuote[], details?: { oddsSnapshotId?: string; providerSnapshotId?: string }): void {
  console.log(`  ${CYAN}odds${RESET} ${DIM}${quotes.length}${RESET}`);
  if (details?.providerSnapshotId) printKeyValue('providerSnapshotId', details.providerSnapshotId);
  if (details?.oddsSnapshotId) printKeyValue('oddsSnapshotId', details.oddsSnapshotId);
  for (const quote of quotes) {
    const line = quote.line === undefined ? '' : ` ${quote.line}`;
    const bookmaker = quote.bookmaker ? ` ${DIM}${quote.bookmaker}${RESET}` : '';
    console.log(
      `  ${GREEN}•${RESET} ${CYAN}${quote.market}${RESET} ${quote.selection}${line} ${quote.price.toFixed(3)} p=${quote.impliedProbability.toFixed(3)}${bookmaker}`,
    );
  }
}

function printLowOddsScan(scan: LowOddsScanView): void {
  console.log(`  ${CYAN}low-odds${RESET} ${DIM}scan=${scan.scanId ?? 'none'} fixtures=${scan.fixtureCount} hits=${scan.hitCount} threshold=${scan.threshold}${RESET}`);
  if (scan.selectorMarketScope?.length) {
    console.log(`  ${DIM}selector=${scan.selectorMarketScope.join(',')} market-scoped low-odds indicator${RESET}`);
  }
  for (const hit of scan.hits) {
    const line = hit.line === undefined ? '' : ` ${hit.line}`;
    const bookmaker = hit.bookmaker ? ` ${DIM}${hit.bookmaker}${RESET}` : '';
    console.log(
      `  ${GREEN}•${RESET} ${CYAN}${hit.providerFixtureId}${RESET} ${hit.market} ${hit.selection}${line} ${hit.odds.toFixed(3)} p=${hit.impliedProbability.toFixed(3)}${bookmaker}`,
    );
  }
}

function printResearchResult(result: FixtureResearchResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}research${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  if (result.bundle) {
    printKeyValue('researchBundleId', result.bundle.id);
    printKeyValue('fixtureId', result.bundle.fixtureId);
    printKeyValue('providerFixtureId', result.bundle.providerFixtureId);
    printKeyValue('sources', result.bundle.sources.length);
    printKeyValue('evidenceItems', result.bundle.evidenceItems.length);
    printKeyValue('claims', result.bundle.claims.length);
  }
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

function printScoringResult(result: FixtureScoringResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}score${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.fixtureId) printKeyValue('fixtureId', result.fixtureId);
  if (result.providerFixtureId) printKeyValue('providerFixtureId', result.providerFixtureId);
  printKeyValue('predictions', result.predictions.length);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

function printParlayResult(result: ParlayBuildRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}${result.portfolio ? 'parlay portfolio' : 'parlay'}${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  printKeyValue('runId', result.runId);
  printKeyValue('date', result.date);
  if (result.portfolio) {
    printKeyValue('portfolioId', result.portfolio.id);
    printKeyValue('sourceRunId', result.portfolio.sourceRunId);
    printKeyValue('parlays', result.portfolio.parlays.length);
    if (result.persistedParlayIds?.length) printKeyValue('persistedParlayIds', result.persistedParlayIds.join(', '));
    for (const profile of result.portfolio.profiles) {
      printKeyValue(`profile.${profile.profile}`, `${profile.included}/${profile.requested} included, ${profile.rejected} rejected`);
    }
    if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
    for (const reason of result.gateResult.reasons) {
      console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
    }
    for (const warning of result.gateResult.warnings) {
      console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
    }
    return;
  }
  printKeyValue('parlayId', result.build.parlay.id);
  if (result.persistedParlayId) printKeyValue('persistedParlayId', result.persistedParlayId);
  printKeyValue('legs', result.build.parlay.legs.length);
  if (result.build.parlay.combinedOdds !== undefined) printKeyValue('combinedOdds', result.build.parlay.combinedOdds);
  printKeyValue('aggregateConfidence', result.build.parlay.aggregateConfidence);
  printKeyValue('aggregateQuality', result.build.parlay.aggregateQuality);
  printKeyValue('artifactType', 'analytical only; not executable');
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

function printParlayAnalysisResult(result: ParlayAnalysisRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}parlay analysis${RESET} ${DIM}${result.ok ? 'completed' : 'blocked'}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.date) printKeyValue('date', result.date);
  if (result.sourceRunId) printKeyValue('sourceRunId', result.sourceRunId);
  printKeyValue('analyzed', result.analyzed);
  printKeyValue('top', result.top.length);
  printKeyValue('artifactType', 'analytical only; not executable');
  printKeyValue('profileScope', result.diagnostics.profileScope);
  if (result.diagnostics.rawAnalyzed !== result.analyzed) printKeyValue('rawAnalyzed', result.diagnostics.rawAnalyzed);
  if (result.diagnostics.profileScopedAnalyzed !== result.analyzed) printKeyValue('profileScopedAnalyzed', result.diagnostics.profileScopedAnalyzed);
  if (result.diagnostics.cohortSourceRunId) printKeyValue('cohortSourceRunId', result.diagnostics.cohortSourceRunId);
  printKeyValue('exposurePolicy', `${result.diagnostics.exposurePolicy.analyticalUnits} analytical units, max portfolio exposure ${(result.diagnostics.exposurePolicy.maxPortfolioExposure * 100).toFixed(2)}%`);
  printKeyValue('universeHitRate', result.diagnostics.universe.hitRate === null ? 'n/a' : `${(result.diagnostics.universe.hitRate * 100).toFixed(1)}%`);
  printKeyValue('selectedHitRate', result.diagnostics.selected.hitRate === null ? 'n/a' : `${(result.diagnostics.selected.hitRate * 100).toFixed(1)}%`);
  printKeyValue('selectedExposureUnits', result.diagnostics.selected.totalExposureUnits);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.error) console.log(`  ${DIM}reason:${RESET} ${CYAN}${result.error}${RESET}`);
  for (const recommendation of result.top) {
    const banker = recommendation.bankerLegs.length ? ` bankerLegs:${recommendation.bankerLegs.length}` : '';
    console.log(`  ${CYAN}#${recommendation.rank}${RESET} ${recommendation.parlayId} ${DIM}${recommendation.profile} ${recommendation.validationStatus}${RESET} odds:${recommendation.combinedOdds} exposure:${recommendation.exposure.units}${banker}`);
  }
}

function printValidationResult(result: ValidationRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}validate${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.target.date) printKeyValue('date', result.target.date);
  if (result.target.predictionId) printKeyValue('predictionId', result.target.predictionId);
  if (result.target.parlayId) printKeyValue('parlayId', result.target.parlayId);
  printKeyValue('validations', result.validations.length);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

function printDailyMetricsResult(result: DailyMetricsRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}daily metrics${RESET} ${DIM}${result.ok ? 'ready' : 'failed'}${RESET}`);
  printKeyValue('runId', result.runId);
  printKeyValue('date', result.date);
  printKeyValue('days', result.days);
  printKeyValue('snapshots', result.metrics.length);
  printKeyValue('persisted', result.persisted);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const snapshot of result.metrics) {
    const predictions = snapshot.predictionMetrics;
    const parlays = snapshot.parlayMetrics;
    console.log(`  ${GREEN}•${RESET} ${CYAN}${snapshot.metricDate}${RESET} ${DIM}pred=${predictions.won}-${predictions.lost} hit=${formatNullablePercent(predictions.hitRate)} parlay=${parlays.won}-${parlays.lost} hit=${formatNullablePercent(parlays.hitRate)}${RESET}`);
  }
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

function printRunResult(result: RunPipelineResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}run${RESET} ${DIM}${result.verdict ?? (result.ok ? 'succeeded' : 'failed')}${RESET}`);
  if (result.runId) printKeyValue('runId', result.runId);
  if (result.date) printKeyValue('date', result.date);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.handoffPath) printKeyValue('handoff', result.handoffPath);
  if (result.evidencePackPath) printKeyValue('evidencePack', result.evidencePackPath);
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

function printDailyE2EResult(result: DailyE2ERunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}daily-e2e${RESET} ${DIM}${result.ok ? 'succeeded' : 'review-required'}${RESET}`);
  printKeyValue('dailyBatchId', result.dailyBatchId);
  printKeyValue('date', result.date);
  printKeyValue('artifact', result.artifactDir);
  printKeyValue('summary', result.summaryPath);
  printKeyValue('report', result.reportPath);
  for (const provider of result.providers) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${provider.provider}${RESET} ${DIM}${provider.model} run=${provider.runId ?? 'none'} verdict=${provider.verdict ?? 'n/a'}${RESET}`);
  }
  for (const family of result.parlays) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${family.family}${RESET} ${DIM}run=${family.runId ?? 'none'} sourceRuns=${family.sourceRunIds.join(',') || 'none'} verdict=${family.verdict ?? 'n/a'}${RESET}`);
  }
  if (result.parlayAnalysis) printKeyValue('recommendations', result.parlayAnalysis.top.length);
  if (result.metrics) printKeyValue('metricsPersisted', result.metrics.persisted);
  printKeyValue('artifactType', 'analytical only; not executable');
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

function printExportResult(result: RunExportResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}export${RESET} ${DIM}${result.ok ? 'ready' : 'failed'}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.handoffPath) printKeyValue('handoff', result.handoffPath);
  if (result.evidencePackPath) printKeyValue('evidencePack', result.evidencePackPath);
  for (const file of result.files ?? []) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${file}${RESET}`);
  }
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

function printCertificationResult(result: Awaited<ReturnType<typeof runCertification>>): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}certify${RESET} ${DIM}${result.profile}${RESET}`);
  printKeyValue('manifest', result.manifestPath);
  printKeyValue('hash', result.hash);
  for (const check of result.checks) {
    console.log(`  ${check.ok ? GREEN + '✓' + RESET : YELLOW + '!' + RESET} ${DIM}${check.name}${RESET}`);
  }
}

function printArtifacts(result: ArtifactListResult): void {
  console.log(`  ${CYAN}artifacts${RESET} ${DIM}${result.path}${RESET}`);
  printKeyValue('artifactRoot', result.artifactRoot);
  if (result.runId) printKeyValue('runId', result.runId);
  if (!result.files.length) {
    console.log(`  ${DIM}No artifacts found.${RESET}`);
    return;
  }
  for (const file of result.files) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${file}${RESET}`);
  }
}

function computeNoParlayStats(config: AgentConfig): { runs: number; noParlay: number; promoted: number; percentNoParlay: string } {
  const evidenceRoot = join(resolve(config.artifactRoot), 'evidence-packs');
  if (!existsSync(evidenceRoot)) return { runs: 0, noParlay: 0, promoted: 0, percentNoParlay: '0.0%' };
  let runs = 0;
  let noParlay = 0;
  let promoted = 0;
  for (const runId of readdirSync(evidenceRoot)) {
    const manifestPath = join(evidenceRoot, runId, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const parlay = String(manifest?.handoff?.parlay ?? '');
      if (!parlay) continue;
      runs += 1;
      if (parlay === 'no-parlay-today') noParlay += 1;
      else promoted += 1;
    } catch {
      // Ignore malformed historical artifacts; stats is read-only and best-effort.
    }
  }
  const percent = runs ? (noParlay / runs) * 100 : 0;
  return { runs, noParlay, promoted, percentNoParlay: `${percent.toFixed(1)}%` };
}

async function readLeaderboardRows(config: AgentConfig, since?: string): Promise<any[]> {
  if (config.databaseUrl) {
    try {
      const db = getPrismaClient() as any;
      if (db.leaderboardEntry?.findMany) {
        return await db.leaderboardEntry.findMany({
          where: since ? { generatedAt: { gte: new Date(since) } } : undefined,
          orderBy: { generatedAt: 'desc' },
          take: 50,
        });
      }
    } catch {
      // Fall back to local artifacts below.
    }
  }
  const runsRoot = join(resolve(config.artifactRoot), 'runs');
  if (!existsSync(runsRoot)) return [];
  const rows: any[] = [];
  for (const runId of readdirSync(runsRoot)) {
    const validationPath = join(runsRoot, runId, 'validations.json');
    if (!existsSync(validationPath)) continue;
    try {
      const payload = JSON.parse(readFileSync(validationPath, 'utf-8'));
      if (since && typeof payload.evaluatedAt === 'string' && payload.evaluatedAt < since) continue;
      const leaderboard = Array.isArray(payload?.analytics?.leaderboard) ? payload.analytics.leaderboard : [];
      rows.push(...leaderboard.map((entry: any) => ({ ...entry, runId, generatedAt: payload.evaluatedAt })));
    } catch {
      // Ignore malformed historical artifacts.
    }
  }
  return rows;
}

function printLeaderboardRows(rows: any[], by: string): void {
  printKeyValue('rows', rows.length);
  printKeyValue('by', by);
  if (!rows.length) {
    printKeyValue('status', 'no leaderboard rows found');
    return;
  }
  for (const row of rows.slice(0, 20)) {
    const label = [
      row.promptVersion ?? 'unknown-prompt',
      row.modelId ?? 'unknown-model',
      row.market ?? 'unknown-market',
      row.league ?? 'unknown-league',
    ].join(' | ');
    console.log(`  ${GREEN}•${RESET} ${CYAN}${label}${RESET} ${DIM}n=${row.n} brier=${formatMetric(row.brier)} logloss=${formatMetric(row.logloss)} hitrate=${formatMetric(row.hitrate)} lowSample=${Boolean(row.lowSample)}${RESET}`);
  }
}

function formatMetric(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(4) : 'n/a';
}

function formatNullablePercent(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'n/a';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : 'n/a';
}

function printSessionStatus(ctx: CommandContext): void {
  syncRuntime(ctx);
  const providerState = buildAgentProviderState(ctx.config, {
    codexAuthPath: resolve(ctx.config.codexHome, 'auth.json'),
    codexAuthConfigured: existsSync(resolve(ctx.config.codexHome, 'auth.json')),
    geminiAuthPath: resolve(ctx.config.geminiHome, 'oauth_creds.json'),
    geminiAuthConfigured: existsSync(resolve(ctx.config.geminiHome, 'oauth_creds.json')),
    openrouterConfigured: Boolean(ctx.config.apiKey || process.env.OPENROUTER_API_KEY),
  });
  printKeyValue('sessionPath', ctx.sessionPath);
  printKeyValue('runId', ctx.runtime.runId ?? 'none');
  printKeyValue('runtime', ctx.config.runtime);
  printKeyValue('provider', providerState.label);
  printKeyValue('authStatus', providerState.auth.configured ? 'ready' : 'missing');
  printKeyValue('model', ctx.config.model);
  printKeyValue('codexThreadId', redactProviderSessionId(ctx.config.codexThreadId) ?? 'none');
  printKeyValue('geminiSessionId', redactProviderSessionId(ctx.config.geminiSessionId) ?? 'none');
  printKeyValue('nativeWebSearch', ctx.config.nativeWebSearch ? `${ctx.config.nativeWebSearchMode} available` : 'off');
  printKeyValue('profile', ctx.config.profile);
  printKeyValue('approvalMode', ctx.config.approvalMode);
  printKeyValue('artifactRoot', ctx.config.artifactRoot);
  printKeyValue('tokens', `${ctx.totalTokens.input} in / ${ctx.totalTokens.output} out`);
}

function printApprovalStatus(ctx: Pick<CommandContext, 'config' | 'runtime'>): void {
  const tools = listToolMetadata();
  const autoGranted = ctx.config.profile === 'full-permissions' && ctx.config.approvalMode === 'auto-grant'
    ? tools.filter((tool) => tool.requiresApproval === 'standard' && !tool.destructive).map((tool) => tool.name)
    : [];
  const manual = tools.filter((tool) => tool.requiresApproval === 'always' || tool.destructive).map((tool) => tool.name);
  const standardManual = tools.filter((tool) => tool.requiresApproval === 'standard').map((tool) => tool.name);
  printKeyValue('profile', ctx.config.profile);
  printKeyValue('approvalMode', ctx.config.approvalMode);
  printKeyValue('policy', ctx.config.approvalMode === 'auto-grant'
    ? 'auto-grant for configured standard actions, audit retained'
    : 'manual approvals for sensitive actions');
  printKeyValue('autoGranted', autoGranted.length ? autoGranted.join(', ') : 'none');
  printKeyValue('manualRequired', ctx.config.profile === 'standard' ? standardManual.join(', ') : manual.join(', ') || 'none');
  printKeyValue('audit', `${ctx.runtime.artifactRoot}/runs/<session-run>/audit-log.jsonl`);
  printKeyValue('lastAuditEvent', latestAuditEvent(ctx.runtime));
}

function printApprovalRequests(items: ApprovalRequest[]): void {
  if (!items.length) {
    console.log(`  ${DIM}No approvals found.${RESET}`);
    return;
  }
  for (const item of items) {
    console.log(`  ${CYAN}${item.approvalId}${RESET} ${item.status} ${DIM}${item.toolName} call=${item.toolCallId} risk=${item.risk}${RESET}`);
    console.log(`  ${DIM}${item.reason}${RESET}`);
  }
}

async function handleApprovalCommand(ctx: Pick<CommandContext, 'config' | 'runtime'>, args: string): Promise<void> {
  const tokens = args.split(' ').filter(Boolean);
  const action = tokens[0];
  const id = tokens[1];
  if (!action) {
    printApprovalStatus(ctx);
    return;
  }
  if (action === 'pending') {
    printApprovalRequests(listApprovals(ctx.runtime, 'pending'));
    return;
  }
  if (action === 'show') {
    if (!id) throw new Error('approval show requires APPROVAL_ID.');
    printApprovalRequests(listApprovals(ctx.runtime).filter((item) => item.approvalId === id));
    return;
  }
  if (action === 'approve') {
    if (!id) throw new Error('approval approve requires APPROVAL_ID.');
    const result = await approveAndExecute(ctx.config, ctx.runtime, id);
    printKeyValue('approvalId', id);
    printKeyValue('result', JSON.stringify(redactSecrets(result)));
    return;
  }
  if (action === 'deny') {
    if (!id) throw new Error('approval deny requires APPROVAL_ID.');
    const result = denyApproval(ctx.runtime, id);
    printKeyValue('approvalId', result.approvalId);
    printKeyValue('status', result.status);
    return;
  }
  throw new Error('approval command must be pending, show, approve, or deny.');
}

function latestAuditEvent(runtime: RuntimeContext): string {
  const runId = runtime.runId ?? sessionRunId(runtime.sessionPath);
  const path = join(resolve(runtime.artifactRoot), 'runs', runId, 'audit-log.jsonl');
  if (!existsSync(path)) return 'none';
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  if (!lines.length) return 'none';
  try {
    const parsed = JSON.parse(lines[lines.length - 1]) as { type?: string; timestamp?: string };
    return [parsed.type, parsed.timestamp].filter(Boolean).join(' @ ') || 'present';
  } catch {
    return 'present';
  }
}

function sessionRunId(sessionPath: string): string {
  const name = sessionPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'session';
  return `session-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

function applyProfile(profile: AgentConfig['profile'], ctx: Pick<CommandContext, 'config' | 'runtime'>): void {
  ctx.config.profile = profile;
  ctx.config.approvalMode = profile === 'full-permissions' ? 'auto-grant' : 'manual';
  updateRuntimeContext(ctx.runtime, ctx.config);
  appendAuditEvent(ctx.runtime, {
    type: 'profile.changed',
    payload: {
      profile: ctx.config.profile,
      approvalMode: ctx.config.approvalMode,
    },
  });
}

function providerReady(ctx: CommandContext, provider: Provider): boolean {
  if (provider === 'codex') return existsSync(resolve(ctx.config.codexHome, 'auth.json'));
  if (provider === 'gemini') return existsSync(resolve(ctx.config.geminiHome, 'oauth_creds.json'));
  return Boolean(ctx.config.apiKey || process.env.OPENROUTER_API_KEY);
}

function defaultModelForProvider(ctx: CommandContext, provider: Provider): string {
  const original = ctx.config.provider;
  ctx.config.provider = provider;
  const models = loadProviderModels(ctx);
  ctx.config.provider = original;

  const candidates = PROVIDER_DEFAULT_MODELS[provider];
  return selectDefaultModelForProvider(
    provider,
    models.length ? models.map((model) => model.id) : candidates,
  ) ?? ctx.config.model;
}

function resetProviderSession(ctx: CommandContext): void {
  ctx.messages.length = 0;
  ctx.config.codexThreadId = undefined;
  ctx.config.geminiSessionId = undefined;
  ctx.config.fastMode = false;
  ctx.config.reasoningEffort = undefined;
  ctx.sessionPath = ctx.resetSession();
  updateRuntimeContext(ctx.runtime, ctx.config, { sessionPath: ctx.sessionPath });
}

async function loadOpenRouterModels() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const { data } = await res.json() as { data: { id: string; name: string }[] };
  return data;
}

commands.push({
  name: '/provider',
  description: 'Switch provider: codex, gemini, openrouter',
  execute: async (args, ctx) => {
    const next = args.trim().toLowerCase() as Provider | '';

    if (!next) {
      for (const provider of PROVIDERS) {
        const marker = provider === ctx.config.provider ? '*' : ' ';
        const ready = providerReady(ctx, provider) ? 'ready' : 'not configured';
        console.log(`  ${DIM}${marker}${RESET} ${CYAN}${provider.padEnd(10)}${RESET}${DIM}${providerLabel(provider)} · ${ready}${RESET}`);
      }
      console.log(`\n  ${DIM}Usage:${RESET} ${CYAN}/provider codex|gemini|openrouter${RESET}`);
      return;
    }

    if (!PROVIDERS.includes(next)) {
      console.log(`  ${YELLOW}!${RESET} ${DIM}Unknown provider "${next}". Use codex, gemini, or openrouter.${RESET}`);
      return;
    }

    if (!providerReady(ctx, next)) {
      console.log(`  ${YELLOW}!${RESET} ${DIM}${providerLabel(next)} is not configured for this machine.${RESET}`);
      return;
    }

    if (next === ctx.config.provider) {
      console.log(`  ${DIM}Already using${RESET} ${CYAN}${providerLabel(next)}${RESET} ${DIM}with model${RESET} ${CYAN}${ctx.config.model}${RESET}`);
      return;
    }

    ctx.config.provider = next;
    ctx.config.model = defaultModelForProvider(ctx, next);
    resetProviderSession(ctx);
    saveAgentCommandEvent(ctx, 'agent.provider_changed', { provider: next, model: ctx.config.model });
    saveAgentCommandEvent(ctx, 'agent.session_reset', { reason: 'provider_changed' });
    if (ctx.config.profile === 'full-permissions' && ctx.config.approvalMode === 'auto-grant') {
      appendAuditEvent(ctx.runtime, {
        type: 'approval.auto_granted',
        payload: { action: 'agent.provider_changed', provider: next },
      });
    }
    console.log(`  ${GREEN}✓${RESET} ${DIM}Provider →${RESET} ${CYAN}${providerLabel(next)}${RESET}`);
    console.log(`  ${DIM}Model →${RESET} ${CYAN}${ctx.config.model}${RESET}`);
  },
});

commands.push({
  name: '/model',
  description: 'Switch model for the active provider',
  execute: async (args, ctx) => {
    console.log(`  ${DIM}Provider:${RESET} ${CYAN}${providerLabel(ctx.config.provider)}${RESET}`);
    console.log(`  ${DIM}Current:${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    const query = args.trim() || await ask(ctx.rl, `  ${DIM}Search models (empty lists first page):${RESET} `);
    process.stdout.write(`  ${DIM}Fetching…${RESET}`);
    let data = ctx.config.provider === 'openrouter'
      ? await loadOpenRouterModels()
      : loadProviderModels(ctx);
    process.stdout.write('\r\x1b[K');
    if (ctx.config.provider !== 'openrouter' && !data.length) {
      const hint = providerCatalogHint(ctx);
      console.log(`  ${YELLOW}!${RESET} ${DIM}No local model catalog found for ${providerLabel(ctx.config.provider)}.${RESET}`);
      if (hint.path) printKeyValue('expectedPath', hint.path);
      if (hint.script) printKeyValue('updateScript', hint.script);
      console.log(`  ${DIM}Using explicit fallback defaults only.${RESET}`);
      data = PROVIDER_DEFAULT_MODELS[ctx.config.provider].map((id) => ({ id, name: id }));
    }
    const q = query.toLowerCase();
    const matches = data
      .filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 25);
    if (!matches.length) { console.log(`  ${DIM}No models matching "${query}".${RESET}`); return; }
    if (!q && data.length > matches.length) {
      console.log(`  ${DIM}Showing first ${matches.length} of ${data.length}. Use /model <search> to filter.${RESET}`);
    }
    matches.forEach((m, i) => console.log(`  ${DIM}${String(i + 1).padStart(2)})${RESET} ${m.id}`));
    const pick = await ask(ctx.rl, `\n  ${DIM}Select (1-${matches.length}):${RESET} `);
    const idx = parseInt(pick) - 1;
    if (idx >= 0 && idx < matches.length) {
      ctx.config.model = matches[idx].id;
      syncRuntime(ctx);
      saveAgentCommandEvent(ctx, 'agent.model_changed', { model: ctx.config.model });
      console.log(`  ${DIM}Model →${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    } else { console.log(`  ${DIM}Cancelled.${RESET}`); }
  },
});

commands.push({
  name: '/fast',
  description: 'Toggle fast mode when supported',
  execute: async (_args, ctx) => {
    const next = !ctx.config.fastMode;
    const models = loadProviderModels(ctx);
    const current = models.find((model) => model.id === ctx.config.model);

    if (ctx.config.provider === 'codex') {
      if (next && current?.speedTiers && !current.speedTiers.includes('fast')) {
        console.log(`  ${YELLOW}!${RESET} ${DIM}${ctx.config.model} does not advertise a fast tier.${RESET}`);
        return;
      }
      ctx.config.fastMode = next;
      syncRuntime(ctx);
      console.log(`  ${GREEN}✓${RESET} ${DIM}Fast mode ${next ? 'enabled' : 'disabled'} for Codex.${RESET}`);
      return;
    }

    console.log(`  ${YELLOW}!${RESET} ${DIM}/fast is not supported for provider "${ctx.config.provider}".${RESET}`);
  },
});

commands.push({
  name: '/think',
  description: 'Set reasoning effort: low, medium, high, xhigh',
  execute: async (args, ctx) => {
    const effort = args.trim() as AgentConfig['reasoningEffort'];
    if (!effort || !['low', 'medium', 'high', 'xhigh'].includes(effort)) {
      console.log(`  ${DIM}Usage:${RESET} ${CYAN}/think low|medium|high|xhigh${RESET}`);
      return;
    }

    const models = loadProviderModels(ctx);
    const current = models.find((model) => model.id === ctx.config.model);

    if (ctx.config.provider === 'codex') {
      if (current?.supportedReasoning && !current.supportedReasoning.includes(effort)) {
        console.log(`  ${YELLOW}!${RESET} ${DIM}${ctx.config.model} supports: ${current.supportedReasoning.join(', ')}.${RESET}`);
        return;
      }
      ctx.config.reasoningEffort = effort;
      syncRuntime(ctx);
      console.log(`  ${GREEN}✓${RESET} ${DIM}Codex reasoning →${RESET} ${CYAN}${effort}${RESET}`);
      return;
    }

    console.log(`  ${YELLOW}!${RESET} ${DIM}/think is not supported for provider "${ctx.config.provider}".${RESET}`);
  },
});

commands.push({
  name: '/web',
  description: 'Show or change native web search: on, off, cached, live',
  execute: async (args, ctx) => {
    const mode = args.trim().toLowerCase();

    if (!mode) {
      console.log(`  ${DIM}Native web search:${RESET} ${CYAN}${ctx.config.nativeWebSearch ? 'on' : 'off'}${RESET}`);
      console.log(`  ${DIM}Codex mode:${RESET} ${CYAN}${ctx.config.nativeWebSearchMode}${RESET}`);
      console.log(`\n  ${DIM}Usage:${RESET} ${CYAN}/web on|off|cached|live${RESET}`);
      return;
    }

    if (mode === 'on') {
      ctx.config.nativeWebSearch = true;
      syncRuntime(ctx);
      saveAgentCommandEvent(ctx, 'agent.web_changed', { nativeWebSearch: true, mode: ctx.config.nativeWebSearchMode });
      console.log(`  ${GREEN}✓${RESET} ${DIM}Native web search enabled.${RESET}`);
      return;
    }

    if (mode === 'off') {
      ctx.config.nativeWebSearch = false;
      syncRuntime(ctx);
      saveAgentCommandEvent(ctx, 'agent.web_changed', { nativeWebSearch: false, mode: ctx.config.nativeWebSearchMode });
      console.log(`  ${GREEN}✓${RESET} ${DIM}Native web search disabled.${RESET}`);
      return;
    }

    if (mode === 'cached' || mode === 'live') {
      ctx.config.nativeWebSearch = true;
      ctx.config.nativeWebSearchMode = mode;
      syncRuntime(ctx);
      saveAgentCommandEvent(ctx, 'agent.web_changed', { nativeWebSearch: true, mode });
      console.log(`  ${GREEN}✓${RESET} ${DIM}Native web search enabled. Codex mode →${RESET} ${CYAN}${mode}${RESET}`);
      return;
    }

    console.log(`  ${YELLOW}!${RESET} ${DIM}Unknown web mode "${mode}". Use on, off, cached, or live.${RESET}`);
  },
});

commands.push({
  name: '/new',
  description: 'Start a fresh conversation',
  execute: async (_args, ctx) => {
    resetProviderSession(ctx);
    saveAgentCommandEvent(ctx, 'agent.session_reset', { reason: 'new_command' });
    appendAuditEvent(ctx.runtime, { type: 'agent.session_reset', payload: { sessionPath: ctx.sessionPath } });
    console.log(`  ${GREEN}✓${RESET} ${DIM}New session started.${RESET}`);
  },
});

commands.push({
  name: '/session',
  description: 'Show session and runtime metadata',
  execute: async (_args, ctx) => {
    printSessionStatus(ctx);
    appendConfigStatusEvent(ctx.runtime, { command: '/session', sessionPath: ctx.sessionPath });
  },
});

commands.push({
  name: '/profile',
  description: 'Show or change profile: standard, full-permissions',
  execute: async (args, ctx) => {
    const next = args.trim() as AgentConfig['profile'] | '';
    if (!next) {
      printKeyValue('profile', ctx.config.profile);
      printKeyValue('approvalMode', ctx.config.approvalMode);
      console.log(`\n  ${DIM}Usage:${RESET} ${CYAN}/profile standard|full-permissions${RESET}`);
      return;
    }

    if (next !== 'standard' && next !== 'full-permissions') {
      console.log(`  ${YELLOW}!${RESET} ${DIM}Unknown profile "${next}". Use standard or full-permissions.${RESET}`);
      return;
    }

    applyProfile(next, ctx);
    console.log(`  ${GREEN}✓${RESET} ${DIM}Profile →${RESET} ${CYAN}${ctx.config.profile}${RESET}`);
    console.log(`  ${DIM}Approval mode →${RESET} ${CYAN}${ctx.config.approvalMode}${RESET}`);
  },
});

commands.push({
  name: '/approval',
  description: 'Show active approval mode and audit target',
  execute: async (args, ctx) => {
    syncRuntime(ctx);
    await handleApprovalCommand(ctx, args);
    appendConfigStatusEvent(ctx.runtime, { command: '/approval', approvalMode: ctx.config.approvalMode });
  },
});

commands.push({
  name: '/approve',
  description: 'Approve a pending tool action and execute it',
  execute: async (args, ctx) => {
    syncRuntime(ctx);
    await handleApprovalCommand(ctx, `approve ${args.trim()}`);
  },
});

commands.push({
  name: '/deny',
  description: 'Deny a pending tool action',
  execute: async (args, ctx) => {
    syncRuntime(ctx);
    await handleApprovalCommand(ctx, `deny ${args.trim()}`);
  },
});

commands.push({
  name: '/db',
  description: 'Show database status',
  execute: async (_args, ctx) => {
    const status = await getDbStatus(ctx.config);
    printServiceStatus(status);
    appendConfigStatusEvent(ctx.runtime, { command: '/db', status });
  },
});

commands.push({
  name: '/football',
  description: 'Show API-Football provider status',
  execute: async (_args, ctx) => {
    const status = await checkApiFootballStatus(ctx.config, ctx.runtime);
    printServiceStatus(status);
    appendConfigStatusEvent(ctx.runtime, { command: '/football', status });
  },
});

commands.push({
  name: '/fixtures',
  description: 'List API-Football fixtures by date',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    if (wantsDefault(flags, 'leagues') || wantsDefault(flags, 'teams')) {
      const result = await discoverFixtures(ctx.config, {
        date: requireDateFlag(flags),
        leaguesDefault: wantsDefault(flags, 'leagues'),
        teamsDefault: wantsDefault(flags, 'teams'),
        combineMode: optionalCombineModeFlag(flags),
      }, ctx.runtime);
      printFixtures(result.fixtures);
      return;
    }
    printFixtures(await listApiFootballFixtures(ctx.config, {
      date: requireDateFlag(flags),
      league: optionalNumberFlag(flags, 'league'),
      team: optionalNumberFlag(flags, 'team'),
      season: optionalNumberFlag(flags, 'season'),
      maxFixtures: ctx.config.apiFootball.maxFixturesPerRun,
    }, ctx.runtime));
  },
});

commands.push({
  name: '/odds',
  description: 'Normalize odds for a provider fixture',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const snapshot = await getApiFootballOddsSnapshot(ctx.config, requireStringFlag(flags, 'fixture-id'), ctx.runtime, optionalMarketsFlag(flags));
    printOdds(snapshot.quotes, {
      oddsSnapshotId: snapshot.oddsSnapshotId,
      providerSnapshotId: snapshot.providerSnapshotId,
    });
  },
});

commands.push({
  name: '/research',
  description: 'Run structured fixture research',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await runFixtureResearch(ctx.config, {
      fixtureId: requireStringFlag(flags, 'fixture-id'),
      web: optionalResearchWebMode(flags),
      markets: optionalMarketsFlag(flags),
    }, ctx.runtime);
    printResearchResult(result);
  },
});

commands.push({
  name: '/score',
  description: 'Score atomic fixture predictions',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await scoreFixture(ctx, flags);
    printScoringResult(result);
  },
});

commands.push({
  name: '/parlay',
  description: 'Build analytical parlay candidate',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await buildParlay(ctx, flags);
    printParlayResult(result);
  },
});

commands.push({
  name: '/parlay-analysis',
  description: 'Rank persisted parlays, suggest analytical stake, and identify banker legs',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await analyzeParlays(ctx, flags);
    printParlayAnalysisResult(result);
  },
});

commands.push({
  name: '/validate',
  description: 'Validate predictions or parlays against final provider results',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await validateResults(ctx, flags);
    printValidationResult(result);
  },
});

commands.push({
  name: '/metrics',
  description: 'Compute and persist daily prediction/parlay metrics',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await buildDailyMetrics(ctx, flags);
    printDailyMetricsResult(result);
  },
});

commands.push({
  name: '/run',
  description: 'Run canonical headless pipeline for a date',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await runPipeline(ctx, flags);
    printRunResult(result);
  },
});

commands.push({
  name: '/daily-e2e',
  description: 'Run daily Codex vs Gemini comparative pipeline',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await runDailyE2ECommand(ctx, flags);
    printDailyE2EResult(result);
  },
});

commands.push({
  name: '/certify',
  description: 'Run deterministic harness certification',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await runCertification({ ...ctx.config, apiFootballKey: '', databaseUrl: '' }, ctx.runtime, optionalStringFlag(flags, 'profile') ?? 'ci-certification');
    printCertificationResult(result);
  },
});

commands.push({
  name: '/export',
  description: 'Export handoff and evidence pack for a run',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    const result = await exportRun(ctx, flags);
    printExportResult(result);
  },
});

commands.push({
  name: '/artifacts',
  description: 'List artifact root or a run artifact directory',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    printArtifacts(listArtifacts(ctx.config, flags));
  },
});

commands.push({
  name: '/dashboard',
  description: 'Serve local predictions dashboard',
  execute: async (args, ctx) => {
    const flags = parseFlags(args.split(' ').filter(Boolean));
    await serveDashboard(ctx, flags);
  },
});

commands.push({
  name: '/filters',
  description: 'Show active sports filter defaults',
  execute: async (_args, ctx) => {
    const status = getFiltersStatus(ctx.config);
    printFiltersStatus(status);
    await printPresetCounts(ctx.config);
    appendConfigStatusEvent(ctx.runtime, { command: '/filters', status });
  },
});

commands.push({
  name: '/leagues',
  description: 'List or edit league presets',
  execute: async (args, ctx) => {
    const [action, ...rest] = args.split(' ').filter(Boolean);
    const flags = parseFlags(rest);
    if (!action || action === 'list') {
      const leagues = await listLeaguePresets(ctx.config);
      for (const league of leagues) {
        console.log(`  ${CYAN}${league.providerCompetitionId}${RESET} ${league.name} ${DIM}${league.country ?? ''} priority:${league.priority ?? 'default'}${RESET}`);
      }
      return;
    }
    if (action === 'add') {
      const league = await addLeaguePreset(ctx.config, {
        id: requireStringFlag(flags, 'id'),
        name: requireStringFlag(flags, 'name'),
        country: optionalStringFlag(flags, 'country'),
        season: optionalNumberFlag(flags, 'season'),
        priority: optionalNumberFlag(flags, 'priority'),
      });
      console.log(`  ${GREEN}✓${RESET} ${DIM}league preset${RESET} ${CYAN}${league.providerCompetitionId}${RESET}`);
      return;
    }
    if (action === 'remove') {
      const league = await removeLeaguePreset(ctx.config, requireStringFlag(flags, 'id'));
      console.log(`  ${GREEN}✓${RESET} ${DIM}disabled league preset${RESET} ${CYAN}${league.providerCompetitionId}${RESET}`);
    }
  },
});

commands.push({
  name: '/teams',
  description: 'List or edit team presets',
  execute: async (args, ctx) => {
    const [action, ...rest] = args.split(' ').filter(Boolean);
    const flags = parseFlags(rest);
    if (!action || action === 'list') {
      const teams = await listTeamPresets(ctx.config);
      for (const team of teams) {
        console.log(`  ${CYAN}${team.providerTeamId}${RESET} ${team.name} ${DIM}${team.providerLeagueId ?? ''}${RESET}`);
      }
      return;
    }
    if (action === 'add') {
      const team = await addTeamPreset(ctx.config, {
        id: requireStringFlag(flags, 'id'),
        name: requireStringFlag(flags, 'name'),
        country: optionalStringFlag(flags, 'country'),
        league: optionalStringFlag(flags, 'league'),
      });
      console.log(`  ${GREEN}✓${RESET} ${DIM}team preset${RESET} ${CYAN}${team.providerTeamId}${RESET}`);
      return;
    }
    if (action === 'remove') {
      const team = await removeTeamPreset(ctx.config, requireStringFlag(flags, 'id'));
      console.log(`  ${GREEN}✓${RESET} ${DIM}disabled team preset${RESET} ${CYAN}${team.providerTeamId}${RESET}`);
    }
  },
});

commands.push({
  name: '/threshold',
  description: 'Show or change low-odds threshold',
  execute: async (args, ctx) => {
    const next = args.trim();
    if (!next) {
      printKeyValue('lowOddsThreshold', ctx.config.apiFootball.lowOddsThreshold);
      return;
    }
    const parsed = Number(next);
    if (!Number.isFinite(parsed) || parsed <= 1) throw new Error('/threshold requires a decimal odds value greater than 1.');
    ctx.config.apiFootball.lowOddsThreshold = parsed;
    printKeyValue('lowOddsThreshold', ctx.config.apiFootball.lowOddsThreshold);
  },
});

commands.push({
  name: '/low-odds',
  description: 'Scan fixtures for low odds',
  execute: async (args, ctx) => {
    const flags = parseLowOddsSlashFlags(args);
    const scan = await runLowOddsScan(ctx, flags);
    printLowOddsScan(scan);
  },
});

commands.push({
  name: '/help',
  description: 'List available commands',
  execute: async () => {
    for (const cmd of commands) {
      console.log(`  ${CYAN}${cmd.name.padEnd(12)}${RESET}${DIM}${cmd.description}${RESET}`);
    }
  },
});

export function listCommands(): SlashCommand[] {
  return [...commands];
}

export async function dispatch(input: string, ctx: CommandContext): Promise<boolean> {
  const monetary = detectMonetaryAction(input);
  if (monetary.blocked) {
    appendAuditEvent(ctx.runtime, {
      type: 'action.blocked',
      payload: { action: 'slash.command', input, reason: monetary.reason, matches: monetary.matches },
    });
    console.log(`  ${YELLOW}!${RESET} ${DIM}${monetary.reason}${RESET}`);
    return true;
  }
  const [name, ...rest] = input.split(' ');
  const cmd = commands.find((c) => c.name === name);
  if (!cmd) {
    console.log(`  ${DIM}Unknown command: ${name}. Type /help for available commands.${RESET}`);
    return true;
  }
  await cmd.execute(rest.join(' '), ctx);
  return true;
}

export async function dispatchHeadless(argv: string[], ctx: HeadlessCommandContext): Promise<CommandResult> {
  const [area, action] = argv;
  try {
    const monetary = detectMonetaryAction(argv.join(' '));
    if (monetary.blocked) {
      appendAuditEvent(ctx.runtime, {
        type: 'action.blocked',
        payload: { action: 'headless.command', argv, reason: monetary.reason, matches: monetary.matches },
      });
      console.log(`  ${YELLOW}!${RESET} ${DIM}${monetary.reason}${RESET}`);
      return { ok: false, exitCode: 1, message: monetary.reason };
    }

    if (area === 'db' && action === 'status') {
      const status = await getDbStatus(ctx.config);
      printServiceStatus(status);
      appendConfigStatusEvent(ctx.runtime, { command: 'db status', status });
      return { ok: true, exitCode: 0 };
    }

    if (area === 'football' && action === 'status') {
      const status = await checkApiFootballStatus(ctx.config, ctx.runtime);
      printServiceStatus(status);
      appendConfigStatusEvent(ctx.runtime, { command: 'football status', status });
      return { ok: true, exitCode: 0 };
    }

    if (area === 'approval') {
      await handleApprovalCommand(ctx, argv.slice(1).join(' '));
      return { ok: true, exitCode: 0 };
    }

    if (area === 'approve') {
      const approvalId = action;
      if (!approvalId) throw new Error('approve requires APPROVAL_ID.');
      const result = await approveAndExecute(ctx.config, ctx.runtime, approvalId);
      printKeyValue('approvalId', approvalId);
      printKeyValue('result', JSON.stringify(redactSecrets(result)));
      return { ok: true, exitCode: 0 };
    }

    if (area === 'deny') {
      const approvalId = action;
      if (!approvalId) throw new Error('deny requires APPROVAL_ID.');
      const result = denyApproval(ctx.runtime, approvalId);
      printKeyValue('approvalId', result.approvalId);
      printKeyValue('status', result.status);
      return { ok: true, exitCode: 0 };
    }

    if (area === 'fixtures') {
      const flags = parseFlags(argv.slice(1));
      if (wantsDefault(flags, 'leagues') || wantsDefault(flags, 'teams')) {
        const result = await discoverFixtures(ctx.config, {
          date: requireDateFlag(flags),
          leaguesDefault: wantsDefault(flags, 'leagues'),
          teamsDefault: wantsDefault(flags, 'teams'),
          combineMode: optionalCombineModeFlag(flags),
        }, ctx.runtime);
        printFixtures(result.fixtures);
        return { ok: true, exitCode: 0 };
      }
      printFixtures(await listApiFootballFixtures(ctx.config, {
        date: requireDateFlag(flags),
        league: optionalNumberFlag(flags, 'league'),
        team: optionalNumberFlag(flags, 'team'),
        season: optionalNumberFlag(flags, 'season'),
        maxFixtures: ctx.config.apiFootball.maxFixturesPerRun,
      }, ctx.runtime));
      return { ok: true, exitCode: 0 };
    }

    if (area === 'odds') {
      const flags = parseFlags(argv.slice(1));
      const snapshot = await getApiFootballOddsSnapshot(ctx.config, requireStringFlag(flags, 'fixture-id'), ctx.runtime, optionalMarketsFlag(flags));
      printOdds(snapshot.quotes, {
        oddsSnapshotId: snapshot.oddsSnapshotId,
        providerSnapshotId: snapshot.providerSnapshotId,
      });
      return { ok: true, exitCode: 0 };
    }

    if (area === 'research') {
      const flags = parseFlags(argv.slice(1));
      const result = await runFixtureResearch(ctx.config, {
        fixtureId: requireStringFlag(flags, 'fixture-id'),
        web: optionalResearchWebMode(flags),
        markets: optionalMarketsFlag(flags),
      }, ctx.runtime);
      printResearchResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'score') {
      const flags = parseFlags(argv.slice(1));
      const result = await scoreFixture(ctx, flags);
      printScoringResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'parlay') {
      if (action === 'analyze') {
        const flags = parseFlags(argv.slice(2));
        const result = await analyzeParlays(ctx, flags);
        printParlayAnalysisResult(result);
        return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
      }
      const flags = parseFlags(argv.slice(1));
      const result = await buildParlay(ctx, flags);
      printParlayResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'validate') {
      const flags = parseFlags(argv.slice(1));
      const result = await validateResults(ctx, flags);
      printValidationResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'metrics') {
      const [metricAction] = argv.slice(1);
      if (metricAction !== 'daily') throw new Error('metrics requires action: daily.');
      const flags = parseFlags(argv.slice(2));
      const result = await buildDailyMetrics(ctx, flags);
      printDailyMetricsResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'run') {
      const flags = parseFlags(argv.slice(1));
      const result = await runPipeline(ctx, flags);
      printRunResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'daily-e2e') {
      const flags = parseFlags(argv.slice(1));
      const result = await runDailyE2ECommand(ctx, flags);
      printDailyE2EResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'certify') {
      const flags = parseFlags(argv.slice(1));
      const result = await runCertification({ ...ctx.config, apiFootballKey: '', databaseUrl: '' }, ctx.runtime, optionalStringFlag(flags, 'profile') ?? 'ci-certification');
      printCertificationResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1 };
    }

    if (area === 'leaderboard') {
      const flags = parseFlags(argv.slice(1));
      const since = optionalStringFlag(flags, 'since');
      const by = optionalStringFlag(flags, 'by') ?? 'market';
      printKeyValue('since', since ?? 'all');
      printLeaderboardRows(await readLeaderboardRows(ctx.config, since), by);
      return { ok: true, exitCode: 0 };
    }

    if (area === 'stats') {
      const stats = computeNoParlayStats(ctx.config);
      printKeyValue('runsWithHandoff', stats.runs);
      printKeyValue('noParlayToday', stats.noParlay);
      printKeyValue('analyticalCandidates', stats.promoted);
      printKeyValue('noParlayRate', stats.percentNoParlay);
      return { ok: true, exitCode: 0 };
    }

    if (area === 'export') {
      const flags = parseFlags(argv.slice(1));
      const result = await exportRun(ctx, flags);
      printExportResult(result);
      return { ok: result.ok, exitCode: result.ok ? 0 : 1, message: result.error };
    }

    if (area === 'artifacts') {
      const flags = parseFlags(argv.slice(1));
      printArtifacts(listArtifacts(ctx.config, flags));
      return { ok: true, exitCode: 0 };
    }

    if (area === 'dashboard') {
      const flags = parseFlags(argv.slice(1));
      await serveDashboard(ctx, flags);
      return { ok: true, exitCode: 0 };
    }

    if (area === 'filters' && action === 'show') {
      const status = getFiltersStatus(ctx.config);
      printFiltersStatus(status);
      await printPresetCounts(ctx.config);
      appendConfigStatusEvent(ctx.runtime, { command: 'filters show', status });
      return { ok: true, exitCode: 0 };
    }

    if (area === 'leagues') {
      const flags = parseFlags(argv.slice(2));
      if (action === 'list') {
        const leagues = await listLeaguePresets(ctx.config);
        for (const league of leagues) {
          console.log(`  ${CYAN}${league.providerCompetitionId}${RESET} ${league.name} ${DIM}${league.country ?? ''} priority:${league.priority ?? 'default'}${RESET}`);
        }
        return { ok: true, exitCode: 0 };
      }
      if (action === 'add') {
        const league = await addLeaguePreset(ctx.config, {
          id: requireStringFlag(flags, 'id'),
          name: requireStringFlag(flags, 'name'),
          country: optionalStringFlag(flags, 'country'),
          season: optionalNumberFlag(flags, 'season'),
          priority: optionalNumberFlag(flags, 'priority'),
        });
        console.log(`  ${GREEN}✓${RESET} ${DIM}league preset${RESET} ${CYAN}${league.providerCompetitionId}${RESET}`);
        return { ok: true, exitCode: 0 };
      }
      if (action === 'remove') {
        const league = await removeLeaguePreset(ctx.config, requireStringFlag(flags, 'id'));
        console.log(`  ${GREEN}✓${RESET} ${DIM}disabled league preset${RESET} ${CYAN}${league.providerCompetitionId}${RESET}`);
        return { ok: true, exitCode: 0 };
      }
    }

    if (area === 'teams') {
      const flags = parseFlags(argv.slice(2));
      if (action === 'list') {
        const teams = await listTeamPresets(ctx.config);
        for (const team of teams) console.log(`  ${CYAN}${team.providerTeamId}${RESET} ${team.name} ${DIM}${team.providerLeagueId ?? ''}${RESET}`);
        return { ok: true, exitCode: 0 };
      }
      if (action === 'add') {
        const team = await addTeamPreset(ctx.config, {
          id: requireStringFlag(flags, 'id'),
          name: requireStringFlag(flags, 'name'),
          country: optionalStringFlag(flags, 'country'),
          league: optionalStringFlag(flags, 'league'),
        });
        console.log(`  ${GREEN}✓${RESET} ${DIM}team preset${RESET} ${CYAN}${team.providerTeamId}${RESET}`);
        return { ok: true, exitCode: 0 };
      }
      if (action === 'remove') {
        const team = await removeTeamPreset(ctx.config, requireStringFlag(flags, 'id'));
        console.log(`  ${GREEN}✓${RESET} ${DIM}disabled team preset${RESET} ${CYAN}${team.providerTeamId}${RESET}`);
        return { ok: true, exitCode: 0 };
      }
    }

    if (area === 'scan' && action === 'low-odds') {
      const flags = parseFlags(argv.slice(2));
      const scan = await runLowOddsScan(ctx, flags);
      printLowOddsScan(scan);
      return { ok: true, exitCode: 0 };
    }

    printHeadlessUsage();
    return { ok: false, exitCode: 1, message: `Unknown command: ${argv.join(' ')}` };
  } catch (err: any) {
    const message = actionableProviderErrorMessage(err);
    console.log(`  ${YELLOW}!${RESET} ${DIM}${message}${RESET}`);
    return { ok: false, exitCode: 1, message };
  }
}

export function printHeadlessUsage(): void {
  console.log(`  ${DIM}Usage:${RESET}`);
  console.log(`  ${CYAN}pnpm gana${RESET}`);
  console.log(`  ${CYAN}pnpm gana tui${RESET}`);
  console.log(`  ${CYAN}pnpm gana db status${RESET}`);
  console.log(`  ${CYAN}pnpm gana football status${RESET}`);
  console.log(`  ${CYAN}pnpm gana approval pending|show APPROVAL_ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana approve APPROVAL_ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana deny APPROVAL_ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana fixtures --date YYYY-MM-DD${RESET}`);
  console.log(`  ${CYAN}pnpm gana odds --fixture-id ID --markets h2h,btts${RESET}`);
  console.log(`  ${CYAN}pnpm gana research --fixture-id ID --web live --markets h2h,btts${RESET}`);
  console.log(`  ${CYAN}pnpm gana score --fixture-id ID --web live --markets h2h,btts${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay --date YYYY-MM-DD${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay --date YYYY-MM-DD --run-ids RUN_ID_A,RUN_ID_B${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay --run-id RUN_ID --portfolio llm${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay --run-id RUN_ID --portfolio low-odds-top${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay --date YYYY-MM-DD --run-ids RUN_ID_A,RUN_ID_B --portfolio low-variance${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay --run-id RUN_ID --portfolio low-variance|balanced|totals|high-conviction|market-diverse|parlay-oro${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay analyze --date YYYY-MM-DD --top 9 --bankroll 100 --profile-scope core${RESET}`);
  console.log(`  ${CYAN}pnpm gana parlay analyze --run-ids RUN_ID_A,RUN_ID_B --top 9 --bankroll 100 --profile-scope all${RESET}`);
  console.log(`  ${CYAN}pnpm gana validate --date YYYY-MM-DD${RESET}`);
  console.log(`  ${CYAN}pnpm gana validate --prediction-id ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana validate --parlay-id ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana metrics daily --date YYYY-MM-DD --days 3 --persist true|false${RESET}`);
  console.log(`  ${CYAN}pnpm gana run --date YYYY-MM-DD --web live --markets h2h,btts --validate auto|force|off${RESET}`);
  console.log(`  ${CYAN}pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --max-fixtures 100 --threshold 1.20 --web live --parlay-profile balanced${RESET}`);
  console.log(`  ${CYAN}pnpm gana certify --profile ci-certification${RESET}`);
  console.log(`  ${CYAN}pnpm gana leaderboard --since YYYY-MM-DD --by prompt|model|market|league${RESET}`);
  console.log(`  ${CYAN}pnpm gana stats${RESET}`);
  console.log(`  ${CYAN}pnpm gana export --run-id RUN_ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana artifacts --run-id RUN_ID${RESET}`);
  console.log(`  ${CYAN}pnpm gana dashboard --port 4317${RESET}`);
  console.log(`  ${CYAN}pnpm gana leagues list|add|remove${RESET}`);
  console.log(`  ${CYAN}pnpm gana teams list|add|remove${RESET}`);
  console.log(`  ${CYAN}pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1.20${RESET}`);
  console.log(`  ${CYAN}pnpm gana filters show${RESET}`);
}
