#!/usr/bin/env node
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, statSync, writeSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { resolveDiscordTargets } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = '.artifacts/gana-v9';

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(1);
const dailyBatchId = args.dailyBatchId ?? `daily-${date}-full`;
const discordTargets = resolveDiscordTargets({ gatewayTarget: args.gatewayTarget });
const providers = args.providers ?? process.env.GANA_DAILY_PROVIDERS ?? 'codex,gemini';
const codexModel = args.codexModel ?? process.env.GANA_DAILY_CODEX_MODEL;
const geminiModel = args.geminiModel ?? process.env.GANA_DAILY_GEMINI_MODEL;
const providerConcurrency = args.providerConcurrency ?? Number(process.env.GANA_DAILY_PROVIDER_CONCURRENCY ?? 2);
const parlayProfile = args.parlayProfile ?? process.env.GANA_PARLAY_PROFILE ?? 'portfolio-v2';
const webMode = args.web ?? process.env.GANA_WEB_MODE ?? 'live';
const notBefore = args.notBefore ?? process.env.GANA_DAILY_E2E_NOT_BEFORE ?? '10:15';
const retryDelayMs = positiveMinutes(process.env.GANA_DAILY_EMPTY_RETRY_MINUTES, 120) * 60 * 1000;
if (!Number.isInteger(providerConcurrency) || providerConcurrency < 1) {
  throw new Error('--provider-concurrency must be a positive integer.');
}
const logPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `${dailyBatchId}.log`);
const recommendationsPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs', dailyBatchId, 'daily-parlay-recommendations.json');
const lockPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', 'locks', `daily-e2e-${date}.lock`);

mkdirSync(dirname(logPath), { recursive: true });
if (!args.force && !hasReachedGuatemalaWallClock(notBefore)) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'daily-e2e not-before guard',
    date,
    dailyBatchId,
    notBefore,
    timezone: TIMEZONE,
    now: guatemalaTimeParts(),
  }, null, 2));
  process.exit(0);
}
let acquiredRunLock = false;
const existingRunLock = !args.force && existsSync(lockPath) ? readJsonFile(lockPath) : undefined;
if (!args.force) {
  acquiredRunLock = acquireOnce(lockPath, 20 * 60 * 60 * 1000, { date, dailyBatchId, status: 'running', startedAt: new Date().toISOString() });
}
if (!args.force && !acquiredRunLock) {
  const retryAfter = typeof existingRunLock?.retryAfter === 'string' ? existingRunLock.retryAfter : undefined;
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: retryAfter ? 'daily-e2e retry pending after empty or failed run' : 'daily-e2e already ran or is running for this date',
    date,
    dailyBatchId,
    lockPath,
    ...(retryAfter ? { retryAfter } : {}),
  }, null, 2));
  process.exit(0);
}
const startedAt = new Date();
const command = [
  'gana',
  'daily-e2e',
  '--date', date,
  '--providers', providers,
  '--provider-concurrency', String(providerConcurrency),
  '--threshold', String(args.threshold ?? 1.2),
  '--web', webMode,
  '--parlay-profile', parlayProfile,
  '--daily-batch-id', dailyBatchId,
];
if (codexModel) command.push('--codex-model', codexModel);
if (geminiModel) command.push('--gemini-model', geminiModel);

const env = {
  ...process.env,
  GANA_PROFILE: process.env.GANA_PROFILE ?? 'full-permissions',
  GANA_APPROVAL_MODE: process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
  AGENT_PROVIDER: process.env.AGENT_PROVIDER ?? 'codex',
  AGENT_CODEX_FALLBACK_MODELS: process.env.AGENT_CODEX_FALLBACK_MODELS ?? 'gpt-5.4-mini',
  AGENT_CODEX_SANDBOX: process.env.AGENT_CODEX_SANDBOX ?? 'danger-full-access',
  AGENT_NATIVE_WEB_SEARCH_MODE: process.env.AGENT_NATIVE_WEB_SEARCH_MODE ?? 'live',
  GANA_TIMEZONE: process.env.GANA_TIMEZONE ?? TIMEZONE,
  GANA_DAILY_PROVIDER_CONCURRENCY: process.env.GANA_DAILY_PROVIDER_CONCURRENCY ?? String(providerConcurrency),
  GANA_LOW_ODDS_THRESHOLD: process.env.GANA_LOW_ODDS_THRESHOLD ?? String(args.threshold ?? 1.2),
  GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES: process.env.GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES ?? process.env.GANA_CRON_LOW_ODDS_GLOBAL_MAX_FIXTURES ?? '10000',
  GANA_MAX_FIXTURES_PER_RUN: process.env.GANA_MAX_FIXTURES_PER_RUN ?? '10000',
  GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN: process.env.GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN ?? '10000',
  GANA_MAX_PROVIDER_REQUESTS_PER_RUN: process.env.GANA_MAX_PROVIDER_REQUESTS_PER_RUN ?? '10000',
};

const logFd = openSync(logPath, 'a');
let sentRecommendations = false;
try {
  let handled = false;
  writeLogLine(logFd, `started ${startedAt.toISOString()} ${command.join(' ')}`);
  const result = spawnSync('pnpm', command, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', logFd, logFd],
  });
  const completedAt = new Date();
  writeLogLine(logFd, `completed ${completedAt.toISOString()} status=${result.status} signal=${result.signal ?? 'none'}`);
  if (result.error) writeLogLine(logFd, `error ${result.error.message}`);

  const selectionCount = existsSync(recommendationsPath) ? recommendationSelectionCount(recommendationsPath) : 0;
  if (existsSync(recommendationsPath) && selectionCount > 0) {
    const notify = spawnSync('node', [
      '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs',
      '--artifact', recommendationsPath,
      '--transport', 'discord-native',
      '--gateway-target', discordTargets.recommendations,
      '--max', String(args.max ?? 14),
    ], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    writeLogLine(logFd, notify.stdout.trim());
    if (notify.stderr.trim()) writeLogLine(logFd, notify.stderr.trim());
    if (notify.status !== 0) throw new Error(`recommendation notification failed with exit ${notify.status}`);
    sentRecommendations = true;
    console.log(notify.stdout.trim());
    const councilNotify = spawnSync('node', [
      'scripts/gana-council-review-notify.mjs',
      '--artifact', recommendationsPath,
      '--transport', 'discord-native',
      '--gateway-target', discordTargets.council,
    ], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    writeLogLine(logFd, councilNotify.stdout.trim());
    if (councilNotify.stderr.trim()) writeLogLine(logFd, councilNotify.stderr.trim());
    if (councilNotify.status !== 0) throw new Error(`council notification failed with exit ${councilNotify.status}`);
    console.log(councilNotify.stdout.trim());
    if (result.status !== 0) {
      writeLogLine(logFd, `daily-e2e exited with status ${result.status} after producing recommendations; Discord notification sent`);
    }
    process.exitCode = 0;
    handled = true;
  }
  if (existsSync(recommendationsPath) && selectionCount === 0) {
    writeLogLine(logFd, `recommendations artifact contains zero selections; sending operational alert instead of empty Discord recommendations: ${recommendationsPath}`);
  }

  if (!handled) {
    const latest = existsSync(recommendationsPath) ? recommendationsPath : findLatestRecommendations(date);
    await sendStatus(discordTargets.alerts, {
      title: '⚠️ Gana v9 · Daily E2E requiere revisión',
      description: [
        `📅 ${date} · ${TIMEZONE}`,
        `🧪 batch ${dailyBatchId}`,
        `🧾 exit ${result.status ?? 'unknown'} · signal ${result.signal ?? 'none'}`,
        latest ? `📦 artifact ${latest}` : '📦 sin artifact de recomendaciones',
        '🛡️ Revisar logs antes de promoción.',
      ].join('\n'),
      color: 0xf2994a,
    });
    console.log(JSON.stringify({ ok: false, date, dailyBatchId, logPath, recommendationsPath: latest, status: result.status, signal: result.signal, discordTargets }, null, 2));
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (acquiredRunLock && !sentRecommendations) {
    const retryAfter = new Date(Date.now() + retryDelayMs).toISOString();
    writeRetryableLock(lockPath, {
      date,
      dailyBatchId,
      status: 'retryable',
      retryAfter,
      updatedAt: new Date().toISOString(),
      reason: 'daily-e2e produced no Discord recommendations',
    });
    writeLogLine(logFd, `daily-e2e lock marked retryable until ${retryAfter}`);
  }
  closeSync(logFd);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') parsed.date = requireValue(argv, ++index, arg);
    else if (arg === '--daily-batch-id') parsed.dailyBatchId = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--providers') parsed.providers = requireValue(argv, ++index, arg);
    else if (arg === '--codex-model') parsed.codexModel = requireValue(argv, ++index, arg);
    else if (arg === '--gemini-model') parsed.geminiModel = requireValue(argv, ++index, arg);
    else if (arg === '--threshold') parsed.threshold = Number(requireValue(argv, ++index, arg));
    else if (arg === '--provider-concurrency') parsed.providerConcurrency = Number(requireValue(argv, ++index, arg));
    else if (arg === '--parlay-profile') parsed.parlayProfile = requireValue(argv, ++index, arg);
    else if (arg === '--web') parsed.web = requireValue(argv, ++index, arg);
    else if (arg === '--not-before') parsed.notBefore = requireValue(argv, ++index, arg);
    else if (arg === '--max') parsed.max = Number(requireValue(argv, ++index, arg));
    else if (arg === '--force') parsed.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function acquireOnce(path, ttlMs, payload) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const lock = readJsonFile(path);
    if (typeof lock?.retryAfter === 'string') {
      const retryAtMs = Date.parse(lock.retryAfter);
      if (Number.isFinite(retryAtMs) && retryAtMs <= Date.now()) {
        rmSync(path, { force: true });
      } else {
        return false;
      }
    } else {
      const ageMs = Date.now() - statSync(path).mtimeMs;
      if (ageMs < ttlMs) return false;
      rmSync(path, { force: true });
    }
  }
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (err) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  }
  try {
    writeSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    closeSync(fd);
  }
  return true;
}

function writeRetryableLock(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function positiveMinutes(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
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

function hasReachedGuatemalaWallClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('--not-before must use HH:MM in America/Guatemala.');
  const current = guatemalaTimeParts();
  const requiredMinutes = (Number(match[1]) * 60) + Number(match[2]);
  const currentMinutes = (current.hour * 60) + current.minute;
  return currentMinutes >= requiredMinutes;
}

function guatemalaTimeParts() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
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

function recommendationSelectionCount(path) {
  try {
    const artifact = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(artifact.recommendations)) return artifact.recommendations.length;
    if (Array.isArray(artifact.selections)) return artifact.selections.length;
    return 0;
  } catch {
    return 0;
  }
}

function findLatestRecommendations(date) {
  const runs = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs');
  const matches = [];
  collect(runs, matches, date);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.path;
}

function collect(dir, matches, date) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, matches, date);
    else if (entry.isFile() && entry.name === 'daily-parlay-recommendations.json' && path.includes(date)) {
      matches.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
}

async function sendStatus(target, embed) {
  return sendDiscordNativePayload(target, {
    username: 'Gana Hermes',
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [embed],
  });
}
