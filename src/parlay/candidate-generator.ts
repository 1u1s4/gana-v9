import { randomUUID } from 'crypto';
import type { ParlaySourcePrediction } from './types.js';
import { correlationBlockers, correlationPenalty } from './correlation.js';

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
  const eligible = predictions
    .filter((prediction: any) => (prediction.status === 'promotable' || prediction.status === 'candidate') && !(prediction.blockers?.length))
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0) || b.confidence - a.confidence || a.odds - b.odds);
  const candidates: ParlayCandidate[] = [];
  for (let size = 2; size <= Math.min(maxLegs, eligible.length); size++) {
    collectCombinations(eligible, size, 0, [], candidates, 300);
  }
  return candidates.length ? candidates : [buildRejectedCandidate(predictions)];
}

function collectCombinations(
  pool: readonly ParlaySourcePrediction[],
  size: number,
  start: number,
  current: ParlaySourcePrediction[],
  output: ParlayCandidate[],
  limit: number,
): void {
  if (output.length >= limit) return;
  if (current.length === size) {
    output.push(buildCandidate(current));
    return;
  }
  for (let index = start; index < pool.length; index++) {
    current.push(pool[index]);
    collectCombinations(pool, size, index + 1, current, output, limit);
    current.pop();
    if (output.length >= limit) return;
  }
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
  blockers.push(...correlationBlockers(predictions));
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
