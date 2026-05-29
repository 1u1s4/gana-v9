#!/usr/bin/env node
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, statSync, writeSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { resolveDiscordTargets } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = '.artifacts/gana-v9';

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(-1);
const discordTargets = resolveDiscordTargets({ gatewayTarget: args.gatewayTarget });
const runSlug = `validation-${date}`;
const logPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `${runSlug}.log`);
const lockPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', 'locks', `${runSlug}.lock`);

mkdirSync(dirname(logPath), { recursive: true });
if (!args.force && !acquireOnce(lockPath, 20 * 60 * 60 * 1000, { date, runSlug, startedAt: new Date().toISOString() })) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'validation already ran or is running for this date', date, lockPath }, null, 2));
  process.exit(0);
}
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
  const recommendationArtifact = args.recommendationArtifact ?? findLatestRecommendation(date);
  const validationArgs = ['gana', 'validate', '--date', date];
  const metricsArgs = ['gana', 'metrics', 'daily', '--date', date, '--scope', args.scope ?? `daily-${date}`];
  const metricsPersist = args.persist ?? process.env.GANA_METRICS_PERSIST;
  if (metricsPersist !== undefined) metricsArgs.push('--persist', String(metricsPersist));
  if (recommendationArtifact) {
    validationArgs.push('--recommendation-artifact', recommendationArtifact);
    metricsArgs.push('--recommendation-artifact', recommendationArtifact);
  }
  const validation = runLogged(logFd, validationArgs, env);
  const metrics = runLogged(logFd, metricsArgs, env);
  const validationsArtifact = findLatest(['validations.json', 'validations-blocked.json'], startedAt);
  const metricsArtifact = findLatest(['daily-metrics.json'], startedAt);

  if (metrics.status === 0 && metricsArtifact) {
    const notifyArgs = [
      '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs',
      '--date', date,
      '--metrics-artifact', metricsArtifact,
      '--transport', 'discord-native',
      '--gateway-target', discordTargets.validation,
    ];
    if (validationsArtifact) notifyArgs.push('--validation-artifact', validationsArtifact);
    if (recommendationArtifact) notifyArgs.push('--recommendation-artifact', recommendationArtifact);
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
    if (recommendationArtifact && validationsArtifact) {
      const feedback = spawnSync('node', [
        'scripts/gana-council-feedback.mjs',
        '--recommendation-artifact', recommendationArtifact,
        '--validation-artifact', validationsArtifact,
        '--transport', 'discord-native',
        '--gateway-target', discordTargets.feedback,
      ], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      writeLogLine(logFd, feedback.stdout.trim());
      if (feedback.stderr.trim()) writeLogLine(logFd, feedback.stderr.trim());
      if (feedback.status !== 0) throw new Error(`council feedback failed with exit ${feedback.status}`);
      console.log(feedback.stdout.trim());
    }
    process.exitCode = validation.status === 0 ? 0 : validation.status ?? 1;
    handled = true;
  }

  if (!handled) {
    await sendDiscordNativePayload(discordTargets.alerts, {
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
    console.log(JSON.stringify({ ok: false, date, logPath, validationsArtifact, metricsArtifact, validationStatus: validation.status, metricsStatus: metrics.status, discordTargets }, null, 2));
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
    else if (arg === '--recommendation-artifact') parsed.recommendationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--persist') parsed.persist = requireValue(argv, ++index, arg);
    else if (arg === '--force') parsed.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function acquireOnce(path, ttlMs, payload) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const ageMs = Date.now() - statSync(path).mtimeMs;
    if (ageMs < ttlMs) return false;
    rmSync(path, { force: true });
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

function findLatestRecommendation(date) {
  const runs = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs');
  const matches = [];
  collectRecommendations(runs, matches, date);
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

function collectRecommendations(dir, matches, date) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectRecommendations(path, matches, date);
    else if (entry.isFile() && entry.name === 'daily-parlay-recommendations.json' && path.includes(date)) {
      matches.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
}
