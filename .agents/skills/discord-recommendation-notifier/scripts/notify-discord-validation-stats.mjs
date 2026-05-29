#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  sendDiscordNativePayload,
  sendDiscordPayload,
  sendHermesGatewayMessage,
} from './notify-discord-recommendations.mjs';
import { resolveDiscordTarget } from './discord-targets.mjs';

const DEFAULT_TRANSPORT = 'discord-native';
const DEFAULT_HERMES_PYTHON = '/Users/luisalvarado/.hermes/hermes-agent/venv/bin/python3';

export function parseArgs(argv) {
  const args = {
    metricsArtifact: undefined,
    validationsArtifact: undefined,
    date: undefined,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    transport: DEFAULT_TRANSPORT,
    gatewayTarget: undefined,
    hermesPython: process.env.HERMES_GATEWAY_PYTHON || DEFAULT_HERMES_PYTHON,
    dryRun: false,
    username: 'Gana Hermes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--metrics-artifact') args.metricsArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--validations-artifact') args.validationsArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--date') args.date = requireValue(argv, ++index, arg);
    else if (arg === '--webhook-url') args.webhookUrl = requireValue(argv, ++index, arg);
    else if (arg === '--transport') args.transport = parseTransport(requireValue(argv, ++index, arg));
    else if (arg === '--gateway-target') args.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--hermes-python') args.hermesPython = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--username') args.username = requireValue(argv, ++index, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  args.gatewayTarget = resolveDiscordTarget('validation', { gatewayTarget: args.gatewayTarget });
  return args;
}

export function loadValidationStats(options) {
  if (!options.metricsArtifact) throw new Error('--metrics-artifact is required.');
  const metricsPath = resolve(options.metricsArtifact);
  const metricsArtifact = JSON.parse(readFileSync(metricsPath, 'utf8'));
  const snapshot = Array.isArray(metricsArtifact.metrics) ? metricsArtifact.metrics[0] : undefined;
  if (!snapshot) throw new Error(`No metric snapshot found in ${metricsPath}`);

  let validationsArtifact;
  let validationsPath;
  if (options.validationsArtifact) {
    validationsPath = resolve(options.validationsArtifact);
    validationsArtifact = JSON.parse(readFileSync(validationsPath, 'utf8'));
  }

  return {
    metricsPath,
    validationsPath,
    metricsArtifact,
    validationsArtifact,
    snapshot,
  };
}

export function buildValidationStatsPayload(stats, options = {}) {
  const snapshot = stats.snapshot;
  const validations = Array.isArray(stats.validationsArtifact?.validations)
    ? stats.validationsArtifact.validations
    : [];
  const gateVerdict = stringOrFallback(stats.validationsArtifact?.gateResult?.verdict, 'unknown');
  const predictionMetrics = snapshot.predictionMetrics ?? emptyMetrics();
  const parlayMetrics = snapshot.parlayMetrics ?? emptyMetrics();
  const settled = numberOrZero(predictionMetrics.settled) + numberOrZero(parlayMetrics.settled);
  const open = numberOrZero(predictionMetrics.pending) + numberOrZero(predictionMetrics.unvalidated)
    + numberOrZero(parlayMetrics.pending) + numberOrZero(parlayMetrics.unvalidated);

  return {
    username: stringOrFallback(options.username, 'Gana Hermes'),
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [
      {
        title: '📊 Gana v9 · Validaciones del día anterior',
        description: [
          `📅 ${snapshot.metricDate} · ${snapshot.timezone}`,
          `✅ ${settled} liquidadas · ⏳ ${open} pendientes/sin validar`,
          `🟡 validate ${gateVerdict} · artifacts ${validations.length}`,
          '⚠️ Estadística analítica · Sin ejecución monetaria',
        ].join('\n'),
        color: 0x2f80ed,
        footer: { text: 'Gana Hermes · Discord native embeds' },
        timestamp: new Date().toISOString(),
      },
      metricEmbed('🎯 Predicciones', predictionMetrics, {
        buckets: topBuckets(predictionMetrics.byMarket),
        color: 0x9b51e0,
      }),
      metricEmbed('📦 Parlays', parlayMetrics, {
        buckets: topBuckets(parlayMetrics.byProfile),
        color: 0xf2c94c,
      }),
      {
        description: '🛡️ Revisar métricas, pendientes y muestras pequeñas antes de ajustar promoción.',
        color: 0x56ccf2,
      },
    ],
  };
}

export function buildValidationStatsMessage(stats) {
  const payload = buildValidationStatsPayload(stats);
  return payload.embeds.map((embed) => [
    embed.title,
    embed.description,
  ].filter(Boolean).join('\n')).join('\n\n━━━━━━━━━━━━━━━━━━\n\n');
}

function metricEmbed(title, metrics, options) {
  const lines = [
    `> Total ${numberOrZero(metrics.total)} · ✅ ${numberOrZero(metrics.won)}W-${numberOrZero(metrics.lost)}L · ↩️ ${numberOrZero(metrics.voided)} void`,
    `> 📈 Hit ${formatNullablePercent(metrics.hitRate)} · ⏳ ${numberOrZero(metrics.pending)} pending · 🧾 ${numberOrZero(metrics.unvalidated)} unvalidated`,
    `> 📊 Avg odds ${formatNullableNumber(metrics.avgOdds, 2)} · 🧠 Avg conf ${formatNullablePercent(metrics.avgConfidence)}${metrics.avgEdge === undefined ? '' : ` · Edge ${formatNullablePercent(metrics.avgEdge)}`}`,
  ];
  if (options.buckets.length) {
    lines.push(`> 🔎 Top ${options.buckets.map((bucket) => `${bucket.label}: ${bucket.won}-${bucket.lost} (${formatNullablePercent(bucket.hitRate)})`).join(' · ')}`);
  }
  return {
    title,
    description: lines.join('\n'),
    color: options.color,
  };
}

function topBuckets(buckets) {
  if (!Array.isArray(buckets)) return [];
  return [...buckets]
    .filter((bucket) => numberOrZero(bucket.total) > 0)
    .sort((a, b) => numberOrZero(b.settled) - numberOrZero(a.settled) || numberOrZero(b.total) - numberOrZero(a.total))
    .slice(0, 3);
}

function emptyMetrics() {
  return {
    total: 0,
    won: 0,
    lost: 0,
    voided: 0,
    pending: 0,
    blocked: 0,
    unvalidated: 0,
    settled: 0,
    hitRate: null,
    avgOdds: null,
    avgConfidence: null,
  };
}

function stringOrFallback(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function formatNullableNumber(value, digits) {
  return Number.isFinite(value) ? Number(value).toFixed(digits).replace(/\.?0+$/, '') : 'n/a';
}

function formatNullablePercent(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${formatNullableNumber(percent, 2)}%`;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseTransport(value) {
  if (value === 'discord-native' || value === 'hermes-gateway' || value === 'webhook') return value;
  throw new Error('--transport must be discord-native, hermes-gateway, or webhook.');
}

function printHelp() {
  console.log([
    'Usage:',
    '  node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-validation-stats.mjs --metrics-artifact PATH [--validations-artifact PATH]',
    '',
    'Options:',
    '  --transport discord-native|hermes-gateway|webhook',
    '  --gateway-target discord:CHANNEL_ID',
    '  --dry-run',
  ].join('\n'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const stats = loadValidationStats(args);
  const payload = buildValidationStatsPayload(stats, args);
  const gatewayMessage = buildValidationStatsMessage(stats);

  if (args.dryRun) {
    console.log(JSON.stringify({
      metricsArtifact: stats.metricsPath,
      validationsArtifact: stats.validationsPath,
      transport: args.transport,
      gatewayTarget: args.gatewayTarget,
      payload,
      gatewayMessage,
    }, null, 2));
    return;
  }

  let result;
  if (args.transport === 'webhook') {
    result = await sendDiscordPayload(args.webhookUrl, payload);
  } else if (args.transport === 'hermes-gateway') {
    result = sendHermesGatewayMessage(args.gatewayTarget, gatewayMessage, { hermesPython: args.hermesPython });
  } else {
    result = sendDiscordNativePayload(args.gatewayTarget, payload, { hermesPython: args.hermesPython });
  }

  console.log(JSON.stringify({
    metricsArtifact: stats.metricsPath,
    validationsArtifact: stats.validationsPath,
    transport: args.transport,
    gatewayTarget: args.gatewayTarget,
    discordResult: result,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err?.stack ?? err?.message ?? String(err));
    process.exitCode = 1;
  });
}
