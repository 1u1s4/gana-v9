import type { ParlayCandidate } from './candidate-generator.js';

const PROFILES = ['top-ev', 'low-variance', 'high-conviction'] as const;

export function diversifyParlays(candidates: ParlayCandidate[]): ParlayCandidate[] {
  const result: ParlayCandidate[] = [];
  for (const profile of PROFILES) {
    const match = candidates.find((candidate) => candidate.reason === profile && !candidate.blockers.length);
    if (match) result.push(match);
  }
  return result.slice(0, 3);
}
