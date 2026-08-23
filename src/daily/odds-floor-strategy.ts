import type {
  DailyRequiredLeagueArtifact,
  DailyRequiredLeagueAtomicProjection,
  DailyRequiredLeagueParlayProjection,
} from './required-leagues.js';
import type { DailyFinalRecommendation, RecommendationLegDisplay } from './types.js';

export const DAILY_ODDS_FLOOR_STRATEGY_VERSION = 'odds-floor-highest-confidence-v1';
export const DAILY_ODDS_FLOOR_MINIMUM_PUBLISHED_ODDS = 1.45;

export type DailyOddsFloorStrategySource = 'daily' | 'required-atomic' | 'required-parlay';

export interface DailyOddsFloorStrategyLeg {
  predictionId: string | null;
  fixtureId: string | null;
  fixture: string;
  display?: RecommendationLegDisplay;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
}

export interface DailyOddsFloorStrategyPick {
  source: DailyOddsFloorStrategySource;
  kind: 'parlay' | 'atomic-prediction';
  id: string;
  rank: number;
  publishedOrder: number;
  profile: string;
  publishedOdds: number;
  publishedConfidence: number;
  confidenceMetric: 'displayConfidence' | 'aggregateConfidence' | 'confidence' | 'adjustedProbability';
  recommendationScore: number;
  legs: DailyOddsFloorStrategyLeg[];
}

export interface DailyOddsFloorStrategySelection {
  version: typeof DAILY_ODDS_FLOOR_STRATEGY_VERSION;
  status: 'selected' | 'no-eligible-pick';
  rule: {
    minimumPublishedOdds: number;
    selection: 'highest-published-confidence';
    tieBreak: readonly ['published-order-ascending'];
  };
  evaluatedPickCount: number;
  eligiblePickCount: number;
  selectedPick: DailyOddsFloorStrategyPick | null;
  analyticalArtifactOnly: true;
  executionCapability: 'none';
}

interface SelectDailyOddsFloorStrategyInput {
  recommendations: readonly DailyFinalRecommendation[];
  requiredLeagueRecommendations: DailyRequiredLeagueArtifact;
  minimumPublishedOdds?: number;
}

interface CandidateDraft {
  source: DailyOddsFloorStrategySource;
  kind: 'parlay' | 'atomic-prediction';
  id: string;
  rank: number;
  publishedOrder: number;
  profile: string;
  publishedOdds: number;
  publishedConfidence: number;
  confidenceMetric: DailyOddsFloorStrategyPick['confidenceMetric'];
  recommendationScore: number;
  legs: DailyOddsFloorStrategyLeg[];
}

export function selectDailyOddsFloorStrategy(
  input: SelectDailyOddsFloorStrategyInput,
): DailyOddsFloorStrategySelection {
  const minimumPublishedOdds = finiteNumber(input.minimumPublishedOdds)
    ?? DAILY_ODDS_FLOOR_MINIMUM_PUBLISHED_ODDS;
  const candidates = strategyCandidates(input);
  const eligible = candidates
    .filter((candidate) => candidate.publishedOdds >= minimumPublishedOdds)
    .sort(compareStrategyCandidates);
  const selectedPick = eligible[0] ?? null;

  return {
    version: DAILY_ODDS_FLOOR_STRATEGY_VERSION,
    status: selectedPick ? 'selected' : 'no-eligible-pick',
    rule: {
      minimumPublishedOdds,
      selection: 'highest-published-confidence',
      tieBreak: ['published-order-ascending'],
    },
    evaluatedPickCount: candidates.length,
    eligiblePickCount: eligible.length,
    selectedPick,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
}

function strategyCandidates(input: SelectDailyOddsFloorStrategyInput): CandidateDraft[] {
  const candidates: CandidateDraft[] = [];
  let publishedOrder = 0;
  const add = (candidate: Omit<CandidateDraft, 'publishedOrder'> | null) => {
    publishedOrder += 1;
    if (!candidate) return;
    candidates.push({ ...candidate, publishedOrder });
  };

  for (const recommendation of input.recommendations) add(dailyCandidate(recommendation));
  for (const projection of input.requiredLeagueRecommendations.atomicProjections) {
    add(requiredAtomicCandidate(projection));
  }
  for (const projection of input.requiredLeagueRecommendations.parlayProjections) {
    if (projection.status === 'selected') add(requiredParlayCandidate(projection));
  }
  return candidates;
}

function dailyCandidate(
  recommendation: DailyFinalRecommendation,
): Omit<CandidateDraft, 'publishedOrder'> | null {
  const recommendationRecord = recommendation as DailyFinalRecommendation & {
    odds?: unknown;
    confidence?: unknown;
  };
  const publishedOdds = firstFiniteNumber([
    recommendation.combinedOdds,
    recommendationRecord.odds,
    recommendation.legs[0]?.odds,
  ]);
  const confidence = publishedConfidence(recommendationRecord, [
    'displayConfidence',
    'aggregateConfidence',
    'confidence',
    'adjustedProbability',
  ]);
  const id = recommendation.kind === 'parlay'
    ? nonEmptyString(recommendation.parlayId)
    : nonEmptyString(recommendation.predictionId)
      ?? nonEmptyString(recommendation.predictionIds[0])
      ?? nonEmptyString(recommendation.legs[0]?.predictionId)
      ?? nonEmptyString(recommendation.parlayId);
  if (publishedOdds === null || confidence === null || !id) return null;
  return {
    source: 'daily',
    kind: recommendation.kind,
    id,
    rank: positiveInteger(recommendation.rank, 1),
    profile: nonEmptyString(recommendation.profile) ?? recommendation.kind,
    publishedOdds,
    publishedConfidence: confidence.value,
    confidenceMetric: confidence.metric,
    recommendationScore: finiteNumber(recommendation.score) ?? 0,
    legs: normalizeLegs(recommendation.legs),
  };
}

function requiredAtomicCandidate(
  projection: DailyRequiredLeagueAtomicProjection,
): Omit<CandidateDraft, 'publishedOrder'> | null {
  const publishedOdds = finiteNumber(projection.odds);
  const confidence = publishedConfidence(projection as DailyRequiredLeagueAtomicProjection & {
    displayConfidence?: unknown;
    aggregateConfidence?: unknown;
  }, ['displayConfidence', 'confidence', 'aggregateConfidence']);
  const id = nonEmptyString(projection.predictionId);
  if (publishedOdds === null || confidence === null || !id) return null;
  return {
    source: 'required-atomic',
    kind: 'atomic-prediction',
    id,
    rank: positiveInteger(projection.rank, 1),
    profile: 'required-atomic',
    publishedOdds,
    publishedConfidence: confidence.value,
    confidenceMetric: confidence.metric,
    recommendationScore: 0,
    legs: normalizeLegs([projection]),
  };
}

function requiredParlayCandidate(
  projection: DailyRequiredLeagueParlayProjection,
): Omit<CandidateDraft, 'publishedOrder'> | null {
  const publishedOdds = finiteNumber(projection.combinedOdds);
  const confidence = publishedConfidence(projection as DailyRequiredLeagueParlayProjection & {
    displayConfidence?: unknown;
    confidence?: unknown;
  }, ['displayConfidence', 'aggregateConfidence', 'confidence']);
  const id = nonEmptyString(projection.parlayId);
  if (publishedOdds === null || confidence === null || !id) return null;
  return {
    source: 'required-parlay',
    kind: 'parlay',
    id,
    rank: 1,
    profile: projection.profile,
    publishedOdds,
    publishedConfidence: confidence.value,
    confidenceMetric: confidence.metric,
    recommendationScore: 0,
    legs: normalizeLegs(projection.legs),
  };
}

function publishedConfidence(
  value: Partial<Record<DailyOddsFloorStrategyPick['confidenceMetric'], unknown>>,
  metricOrder: readonly DailyOddsFloorStrategyPick['confidenceMetric'][],
): {
  value: number;
  metric: DailyOddsFloorStrategyPick['confidenceMetric'];
} | null {
  for (const metric of metricOrder) {
    const parsed = finiteNumber(value[metric]);
    if (parsed !== null) return { value: parsed, metric };
  }
  return null;
}

function normalizeLegs(legs: readonly unknown[]): DailyOddsFloorStrategyLeg[] {
  return legs.map((value) => {
    const leg = value && typeof value === 'object' ? value as Record<string, any> : {};
    return {
      predictionId: nonEmptyString(leg.predictionId),
      fixtureId: nonEmptyString(leg.fixtureId),
      fixture: nonEmptyString(leg.display?.fixtureLabel)
        ?? nonEmptyString(leg.fixture)
        ?? nonEmptyString(leg.fixtureId)
        ?? 'fixture',
      ...(leg.display && typeof leg.display === 'object' ? { display: leg.display } : {}),
      market: nonEmptyString(leg.market) ?? nonEmptyString(leg.marketKey) ?? 'market',
      selection: nonEmptyString(leg.selection) ?? nonEmptyString(leg.selectionKey) ?? 'selection',
      line: finiteNumber(leg.line),
      odds: finiteNumber(leg.odds) ?? 1,
    };
  });
}

function compareStrategyCandidates(left: CandidateDraft, right: CandidateDraft): number {
  return right.publishedConfidence - left.publishedConfidence
    || left.publishedOrder - right.publishedOrder;
}

function firstFiniteNumber(values: readonly unknown[]): number | null {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
