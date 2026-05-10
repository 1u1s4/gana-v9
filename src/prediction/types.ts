import { z } from 'zod';
import { MARKET_KEYS } from '../domain/markets.js';
import { AGENT_PROVIDER_COMPAT_VALUES, researchGateResultSchema } from '../evidence/types.js';

export const SCORING_RULE_VERSION = 'scoring-v1';

export const PREDICTION_STATUSES = [
  'draft',
  'candidate',
  'review-required',
  'promotable',
  'blocked',
] as const;

export const PREDICTION_QUALITIES = [
  'low',
  'medium',
  'high',
] as const;

export type PredictionStatus = typeof PREDICTION_STATUSES[number];
export type PredictionQuality = typeof PREDICTION_QUALITIES[number];

export const predictionCandidateSchema = z.object({
  fixtureId: z.string().min(1),
  providerFixtureId: z.string().min(1).optional(),
  market: z.enum(MARKET_KEYS),
  selection: z.string().min(1),
  line: z.number().optional(),
  probability: z.number().min(0).max(1).optional(),
  modelProbability: z.number().min(0).max(1).optional(),
  odds: z.number().gt(1),
  impliedProbability: z.number().min(0).max(1).optional(),
  marketImpliedProbability: z.number().min(0).max(1).optional(),
  marketFairProbability: z.number().min(0).max(1).optional(),
  edge: z.number().optional(),
  confidenceBand: z.enum(PREDICTION_QUALITIES).optional(),
  blockers: z.array(z.string().min(1)).default([]),
  promotable: z.boolean().optional(),
  oddsSnapshotId: z.string().min(1).optional(),
  oddsQuoteId: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  claimIds: z.array(z.string().min(1)).default([]),
  rationale: z.string().min(1).optional(),
  warnings: z.array(z.string().min(1)).default([]),
  parlayEligible: z.boolean().optional(),
}).superRefine((candidate, ctx) => {
  if ((candidate as { status?: string }).status === 'blocked') return;
  if (candidate.evidenceIds.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['evidenceIds'],
      message: 'Prediction candidates require at least one evidence ID.',
    });
  }
});

export const predictionRecordSchema = predictionCandidateSchema.safeExtend({
  id: z.string().min(1),
  runId: z.string().min(1),
  oddsSnapshotId: z.string().min(1),
  impliedProbability: z.number().min(0).max(1),
  researchBundleId: z.string().min(1).optional(),
  providerAgentic: z.enum(AGENT_PROVIDER_COMPAT_VALUES).optional(),
  model: z.string().min(1).optional(),
  promptVersion: z.string().min(1).default('score-prediction-v1'),
  scoringRuleVersion: z.string().min(1).default(SCORING_RULE_VERSION),
  confidence: z.number().min(0).max(1).default(0),
  quality: z.enum(PREDICTION_QUALITIES).default('low'),
  confidenceBand: z.enum(PREDICTION_QUALITIES).default('low'),
  status: z.enum(PREDICTION_STATUSES),
  generatedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
});

export const predictionRunResultSchema = z.object({
  ok: z.boolean(),
  runId: z.string().min(1),
  fixtureId: z.string().min(1).optional(),
  providerFixtureId: z.string().min(1).optional(),
  gateResult: researchGateResultSchema,
  predictions: z.array(predictionRecordSchema),
  artifactPath: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export type PredictionCandidate = z.infer<typeof predictionCandidateSchema>;
export type PredictionRecordView = z.infer<typeof predictionRecordSchema>;
export type PredictionRunResultShape = z.infer<typeof predictionRunResultSchema>;

export interface PredictionGateResult {
  verdict: PredictionStatus;
  reasons: string[];
  warnings: string[];
}
