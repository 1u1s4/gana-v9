#!/usr/bin/env node
import { mkdirSync, openSync, closeSync, readdirSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_TARGET = 'discord:1494071165453467721';
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = '.artifacts/gana-v9';

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(-1);
const gatewayTarget = args.gatewayTarget ?? process.env.GANA_DISCORD_TARGET ?? DEFAULT_TARGET;
const runSlug = `validation-${date}`;
const logPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `${runSlug}.log`);

mkdirSync(dirname(logPath), { recursive: true });
const startedAt = Date.now();
const env = {
  ...process.env,
  GANA_PROFILE: process.env.GANA_PROFILE ?? 'full-permissions',
  GANA_APPROVAL_MODE: process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
  AGENT_PROVIDER: process.env.AGENT_PROVIDER ?? 'codex',
  GANA_TIMEZONE: process.env.GANA_TIMEZONE ?? TIMEZONE,
};

const logFd = openSync(logPath, 'a');
try {
  let handled = false;
  const validation = runLogged(logFd, ['gana', 'validate', '--date', date], env);
  const metrics = runLogged(logFd, ['gana', 'metrics', 'daily', '--date', date, '--scope', args.scope ?? `daily-${date}`], env);
  const validationsArtifact = findLatest(['validations.json', 'validations-blocked.json'], startedAt);
  const metricsArtifact = findLatest(['daily-metrics.json'], startedAt);

  if (metrics.status === 0 && metricsArtifact) {
    const notifyArgs = [
      '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-validation-stats.mjs',
      '--metrics-artifact', metricsArtifact,
      '--transport', 'discord-native',
      '--gateway-target', gatewayTarget,
    ];
    if (validationsArtifact) notifyArgs.push('--validations-artifact', validationsArtifact);
    const notify = spawnSync('node', notifyArgs, {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    writeLogLine(logFd, notify.stdout.trim());
    if (notify.stderr.trim()) writeLogLine(logFd, notify.stderr.trim());
    if (notify.status !== 0) throw new Error(`validation notification failed with exit ${notify.status}`);
    console.log(notify.stdout.trim());
    process.exitCode = validation.status === 0 ? 0 : validation.status ?? 1;
    handled = true;
  }

  if (!handled) {
    await sendDiscordNativePayload(gatewayTarget, {
      username: 'Gana Hermes',
      allowed_mentions: { parse: [] },
      content: '',
      embeds: [{
        title: '⚠️ Gana v9 · Validaciones requieren revisión',
        description: [
          `📅 ${date} · ${TIMEZONE}`,
          `🧪 validate exit ${validation.status ?? 'unknown'}`,
          `📊 metrics exit ${metrics.status ?? 'unknown'}`,
          metricsArtifact ? `📈 metrics ${metricsArtifact}` : '📈 sin artifact de métricas',
          '🛡️ Revisar logs antes de ajustar promoción.',
        ].join('\n'),
        color: 0xf2994a,
      }],
    });
    console.log(JSON.stringify({ ok: false, date, logPath, validationsArtifact, metricsArtifact, validationStatus: validation.status, metricsStatus: metrics.status }, null, 2));
    process.exitCode = metrics.status ?? validation.status ?? 1;
  }
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
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--scope') parsed.scope = requireValue(argv, ++index, arg);
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
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, matches, names, sinceMs);
    else if (entry.isFile() && names.has(entry.name)) {
      const mtimeMs = statSync(path).mtimeMs;
      if (mtimeMs >= sinceMs - 1000) matches.push({ path, mtimeMs });
    }
  }
}
