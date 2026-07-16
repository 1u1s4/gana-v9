#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { resolveDiscordTarget } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';
import { buildCronOutcome, compactPath, emitCronRichSummary } from './gana-telegram-rich-output.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = process.env.GANA_ARTIFACT_ROOT?.trim() || '.artifacts/gana-v9';
const ARTIFACT_ROOT_PATH = resolve(REPO_ROOT, ARTIFACT_ROOT);

if (process.env.GANA_MAINTENANCE_PAUSED === 'true') {
  console.log('Gana daily operations are paused for database maintenance.');
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(-1);
const scope = args.scope ?? `strategy-${date}`;
const gatewayTarget = resolveDiscordTarget('strategy', { gatewayTarget: args.gatewayTarget });
const notify = args.notify !== 'false';
const runSlug = `strategy-review-${date}`;
const logPath = resolve(ARTIFACT_ROOT_PATH, 'cron', `${runSlug}.log`);
const outcomePath = resolve(ARTIFACT_ROOT_PATH, 'cron', `${runSlug}-outcome.json`);
const lockPath = resolve(ARTIFACT_ROOT_PATH, 'cron', 'locks', `${runSlug}.lock`);
const startedAt = new Date();
const runId = `${startedAt.toISOString()}-${process.pid}-${randomUUID()}`;
const initialLock = {
  schemaVersion: 1,
  flow: 'strategy-review',
  date,
  scope,
  status: 'running',
  phase: 'starting',
  runId,
  ownerPid: process.pid,
  childPid: null,
  startedAt: startedAt.toISOString(),
  updatedAt: startedAt.toISOString(),
};

mkdirSync(dirname(logPath), { recursive: true });
const lockGate = acquireStrategyLock(lockPath, initialLock);
if (!lockGate.acquired) {
  const existing = lockGate.existing;
  if (!readJsonFile(outcomePath)) {
    const recoveredStatus = existing?.status === 'published' || existing?.status === 'review-required'
      ? existing.status
      : 'skipped';
    writeOutcome({
      ...buildCronOutcome({
        flow: 'strategy-review',
        status: recoveredStatus,
        date,
        batchId: scope,
        reason: recoveredStatus === 'skipped' ? lockGate.reason : (existing?.reason ?? lockGate.reason),
        artifacts: [lockPath, outcomePath],
      }),
      scope,
      previousStatus: existing?.status,
      previousRunId: existing?.runId,
    });
  }
  emitCronRichSummary({
    title: 'Gana v9 · Strategy review omitido',
    status: 'skipped',
    date,
    timezone: TIMEZONE,
    bullets: [
      `Motivo: ${describeLockGate(lockGate)}`,
      `Lock: ${existing?.status ?? 'unknown'}${existing?.phase ? ` · ${existing.phase}` : ''}`,
      'Validación/métricas: no se recalculan; pertenecen al flujo canónico separado.',
      `Path: ${compactPath(lockPath)}`,
      `Outcome: ${compactPath(outcomePath)}`,
    ],
    footer: '⏭️ Sin duplicar review ni notificación; revisar el resultado terminal previo si aplica.',
  });
  process.exit(0);
}

if (lockGate.recoveredFromRunId) {
  updateOwnedLock(lockPath, runId, {
    recoveredFromRunId: lockGate.recoveredFromRunId,
    recoveredAt: new Date().toISOString(),
  });
}
writeOutcome({
  ...buildCronOutcome({
    flow: 'strategy-review',
    status: 'running',
    date,
    batchId: scope,
    startedAt,
    reason: lockGate.recoveredFromRunId ? 'recovered-dead-running-owner' : 'acquired',
    artifacts: [lockPath, logPath, outcomePath],
  }),
  scope,
  runId,
});

const env = {
  ...process.env,
  GANA_PROFILE: process.env.GANA_PROFILE ?? 'full-permissions',
  GANA_APPROVAL_MODE: process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
  GANA_TIMEZONE: process.env.GANA_TIMEZONE ?? TIMEZONE,
  AGENT_PROVIDER: 'codex',
  AGENT_MODEL: process.env.GANA_STRATEGY_REVIEW_MODEL ?? process.env.AGENT_MODEL ?? 'gpt-5.6-terra',
  AGENT_REASONING_EFFORT: process.env.GANA_STRATEGY_REVIEW_REASONING_EFFORT ?? process.env.AGENT_REASONING_EFFORT ?? 'high',
  AGENT_FAST_MODE: process.env.GANA_STRATEGY_REVIEW_FAST_MODE ?? 'false',
  AGENT_CODEX_FALLBACK_MODELS: process.env.GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS ?? '',
  AGENT_CODEX_SANDBOX: process.env.GANA_STRATEGY_REVIEW_CODEX_SANDBOX ?? process.env.AGENT_CODEX_SANDBOX ?? 'read-only',
};

const logFd = openSync(logPath, 'a');
try {
  const reviewArgs = [
    'gana',
    'strategy-review',
    '--date', date,
    '--scope', scope,
    '--agent', args.agent ?? 'true',
  ];
  if (args.doc) reviewArgs.push('--doc', args.doc);
  const review = await runLogged(logFd, reviewArgs, env, { lockPath, runId, phase: 'review' });
  const reviewArtifact = findLatest(['strategy-review.json'], startedAt.getTime());
  let notifyResult;
  if (notify && review.status === 0 && reviewArtifact) {
    notifyResult = await runLogged(logFd, [
      'node',
      '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-strategy-review.mjs',
      '--artifact', reviewArtifact,
      '--gateway-target', gatewayTarget,
    ], env, { lockPath, runId, phase: 'notify' });
  }

  const terminal = describeTerminalResult({ review, reviewArtifact, notify, notifyResult });
  const completedAt = new Date();
  const terminalLock = {
    ...initialLock,
    status: terminal.status,
    phase: 'completed',
    childPid: null,
    completedAt: completedAt.toISOString(),
    updatedAt: completedAt.toISOString(),
    reason: terminal.reason,
    reviewExit: review.status ?? null,
    reviewSignal: review.signal ?? null,
    notifyEnabled: notify,
    notifyExit: notifyResult?.status ?? null,
    notifySignal: notifyResult?.signal ?? null,
    reviewArtifact: reviewArtifact ?? null,
    gatewayTarget: notify ? gatewayTarget : null,
    ...(lockGate.recoveredFromRunId ? {
      recoveredFromRunId: lockGate.recoveredFromRunId,
      recoveredAt: startedAt.toISOString(),
    } : {}),
  };
  writeOwnedTerminalLock(lockPath, runId, terminalLock);
  writeOutcome({
    ...buildCronOutcome({
      flow: 'strategy-review',
      status: terminal.status,
      date,
      batchId: scope,
      startedAt,
      completedAt,
      command: review.command,
      exitStatus: terminal.exitCode,
      signal: review.signal ?? notifyResult?.signal,
      reason: terminal.reason,
      notifications: {
        strategy: notify ? (notifyResult?.status === 0 ? gatewayTarget : 'not-sent') : 'disabled',
      },
      artifacts: [reviewArtifact, logPath, lockPath, outcomePath].filter(Boolean),
    }),
    scope,
    runId,
    reviewExit: review.status ?? null,
    notifyEnabled: notify,
    notifyExit: notifyResult?.status ?? null,
  });
  emitCronRichSummary({
    title: terminal.status === 'published'
      ? 'Gana v9 · Strategy review publicado'
      : 'Gana v9 · Strategy review requiere revisión',
    status: terminal.status === 'published' ? 'ok' : 'warning',
    date,
    timezone: TIMEZONE,
    bullets: [
      'Validación/métricas: no se recalculan; pertenecen al flujo canónico separado.',
      `Review exit: ${review.status ?? 'unknown'}`,
      `Notify exit: ${notifyResult?.status ?? (notify ? 'not-run' : 'disabled')}`,
      `Resultado: ${terminal.status} · ${terminal.reason}`,
      `Modelo: ${env.AGENT_MODEL}`,
      `Reasoning: ${env.AGENT_REASONING_EFFORT}`,
      notify ? `Target: ${gatewayTarget}` : undefined,
      reviewArtifact ? `Review: ${compactPath(reviewArtifact)}` : undefined,
      `Lock: ${compactPath(lockPath)}`,
      `Outcome: ${compactPath(outcomePath)}`,
      `Log: ${compactPath(logPath)}`,
    ].filter(Boolean),
    footer: terminal.status === 'published'
      ? '🧠 Revisión estratégica lista para lectura humana.'
      : '⚠️ Resultado terminal; revisar logs antes de cualquier recuperación manual.',
  });
  process.exitCode = terminal.exitCode;
} finally {
  closeSync(logFd);
}

async function runLogged(logFd, args, env, { lockPath, runId, phase }) {
  const command = resolveCronCommand(args);
  writeLogLine(logFd, `started ${new Date().toISOString()} ${command.join(' ')}`);
  return await new Promise((resolvePromise) => {
    let settled = false;
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd: REPO_ROOT,
        env,
        stdio: ['ignore', logFd, logFd],
      });
    } catch (error) {
      writeLogLine(logFd, `error ${error instanceof Error ? error.message : String(error)}`);
      resolvePromise({ status: null, signal: null, error, command });
      return;
    }

    updateOwnedLock(lockPath, runId, {
      phase,
      childPid: Number.isInteger(child.pid) ? child.pid : null,
    });

    const settle = (status, signal, error) => {
      if (settled) return;
      settled = true;
      writeLogLine(logFd, `completed ${new Date().toISOString()} status=${status} signal=${signal ?? 'none'}`);
      if (error) writeLogLine(logFd, `error ${error instanceof Error ? error.message : String(error)}`);
      updateOwnedLock(lockPath, runId, {
        phase: `${phase}-completed`,
        childPid: null,
      });
      resolvePromise({ status, signal, error, command });
    };
    child.once('error', (error) => settle(null, null, error));
    child.once('close', (status, signal) => settle(status, signal, undefined));
  });
}

function resolveCronCommand(args) {
  if (args[0] !== 'gana') return args;
  const compiledCli = resolve(REPO_ROOT, 'dist', 'cli.js');
  if (existsSync(compiledCli)) return ['node', compiledCli, ...args.slice(1)];
  return ['node', '--import', 'tsx', 'src/cli.ts', ...args.slice(1)];
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') parsed.date = requireValue(argv, ++index, arg);
    else if (arg === '--scope') parsed.scope = requireValue(argv, ++index, arg);
    else if (arg === '--agent') parsed.agent = requireValue(argv, ++index, arg);
    else if (arg === '--doc') parsed.doc = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--notify') parsed.notify = requireValue(argv, ++index, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function describeTerminalResult({ review, reviewArtifact, notify, notifyResult }) {
  if (review.status !== 0) {
    return {
      status: 'review-required',
      reason: review.error ? 'strategy-review-command-error' : `strategy-review-exit-${review.status ?? 'unknown'}`,
      exitCode: positiveExitCode(review.status),
    };
  }
  if (!reviewArtifact) {
    return { status: 'review-required', reason: 'strategy-review-artifact-missing', exitCode: 1 };
  }
  if (notify && notifyResult?.status !== 0) {
    return {
      status: 'review-required',
      reason: notifyResult?.error ? 'strategy-review-notify-error' : `strategy-review-notify-exit-${notifyResult?.status ?? 'unknown'}`,
      exitCode: positiveExitCode(notifyResult?.status),
    };
  }
  return {
    status: 'published',
    reason: notify ? 'strategy-review-and-notification-completed' : 'strategy-review-completed-notification-disabled',
    exitCode: 0,
  };
}

function positiveExitCode(value) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function acquireStrategyLock(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  let recoveredFromRunId;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      try {
        writeSync(fd, `${JSON.stringify({
          ...payload,
          ...(recoveredFromRunId ? { recoveredFromRunId } : {}),
        }, null, 2)}\n`);
      } finally {
        closeSync(fd);
      }
      return { acquired: true, recoveredFromRunId };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    const existing = readJsonFile(path);
    if (!existing) return { acquired: false, reason: 'lock-unreadable-or-initializing', existing };
    if (existing.status === 'published' || existing.status === 'review-required') {
      return { acquired: false, reason: `already-${existing.status}`, existing };
    }
    if (existing.status !== 'running') {
      return { acquired: false, reason: `lock-status-${existing.status ?? 'unknown'}`, existing };
    }

    const ownerPids = [existing.ownerPid, existing.childPid]
      .filter((pid) => Number.isInteger(pid) && pid > 0);
    if (ownerPids.length === 0) {
      return { acquired: false, reason: 'running-owner-unknown', existing };
    }
    if (ownerPids.some(processIsAlive)) {
      return { acquired: false, reason: 'already-running', existing };
    }
    if (!reclaimDeadRunningLock(path, existing)) {
      continue;
    }
    recoveredFromRunId = existing.runId ?? `${existing.startedAt ?? 'unknown'}-${existing.ownerPid ?? 'unknown'}`;
  }
  return { acquired: false, reason: 'lock-race-lost', existing: readJsonFile(path) };
}

function reclaimDeadRunningLock(path, expected) {
  const quarantinePath = `${path}.stale-${process.pid}-${randomUUID()}`;
  try {
    renameSync(path, quarantinePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }

  const reclaimed = readJsonFile(quarantinePath);
  if (!sameRunningOwner(reclaimed, expected)) {
    try {
      renameSync(quarantinePath, path);
    } catch (error) {
      throw new Error(`Strategy review stale-lock quarantine could not be restored: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }

  rmSync(quarantinePath, { force: true });
  return true;
}

function sameRunningOwner(current, expected) {
  if (current?.status !== 'running' || expected?.status !== 'running') return false;
  if (current.runId || expected.runId) return current.runId === expected.runId;
  return current.startedAt === expected.startedAt
    && current.ownerPid === expected.ownerPid
    && current.childPid === expected.childPid;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function updateOwnedLock(path, runId, patch) {
  const current = readJsonFile(path);
  if (current?.runId !== runId || current.status !== 'running') return false;
  writeJsonAtomic(path, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

function writeOwnedTerminalLock(path, runId, payload) {
  const current = readJsonFile(path);
  if (current?.runId !== runId || current.status !== 'running') {
    throw new Error(`Strategy review lock ownership changed before terminal write: ${path}`);
  }
  writeJsonAtomic(path, payload);
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeJsonAtomic(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function writeOutcome(payload) {
  writeJsonAtomic(outcomePath, payload);
}

function describeLockGate(gate) {
  if (gate.reason === 'already-published') return 'review ya publicado';
  if (gate.reason === 'already-review-required') return 'corrida previa requiere revisión manual';
  if (gate.reason === 'already-running') return 'review sigue en curso';
  if (gate.reason === 'running-owner-unknown') return 'lock running sin dueño verificable';
  if (gate.reason === 'lock-unreadable-or-initializing') return 'lock en inicialización o ilegible';
  return gate.reason ?? 'lock activo';
}

function guatemalaDate(offsetDays) {
  const base = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function writeLogLine(fd, line) {
  if (!line) return;
  writeSync(fd, `${line}\n`);
}

function findLatest(names, sinceMs) {
  const runs = resolve(ARTIFACT_ROOT_PATH, 'runs');
  const matches = [];
  collect(runs, matches, new Set(names), sinceMs);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.path;
}

function collect(dir, matches, names, sinceMs) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) collect(path, matches, names, sinceMs);
    else if (entry.isFile() && names.has(entry.name)) {
      const mtimeMs = statSync(path).mtimeMs;
      if (mtimeMs >= sinceMs - 1000) matches.push({ path, mtimeMs });
    }
  }
}
