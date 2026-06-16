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
  attachRequiredLeagueGeneralPredictions(artifact, path);
  return recommendationArtifactTargets(artifact, path);
}

export function recommendationArtifactTargets(artifact: unknown, sourcePath?: string): RecommendationArtifactTargets {
  const payload = objectRecord(artifact);
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const requiredLeague = objectRecord(payload.requiredLeagueRecommendations);
  const generalPredictions = [
    ...(Array.isArray(requiredLeague.generalPredictions) ? requiredLeague.generalPredictions : []),
    ...(Array.isArray(payload.requiredLeagueGeneralPredictions) ? payload.requiredLeagueGeneralPredictions : []),
  ];
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

  for (const prediction of generalPredictions) {
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

function attachRequiredLeagueGeneralPredictions(artifact: Record<string, unknown>, artifactPath: string): void {
  if (Array.isArray(artifact.requiredLeagueGeneralPredictions)) return;
  const data = requiredLeagueData(artifact);
  const rawFixtures = objectRecord(data.coverage).fixtures;
  const fixtures = Array.isArray(rawFixtures) ? rawFixtures : [];
  if (!fixtures.length) return;
  const comparisonPath = stringValue(artifact.providerComparisonPath);
  if (!comparisonPath) return;
  const resolved = isAbsolute(comparisonPath) ? comparisonPath : resolve(dirname(artifactPath), comparisonPath);
  if (!existsSync(resolved)) return;
  try {
    const comparison = JSON.parse(readFileSync(resolved, 'utf-8'));
    const predictions = requiredLeagueGeneralPredictionsFromComparison(comparison, fixtures);
    if (predictions.length) artifact.requiredLeagueGeneralPredictions = predictions;
  } catch {
    // Required league validation remains scoped to explicit recommendations if comparison data is unavailable.
  }
}

function requiredLeagueData(artifact: Record<string, unknown>): Record<string, unknown> {
  const embedded = objectRecord(artifact.requiredLeagueRecommendations);
  if (Object.keys(embedded).length) return embedded;
  return {
    coverage: artifact.requiredLeagueCoverage,
    goalCheck: artifact.requiredLeagueGoalCheck,
    atomicProjections: artifact.requiredLeagueAtomicProjections,
    parlayProjections: artifact.requiredLeagueParlayProjections,
  };
}

function requiredLeagueGeneralPredictionsFromComparison(comparison: unknown, fixtures: unknown[]): Record<string, unknown>[] {
  const fixtureByKey = requiredLeagueFixtureMetaByKey(fixtures);
  const rawItems = objectRecord(comparison).items;
  const items = Array.isArray(rawItems) ? rawItems : [];
  const predictions: Record<string, unknown>[] = [];
  for (const itemValue of items) {
    const item = objectRecord(itemValue);
    const fixture = requiredLeagueFixtureKeys(item).map((key) => fixtureByKey.get(key)).find(Boolean);
    if (!fixture) continue;
    const providers = Array.isArray(item.providers) ? item.providers : [];
    for (const providerValue of providers) {
      const provider = objectRecord(providerValue);
      const line = numberOrNull(provider.line) ?? numberOrNull(item.line);
      predictions.push({
        fixtureId: stringValue(item.fixtureId) ?? stringValue(fixture.fixtureId) ?? '',
        providerFixtureId: stringValue(item.providerFixtureId) ?? stringValue(fixture.providerFixtureId) ?? '',
        fixture: stringValue(fixture.fixture) ?? requiredLeagueFixtureLabel(fixture),
        display: objectRecord(fixture.display),
        market: stringValue(item.market) ?? '',
        selection: stringValue(provider.selection) ?? '',
        line,
        odds: numberOrNull(provider.odds),
        confidence: numberOrNull(provider.confidence),
        expectedEdge: numberOrNull(provider.edge),
        provider: stringValue(provider.provider) ?? 'provider',
        status: stringValue(provider.status) ?? 'review-required',
      });
    }
  }
  return predictions;
}

function requiredLeagueFixtureMetaByKey(fixtures: unknown[]): Map<string, Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const fixtureValue of fixtures) {
    const fixture = objectRecord(fixtureValue);
    for (const key of requiredLeagueFixtureKeys(fixture)) {
      if (key && !byKey.has(key)) byKey.set(key, fixture);
    }
  }
  return byKey;
}

function requiredLeagueFixtureKeys(item: Record<string, unknown>): string[] {
  return [
    item.fixtureId,
    item.providerFixtureId,
    item.fixture,
    objectRecord(item.display).fixtureLabel,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
}

function requiredLeagueFixtureLabel(item: Record<string, unknown>): string {
  return stringValue(item.fixture)
    ?? stringValue(objectRecord(item.display).fixtureLabel)
    ?? [stringValue(objectRecord(item.display).homeTeamName), stringValue(objectRecord(item.display).awayTeamName)].filter(Boolean).join(' vs ')
    ?? stringValue(item.providerFixtureId)
    ?? 'fixture unknown';
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
