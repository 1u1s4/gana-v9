import type { ParlayCandidate } from './candidate-generator.js';

export function rankParlayCandidates(candidates: ParlayCandidate[], riskWeight = 0.5): ParlayCandidate[] {
  return [...candidates].sort((a, b) => score(b, riskWeight) - score(a, riskWeight));
}

function score(candidate: ParlayCandidate, riskWeight: number): number {
  return candidate.expectedEdge - riskWeight * candidate.riskScore + candidate.diversityScore * 0.05;
}
