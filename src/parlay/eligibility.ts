import type { ParlaySourcePrediction } from './types.js';

export const LOW_ODDS_TOP_MAX_LEG_ODDS = 1.2;
export const AUTOMATIC_PARLAY_MAX_LEG_ODDS = 2.2;

export function automaticParlayRiskReasons(prediction: ParlaySourcePrediction): string[] {
  const reasons: string[] = [];
  if (prediction.odds > AUTOMATIC_PARLAY_MAX_LEG_ODDS) {
    reasons.push(`above automatic parlay leg odds ceiling ${AUTOMATIC_PARLAY_MAX_LEG_ODDS}`);
  }
  if (hasStaleLowLiquidityRisk(prediction)) {
    reasons.push('stale low-liquidity prediction');
  }
  if (hasUnverifiedCornersRisk(prediction)) {
    reasons.push('corners market lacks settlement reliability or market-specific evidence');
  }
  if (hasInflatedDoubleChanceEdgeRisk(prediction)) {
    reasons.push('inflated double-chance edge');
  }
  return [...new Set(reasons)];
}

export function hasStaleLowLiquidityRisk(prediction: ParlaySourcePrediction): boolean {
  const text = predictionText(prediction);
  return /stale (?:news|source|odds) source|stale odds/i.test(text)
    && /low[-_ ]liquidity|low liquidity/i.test(text);
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
