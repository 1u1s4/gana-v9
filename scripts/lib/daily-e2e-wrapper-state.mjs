import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { readRecommendationSourceSnapshot } from './daily-recommendation-source-snapshot.mjs';

const DEFAULT_EXISTING_ARTIFACT_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const DEFAULT_FRESHNESS_TOLERANCE_MS = 5_000;

export function readCurrentRecommendationArtifact(artifactPath, {
  date,
  dailyBatchId,
  startedAt,
  staleToleranceMs = 1000,
} = {}) {
  if (!artifactPath || !existsSync(artifactPath)) {
    return { ok: false, reason: 'missing-artifact', artifact: undefined, mtimeMs: undefined };
  }

  const stat = statSync(artifactPath);
  const startedMs = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt);
  if (Number.isFinite(startedMs) && stat.mtimeMs + staleToleranceMs < startedMs) {
    return { ok: false, reason: 'stale-artifact', artifact: undefined, mtimeMs: stat.mtimeMs };
  }

  let snapshot;
  try {
    snapshot = readRecommendationSourceSnapshot(artifactPath, { strict: true });
  } catch {
    return { ok: false, reason: 'invalid-json', artifact: undefined, mtimeMs: stat.mtimeMs };
  }
  const artifact = snapshot.artifact;

  if (dailyBatchId && artifact?.dailyBatchId !== dailyBatchId) {
    return { ok: false, reason: 'batch-mismatch', artifact, mtimeMs: stat.mtimeMs };
  }
  if (date && artifact?.date !== date) {
    return { ok: false, reason: 'date-mismatch', artifact, mtimeMs: stat.mtimeMs };
  }

  if (!artifact.requiredLeagueRecommendations && snapshot.requiredLeagueRecommendations) {
    artifact.requiredLeagueRecommendations = snapshot.requiredLeagueRecommendations;
  }
  return {
    ok: true,
    reason: 'current-artifact',
    artifact,
    mtimeMs: stat.mtimeMs,
    sourceArtifactSha256: snapshot.sourceArtifactSha256,
    sourceManifest: snapshot.sourceManifest,
    sourceManifestSha256: snapshot.sourceManifestSha256,
  };
}

export function readExistingRecommendationArtifact(artifactPath, {
  date,
  dailyBatchId,
  now = new Date(),
  maxAgeMs = DEFAULT_EXISTING_ARTIFACT_MAX_AGE_MS,
  freshnessToleranceMs = DEFAULT_FRESHNESS_TOLERANCE_MS,
  summaryPath = artifactPath ? resolve(dirname(artifactPath), 'daily-e2e-summary.json') : undefined,
} = {}) {
  if (!date || !dailyBatchId) {
    return { ok: false, reason: 'missing-artifact-identity', artifact: undefined, mtimeMs: undefined };
  }
  const current = readCurrentRecommendationArtifact(artifactPath, { date, dailyBatchId });
  if (!current.ok) return current;

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    return { ...current, ok: false, reason: 'invalid-current-time' };
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return { ...current, ok: false, reason: 'invalid-max-artifact-age' };
  }
  if (current.mtimeMs > nowMs + freshnessToleranceMs) {
    return { ...current, ok: false, reason: 'future-artifact' };
  }
  if (nowMs - current.mtimeMs > maxAgeMs) {
    return { ...current, ok: false, reason: 'stale-artifact' };
  }

  const summary = readJsonObject(summaryPath);
  if (!summary) {
    return { ...current, ok: false, reason: 'missing-or-invalid-summary', summary: undefined };
  }
  if (summary.dailyBatchId !== dailyBatchId) {
    return { ...current, ok: false, reason: 'summary-batch-mismatch', summary };
  }
  if (summary.date !== date) {
    return { ...current, ok: false, reason: 'summary-date-mismatch', summary };
  }
  if (summary.status !== 'succeeded') {
    return { ...current, ok: false, reason: `summary-not-succeeded:${summary.status ?? 'unknown'}`, summary };
  }

  const startedMs = Date.parse(summary.startedAt);
  const completedMs = Date.parse(summary.completedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || completedMs < startedMs) {
    return { ...current, ok: false, reason: 'invalid-summary-window', summary };
  }
  if (completedMs > nowMs + freshnessToleranceMs) {
    return { ...current, ok: false, reason: 'future-summary', summary };
  }
  if (nowMs - completedMs > maxAgeMs) {
    return { ...current, ok: false, reason: 'stale-summary', summary };
  }
  if (current.mtimeMs + freshnessToleranceMs < startedMs || current.mtimeMs > completedMs + freshnessToleranceMs) {
    return { ...current, ok: false, reason: 'artifact-outside-summary-window', summary };
  }

  const completedGuatemalaDate = guatemalaDate(new Date(completedMs));
  const previousSlateDate = shiftDate(date, -1);
  if (completedGuatemalaDate !== previousSlateDate && completedGuatemalaDate !== date) {
    return { ...current, ok: false, reason: 'summary-outside-slate-window', summary };
  }

  const expectedRecommendations = Number(summary?.counts?.recommendations);
  if (!Number.isInteger(expectedRecommendations) || expectedRecommendations < 0) {
    return { ...current, ok: false, reason: 'missing-summary-recommendation-count', summary };
  }
  const actualRecommendations = selectRecommendations(current.artifact).length;
  if (expectedRecommendations !== actualRecommendations) {
    return {
      ...current,
      ok: false,
      reason: `summary-recommendation-count-mismatch:${expectedRecommendations}/${actualRecommendations}`,
      summary,
    };
  }

  return { ...current, ok: true, reason: 'existing-artifact-verified', summary };
}

export function validateRetryablePublishLock(lock, {
  date,
  dailyBatchId,
  now = new Date(),
} = {}) {
  if (!lock || typeof lock !== 'object') return { ok: false, reason: 'missing-lock' };
  if (lock.status !== 'retryable') {
    return { ok: false, reason: `incompatible-lock-status:${lock.status ?? 'unknown'}` };
  }
  if (lock.date !== date) return { ok: false, reason: 'lock-date-mismatch' };
  if (lock.dailyBatchId !== dailyBatchId) return { ok: false, reason: 'lock-batch-mismatch' };
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const retryAtMs = Date.parse(lock.retryAfter);
  if (!Number.isFinite(nowMs)) return { ok: false, reason: 'invalid-current-time' };
  if (!Number.isFinite(retryAtMs)) return { ok: false, reason: 'invalid-lock-retry-after' };
  if (retryAtMs > nowMs) {
    return { ok: false, reason: 'retry-pending', retryAfter: lock.retryAfter };
  }
  return { ok: true, reason: 'compatible-retryable-lock', retryAfter: lock.retryAfter };
}

export function validatePublicationTargetIds(artifact) {
  const plan = buildDbPublicationLedgerPlan(artifact);
  const invalidPredictionIds = plan.predictionIds.filter((predictionId) => !isUuid(predictionId));
  if (plan.invalidParlayIds.length || invalidPredictionIds.length) {
    return {
      ok: false,
      reason: `invalid-publication-target-ids:p=${plan.invalidParlayIds.length},pred=${invalidPredictionIds.length}`,
      ...plan,
      invalidPredictionIds,
    };
  }
  return { ok: true, reason: 'publication-target-ids-valid', ...plan, invalidPredictionIds };
}

export function countPublishableSelections(artifact) {
  const recommendations = selectRecommendations(artifact);
  const required = requiredLeagueCounts(artifact);
  return {
    total: recommendations.length + required.atomic + required.selectedParlays,
    recommendations: recommendations.length,
    requiredAtomic: required.atomic,
    requiredSelectedParlays: required.selectedParlays,
  };
}

export function validatePublicationLedgerAlignment(artifact) {
  const rendered = collectRenderedPublicationSelections(artifact);
  const targets = collectPublicationLedgerTargetIds(artifact);
  if (rendered.length === 0) return { ok: true, reason: 'no-rendered-selections', rendered, targets };
  if (!artifact?.publishedTargets || typeof artifact.publishedTargets !== 'object') {
    return { ok: false, reason: 'missing-published-targets', rendered, targets };
  }
  const store = artifact?.persistencePolicy?.finalOperationalStore;
  if (store !== 'database-ledger') {
    return { ok: false, reason: `unsupported-operational-store:${store ?? 'unknown'}`, rendered, targets };
  }

  const parlayIds = new Set(targets.parlayIds);
  const predictionIds = new Set(targets.predictionIds);
  const missing = rendered.filter((selection) => {
    if (selection.kind === 'parlay') return !selection.id || !parlayIds.has(selection.id);
    return !selection.id || !predictionIds.has(selection.id);
  });
  if (missing.length) {
    return {
      ok: false,
      reason: `rendered-selection-missing-from-ledger:${missing.map((selection) => selection.id || selection.source).join(',')}`,
      rendered,
      targets,
      missing,
    };
  }
  return { ok: true, reason: 'ledger-aligned', rendered, targets };
}

export function collectPublicationLedgerTargetIds(artifact) {
  const publishedTargets = artifact?.publishedTargets && typeof artifact.publishedTargets === 'object'
    ? artifact.publishedTargets
    : {};
  return {
    parlayIds: uniqueStrings(Array.isArray(publishedTargets.parlayIds) ? publishedTargets.parlayIds : []),
    predictionIds: uniqueStrings(Array.isArray(publishedTargets.predictionIds) ? publishedTargets.predictionIds : []),
  };
}

export function buildDbPublicationLedgerPlan(artifact) {
  const targets = collectPublicationLedgerTargetIds(artifact);
  const predictionTargetIds = new Set(targets.predictionIds);
  const persistedParlayIds = [];
  const artifactOnlyParlayIds = [];
  const invalidParlayIds = [];

  for (const parlayId of targets.parlayIds) {
    if (isUuid(parlayId)) {
      persistedParlayIds.push(parlayId);
      continue;
    }
    if (isBackedDailyFocusParlay(artifact, parlayId, predictionTargetIds)) {
      artifactOnlyParlayIds.push(parlayId);
      continue;
    }
    invalidParlayIds.push(parlayId);
  }

  return {
    persistedParlayIds,
    artifactOnlyParlayIds,
    invalidParlayIds,
    predictionIds: targets.predictionIds,
  };
}

export function selectRecommendations(artifact) {
  if (Array.isArray(artifact?.recommendations)) return artifact.recommendations;
  return [
    ...(Array.isArray(artifact?.parlayRecommendations) ? artifact.parlayRecommendations : []),
    ...(Array.isArray(artifact?.atomicRecommendations) ? artifact.atomicRecommendations : []),
  ];
}

function collectRenderedPublicationSelections(artifact) {
  const selections = [];
  for (const recommendation of selectRecommendations(artifact)) {
    const kind = recommendation?.kind === 'parlay' ? 'parlay' : 'prediction';
    const id = kind === 'parlay'
      ? nonSyntheticId(recommendation?.parlayId)
      : nonSyntheticId(recommendation?.predictionId ?? firstString(recommendation?.predictionIds));
    selections.push({
      source: `recommendations:${recommendation?.kind ?? kind}`,
      kind,
      id,
    });
  }

  const required = requiredLeagueData(artifact);
  const atomicProjections = Array.isArray(required?.atomicProjections) ? required.atomicProjections : [];
  const parlayProjections = Array.isArray(required?.parlayProjections) ? required.parlayProjections : [];
  for (const projection of atomicProjections) {
    selections.push({
      source: 'requiredLeague.atomicProjections',
      kind: 'prediction',
      id: nonSyntheticId(projection?.predictionId),
    });
  }
  for (const projection of parlayProjections) {
    if (projection?.status !== 'selected') continue;
    selections.push({
      source: `requiredLeague.parlayProjections:${projection?.profile ?? 'unknown'}`,
      kind: 'parlay',
      id: nonSyntheticId(projection?.parlayId),
    });
  }
  return selections;
}

function requiredLeagueCounts(artifact) {
  const data = requiredLeagueData(artifact);
  if (!data) return { atomic: 0, selectedParlays: 0 };
  const atomicProjections = Array.isArray(data.atomicProjections) ? data.atomicProjections : [];
  const parlayProjections = Array.isArray(data.parlayProjections) ? data.parlayProjections : [];
  return {
    atomic: atomicProjections.length,
    selectedParlays: parlayProjections.filter((projection) => projection?.status === 'selected').length,
  };
}

function requiredLeagueData(artifact) {
  const embedded = artifact?.requiredLeagueRecommendations;
  if (embedded && typeof embedded === 'object') return embedded;
  if (artifact?.requiredLeagueCoverage || artifact?.requiredLeagueGoalCheck) {
    return {
      coverage: artifact.requiredLeagueCoverage,
      goalCheck: artifact.requiredLeagueGoalCheck,
      parlayProjections: artifact.requiredLeagueParlayProjections,
      atomicProjections: artifact.requiredLeagueAtomicProjections,
    };
  }
  return undefined;
}

function firstString(value) {
  return Array.isArray(value) ? value.find((item) => typeof item === 'string' && item.trim()) : undefined;
}

function nonSyntheticId(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || isSyntheticRecommendationId(trimmed)) return undefined;
  return trimmed;
}

function isSyntheticRecommendationId(value) {
  return value.startsWith('atomic-') || value.startsWith('analytical-fallback-') || value.startsWith('required-');
}

function isBackedDailyFocusParlay(artifact, parlayId, predictionTargetIds) {
  if (!parlayId.startsWith('daily-focus-')) return false;
  const matches = selectRecommendations(artifact).filter((recommendation) =>
    recommendation?.kind === 'parlay'
    && recommendation?.parlayId === parlayId
  );
  if (matches.length !== 1) return false;
  const recommendation = matches[0];
  if (recommendation?.selectionMode !== 'analytical-fallback') return false;
  if (recommendation?.harnessStatus !== 'review-required') return false;
  if (!Array.isArray(recommendation?.riskFlags) || !recommendation.riskFlags.includes('daily-focus-fallback')) return false;
  const legs = Array.isArray(recommendation?.legs) ? recommendation.legs : [];
  if (legs.length < 2) return false;
  const predictionIds = legs.map((leg) => typeof leg?.predictionId === 'string' ? leg.predictionId.trim() : '');
  if (new Set(predictionIds).size < 2) return false;
  return predictionIds.every((predictionId) => isUuid(predictionId) && predictionTargetIds.has(predictionId));
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())));
}

function readJsonObject(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function guatemalaDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function shiftDate(value, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return shifted.toISOString().slice(0, 10);
}
