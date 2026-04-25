import type { Interface } from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { AgentConfig } from './config.js';
import type { ChatMessage } from './agent.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

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

function loadCodexModels(ctx: CommandContext): { id: string; name: string }[] {
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

function loadCursorModels(ctx: CommandContext): { id: string; name: string }[] {
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

async function loadOpenRouterModels() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const { data } = await res.json() as { data: { id: string; name: string }[] };
  return data;
}

commands.push({
  name: '/model',
  description: 'Switch to a different model',
  execute: async (_args, ctx) => {
    console.log(`  ${DIM}Current:${RESET} ${CYAN}${ctx.config.model}${RESET}`);
    const query = await ask(ctx.rl, `  ${DIM}Search models:${RESET} `);
    if (!query.trim()) return;
    process.stdout.write(`  ${DIM}Fetching…${RESET}`);
    const data = ctx.config.provider === 'codex'
      ? loadCodexModels(ctx)
      : ctx.config.provider === 'gemini'
        ? loadGeminiModels(ctx)
        : ctx.config.provider === 'cursor'
          ? loadCursorModels(ctx)
          : await loadOpenRouterModels();
    process.stdout.write('\r\x1b[K');
    const q = query.toLowerCase();
    const matches = data
      .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 15);
    if (!matches.length) { console.log(`  ${DIM}No models matching "${query}".${RESET}`); return; }
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
