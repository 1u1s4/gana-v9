#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  sendDiscordNativePayload,
  sendDiscordPayload,
  sendHermesGatewayMessage,
} from './notify-discord-recommendations.mjs';

const DEFAULT_ARTIFACT_ROOT = '.artifacts/gana-v9/runs';
const DEFAULT_TRANSPORT = 'discord-native';
const DEFAULT_GATEWAY_TARGET = 'discord';
const DEFAULT_HERMES_PYTHON = '/Users/luisalvarado/.hermes/hermes-agent/venv/bin/python3';
const DEFAULT_TIMEZONE = 'America/Guatemala';
const DISCORD_DESCRIPTION_LIMIT = 4096;

export function parseArgs(argv) {
  const args = {
    metricsArtifact: undefined,
    validationArtifact: undefined,
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    date: undefined,
    previousDay: false,
    timezone: DEFAULT_TIMEZONE,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    transport: DEFAULT_TRANSPORT,
    gatewayTarget: DEFAULT_GATEWAY_TARGET,
    hermesPython: process.env.HERMES_GATEWAY_PYTHON || DEFAULT_HERMES_PYTHON,
    dryRun: false,
    username: 'Gana Hermes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--metrics-artifact' || arg === '--artifact') args.metricsArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--validation-artifact') args.validationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--artifact-root') args.artifactRoot = requireValue(argv, ++index, arg);
    else if (arg === '--date') args.date = requireIsoDate(requireValue(argv, ++index, arg), arg);
    else if (arg === '--previous-day') args.previousDay = true;
    else if (arg === '--timezone') args.timezone = requireValue(argv, ++index, arg);
    else if (arg === '--webhook-url') args.webhookUrl = requireValue(argv, ++index, arg);
    else if (arg === '--transport') args.transport = parseTransport(requireValue(argv, ++index, arg));
    else if (arg === '--gateway-target') args.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--hermes-python') args.hermesPython = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--username') args.username = requireValue(argv, ++index, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.previousDay && args.date) throw new Error('Use either --date or --previous-day, not both.');
  if (args.previousDay) args.date = dateInTimezone(addDays(new Date(), -1), args.timezone);
  return args;
}

export function resolveMetricsArtifactPath(options) {
  if (options.metricsArtifact) return resolve(options.metricsArtifact);
  return findLatestMetricsArtifact(options.artifactRoot, options.date);
}

export function resolveValidationArtifactPath(options) {
  if (options.validationArtifact) return resolve(options.validationArtifact);
  return findLatestValidationArtifact(options.artifactRoot, options.date);
}

export function findLatestMetricsArtifact(root = DEFAULT_ARTIFACT_ROOT, date) {
  const matches = collectArtifacts(root, 'daily-metrics.json')
    .filter((match) => !date || artifactMatchesDate(match.path, date, 'metrics'));
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  if (!matches.length) {
    const suffix = date ? ` for ${date}` : '';
    throw new Error(`No daily-metrics.json artifacts found under ${resolve(root)}${suffix}`);
  }
  return matches[0].path;
}

export function findLatestValidationArtifact(root = DEFAULT_ARTIFACT_ROOT, date) {
  const matches = [
    ...collectArtifacts(root, 'validations.json'),
    ...collectArtifacts(root, 'validations-blocked.json'),
  ].filter((match) => !date || artifactMatchesDate(match.path, date, 'validation'));
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  return matches[0]?.path;
}

export function loadDailyStats(metricsPath, validationPath) {
  const metricsArtifact = readJson(metricsPath);
  const validationArtifact = validationPath ? readJson(validationPath) : undefined;
  return { metricsArtifact, validationArtifact };
}

export function buildDiscordPayload(metricsArtifact, options = {}) {
  const snapshot = selectMetricSnapshot(metricsArtifact, options.date);
  const validationArtifact = options.validationArtifact;
  const validationCount = Array.isArray(validationArtifact?.validations) ? validationArtifact.validations.length : undefined;
  const gateVerdict = validationArtifact?.gateResult?.verdict;
  const embeds = [
    {
      title: '📊 Gana v9 · Validación diaria',
      description: [
        `📅 ${snapshot.metricDate} · ${snapshot.timezone || options.timezone || DEFAULT_TIMEZONE}`,
        `✅ ${totalSettled(snapshot)} resueltas · ⏳ ${totalPending(snapshot)} pendientes · ⚪ ${totalUnvalidated(snapshot)} sin validar`,
        '⚠️ Tracking analítico · Sin ejecución monetaria',
      ].join('\n'),
      color: headerColor(snapshot),
      footer: { text: 'Gana Hermes · Discord native embeds' },
      timestamp: new Date().toISOString(),
    },
    metricEmbed('🎯 Predicciones', snapshot.predictionMetrics, {
      topTitle: '🤖 Providers',
      topBuckets: snapshot.predictionMetrics?.byProvider,
      edge: true,
      color: 0x2f80ed,
    }),
    metricEmbed('🧩 Parlays', snapshot.parlayMetrics, {
      topTitle: '🧪 Perfiles',
      topBuckets: snapshot.parlayMetrics?.byProfile,
      edge: false,
      color: 0x9b51e0,
    }),
    {
      title: '🛡️ Control',
      description: truncate([
        gateVerdict ? `> Gate: ${gateVerdict}` : undefined,
        validationCount !== undefined ? `> Validaciones del artifact: ${validationCount}` : undefined,
        `> Scope: ${snapshot.scope || metricsArtifact.scope || 'daily'}`,
        '> Revisión manual requerida antes de promover conclusiones.',
      ].filter(Boolean).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: 0x56ccf2,
    },
  ];

  return {
    username: stringOrFallback(options.username, 'Gana Hermes'),
    allowed_mentions: { parse: [] },
    content: '',
    embeds,
  };
}

export function buildGatewayMessage(metricsArtifact, options = {}) {
  const snapshot = selectMetricSnapshot(metricsArtifact, options.date);
  const validationArtifact = options.validationArtifact;
  const validationCount = Array.isArray(validationArtifact?.validations) ? validationArtifact.validations.length : undefined;
  const gateVerdict = validationArtifact?.gateResult?.verdict;
  return [
    '📊 Gana v9 · Validación diaria',
    '',
    `📅 ${snapshot.metricDate} · ${snapshot.timezone || options.timezone || DEFAULT_TIMEZONE}`,
    `✅ ${totalSettled(snapshot)} resueltas · ⏳ ${totalPending(snapshot)} pendientes · ⚪ ${totalUnvalidated(snapshot)} sin validar`,
    '⚠️ Tracking analítico · Sin ejecución monetaria',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    ...formatMetricLines('🎯 Predicciones', snapshot.predictionMetrics, snapshot.predictionMetrics?.byProvider, true),
    ...formatMetricLines('🧩 Parlays', snapshot.parlayMetrics, snapshot.parlayMetrics?.byProfile, false),
    '━━━━━━━━━━━━━━━━━━',
    '',
    gateVerdict ? `🛡️ Gate: ${gateVerdict}` : undefined,
    validationCount !== undefined ? `📌 Validaciones del artifact: ${validationCount}` : undefined,
    `📁 Scope: ${snapshot.scope || metricsArtifact.scope || 'daily'}`,
    '🛡️ Revisión manual requerida antes de promover conclusiones.',
  ].filter((line) => line !== undefined).join('\n');
}

export async function runDailyStatsNotification(options) {
  const metricsPath = resolveMetricsArtifactPath(options);
  const validationPath = resolveValidationArtifactPath(options);
  const { metricsArtifact, validationArtifact } = loadDailyStats(metricsPath, validationPath);
  const payload = buildDiscordPayload(metricsArtifact, { ...options, validationArtifact });
  const gatewayMessage = buildGatewayMessage(metricsArtifact, { ...options, validationArtifact });
  const snapshot = selectMetricSnapshot(metricsArtifact, options.date);

  if (options.dryRun) {
    return {
      dryRun: true,
      metricsPath,
      validationPath,
      metricDate: snapshot.metricDate,
      transport: options.transport,
      gatewayTarget: options.gatewayTarget,
      payload,
      gatewayMessage,
    };
  }

  if (options.transport === 'hermes-gateway') {
    const gatewayResult = sendHermesGatewayMessage(options.gatewayTarget, gatewayMessage, { hermesPython: options.hermesPython });
    return { metricsPath, validationPath, metricDate: snapshot.metricDate, transport: options.transport, gatewayTarget: options.gatewayTarget, gatewayResult };
  }

  if (options.transport === 'discord-native') {
    const discordResult = sendDiscordNativePayload(options.gatewayTarget, payload, { hermesPython: options.hermesPython });
    return { metricsPath, validationPath, metricDate: snapshot.metricDate, transport: options.transport, gatewayTarget: options.gatewayTarget, discordResult };
  }

  const discordStatus = await sendDiscordPayload(options.webhookUrl, payload);
  return { metricsPath, validationPath, metricDate: snapshot.metricDate, transport: options.transport, discordStatus: discordStatus.status };
}

function collectArtifacts(root, fileName) {
  const matches = [];
  collectArtifactsInDir(resolve(root), fileName, matches);
  return matches;
}

function collectArtifactsInDir(dir, fileName, matches) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectArtifactsInDir(path, fileName, matches);
    else if (entry.isFile() && basename(path) === fileName) matches.push({ path, mtimeMs: statSync(path).mtimeMs });
  }
}

function artifactMatchesDate(path, date, kind) {
  try {
    const artifact = readJson(path);
    if (kind === 'metrics') {
      return artifact.date === date || (Array.isArray(artifact.metrics) && artifact.metrics.some((snapshot) => snapshot?.metricDate === date));
    }
    return artifact.target?.date === date || artifact.date === date;
  } catch {
    return false;
  }
}

function selectMetricSnapshot(artifact, date) {
  if (Array.isArray(artifact?.metrics) && artifact.metrics.length) {
    const snapshot = date
      ? artifact.metrics.find((item) => item?.metricDate === date)
      : artifact.metrics[0];
    if (snapshot) return snapshot;
  }
  if (artifact?.metricDate) return artifact;
  throw new Error('daily-metrics artifact does not contain a metric snapshot.');
}

function metricEmbed(title, metrics, options) {
  return {
    title,
    description: truncate(formatMetricDescription(metrics, options.topTitle, options.topBuckets, options.edge), DISCORD_DESCRIPTION_LIMIT),
    color: options.color,
  };
}

function formatMetricDescription(metrics, topTitle, topBuckets, includeEdge) {
  if (!metrics) return '> Sin datos.';
  const lines = [
    `> ✅ ${num(metrics.won)} · ❌ ${num(metrics.lost)} · ➖ ${num(metrics.voided)} · ⏳ ${num(metrics.pending)} · 🚫 ${num(metrics.blocked)} · ⚪ ${num(metrics.unvalidated)}`,
    `> 📌 Total ${num(metrics.total)} · 📈 Hit ${formatHitRate(metrics.hitRate)} · 🎲 Odds ${formatNumber(metrics.avgOdds, 3)} · 🧠 Conf ${formatConfidence(metrics.avgConfidence)}${includeEdge ? ` · 📊 Edge ${formatSignedPercent(metrics.avgEdge)}` : ''}`,
  ];
  const bucketLines = formatBucketLines(topTitle, topBuckets);
  if (bucketLines.length) lines.push(...bucketLines);
  return lines.join('\n');
}

function formatMetricLines(title, metrics, buckets, includeEdge) {
  return [
    title,
    formatMetricDescription(metrics, '', buckets, includeEdge),
    '',
  ];
}

function formatBucketLines(title, buckets) {
  if (!Array.isArray(buckets) || !buckets.length) return [];
  const lines = title ? [`> ${title}:`] : [];
  for (const bucket of buckets.slice(0, 3)) {
    lines.push(`> • ${bucket.label || bucket.key}: ${num(bucket.total)} total · ${bucket.won}-${bucket.lost} · hit ${formatHitRate(bucket.hitRate)}`);
  }
  return lines;
}

function totalSettled(snapshot) {
  return num(snapshot.predictionMetrics?.settled) + num(snapshot.parlayMetrics?.settled);
}

function totalPending(snapshot) {
  return num(snapshot.predictionMetrics?.pending) + num(snapshot.parlayMetrics?.pending);
}

function totalUnvalidated(snapshot) {
  return num(snapshot.predictionMetrics?.unvalidated) + num(snapshot.parlayMetrics?.unvalidated);
}

function headerColor(snapshot) {
  if (totalSettled(snapshot) > 0) return 0x27ae60;
  if (totalPending(snapshot) > 0) return 0xf2c94c;
  return 0x828282;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function requireIsoDate(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${flag} requires YYYY-MM-DD.`);
  return value;
}

function parseTransport(value) {
  if (value === 'discord-native' || value === 'hermes-gateway' || value === 'webhook') return value;
  throw new Error('--transport must be "discord-native", "hermes-gateway", or "webhook".');
}

function num(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatHitRate(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)}%` : 'n/a';
}

function formatConfidence(value) {
  return Number.isFinite(value) ? `${formatNumber(value * 100, 2)}%` : 'n/a';
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value * 100, 2)}%`;
}

function formatNumber(value, digits) {
  return Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.?0+$/, '') : 'n/a';
}

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function truncate(value, limit) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function usage() {
  return [
    'Usage:',
    '  notify-discord-daily-stats.mjs --date YYYY-MM-DD [--artifact-root .artifacts/gana-v9/runs] [--dry-run]',
    '  notify-discord-daily-stats.mjs --previous-day --transport discord-native --gateway-target discord:CHANNEL_ID',
    '  notify-discord-daily-stats.mjs --metrics-artifact PATH [--validation-artifact PATH] [--dry-run]',
    '',
    'Environment:',
    '  HERMES_GATEWAY_PYTHON may override the Python used for Hermes gateway delivery.',
    '  DISCORD_WEBHOOK_URL is required only for --transport webhook.',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await runDailyStatsNotification(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
