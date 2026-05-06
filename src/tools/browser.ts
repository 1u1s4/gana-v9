import { tool } from '@openrouter/agent/tool';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';
import type { AgentConfig, BrowserUseConfig } from '../config.js';

const browserInputSchema = z.object({
  task: z.string().min(1).max(4000).describe('Natural-language browser task for Browser Use Cloud. Keep it narrow and read-only.'),
  reason: z.string().min(1).describe('Why native provider web search was insufficient for this fallback.'),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
  maxOutputChars: z.number().int().positive().max(20_000).default(6000),
  idempotencyKey: z.string().min(1),
});

type BrowserInput = z.input<typeof browserInputSchema>;

interface BrowserUseSession {
  id: string;
  status?: string;
  output?: unknown;
  live_url?: string;
  liveUrl?: string;
  error?: unknown;
}

interface UsageState {
  month: string;
  tasksUsed: number;
}

let activeSessions = 0;

export function createBrowserUseTool(config: Pick<AgentConfig, 'artifactRoot' | 'browserUse'>) {
  return tool({
    name: 'browser',
    description: [
      'Browser Use Cloud fallback for live web research when native provider web search is unavailable or insufficient.',
      'Use sparingly: the configured free-plan guard defaults to 10 tasks/month and 3 concurrent sessions.',
      'Read-only research only; no purchases, betting, account changes, or credential collection.',
    ].join(' '),
    inputSchema: browserInputSchema,
    execute: async (raw) => {
      return executeBrowserUseTask(config, raw);
    },
  });
}

export async function executeBrowserUseTask(
  config: Pick<AgentConfig, 'artifactRoot' | 'browserUse'>,
  input: BrowserInput,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const parsed = browserInputSchema.parse(input);
  const settings = config.browserUse;
  if (!settings.enabled) return { blocked: true, error: 'Browser Use fallback is disabled by AGENT_BROWSER_FALLBACK=false.' };
  if (!settings.apiKey) return { blocked: true, error: 'BROWSER_USE_API_KEY is required to use the browser fallback.' };
  if (settings.maxConcurrentSessions <= 0 || settings.maxTasksPerMonth <= 0) {
    return { blocked: true, error: 'Browser Use fallback quota is disabled by configuration.' };
  }
  if (activeSessions >= settings.maxConcurrentSessions) {
    return {
      blocked: true,
      error: `Browser Use concurrent session limit reached (${settings.maxConcurrentSessions}).`,
      quota: quotaView(settings),
    };
  }

  const usage = reserveMonthlyTask(config.artifactRoot, settings);
  activeSessions += 1;
  try {
    const timeoutMs = Math.min(parsed.timeoutMs ?? settings.timeoutMs, settings.timeoutMs);
    const session = await createSession(settings, parsed.task, fetchImpl);
    const completed = await pollSession(settings, session.id, timeoutMs, fetchImpl);
    const output = stringifyOutput(completed.output).slice(0, parsed.maxOutputChars);
    return {
      ok: isCompletedStatus(completed.status),
      sessionId: completed.id,
      status: completed.status ?? 'unknown',
      output,
      liveUrl: completed.liveUrl ?? completed.live_url,
      quota: {
        ...usage,
        maxTasksPerMonth: settings.maxTasksPerMonth,
        maxConcurrentSessions: settings.maxConcurrentSessions,
      },
      ...(completed.error !== undefined && { error: stringifyOutput(completed.error).slice(0, 1000) }),
    };
  } finally {
    activeSessions = Math.max(0, activeSessions - 1);
  }
}

function createSession(
  settings: BrowserUseConfig,
  task: string,
  fetchImpl: typeof fetch,
): Promise<BrowserUseSession> {
  return requestJson(settings, '/api/v3/sessions', fetchImpl, {
    method: 'POST',
    body: JSON.stringify({
      task,
      ...(settings.model ? { model: settings.model } : {}),
    }),
  });
}

async function pollSession(
  settings: BrowserUseConfig,
  sessionId: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<BrowserUseSession> {
  const deadline = Date.now() + timeoutMs;
  let latest: BrowserUseSession = { id: sessionId, status: 'created' };
  while (Date.now() < deadline) {
    latest = await requestJson(settings, `/api/v3/sessions/${encodeURIComponent(sessionId)}`, fetchImpl);
    if (isTerminalStatus(latest.status)) return latest;
    await sleep(2000);
  }
  throw new Error(`Browser Use task timed out after ${Math.round(timeoutMs / 1000)}s.`);
}

async function requestJson(
  settings: BrowserUseConfig,
  path: string,
  fetchImpl: typeof fetch,
  init: RequestInit = {},
): Promise<BrowserUseSession> {
  const baseUrl = settings.baseUrl.replace(/\/+$/, '');
  const response = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Browser-Use-API-Key': settings.apiKey,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Browser Use API ${response.status}: ${stringifyOutput(json).slice(0, 1000)}`);
  }
  if (!json.id && path.endsWith('/sessions')) {
    throw new Error('Browser Use API did not return a session id.');
  }
  return json as BrowserUseSession;
}

function isTerminalStatus(status: string | undefined): boolean {
  return ['idle', 'stopped', 'error', 'timed_out', 'failed', 'completed'].includes(status ?? '');
}

function isCompletedStatus(status: string | undefined): boolean {
  return ['idle', 'stopped', 'completed'].includes(status ?? '');
}

function reserveMonthlyTask(artifactRoot: string, settings: BrowserUseConfig): UsageState {
  const path = usagePath(artifactRoot);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const state = readUsage(path, currentMonth);
  if (state.tasksUsed >= settings.maxTasksPerMonth) {
    throw new Error(`Browser Use monthly task limit reached (${settings.maxTasksPerMonth}/${settings.maxTasksPerMonth}).`);
  }
  const next = { month: currentMonth, tasksUsed: state.tasksUsed + 1 };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function readUsage(path: string, currentMonth: string): UsageState {
  if (!existsSync(path)) return { month: currentMonth, tasksUsed: 0 };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<UsageState>;
    if (parsed.month !== currentMonth) return { month: currentMonth, tasksUsed: 0 };
    return { month: currentMonth, tasksUsed: Number(parsed.tasksUsed ?? 0) };
  } catch {
    return { month: currentMonth, tasksUsed: 0 };
  }
}

function usagePath(artifactRoot: string): string {
  return join(resolve(artifactRoot), 'browser-use-usage.json');
}

function quotaView(settings: BrowserUseConfig): Record<string, number> {
  return {
    maxTasksPerMonth: settings.maxTasksPerMonth,
    maxConcurrentSessions: settings.maxConcurrentSessions,
  };
}

function stringifyOutput(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
