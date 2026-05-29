#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';

const DEFAULT_TARGET = 'discord:1494071165453467721';

const args = parseArgs(process.argv.slice(2));
const artifactPath = resolve(args.artifact);
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const payload = buildPayload(artifact);

if (args.dryRun) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  if (args.transport !== 'discord-native') throw new Error('gana-council-review-notify currently supports --transport discord-native.');
  const result = sendDiscordNativePayload(args.gatewayTarget, payload);
  console.log(JSON.stringify({ ok: true, artifact: artifactPath, target: args.gatewayTarget, result }, null, 2));
}

function buildPayload(artifact) {
  const council = objectRecord(artifact.council);
  const reviews = Array.isArray(council.reviews) ? council.reviews : [];
  const candidateRecommendations = Array.isArray(artifact.councilCandidateRecommendations)
    ? artifact.councilCandidateRecommendations
    : Array.isArray(artifact.recommendations)
      ? artifact.recommendations
      : [];
  const status = stringValue(council.status, 'review-required');
  const color = status === 'approved' ? 0x2ecc71 : status === 'blocked' ? 0xe74c3c : 0xf1c40f;
  const rows = reviews.map((review, index) => ({
    review,
    recommendation: candidateRecommendations[index] ?? null,
    index,
  }));
  const keptRows = rows.filter(({ review }) => ['approve', 'review'].includes(stringValue(review.decision)));
  const rejectedRows = rows.filter(({ review }) => stringValue(review.decision) === 'reject');
  const published = Array.isArray(artifact.recommendations) ? artifact.recommendations : [];
  const publishedParlays = published.filter((recommendation) => recommendation.kind === 'parlay').length;
  const publishedSimples = published.filter((recommendation) => recommendation.kind === 'atomic-prediction').length;
  const publishLines = keptRows.slice(0, 8).map(publishLine);
  const blockedLines = rejectedRows.slice(0, 6).map(blockedLine);

  return {
    username: 'Gana Hermes',
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [
      {
        title: '🧠 Gana v9 · Council',
        description: [
          `📅 ${stringValue(artifact.date, 'unknown')}`,
          `Publicar/revisar: ${published.length} (${publishedParlays} parlays · ${publishedSimples} simples)`,
          `No publicar: ${rejectedRows.length}`,
          `Estado: ${friendlyStatus(status)}`,
          '⚠️ Tracking analítico · Sin ejecución monetaria',
        ].join('\n'),
        color,
      },
      {
        title: 'Publicar / revisar',
        description: publishLines.length ? publishLines.join('\n\n').slice(0, 3900) : 'No hay picks para publicar.',
        color,
      },
      {
        title: 'No publicar',
        description: [
          blockedLines.length ? blockedLines.join('\n\n').slice(0, 3600) : 'Nada bloqueado por el council.',
          '',
          'Regla simple: se bloquea si tiene edge negativo, riesgo duro, edge inflado, confianza baja o no llega al corte de revisión.',
        ].join('\n'),
        color,
      },
    ],
  };
}

function publishLine({ review, recommendation, index }) {
  const decision = stringValue(review.decision, 'review');
  const icon = decision === 'approve' ? '✅' : '⚠️';
  const title = recommendationTitle(recommendation, review);
  const focus = focusText(review);
  const focusSuffix = focus ? ` · Enfoque: ${focus}` : '';
  return `${index + 1}. ${icon} ${title}\n${recommendationMetrics(recommendation)}${focusSuffix}\nMotivo: ${decision === 'approve' ? 'pasa el gate completo' : 'pasa el corte de revisión; requiere revisión manual'}`;
}

function blockedLine({ review, recommendation, index }) {
  const title = recommendationTitle(recommendation, review);
  return `${index + 1}. ⛔ ${title}\n${recommendationMetrics(recommendation)}\nMotivo: ${blockerText(review)}`;
}

function recommendationTitle(recommendation, review) {
  const item = objectRecord(recommendation);
  const kind = stringValue(item.kind, stringValue(review.kind, 'pick'));
  const legs = Array.isArray(item.legs) ? item.legs : [];
  if (kind === 'atomic-prediction') {
    const leg = objectRecord(legs[0]);
    return `Simple · ${legFixtureLabel(leg)} · ${formatSelection(leg)}`;
  }
  const labels = legs.slice(0, 2).map((leg) => legFixtureLabel(objectRecord(leg))).filter(Boolean);
  return labels.length ? `Parlay · ${labels.join(' + ')}` : `Parlay · ${stringValue(item.parlayId, 'sin-id')}`;
}

function recommendationMetrics(recommendation) {
  const item = objectRecord(recommendation);
  const stake = objectRecord(item.stakeRecommendation);
  return [
    `Odds ${formatNumber(item.combinedOdds, 3)}`,
    `Conf ${formatPercent(item.aggregateConfidence)}`,
    `Edge ${formatSignedPercent(item.expectedEdge)}`,
    `Stake ${formatNumber(stake.stake, 0)}`,
  ].join(' · ');
}

function focusText(review) {
  const signals = Array.isArray(review.signals) ? review.signals : [];
  const labels = signals.flatMap((signal) => {
    if (signal === 'low-odds') return ['low odds'];
    if (signal === 'women-youth-development') return ['femenil/sub'];
    if (signal === 'provider-consensus') return ['consenso'];
    if (signal === 'council-composed') return ['parlay armado por council'];
    return [];
  });
  return [...new Set(labels)].join(', ');
}

function blockerText(review) {
  const reasons = Array.isArray(review.reasons) ? review.reasons.join(' ') : '';
  const match = reasons.match(/blockers:\s*([^;]+)/i);
  const blockers = match?.[1]?.split(',').map((value) => value.trim()) ?? [];
  const labels = blockers.map((blocker) => ({
    'negative-edge': 'edge negativo',
    'hard-risk-flag': 'riesgo duro',
    'confidence-below-review-gate': 'confianza baja',
    'edge-below-review-gate': 'edge bajo',
    'score-below-review-gate': 'no alcanza el corte',
  }[blocker] ?? blocker));
  return labels.length ? labels.join(', ') : 'no pasa el corte de revisión';
}

function friendlyStatus(status) {
  if (status === 'approved') return 'hay aprobadas';
  if (status === 'blocked') return 'todo bloqueado';
  return 'requiere revisión manual';
}

function legFixtureLabel(leg) {
  const display = objectRecord(leg.display);
  return readableFixtureLabel(display.fixtureLabel)
    || readableFixtureLabel(leg.fixture)
    || shortId(stringValue(leg.fixtureId, 'fixture'));
}

function readableFixtureLabel(value) {
  const label = stringValue(value);
  return label && !isUuidFixtureLabel(label) ? label : '';
}

function formatSelection(leg) {
  const market = stringValue(leg.market, 'market');
  const selection = stringValue(leg.selection, 'selection');
  const line = leg.line === null || leg.line === undefined ? '' : ` ${leg.line}`;
  if (market === 'goals_over_under') return `goals ${selection}${line}`;
  return `${market} ${selection}${line}`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `${(number * 100).toFixed(2)}%`;
}

function formatSignedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  const sign = number > 0 ? '+' : '';
  return `${sign}${(number * 100).toFixed(2)}%`;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return number.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function shortId(value) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function isUuidFixtureLabel(value) {
  const normalized = stringValue(value);
  if (isUuidLike(normalized)) return true;
  const parts = normalized.split(/\s+vs\.?\s+/i);
  return parts.length === 2 && parts.every(isUuidLike);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim());
}

function parseArgs(argv) {
  const parsed = {
    artifact: '',
    transport: 'discord-native',
    gatewayTarget: process.env.GANA_DISCORD_TARGET ?? DEFAULT_TARGET,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') parsed.artifact = requireValue(argv, ++index, arg);
    else if (arg === '--transport') parsed.transport = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--dry-run') parsed.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!parsed.artifact) throw new Error('--artifact is required.');
  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
