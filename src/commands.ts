import type { Interface } from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { AgentConfig } from './config.js';
import type { ChatMessage } from './agent.js';

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

type Provider = AgentConfig['provider'];

const PROVIDERS: Provider[] = ['codex', 'gemini', 'cursor', 'openrouter'];

const PROVIDER_DEFAULT_MODELS: Record<Provider, string[]> = {
  codex: ['gpt-5.5', 'gpt-5.4', 'gpt-5.2'],
  gemini: ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-pro'],
  cursor: ['composer-2-fast', 'composer-2', 'auto'],
  openrouter: ['anthropic/claude-haiku-4.5'],
};

export interface CommandContext {
  config: AgentConfig;
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

const commands: SlashCommand[] = [];

function ask(rl: Interface, prompt: string): Promise<string> {
  return new Promise((r) => {
    process.stdin.resume();
    rl.question(prompt, (answer) => {
      r(answer);
    });
  });
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

function loadCursorModels(ctx: CommandContext): ModelInfo[] {
  const path = resolve(ctx.config.cursorModelListPath);
  if (!existsSync(path)) return [];

  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { models?: unknown };
  const models = raw.models;
  if (!Array.isArray(models)) return [];

  return models
    .map((model: any) => ({
      id: String(model.id ?? model.modelId ?? ''),
      name: String(model.name ?? model.displayName ?? model.id ?? ''),
    }))
    .filter((model) => model.id);
}

function loadProviderModels(ctx: CommandContext): ModelInfo[] {
  if (ctx.config.provider === 'codex') return loadCodexModels(ctx);
  if (ctx.config.provider === 'gemini') return loadGeminiModels(ctx);
  if (ctx.config.provider === 'cursor') return loadCursorModels(ctx);
  return [];
}

function providerLabel(provider: Provider): string {
  if (provider === 'codex') return 'Codex';
  if (provider === 'gemini') return 'Gemini CLI';
  if (provider === 'cursor') return 'Cursor Agent';
  return 'OpenRouter';
}

function providerReady(ctx: CommandContext, provider: Provider): boolean {
  if (provider === 'codex') return existsSync(resolve(ctx.config.codexHome, 'auth.json'));
  if (provider === 'gemini') return existsSync(resolve(ctx.config.geminiHome, 'oauth_creds.json'));
  if (provider === 'cursor') return existsSync(resolve(process.env.HOME ?? '', '.cursor', 'cli-config.json'));
  return Boolean(ctx.config.apiKey || process.env.OPENROUTER_API_KEY);
}

function defaultModelForProvider(ctx: CommandContext, provider: Provider): string {
  const original = ctx.config.provider;
  ctx.config.provider = provider;
  const models = loadProviderModels(ctx);
  ctx.config.provider = original;

  const candidates = PROVIDER_DEFAULT_MODELS[provider];
  return candidates.find((candidate) => models.some((model) => model.id === candidate))
    ?? models[0]?.id
    ?? candidates[0]
    ?? ctx.config.model;
}

function resetProviderSession(ctx: CommandContext): void {
  ctx.messages.length = 0;
  ctx.config.codexThreadId = undefined;
  ctx.config.geminiSessionId = undefined;
  ctx.config.cursorSessionId = undefined;
  ctx.config.fastMode = false;
  ctx.config.reasoningEffort = undefined;
  ctx.sessionPath = ctx.resetSession();
}

function findCursorVariant(models: ModelInfo[], current: string, suffix: string): string | undefined {
  const withoutReasoning = current
    .replace(/-(low|medium|high|xhigh|extra-high)(-fast)?$/, '$2')
    .replace(/--/, '-');
  const candidates = [
    `${withoutReasoning}-${suffix}`,
    current.replace(/-(low|medium|high|xhigh|extra-high)(-fast)?$/, `-${suffix}$2`),
    current.replace(/-fast$/, `-${suffix}-fast`),
  ];

  return candidates.find((id) => models.some((model) => model.id === id));
}

function findCursorFastVariant(models: ModelInfo[], current: string, enabled: boolean): string | undefined {
  if (enabled) {
    if (current.endsWith('-fast')) return current;
    const candidates = [`${current}-fast`, current.replace(/-(low|medium|high|xhigh|extra-high)$/, '-$1-fast')];
    return candidates.find((id) => models.some((model) => model.id === id));
  }

  if (!current.endsWith('-fast')) return current;
  const regular = current.replace(/-fast$/, '');
  return models.some((model) => model.id === regular) ? regular : undefined;
}

async function loadOpenRouterModels() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const { data } = await res.json() as { data: { id: string; name: string }[] };
  return data;
}

commands.push({
  name: '/provider',
  description: 'Switch provider: codex, gemini, cursor, openrouter',
  execute: async (args, ctx) => {
    const next = args.trim().toLowerCase() as Provider | '';

    if (!next) {
      for (const provider of PROVIDERS) {
        const marker = provider === ctx.config.provider ? '*' : ' ';
        const ready = providerReady(ctx, provider) ? 'ready' : 'not configured';
        console.log(`  ${DIM}${marker}${RESET} ${CYAN}${provider.padEnd(10)}${RESET}${DIM}${providerLabel(provider)} · ${ready}${RESET}`);
      }
      console.log(`\n  ${DIM}Usage:${RESET} ${CYAN}/provider codex|gemini|cursor|openrouter${RESET}`);
      return;
    }

    if (!PROVIDERS.includes(next)) {
      console.log(`  ${YELLOW}!${RESET} ${DIM}Unknown provider "${next}". Use codex, gemini, cursor, or openrouter.${RESET}`);
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
    const data = ctx.config.provider === 'openrouter'
      ? await loadOpenRouterModels()
      : loadProviderModels(ctx);
    process.stdout.write('\r\x1b[K');
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
      console.log(`  ${GREEN}✓${RESET} ${DIM}Fast mode ${next ? 'enabled' : 'disabled'} for Codex.${RESET}`);
      return;
    }

    if (ctx.config.provider === 'cursor') {
      const target = findCursorFastVariant(models, ctx.config.model, next);
      if (!target) {
        console.log(`  ${YELLOW}!${RESET} ${DIM}No ${next ? 'fast' : 'regular'} variant found for ${ctx.config.model}.${RESET}`);
        return;
      }
      ctx.config.model = target;
      ctx.config.fastMode = next;
      console.log(`  ${GREEN}✓${RESET} ${DIM}Model →${RESET} ${CYAN}${ctx.config.model}${RESET}`);
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
      console.log(`  ${GREEN}✓${RESET} ${DIM}Codex reasoning →${RESET} ${CYAN}${effort}${RESET}`);
      return;
    }

    if (ctx.config.provider === 'cursor') {
      const suffix = effort === 'xhigh' ? 'xhigh' : effort;
      const target = findCursorVariant(models, ctx.config.model, suffix);
      if (!target) {
        console.log(`  ${YELLOW}!${RESET} ${DIM}No Cursor model variant found for reasoning "${effort}" from ${ctx.config.model}.${RESET}`);
        return;
      }
      ctx.config.model = target;
      ctx.config.reasoningEffort = effort;
      console.log(`  ${GREEN}✓${RESET} ${DIM}Model →${RESET} ${CYAN}${ctx.config.model}${RESET}`);
      return;
    }

    console.log(`  ${YELLOW}!${RESET} ${DIM}/think is not supported for provider "${ctx.config.provider}".${RESET}`);
  },
});

commands.push({
  name: '/new',
  description: 'Start a fresh conversation',
  execute: async (_args, ctx) => {
    ctx.messages.length = 0;
    ctx.config.codexThreadId = undefined;
    ctx.config.geminiSessionId = undefined;
    ctx.config.cursorSessionId = undefined;
    ctx.sessionPath = ctx.resetSession();
    console.log(`  ${GREEN}✓${RESET} ${DIM}New session started.${RESET}`);
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

export async function dispatch(input: string, ctx: CommandContext): Promise<boolean> {
  const [name, ...rest] = input.split(' ');
  const cmd = commands.find((c) => c.name === name);
  if (!cmd) {
    console.log(`  ${DIM}Unknown command: ${name}. Type /help for available commands.${RESET}`);
    return true;
  }
  await cmd.execute(rest.join(' '), ctx);
  return true;
}
