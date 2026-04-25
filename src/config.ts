import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import 'dotenv/config';

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

export interface AgentConfig {
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
  codexHome: string;
  codexSandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  codexThreadId?: string;
  geminiHome: string;
  geminiModelListPath: string;
  geminiApprovalMode: 'default' | 'auto_edit' | 'yolo' | 'plan';
  geminiSessionId?: string;
  cursorModelListPath: string;
  cursorForce: boolean;
  cursorSessionId?: string;
}

const DEFAULTS: AgentConfig = {
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
  codexHome: join(process.env.HOME ?? '', '.codex'),
  codexSandbox: 'workspace-write',
  geminiHome: join(process.env.HOME ?? '', '.gemini'),
  geminiModelListPath: 'config/gemini-models.json',
  geminiApprovalMode: 'yolo',
  cursorModelListPath: 'config/cursor-models.json',
  cursorForce: true,
};

export function loadConfig(overrides: Partial<AgentConfig> = {}, opts?: { skipApiKey?: boolean }): AgentConfig {
  let config = { ...DEFAULTS };

  const configPath = resolve('agent.config.json');
  if (existsSync(configPath)) {
    const file = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (file.display) {
      config.display = { ...config.display, ...file.display };
    }
    config = { ...config, ...file, display: config.display };
  }

  if (process.env.OPENROUTER_API_KEY) config.apiKey = process.env.OPENROUTER_API_KEY;
  if (
    process.env.AGENT_PROVIDER === 'codex'
    || process.env.AGENT_PROVIDER === 'gemini'
    || process.env.AGENT_PROVIDER === 'cursor'
    || process.env.AGENT_PROVIDER === 'openrouter'
  ) {
    config.provider = process.env.AGENT_PROVIDER;
  }
  if (process.env.AGENT_MODEL) config.model = process.env.AGENT_MODEL;
  if (process.env.AGENT_MAX_STEPS) config.maxSteps = Number(process.env.AGENT_MAX_STEPS);
  if (process.env.AGENT_MAX_COST) config.maxCost = Number(process.env.AGENT_MAX_COST);
  if (process.env.CODEX_HOME) config.codexHome = process.env.CODEX_HOME;
  if (process.env.GEMINI_HOME) config.geminiHome = process.env.GEMINI_HOME;
  if (process.env.GEMINI_MODEL_LIST_PATH) config.geminiModelListPath = process.env.GEMINI_MODEL_LIST_PATH;
  if (process.env.CURSOR_MODEL_LIST_PATH) config.cursorModelListPath = process.env.CURSOR_MODEL_LIST_PATH;

  if (overrides.display) {
    config.display = { ...config.display, ...overrides.display };
  }
  config = { ...config, ...overrides, display: config.display };
  if (config.provider === 'openrouter' && !config.apiKey && !opts?.skipApiKey) {
    throw new Error('OPENROUTER_API_KEY is required for provider "openrouter".');
  }
  if (config.provider === 'codex' && !opts?.skipApiKey && !existsSync(resolve(config.codexHome, 'auth.json'))) {
    throw new Error(`Codex auth not found at ${resolve(config.codexHome, 'auth.json')}. Run "codex login" first.`);
  }
  if (config.provider === 'gemini' && !opts?.skipApiKey && !existsSync(resolve(config.geminiHome, 'oauth_creds.json'))) {
    throw new Error(`Gemini auth not found at ${resolve(config.geminiHome, 'oauth_creds.json')}. Run "gemini" and complete login first.`);
  }
  if (config.provider === 'cursor' && !opts?.skipApiKey) {
    const ok = existsSync(resolve(process.env.HOME ?? '', '.cursor', 'cli-config.json'));
    if (!ok) throw new Error('Cursor Agent auth/config not found. Run "cursor-agent login" first.');
  }
  return config;
}
