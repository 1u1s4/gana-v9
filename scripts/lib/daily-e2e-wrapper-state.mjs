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

export function selectRecommendations(artifact) {
  if (Array.isArray(artifact?.recommendations)) return artifact.recommendations;
  return [
    ...(Array.isArray(artifact?.parlayRecommendations) ? artifact.parlayRecommendations : []),
    ...(Array.isArray(artifact?.atomicRecommendations) ? artifact.atomicRecommendations : []),
  ];
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
