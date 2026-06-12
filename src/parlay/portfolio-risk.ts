import {
  AUTOMATIC_PARLAY_MAX_LEG_ODDS,
  automaticParlayRiskReasons,
  hasH2hAwayRisk,
  hasInflatedDoubleChanceEdgeRisk,
  hasLineupPendingRisk,
  hasLowLiquidityRisk,
  hasLowLiquidityH2hFavoriteRisk,
  hasOverinflatedEdgeRisk,
  hasSelectionEvidenceMissingRisk,
  hasStaleLowLiquidityRisk,
  hasUnverifiedCornersRisk,
} from './eligibility.js';
import type { ParlayPortfolioProfileSpec } from './profile-specs.js';
import type { ParlayRiskTag, ParlaySourcePrediction } from './types.js';

export function decoratePortfolioPrediction(prediction: ParlaySourcePrediction): ParlaySourcePrediction {
  const riskTags = portfolioRiskTags(prediction);
  return {
    ...prediction,
    riskTags,
    riskScore: riskTags.length,
  };
}

export function isPortfolioPoolEligible(
  prediction: ParlaySourcePrediction,
  profile: ParlayPortfolioProfileSpec,
): boolean {
  return portfolioPoolExclusionReasons(prediction, profile).length === 0;
}

export function portfolioPoolExclusionReasons(
  prediction: ParlaySourcePrediction,
  profile: ParlayPortfolioProfileSpec,
): string[] {
  const reasons: string[] = [];
  if (!profile.reviewOnly && prediction.parlayEligible === false) reasons.push('not parlay eligible');
  reasons.push(...automaticParlayRiskReasons(prediction));
  if (!profile.reviewOnly && hasHardResearchWarning(prediction)) reasons.push('hard research warning');
  if (prediction.confidence < profile.minConfidence) reasons.push(`below ${profile.label} confidence floor`);
  if (hasRiskTag(prediction, 'negative_edge')) reasons.push('negative edge');
  if (hasRiskTag(prediction, 'draw_exposure') && !profile.allowDrawExposure) reasons.push('draw exposure');
  if (hasRiskTag(prediction, 'fragile_low_total_over') && hasRiskTag(prediction, 'low_edge')) {
    reasons.push('fragile low total over with low edge');
  }
  if (hasRiskTag(prediction, 'fragile_low_price_dc') && hasRiskTag(prediction, 'low_edge')) {
    reasons.push('fragile low-price double chance with low edge');
  }
  if (profile.key === 'balanced' && prediction.market !== 'btts' && prediction.market !== 'goals_over_under') {
    reasons.push('market not allowed for balanced profile');
  }
  return reasons;
}

export function lowOddsTopPoolExclusionReasons(
  prediction: ParlaySourcePrediction,
  profile: ParlayPortfolioProfileSpec,
  threshold: number,
): string[] {
  const reasons = portfolioPoolExclusionReasons(prediction, profile);
  if (!isLowOddsTopStrictSelection(prediction)) reasons.push('market/selection not allowed for low-odds-top');
  if (hasRiskTag(prediction, 'low_liquidity_h2h_favorite')) reasons.push('low-liquidity h2h short favorite');
  if (prediction.odds > threshold) reasons.push(`above low-odds threshold ${threshold}`);
  if (hasHardResearchWarning(prediction)) reasons.push('hard research warning');
  if (prediction.parlayEligible === false) reasons.push('not parlay eligible');
  return [...new Set(reasons)];
}

export function lowOddsTopFallbackExclusionReasons(
  prediction: ParlaySourcePrediction,
  profile: ParlayPortfolioProfileSpec,
  maxOdds: number,
): string[] {
  const reasons = portfolioPoolExclusionReasons(prediction, profile);
  if (!isLowOddsTopFallbackSelection(prediction)) {
    reasons.push('market not allowed for low-odds-top fallback');
  }
  if (hasRiskTag(prediction, 'low_liquidity_h2h_favorite')) reasons.push('low-liquidity h2h short favorite');
  if (prediction.odds > maxOdds) reasons.push(`above low-odds fallback threshold ${maxOdds}`);
  if (hasHardResearchWarning(prediction)) reasons.push('hard research warning');
  if (prediction.parlayEligible === false) reasons.push('not parlay eligible');
  return [...new Set(reasons)];
}

function isLowOddsTopStrictSelection(prediction: ParlaySourcePrediction): boolean {
  if (prediction.market === 'h2h') return prediction.selection === 'home' || prediction.selection === 'away';
  if (prediction.market === 'double_chance') return prediction.selection === 'home_or_draw' || prediction.selection === 'draw_or_away';
  return false;
}

function isLowOddsTopFallbackSelection(prediction: ParlaySourcePrediction): boolean {
  if (isLowOddsTopStrictSelection(prediction)) return true;
  if (prediction.market === 'goals_over_under') return prediction.selection === 'under' || Number(prediction.line ?? 0) >= 2.5;
  return false;
}

export function hasHardResearchWarning(prediction: ParlaySourcePrediction): boolean {
  return (prediction.warnings ?? []).some((warning) =>
    /research is not promotable|fallback research|stale (news|source|odds) source|timed out|insufficient evidence/i.test(warning),
  );
}

function hasPortfolioHardOrResearchWarning(prediction: ParlaySourcePrediction): boolean {
  return (prediction.warnings ?? []).some((warning) => {
    if (isSoftPortfolioWarning(warning)) return false;
    return /research|fallback|stale|timed out|insufficient evidence|conflict|mismatch|invalid/i.test(warning);
  });
}

function isSoftPortfolioWarning(warning: string): boolean {
  return /market liquidity warning/i.test(warning);
}

function portfolioRiskTags(prediction: ParlaySourcePrediction): ParlayRiskTag[] {
  const tags: ParlayRiskTag[] = [];
  const edge = prediction.edge;

  if (edge === undefined || edge < 0.02) tags.push('low_edge');
  if (edge !== undefined && edge < 0) tags.push('negative_edge');
  if (prediction.confidence < 0.75) tags.push('low_confidence');
  if (prediction.confidence >= 0.8 && prediction.confidence < 0.9) tags.push('uncalibrated_high_confidence');
  if (prediction.odds > AUTOMATIC_PARLAY_MAX_LEG_ODDS) tags.push('high_odds');
  if (prediction.status === 'review-required') tags.push('review_required');
  if (hasPortfolioHardOrResearchWarning(prediction)) tags.push('research_warning');
  if (hasStaleLowLiquidityRisk(prediction)) tags.push('stale_low_liquidity');
  if (hasLowLiquidityRisk(prediction)) tags.push('low_liquidity');
  if (hasLineupPendingRisk(prediction)) tags.push('lineup_pending');
  if (hasSelectionEvidenceMissingRisk(prediction)) tags.push('selection_evidence_missing');
  if (hasH2hAwayRisk(prediction)) tags.push('h2h_away');
  if (hasLowLiquidityH2hFavoriteRisk(prediction)) tags.push('low_liquidity_h2h_favorite');
  if (hasUnverifiedCornersRisk(prediction)) tags.push('corners_unverified');
  if (hasInflatedDoubleChanceEdgeRisk(prediction)) tags.push('inflated_double_chance_edge');
  if (hasOverinflatedEdgeRisk(prediction)) tags.push('overinflated_edge');
  if (prediction.market === 'goals_over_under' && prediction.selection === 'over' && (prediction.line ?? 0) <= 1.5 && prediction.odds <= 1.4) {
    tags.push('fragile_low_total_over');
  }
  if (prediction.market === 'double_chance' && prediction.odds <= 1.25) {
    tags.push('fragile_low_price_dc');
  }
  if (prediction.market === 'double_chance' && prediction.selection === 'home_or_away') {
    tags.push('draw_exposure');
  }

  return [...new Set(tags)];
}

export function hasRiskTag(prediction: ParlaySourcePrediction, tag: ParlayRiskTag): boolean {
  return prediction.riskTags?.includes(tag) ?? false;
}
