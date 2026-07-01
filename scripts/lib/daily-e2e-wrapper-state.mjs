import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

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

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'invalid-json', artifact: undefined, mtimeMs: stat.mtimeMs };
  }

  if (dailyBatchId && artifact?.dailyBatchId && artifact.dailyBatchId !== dailyBatchId) {
    return { ok: false, reason: 'batch-mismatch', artifact, mtimeMs: stat.mtimeMs };
  }
  if (date && artifact?.date && artifact.date !== date) {
    return { ok: false, reason: 'date-mismatch', artifact, mtimeMs: stat.mtimeMs };
  }

  attachRequiredLeagueRecommendations(artifact, artifactPath);
  return { ok: true, reason: 'current-artifact', artifact, mtimeMs: stat.mtimeMs };
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

function attachRequiredLeagueRecommendations(artifact, artifactPath) {
  if (!artifact || typeof artifact !== 'object') return;
  if (artifact.requiredLeagueRecommendations && typeof artifact.requiredLeagueRecommendations === 'object') return;
  const requiredPath = typeof artifact.requiredLeagueRecommendationsPath === 'string'
    ? artifact.requiredLeagueRecommendationsPath.trim()
    : '';
  if (!requiredPath) return;
  const resolved = isAbsolute(requiredPath) ? requiredPath : resolve(dirname(artifactPath), requiredPath);
  if (!existsSync(resolved)) return;
  try {
    const requiredLeagueRecommendations = JSON.parse(readFileSync(resolved, 'utf8'));
    if (requiredLeagueRecommendations && typeof requiredLeagueRecommendations === 'object') {
      artifact.requiredLeagueRecommendations = requiredLeagueRecommendations;
    }
  } catch {
    // Optional addendum loading should not make the wrapper publish unsafe data.
  }
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

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())));
}
