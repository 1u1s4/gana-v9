import { createInterface } from 'readline';
import { basename, extname } from 'path';
import { loadConfig, type DisplayConfig } from './config.js';
import { runAgentWithRetry, type ChatMessage } from './agent.js';
import { initSessionDir, saveMessage, saveSessionEvent, newSessionPath } from './session.js';
import { printBanner } from './banner.js';
import { TuiRenderer } from './renderer.js';
import { dispatch, printHeadlessUsage, type CommandContext } from './commands.js';
import { detectBg } from './terminal-bg.js';
import { Loader } from './loader.js';
import { getFiltersStatus } from './filters/status.js';
import { runHeadless } from './headless.js';
import { redactSecrets } from './permissions/redaction.js';
import { appendAutoApproval } from './permissions/audit.js';
import { deriveNativeWebSearchRequirement, redactProviderSessionId } from './providers/agentic/helpers.js';
import type { AgentEvent, AgentUsage, NativeWebSearchRequirement } from './providers/agentic/types.js';
import { getFootballStatus } from './providers/sports/football-status.js';
import { createRuntimeContext } from './runtime/context.js';
import { appendAgentEventJsonl, appendEventJsonl, ensureArtifactRoot } from './runtime/artifacts.js';
import {
  createHarnessCorrelationId,
  createHarnessEvent,
  createHarnessTraceId,
  type HarnessEvent,
  type HarnessEventType,
} from './runtime/events.js';
import { getDbStatus } from './storage/db-status.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const WHITE = '\x1b[97m';

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function textBanner(name: string, model: string, provider: string) {
  const width = Math.min(process.stdout.columns || 60, 60);
  const line = GRAY + '─'.repeat(width) + RESET;
  console.log();
  console.log(line);
  console.log(`  ${BOLD}${name}${RESET}`);
  console.log(`  ${DIM}provider${RESET}  ${CYAN}${providerLabel(provider)}${RESET}`);
  console.log(`  ${DIM}model${RESET}  ${CYAN}${model}${RESET}`);
  console.log(line);
  console.log(`  ${DIM}Type a message to start. "exit" to quit.${RESET}`);
  console.log();
}

function providerLabel(provider: string): string {
  if (provider === 'codex') return 'local codex auth';
  if (provider === 'gemini') return 'local gemini auth';
  if (provider === 'cursor') return 'local cursor auth';
  return 'openrouter';
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function firstCommandArg(argv: string[]): string | undefined {
  return argv[0]?.startsWith('-') ? undefined : argv[0];
}

function sessionRunId(sessionPath: string): string {
  const name = basename(sessionPath, extname(sessionPath)) || 'session';
  return `session-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

function providerNativeSession(config: ReturnType<typeof loadConfig>): Record<string, unknown> {
  if (config.provider === 'codex') return { codexThreadId: redactProviderSessionId(config.codexThreadId) ?? null };
  if (config.provider === 'gemini') return { geminiSessionId: redactProviderSessionId(config.geminiSessionId) ?? null };
  if (config.provider === 'cursor') return { cursorSessionId: redactProviderSessionId(config.cursorSessionId) ?? null };
  return {};
}

function shouldRequireNativeWebSearch(input: string, config: ReturnType<typeof loadConfig>): { required: boolean; reason?: string } {
  if (!config.nativeWebSearch) return { required: false };
  if (/\b(web\s+live|current|latest|today|research|investiga|investigar|buscar|busca|actual|reciente|noticias)\b/i.test(input)) {
    return { required: true, reason: 'current-info or research request' };
  }
  return { required: false };
}

function buildNativeWebRequirement(input: string, config: ReturnType<typeof loadConfig>): NativeWebSearchRequirement {
  const decision = shouldRequireNativeWebSearch(input, config);
  return deriveNativeWebSearchRequirement(config, decision);
}

function persistAgentEvent(
  config: ReturnType<typeof loadConfig>,
  runtime: ReturnType<typeof createRuntimeContext>,
  sessionPath: string,
  type: HarnessEventType,
  payload: Record<string, unknown> = {},
  severity: HarnessEvent['severity'] = 'info',
): HarnessEvent {
  const runId = runtime.runId ?? sessionRunId(sessionPath);
  const event = createHarnessEvent({
    type,
    runId,
    taskId: runtime.taskId,
    correlationId: createHarnessCorrelationId(),
    traceId: createHarnessTraceId(),
    runtime: config.runtime,
    profile: runtime.profile,
    providerAgentic: runtime.providerAgentic,
    providerSports: runtime.providerSports,
    severity,
    payload: {
      provider: config.provider,
      model: config.model,
      ...providerNativeSession(config),
      ...payload,
    },
  });
  saveSessionEvent(sessionPath, event);
  appendEventJsonl(config, runId, event);
  appendAgentEventJsonl(config, runId, event);
  return event;
}

function persistStreamEvent(
  config: ReturnType<typeof loadConfig>,
  runtime: ReturnType<typeof createRuntimeContext>,
  sessionPath: string,
  event: AgentEvent,
): void {
  const payload = event.type === 'text'
    ? { deltaLength: event.delta.length }
    : event.type === 'reasoning'
      ? { deltaLength: event.delta.length }
      : event.type === 'tool_call'
        ? { toolName: event.name, callId: event.callId, args: event.args }
        : { toolName: event.name, callId: event.callId, output: event.output };
  const type = event.type === 'text'
    ? 'agent.delta'
    : event.type === 'reasoning'
      ? 'agent.reasoning'
      : event.type === 'tool_call'
        ? 'agent.tool_call'
        : 'agent.tool_result';
  persistAgentEvent(config, runtime, sessionPath, type, payload, 'debug');
}

function usagePayload(usage: AgentUsage | undefined): Record<string, unknown> {
  return usage ? { usage } : {};
}

function recordAutoGrantedProviderOptions(config: ReturnType<typeof loadConfig>, runtime: ReturnType<typeof createRuntimeContext>): void {
  if (config.profile !== 'full-permissions' || config.approvalMode !== 'auto-grant') return;
  const actions: string[] = [];
  if (config.provider === 'codex' && config.codexSandbox === 'danger-full-access') actions.push('codex.danger-full-access');
  if (config.provider === 'gemini' && config.geminiApprovalMode === 'yolo') actions.push('gemini.yolo');
  if (config.provider === 'cursor' && config.cursorForce) actions.push('cursor.force');
  for (const action of actions) appendAutoApproval(runtime, action);
}

async function printStartupStatus(config: ReturnType<typeof loadConfig>) {
  const db = await getDbStatus(config);
  const football = getFootballStatus(config);
  const filters = getFiltersStatus(config);

  console.log(`  ${DIM}runtime   ${RESET}${CYAN}${config.runtime}${RESET}`);
  console.log(`  ${DIM}profile   ${RESET}${CYAN}${config.profile}${RESET} ${DIM}approval=${config.approvalMode}${RESET}`);
  console.log(`  ${DIM}artifacts ${RESET}${CYAN}${config.artifactRoot}${RESET}`);
  console.log(`  ${DIM}db        ${RESET}${statusColor(db.status)}${db.status}${RESET}`);
  console.log(`  ${DIM}football  ${RESET}${statusColor(football.status)}${football.status}${RESET}`);
  console.log(`  ${DIM}filters   ${RESET}${statusColor(filters.status)}season=${filters.filters.defaultSeason} threshold=${filters.filters.lowOddsThreshold}${RESET}`);
  if (filters.warnings.length) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${filters.warnings[0]}${RESET}`);
  }
  console.log();
}

function statusColor(status: string): string {
  return status === 'missing' || status === 'warning' || status === 'disconnected' || status === 'degraded'
    ? YELLOW
    : GREEN;
}

function styledReadLine(bg: string): Promise<string> {
  return new Promise((resolve) => {
    let line = '';
    let first = true;

    function draw() {
      if (first) {
        process.stdout.write(`\n${bg}\x1b[K${RESET}\n`);
        process.stdout.write(`${bg}\x1b[K ${WHITE}›${RESET}${bg}${WHITE} ${line}${RESET}\n`);
        process.stdout.write(`${bg}\x1b[K${RESET}\x1b[1A\r\x1b[4G`);
        first = false;
      } else {
        process.stdout.write(`\r\x1b[2K`);
        process.stdout.write(`${bg}\x1b[K ${WHITE}›${RESET}${bg}${WHITE} ${line}${RESET}`);
        process.stdout.write(`\n${bg}\x1b[K${RESET}\x1b[1A\r\x1b[${4 + line.length}G`);
      }
    }

    draw();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');
      if (str.startsWith('\x1b')) return;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code === 13 || code === 10) {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write(`${RESET}\n`);
          resolve(line);
          return;
        } else if (code === 127 || code === 8) {
          line = line.slice(0, -1);
          draw();
        } else if (code === 3) {
          process.stdout.write(`${RESET}\n`);
          process.exit(0);
        } else if (code >= 32) {
          line += str[i];
          draw();
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

function borderedReadLine(borderColor = GRAY): Promise<string> {
  return new Promise((resolve) => {
    let line = '';
    let first = true;
    const width = process.stdout.columns || 80;
    const border = `${borderColor}${'─'.repeat(width)}${RESET}`;

    function draw() {
      if (first) {
        process.stdout.write(`\n${border}\n`);
        process.stdout.write(`› ${line}\n`);
        process.stdout.write(`${border}\x1b[1A\r\x1b[${3 + line.length}G`);
        first = false;
      } else {
        process.stdout.write(`\r\x1b[2K`);
        process.stdout.write(`› ${line}`);
      }
    }

    draw();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');
      if (str.startsWith('\x1b')) return;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code === 13 || code === 10) {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          if (!line) {
            process.stdout.write(`\x1b[1A\x1b[2K\x1b[1A\x1b[2K\r`);
          } else {
            process.stdout.write(`\x1b[1B\r`);
            process.stdout.write(`\n`);
          }
          resolve(line);
          return;
        } else if (code === 127 || code === 8) {
          line = line.slice(0, -1);
          draw();
        } else if (code === 3) {
          process.stdout.write(`${RESET}\n`);
          process.exit(0);
        } else if (code >= 32) {
          line += str[i];
          draw();
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

export async function runTui() {
  const argBanner = parseArg('--banner');
  const argModel = parseArg('--model');
  const argInput = parseArg('--input') as DisplayConfig['inputStyle'] | undefined;
  const argToolDisplay = parseArg('--tool-display') as DisplayConfig['toolDisplay'] | undefined;
  const argLoaderStyle = parseArg('--loader-style') as import('./config.js').LoaderConfig['style'] | undefined;
  const demoMode = process.argv.includes('--demo');
  const demoLoaderMode = process.argv.includes('--demo-loader');

  const overrides: Record<string, any> = {};
  if (argBanner) overrides.name = argBanner;
  if (argModel) overrides.model = argModel;
  if (argInput || argToolDisplay || argLoaderStyle) {
    overrides.display = {
      ...(argInput && { inputStyle: argInput }),
      ...(argToolDisplay && { toolDisplay: argToolDisplay }),
      ...(argLoaderStyle && { loader: { text: 'Working', style: argLoaderStyle } }),
    };
  }

  const config = loadConfig(overrides, { skipApiKey: demoMode || demoLoaderMode });
  ensureArtifactRoot(config);
  const BG_INPUT = config.display.inputStyle === 'block' ? await detectBg() : '';

  initSessionDir(config.sessionDir);
  let sessionPath = newSessionPath(config.sessionDir);
  const runtime = createRuntimeContext(config, sessionPath);
  const messages: ChatMessage[] = [];

  if (config.showBanner) {
    printBanner(config.model);
  } else {
    textBanner(config.name, config.model, config.provider);
  }
  if (config.showBanner) console.log(`  ${DIM}provider  ${RESET}${providerLabel(config.provider)}\n`);
  await printStartupStatus(config);
  if (config.slashCommands) console.log(`  ${DIM}/help for commands${RESET}\n`);

  const renderer = new TuiRenderer({ display: config.display });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}>${RESET} `,
  });
  const queuedInput: string[] = [];
  let stdinClosed = false;
  let waitingForInput: ((line: string) => void) | undefined;

  if (!process.stdin.isTTY) {
    rl.on('line', (line) => {
      if (waitingForInput) {
        const resolve = waitingForInput;
        waitingForInput = undefined;
        resolve(line);
      } else {
        queuedInput.push(line);
      }
    });
    rl.on('close', () => {
      stdinClosed = true;
      if (waitingForInput) {
        const resolve = waitingForInput;
        waitingForInput = undefined;
        resolve('exit');
      }
    });
  }

  const cmdCtx: CommandContext = {
    config,
    runtime,
    rl,
    messages,
    sessionPath,
    resetSession: () => { sessionPath = newSessionPath(config.sessionDir); runtime.sessionPath = sessionPath; return sessionPath; },
    totalTokens: { input: 0, output: 0 },
  };

  async function getInput(): Promise<string> {
    if (!process.stdin.isTTY) {
      if (queuedInput.length) return queuedInput.shift() ?? 'exit';
      if (stdinClosed) return 'exit';
      return new Promise((resolve) => {
        waitingForInput = resolve;
      });
    }
    switch (config.display.inputStyle) {
      case 'block': return styledReadLine(BG_INPUT);
      case 'bordered': return borderedReadLine();
      case 'plain':
      default:
        return new Promise((resolve) => {
          rl.prompt();
          rl.once('line', resolve);
        });
    }
  }

  async function runDemoLoader() {
    if (config.display.inputStyle === 'block') {
      process.stdout.write(`${DIM}> what's in this repo${RESET}\n`);
      const cwd = process.cwd().replace(process.env.HOME ?? '', '~');
      process.stdout.write(`\x1b[K  ${DIM}${cwd}${RESET}\n`);
    }
    process.stdout.write('\n');
    const loader = new Loader(config.display.loader);
    loader.start();
    await new Promise(() => {});
  }

  async function runDemo() {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const emit = (e: AgentEvent) => renderer.handle(e);

    if (config.display.inputStyle === 'block') {
      process.stdout.write(`${DIM}> what's in this repo${RESET}\n`);
      const cwd = process.cwd().replace(process.env.HOME ?? '', '~');
      process.stdout.write(`\x1b[K  ${DIM}${cwd}${RESET}\n`);
    }

    const loader = new Loader(config.display.loader);
    process.stdout.write('\n');
    loader.start();
    await sleep(200);
    loader.stop();

    emit({ type: 'text', delta: "I'll explore the repository structure.\n\n" });
    renderer.endTurn();

    await sleep(100);
    emit({ type: 'tool_call', name: 'shell', callId: 'c1', args: { command: 'pwd' } });
    await sleep(200);
    emit({ type: 'tool_result', name: 'shell', callId: 'c1', output: '/home/user/my-agent' });

    await sleep(100);
    emit({ type: 'tool_call', name: 'list_dir', callId: 'c2', args: { path: '.' } });
    await sleep(150);
    emit({ type: 'tool_result', name: 'list_dir', callId: 'c2', output: 'src/ package.json tsconfig.json .env' });

    await sleep(100);
    emit({ type: 'tool_call', name: 'list_dir', callId: 'c2b', args: { path: 'src/' } });
    await sleep(150);
    emit({ type: 'tool_result', name: 'list_dir', callId: 'c2b', output: 'cli.ts agent.ts config.ts tools/' });

    await sleep(100);
    emit({ type: 'tool_call', name: 'file_read', callId: 'c4', args: { path: 'package.json' } });
    await sleep(100);
    emit({ type: 'tool_result', name: 'file_read', callId: 'c4', output: '{"name":"my-agent","dependencies":{"@openrouter/agent":"^0.4"}}' });

    await sleep(100);
    emit({ type: 'tool_call', name: 'grep', callId: 'c5', args: { pattern: 'export' } });
    await sleep(200);
    emit({ type: 'tool_result', name: 'grep', callId: 'c5', output: 'src/agent.ts:export async function runAgent' });

    renderer.endTurn();

    await sleep(100);
    emit({ type: 'text', delta: '\nThis is a TypeScript agent using `@openrouter/agent`.\n\n' });
    emit({ type: 'text', delta: '- `src/cli.ts` — interactive REPL with styled input\n' });
    emit({ type: 'text', delta: '- `src/agent.ts` — model calls with retry logic\n' });
    emit({ type: 'text', delta: '- `src/config.ts` — layered config (file + env)\n' });
    emit({ type: 'text', delta: '- `src/tools/` — file, shell, and search tools\n' });
    renderer.endTurn();

    console.log();
    console.log(`${GRAY}  1.2k in · 340 out${RESET}\n`);

    if (process.stdin.isTTY) {
      await getInput();
    }
  }

  async function loop() {
    while (true) {
      const input = await getInput();
      const trimmed = input.trim();
      if (!trimmed) continue;

      if (config.display.inputStyle !== 'plain') {
        const cwd = process.cwd().replace(process.env.HOME ?? '', '~');
        process.stdout.write(`\x1b[K  ${DIM}${cwd}${RESET}\n`);
      }

      if (trimmed.toLowerCase() === 'exit') {
        console.log(`\n${DIM}Goodbye.${RESET}\n`);
        process.exit(0);
      }
      if (trimmed.startsWith('/') && config.slashCommands) {
        await dispatch(trimmed, cmdCtx);
        continue;
      }

      messages.push({ role: 'user', content: trimmed });
      saveMessage(sessionPath, { role: 'user', content: trimmed });

      let started = false;
      const loader = new Loader(config.display.loader);
      process.stdout.write('\n');
      loader.start();

      try {
        const agentInput = messages.length > 1 ? messages : trimmed;
        const nativeWebSearchRequirement = buildNativeWebRequirement(trimmed, config);
        recordAutoGrantedProviderOptions(config, runtime);
        persistAgentEvent(config, runtime, sessionPath, 'agent.started', {
          inputLength: trimmed.length,
          nativeWebSearchRequirement,
        });
        const result = await runAgentWithRetry(config, agentInput, {
          nativeWebSearchRequirement,
          onEvent: (e) => {
            if (!started) { started = true; loader.stop(); }
            renderer.handle(e);
            persistStreamEvent(config, runtime, sessionPath, e);
            if (e.type === 'tool_result') {
              started = false;
              loader.start();
            }
          },
        });
        loader.stop();
        renderer.endTurn();

        messages.push({ role: 'assistant', content: result.text });
        saveMessage(sessionPath, { role: 'assistant', content: result.text });

        const inT = result.usage?.inputTokens ?? 0;
        const outT = result.usage?.outputTokens ?? 0;
        cmdCtx.totalTokens.input += inT;
        cmdCtx.totalTokens.output += outT;
        persistAgentEvent(config, runtime, sessionPath, 'agent.completed', {
          ...usagePayload(result.usage ?? undefined),
          outputLength: result.text.length,
        });
        console.log(`\n${GRAY}  ${formatTokens(inT)} in · ${formatTokens(outT)} out${RESET}\n`);
      } catch (err: any) {
        loader.stop();
        renderer.endTurn();
        persistAgentEvent(config, runtime, sessionPath, 'agent.failed', {
          error: redactSecrets(err.message),
        }, 'error');
        console.log(`\n${YELLOW}  Error: ${redactSecrets(err.message)}${RESET}\n`);
      }
    }
  }

  if (demoLoaderMode) {
    runDemoLoader();
  } else if (demoMode) {
    runDemo();
  } else {
    loop();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const command = firstCommandArg(argv);

  if (command === 'tui' || command === undefined) {
    await runTui();
    return;
  }

  if (
    command === 'db'
    || command === 'football'
    || command === 'filters'
    || command === 'fixtures'
    || command === 'odds'
    || command === 'research'
    || command === 'score'
    || command === 'parlay'
    || command === 'validate'
    || command === 'run'
    || command === 'export'
    || command === 'artifacts'
    || command === 'leagues'
    || command === 'teams'
    || command === 'scan'
  ) {
    const config = loadConfig({}, { skipApiKey: true });
    ensureArtifactRoot(config);
    initSessionDir(config.sessionDir);
    const sessionPath = newSessionPath(config.sessionDir);
    const runtime = createRuntimeContext(config, sessionPath);
    process.exitCode = await runHeadless(argv, { config, runtime });
    return;
  }

  printHeadlessUsage();
  process.exitCode = 1;
}

main().catch((err: any) => {
  console.error(`${YELLOW}Error:${RESET} ${redactSecrets(err?.message ?? err)}`);
  process.exitCode = 1;
});
