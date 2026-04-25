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
  if (config.provider === 'cursor') {
    return runCursorAgent(config, input, options);
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

interface CursorJsonEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  timestamp_ms?: number;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
  tool_call?: Record<string, any>;
  call_id?: string;
  result?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

function inputToCodexPrompt(config: AgentConfig, input: string | ChatMessage[]): string {
  const userPrompt = typeof input === 'string'
    ? input
    : input.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  const prompt = withNativeWebSearchRequirement(config, userPrompt);

  if (config.codexThreadId) return prompt;

  return [
    config.systemPrompt.replace('{cwd}', process.cwd()),
    '',
    'User request:',
    prompt,
  ].join('\n');
}

function withNativeWebSearchRequirement(config: AgentConfig, prompt: string): string {
  if (!config.nativeWebSearch) return prompt;

  const toolName = config.provider === 'codex'
    ? 'Codex web_search'
    : config.provider === 'gemini'
      ? 'Gemini google_web_search'
      : config.provider === 'cursor'
        ? 'Cursor WebSearch'
        : 'OpenRouter web_search';

  return [
    `Native web search requirement: before answering, call the embedded ${toolName} tool for this request. After the tool call returns, answer the user normally using the result. The harness will reject the turn if the native web search tool is not used.`,
    '',
    prompt,
  ].join('\n');
}

function requiresNativeWebSearch(config: AgentConfig): boolean {
  return config.nativeWebSearch && ['codex', 'gemini', 'cursor'].includes(config.provider);
}

function codexArgs(config: AgentConfig, prompt: string): string[] {
  const configArgs: string[] = [];
  if (config.nativeWebSearch) {
    configArgs.push('-c', `web_search="${config.nativeWebSearchMode}"`);
  }
  if (config.reasoningEffort) {
    configArgs.push('-c', `model_reasoning_effort="${config.reasoningEffort}"`);
  }
  if (config.fastMode) {
    configArgs.push('-c', 'service_tier="fast"');
  }

  if (config.codexThreadId) {
    return ['exec', 'resume', '--json', ...configArgs, '-m', config.model, config.codexThreadId, prompt];
  }

  return [
    'exec',
    '--json',
    ...configArgs,
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

  const prompt = withNativeWebSearchRequirement(config, userPrompt);

  if (config.geminiSessionId) return prompt;

  return [
    config.systemPrompt.replace('{cwd}', process.cwd()),
    '',
    'User request:',
    prompt,
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

function inputToCursorPrompt(config: AgentConfig, input: string | ChatMessage[]): string {
  const userPrompt = typeof input === 'string'
    ? input
    : input.filter((m) => m.role === 'user').at(-1)?.content ?? '';

  const prompt = withNativeWebSearchRequirement(config, userPrompt);

  if (config.cursorSessionId) return prompt;

  return [
    config.systemPrompt.replace('{cwd}', process.cwd()),
    '',
    'User request:',
    prompt,
  ].join('\n');
}

function cursorArgs(config: AgentConfig, prompt: string): string[] {
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--trust',
    '--workspace',
    process.cwd(),
    '--model',
    config.model,
  ];

  if (config.cursorForce || config.nativeWebSearch) args.push('--force');
  if (config.cursorSessionId) args.push('--resume', config.cursorSessionId);
  args.push(prompt);

  return args;
}

function cursorToolName(toolCall: Record<string, any> | undefined): string {
  const key = Object.keys(toolCall ?? {})[0];
  if (!key) return 'tool';
  return key.replace(/ToolCall$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

function cursorToolCallId(toolCall: Record<string, any> | undefined, fallback: string): string {
  const key = Object.keys(toolCall ?? {})[0];
  return key ? toolCall?.[key]?.args?.toolCallId ?? fallback : fallback;
}

function cursorToolArgs(toolCall: Record<string, any> | undefined): Record<string, unknown> {
  const key = Object.keys(toolCall ?? {})[0];
  if (!key) return {};
  return toolCall?.[key]?.args ?? {};
}

function cursorToolOutput(toolCall: Record<string, any> | undefined): string {
  const key = Object.keys(toolCall ?? {})[0];
  const result = key ? toolCall?.[key]?.result : undefined;
  if (typeof result === 'string') return result;
  return result ? JSON.stringify(result) : '';
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
  let sawNativeWebSearch = false;

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
  if (requiresNativeWebSearch(config) && !sawNativeWebSearch) {
    throw new Error('Native Codex web_search was required but was not used.');
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
  if (requiresNativeWebSearch(config) && !sawNativeWebSearch) {
    throw new Error('Native Gemini google_web_search was required but was not used.');
  }

  return { text, usage, output: text };
}

async function runCursorAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; signal?: AbortSignal },
) {
  const prompt = inputToCursorPrompt(config, input);
  const child = spawn('cursor-agent', cursorArgs(config, prompt), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderr = '';
  let text = '';
  let usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number } = {};
  let sawPartialAssistant = false;
  let sawNativeWebSearch = false;

  const handleEvent = (event: CursorJsonEvent) => {
    if (event.session_id) config.cursorSessionId = event.session_id;

    if (event.type === 'tool_call' && event.subtype === 'started') {
      const toolName = cursorToolName(event.tool_call);
      if (toolName === 'web_search') sawNativeWebSearch = true;
      options?.onEvent?.({
        type: 'tool_call',
        name: toolName,
        callId: cursorToolCallId(event.tool_call, event.call_id ?? `cursor-${Date.now()}`),
        args: cursorToolArgs(event.tool_call),
      });
      return;
    }

    if (event.type === 'tool_call' && event.subtype === 'completed') {
      options?.onEvent?.({
        type: 'tool_result',
        name: cursorToolName(event.tool_call),
        callId: cursorToolCallId(event.tool_call, event.call_id ?? `cursor-${Date.now()}`),
        output: cursorToolOutput(event.tool_call),
      });
      return;
    }

    if (event.type === 'thinking' && event.subtype === 'delta' && event.message?.content) {
      const delta = event.message.content.map((c) => c.text ?? '').join('');
      if (delta) options?.onEvent?.({ type: 'reasoning', delta });
      return;
    }

    if (event.type === 'assistant' && event.message?.content) {
      const delta = event.message.content.map((c) => c.text ?? '').join('');
      if (!delta) return;

      if (event.timestamp_ms) {
        sawPartialAssistant = true;
        text += delta;
        options?.onEvent?.({ type: 'text', delta });
      } else if (!sawPartialAssistant) {
        text += delta;
        options?.onEvent?.({ type: 'text', delta });
      }
      return;
    }

    if (event.type === 'result') {
      if (!sawPartialAssistant && event.result && !text) {
        text = event.result;
        options?.onEvent?.({ type: 'text', delta: event.result });
      }
      usage = {
        inputTokens: event.usage?.inputTokens,
        outputTokens: event.usage?.outputTokens,
        cachedInputTokens: event.usage?.cacheReadTokens,
        cacheWriteTokens: event.usage?.cacheWriteTokens,
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
        handleEvent(JSON.parse(line) as CursorJsonEvent);
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
      handleEvent(JSON.parse(stdoutBuffer) as CursorJsonEvent);
    } catch {
      text += stdoutBuffer;
    }
  }

  if (exitCode !== 0) {
    throw new Error((stderr.trim() || `cursor-agent exited with code ${exitCode}`).split('\n').slice(-8).join('\n'));
  }
  if (requiresNativeWebSearch(config) && !sawNativeWebSearch) {
    throw new Error('Native Cursor WebSearch was required but was not used.');
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
