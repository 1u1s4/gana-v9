#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  formatCompactLeg,
  formatExposurePercent,
  formatMetricNumber,
  formatPercent,
  rankEmoji,
  recommendationCounts,
  recommendationKind,
  recommendationTitle,
  selectRecommendations,
  sendDiscordNativePayload,
  sendDiscordPayload,
  sendHermesGatewayMessage,
} from './notify-discord-recommendations.mjs';

const DEFAULT_ARTIFACT_ROOT = '.artifacts/gana-v9/runs';
const DEFAULT_TRANSPORT = 'discord-native';
const DEFAULT_GATEWAY_TARGET = 'discord';
const DEFAULT_HERMES_PYTHON = '/Users/luisalvarado/.hermes/hermes-agent/venv/bin/python3';
const DEFAULT_TIMEZONE = 'America/Guatemala';
const DEFAULT_MAX_RECOMMENDATIONS = 8;
const DISCORD_DESCRIPTION_LIMIT = 4096;

export function parseArgs(argv) {
  const args = {
    metricsArtifact: undefined,
    validationArtifact: undefined,
    recommendationArtifact: undefined,
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    date: undefined,
    previousDay: false,
    timezone: DEFAULT_TIMEZONE,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    transport: DEFAULT_TRANSPORT,
    gatewayTarget: DEFAULT_GATEWAY_TARGET,
    hermesPython: process.env.HERMES_GATEWAY_PYTHON || DEFAULT_HERMES_PYTHON,
    dryRun: false,
    includeRecommendationMirror: true,
    maxRecommendations: DEFAULT_MAX_RECOMMENDATIONS,
    testLabel: undefined,
    username: 'Gana Hermes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--metrics-artifact' || arg === '--artifact') args.metricsArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--validation-artifact') args.validationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--recommendation-artifact') args.recommendationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--artifact-root') args.artifactRoot = requireValue(argv, ++index, arg);
    else if (arg === '--date') args.date = requireIsoDate(requireValue(argv, ++index, arg), arg);
    else if (arg === '--previous-day') args.previousDay = true;
    else if (arg === '--timezone') args.timezone = requireValue(argv, ++index, arg);
    else if (arg === '--webhook-url') args.webhookUrl = requireValue(argv, ++index, arg);
    else if (arg === '--transport') args.transport = parseTransport(requireValue(argv, ++index, arg));
    else if (arg === '--gateway-target') args.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--hermes-python') args.hermesPython = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-recommendation-mirror') args.includeRecommendationMirror = false;
    else if (arg === '--max-recommendations') args.maxRecommendations = parseMaxRecommendations(requireValue(argv, ++index, arg));
    else if (arg === '--test-label') args.testLabel = requireValue(argv, ++index, arg);
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

export function resolveRecommendationArtifactPath(options) {
  if (options.includeRecommendationMirror === false) return undefined;
  if (options.recommendationArtifact) return resolve(options.recommendationArtifact);
  return findLatestRecommendationArtifact(options.artifactRoot, options.date);
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

export function findLatestRecommendationArtifact(root = DEFAULT_ARTIFACT_ROOT, date) {
  const matches = collectArtifacts(root, 'daily-parlay-recommendations.json')
    .filter((match) => !date || artifactMatchesDate(match.path, date, 'recommendation'));
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  return matches[0]?.path;
}

export function loadDailyStats(metricsPath, validationPath, recommendationPath) {
  const metricsArtifact = readJson(metricsPath);
  const validationArtifact = validationPath ? readJson(validationPath) : undefined;
  const recommendationArtifact = recommendationPath ? readJson(recommendationPath) : undefined;
  return { metricsArtifact, validationArtifact, recommendationArtifact };
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
        options.testLabel ? `🧪 ${options.testLabel}` : undefined,
        `📅 ${snapshot.metricDate} · ${snapshot.timezone || options.timezone || DEFAULT_TIMEZONE}`,
        `✅ ${totalSettled(snapshot)} resueltas · ⏳ ${totalPending(snapshot)} pendientes · ⚪ ${totalUnvalidated(snapshot)} sin validar`,
        '⚠️ Tracking analítico · Sin ejecución monetaria',
      ].filter(Boolean).join('\n'),
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
    options.testLabel ? `🧪 ${options.testLabel}` : undefined,
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

export function buildValidationMirrorPayload(recommendationArtifact, options = {}) {
  const max = parseMaxRecommendations(String(options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS));
  const recommendations = selectRecommendations(recommendationArtifact).slice(0, Math.min(max, DEFAULT_MAX_RECOMMENDATIONS));
  const validationIndex = buildValidationIndex(options.validationArtifact);
  const validatedRecommendations = recommendations.map((recommendation) => applyValidationOverlay(recommendation, validationIndex));
  const counts = recommendationCounts(validatedRecommendations);
  const date = options.date || recommendationArtifact?.date || 'fecha desconocida';
  const embeds = [{
    title: '📊 Gana v9 · Validación de recomendaciones',
    description: [
      options.testLabel ? `🧪 ${options.testLabel}` : undefined,
      `📅 Recomendaciones ${date} · espejo validado`,
      `📦 ${counts.parlay} parlays · 📌 ${counts.atomic} simples`,
      '⚠️ Tracking analítico · Sin ejecución monetaria',
    ].filter(Boolean).join('\n'),
    color: 0x2f80ed,
    footer: { text: 'Gana Hermes · Discord native embeds' },
    timestamp: new Date().toISOString(),
  }];

  if (validatedRecommendations.length) {
    embeds.push(...validatedRecommendations.map((recommendation, index) => validationMirrorEmbed(recommendation, index)));
  } else {
    embeds.push({
      title: 'Sin selecciones',
      description: '> El artifact de recomendaciones no contiene selecciones para validar.',
      color: 0x828282,
    });
  }

  embeds.push({
    description: '🛡️ Validación espejo de las recomendaciones enviadas. Revisar pendientes y muestras pequeñas antes de ajustar promoción.',
    color: 0x56ccf2,
  });

  return {
    username: stringOrFallback(options.username, 'Gana Hermes'),
    allowed_mentions: { parse: [] },
    content: '',
    embeds,
  };
}

export function buildValidationMirrorMessage(recommendationArtifact, options = {}) {
  const max = parseMaxRecommendations(String(options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS));
  const recommendations = selectRecommendations(recommendationArtifact).slice(0, max);
  const validationIndex = buildValidationIndex(options.validationArtifact);
  const validatedRecommendations = recommendations.map((recommendation) => applyValidationOverlay(recommendation, validationIndex));
  const counts = recommendationCounts(validatedRecommendations);
  const date = options.date || recommendationArtifact?.date || 'fecha desconocida';
  const lines = [
    '📊 Gana v9 · Validación de recomendaciones',
    '',
    options.testLabel ? `🧪 ${options.testLabel}` : undefined,
    `📅 Recomendaciones ${date} · espejo validado`,
    `📦 ${counts.parlay} parlays · 📌 ${counts.atomic} simples`,
    '⚠️ Tracking analítico · Sin ejecución monetaria',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
  ].filter((line) => line !== undefined);

  if (!validatedRecommendations.length) {
    lines.push('> Sin selecciones: el artifact de recomendaciones no contiene selecciones para validar.', '');
  } else {
    for (const [index, recommendation] of validatedRecommendations.entries()) {
      lines.push(...formatValidationMirrorLines(recommendation, index));
    }
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '',
    '🛡️ Validación espejo de las recomendaciones enviadas. Revisar pendientes y muestras pequeñas antes de ajustar promoción.',
  );
  return lines.join('\n');
}

export async function runDailyStatsNotification(options) {
  const metricsPath = resolveMetricsArtifactPath(options);
  const validationPath = resolveValidationArtifactPath(options);
  const { metricsArtifact, validationArtifact } = loadDailyStats(metricsPath, validationPath);
  const snapshot = selectMetricSnapshot(metricsArtifact, options.date);
  const recommendationPath = resolveRecommendationArtifactPath({ ...options, date: options.date ?? snapshot.metricDate });
  const recommendationArtifact = recommendationPath ? readJson(recommendationPath) : undefined;
  const payload = buildDiscordPayload(metricsArtifact, { ...options, validationArtifact });
  const gatewayMessage = buildGatewayMessage(metricsArtifact, { ...options, validationArtifact });
  const mirrorPayload = recommendationArtifact
    ? buildValidationMirrorPayload(recommendationArtifact, { ...options, date: snapshot.metricDate, validationArtifact })
    : undefined;
  const mirrorGatewayMessage = recommendationArtifact
    ? buildValidationMirrorMessage(recommendationArtifact, { ...options, date: snapshot.metricDate, validationArtifact })
    : undefined;

  if (options.dryRun) {
    return {
      dryRun: true,
      metricsPath,
      validationPath,
      recommendationPath,
      metricDate: snapshot.metricDate,
      transport: options.transport,
      gatewayTarget: options.gatewayTarget,
      payload,
      gatewayMessage,
      mirrorPayload,
      mirrorGatewayMessage,
    };
  }

  if (options.transport === 'hermes-gateway') {
    const gatewayResult = sendHermesGatewayMessage(options.gatewayTarget, gatewayMessage, { hermesPython: options.hermesPython });
    const mirrorGatewayResult = mirrorGatewayMessage
      ? sendHermesGatewayMessage(options.gatewayTarget, mirrorGatewayMessage, { hermesPython: options.hermesPython })
      : undefined;
    return { metricsPath, validationPath, recommendationPath, metricDate: snapshot.metricDate, transport: options.transport, gatewayTarget: options.gatewayTarget, gatewayResult, mirrorGatewayResult };
  }

  if (options.transport === 'discord-native') {
    const discordResult = sendDiscordNativePayload(options.gatewayTarget, payload, { hermesPython: options.hermesPython });
    const mirrorDiscordResult = mirrorPayload
      ? sendDiscordNativePayload(options.gatewayTarget, mirrorPayload, { hermesPython: options.hermesPython })
      : undefined;
    return { metricsPath, validationPath, recommendationPath, metricDate: snapshot.metricDate, transport: options.transport, gatewayTarget: options.gatewayTarget, discordResult, mirrorDiscordResult };
  }

  const discordStatus = await sendDiscordPayload(options.webhookUrl, payload);
  const mirrorDiscordStatus = mirrorPayload ? await sendDiscordPayload(options.webhookUrl, mirrorPayload) : undefined;
  return { metricsPath, validationPath, recommendationPath, metricDate: snapshot.metricDate, transport: options.transport, discordStatus: discordStatus.status, mirrorDiscordStatus: mirrorDiscordStatus?.status };
}

function validationMirrorEmbed(recommendation, index) {
  const rank = num(recommendation.rank) || index + 1;
  const kind = recommendationKind(recommendation);
  const status = normalizeStatus(recommendation.validationStatus);
  const legLines = Array.isArray(recommendation.legs) && recommendation.legs.length
    ? recommendation.legs.slice(0, 8).map((leg) => `> ${statusIcon(leg.validationStatus)} ${formatCompactLeg(leg)}`)
    : ['> Sin detalle de selecciones.'];
  if (Array.isArray(recommendation.legs) && recommendation.legs.length > 8) {
    legLines.push(`> +${recommendation.legs.length - 8} selecciones adicionales`);
  }
  legLines.push(`> 📊 Resultado ${statusIcon(status)} ${status} · Odds ${formatMetricNumber(recommendation.combinedOdds, 4)} · 🧠 Conf ${formatPercent(recommendation.aggregateConfidence)} · 📈 Edge ${formatPercent(recommendation.expectedEdge)} · 📌 Expo ${formatExposurePercent(recommendation)}`);

  return {
    title: `${rankEmoji(rank)} ${statusIcon(status)} ${kind === 'atomic-prediction' ? '📌 Simple · ' : ''}${recommendationTitle(recommendation)}`,
    description: truncate(legLines.join('\n'), DISCORD_DESCRIPTION_LIMIT),
    color: statusColor(status),
  };
}

function formatValidationMirrorLines(recommendation, index) {
  const rank = num(recommendation.rank) || index + 1;
  const kind = recommendationKind(recommendation);
  const status = normalizeStatus(recommendation.validationStatus);
  const lines = [`${rankEmoji(rank)} ${statusIcon(status)} ${kind === 'atomic-prediction' ? '📌 Simple · ' : ''}${recommendationTitle(recommendation)}`];

  if (Array.isArray(recommendation.legs) && recommendation.legs.length) {
    for (const leg of recommendation.legs.slice(0, 8)) {
      lines.push(`> ${statusIcon(leg.validationStatus)} ${formatCompactLeg(leg)}`);
    }
    if (recommendation.legs.length > 8) lines.push(`> +${recommendation.legs.length - 8} selecciones adicionales`);
  } else {
    lines.push('> Sin detalle de selecciones.');
  }

  lines.push(`> 📊 Resultado ${statusIcon(status)} ${status} · Odds ${formatMetricNumber(recommendation.combinedOdds, 4)} · 🧠 Conf ${formatPercent(recommendation.aggregateConfidence)} · 📈 Edge ${formatPercent(recommendation.expectedEdge)} · 📌 Expo ${formatExposurePercent(recommendation)}`);
  lines.push('');
  return lines;
}

function buildValidationIndex(validationArtifact) {
  const index = new Map();
  if (!Array.isArray(validationArtifact?.validations)) return index;
  for (const validation of validationArtifact.validations) {
    const predictionId = typeof validation?.predictionId === 'string' ? validation.predictionId.trim() : '';
    if (predictionId) index.set(predictionId, validation);
  }
  return index;
}

function applyValidationOverlay(recommendation, validationIndex) {
  const legs = Array.isArray(recommendation.legs)
    ? recommendation.legs.map((leg) => {
      const validation = validationIndex.get(leg?.predictionId);
      return {
        ...leg,
        validationStatus: resolveLegStatus(leg, validation),
        validationReason: validation?.reason || validation?.outcome?.reason || leg?.validationReason,
      };
    })
    : [];
  return {
    ...recommendation,
    legs,
    validationStatus: aggregateRecommendationStatus(legs, recommendation.validationStatus),
  };
}

function resolveLegStatus(leg, validation) {
  return normalizeStatus(validation?.status || validation?.outcome?.status || leg?.validationStatus);
}

function aggregateRecommendationStatus(legs, fallback) {
  const statuses = Array.isArray(legs) ? legs.map((leg) => normalizeStatus(leg.validationStatus)) : [];
  if (!statuses.length) return normalizeStatus(fallback);
  if (statuses.includes('lost')) return 'lost';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('unvalidated') || statuses.includes('unknown')) return 'unvalidated';
  if (statuses.every((status) => status === 'voided')) return 'voided';
  if (statuses.every((status) => status === 'won' || status === 'voided')) return 'won';
  return normalizeStatus(fallback);
}

function normalizeStatus(value) {
  const status = stringOrFallback(value, 'unvalidated').toLowerCase();
  if (status === 'win') return 'won';
  if (status === 'loss') return 'lost';
  if (status === 'void' || status === 'push') return 'voided';
  if (['won', 'lost', 'voided', 'pending', 'blocked', 'unvalidated'].includes(status)) return status;
  return 'unknown';
}

function statusIcon(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'won') return '✅';
  if (normalized === 'lost') return '❌';
  if (normalized === 'voided') return '➖';
  if (normalized === 'pending') return '⏳';
  if (normalized === 'blocked') return '🚫';
  if (normalized === 'unvalidated') return '⚪';
  return '❔';
}

function statusColor(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'won') return 0x27ae60;
  if (normalized === 'lost') return 0xeb5757;
  if (normalized === 'voided') return 0x828282;
  if (normalized === 'pending') return 0xf2c94c;
  if (normalized === 'blocked') return 0xf2994a;
  return 0x9b51e0;
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
    if (kind === 'recommendation') {
      return artifact.date === date || artifact.dailyBatchId === `daily-${date}` || String(artifact.dailyBatchId || '').startsWith(`daily-${date}-`);
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

function parseMaxRecommendations(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > DEFAULT_MAX_RECOMMENDATIONS) {
    throw new Error(`--max-recommendations must be an integer between 1 and ${DEFAULT_MAX_RECOMMENDATIONS}.`);
  }
  return numeric;
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
    '  notify-discord-daily-stats.mjs --metrics-artifact PATH [--validation-artifact PATH] [--recommendation-artifact PATH] [--dry-run]',
    '',
    'Options:',
    '  --no-recommendation-mirror disables the day recommendation validation mirror.',
    `  --max-recommendations N limits mirrored selections, 1-${DEFAULT_MAX_RECOMMENDATIONS}.`,
    '  --test-label TEXT adds a test/provenance line to both validation messages.',
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
