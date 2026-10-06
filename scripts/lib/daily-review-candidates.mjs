import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { sendDiscordNativePayload } from '../../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { deliveredReviewRecommendations } from './review-delivery.mjs';

const ARTIFACT_NAME = 'daily-review-candidates.json';
const STALE_WARNING = /stale odds|odds stale|cuotas? obsolet|cuotas? desactualiz/i;
const CANDIDATES_PER_MESSAGE = 8;

export function buildDailyReviewCandidates({
  recommendationArtifact,
  recommendationsPath,
  date,
  dailyBatchId,
  maxSelections = 25,
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceRunIds = uniqueStrings(recommendationArtifact?.sourceRunIds);
  const runsRoot = resolve(dirname(recommendationsPath), '..');
  const fixtures = new Map();
  const predictions = [];
  let evaluated = 0;

  for (const runId of sourceRunIds) {
    if (!safeRunId(runId)) continue;
    const runDir = join(runsRoot, runId);
    for (const fixturePayload of [
      readJson(join(runDir, 'fixtures.json')),
      readJson(join(runDir, 'low-odds-scan.json')),
    ]) {
      for (const fixture of fixtureArray(fixturePayload)) {
        if (fixture?.id) fixtures.set(fixture.id, fixture);
      }
    }
    const scoring = readJson(join(runDir, 'scoring-results.json'));
    const runPredictions = Array.isArray(scoring?.results)
      ? scoring.results.flatMap((result) => Array.isArray(result?.predictions) ? result.predictions : [])
      : [];
    evaluated += runPredictions.length;
    for (const prediction of runPredictions) {
      if (!isReviewCandidate(prediction)) continue;
      const fixture = fixtures.get(prediction.fixtureId);
      predictions.push(normalizeCandidate(prediction, fixture, runId));
    }
  }

  const candidates = dedupeCandidates(predictions).sort(compareCandidates);
  const limit = positiveInteger(maxSelections, 25);
  const displayedCandidates = candidates.slice(0, limit);
  const fingerprint = createHash('sha256').update(JSON.stringify({
    date,
    dailyBatchId,
    sourceRunIds,
    predictionIds: candidates.map((candidate) => candidate.predictionId),
  })).digest('hex');

  return {
    schemaVersion: 1,
    kind: 'daily-review-candidates',
    date,
    dailyBatchId,
    generatedAt,
    status: 'prepared',
    warning: 'Posibles predicciones en revisión. No son recomendaciones aprobadas ni implican ejecución monetaria.',
    sourceRunIds,
    sourceRecommendationsPath: recommendationsPath,
    modelEvidencePath: recommendationArtifact?.modelEvidencePath ?? null,
    preMatchReview: recommendationArtifact?.preMatchReview ?? null,
    fingerprint,
    counts: {
      evaluated,
      candidates: candidates.length,
      displayed: displayedCandidates.length,
      omittedFromDiscord: candidates.length - displayedCandidates.length,
    },
    candidates,
    displayedPredictionIds: displayedCandidates.map((candidate) => candidate.predictionId),
    discord: { target: null, messageIds: [] },
  };
}

export function buildDailyReviewCandidatePayloads(artifact, { username = 'Gana Hermes' } = {}) {
  const displayed = new Set(artifact?.displayedPredictionIds ?? []);
  const candidates = (artifact?.candidates ?? []).filter((candidate) => displayed.has(candidate.predictionId));
  if (!candidates.length) return [];
  const pages = chunk(candidates, CANDIDATES_PER_MESSAGE);
  return pages.map((page, index) => ({
    username,
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [
      {
        title: index === 0
          ? '🟡 Gana v9 · Posibles predicciones en revisión'
          : `🟡 Posibles predicciones · continuación ${index + 1}/${pages.length}`,
        description: [
          `📅 ${artifact.date} · Horarios de Guatemala`,
          `Mostrando ${artifact.counts.displayed} de ${artifact.counts.candidates} candidatas con probabilidad y edge positivos`,
          artifact?.preMatchReview?.version === 'astra-prematch-v1' && artifact.preMatchReview.enabled
            && artifact.preMatchReview.model === 'gpt-6-astra' && artifact.preMatchReview.reasoningEffort === 'medium'
            ? '⚠️ No son picks aprobados · reevaluación automática con Astra medium en las últimas 2 h'
            : '⚠️ No son picks aprobados: requieren revisión manual',
        ].join('\n'),
        color: 0xf2c94c,
      },
      ...page.map(candidateEmbed),
    ],
  }));
}

export async function publishDailyReviewCandidates(input, dependencies = {}) {
  const send = dependencies.sendDiscordNativePayload ?? sendDiscordNativePayload;
  const artifact = buildDailyReviewCandidates(input);
  const artifactPath = join(dirname(input.recommendationsPath), ARTIFACT_NAME);
  const existing = readJson(artifactPath);
  if (['publishing', 'publication-uncertain'].includes(existing?.status)) {
    return { status: 'publication-uncertain', reason: 'previous-review-delivery-requires-reconciliation',
      artifact: existing, artifactPath, messageIds: existing.discord?.messageIds ?? [] };
  }
  if (existing?.status === 'published' && existing?.discord?.messageIds?.length) {
    try {
      deliveredReviewRecommendations(existing);
      if (existing.date !== input.date || existing.dailyBatchId !== input.dailyBatchId) throw new Error('identity mismatch');
      return { status: 'already-published', reason: 'review-cohort-already-delivered', artifact: existing, artifactPath };
    } catch {
      return { status: 'publication-uncertain', reason: 'existing-review-delivery-invalid', artifact: existing, artifactPath };
    }
  }
  if (existsSync(artifactPath) && existing?.status !== 'empty') {
    return { status: 'publication-uncertain', reason: 'existing-review-delivery-invalid', artifact: existing, artifactPath };
  }
  if (!artifact.candidates.length) {
    writeArtifact(artifactPath, { ...artifact, status: 'empty' });
    return { status: 'blocked', reason: 'no-review-candidates', artifact, artifactPath };
  }

  const payloads = buildDailyReviewCandidatePayloads(artifact, input);
  const messageIds = [];
  let current = {
    ...artifact,
    status: 'publishing',
    discord: { target: input.discordTarget, messageIds },
  };
  writeArtifact(artifactPath, current);
  try {
    for (const payload of payloads) {
      const result = await send(input.discordTarget, payload);
      const messageId = discordMessageId(result);
      if (!messageId) throw new Error('Discord review-candidate send returned no message id');
      messageIds.push(messageId);
      current = { ...current, discord: { target: input.discordTarget, messageIds: [...messageIds] } };
      writeArtifact(artifactPath, current);
    }
  } catch (error) {
    current = {
      ...current,
      status: 'publication-uncertain',
      error: error instanceof Error ? error.message : String(error),
      discord: { target: input.discordTarget, messageIds: [...messageIds] },
    };
    writeArtifact(artifactPath, current);
    return { status: 'publication-uncertain', reason: current.error, artifact: current, artifactPath, messageIds };
  }

  current = {
    ...current,
    status: 'published',
    publishedAt: new Date().toISOString(),
    discord: { target: input.discordTarget, messageIds: [...messageIds] },
  };
  writeArtifact(artifactPath, current);
  return { status: 'published', reason: 'review-candidates-published', artifact: current, artifactPath, messageIds };
}

function isReviewCandidate(prediction) {
  if (prediction?.status !== 'review-required') return false;
  if (!prediction.researchBundleId || !prediction.rationale?.trim()
    || !Array.isArray(prediction.evidenceIds) || !prediction.evidenceIds.length
    || !Array.isArray(prediction.claimIds) || !prediction.claimIds.length) return false;
  if (!finiteProbability(prediction.modelProbability ?? prediction.probability)) return false;
  if (!Number.isFinite(prediction.edge) || prediction.edge <= 0) return false;
  if (!Number.isFinite(prediction.odds) || prediction.odds <= 1) return false;
  const warnings = [...(prediction.warnings ?? []), ...(prediction.blockers ?? [])].join(' ');
  return !STALE_WARNING.test(warnings);
}

function normalizeCandidate(prediction, fixture, runId) {
  return {
    predictionId: prediction.id,
    runId,
    fixtureId: prediction.fixtureId,
    providerFixtureId: prediction.providerFixtureId ?? fixture?.providerFixtureId ?? null,
    fixture: fixture ? `${fixture.homeTeamName} vs ${fixture.awayTeamName}` : prediction.providerFixtureId ?? prediction.fixtureId,
    competition: fixture?.competitionName ?? null,
    scheduledAt: fixture?.scheduledAt ?? null,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    modelProbability: prediction.modelProbability ?? prediction.probability,
    edge: prediction.edge,
    confidence: prediction.confidence,
    status: 'review-required',
    rationale: prediction.rationale ?? null,
    evidenceIds: prediction.evidenceIds ?? [],
    claimIds: prediction.claimIds ?? [],
    researchBundleId: prediction.researchBundleId ?? null,
    model: prediction.model ?? null,
    promptVersion: prediction.promptVersion ?? null,
    oddsQuoteId: prediction.oddsQuoteId ?? null,
    oddsSnapshotId: prediction.oddsSnapshotId ?? null,
    blockers: Array.isArray(prediction.blockers) ? prediction.blockers : [],
    warnings: Array.isArray(prediction.warnings) ? prediction.warnings : [],
  };
}

function compareCandidates(left, right) {
  return (right.confidence - left.confidence)
    || (right.edge - left.edge)
    || (right.modelProbability - left.modelProbability)
    || String(left.predictionId).localeCompare(String(right.predictionId));
}

function candidateEmbed(candidate) {
  const line = Number.isFinite(candidate.line) ? ` ${candidate.line}` : '';
  const caveat = candidate.blockers[0] ?? candidate.warnings.find((warning) => !/confidence .*below promotion floor/i.test(warning));
  return {
    title: `⚽ ${candidate.fixture}`,
    description: [
      `**${marketLabel(candidate.market)}:** ${selectionLabel(candidate.selection)}${line}`,
      `Cuota **${candidate.odds.toFixed(2)}** · Prob. modelo **${percent(candidate.modelProbability)}**`,
      `Edge **${percent(candidate.edge)}** · Conf. evidencia **${percent(candidate.confidence)}**`,
      caveat ? `Revisar: ${truncate(caveat, 240)}` : 'Revisar evidencia antes de promover',
    ].join('\n'),
    color: 0xf2c94c,
  };
}

function fixtureArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.candidateFixtures)) return payload.candidateFixtures;
  return [];
}

function dedupeCandidates(candidates) {
  return [...new Map(candidates.filter((candidate) => candidate.predictionId).map((candidate) => [candidate.predictionId, candidate])).values()];
}

function marketLabel(value) {
  return ({ h2h: 'Resultado', double_chance: 'Doble oportunidad', goals_over_under: 'Total de goles', btts: 'Ambos anotan', corners_over_under: 'Total de córners' })[value] ?? value;
}

function selectionLabel(value) {
  return ({ home: 'Local', away: 'Visitante', draw: 'Empate', home_or_draw: 'Local o empate', draw_or_away: 'Empate o visitante', home_or_away: 'Local o visitante', over: 'Más de', under: 'Menos de', yes: 'Sí', no: 'No' })[value] ?? value;
}

function percent(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function truncate(value, max) {
  const text = String(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function chunk(values, size) {
  const pages = [];
  for (let index = 0; index < values.length; index += size) pages.push(values.slice(index, index + size));
  return pages;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function safeRunId(value) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function finiteProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readJson(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeArtifact(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function discordMessageId(result) {
  return [result?.message_id, result?.messageId, result?.id]
    .find((value) => typeof value === 'string' && value.trim())?.trim();
}
