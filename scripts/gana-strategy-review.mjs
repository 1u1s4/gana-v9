#!/usr/bin/env node
import { mkdirSync, openSync, closeSync, readdirSync, statSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveDiscordTarget } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = '.artifacts/gana-v9';

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(-1);
const scope = args.scope ?? `strategy-${date}`;
const gatewayTarget = resolveDiscordTarget('strategy', { gatewayTarget: args.gatewayTarget });
const notify = args.notify !== 'false';
const logPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `strategy-review-${date}.log`);

mkdirSync(dirname(logPath), { recursive: true });

const env = {
  ...process.env,
  GANA_PROFILE: process.env.GANA_PROFILE ?? 'full-permissions',
  GANA_APPROVAL_MODE: process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
  GANA_TIMEZONE: process.env.GANA_TIMEZONE ?? TIMEZONE,
  AGENT_PROVIDER: 'codex',
  AGENT_MODEL: process.env.GANA_STRATEGY_REVIEW_MODEL ?? process.env.AGENT_MODEL ?? 'gpt-5.5',
  AGENT_REASONING_EFFORT: process.env.GANA_STRATEGY_REVIEW_REASONING_EFFORT ?? process.env.AGENT_REASONING_EFFORT ?? 'xhigh',
  AGENT_CODEX_SANDBOX: process.env.GANA_STRATEGY_REVIEW_CODEX_SANDBOX ?? process.env.AGENT_CODEX_SANDBOX ?? 'read-only',
};

const logFd = openSync(logPath, 'a');
const startedAt = Date.now();
try {
  const validation = runLogged(logFd, ['gana', 'validate', '--date', date], env);
  const metrics = runLogged(logFd, ['gana', 'metrics', 'daily', '--date', date, '--scope', `daily-${date}`], env);
  const reviewArgs = [
    'gana',
    'strategy-review',
    '--date', date,
    '--scope', scope,
    '--agent', args.agent ?? 'true',
  ];
  if (args.doc) reviewArgs.push('--doc', args.doc);
  const review = runLogged(logFd, reviewArgs, env);
  const reviewArtifact = findLatest(['strategy-review.json'], startedAt);
  let notifyResult;
  if (notify && review.status === 0 && reviewArtifact) {
    notifyResult = runLogged(logFd, [
      'exec', 'node',
      '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-strategy-review.mjs',
      '--artifact', reviewArtifact,
      '--gateway-target', gatewayTarget,
    ], env);
  }
  const ok = review.status === 0;
  console.log(JSON.stringify({
    ok,
    date,
    logPath,
    reviewArtifact,
    validationStatus: validation.status,
    metricsStatus: metrics.status,
    reviewStatus: review.status,
    notifyStatus: notifyResult?.status,
    gatewayTarget,
    model: env.AGENT_MODEL,
    reasoningEffort: env.AGENT_REASONING_EFFORT,
  }, null, 2));
  process.exitCode = ok && (!notify || notifyResult?.status === 0) ? 0 : notifyResult?.status ?? review.status ?? 1;
} finally {
  closeSync(logFd);
}

function runLogged(logFd, args, env) {
  writeLogLine(logFd, `started ${new Date().toISOString()} pnpm ${args.join(' ')}`);
  const result = spawnSync('pnpm', args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', logFd, logFd],
  });
  writeLogLine(logFd, `completed ${new Date().toISOString()} status=${result.status} signal=${result.signal ?? 'none'}`);
  if (result.error) writeLogLine(logFd, `error ${result.error.message}`);
  return result;
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
  const runs = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs');
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
