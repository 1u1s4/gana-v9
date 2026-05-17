#!/usr/bin/env node
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_TARGET = 'discord:1494071165453467721';
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = '.artifacts/gana-v9';

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(0);
const dailyBatchId = args.dailyBatchId ?? `daily-${date}-full`;
const gatewayTarget = args.gatewayTarget ?? process.env.GANA_DISCORD_TARGET ?? DEFAULT_TARGET;
const logPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `${dailyBatchId}.log`);
const recommendationsPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs', dailyBatchId, 'daily-parlay-recommendations.json');

mkdirSync(dirname(logPath), { recursive: true });
const startedAt = new Date();
const command = [
  'gana',
  'daily-e2e',
  '--date', date,
  '--providers', 'codex,gemini',
  '--threshold', String(args.threshold ?? 1.2),
  '--web', 'live',
  '--parlay-profile', args.parlayProfile ?? 'portfolio-v2',
  '--daily-batch-id', dailyBatchId,
];

const env = {
  ...process.env,
  GANA_PROFILE: process.env.GANA_PROFILE ?? 'full-permissions',
  GANA_APPROVAL_MODE: process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
  AGENT_PROVIDER: process.env.AGENT_PROVIDER ?? 'codex',
  AGENT_NATIVE_WEB_SEARCH_MODE: process.env.AGENT_NATIVE_WEB_SEARCH_MODE ?? 'live',
  GANA_TIMEZONE: process.env.GANA_TIMEZONE ?? TIMEZONE,
  GANA_LOW_ODDS_THRESHOLD: process.env.GANA_LOW_ODDS_THRESHOLD ?? String(args.threshold ?? 1.2),
  GANA_MAX_FIXTURES_PER_RUN: process.env.GANA_MAX_FIXTURES_PER_RUN ?? '10000',
  GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN: process.env.GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN ?? '10000',
  GANA_MAX_PROVIDER_REQUESTS_PER_RUN: process.env.GANA_MAX_PROVIDER_REQUESTS_PER_RUN ?? '10000',
};

const logFd = openSync(logPath, 'a');
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

  if (existsSync(recommendationsPath)) {
    const notify = spawnSync('node', [
      '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs',
      '--artifact', recommendationsPath,
      '--transport', 'discord-native',
      '--gateway-target', gatewayTarget,
      '--max', String(args.max ?? 8),
    ], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    writeLogLine(logFd, notify.stdout.trim());
    if (notify.stderr.trim()) writeLogLine(logFd, notify.stderr.trim());
    if (notify.status !== 0) throw new Error(`recommendation notification failed with exit ${notify.status}`);
    console.log(notify.stdout.trim());
    if (result.status !== 0) {
      writeLogLine(logFd, `daily-e2e exited with status ${result.status} after producing recommendations; Discord notification sent`);
    }
    process.exitCode = 0;
    handled = true;
  }

  if (!handled) {
    const latest = existsSync(recommendationsPath) ? recommendationsPath : findLatestRecommendations(date);
    await sendStatus(gatewayTarget, {
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
    console.log(JSON.stringify({ ok: false, date, dailyBatchId, logPath, recommendationsPath: latest, status: result.status, signal: result.signal }, null, 2));
    process.exitCode = result.status ?? 1;
  }
} finally {
  closeSync(logFd);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') parsed.date = requireValue(argv, ++index, arg);
    else if (arg === '--daily-batch-id') parsed.dailyBatchId = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--threshold') parsed.threshold = Number(requireValue(argv, ++index, arg));
    else if (arg === '--parlay-profile') parsed.parlayProfile = requireValue(argv, ++index, arg);
    else if (arg === '--max') parsed.max = Number(requireValue(argv, ++index, arg));
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
