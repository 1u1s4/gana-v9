import { readFileSync } from 'node:fs';

export interface RecommendationArtifactTargets {
  predictionIds: string[];
  parlayIds: string[];
  recommendationCount: number;
  sourcePath?: string;
}

export function readRecommendationArtifactTargets(path: string): RecommendationArtifactTargets {
  const artifact = JSON.parse(readFileSync(path, 'utf-8'));
  return recommendationArtifactTargets(artifact, path);
}

export function recommendationArtifactTargets(artifact: unknown, sourcePath?: string): RecommendationArtifactTargets {
  const payload = objectRecord(artifact);
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const predictionIds = new Set<string>();
  const parlayIds = new Set<string>();

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

  return {
    predictionIds: [...predictionIds],
    parlayIds: [...parlayIds],
    recommendationCount: recommendations.length,
    ...(sourcePath ? { sourcePath } : {}),
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
