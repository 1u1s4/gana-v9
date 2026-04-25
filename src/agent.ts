import { OpenRouter } from '@openrouter/agent';
import type { Item } from '@openrouter/agent';
import { stepCountIs, maxCost } from '@openrouter/agent/stop-conditions';
import { spawn } from 'child_process';
import type { AgentConfig } from './config.js';
import { tools } from './tools/index.js';

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; callId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; callId: string; output: string }
  | { type: 'reasoning'; delta: string };

export async function runAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal },
) {
  if (config.provider === 'codex') {
    return runCodexAgent(config, input, options);
  }
  if (config.provider === 'gemini') {
    return runGeminiAgent(config, input, options);
  }

  const client = new OpenRouter({ apiKey: config.apiKey });

  const result = client.callModel({
    model: config.model,
    instructions: config.systemPrompt.replace('{cwd}', process.cwd()),
    input: input as string | Item[],
    tools,
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

function inputToCodexPrompt(config: AgentConfig, input: string | ChatMessage[]): string {
  const userPrompt = typeof input === 'string'
    ? input
    : input.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  if (config.codexThreadId) return userPrompt;

  return [
    config.systemPrompt.replace('{cwd}', process.cwd()),
    '',
    'User request:',
    userPrompt,
  ].join('\n');
}

function codexArgs(config: AgentConfig, prompt: string): string[] {
  if (config.codexThreadId) {
    return ['exec', 'resume', '--json', '-m', config.model, config.codexThreadId, prompt];
  }

  return [
    'exec',
    '--json',
    '--color',
    'never',
    '-C',
    process.cwd(),
    '--sandbox',
    config.codexSandbox,
    '-m',
    config.model,
    prompt,
  ];
}

function inputToGeminiPrompt(config: AgentConfig, input: string | ChatMessage[]): string {
  const userPrompt = typeof input === 'string'
    ? input
    : input.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  if (config.geminiSessionId) return userPrompt;

  return [
    config.systemPrompt.replace('{cwd}', process.cwd()),
    '',
    'User request:',
    userPrompt,
  ].join('\n');
}

function geminiArgs(config: AgentConfig, prompt: string): string[] {
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

async function runCodexAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal },
) {
  const prompt = inputToCodexPrompt(config, input);
  const child = spawn('codex', codexArgs(config, prompt), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEX_HOME: config.codexHome,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderr = '';
  let text = '';
  let usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningOutputTokens?: number } = {};

  const handleEvent = (event: CodexJsonEvent) => {
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

  options?.signal?.addEventListener('abort', () => {
    child.kill('SIGTERM');
  }, { once: true });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  if (stdoutBuffer.trim()) {
    try {
      handleEvent(JSON.parse(stdoutBuffer) as CodexJsonEvent);
    } catch {
      text += stdoutBuffer;
    }
  }

  if (exitCode !== 0) {
    throw new Error((stderr.trim() || `codex exited with code ${exitCode}`).split('\n').slice(-8).join('\n'));
  }

  return { text, usage, output: text };
}

async function runGeminiAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal },
) {
  const prompt = inputToGeminiPrompt(config, input);
  const child = spawn('gemini', geminiArgs(config, prompt), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GEMINI_MODEL: config.model,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderr = '';
  let text = '';
  let usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number } = {};
  const toolNames = new Map<string, string>();

  const handleEvent = (event: GeminiJsonEvent) => {
    if (event.type === 'init' && event.session_id) {
      config.geminiSessionId = event.session_id;
      return;
    }

    if (event.type === 'tool_use') {
      const callId = event.tool_id ?? `gemini-${Date.now()}`;
      toolNames.set(callId, event.tool_name ?? 'tool');
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

  options?.signal?.addEventListener('abort', () => {
    child.kill('SIGTERM');
  }, { once: true });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

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

  return { text, usage, output: text };
}

export async function runAgentWithRetry(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal; maxRetries?: number },
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
