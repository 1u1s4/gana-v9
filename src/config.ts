import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import 'dotenv/config';
import { DEFAULT_MARKETS, isMarketKey, type MarketKey } from './domain/markets.js';
import type { ApiFootballLeagueRef, ApiFootballTeamRef } from './filters/types.js';

export type GanaRuntime = 'mvp-productivo-online';
export type GanaProfile = 'standard' | 'full-permissions';
export type ApprovalMode = 'manual' | 'auto-grant';

export interface LoaderConfig {
  text: string;
  style: 'gradient' | 'spinner' | 'minimal';
}

export interface DisplayConfig {
  toolDisplay: 'emoji' | 'grouped' | 'minimal' | 'hidden';
  reasoning: boolean;
  inputStyle: 'block' | 'bordered' | 'plain';
  loader: LoaderConfig;
}

export interface ApiFootballFilterConfig {
  defaultSeason: number;
  defaultSeasonInferred: boolean;
  timezone: string;
  leaguePresetsPath: string;
  defaultLeagues: ApiFootballLeagueRef[];
  defaultTeams: ApiFootballTeamRef[];
  defaultMarkets: MarketKey[];
  lowOddsThreshold: number;
  kickoffWindowHours: number;
  includeLiveFixtures: boolean;
  includeCompletedFixtures: boolean;
  maxFixturesPerRun: number;
  bookmakerAllowlist?: string[];
}

export interface BrowserUseConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  model?: string;
  maxTasksPerMonth: number;
  maxConcurrentSessions: number;
  timeoutMs: number;
}

export interface GanaConfigExtension {
  runtime: GanaRuntime;
  profile: GanaProfile;
  apiFootballKey: string;
  apiFootballBaseUrl: string;
  databaseUrl: string;
  artifactRoot: string;
  approvalMode: ApprovalMode;
  apiFootball: ApiFootballFilterConfig;
  browserUse: BrowserUseConfig;
}

export interface AgentConfig extends GanaConfigExtension {
  provider: 'codex' | 'gemini' | 'cursor' | 'openrouter';
  apiKey: string;
  model: string;
  name: string;
  systemPrompt: string;
  maxSteps: number;
  maxCost: number;
  sessionDir: string;
  showBanner: boolean;
  display: DisplayConfig;
  slashCommands: boolean;
  fastMode: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  nativeWebSearch: boolean;
  nativeWebSearchMode: 'cached' | 'live';
  codexHome: string;
  codexModelListPath: string;
  codexSandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  codexThreadId?: string;
  geminiHome: string;
  geminiModelListPath: string;
  geminiApprovalMode: 'default' | 'auto_edit' | 'yolo' | 'plan';
  geminiSessionId?: string;
  cursorModelListPath: string;
  cursorTrust: boolean;
  cursorForce: boolean;
  cursorSessionId?: string;
}

export type AppConfig = AgentConfig;
export type AgentConfigOverrides = Partial<Omit<AgentConfig, 'apiFootball' | 'browserUse' | 'display'>> & {
  apiFootball?: Partial<ApiFootballFilterConfig>;
  browserUse?: Partial<BrowserUseConfig>;
  display?: Partial<DisplayConfig>;
};

export function inferSeasonFromDate(date: Date): number {
  return date.getUTCFullYear();
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRuntime(value: unknown): value is GanaRuntime {
  return value === 'mvp-productivo-online';
}

function isProfile(value: unknown): value is GanaProfile {
  return value === 'standard' || value === 'full-permissions';
}

function isApprovalMode(value: unknown): value is ApprovalMode {
  return value === 'manual' || value === 'auto-grant';
}

function isCodexSandbox(value: unknown): value is AgentConfig['codexSandbox'] {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}

function isGeminiApprovalMode(value: unknown): value is AgentConfig['geminiApprovalMode'] {
  return value === 'default' || value === 'auto_edit' || value === 'yolo' || value === 'plan';
}

function parseMarkets(value: string | undefined): MarketKey[] | undefined {
  if (!value) return undefined;
  const markets = value.split(',').map((part) => part.trim()).filter(isMarketKey);
  return markets.length ? markets : undefined;
}

function mergeApiFootballConfig(
  base: ApiFootballFilterConfig,
  override: Partial<ApiFootballFilterConfig> | undefined,
): ApiFootballFilterConfig {
  if (!override) return { ...base };
  return {
    ...base,
    ...override,
    defaultSeasonInferred: override.defaultSeason !== undefined && override.defaultSeasonInferred === undefined
      ? false
      : override.defaultSeasonInferred ?? base.defaultSeasonInferred,
    defaultLeagues: Array.isArray(override.defaultLeagues) ? override.defaultLeagues : base.defaultLeagues,
    defaultTeams: Array.isArray(override.defaultTeams) ? override.defaultTeams : base.defaultTeams,
    defaultMarkets: Array.isArray(override.defaultMarkets)
      ? override.defaultMarkets.filter(isMarketKey)
      : base.defaultMarkets,
    bookmakerAllowlist: Array.isArray(override.bookmakerAllowlist)
      ? override.bookmakerAllowlist
      : base.bookmakerAllowlist,
  };
}

function mergeBrowserUseConfig(
  base: BrowserUseConfig,
  override: Partial<BrowserUseConfig> | undefined,
): BrowserUseConfig {
  return override ? { ...base, ...override } : { ...base };
}

const defaultSeasonFromEnv = parseNumber(process.env.GANA_DEFAULT_SEASON);
const DEFAULT_SEASON = defaultSeasonFromEnv ?? inferSeasonFromDate(new Date());

const DEFAULTS: AgentConfig = {
  runtime: 'mvp-productivo-online',
  profile: 'standard',
  apiFootballKey: '',
  apiFootballBaseUrl: 'https://v3.football.api-sports.io',
  databaseUrl: '',
  artifactRoot: '.artifacts/gana-v9',
  approvalMode: 'manual',
  apiFootball: {
    defaultSeason: DEFAULT_SEASON,
    defaultSeasonInferred: defaultSeasonFromEnv === undefined,
    timezone: 'America/Guatemala',
    leaguePresetsPath: 'config/league-presets.json',
    defaultLeagues: [],
    defaultTeams: [],
    defaultMarkets: DEFAULT_MARKETS,
    lowOddsThreshold: 1.2,
    kickoffWindowHours: 36,
    includeLiveFixtures: false,
    includeCompletedFixtures: false,
    maxFixturesPerRun: 80,
  },
  browserUse: {
    apiKey: '',
    baseUrl: 'https://api.browser-use.com',
    enabled: true,
    model: undefined,
    maxTasksPerMonth: 10,
    maxConcurrentSessions: 3,
    timeoutMs: 180_000,
  },
  provider: 'codex',
  apiKey: '',
  model: 'gpt-5.5',
  name: 'Gana Agent',
  systemPrompt: [
    'You are Gana Agent, a coding assistant with access to tools for reading, writing, editing, and searching files, and running shell commands.',
    '',
    'Current working directory: {cwd}',
    '',
    'Guidelines:',
    '- Reply in the same language the user uses.',
    '- Use your tools proactively. Explore the codebase to find answers instead of asking the user.',
    '- Keep working until the task is fully resolved before responding.',
    '- Do not guess or make up information; use your tools to verify.',
    '- Be concise and direct.',
    '- Show file paths clearly when working with files.',
    '- Prefer grep and glob tools over shell commands for file search.',
    '- When editing code, make minimal targeted changes consistent with the existing style.',
  ].join('\n'),
  maxSteps: 20,
  maxCost: 1.0,
  sessionDir: '.sessions',
  showBanner: true,
  display: {
    toolDisplay: 'grouped',
    reasoning: false,
    inputStyle: 'block',
    loader: { text: 'Working', style: 'spinner' },
  },
  slashCommands: true,
  fastMode: false,
  reasoningEffort: undefined,
  nativeWebSearch: true,
  nativeWebSearchMode: 'live',
  codexHome: join(process.env.HOME ?? '', '.codex'),
  codexModelListPath: 'config/codex-models.json',
  codexSandbox: 'workspace-write',
  geminiHome: join(process.env.HOME ?? '', '.gemini'),
  geminiModelListPath: 'config/gemini-models.json',
  geminiApprovalMode: 'default',
  cursorModelListPath: 'config/cursor-models.json',
  cursorTrust: false,
  cursorForce: false,
};

export function loadConfig(
  overrides: AgentConfigOverrides = {},
  opts?: { skipApiKey?: boolean; validateAgentAuth?: boolean },
): AgentConfig {
  let config: AgentConfig = {
    ...DEFAULTS,
    display: { ...DEFAULTS.display },
    apiFootball: { ...DEFAULTS.apiFootball },
    browserUse: { ...DEFAULTS.browserUse },
  };

  const configPath = resolve('agent.config.json');
  if (existsSync(configPath)) {
    const file = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<AgentConfig>;
    if (file.display) {
      config.display = { ...config.display, ...file.display };
    }
    if (file.apiFootball) {
      config.apiFootball = mergeApiFootballConfig(config.apiFootball, file.apiFootball);
    }
    if (file.browserUse) {
      config.browserUse = mergeBrowserUseConfig(config.browserUse, file.browserUse);
    }
    config = { ...config, ...file, display: config.display, apiFootball: config.apiFootball, browserUse: config.browserUse };
  }

  if (process.env.OPENROUTER_API_KEY) config.apiKey = process.env.OPENROUTER_API_KEY;
  if (isRuntime(process.env.GANA_RUNTIME)) config.runtime = process.env.GANA_RUNTIME;
  if (isProfile(process.env.GANA_PROFILE)) config.profile = process.env.GANA_PROFILE;
  if (process.env.API_FOOTBALL_KEY) config.apiFootballKey = process.env.API_FOOTBALL_KEY;
  if (process.env.API_FOOTBALL_BASE_URL) config.apiFootballBaseUrl = process.env.API_FOOTBALL_BASE_URL;
  if (process.env.DATABASE_URL) config.databaseUrl = process.env.DATABASE_URL;
  if (process.env.GANA_ARTIFACT_ROOT) config.artifactRoot = process.env.GANA_ARTIFACT_ROOT;
  if (isApprovalMode(process.env.GANA_APPROVAL_MODE)) config.approvalMode = process.env.GANA_APPROVAL_MODE;
  if (config.profile === 'full-permissions' && !process.env.GANA_APPROVAL_MODE) {
    config.approvalMode = 'auto-grant';
  }
  if (
    process.env.AGENT_PROVIDER === 'codex'
    || process.env.AGENT_PROVIDER === 'gemini'
    || process.env.AGENT_PROVIDER === 'cursor'
    || process.env.AGENT_PROVIDER === 'openrouter'
  ) {
    config.provider = process.env.AGENT_PROVIDER;
  }
  if (process.env.AGENT_MODEL) config.model = process.env.AGENT_MODEL;
  if (process.env.AGENT_FAST_MODE === 'true') config.fastMode = true;
  if (process.env.AGENT_NATIVE_WEB_SEARCH === 'true') config.nativeWebSearch = true;
  if (process.env.AGENT_NATIVE_WEB_SEARCH === 'false') config.nativeWebSearch = false;
  if (process.env.AGENT_NATIVE_WEB_SEARCH_MODE === 'cached' || process.env.AGENT_NATIVE_WEB_SEARCH_MODE === 'live') {
    config.nativeWebSearchMode = process.env.AGENT_NATIVE_WEB_SEARCH_MODE;
  }
  if (process.env.BROWSER_USE_API_KEY) config.browserUse.apiKey = process.env.BROWSER_USE_API_KEY;
  if (process.env.BROWSER_USE_BASE_URL) config.browserUse.baseUrl = process.env.BROWSER_USE_BASE_URL;
  {
    const enabled = parseBoolean(process.env.AGENT_BROWSER_FALLBACK);
    if (enabled !== undefined) config.browserUse.enabled = enabled;
  }
  if (process.env.BROWSER_USE_MODEL) config.browserUse.model = process.env.BROWSER_USE_MODEL;
  {
    const maxTasks = parseNumber(process.env.BROWSER_USE_MAX_TASKS_PER_MONTH);
    if (maxTasks !== undefined) config.browserUse.maxTasksPerMonth = maxTasks;
  }
  {
    const maxConcurrent = parseNumber(process.env.BROWSER_USE_MAX_CONCURRENT_SESSIONS);
    if (maxConcurrent !== undefined) config.browserUse.maxConcurrentSessions = maxConcurrent;
  }
  {
    const timeoutMs = parseNumber(process.env.BROWSER_USE_TIMEOUT_MS);
    if (timeoutMs !== undefined) config.browserUse.timeoutMs = timeoutMs;
  }
  if (
    process.env.AGENT_REASONING_EFFORT === 'low'
    || process.env.AGENT_REASONING_EFFORT === 'medium'
    || process.env.AGENT_REASONING_EFFORT === 'high'
    || process.env.AGENT_REASONING_EFFORT === 'xhigh'
  ) {
    config.reasoningEffort = process.env.AGENT_REASONING_EFFORT;
  }
  if (process.env.AGENT_MAX_STEPS) config.maxSteps = Number(process.env.AGENT_MAX_STEPS);
  if (process.env.AGENT_MAX_COST) config.maxCost = Number(process.env.AGENT_MAX_COST);
  if (process.env.CODEX_HOME) config.codexHome = process.env.CODEX_HOME;
  if (process.env.CODEX_MODEL_LIST_PATH) config.codexModelListPath = process.env.CODEX_MODEL_LIST_PATH;
  if (isCodexSandbox(process.env.AGENT_CODEX_SANDBOX)) config.codexSandbox = process.env.AGENT_CODEX_SANDBOX;
  if (process.env.GEMINI_HOME) config.geminiHome = process.env.GEMINI_HOME;
  if (process.env.GEMINI_MODEL_LIST_PATH) config.geminiModelListPath = process.env.GEMINI_MODEL_LIST_PATH;
  if (isGeminiApprovalMode(process.env.AGENT_GEMINI_APPROVAL_MODE)) {
    config.geminiApprovalMode = process.env.AGENT_GEMINI_APPROVAL_MODE;
  }
  if (process.env.CURSOR_MODEL_LIST_PATH) config.cursorModelListPath = process.env.CURSOR_MODEL_LIST_PATH;
  {
    const envCursorTrust = parseBoolean(process.env.AGENT_CURSOR_TRUST);
    if (envCursorTrust !== undefined) config.cursorTrust = envCursorTrust;
  }
  {
    const envCursorForce = parseBoolean(process.env.AGENT_CURSOR_FORCE);
    if (envCursorForce !== undefined) config.cursorForce = envCursorForce;
  }

  const envSeason = parseNumber(process.env.GANA_DEFAULT_SEASON);
  const envThreshold = parseNumber(process.env.GANA_LOW_ODDS_THRESHOLD);
  const envMaxFixtures = parseNumber(process.env.GANA_MAX_FIXTURES_PER_RUN);
  const envWindow = parseNumber(process.env.GANA_KICKOFF_WINDOW_HOURS);
  const envTimezone = process.env.GANA_FIXTURE_TIMEZONE || process.env.GANA_TIMEZONE;
  const envLeaguePresetsPath = process.env.GANA_LEAGUE_PRESETS_PATH;
  const envMarkets = parseMarkets(process.env.GANA_DEFAULT_MARKETS);
  const envIncludeLive = parseBoolean(process.env.GANA_INCLUDE_LIVE_FIXTURES);
  const envIncludeCompleted = parseBoolean(process.env.GANA_INCLUDE_COMPLETED_FIXTURES);

  config.apiFootball = {
    ...config.apiFootball,
    ...(envSeason !== undefined && { defaultSeason: envSeason, defaultSeasonInferred: false }),
    ...(envThreshold !== undefined && { lowOddsThreshold: envThreshold }),
    ...(envMaxFixtures !== undefined && { maxFixturesPerRun: envMaxFixtures }),
    ...(envWindow !== undefined && { kickoffWindowHours: envWindow }),
    ...(envTimezone && { timezone: envTimezone }),
    ...(envLeaguePresetsPath && { leaguePresetsPath: envLeaguePresetsPath }),
    ...(envMarkets && { defaultMarkets: envMarkets }),
    ...(envIncludeLive !== undefined && { includeLiveFixtures: envIncludeLive }),
    ...(envIncludeCompleted !== undefined && { includeCompletedFixtures: envIncludeCompleted }),
  };

  if (overrides.display) {
    config.display = { ...config.display, ...overrides.display };
  }
  if (overrides.apiFootball) {
    config.apiFootball = mergeApiFootballConfig(config.apiFootball, overrides.apiFootball);
  }
  if (overrides.browserUse) {
    config.browserUse = mergeBrowserUseConfig(config.browserUse, overrides.browserUse);
  }
  config = { ...config, ...overrides, display: config.display, apiFootball: config.apiFootball, browserUse: config.browserUse };
  if (config.profile === 'full-permissions' && !overrides.approvalMode && !process.env.GANA_APPROVAL_MODE) {
    config.approvalMode = 'auto-grant';
  }

  const validateAgentAuth = opts?.validateAgentAuth === true && !opts.skipApiKey;
  if (config.provider === 'openrouter' && !config.apiKey && validateAgentAuth) {
    throw new Error('OPENROUTER_API_KEY is required for provider "openrouter".');
  }
  if (config.provider === 'codex' && validateAgentAuth && !existsSync(resolve(config.codexHome, 'auth.json'))) {
    throw new Error(`Codex auth not found at ${resolve(config.codexHome, 'auth.json')}. Run "codex login" first.`);
  }
  if (config.provider === 'gemini' && validateAgentAuth && !existsSync(resolve(config.geminiHome, 'oauth_creds.json'))) {
    throw new Error(`Gemini auth not found at ${resolve(config.geminiHome, 'oauth_creds.json')}. Run "gemini" and complete login first.`);
  }
  if (config.provider === 'cursor' && validateAgentAuth) {
    const ok = existsSync(resolve(process.env.HOME ?? '', '.cursor', 'cli-config.json'));
    if (!ok) throw new Error('Cursor Agent auth/config not found. Run "cursor-agent login" first.');
  }
  return config;
}
