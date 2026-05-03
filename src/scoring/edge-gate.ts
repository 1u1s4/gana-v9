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
  if (input.confidenceBand === 'low') blockers.push('low-confidence');
  if ((input.evidenceCoverage ?? 1) < 0.6) blockers.push('evidence-thin');
  if (input.lowLiquidity) blockers.push('low-liquidity');
  if (input.stalePick) blockers.push('stale-pick');
  if (input.lineupPending) blockers.push('lineup-pending');
  if (input.modelDisagreement) blockers.push('model-disagreement');
  return { edge, blockers, promotable: blockers.length === 0 };
}
