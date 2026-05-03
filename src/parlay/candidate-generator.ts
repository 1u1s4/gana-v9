import { randomUUID } from 'crypto';
import type { ParlaySourcePrediction } from './types.js';
import { correlationPenalty } from './correlation.js';

export interface ParlayCandidate {
  parlayId: string;
  legs: string[];
  combinedFairProbability: number;
  combinedMarketOdds: number;
  combinedFairOdds: number;
  expectedEdge: number;
  correlationPenalty: number;
  diversityScore: number;
  riskScore: number;
  reason: 'top-ev' | 'low-variance' | 'high-conviction' | 'rejected';
  blockers: string[];
}

export function generateParlayCandidates(predictions: ParlaySourcePrediction[], maxLegs = 4): ParlayCandidate[] {
  const eligible = predictions.filter((prediction: any) => prediction.status === 'promotable' && !(prediction.blockers?.length));
  const candidates: ParlayCandidate[] = [];
  for (let size = 2; size <= Math.min(maxLegs, eligible.length); size++) {
    const legs = eligible.slice(0, size);
    candidates.push(buildCandidate(legs));
  }
  return candidates.length ? candidates : [buildRejectedCandidate(predictions)];
}

function buildCandidate(predictions: ParlaySourcePrediction[]): ParlayCandidate {
  const penalty = correlationPenalty(predictions);
  const combinedFairProbability = predictions.reduce((product, prediction) => product * (prediction.estimatedProbability ?? prediction.confidence), 1) * (1 - penalty);
  const combinedMarketOdds = predictions.reduce((product, prediction) => product * prediction.odds, 1);
  const combinedFairOdds = combinedFairProbability > 0 ? 1 / combinedFairProbability : Infinity;
  const expectedEdge = (combinedMarketOdds * combinedFairProbability) - 1;
  const teams = new Set(predictions.map((prediction: any) => prediction.teamId ?? prediction.fixtureId));
  const blockers: string[] = [];
  if (combinedFairProbability < 0.05) blockers.push('low-conviction');
  if (combinedMarketOdds > 50) blockers.push('lottery-ticket');
  if (teams.size < predictions.length) blockers.push('duplicate-team');
  return {
    parlayId: randomUUID(),
    legs: predictions.map((prediction) => prediction.id),
    combinedFairProbability,
    combinedMarketOdds,
    combinedFairOdds,
    expectedEdge,
    correlationPenalty: penalty,
    diversityScore: teams.size / Math.max(1, predictions.length),
    riskScore: penalty + blockers.length * 0.25,
    reason: blockers.length ? 'rejected' : expectedEdge > 0.08 ? 'top-ev' : combinedFairProbability > 0.35 ? 'low-variance' : 'high-conviction',
    blockers,
  };
}

function buildRejectedCandidate(predictions: ParlaySourcePrediction[]): ParlayCandidate {
  return {
    parlayId: randomUUID(),
    legs: [],
    combinedFairProbability: 0,
    combinedMarketOdds: 0,
    combinedFairOdds: Infinity,
    expectedEdge: 0,
    correlationPenalty: 0,
    diversityScore: 0,
    riskScore: 1,
    reason: 'rejected',
    blockers: predictions.length ? ['no-promotable-predictions'] : ['no-predictions'],
  };
}
