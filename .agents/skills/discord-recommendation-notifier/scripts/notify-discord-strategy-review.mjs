#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sendDiscordNativePayload } from './notify-discord-recommendations.mjs';

const DEFAULT_TARGET = 'discord:1494071165453467721';
const DEFAULT_TRANSPORT = 'discord-native';
const MAX_CHANGES = 7;
const DESCRIPTION_LIMIT = 3500;
const SUMMARY_LIMIT = 1400;
const CHANGE_BLOCK_LIMIT = 440;

export function parseArgs(argv) {
  const args = {
    artifact: undefined,
    transport: DEFAULT_TRANSPORT,
    gatewayTarget: process.env.GANA_DISCORD_TARGET ?? DEFAULT_TARGET,
    hermesPython: process.env.HERMES_GATEWAY_PYTHON,
    dryRun: false,
    username: 'Gana Hermes',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') args.artifact = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') args.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--transport') args.transport = requireValue(argv, ++index, arg);
    else if (arg === '--hermes-python') args.hermesPython = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--username') args.username = requireValue(argv, ++index, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

export function loadStrategyReview(path) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  if (!artifact || typeof artifact !== 'object') throw new Error(`Invalid strategy-review artifact: ${path}`);
  return artifact;
}

export function buildDiscordPayload(artifact, options = {}) {
  const agent = artifact.agentReview ?? {};
  const history = artifact.historySummary ?? {};
  const predictions = history.predictions ?? {};
  const parlays = history.parlays ?? {};
  const changes = Array.isArray(agent.proposedHarnessChanges) ? agent.proposedHarnessChanges.slice(0, MAX_CHANGES) : [];

  const embeds = [
    {
      title: '🧠 Gana v9 · Strategy Review Harness',
      description: [
        `📅 ${formatDateRange(artifact.dates)} · ${artifact.scope ?? 'strategy-review'}`,
        `🤖 Codex ${artifact.model ?? agent.model ?? 'n/a'} · reasoning ${artifact.reasoningEffort ?? agent.reasoningEffort ?? 'n/a'} · status ${agent.status ?? 'unknown'}`,
        `📌 Predicciones ${num(predictions.total)} · Hit ${formatPct(predictions.hitRate)} · ${num(predictions.won)}W/${num(predictions.lost)}L · ⏳ ${num(predictions.pending)} · ⚪ ${num(predictions.unvalidated)}`,
        `📦 Parlays ${num(parlays.total)} · Hit ${formatPct(parlays.hitRate)} · ${num(parlays.won)}W/${num(parlays.lost)}L · ⏳ ${num(parlays.pending)} · ⚪ ${num(parlays.unvalidated)}`,
      ].join('\n'),
      color: 0x2f80ed,
      footer: { text: 'Gana Hermes · Harness technical review' },
      timestamp: new Date().toISOString(),
    },
  ];

  embeds.push({
    title: 'Resumen técnico',
    description: truncate([
      quote(compact(agent.summary ?? 'Sin resumen del agente.', 420)),
      '',
      '**Patrones efectivos**',
      ...bulletLines(agent.effectivePatterns, 3, 155),
      '',
      '**Fallos recurrentes**',
      ...bulletLines(agent.failurePatterns ?? history.recurringIssues, 4, 155),
    ].join('\n'), SUMMARY_LIMIT),
    color: 0x27ae60,
  });

  if (changes.length) {
    embeds.push(...chunkDescriptions(changes.map(formatChangeBlock), DESCRIPTION_LIMIT).map((description, index) => ({
      title: index === 0 ? 'Cambios Harness propuestos' : 'Cambios Harness propuestos · cont.',
      description,
      color: 0xeb5757,
    })));
  } else {
    embeds.push({
      title: 'Cambios propuestos',
      description: '> No se generaron cambios propuestos en este artifact.',
      color: 0x828282,
    });
  }

  embeds.push({
    description: [
      '🛡️ Artifact analítico: no ejecuta cambios automáticamente.',
      artifact.runId ? `Run: \`${artifact.runId}\`` : undefined,
    ].filter(Boolean).join('\n'),
    color: 0x56ccf2,
  });

  return {
    username: options.username ?? 'Gana Hermes',
    allowed_mentions: { parse: [] },
    content: '',
    embeds,
  };
}

export function buildGatewayMessage(artifact) {
  const agent = artifact.agentReview ?? {};
  const history = artifact.historySummary ?? {};
  const changes = Array.isArray(agent.proposedHarnessChanges) ? agent.proposedHarnessChanges.slice(0, MAX_CHANGES) : [];
  return [
    '🧠 Gana v9 · Strategy Review Harness',
    `📅 ${formatDateRange(artifact.dates)} · ${artifact.scope ?? 'strategy-review'}`,
    `🤖 Codex ${artifact.model ?? agent.model ?? 'n/a'} · reasoning ${artifact.reasoningEffort ?? agent.reasoningEffort ?? 'n/a'} · ${agent.status ?? 'unknown'}`,
    '',
    agent.summary ?? 'Sin resumen del agente.',
    '',
    'Cambios propuestos:',
    ...(changes.length ? changes.map((change, index) => `${index + 1}. [${change.priority ?? 'medium'}] ${change.title ?? 'Cambio propuesto'} — ${formatFiles(change.targetFiles)}`) : ['- Ninguno.']),
    '',
    `Run: ${artifact.runId ?? 'n/a'}`,
    `Weak buckets: ${(history.weakestBuckets ?? []).slice(0, 3).map((bucket) => `${bucket.bucket} ${formatPct(bucket.hitRate)}`).join(', ') || 'n/a'}`,
    '🛡️ Artifact analítico: no ejecuta cambios automáticamente.',
  ].join('\n');
}

export function notifyStrategyReview(options) {
  if (!options.artifact) throw new Error('--artifact is required.');
  const artifactPath = resolve(options.artifact);
  const artifact = loadStrategyReview(artifactPath);
  const payload = buildDiscordPayload(artifact, options);
  const gatewayMessage = buildGatewayMessage(artifact);

  if (options.dryRun) {
    return {
      artifactPath,
      transport: options.transport,
      gatewayTarget: options.gatewayTarget,
      payload,
      gatewayMessage,
    };
  }

  if (options.transport !== 'discord-native') {
    throw new Error('Strategy review notifier currently supports --transport discord-native only.');
  }

  const discordResult = sendDiscordNativePayload(options.gatewayTarget, payload, { hermesPython: options.hermesPython });
  return {
    artifactPath,
    transport: options.transport,
    gatewayTarget: options.gatewayTarget,
    discordResult,
  };
}

function formatDateRange(dates) {
  if (!Array.isArray(dates) || !dates.length) return 'sin fecha';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} → ${dates.at(-1)} (${dates.length} días)`;
}

function bulletLines(items, max, itemLimit = 220) {
  const values = Array.isArray(items) ? items.slice(0, max) : [];
  return values.length ? values.map((item) => `- ${compact(item, itemLimit)}`) : ['- n/a'];
}

function formatFiles(files) {
  return Array.isArray(files) && files.length ? files.join(', ') : 'n/a';
}

function formatPct(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : 'n/a';
}

function num(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

function quote(value) {
  return `> ${String(value).replace(/\n/g, '\n> ')}`;
}

function priorityIcon(priority) {
  if (priority === 'high') return '🔴';
  if (priority === 'medium') return '🟡';
  return '🔵';
}

function singleLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function formatChangeBlock(change, index) {
  const priority = change.priority ?? 'medium';
  const status = change.status ?? 'proposed';
  const title = compact(change.title ?? 'Cambio propuesto', 95);
  const files = compact(formatFiles(change.targetFiles), 120);
  const rationale = compact(change.rationale ?? 'n/a', 135);
  const impact = compact(change.expectedImpact ?? 'n/a', 120);
  const verification = compact(singleLine(change.verification ?? 'n/a'), 115);
  return truncate([
    `**${index + 1}. ${priorityIcon(priority)} ${title}**`,
    `Prioridad: ${priority} · Estado: ${status}`,
    `Archivos: \`${files}\``,
    `Racional: ${rationale}`,
    `Impacto: ${impact}`,
    `Test: \`${verification}\``,
  ].join('\n'), CHANGE_BLOCK_LIMIT);
}

function chunkDescriptions(blocks, limit) {
  const chunks = [];
  let current = '';
  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > limit && current) {
      chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function compact(value, limit) {
  return truncate(singleLine(value), limit);
}

function truncate(value, limit) {
  const text = String(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function usage() {
  return [
    'Usage:',
    '  notify-discord-strategy-review.mjs --artifact PATH [--gateway-target discord:CHANNEL_ID] [--dry-run]',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
  } else {
    console.log(JSON.stringify(notifyStrategyReview(options), null, 2));
  }
}
