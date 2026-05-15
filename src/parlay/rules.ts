import type {
  ParlayConfig,
  ParlayLeg,
  ParlaySourcePrediction,
  ResolvedParlayConfig,
} from './types.js';

export const PARLAY_BUILDER_RULE_VERSION = 'parlay-builder-v2';

export const DEFAULT_PARLAY_CONFIG = {
  minLegs: 2,
  maxLegs: 4,
  allowMultipleLegsPerFixture: false,
  minPredictionConfidence: 0,
} as const satisfies ResolvedParlayConfig;

export const QUALITY_SCORES = {
  low: 0.33,
  medium: 0.66,
  high: 1,
} as const;

export function resolveParlayConfig(config: ParlayConfig = {}): ResolvedParlayConfig {
  const resolved = {
    ...DEFAULT_PARLAY_CONFIG,
    ...config,
  };

  if (!Number.isInteger(resolved.minLegs) || resolved.minLegs < 1) {
    throw new RangeError('Parlay minLegs must be an integer greater than zero.');
  }
  if (!Number.isInteger(resolved.maxLegs) || resolved.maxLegs < resolved.minLegs) {
    throw new RangeError('Parlay maxLegs must be an integer greater than or equal to minLegs.');
  }
  if (!Number.isFinite(resolved.minPredictionConfidence) || resolved.minPredictionConfidence < 0 || resolved.minPredictionConfidence > 1) {
    throw new RangeError('Parlay minPredictionConfidence must be between 0 and 1.');
  }
  if (resolved.maxCombinedOdds !== undefined && (!Number.isFinite(resolved.maxCombinedOdds) || resolved.maxCombinedOdds <= 1)) {
    throw new RangeError('Parlay maxCombinedOdds must be greater than 1 when provided.');
  }

  return resolved;
}

export function calculateCombinedOdds(legs: readonly Pick<ParlayLeg, 'odds'>[]): number | undefined {
  if (legs.length === 0) return undefined;
  return legs.reduce((product, leg) => product * leg.odds, 1);
}

export function calculateAggregateConfidence(legs: readonly Pick<ParlaySourcePrediction, 'confidence'>[]): number {
  if (legs.length === 0) return 0;
  return legs.reduce((product, leg) => product * leg.confidence, 1);
}

export function calculateAggregateQuality(legs: readonly Pick<ParlaySourcePrediction, 'quality'>[]): number {
  if (legs.length === 0) return 0;
  const total = legs.reduce((sum, leg) => sum + QUALITY_SCORES[leg.quality], 0);
  return total / legs.length;
}
