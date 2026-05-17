import type { ParlaySourcePrediction } from './types.js';

export const LOW_ODDS_TOP_MAX_LEG_ODDS = 1.2;
export const AUTOMATIC_PARLAY_MAX_LEG_ODDS = 2.2;
export const FRAGILE_TOTAL_OVER_MAX_ODDS = 1.3;
export const OVERINFLATED_EDGE_FLOOR = 0.2;

export function automaticParlayRiskReasons(prediction: ParlaySourcePrediction): string[] {
  const reasons: string[] = [];
  if (prediction.odds > AUTOMATIC_PARLAY_MAX_LEG_ODDS) {
    reasons.push(`above automatic parlay leg odds ceiling ${AUTOMATIC_PARLAY_MAX_LEG_ODDS}`);
  }
  if (hasStaleLowLiquidityRisk(prediction)) {
    reasons.push('stale low-liquidity prediction');
  }
  if (prediction.status !== 'promotable' && hasLowLiquidityH2hFavoriteRisk(prediction)) {
    reasons.push('low-liquidity h2h short favorite');
  }
  if (hasUnverifiedCornersRisk(prediction)) {
    reasons.push('corners market lacks settlement reliability or market-specific evidence');
  }
  if (hasInflatedDoubleChanceEdgeRisk(prediction)) {
    reasons.push('inflated double-chance edge');
  }
  if (prediction.status !== 'promotable' && hasLowLiquidityRisk(prediction)) {
    reasons.push('low-liquidity prediction');
  }
  if (hasLineupPendingRisk(prediction)) {
    reasons.push('lineup-pending prediction');
  }
  if (hasSelectionEvidenceMissingRisk(prediction)) {
    reasons.push('selection-level evidence missing');
  }
  if (hasH2hAwayRisk(prediction)) {
    reasons.push('h2h away automatic risk');
  }
  if (hasFragileLowTotalOverRisk(prediction)) {
    reasons.push(`fragile low-priced total over at odds <= ${FRAGILE_TOTAL_OVER_MAX_ODDS}`);
  }
  if (hasOverinflatedEdgeRisk(prediction)) {
    reasons.push(`overinflated edge >= ${OVERINFLATED_EDGE_FLOOR}`);
  }
  return [...new Set(reasons)];
}

export function hasLowLiquidityRisk(prediction: ParlaySourcePrediction): boolean {
  return /low[-_ ]liquidity|low liquidity|single[-_ ]bookmaker/i.test(predictionText(prediction));
}

export function hasLineupPendingRisk(prediction: ParlaySourcePrediction): boolean {
  return /lineup[-_ ]pending|lineup pending|lineups? unconfirmed|lineup confirmation pending/i.test(predictionText(prediction));
}

export function hasSelectionEvidenceMissingRisk(prediction: ParlaySourcePrediction): boolean {
  return /no selection(?:\/line)?[- ]specific|selection[- ]level .*not supplied|selection[- ]level .*missing|market[- ]level only|support is market[- ]level only|fixture[- ]level evidence/i.test(predictionText(prediction));
}

export function hasH2hAwayRisk(prediction: ParlaySourcePrediction): boolean {
  return prediction.market === 'h2h'
    && prediction.selection === 'away'
    && prediction.odds > LOW_ODDS_TOP_MAX_LEG_ODDS;
}

export function hasFragileLowTotalOverRisk(prediction: ParlaySourcePrediction): boolean {
  return prediction.market === 'goals_over_under'
    && prediction.selection === 'over'
    && prediction.odds <= FRAGILE_TOTAL_OVER_MAX_ODDS;
}

export function hasOverinflatedEdgeRisk(prediction: ParlaySourcePrediction): boolean {
  return prediction.edge !== undefined && prediction.edge >= OVERINFLATED_EDGE_FLOOR;
}

export function hasStaleLowLiquidityRisk(prediction: ParlaySourcePrediction): boolean {
  const text = predictionText(prediction);
  return /stale (?:news|source|odds) source|stale odds/i.test(text)
    && hasLowLiquidityRisk(prediction);
}

export function hasLowLiquidityH2hFavoriteRisk(prediction: ParlaySourcePrediction): boolean {
  if (prediction.market !== 'h2h') return false;
  if (prediction.selection === 'draw') return false;
  if (prediction.odds > LOW_ODDS_TOP_MAX_LEG_ODDS) return false;
  return hasLowLiquidityRisk(prediction);
}

export function hasUnverifiedCornersRisk(prediction: ParlaySourcePrediction): boolean {
  if (prediction.market !== 'corners_over_under') return false;
  const text = predictionText(prediction);
  if (/corners[- ]settlement[- ]reliable|corner settlement reliable|settlement reliable for corners/i.test(text)) {
    return /market-specific evidence missing|quote-led|statistics unavailable|corner recommendation is a weak signal/i.test(text);
  }
  return true;
}

export function hasInflatedDoubleChanceEdgeRisk(prediction: ParlaySourcePrediction): boolean {
  if (prediction.market !== 'double_chance') return false;
  if (prediction.edge === undefined || prediction.edge < 0.25) return false;
  if (prediction.marketFairProbability === undefined) return prediction.odds <= 1.25;
  const impliedProbability = 1 / prediction.odds;
  return prediction.odds <= 1.25 && prediction.marketFairProbability < impliedProbability - 0.2;
}

function predictionText(prediction: ParlaySourcePrediction): string {
  return [
    prediction.rationale ?? '',
    ...(prediction.warnings ?? []),
    ...(prediction.riskTags ?? []),
  ].join('\n');
}
