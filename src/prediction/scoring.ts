import { randomUUID } from 'crypto';
import { isMarketKey, isValidMarketSelection, marketRequiresLine } from '../domain/markets.js';
import { calculateImpliedProbability, isValidDecimalOdds } from '../domain/odds.js';
import { SCORE_PREDICTION_PROMPT_VERSION } from './prompts.js';
import { evaluateEdgeGate } from '../scoring/edge-gate.js';
import {
  SCORING_RULE_VERSION,
  type PredictionCandidate,
  type PredictionQuality,
  type PredictionRecordView,
  type PredictionStatus,
} from './types.js';

export interface ScorePredictionCandidateResult {
  valid: boolean;
  scored: PredictionCandidate;
  reasons: string[];
}

export interface ScorePredictionCandidateInput {
  fixtureId: string;
  providerFixtureId?: string;
  market: string;
  selection: string;
  line?: number;
  probability?: number;
  odds: number;
  marketImpliedProbability?: number | null;
  marketFairProbability?: number | null;
  lowLiquidity?: boolean;
  oddsSnapshotId?: string;
  oddsQuoteId: string;
  evidenceIds: string[];
  claimIds?: string[];
  rationale?: string;
  warnings?: string[];
}

export interface BuildAtomicPredictionInput {
  id?: string;
  runId: string;
  fixtureId: string;
  providerFixtureId: string;
  oddsSnapshotId: string;
  oddsQuoteId: string;
  market: string;
  selection: string;
  odds: number;
  marketImpliedProbability?: number | null;
  marketFairProbability?: number | null;
  lowLiquidity?: boolean;
  stalePick?: boolean;
  lineupPending?: boolean;
  modelDisagreement?: boolean;
  line?: number;
  estimatedProbability?: number | null;
  evidenceIds: string[];
  claimIds: string[];
  status: PredictionStatus;
  confidence: number;
  quality?: PredictionQuality;
  rationale?: string;
  warnings?: string[];
  parlayEligible?: boolean;
  providerAgentic?: string;
  model?: string;
  researchBundleId?: string;
  generatedAt: string;
}

export function scorePredictionCandidate(input: ScorePredictionCandidateInput): ScorePredictionCandidateResult {
  const reasons: string[] = [];
  if (!isMarketKey(input.market)) {
    reasons.push('invalid market');
  } else {
    if (!isValidMarketSelection(input.market, input.selection)) reasons.push('invalid selection');
    const requiresLine = marketRequiresLine(input.market);
    if (requiresLine && !Number.isFinite(input.line)) reasons.push('line required');
    if (!requiresLine && input.line !== undefined) reasons.push('line forbidden');
  }
  if (!isValidDecimalOdds(input.odds)) reasons.push('invalid odds');
  if (input.probability !== undefined && (!Number.isFinite(input.probability) || input.probability < 0 || input.probability > 1)) {
    reasons.push('invalid probability');
  }
  if (!input.oddsQuoteId) reasons.push('missing odds quote');
  if (!input.evidenceIds.length) reasons.push('missing evidence');

  const impliedProbability = calculateImpliedProbability(input.odds);
  const marketImpliedProbability = input.marketImpliedProbability ?? impliedProbability;
  const marketFairProbability = input.marketFairProbability ?? impliedProbability;
  const edge = input.probability === undefined ? undefined : input.probability - marketFairProbability;

  return {
    valid: reasons.length === 0,
    reasons,
    scored: {
      ...input,
      market: isMarketKey(input.market) ? input.market : 'h2h',
      claimIds: input.claimIds ?? [],
      warnings: input.warnings ?? [],
      impliedProbability,
      marketImpliedProbability,
      marketFairProbability,
      edge,
      blockers: [],
      promotable: edge === undefined ? false : edge > 0,
    },
  };
}

export function buildAtomicPrediction(input: BuildAtomicPredictionInput): PredictionRecordView {
  const candidate = scorePredictionCandidate({
    fixtureId: input.fixtureId,
    providerFixtureId: input.providerFixtureId,
    market: input.market as PredictionCandidate['market'],
    selection: input.selection,
    line: input.line,
    probability: input.estimatedProbability ?? undefined,
    odds: input.odds,
    marketImpliedProbability: input.marketImpliedProbability,
    marketFairProbability: input.marketFairProbability,
    lowLiquidity: input.lowLiquidity,
    oddsSnapshotId: input.oddsSnapshotId,
    oddsQuoteId: input.oddsQuoteId,
    evidenceIds: input.evidenceIds,
    claimIds: input.claimIds,
    rationale: input.rationale,
    warnings: input.warnings ?? [],
  });
  const confidenceBand = input.quality ?? qualityFromConfidence(input.confidence);
  const edgeGate = input.estimatedProbability === undefined || input.estimatedProbability === null
    ? { blockers: ['missing-model-probability'], promotable: false, edge: 0 }
    : evaluateEdgeGate({
      modelProbability: input.estimatedProbability,
      marketFairProbability: candidate.scored.marketFairProbability ?? candidate.scored.impliedProbability ?? calculateImpliedProbability(input.odds),
      confidenceBand,
      evidenceCoverage: input.evidenceIds.length >= 2 ? 1 : 0.5,
      lowLiquidity: input.lowLiquidity,
      stalePick: input.stalePick,
      lineupPending: input.lineupPending,
      modelDisagreement: input.modelDisagreement,
    });

  return {
    id: input.id ?? randomUUID(),
    runId: input.runId,
    fixtureId: input.fixtureId,
    providerFixtureId: input.providerFixtureId,
    market: input.market as PredictionCandidate['market'],
    selection: input.selection,
    line: input.line,
    probability: input.estimatedProbability ?? undefined,
    modelProbability: input.estimatedProbability ?? undefined,
    odds: input.odds,
    impliedProbability: candidate.scored.impliedProbability ?? calculateImpliedProbability(input.odds),
    marketImpliedProbability: candidate.scored.marketImpliedProbability ?? calculateImpliedProbability(input.odds),
    marketFairProbability: candidate.scored.marketFairProbability ?? calculateImpliedProbability(input.odds),
    edge: candidate.scored.edge,
    oddsSnapshotId: input.oddsSnapshotId,
    oddsQuoteId: input.oddsQuoteId,
    researchBundleId: input.researchBundleId,
    evidenceIds: input.evidenceIds,
    claimIds: input.claimIds,
    rationale: input.rationale ?? 'Rule-based scoring v1 from persisted odds and linked research evidence.',
    blockers: edgeGate.blockers,
    promotable: edgeGate.promotable,
    warnings: [...new Set([...(input.warnings ?? []), ...candidate.reasons, ...edgeGate.blockers])],
    parlayEligible: input.parlayEligible,
    providerAgentic: input.providerAgentic as PredictionRecordView['providerAgentic'],
    model: input.model,
    promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
    scoringRuleVersion: SCORING_RULE_VERSION,
    confidence: clamp01(input.confidence),
    quality: confidenceBand,
    confidenceBand,
    status: candidate.valid && edgeGate.promotable ? input.status : edgeGate.blockers.length ? 'blocked' : 'blocked',
    generatedAt: input.generatedAt,
  };
}

export function qualityFromConfidence(confidence: number): PredictionQuality {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
