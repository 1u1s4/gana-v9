#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  attachRequiredLeagueGeneralPredictions,
  attachRequiredLeagueRecommendations,
  formatCompactLeg,
  formatExposurePercent,
  formatMarketIcon,
  formatMetricNumber,
  formatPercent,
  formatRequiredPick,
  formatStakeRecommendation,
  parlayProfileEmoji,
  rankEmoji,
  recommendationCounts,
  recommendationKind,
  recommendationTitle,
  requiredLeagueData,
  requiredLeagueFixtureLabel,
  requiredLeagueFixtureLabelWithKickoff,
  requiredLeagueStatus,
  requiredLeagueTitle,
  selectRecommendations,
  sendDiscordNativePayload,
  sendDiscordPayload,
  sendHermesGatewayMessage,
  shouldRenderRequiredLeagueGeneralPredictions,
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
  const recommendationArtifact = recommendationPath ? loadRecommendationArtifact(recommendationPath) : undefined;
  return { metricsArtifact, validationArtifact, recommendationArtifact };
}

function loadRecommendationArtifact(recommendationPath) {
  const artifact = readJson(recommendationPath);
  attachRequiredLeagueRecommendations(artifact, recommendationPath);
  attachRequiredLeagueGeneralPredictions(artifact, recommendationPath);
  return artifact;
}

export function buildDiscordPayload(metricsArtifact, options = {}) {
  const metricSnapshot = selectMetricSnapshot(metricsArtifact, options.date);
  const snapshot = recommendationMetricSnapshot(metricSnapshot, options);
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
  const metricSnapshot = selectMetricSnapshot(metricsArtifact, options.date);
  const snapshot = recommendationMetricSnapshot(metricSnapshot, options);
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
  const embeds = [{
    title: '📊 Gana v9 · Validación de recomendaciones',
    description: [
      options.testLabel ? `🧪 ${options.testLabel}` : undefined,
      `📅 ${date}`,
      `📦 ${counts.parlay} parlays · 📌 ${counts.atomic} simples`,
      `Resultado: ${formatRecommendationStatusSummary(statusCounts)}`,
      'Tracking analítico · Sin ejecución monetaria',
    ].filter(Boolean).join('\n'),
    color: 0x2f80ed,
    footer: { text: 'Gana Hermes · Discord native embeds' },
    timestamp: new Date().toISOString(),
  }];

  if (validatedRecommendations.length) embeds.push(...validationMirrorSelectionEmbeds(validatedRecommendations));
  else embeds.push({
    title: 'Sin selecciones',
    description: 'El artifact de recomendaciones no contiene selecciones para validar.',
    color: 0x828282,
  });
  embeds.push(...validationMirrorRequiredLeagueEmbeds(recommendationArtifact, validationIndex));

  return {
    username: stringOrFallback(options.username, 'Gana Hermes'),
    allowed_mentions: { parse: [] },
    content: '',
    embeds,
  };
}

export function buildValidationMirrorPayloads(recommendationArtifact, options = {}) {
  return chunkPayloadEmbeds(buildValidationMirrorPayload(recommendationArtifact, options), 10);
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
    '📊 Gana v9 · Validación de recomendaciones',
    '',
    options.testLabel ? `🧪 ${options.testLabel}` : undefined,
    `📅 ${date}`,
    `📦 ${counts.parlay} parlays · 📌 ${counts.atomic} simples`,
    `Resultado: ${formatRecommendationStatusSummary(statusCounts)}`,
    'Tracking analítico · Sin ejecución monetaria',
    '',
  ].filter((line) => line !== undefined);

  if (!validatedRecommendations.length) {
    lines.push('> Sin selecciones: el artifact de recomendaciones no contiene selecciones para validar.', '');
  } else {
    for (const [index, recommendation] of validatedRecommendations.entries()) {
      lines.push(...formatValidationMirrorSelectionLines(recommendation, index));
    }
  }
  lines.push(...formatValidationMirrorRequiredLeagueMessageLines(recommendationArtifact, validationIndex));

  lines.push('Revisar pendientes y muestras pequeñas antes de ajustar promoción.');
  return lines.join('\n');
}

export async function runDailyStatsNotification(options) {
  const metricsPath = resolveMetricsArtifactPath(options);
  const validationPath = resolveValidationArtifactPath(options);
  const { metricsArtifact, validationArtifact } = loadDailyStats(metricsPath, validationPath);
  const snapshot = selectMetricSnapshot(metricsArtifact, options.date);
  const recommendationPath = resolveRecommendationArtifactPath({ ...options, date: options.date ?? snapshot.metricDate });
  const recommendationArtifact = recommendationPath ? loadRecommendationArtifact(recommendationPath) : undefined;
  const payload = buildDiscordPayload(metricsArtifact, { ...options, validationArtifact, recommendationArtifact });
  const gatewayMessage = buildGatewayMessage(metricsArtifact, { ...options, validationArtifact, recommendationArtifact });
  const mirrorPayload = recommendationArtifact
    ? buildValidationMirrorPayload(recommendationArtifact, { ...options, date: snapshot.metricDate, validationArtifact })
    : undefined;
  const mirrorPayloads = recommendationArtifact
    ? buildValidationMirrorPayloads(recommendationArtifact, { ...options, date: snapshot.metricDate, validationArtifact })
    : [];
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
      mirrorPayloads,
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
    const mirrorDiscordResults = mirrorPayloads.map((item) => sendDiscordNativePayload(options.gatewayTarget, item, { hermesPython: options.hermesPython }));
    return { metricsPath, validationPath, recommendationPath, metricDate: snapshot.metricDate, transport: options.transport, gatewayTarget: options.gatewayTarget, discordResult, mirrorDiscordResult: mirrorDiscordResults[0], mirrorDiscordResults };
  }

  const discordStatus = await sendDiscordPayload(options.webhookUrl, payload);
  const mirrorDiscordStatuses = [];
  for (const item of mirrorPayloads) {
    const result = await sendDiscordPayload(options.webhookUrl, item);
    mirrorDiscordStatuses.push(result.status);
  }
  return { metricsPath, validationPath, recommendationPath, metricDate: snapshot.metricDate, transport: options.transport, discordStatus: discordStatus.status, mirrorDiscordStatus: mirrorDiscordStatuses[0], mirrorDiscordStatuses };
}

function validationMirrorSelectionEmbeds(recommendations) {
  return recommendations.map((recommendation, index) => {
    const rank = num(recommendation.rank) || index + 1;
    const kind = recommendationKind(recommendation);
    const status = normalizeStatus(recommendation.validationStatus);
    return {
      title: `${rankEmoji(rank)} ${statusIcon(status)} ${kind === 'atomic-prediction' ? '📌 Simple · ' : ''}${recommendationTitle(recommendation)}`,
      description: truncate(formatValidationMirrorSelectionBody(recommendation, status).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: statusColor(status),
    };
  });
}

function formatValidationMirrorSelectionLines(recommendation, index) {
  const rank = num(recommendation.rank) || index + 1;
  const kind = recommendationKind(recommendation);
  const status = normalizeStatus(recommendation.validationStatus);
  const lines = [
    `${rankEmoji(rank)} ${statusIcon(status)} ${kind === 'atomic-prediction' ? '📌 Simple · ' : ''}${recommendationTitle(recommendation)}`,
    ...formatValidationMirrorSelectionBody(recommendation, status),
    '',
  ];
  return lines;
}

function formatValidationMirrorSelectionBody(recommendation, status) {
  const lines = [];
  if (Array.isArray(recommendation.legs) && recommendation.legs.length) {
    for (const leg of recommendation.legs.slice(0, 8)) {
      lines.push(`${statusIcon(leg.validationStatus)} ${formatCompactLeg(leg)}`);
      lines.push(`   Real: ${formatActualResult(leg)}`);
    }
    if (recommendation.legs.length > 8) lines.push(`+${recommendation.legs.length - 8} selecciones adicionales`);
  } else {
    lines.push('Sin detalle de selecciones.');
  }
  lines.push(formatValidationMirrorMetricLine(recommendation, status));
  return lines;
}

function validationMirrorRequiredLeagueEmbeds(recommendationArtifact, validationIndex) {
  const data = requiredLeagueValidationData(recommendationArtifact, validationIndex);
  if (!data) return [];
  const title = requiredLeagueTitle(data);
  const embeds = [];
  const summaryLines = formatRequiredLeagueValidationSummaryLines(data);
  if (summaryLines.length) {
    embeds.push({
      title: `🌍 Obligatorio · ${title}`,
      description: truncate(summaryLines.map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: requiredLeagueStatus(data) === 'passed' ? 0x27ae60 : 0xf2994a,
    });
  }

  const predictionLines = formatRequiredLeagueValidationPredictionLines(data);
  if (predictionLines.length) {
    embeds.push({
      title: `📌 Predicciones obligatorias · ${title}`,
      description: truncate(predictionLines.map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
      color: 0x9b51e0,
    });
  }

  const generalLines = formatRequiredLeagueValidationGeneralPredictionLines(data);
  for (const [index, description] of chunkLinesByLimit(generalLines.map((line) => `> ${line}`), DISCORD_DESCRIPTION_LIMIT).entries()) {
    embeds.push({
      title: index === 0
        ? `📋 Predicciones generales · ${title}`
        : `📋 Predicciones generales cont. ${index + 1} · ${title}`,
      description: truncate(description, DISCORD_DESCRIPTION_LIMIT),
      color: 0x56ccf2,
    });
  }

  embeds.push(...requiredLeagueValidationParlayEmbeds(data));
  return embeds;
}

function formatValidationMirrorRequiredLeagueMessageLines(recommendationArtifact, validationIndex) {
  const data = requiredLeagueValidationData(recommendationArtifact, validationIndex);
  if (!data) return [];
  const title = requiredLeagueTitle(data);
  const lines = [];
  const summaryLines = formatRequiredLeagueValidationSummaryLines(data);
  if (summaryLines.length) {
    lines.push('', `🌍 Obligatorio · ${title}`, ...summaryLines.map((line) => `> ${line}`));
  }
  const predictionLines = formatRequiredLeagueValidationPredictionLines(data);
  if (predictionLines.length) {
    lines.push('', `📌 Predicciones obligatorias · ${title}`, ...predictionLines.map((line) => `> ${line}`));
  }
  const generalLines = formatRequiredLeagueValidationGeneralPredictionLines(data);
  if (generalLines.length) {
    lines.push('', `📋 Predicciones generales · ${title}`, ...generalLines.map((line) => `> ${line}`));
  }
  const parlayLines = formatRequiredLeagueValidationParlayMessageLines(data);
  if (parlayLines.length) {
    lines.push('', ...parlayLines);
  }
  if (lines.length) lines.push('');
  return lines;
}

function requiredLeagueValidationData(recommendationArtifact, validationIndex) {
  const data = requiredLeagueData(recommendationArtifact);
  if (!data) return undefined;
  const generalPredictions = Array.isArray(data.generalPredictions)
    ? data.generalPredictions
    : Array.isArray(recommendationArtifact?.requiredLeagueGeneralPredictions)
      ? recommendationArtifact.requiredLeagueGeneralPredictions
      : [];
  return {
    ...data,
    atomicProjections: Array.isArray(data.atomicProjections)
      ? data.atomicProjections.map((projection) => applyRequiredLeagueValidationOverlay(projection, validationIndex))
      : [],
    parlayProjections: Array.isArray(data.parlayProjections)
      ? data.parlayProjections.map((projection) => {
        const legs = Array.isArray(projection?.legs)
          ? projection.legs.map((leg) => applyRequiredLeagueValidationOverlay(leg, validationIndex))
          : [];
        return {
          ...projection,
          legs,
          validationStatus: aggregateRecommendationStatus(legs, projection.validationStatus),
        };
      })
      : [],
    generalPredictions: generalPredictions.map((prediction) => applyRequiredLeagueValidationOverlay(prediction, validationIndex)),
  };
}

function applyRequiredLeagueValidationOverlay(item, validationIndex) {
  const validation = requiredLeagueValidationForItem(item, validationIndex);
  if (!validation) return { ...item };
  return {
    ...item,
    validationStatus: validation.__fixtureFallback ? item?.validationStatus : resolveLegStatus(item, validation),
    validationReason: validation?.reason || validation?.outcome?.reason || item?.validationReason,
    validationActual: resolveValidationActual(validation) ?? item?.validationActual,
  };
}

function requiredLeagueValidationForItem(item, validationIndex) {
  const predictionId = typeof item?.predictionId === 'string' ? item.predictionId.trim() : '';
  if (predictionId) {
    const predictionValidation = validationIndex.byPredictionId.get(predictionId);
    if (predictionValidation) return predictionValidation;
  }
  const artifactSelectionId = requiredLeagueArtifactSelectionId(item);
  if (artifactSelectionId) {
    const artifactValidation = validationIndex.byArtifactSelectionId.get(artifactSelectionId);
    if (artifactValidation) return artifactValidation;
  }
  const fixtureId = typeof item?.fixtureId === 'string' ? item.fixtureId.trim() : '';
  const fixtureValidation = fixtureId ? validationIndex.byFixtureId.get(fixtureId) : undefined;
  return fixtureValidation
    ? { ...fixtureValidation, status: item?.validationStatus, outcome: { status: item?.validationStatus }, __fixtureFallback: true }
    : undefined;
}

function requiredLeagueArtifactSelectionId(item) {
  const fixtureId = typeof item?.fixtureId === 'string' ? item.fixtureId.trim() : '';
  const market = typeof item?.market === 'string' ? item.market.trim() : '';
  const selection = typeof item?.selection === 'string' ? item.selection.trim() : '';
  if (!fixtureId || !market || !selection) return '';
  const providerFixtureId = typeof item?.providerFixtureId === 'string' ? item.providerFixtureId.trim() : '';
  const line = Number.isFinite(item?.line) ? String(item.line) : '';
  return ['required-league-general', fixtureId, providerFixtureId, market, selection, line].join('|');
}

function formatRequiredLeagueValidationSummaryLines(data) {
  const lines = [];
  const fixtures = Array.isArray(data.coverage?.fixtures) ? data.coverage.fixtures : [];
  for (const fixture of fixtures.slice(0, 4)) {
    const status = stringOrFallback(fixture?.status, 'unknown');
    const icon = status === 'covered' ? '✅' : status === 'missing-predictions' ? '🚫' : '🟡';
    const predictionCount = Number.isFinite(fixture?.predictionCount) ? fixture.predictionCount : 0;
    const promotableCount = Number.isFinite(fixture?.promotableCount) ? fixture.promotableCount : 0;
    const detail = status === 'missing-predictions'
      ? 'sin predicción válida'
      : `${promotableCount} ${promotableCount === 1 ? 'proyección fuerte' : 'proyecciones fuertes'} / ${predictionCount} ${predictionCount === 1 ? 'predicción' : 'predicciones'}`;
    lines.push(`${icon} ${requiredLeagueFixtureLabelWithKickoff(fixture)}:`);
    lines.push(detail);
  }

  const atomic = Array.isArray(data.atomicProjections) ? data.atomicProjections : [];
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  const selectedParlays = parlayProjections.filter((projection) => projection?.status === 'selected').length;
  if (atomic.length || parlayProjections.length) {
    lines.push(`📌 ${atomic.length} ${atomic.length === 1 ? 'predicción obligatoria' : 'predicciones obligatorias'} · 🎛️ ${selectedParlays}/${parlayProjections.length} ${parlayProjections.length === 1 ? 'parlay seleccionado' : 'parlays seleccionados'}`);
  }
  return lines;
}

function formatRequiredLeagueValidationPredictionLines(data) {
  const lines = [];
  const atomic = Array.isArray(data.atomicProjections) ? data.atomicProjections : [];
  for (const projection of atomic.slice(0, 4)) {
    const metrics = [
      `${formatMarketIcon(projection)} ${formatRequiredPick(projection)} @ ${formatMetricNumber(projection?.odds, 2)}`,
      `Conf ${formatPercent(projection?.confidence)}`,
    ].filter(Boolean).join(' · ');
    lines.push(`${requiredLeagueValidationIcon(projection)} ${requiredLeagueFixtureLabel(projection)}`);
    lines.push(`   ${metrics}`);
    lines.push(`   Real: ${formatActualResult(projection)}`);
  }
  return lines;
}

function formatRequiredLeagueValidationGeneralPredictionLines(data) {
  if (!shouldRenderRequiredLeagueGeneralPredictions(data)) return [];
  const predictions = Array.isArray(data.generalPredictions) ? data.generalPredictions : [];
  if (!predictions.length) return [];
  const fixtures = Array.isArray(data.coverage?.fixtures) ? data.coverage.fixtures : [];
  const lines = [];
  const used = new Set();
  for (const fixture of fixtures) {
    const matches = predictions
      .map((prediction, index) => ({ prediction, index }))
      .filter(({ prediction, index }) => !used.has(index) && sameRequiredLeagueFixture(prediction, fixture));
    const groups = groupRequiredLeagueValidationGeneralPredictions(matches.map(({ prediction }) => prediction));
    if (!groups.length) continue;
    lines.push(requiredLeagueFixtureLabel(fixture));
    for (const { index } of matches) used.add(index);
    for (const group of groups.slice(0, 8)) {
      lines.push(`   ${formatRequiredLeagueValidationGeneralPredictionGroup(group)}`);
      const actual = group.predictions.find(hasValidationDetail);
      if (actual) lines.push(`   Real: ${formatActualResult(actual)}`);
    }
  }
  const unmatched = predictions.filter((_, index) => !used.has(index));
  for (const group of groupRequiredLeagueValidationGeneralPredictions(unmatched).slice(0, 8)) {
    lines.push(requiredLeagueFixtureLabel(group.predictions[0]));
    lines.push(`   ${formatRequiredLeagueValidationGeneralPredictionGroup(group)}`);
    const actual = group.predictions.find(hasValidationDetail);
    if (actual) lines.push(`   Real: ${formatActualResult(actual)}`);
  }
  return lines;
}

function groupRequiredLeagueValidationGeneralPredictions(predictions) {
  const groups = new Map();
  for (const prediction of predictions) {
    const line = Number.isFinite(prediction?.line) ? formatMetricNumber(prediction.line, 2) : '';
    const key = [
      requiredLeagueFixtureKeys(prediction)[0] ?? requiredLeagueFixtureLabel(prediction),
      stringOrFallback(prediction?.market, ''),
      stringOrFallback(prediction?.selection, ''),
      line,
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        market: prediction?.market,
        selection: prediction?.selection,
        line: Number.isFinite(prediction?.line) ? prediction.line : undefined,
        odds: [],
        confidence: [],
        predictions: [],
      });
    }
    const group = groups.get(key);
    if (Number.isFinite(prediction?.odds)) group.odds.push(prediction.odds);
    if (Number.isFinite(prediction?.confidence)) group.confidence.push(prediction.confidence);
    group.predictions.push(prediction);
  }
  return [...groups.values()];
}

function formatRequiredLeagueValidationGeneralPredictionGroup(group) {
  const representative = {
    ...group.predictions[0],
    market: group.market,
    selection: group.selection,
    line: group.line,
    odds: meanFinite(group.odds),
    confidence: meanFinite(group.confidence),
  };
  return [
    `${requiredLeagueValidationIcon(group.predictions)} ${formatMarketIcon(representative)} ${formatRequiredPick(representative)} @ ${formatMetricNumber(representative?.odds, 2)}`,
    `Conf ${formatPercent(representative?.confidence)}`,
  ].filter(Boolean).join(' · ');
}

function sameRequiredLeagueFixture(a, b) {
  const keysA = requiredLeagueFixtureKeys(a);
  const keysB = new Set(requiredLeagueFixtureKeys(b));
  return keysA.some((key) => keysB.has(key));
}

function requiredLeagueFixtureKeys(item) {
  return [
    item?.fixtureId,
    item?.providerFixtureId,
    item?.fixture,
    item?.display?.fixtureLabel,
  ].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
}

function requiredLeagueValidationParlayEmbeds(data) {
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  return parlayProjections.map((projection, index) => ({
    title: requiredLeagueValidationParlayTitle(projection, index),
    description: truncate(formatRequiredLeagueValidationParlayBody(projection).map((line) => `> ${line}`).join('\n'), DISCORD_DESCRIPTION_LIMIT),
    color: statusColor(projection.validationStatus),
  }));
}

function formatRequiredLeagueValidationParlayMessageLines(data) {
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  const lines = [];
  for (const [index, projection] of parlayProjections.entries()) {
    lines.push(requiredLeagueValidationParlayTitle(projection, index));
    lines.push(...formatRequiredLeagueValidationParlayBody(projection).map((line) => `> ${line}`));
    lines.push('');
  }
  return lines;
}

function requiredLeagueValidationParlayTitle(projection, index) {
  const profile = stringOrFallback(projection?.profile, 'profile unknown');
  const legs = Array.isArray(projection?.legs) ? projection.legs : [];
  const title = legs.slice(0, 4).map(requiredLeagueFixtureLabel).join(' + ');
  const extra = legs.length > 4 ? ` +${legs.length - 4}` : '';
  return truncate([
    `${rankEmoji(index + 1)} ${statusIcon(projection.validationStatus)} ${parlayProfileEmoji(profile)} ${profile}`,
    title ? `${title}${extra}` : undefined,
  ].filter(Boolean).join(' · '), 256);
}

function formatRequiredLeagueValidationParlayBody(projection) {
  const legs = Array.isArray(projection?.legs) ? projection.legs : [];
  const lines = [];
  for (const leg of legs.slice(0, 8)) {
    lines.push(`${statusIcon(leg.validationStatus)} ${formatMarketIcon(leg)} ${requiredLeagueFixtureLabel(leg)}: ${formatRequiredPick(leg)} @ ${formatMetricNumber(leg?.odds, 2)}`);
    lines.push(`   Real: ${formatActualResult(leg)}`);
  }
  if (!legs.length) lines.push(formatRequiredLeagueBlockedReason(projection));
  lines.push(formatRequiredLeagueValidationParlayMetricLine(projection));
  return lines.filter(Boolean);
}

function formatRequiredLeagueValidationParlayMetricLine(projection) {
  const status = normalizeStatus(projection.validationStatus);
  return [
    `📊 Resultado ${statusIcon(status)} ${status}`,
    `Odds ${formatMetricNumber(projection.combinedOdds, 2)}`,
    `🍀 Conf ${formatPercent(projection.aggregateConfidence)}`,
  ].filter(Boolean).join(' · ');
}

function formatRequiredLeagueBlockedReason(projection) {
  const reasons = Array.isArray(projection?.reasons) ? projection.reasons : [];
  if (String(projection?.status) === 'blocked') return 'No publicado: sin cupón válido.';
  return stringOrFallback(reasons[0], 'Sin detalle de selecciones.');
}

function hasValidationDetail(item) {
  return Boolean(item?.validationActual || item?.validationReason);
}

function requiredLeagueValidationIcon(itemOrItems) {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  const validationStatuses = items
    .map((item) => item?.validationStatus)
    .filter((status) => typeof status === 'string' && status.trim());
  if (validationStatuses.length) {
    return statusIcon(aggregateRecommendationStatus(validationStatuses.map((status) => ({ validationStatus: status })), undefined));
  }
  const statuses = items.map((item) => stringOrFallback(item?.status, 'review-required'));
  if (statuses.includes('promotable') || statuses.includes('selected')) return '✅';
  if (statuses.includes('blocked')) return '🚫';
  return '🟡';
}

function meanFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : undefined;
}

function countRecommendationStatuses(recommendations) {
  const counts = { won: 0, lost: 0, voided: 0, pending: 0, blocked: 0, unvalidated: 0, unknown: 0 };
  for (const recommendation of Array.isArray(recommendations) ? recommendations : []) {
    counts[normalizeStatus(recommendation?.validationStatus)] += 1;
  }
  return counts;
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

function formatValidationMirrorMetricLine(recommendation, status) {
  const stake = formatStakeRecommendation(recommendation);
  const parts = [
    `📊 Resultado ${statusIcon(status)} ${status}`,
    `Odds ${formatMetricNumber(recommendation.combinedOdds, 4)}`,
    `🍀 Conf ${formatPercent(recommendation.aggregateConfidence)}`,
    `📈 Edge ${formatPercent(recommendation.expectedEdge)}`,
    stake ? `💵 Stake ${stake}` : undefined,
  ];
  if (!stake) parts.push(`📌 Expo ${formatExposurePercent(recommendation)}`);
  return parts.filter(Boolean).join(' · ');
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

function formatActualResult(leg) {
  const actual = leg?.validationActual;
  if (actual && typeof actual === 'object') {
    const summary = typeof actual.summary === 'string' && actual.summary.trim() ? actual.summary.trim() : '';
    const score = formatActualScore(actual.fixture);
    if (leg.market === 'corners_over_under') {
      const corners = formatActualCorners(actual.statistics);
      if (corners) return corners;
      if (/corners/i.test(summary)) return summary;
      return score ? `corners no disponibles (${score})` : 'corners no disponibles';
    }
    if (leg.market === 'goals_over_under') {
      const goals = actual.fixture ? num(actual.fixture.scoreHome) + num(actual.fixture.scoreAway) : undefined;
      return Number.isFinite(goals) ? `goles totales ${goals}${score ? ` (${score})` : ''}` : score || 'score no disponible';
    }
    if (leg.market === 'btts') {
      if (actual.fixture && Number.isFinite(actual.fixture.scoreHome) && Number.isFinite(actual.fixture.scoreAway)) {
        const yesNo = actual.fixture.scoreHome > 0 && actual.fixture.scoreAway > 0 ? 'SI' : 'NO';
        return `BTTS ${yesNo} (${formatActualScore(actual.fixture)})`;
      }
      return score || 'score no disponible';
    }
    if (score) return score;
    if (summary) return summary;
  }
  const reason = leg?.validationReason;
  if (reason === 'fixture-cancelled') return 'partido cancelado';
  if (reason === 'fixture-not-completed') return 'partido pendiente/no finalizado';
  if (reason === 'corners-statistics-unavailable') return 'corners no disponibles';
  if (reason === 'final-score-unavailable') return 'score final no disponible';
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  return 'no disponible en artifact';
}

function formatActualScore(fixture) {
  if (!fixture || typeof fixture !== 'object') return '';
  if (Number.isFinite(fixture.scoreHome) && Number.isFinite(fixture.scoreAway)) return `${fixture.scoreHome}-${fixture.scoreAway}`;
  return '';
}

function formatActualCorners(statistics) {
  if (!statistics || typeof statistics !== 'object') return '';
  if (Number.isFinite(statistics.totalCorners) && Number.isFinite(statistics.cornersHome) && Number.isFinite(statistics.cornersAway)) {
    return `corners totales ${statistics.totalCorners} (${statistics.cornersHome}-${statistics.cornersAway})`;
  }
  if (Number.isFinite(statistics.totalCorners)) return `corners totales ${statistics.totalCorners}`;
  if (Number.isFinite(statistics.cornersHome) && Number.isFinite(statistics.cornersAway)) {
    return `corners ${statistics.cornersHome}-${statistics.cornersAway} (total ${statistics.cornersHome + statistics.cornersAway})`;
  }
  return '';
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
  const index = {
    byPredictionId: new Map(),
    byArtifactSelectionId: new Map(),
    byFixtureId: new Map(),
  };
  if (!Array.isArray(validationArtifact?.validations)) return index;
  for (const validation of validationArtifact.validations) {
    addValidationIndexEntry(index, validation);
    for (const legOutcome of Array.isArray(validation?.outcome?.legOutcomes) ? validation.outcome.legOutcomes : []) {
      addValidationIndexEntry(index, legOutcome);
    }
  }
  return index;
}

function addValidationIndexEntry(index, validation) {
  if (!validation || typeof validation !== 'object') return;
  const predictionId = typeof validation?.predictionId === 'string' ? validation.predictionId.trim() : '';
  if (predictionId) index.byPredictionId.set(predictionId, validation);
  const artifactSelectionId = typeof validation?.metadata?.artifactSelectionId === 'string'
    ? validation.metadata.artifactSelectionId.trim()
    : '';
  if (artifactSelectionId) index.byArtifactSelectionId.set(artifactSelectionId, validation);
  const fixtureId = typeof validation?.fixtureId === 'string' ? validation.fixtureId.trim() : '';
  if (fixtureId && resolveValidationActual(validation)) {
    const current = index.byFixtureId.get(fixtureId);
    const nextActual = resolveValidationActual(validation);
    const currentActual = resolveValidationActual(current);
    if (!current || (hasActualStatistics(nextActual) && !hasActualStatistics(currentActual))) {
      index.byFixtureId.set(fixtureId, validation);
    }
  }
}

function applyValidationOverlay(recommendation, validationIndex) {
  const legs = Array.isArray(recommendation.legs)
    ? recommendation.legs.map((leg) => {
      const validation = validationIndex.byPredictionId.get(leg?.predictionId);
      return {
        ...leg,
        validationStatus: resolveLegStatus(leg, validation),
        validationReason: validation?.reason || validation?.outcome?.reason || leg?.validationReason,
        validationActual: resolveValidationActual(validation),
      };
    })
    : [];
  return {
    ...recommendation,
    legs,
    validationStatus: aggregateRecommendationStatus(legs, recommendation.validationStatus),
  };
}

function resolveValidationActual(validation) {
  if (!validation || typeof validation !== 'object') return undefined;
  if (validation.actual && typeof validation.actual === 'object') return validation.actual;
  const resultInput = validation.resultInput;
  if (resultInput && typeof resultInput === 'object') {
    return {
      fixture: resultInput.fixture,
      statistics: resultInput.statistics,
    };
  }
  return undefined;
}

function hasActualStatistics(actual) {
  return Boolean(actual?.statistics && typeof actual.statistics === 'object');
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

function recommendationMetricSnapshot(metricSnapshot, options = {}) {
  const artifact = options.recommendationArtifact;
  if (!artifact || typeof artifact !== 'object') return metricSnapshot;
  const validationIndex = buildValidationIndex(options.validationArtifact);
  const max = parseMaxRecommendations(String(options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS));
  const recommendations = selectRecommendations(artifact)
    .slice(0, Math.min(max, DEFAULT_MAX_RECOMMENDATIONS))
    .map((recommendation) => applyValidationOverlay(recommendation, validationIndex));
  const atomic = recommendations.filter((recommendation) => recommendationKind(recommendation) === 'atomic-prediction');
  const parlays = recommendations.filter((recommendation) => recommendationKind(recommendation) !== 'atomic-prediction');
  return {
    ...metricSnapshot,
    predictionMetrics: summarizeRecommendationMetrics(atomic, true),
    parlayMetrics: summarizeRecommendationMetrics(parlays, false),
  };
}

function summarizeRecommendationMetrics(recommendations, includeEdge) {
  const rows = recommendations.map((recommendation) => ({
    status: normalizeStatus(recommendation.validationStatus),
    odds: finiteOrNull(recommendation.combinedOdds),
    confidence: finiteOrNull(recommendation.aggregateConfidence),
    edge: finiteOrNull(recommendation.expectedEdge),
    provider: stringOrFallback(recommendation.providerAgentic ?? recommendation.provider, 'publicadas'),
  }));
  const settled = rows.filter((row) => row.status === 'won' || row.status === 'lost').length;
  const won = rows.filter((row) => row.status === 'won').length;
  const lost = rows.filter((row) => row.status === 'lost').length;
  const metrics = {
    total: rows.length,
    won,
    lost,
    voided: rows.filter((row) => row.status === 'voided').length,
    pending: rows.filter((row) => row.status === 'pending').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
    unvalidated: rows.filter((row) => row.status === 'unvalidated' || row.status === 'unknown').length,
    settled,
    hitRate: settled ? (won / settled) * 100 : null,
    avgOdds: meanFinite(rows.map((row) => row.odds)),
    avgConfidence: meanFinite(rows.map((row) => row.confidence)),
    byProvider: summarizeRecommendationProviderBuckets(rows, includeEdge),
  };
  if (includeEdge) metrics.avgEdge = meanFinite(rows.map((row) => row.edge));
  return metrics;
}

function summarizeRecommendationProviderBuckets(rows, includeEdge) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.provider || 'publicadas';
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return [...grouped.entries()].map(([key, values]) => {
    const settled = values.filter((row) => row.status === 'won' || row.status === 'lost').length;
    const won = values.filter((row) => row.status === 'won').length;
    const lost = values.filter((row) => row.status === 'lost').length;
    const bucket = {
      key,
      label: key,
      total: values.length,
      won,
      lost,
      voided: values.filter((row) => row.status === 'voided').length,
      pending: values.filter((row) => row.status === 'pending').length,
      blocked: values.filter((row) => row.status === 'blocked').length,
      unvalidated: values.filter((row) => row.status === 'unvalidated' || row.status === 'unknown').length,
      settled,
      hitRate: settled ? (won / settled) * 100 : null,
      avgOdds: meanFinite(values.map((row) => row.odds)),
      avgConfidence: meanFinite(values.map((row) => row.confidence)),
    };
    if (includeEdge) bucket.avgEdge = meanFinite(values.map((row) => row.edge));
    return bucket;
  }).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
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

function chunkLinesByLimit(lines, limit) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    const addition = current.length ? line.length + 1 : line.length;
    if (current.length && length + addition > limit) {
      chunks.push(current.join('\n'));
      current = [];
      length = 0;
    }
    current.push(line);
    length += current.length === 1 ? line.length : line.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

function chunkPayloadEmbeds(payload, maxEmbeds) {
  if (!Array.isArray(payload?.embeds) || payload.embeds.length <= maxEmbeds) return [payload];
  const chunks = [];
  for (let index = 0; index < payload.embeds.length; index += maxEmbeds) {
    chunks.push({
      ...payload,
      embeds: payload.embeds.slice(index, index + maxEmbeds),
    });
  }
  return chunks;
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
