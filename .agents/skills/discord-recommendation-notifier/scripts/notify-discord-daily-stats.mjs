#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  formatCompactLeg,
  formatExposurePercent,
  formatMetricNumber,
  formatPercent,
  formatStakeRecommendation,
  recommendationCounts,
  recommendationKind,
  recommendationTitle,
  selectRecommendations,
  sendDiscordNativePayload,
  sendDiscordPayload,
  sendHermesGatewayMessage,
} from './notify-discord-recommendations.mjs';
import { resolveDiscordTarget } from './discord-targets.mjs';

const DEFAULT_ARTIFACT_ROOT = '.artifacts/gana-v9/runs';
const DEFAULT_TRANSPORT = 'discord-native';
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
    gatewayTarget: undefined,
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
  args.gatewayTarget = resolveDiscordTarget('validation', { gatewayTarget: args.gatewayTarget });
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
      title: 'Gana v9 - Validacion diaria',
      description: [
        options.testLabel ? `Nota: ${options.testLabel}` : undefined,
        `Fecha: ${snapshot.metricDate} (${snapshot.timezone || options.timezone || DEFAULT_TIMEZONE})`,
        `Estado: ${totalSettled(snapshot)} resueltas, ${totalPending(snapshot)} pendientes, ${totalUnvalidated(snapshot)} sin validar`,
        '',
        `Predicciones: ${formatCompactMetricSummary(snapshot.predictionMetrics, true)}`,
        formatBucketSummary('Providers', snapshot.predictionMetrics?.byProvider),
        `Parlays: ${formatCompactMetricSummary(snapshot.parlayMetrics, false)}`,
        '',
        gateVerdict ? `Gate: ${gateVerdict}` : undefined,
        validationCount !== undefined ? `Artifact de validacion: ${validationCount} registros` : undefined,
        `Scope: ${snapshot.scope || metricsArtifact.scope || 'daily'}`,
        'Uso: tracking analitico; sin ejecucion monetaria.',
      ].filter(Boolean).join('\n'),
      color: headerColor(snapshot),
      footer: { text: 'Gana Hermes · Discord native embeds' },
      timestamp: new Date().toISOString(),
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
    'Gana v9 - Validacion diaria',
    '',
    options.testLabel ? `Nota: ${options.testLabel}` : undefined,
    `Fecha: ${snapshot.metricDate} (${snapshot.timezone || options.timezone || DEFAULT_TIMEZONE})`,
    `Estado: ${totalSettled(snapshot)} resueltas, ${totalPending(snapshot)} pendientes, ${totalUnvalidated(snapshot)} sin validar`,
    '',
    `Predicciones: ${formatCompactMetricSummary(snapshot.predictionMetrics, true)}`,
    formatBucketSummary('Providers', snapshot.predictionMetrics?.byProvider),
    `Parlays: ${formatCompactMetricSummary(snapshot.parlayMetrics, false)}`,
    '',
    gateVerdict ? `Gate: ${gateVerdict}` : undefined,
    validationCount !== undefined ? `Artifact de validacion: ${validationCount} registros` : undefined,
    `Scope: ${snapshot.scope || metricsArtifact.scope || 'daily'}`,
    'Uso: tracking analitico; sin ejecucion monetaria.',
  ].filter((line) => line !== undefined).join('\n');
}

export function buildValidationMirrorPayload(recommendationArtifact, options = {}) {
  const max = parseMaxRecommendations(String(options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS));
  const recommendations = selectRecommendations(recommendationArtifact).slice(0, Math.min(max, DEFAULT_MAX_RECOMMENDATIONS));
  const validationIndex = buildValidationIndex(options.validationArtifact);
  const validatedRecommendations = recommendations.map((recommendation) => applyValidationOverlay(recommendation, validationIndex));
  const counts = recommendationCounts(validatedRecommendations);
  const statusCounts = countRecommendationStatuses(validatedRecommendations);
  const date = options.date || recommendationArtifact?.date || 'fecha desconocida';
  const headerLines = [
    options.testLabel ? `Nota: ${options.testLabel}` : undefined,
    `Fecha: ${date}`,
    `Selecciones: ${counts.parlay} parlays, ${counts.atomic} simples`,
    `Resultado: ${formatRecommendationStatusSummary(statusCounts)}`,
    'Uso: tracking analitico; sin ejecucion monetaria.',
    '',
  ].filter((line) => line !== undefined);
  const embeds = [];

  if (validatedRecommendations.length) {
    embeds.push(...validationMirrorSummaryEmbeds(validatedRecommendations, headerLines));
  } else {
    embeds.push({
      title: 'Sin selecciones',
      description: [...headerLines, 'El artifact de recomendaciones no contiene selecciones para validar.'].join('\n'),
      color: 0x828282,
    });
  }

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
  const statusCounts = countRecommendationStatuses(validatedRecommendations);
  const date = options.date || recommendationArtifact?.date || 'fecha desconocida';
  const lines = [
    'Gana v9 - Validacion de recomendaciones',
    '',
    options.testLabel ? `Nota: ${options.testLabel}` : undefined,
    `Fecha: ${date}`,
    `Selecciones: ${counts.parlay} parlays, ${counts.atomic} simples`,
    `Resultado: ${formatRecommendationStatusSummary(statusCounts)}`,
    'Uso: tracking analitico; sin ejecucion monetaria.',
    '',
  ].filter((line) => line !== undefined);

  if (!validatedRecommendations.length) {
    lines.push('> Sin selecciones: el artifact de recomendaciones no contiene selecciones para validar.', '');
  } else {
    const exceptions = validatedRecommendations
      .map((recommendation, index) => ({ recommendation, index }))
      .filter(({ recommendation }) => !['won', 'voided'].includes(normalizeStatus(recommendation.validationStatus)));
    if (!exceptions.length) lines.push('Sin fallos abiertos: todas las selecciones resueltas cerraron ganadas/anuladas.', '');
    for (const { recommendation, index } of exceptions) {
      lines.push(...formatValidationMirrorSummaryLines(recommendation, index));
    }
  }

  lines.push('Revisar pendientes y muestras pequenas antes de ajustar promocion.');
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

function validationMirrorSummaryEmbeds(recommendations, headerLines = []) {
  const embeds = [];
  let current = [...headerLines];
  const exceptions = recommendations
    .map((recommendation, index) => ({ recommendation, index }))
    .filter(({ recommendation }) => !['won', 'voided'].includes(normalizeStatus(recommendation.validationStatus)));
  if (!exceptions.length) current.push('Sin fallos abiertos: todas las selecciones resueltas cerraron ganadas/anuladas.');
  for (const { recommendation, index } of exceptions) {
    const candidate = formatValidationMirrorSummaryLines(recommendation, index);
    const next = [...current, ...candidate];
    if (current.length > headerLines.length && next.join('\n').length > DISCORD_DESCRIPTION_LIMIT) {
      embeds.push(validationMirrorSummaryEmbed(current, embeds.length));
      current = [...headerLines, ...candidate];
    } else {
      current = next;
    }
  }
  if (current.length) embeds.push(validationMirrorSummaryEmbed(current, embeds.length));
  return embeds;
}

function validationMirrorSummaryEmbed(lines, pageIndex) {
  return {
    title: pageIndex === 0 ? 'Gana v9 - Validacion de recomendaciones' : `Gana v9 - Validacion de recomendaciones ${pageIndex + 1}`,
    description: truncate(lines.join('\n'), DISCORD_DESCRIPTION_LIMIT),
    color: 0x2f80ed,
    footer: { text: 'Gana Hermes · Discord native embeds' },
    timestamp: new Date().toISOString(),
  };
}

function formatValidationMirrorSummaryLines(recommendation, index) {
  const rank = num(recommendation.rank) || index + 1;
  const kind = recommendationKind(recommendation);
  const status = normalizeStatus(recommendation.validationStatus);
  const type = kind === 'atomic-prediction' ? 'Simple' : 'Parlay';
  const lines = [
    `${rank}. ${type}: ${validationMirrorSummaryTitle(recommendation, kind)} - ${statusLabel(status)} (${formatValidationMirrorLegSummary(recommendation.legs)})`,
    formatValidationMirrorMetricLine(recommendation, status),
  ];

  const exceptionLines = formatValidationMirrorExceptionLines(recommendation.legs, status);
  if (exceptionLines.length) lines.push(...exceptionLines);
  lines.push('');
  return lines;
}

function countRecommendationStatuses(recommendations) {
  const counts = { won: 0, lost: 0, voided: 0, pending: 0, blocked: 0, unvalidated: 0, unknown: 0 };
  for (const recommendation of Array.isArray(recommendations) ? recommendations : []) {
    counts[normalizeStatus(recommendation?.validationStatus)] += 1;
  }
  return counts;
}

function formatRecommendationStatusSummary(counts) {
  return [
    counts.won ? `${counts.won} ganadas` : undefined,
    counts.lost ? `${counts.lost} perdidas` : undefined,
    counts.voided ? `${counts.voided} anuladas` : undefined,
    counts.pending ? `${counts.pending} pendientes` : undefined,
    counts.blocked ? `${counts.blocked} bloqueadas` : undefined,
    counts.unvalidated ? `${counts.unvalidated} sin validar` : undefined,
    counts.unknown ? `${counts.unknown} desconocidas` : undefined,
  ].filter(Boolean).join(', ') || 'sin selecciones';
}

function validationMirrorSummaryTitle(recommendation, kind) {
  if (kind === 'atomic-prediction') return recommendationTitle(recommendation);
  const fixtures = Array.isArray(recommendation.legs)
    ? recommendation.legs
      .map((leg) => (typeof leg?.fixture === 'string' ? leg.fixture.trim() : ''))
      .filter(Boolean)
    : [];
  const uniqueFixtures = [...new Set(fixtures)];
  return uniqueFixtures.length ? uniqueFixtures.join(' + ') : recommendationTitle(recommendation);
}

function formatValidationMirrorMetricLine(recommendation, status) {
  const normalized = normalizeStatus(status);
  const stake = formatStakeRecommendation(recommendation);
  const parts = [
    `Odds ${formatMetricNumber(recommendation.combinedOdds, 4)}`,
    normalized === 'won' ? undefined : `Conf ${formatPercent(recommendation.aggregateConfidence)}`,
    normalized === 'won' ? undefined : `Edge ${formatPercent(recommendation.expectedEdge)}`,
    normalized === 'won' ? undefined : stake ? `Stake ${stake}` : undefined,
  ];
  if (normalized !== 'won' && !stake) parts.push(`Expo ${formatExposurePercent(recommendation)}`);
  return `Detalle: ${parts.filter(Boolean).join(' · ')}`;
}

function formatValidationMirrorLegSummary(legs) {
  if (!Array.isArray(legs) || !legs.length) return 'sin legs';
  const counts = countLegStatuses(legs);
  const parts = [
    counts.won ? `${counts.won} ganado` : undefined,
    counts.lost ? `${counts.lost} perdido` : undefined,
    counts.voided ? `${counts.voided} anulado` : undefined,
    counts.pending ? `${counts.pending} pendiente` : undefined,
    counts.blocked ? `${counts.blocked} bloqueado` : undefined,
    counts.unvalidated ? `${counts.unvalidated} sin validar` : undefined,
    counts.unknown ? `${counts.unknown} desconocido` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : `${legs.length} legs`;
}

function countLegStatuses(legs) {
  const counts = { won: 0, lost: 0, voided: 0, pending: 0, blocked: 0, unvalidated: 0, unknown: 0 };
  for (const leg of Array.isArray(legs) ? legs : []) {
    counts[normalizeStatus(leg?.validationStatus)] += 1;
  }
  return counts;
}

function formatValidationMirrorExceptionLines(legs, recommendationStatus) {
  if (!Array.isArray(legs) || !legs.length) return [];
  const normalized = normalizeStatus(recommendationStatus);
  if (normalized === 'won' || normalized === 'voided') return [];
  const exceptionStatuses = new Set(['lost', 'pending', 'blocked', 'unvalidated', 'unknown']);
  const exceptions = legs.filter((leg) => exceptionStatuses.has(normalizeStatus(leg?.validationStatus)));
  const lines = exceptions
    .slice(0, 3)
    .map((leg) => `Fallo/pendiente: ${statusLabel(leg.validationStatus)} - ${formatPlainLeg(leg)}`);
  const hidden = exceptions.length - lines.length;
  if (hidden > 0) lines.push(`Fallo/pendiente: +${hidden} legs con estado abierto/problematico`);
  return lines;
}

function formatPlainLeg(leg) {
  return formatCompactLeg(leg).replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
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

function statusLabel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'won') return 'ganado';
  if (normalized === 'lost') return 'perdido';
  if (normalized === 'voided') return 'anulado';
  if (normalized === 'pending') return 'pendiente';
  if (normalized === 'blocked') return 'bloqueado';
  if (normalized === 'unvalidated') return 'sin validar';
  return 'desconocido';
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

function formatCompactMetricSummary(metrics, includeEdge) {
  if (!metrics) return 'sin datos';
  const parts = [
    `${num(metrics.won)} ganadas`,
    `${num(metrics.lost)} perdidas`,
    num(metrics.pending) ? `${num(metrics.pending)} pendientes` : undefined,
    num(metrics.unvalidated) ? `${num(metrics.unvalidated)} sin validar` : undefined,
    `total ${num(metrics.total)}`,
    `hit ${formatHitRate(metrics.hitRate)}`,
    `odds ${formatNumber(metrics.avgOdds, 3)}`,
    `conf ${formatConfidence(metrics.avgConfidence)}`,
    includeEdge ? `edge ${formatSignedPercent(metrics.avgEdge)}` : undefined,
  ];
  return parts.filter(Boolean).join(', ');
}

function formatBucketSummary(title, buckets) {
  if (!Array.isArray(buckets) || !buckets.length) return undefined;
  const summaries = buckets.slice(0, 3).map((bucket) => `${bucket.label || bucket.key} ${num(bucket.total)} (${num(bucket.won)}-${num(bucket.lost)}, hit ${formatHitRate(bucket.hitRate)})`);
  return `${title}: ${summaries.join('; ')}`;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
