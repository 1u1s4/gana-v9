import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export interface RecommendationArtifactTargets {
  predictionIds: string[];
  parlayIds: string[];
  artifactSelections: RecommendationArtifactSelection[];
  recommendationCount: number;
  sourcePath?: string;
}

export interface RecommendationArtifactSelection {
  artifactSelectionId: string;
  source: string;
  fixtureId: string;
  providerFixtureId?: string;
  fixture?: string;
  display?: Record<string, unknown>;
  market: string;
  selection: string;
  line?: number | null;
  odds?: number | null;
  confidence?: number | null;
  expectedEdge?: number | null;
  status?: string;
}

export function readRecommendationArtifactTargets(path: string): RecommendationArtifactTargets {
  const artifact = JSON.parse(readFileSync(path, 'utf-8'));
  attachRequiredLeagueRecommendations(artifact, path);
  return recommendationArtifactTargets(artifact, path);
}

export function recommendationArtifactTargets(artifact: unknown, sourcePath?: string): RecommendationArtifactTargets {
  const payload = objectRecord(artifact);
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const requiredLeague = objectRecord(payload.requiredLeagueRecommendations);
  const predictionIds = new Set<string>();
  const parlayIds = new Set<string>();
  const artifactSelections = new Map<string, RecommendationArtifactSelection>();

  for (const recommendation of recommendations) {
    const item = objectRecord(recommendation);
    const kind = stringValue(item.kind);
    const parlayId = stringValue(item.parlayId);
    if (kind === 'parlay' && parlayId && !isSyntheticRecommendationId(parlayId)) {
      parlayIds.add(parlayId);
    }

    for (const id of stringArray(item.predictionIds)) {
      if (!isSyntheticRecommendationId(id)) predictionIds.add(id);
    }
    const predictionId = stringValue(item.predictionId);
    if (predictionId && !isSyntheticRecommendationId(predictionId)) predictionIds.add(predictionId);

    for (const leg of Array.isArray(item.legs) ? item.legs : []) {
      const legPredictionId = stringValue(objectRecord(leg).predictionId);
      if (legPredictionId && !isSyntheticRecommendationId(legPredictionId)) predictionIds.add(legPredictionId);
    }
  }

  for (const projection of Array.isArray(requiredLeague.atomicProjections) ? requiredLeague.atomicProjections : []) {
    const item = objectRecord(projection);
    const predictionId = stringValue(item.predictionId);
    if (predictionId && !isSyntheticRecommendationId(predictionId)) predictionIds.add(predictionId);
  }

  for (const projection of Array.isArray(requiredLeague.parlayProjections) ? requiredLeague.parlayProjections : []) {
    for (const leg of Array.isArray(objectRecord(projection).legs) ? objectRecord(projection).legs as unknown[] : []) {
      const legPredictionId = stringValue(objectRecord(leg).predictionId);
      if (legPredictionId && !isSyntheticRecommendationId(legPredictionId)) predictionIds.add(legPredictionId);
    }
  }

  for (const prediction of Array.isArray(requiredLeague.generalPredictions) ? requiredLeague.generalPredictions : []) {
    const selection = artifactSelectionFromRequiredGeneralPrediction(prediction);
    if (!selection) continue;
    if (!artifactSelections.has(selection.artifactSelectionId)) artifactSelections.set(selection.artifactSelectionId, selection);
  }

  return {
    predictionIds: [...predictionIds],
    parlayIds: [...parlayIds],
    artifactSelections: [...artifactSelections.values()],
    recommendationCount: recommendations.length,
    ...(sourcePath ? { sourcePath } : {}),
  };
}

function attachRequiredLeagueRecommendations(artifact: Record<string, unknown>, artifactPath: string): void {
  if (artifact.requiredLeagueRecommendations && typeof artifact.requiredLeagueRecommendations === 'object') return;
  const requiredPath = stringValue(artifact.requiredLeagueRecommendationsPath);
  if (!requiredPath) return;
  const resolved = isAbsolute(requiredPath) ? requiredPath : resolve(dirname(artifactPath), requiredPath);
  if (!existsSync(resolved)) return;
  try {
    const requiredLeagueRecommendations = JSON.parse(readFileSync(resolved, 'utf-8'));
    if (requiredLeagueRecommendations && typeof requiredLeagueRecommendations === 'object') {
      artifact.requiredLeagueRecommendations = requiredLeagueRecommendations;
    }
  } catch {
    // Keep target extraction resilient; the main recommendations still remain valid.
  }
}

function artifactSelectionFromRequiredGeneralPrediction(value: unknown): RecommendationArtifactSelection | undefined {
  const item = objectRecord(value);
  const fixtureId = stringValue(item.fixtureId);
  const market = stringValue(item.market);
  const selection = stringValue(item.selection);
  if (!fixtureId || !market || !selection) return undefined;
  const line = numberOrNull(item.line);
  const providerFixtureId = stringValue(item.providerFixtureId);
  const key = [
    'required-league-general',
    fixtureId,
    providerFixtureId ?? '',
    market,
    selection,
    line === null ? '' : String(line),
  ].join('|');
  return {
    artifactSelectionId: key,
    source: 'required-league-general',
    fixtureId,
    ...(providerFixtureId && { providerFixtureId }),
    ...(stringValue(item.fixture) && { fixture: stringValue(item.fixture) }),
    ...(objectRecord(item.display) && { display: objectRecord(item.display) }),
    market,
    selection,
    line,
    odds: numberOrNull(item.odds),
    confidence: numberOrNull(item.confidence),
    expectedEdge: numberOrNull(item.expectedEdge),
    ...(stringValue(item.status) && { status: stringValue(item.status) }),
  };
}

function isSyntheticRecommendationId(value: string): boolean {
  return value.startsWith('atomic-') || value.startsWith('analytical-fallback-');
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
