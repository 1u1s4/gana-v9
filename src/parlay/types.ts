import { z } from 'zod';
import { MARKET_KEYS, type MarketKey } from '../domain/markets.js';
import {
  PREDICTION_QUALITIES,
  PREDICTION_STATUSES,
  type PredictionQuality,
  type PredictionStatus,
} from '../prediction/types.js';

export const PARLAY_STATUSES = PREDICTION_STATUSES;

export type ParlayStatus = PredictionStatus;

export type ParlayInclusionReason =
  | 'included-eligible-prediction'
  | 'included-with-duplicate-fixture-override';

export type ParlayExclusionReason =
  | 'excluded-blocked-prediction'
  | 'excluded-draft-prediction'
  | 'excluded-review-required-prediction'
  | 'excluded-duplicate-fixture'
  | 'excluded-invalid-confidence'
  | 'excluded-invalid-market'
  | 'excluded-invalid-odds'
  | 'excluded-invalid-selection'
  | 'excluded-invalid-line'
  | 'excluded-below-min-confidence'
  | 'excluded-combined-odds-limit'
  | 'excluded-max-legs-reached'
  | 'excluded-prediction-blockers'
  | 'excluded-no-edge'
  | 'excluded-parlay-ineligible'
  | 'excluded-research-not-promotable';

export type ParlayRiskTag =
  | 'low_edge'
  | 'negative_edge'
  | 'low_confidence'
  | 'review_required'
  | 'research_warning'
  | 'fragile_low_total_over'
  | 'fragile_low_price_dc'
  | 'draw_exposure';

export interface ParlayConfig {
  minLegs?: number;
  maxLegs?: number;
  allowMultipleLegsPerFixture?: boolean;
  minPredictionConfidence?: number;
  maxCombinedOdds?: number;
}

export interface ResolvedParlayConfig {
  minLegs: number;
  maxLegs: number;
  allowMultipleLegsPerFixture: boolean;
  minPredictionConfidence: number;
  maxCombinedOdds?: number;
}

export interface ParlaySourcePrediction {
  id: string;
  runId: string;
  fixtureId: string;
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  confidence: number;
  quality: PredictionQuality;
  status: PredictionStatus;
  impliedProbability?: number;
  estimatedProbability?: number;
  edge?: number;
  blockers?: string[];
  marketFairProbability?: number;
  rationale?: string;
  warnings?: string[];
  parlayEligible?: boolean;
  riskTags?: ParlayRiskTag[];
  riskScore?: number;
}

export interface ParlayLeg {
  parlayId: string;
  predictionId: string;
  fixtureId: string;
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  status: PredictionStatus;
  index: number;
  inclusionReason: ParlayInclusionReason;
}

export interface ParlayPredictionEvaluation {
  predictionId: string;
  fixtureId: string;
  includedReasons: ParlayInclusionReason[];
  excludedReasons: ParlayExclusionReason[];
  eligible: boolean;
}

export interface Parlay {
  id: string;
  sourceRunId: string;
  legs: ParlayLeg[];
  combinedOdds?: number;
  aggregateConfidence: number;
  aggregateQuality: number;
  rationale: string;
  warnings: string[];
  status: ParlayStatus;
  generatedAt: string;
}

export interface BuildParlayInput {
  predictions: ParlaySourcePrediction[];
  config?: ParlayConfig;
  id?: string;
  sourceRunId?: string;
  generatedAt?: string;
}

export interface BuildParlayResult {
  parlay: Parlay;
  evaluations: ParlayPredictionEvaluation[];
  config: ResolvedParlayConfig;
}

const marketKeySchema = z.enum(MARKET_KEYS);
const predictionStatusSchema = z.enum(PREDICTION_STATUSES);
const predictionQualitySchema = z.enum(PREDICTION_QUALITIES);

export const parlayConfigSchema = z.object({
  minLegs: z.number().int().min(1).optional(),
  maxLegs: z.number().int().min(1).optional(),
  allowMultipleLegsPerFixture: z.boolean().optional(),
  minPredictionConfidence: z.number().min(0).max(1).optional(),
  maxCombinedOdds: z.number().gt(1).optional(),
});

export const parlaySourcePredictionSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  fixtureId: z.string().min(1),
  market: marketKeySchema,
  selection: z.string().min(1),
  line: z.number().optional(),
  odds: z.number().gt(1),
  confidence: z.number().min(0).max(1),
  quality: predictionQualitySchema,
  status: predictionStatusSchema,
  impliedProbability: z.number().min(0).max(1).optional(),
  estimatedProbability: z.number().min(0).max(1).optional(),
  edge: z.number().optional(),
  blockers: z.array(z.string()).optional(),
  marketFairProbability: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  parlayEligible: z.boolean().optional(),
  riskTags: z.array(z.enum([
    'low_edge',
    'negative_edge',
    'low_confidence',
    'review_required',
    'research_warning',
    'fragile_low_total_over',
    'fragile_low_price_dc',
    'draw_exposure',
  ])).optional(),
  riskScore: z.number().min(0).optional(),
});

export const parlayLegSchema = z.object({
  parlayId: z.string().min(1),
  predictionId: z.string().min(1),
  fixtureId: z.string().min(1),
  market: marketKeySchema,
  selection: z.string().min(1),
  line: z.number().optional(),
  odds: z.number().gt(1),
  status: predictionStatusSchema,
  index: z.number().int().min(0),
  inclusionReason: z.enum([
    'included-eligible-prediction',
    'included-with-duplicate-fixture-override',
  ]),
});

export const parlaySchema = z.object({
  id: z.string().min(1),
  sourceRunId: z.string().min(1),
  legs: z.array(parlayLegSchema),
  combinedOdds: z.number().gt(1).optional(),
  aggregateConfidence: z.number().min(0).max(1),
  aggregateQuality: z.number().min(0).max(1),
  rationale: z.string().min(1),
  warnings: z.array(z.string().min(1)),
  status: predictionStatusSchema,
  generatedAt: z.string().datetime(),
});
