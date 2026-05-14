import { OpenRouter } from '@openrouter/agent';
import type { Item } from '@openrouter/agent';
import { stepCountIs, maxCost } from '@openrouter/agent/stop-conditions';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AgentConfig } from './config.js';
import {
  deriveNativeWebSearchRequirement,
  formatNativeWebSearchEnforcementError,
} from './providers/agentic/helpers.js';
import type { AgentEvent, AgentUsage, NativeWebSearchRequirement } from './providers/agentic/types.js';
import type { RuntimeContext } from './runtime/context.js';
import { assertNoMonetaryAction, NO_MONETARY_ACTIONS_PROMPT } from './security/no-monetary-actions.js';
import { createTools } from './tools/index.js';

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type { AgentEvent } from './providers/agentic/types.js';

interface RunAgentOptions {
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  nativeWebSearchRequirement?: NativeWebSearchRequirement;
  runtime?: RuntimeContext;
  outputSchemaPath?: string;
  outputLastMessagePath?: string;
  useStdinPrompt?: boolean;
}

async function waitForChildClose(child: ChildProcess, providerName: string, signal?: AbortSignal): Promise<number | null> {
  if (!signal) {
    return new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        cleanupDetachedProcessGroup(child);
        resolve(code);
      });
    });
  }

  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<number | null>((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
      if (killTimer) clearTimeout(killTimer);
      if (rejectTimer) clearTimeout(rejectTimer);
    };

    const settle = (fn: () => void) => {
      cleanup();
      fn();
    };

    const onError = (err: Error) => settle(() => reject(err));
    const onClose = (code: number | null) => settle(() => {
      cleanupDetachedProcessGroup(child);
      resolve(code);
    });

    const abort = () => {
      killChildProcessGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => {
        killChildProcessGroup(child, 'SIGKILL');
      }, 2_000);
      rejectTimer = setTimeout(() => {
        settle(() => reject(new Error(`${providerName} agent aborted before the process closed`)));
      }, 3_000);
    };

    signal.addEventListener('abort', abort, { once: true });
    child.once('error', onError);
    child.once('close', onClose);
    if (signal.aborted) abort();
  });
}

function killChildProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
    return;
  } catch {
    // Fall back for platforms or launchers that do not expose a process group.
  }
  try {
    if (child.exitCode === null) child.kill(signal);
  } catch {
    // Best-effort cleanup only.
  }
}

function cleanupDetachedProcessGroup(child: ChildProcess): void {
  if (!child.pid) return;
  killChildProcessGroup(child, 'SIGTERM');
  const timer = setTimeout(() => killChildProcessGroup(child, 'SIGKILL'), 2_000);
  timer.unref?.();
}

export async function runAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: RunAgentOptions,
) {
  assertNoMonetaryAction(userTextFromInput(input));

  if (config.provider === 'codex') {
    return runCodexAgent(config, input, options);
  }
  if (config.provider === 'gemini') {
    return runGeminiAgent(config, input, options);
  }

  const client = new OpenRouter({ apiKey: config.apiKey });

  const result = client.callModel({
    model: config.model,
    instructions: systemPromptWithGuards(config),
    input: input as string | Item[],
    tools: createTools({ config, runtime: options?.runtime }),
    stopWhen: [stepCountIs(config.maxSteps), maxCost(config.maxCost)],
  });

  if (options?.onEvent) {
    let lastTextLen = 0;
    const callNames = new Map<string, string>();

    for await (const item of result.getItemsStream()) {
      if (options?.signal?.aborted) break;
      if (item.type === 'message') {
        const text = item.content
          ?.filter((c): c is { type: 'output_text'; text: string } => 'text' in c)
          .map((c) => c.text)
          .join('') ?? '';
        if (text.length > lastTextLen) {
          options.onEvent({ type: 'text', delta: text.slice(lastTextLen) });
          lastTextLen = text.length;
        }
      } else if (item.type === 'function_call') {
        callNames.set(item.callId, item.name);
        if (item.status === 'completed') {
          const args = (() => { try { return item.arguments ? JSON.parse(item.arguments) : {}; } catch { return {}; } })();
          options.onEvent({ type: 'tool_call', name: item.name, callId: item.callId, args });
        }
      } else if (item.type === 'function_call_output') {
        const out = typeof item.output === 'string' ? item.output : JSON.stringify(item.output);
        options.onEvent({
          type: 'tool_result',
          name: callNames.get(item.callId) ?? 'unknown',
          callId: item.callId,
          output: out.length > 200 ? out.slice(0, 200) + '…' : out,
        });
      } else if (item.type === 'reasoning') {
        const text = item.summary?.map((s: { text: string }) => s.text).join('') ?? '';
        if (text) options.onEvent({ type: 'reasoning', delta: text });
      }
    }
  }

  const response = await result.getResponse();
  return { text: response.outputText ?? '', usage: response.usage, output: response.output };
}

interface CodexJsonEvent {
  type: string;
  thread_id?: string;
  message?: string;
  error?: { message?: string };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_input_tokens?: number;
    reasoning_output_tokens?: number;
  };
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
    query?: string;
    action?: { type?: string; query?: string; queries?: string[] };
  };
}

interface GeminiJsonEvent {
  type: string;
  session_id?: string;
  role?: string;
  content?: string;
  delta?: boolean;
  tool_name?: string;
  tool_id?: string;
  parameters?: Record<string, unknown>;
  output?: string;
  status?: string;
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cached?: number;
    duration_ms?: number;
    tool_calls?: number;
  };
}

function nativeWebRequirement(config: AgentConfig, options?: RunAgentOptions): NativeWebSearchRequirement {
  return options?.nativeWebSearchRequirement
    ?? deriveNativeWebSearchRequirement(config, { required: false });
}

function userTextFromInput(input: string | ChatMessage[]): string {
  return typeof input === 'string'
    ? input
    : input.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
}

function systemPromptWithGuards(config: AgentConfig): string {
  return [
    config.systemPrompt.replace('{cwd}', process.cwd()),
    NO_MONETARY_ACTIONS_PROMPT,
  ].join('\n\n');
}

function inputToCodexPrompt(config: AgentConfig, input: string | ChatMessage[], requirement: NativeWebSearchRequirement): string {
  const userPrompt = typeof input === 'string'
    ? input
    : input.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  const prompt = withNativeWebSearchRequirement(userPrompt, requirement);

  if (config.codexThreadId) return prompt;

  return [
    systemPromptWithGuards(config),
    '',
    'User request:',
    prompt,
  ].join('\n');
}

function withNativeWebSearchRequirement(prompt: string, requirement: NativeWebSearchRequirement): string {
  if (!requirement.required || !requirement.displayToolName) return prompt;

  return [
    `Native web search requirement: before answering, call the embedded ${requirement.displayToolName} tool for this request. After the tool call returns, answer the user normally using the result. The harness will reject the turn if the native web search tool is not used.`,
    '',
    prompt,
  ].join('\n');
}

function requiresNativeWebSearch(requirement: NativeWebSearchRequirement): boolean {
  return requirement.required && requirement.enforce;
}

interface CodexArgsOptions {
  outputSchemaPath?: string;
  outputLastMessagePath?: string;
  useStdinPrompt?: boolean;
}

export function codexArgs(
  config: AgentConfig,
  prompt: string,
  requirement: NativeWebSearchRequirement,
  options: CodexArgsOptions = {},
): string[] {
  const configArgs: string[] = [];
  if (config.nativeWebSearch || requirement.required) {
    configArgs.push('-c', `web_search="${requirement.mode ?? config.nativeWebSearchMode}"`);
  }
  if (config.reasoningEffort) {
    configArgs.push('-c', `model_reasoning_effort="${config.reasoningEffort}"`);
  }
  if (config.fastMode) {
    configArgs.push('-c', 'service_tier="fast"');
  }
  const outputArgs: string[] = [];
  // `codex exec resume` currently rejects --output-schema even though fresh `codex exec` accepts it.
  // Keep schema enforcement for fresh turns, but rely on prompt/schema validation + retry for resumed threads.
  if (options.outputSchemaPath && !config.codexThreadId) outputArgs.push('--output-schema', options.outputSchemaPath);
  if (options.outputLastMessagePath) outputArgs.push('--output-last-message', options.outputLastMessagePath);
  const promptArg = options.useStdinPrompt ? '-' : prompt;

  if (config.codexThreadId) {
    return ['exec', 'resume', '--json', ...configArgs, ...outputArgs, '-m', config.model, config.codexThreadId, promptArg];
  }

  return [
    'exec',
    '--json',
    ...configArgs,
    ...outputArgs,
    '--color',
    'never',
    '-C',
    process.cwd(),
    '--sandbox',
    config.codexSandbox,
    '-m',
    config.model,
    promptArg,
  ];
}

function inputToGeminiPrompt(config: AgentConfig, input: string | ChatMessage[], requirement: NativeWebSearchRequirement): string {
  const userPrompt = typeof input === 'string'
    ? input
    : input.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  const prompt = withNativeWebSearchRequirement(userPrompt, requirement);

  if (config.geminiSessionId) return prompt;

  return [
    systemPromptWithGuards(config),
    '',
    'User request:',
    prompt,
  ].join('\n');
}

export function geminiArgs(config: AgentConfig, prompt: string): string[] {
  const args = [
    '--prompt',
    prompt,
    '--output-format',
    'stream-json',
    '--model',
    config.model,
    '--approval-mode',
    config.geminiApprovalMode,
    '--skip-trust',
  ];

  if (config.geminiSessionId) {
    args.push('--resume', config.geminiSessionId);
  }

  return args;
}

function codexModelAttempts(config: AgentConfig): string[] {
  return [config.model, ...config.codexFallbackModels]
    .map((model) => model.trim())
    .filter((model, index, models) => Boolean(model) && models.indexOf(model) === index);
}

function isCodexQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|quota|rate limit|rate-limit|usage limit|limit exceeded|too many requests|insufficient quota)\b/i.test(message);
}

async function runCodexAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: RunAgentOptions,
) {
  const originalModel = config.model;
  const models = codexModelAttempts(config);
  let lastError: unknown;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    config.model = model;
    try {
      return await runCodexAgentAttempt(config, input, options);
    } catch (error) {
      lastError = error;
      const nextModel = models[index + 1];
      if (!nextModel || !isCodexQuotaError(error)) {
        config.model = model;
        throw error;
      }
      options?.onEvent?.({
        type: 'text',
        delta: `\n[guardrail] Codex quota reached for ${model}; retrying with ${nextModel}.\n`,
      });
    }
  }
  config.model = originalModel;
  throw lastError;
}

async function runCodexAgentAttempt(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: RunAgentOptions,
) {
  const requirement = nativeWebRequirement(config, options);
  const prompt = inputToCodexPrompt(config, input, requirement);
  const outputLastMessagePath = options?.outputLastMessagePath
    ?? (options?.outputSchemaPath ? join(mkdtempSync(join(tmpdir(), 'gana-codex-')), 'last-message.json') : undefined);
  const useStdinPrompt = Boolean(options?.useStdinPrompt || options?.outputSchemaPath);
  const child = spawn('codex', codexArgs(config, prompt, requirement, {
    outputSchemaPath: options?.outputSchemaPath,
    outputLastMessagePath,
    useStdinPrompt,
  }), {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      CODEX_HOME: config.codexHome,
    },
    stdio: [useStdinPrompt ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });
  if (useStdinPrompt) child.stdin?.end(prompt);
  if (!child.stdout || !child.stderr) {
    throw new Error('codex process did not expose stdout/stderr streams');
  }

  let stdoutBuffer = '';
  let stderr = '';
  let text = '';
  let usage: AgentUsage = {};
  let sawNativeWebSearch = false;
  let providerError = '';

  const handleEvent = (event: CodexJsonEvent) => {
    if ((event.type === 'error' || event.type === 'turn.failed') && (event.message || event.error?.message)) {
      providerError = event.message ?? event.error?.message ?? '';
      return;
    }

    if (event.type === 'thread.started' && event.thread_id) {
      config.codexThreadId = event.thread_id;
      return;
    }

    if (event.type === 'item.started' && event.item?.type === 'command_execution') {
      const callId = event.item.id ?? `codex-${Date.now()}`;
      options?.onEvent?.({
        type: 'tool_call',
        name: 'shell',
        callId,
        args: { command: event.item.command ?? '' },
      });
      return;
    }

    if (event.type === 'item.started' && event.item?.type === 'web_search') {
      sawNativeWebSearch = true;
      const callId = event.item.id ?? `codex-web-${Date.now()}`;
      options?.onEvent?.({
        type: 'tool_call',
        name: 'web_search',
        callId,
        args: { query: event.item.query ?? event.item.action?.query ?? '' },
      });
      return;
    }

    if (event.type === 'item.completed' && event.item?.type === 'web_search') {
      const callId = event.item.id ?? `codex-web-${Date.now()}`;
      const query = event.item.query ?? event.item.action?.query ?? event.item.action?.queries?.join(', ') ?? '';
      options?.onEvent?.({
        type: 'tool_result',
        name: 'web_search',
        callId,
        output: query ? `Search completed: ${query}` : 'Search completed.',
      });
      return;
    }

    if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
      const callId = event.item.id ?? `codex-${Date.now()}`;
      options?.onEvent?.({
        type: 'tool_result',
        name: 'shell',
        callId,
        output: event.item.aggregated_output ?? '',
      });
      return;
    }

    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      const delta = event.item.text ?? '';
      text += delta;
      options?.onEvent?.({ type: 'text', delta });
      return;
    }

    if (event.type === 'turn.completed' && event.usage) {
      usage = {
        inputTokens: event.usage.input_tokens,
        outputTokens: event.usage.output_tokens,
        cachedInputTokens: event.usage.cached_input_tokens,
        reasoningOutputTokens: event.usage.reasoning_output_tokens,
      };
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        handleEvent(JSON.parse(line) as CodexJsonEvent);
      } catch {
        text += line + '\n';
        options?.onEvent?.({ type: 'text', delta: line + '\n' });
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await waitForChildClose(child, 'codex', options?.signal);

  if (stdoutBuffer.trim()) {
    try {
      handleEvent(JSON.parse(stdoutBuffer) as CodexJsonEvent);
    } catch {
      text += stdoutBuffer;
    }
  }

  if (exitCode !== 0) {
    throw new Error((stderr.trim() || providerError || `codex exited with code ${exitCode}`).split('\n').slice(-8).join('\n'));
  }
  if (requiresNativeWebSearch(requirement) && !sawNativeWebSearch) {
    throw new Error(formatNativeWebSearchEnforcementError(requirement));
  }
  if (!text.trim() && outputLastMessagePath && existsSync(outputLastMessagePath)) {
    const lastMessage = readFileSync(outputLastMessagePath, 'utf8').trim();
    if (lastMessage) text = lastMessage;
  }

  return { text, usage, output: text };
}

async function runGeminiAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: RunAgentOptions,
) {
  const requirement = nativeWebRequirement(config, options);
  const prompt = inputToGeminiPrompt(config, input, requirement);
  const child = spawn('gemini', geminiArgs(config, prompt), {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      GEMINI_MODEL: config.model,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderr = '';
  let text = '';
  let usage: AgentUsage = {};
  const toolNames = new Map<string, string>();
  let sawNativeWebSearch = false;

  const handleEvent = (event: GeminiJsonEvent) => {
    if (event.type === 'init' && event.session_id) {
      config.geminiSessionId = event.session_id;
      return;
    }

    if (event.type === 'tool_use') {
      const callId = event.tool_id ?? `gemini-${Date.now()}`;
      toolNames.set(callId, event.tool_name ?? 'tool');
      if (event.tool_name === 'google_web_search') sawNativeWebSearch = true;
      options?.onEvent?.({
        type: 'tool_call',
        name: event.tool_name ?? 'tool',
        callId,
        args: event.parameters ?? {},
      });
      return;
    }

    if (event.type === 'tool_result') {
      const callId = event.tool_id ?? `gemini-${Date.now()}`;
      options?.onEvent?.({
        type: 'tool_result',
        name: toolNames.get(callId) ?? 'tool',
        callId,
        output: event.output ?? event.status ?? '',
      });
      return;
    }

    if (event.type === 'message' && event.role === 'assistant' && event.content) {
      text += event.content;
      options?.onEvent?.({ type: 'text', delta: event.content });
      return;
    }

    if (event.type === 'result' && event.stats) {
      usage = {
        inputTokens: event.stats.input_tokens,
        outputTokens: event.stats.output_tokens,
        cachedInputTokens: event.stats.cached,
      };
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        handleEvent(JSON.parse(line) as GeminiJsonEvent);
      } catch {
        text += line + '\n';
        options?.onEvent?.({ type: 'text', delta: line + '\n' });
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await waitForChildClose(child, 'gemini', options?.signal);

  if (stdoutBuffer.trim()) {
    try {
      handleEvent(JSON.parse(stdoutBuffer) as GeminiJsonEvent);
    } catch {
      text += stdoutBuffer;
    }
  }

  if (exitCode !== 0) {
    throw new Error((stderr.trim() || `gemini exited with code ${exitCode}`).split('\n').slice(-8).join('\n'));
  }
  if (requiresNativeWebSearch(requirement) && !sawNativeWebSearch) {
    throw new Error(formatNativeWebSearchEnforcementError(requirement));
  }

  return { text, usage, output: text };
}

export async function runAgentWithRetry(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: RunAgentOptions & { maxRetries?: number },
) {
  for (let attempt = 0, max = options?.maxRetries ?? 3; attempt <= max; attempt++) {
    try { return await runAgent(config, input, options); }
    catch (err: any) {
      const s = err?.status ?? err?.statusCode;
      if (!(s === 429 || (s >= 500 && s < 600)) || attempt === max) throw err;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 30000)));
    }
  }
  throw new Error('Unreachable');
}
