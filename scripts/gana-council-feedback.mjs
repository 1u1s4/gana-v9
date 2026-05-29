#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { resolveDiscordTarget } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';

const args = parseArgs(process.argv.slice(2));
const recommendationPath = resolve(args.recommendationArtifact);
const validationPath = resolve(args.validationArtifact);
const recommendationArtifact = JSON.parse(readFileSync(recommendationPath, 'utf8'));
const validationArtifact = JSON.parse(readFileSync(validationPath, 'utf8'));
const feedback = buildCouncilFeedback(recommendationArtifact, validationArtifact, recommendationPath, validationPath);
const feedbackPath = join(dirname(recommendationPath), 'council-feedback.json');

const payload = buildPayload(feedback);
if (args.dryRun) {
  console.log(JSON.stringify({ dryRun: true, artifact: feedbackPath, target: args.gatewayTarget, payload }, null, 2));
} else {
  writeFileSync(feedbackPath, `${JSON.stringify(feedback, null, 2)}\n`);
  if (args.transport !== 'discord-native') throw new Error('gana-council-feedback currently supports --transport discord-native.');
  const result = sendDiscordNativePayload(args.gatewayTarget, payload);
  console.log(JSON.stringify({ ok: true, artifact: feedbackPath, target: args.gatewayTarget, result }, null, 2));
}

function buildCouncilFeedback(recommendationArtifact, validationArtifact, recommendationPath, validationPath) {
  const validations = Array.isArray(validationArtifact.validations) ? validationArtifact.validations : [];
  const byPrediction = new Map();
  const byParlay = new Map();
  for (const validation of validations) {
    if (typeof validation?.predictionId === 'string') byPrediction.set(validation.predictionId, validation.status ?? 'unvalidated');
    if (typeof validation?.parlayId === 'string') byParlay.set(validation.parlayId, validation.status ?? 'unvalidated');
  }
  const recommendations = Array.isArray(recommendationArtifact.recommendations) ? recommendationArtifact.recommendations : [];
  const items = recommendations.map((recommendation, index) => {
    const parlayStatus = typeof recommendation.parlayId === 'string' ? byParlay.get(recommendation.parlayId) : undefined;
    const legStatuses = (Array.isArray(recommendation.legs) ? recommendation.legs : [])
      .map((leg) => typeof leg?.predictionId === 'string' ? byPrediction.get(leg.predictionId) : undefined)
      .filter(Boolean);
    const status = parlayStatus ?? aggregateStatuses(legStatuses);
    const decision = recommendation.councilDecision?.decision ?? 'unknown';
    return {
      rank: recommendation.rank ?? index + 1,
      kind: recommendation.kind ?? 'parlay',
      parlayId: recommendation.parlayId ?? null,
      predictionId: recommendation.predictionId ?? null,
      councilDecision: decision,
      councilScore: recommendation.councilDecision?.score ?? null,
      status,
      legStatuses,
      signals: recommendation.councilDecision?.signals ?? [],
    };
  });
  const settled = items.filter((item) => item.status === 'won' || item.status === 'lost');
  const won = items.filter((item) => item.status === 'won').length;
  const lost = items.filter((item) => item.status === 'lost').length;

  return {
    generatedAt: new Date().toISOString(),
    date: recommendationArtifact.date ?? validationArtifact.target?.date ?? null,
    recommendationArtifact: recommendationPath,
    validationArtifact: validationPath,
    summary: {
      total: items.length,
      won,
      lost,
      pending: items.filter((item) => item.status === 'pending').length,
      unvalidated: items.filter((item) => item.status === 'unvalidated').length,
      hitRate: settled.length ? round(won / settled.length, 4) : null,
    },
    byCouncilDecision: groupBy(items, (item) => item.councilDecision),
    bySignal: groupBy(items.flatMap((item) => item.signals.map((signal) => ({ ...item, signal }))), (item) => item.signal),
    items,
    feedbackActions: [
      'promote thresholds only from approved/reviewed published recommendations',
      'compare low-odds and women/youth buckets against global published hit rate',
      'inspect rejected-risk false negatives before relaxing blockers',
    ],
  };
}

function buildPayload(feedback) {
  const hit = feedback.summary.hitRate === null ? 'n/a' : `${round(feedback.summary.hitRate * 100, 1)}%`;
  const lines = feedback.items.slice(0, 12).map((item) => {
    const icon = item.status === 'won' ? '✅' : item.status === 'lost' ? '❌' : item.status === 'pending' ? '⏳' : '⚪';
    const score = Number.isFinite(Number(item.councilScore)) ? Number(item.councilScore).toFixed(3) : 'n/a';
    return `${item.rank}. ${icon} ${item.status} · ${item.councilDecision} · score ${score}`;
  });
  return {
    username: 'Gana Hermes',
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [
      {
        title: '🧠 Gana v9 · Feedback del council',
        description: [
          `📅 ${feedback.date ?? 'unknown'}`,
          `✅ ${feedback.summary.won} · ❌ ${feedback.summary.lost} · ⏳ ${feedback.summary.pending} · ⚪ ${feedback.summary.unvalidated}`,
          `📈 Hit publicado ${hit}`,
          '⚠️ Tracking analítico · Sin ejecución monetaria',
        ].join('\n'),
        color: feedback.summary.lost > feedback.summary.won ? 0xe74c3c : 0x2ecc71,
      },
      {
        title: 'Recomendaciones publicadas',
        description: lines.length ? lines.join('\n').slice(0, 3900) : 'Sin recomendaciones publicadas para feedback.',
        color: 0x3498db,
      },
      {
        title: 'Ajustes para el siguiente ciclo',
        description: feedback.feedbackActions.map((item) => `• ${item}`).join('\n'),
        color: 0x9b59b6,
      },
    ],
  };
}

function aggregateStatuses(statuses) {
  if (!statuses.length) return 'unvalidated';
  if (statuses.includes('lost')) return 'lost';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.every((status) => status === 'won')) return 'won';
  if (statuses.every((status) => status === 'voided')) return 'voided';
  return 'unvalidated';
}

function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    groups[key] ??= { total: 0, won: 0, lost: 0, pending: 0, unvalidated: 0 };
    groups[key].total += 1;
    if (item.status === 'won') groups[key].won += 1;
    else if (item.status === 'lost') groups[key].lost += 1;
    else if (item.status === 'pending') groups[key].pending += 1;
    else groups[key].unvalidated += 1;
  }
  return groups;
}

function parseArgs(argv) {
  const parsed = {
    recommendationArtifact: '',
    validationArtifact: '',
    transport: 'discord-native',
    gatewayTarget: undefined,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--recommendation-artifact') parsed.recommendationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--validation-artifact') parsed.validationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--transport') parsed.transport = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') parsed.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!parsed.recommendationArtifact) throw new Error('--recommendation-artifact is required.');
  if (!parsed.validationArtifact) throw new Error('--validation-artifact is required.');
  parsed.gatewayTarget = resolveDiscordTarget('feedback', { gatewayTarget: parsed.gatewayTarget });
  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}
