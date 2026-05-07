export type ConfidenceBand = 'low' | 'medium' | 'high';

export interface ProbabilisticPredictionInput {
  modelProbability: number;
  marketFairProbability: number;
  confidenceBand: ConfidenceBand;
  evidenceCoverage?: number;
  lowLiquidity?: boolean;
  stalePick?: boolean;
  lineupPending?: boolean;
  modelDisagreement?: boolean;
}

export interface EdgeGateResult {
  edge: number;
  blockers: string[];
  promotable: boolean;
}

export function evaluateEdgeGate(input: ProbabilisticPredictionInput): EdgeGateResult {
  const blockers: string[] = [];
  const edge = input.modelProbability - input.marketFairProbability;
  if (edge <= 0) blockers.push('no-edge');
  // Confidence, evidence coverage, and liquidity are soft risk signals for analytical review.
  // They should not hard-block an otherwise positive-edge LLM prediction; callers surface
  // them as warnings so parlays can still be generated as review-required artifacts.

  if (input.stalePick) blockers.push('stale-pick');
  // lineup-pending is informational risk context, not a hard edge blocker.
  // Pre-kickoff lineups are often unavailable for today fixtures; blocking on them
  // downgrades otherwise valid analytical picks/parlays to review-required.
  if (input.modelDisagreement) blockers.push('model-disagreement');
  return { edge, blockers, promotable: blockers.length === 0 };
}
