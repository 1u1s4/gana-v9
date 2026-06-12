import type { MarketKey } from '../domain/markets.js';
import { LOW_ODDS_TOP_MAX_LEG_ODDS } from './eligibility.js';

export const PORTFOLIO_MIN_CONFIDENCE = 0.72;
const PORTFOLIO_REVIEW_MIN_CONFIDENCE = 0.7;
const LOW_VARIANCE_FALLBACK_MAX_LEG_ODDS = 1.35;
const PARLAY_ORO_FALLBACK_MAX_LEG_ODDS = 1.45;

export const PORTFOLIO_PROFILES = [
  {
    key: 'conservative',
    label: 'Conservador',
    minLegs: 2,
    maxLegs: 2,
    minOdds: 1.5,
    maxOdds: 2.2,
    targetParlays: 3,
    minConfidence: PORTFOLIO_MIN_CONFIDENCE,
    maxReviewOrWarningLegs: 0,
    allowDrawExposure: false,
    reviewOnly: false,
  },
  {
    key: 'balanced',
    label: 'Balanceado',
    minLegs: 2,
    maxLegs: 3,
    minOdds: 1.6,
    maxOdds: 2.2,
    targetParlays: 2,
    minConfidence: PORTFOLIO_MIN_CONFIDENCE,
    maxReviewOrWarningLegs: 0,
    allowDrawExposure: false,
    reviewOnly: true,
  },
  {
    key: 'review',
    label: 'Revision',
    minLegs: 2,
    maxLegs: 3,
    minOdds: 1.6,
    maxOdds: 3.2,
    targetParlays: 3,
    minConfidence: PORTFOLIO_REVIEW_MIN_CONFIDENCE,
    maxReviewOrWarningLegs: 99,
    allowDrawExposure: true,
    reviewOnly: true,
  },
] as const;

export const LOW_ODDS_TOP_PROFILE = {
  key: 'low-odds-top',
  label: 'Low odds top',
  minLegs: 2,
  maxLegs: 2,
  minOdds: 1.25,
  maxOdds: 1.8,
  targetParlays: 2,
  minConfidence: 0.7,
  maxReviewOrWarningLegs: 0,
  allowDrawExposure: false,
  reviewOnly: false,
} as const;

export const LOW_ODDS_TOP_FALLBACK_MAX_LEG_ODDS = 1.35;

export type DeterministicParlayProfile =
  | 'low-variance'
  | 'balanced'
  | 'totals'
  | 'high-conviction'
  | 'market-diverse'
  | 'parlay-oro'
  | 'parlay-diamante'
  | 'parlay-all-in'
  | 'parlay-refinado';
export type ParlayPortfolioProfile = typeof PORTFOLIO_PROFILES[number]['key'] | typeof LOW_ODDS_TOP_PROFILE['key'] | DeterministicParlayProfile;
export type ParlayPortfolioProfileSpec = typeof PORTFOLIO_PROFILES[number] | typeof LOW_ODDS_TOP_PROFILE;

export interface DeterministicProfileSpec {
  profile: DeterministicParlayProfile;
  minLegs: number;
  maxLegs: number;
  minOdds: number;
  maxOdds: number;
  maxLegOdds?: number;
  targetParlays: number;
  minConfidence: number;
  minEdge: number;
  markets?: MarketKey[];
  requireLine?: boolean;
  avoidDrawExposure?: boolean;
  allowFragileLowPriceDc?: boolean;
  requireMarketDiversity?: boolean;
  minAggregateConfidence?: number;
  reviewOnly?: boolean;
  allowMultipleLegsPerFixture?: boolean;
  averageAggregateConfidence?: boolean;
  allInSafeMode?: boolean;
  maxReviewLegs?: number;
  riskWeight: number;
}

export const PARLAY_REFINADO_RETROSPECTIVE = {
  sample: {
    settledParlays: 513,
    settledPredictions: 7560,
    counterfactualRuns: 112,
  },
  observedParlayPatterns: [
    'Best settled profiles by hit-rate: parlay-diamante 11/14 (0.786), low-odds-top 63/90 (0.700), low-variance 31/45 (0.689).',
    'Two-leg parlays were materially stronger: 216/364 excluding void/push (0.593); three legs fell to 27/71 (0.380), four-plus were poor.',
    'Combined odds 1.30-1.59 hit 65/94 (0.691), <1.30 hit 24/37 (0.649), 1.60-1.99 hit 73/118 (0.619); >=3.50 hit 8/60 (0.133).',
    'Leg odds below 1.25 were the most stable; 1.70-1.99 legs were weak in parlays.',
    'Double chance legs outperformed other markets in parlays; h2h away, totals, BTTS, corners and draw exposure were weaker or noisier.',
    'Duplicate fixture exposure was observed rarely and lost; enforce exactly one leg per fixture.',
  ],
  failurePatterns: [
    'Review-required, hard research warnings, negative edge, stale low-liquidity, draw exposure and parlay-ineligible legs were severe parlay failure signals.',
    'Fragile low total over, especially low-priced over 1.5/2.5 with low edge, materially underperformed in parlays.',
    'Over-sized parlays, high combined odds and aggressive/unknown profiles produced most of the worst losses.',
    'Corners remained insufficiently reliable for parlay promotion without market-specific settlement evidence.',
  ],
  counterfactualTakeaway: [
    'A pre-outcome selector using guarded 2-3 leg pools and 1.60-2.49 combined odds improved over loose high-odds construction but did not beat the strongest existing low-odds profiles.',
    'Therefore refined selection should be LLM-first only after deterministic guardrails, and should prefer two independent short-price legs unless a third leg is clearly safer than omitted alternatives.',
  ],
} as const;

export function deterministicProfileSpec(profile: DeterministicParlayProfile): DeterministicProfileSpec {
  switch (profile) {
    case 'low-variance':
      return {
        profile,
        minLegs: 2,
        maxLegs: 2,
        minOdds: 1.25,
        maxOdds: 1.8,
        maxLegOdds: LOW_ODDS_TOP_MAX_LEG_ODDS,
        targetParlays: 2,
        minConfidence: 0.78,
        minEdge: 0.005,
        markets: ['double_chance'],
        avoidDrawExposure: true,
        riskWeight: 0.75,
      };
    case 'balanced':
      return {
        profile,
        minLegs: 2,
        maxLegs: 3,
        minOdds: 1.6,
        maxOdds: 2.2,
        targetParlays: 2,
        minConfidence: 0.74,
        minEdge: 0.025,
        markets: ['btts', 'goals_over_under'],
        reviewOnly: true,
        minAggregateConfidence: 0.55,
        riskWeight: 0.55,
      };
    case 'totals':
      return {
        profile,
        minLegs: 2,
        maxLegs: 2,
        minOdds: 1.5,
        maxOdds: 2.2,
        targetParlays: 2,
        minConfidence: 0.68,
        minEdge: 0.02,
        markets: ['goals_over_under', 'btts'],
        requireLine: true,
        minAggregateConfidence: 0.48,
        riskWeight: 0.6,
      };
    case 'high-conviction':
      return {
        profile,
        minLegs: 2,
        maxLegs: 2,
        minOdds: 1.5,
        maxOdds: 2.2,
        targetParlays: 2,
        minConfidence: 0.78,
        minEdge: 0.04,
        reviewOnly: true,
        riskWeight: 0.45,
      };
    case 'market-diverse':
      return {
        profile,
        minLegs: 2,
        maxLegs: 3,
        minOdds: 1.6,
        maxOdds: 2.2,
        targetParlays: 2,
        minConfidence: 0.72,
        minEdge: 0.02,
        requireMarketDiversity: true,
        minAggregateConfidence: 0.5,
        reviewOnly: true,
        riskWeight: 0.5,
      };
    case 'parlay-oro':
      return {
        profile,
        minLegs: 2,
        maxLegs: 2,
        minOdds: 1.45,
        maxOdds: 2.2,
        maxLegOdds: 1.25,
        targetParlays: 1,
        minConfidence: 0.82,
        minEdge: 0.02,
        markets: ['h2h', 'double_chance'],
        avoidDrawExposure: true,
        minAggregateConfidence: 0.55,
        reviewOnly: true,
        riskWeight: 0.75,
      };
    case 'parlay-diamante':
      return {
        profile,
        minLegs: 2,
        maxLegs: 3,
        minOdds: 1.1,
        maxOdds: 1.3,
        maxLegOdds: 1.22,
        targetParlays: 1,
        minConfidence: 0.88,
        minEdge: 0,
        markets: ['h2h', 'double_chance'],
        avoidDrawExposure: true,
        minAggregateConfidence: 0.78,
        reviewOnly: false,
        riskWeight: 0.9,
      };
    case 'parlay-all-in':
      return {
        profile,
        minLegs: 2,
        maxLegs: 8,
        minOdds: 1.01,
        maxOdds: 6,
        maxLegOdds: 1.25,
        targetParlays: 1,
        minConfidence: 0.68,
        minEdge: 0,
        markets: ['h2h', 'double_chance', 'goals_over_under'],
        avoidDrawExposure: true,
        allowFragileLowPriceDc: true,
        reviewOnly: true,
        allowMultipleLegsPerFixture: false,
        averageAggregateConfidence: true,
        allInSafeMode: true,
        maxReviewLegs: 2,
        riskWeight: 0.7,
      };
    case 'parlay-refinado':
      return {
        profile,
        minLegs: 2,
        maxLegs: 3,
        minOdds: 1.3,
        maxOdds: 2.1,
        maxLegOdds: 1.65,
        targetParlays: 1,
        minConfidence: 0.7,
        minEdge: 0.015,
        markets: ['h2h', 'double_chance', 'goals_over_under', 'btts'],
        avoidDrawExposure: true,
        allowFragileLowPriceDc: false,
        minAggregateConfidence: 0.5,
        reviewOnly: false,
        allowMultipleLegsPerFixture: false,
        maxReviewLegs: 0,
        riskWeight: 0.65,
      };
  }
}

export function deterministicFallbackProfileSpec(
  profile: DeterministicParlayProfile,
  base: DeterministicProfileSpec,
  strictPoolSize: number,
): DeterministicProfileSpec | undefined {
  if (strictPoolSize >= base.minLegs) return undefined;
  if (profile === 'low-variance') {
    return {
      ...base,
      minOdds: 1.25,
      maxOdds: 2.2,
      maxLegOdds: LOW_VARIANCE_FALLBACK_MAX_LEG_ODDS,
      markets: ['h2h', 'double_chance'],
      allowFragileLowPriceDc: true,
    };
  }
  if (profile === 'parlay-oro') {
    return {
      ...base,
      minLegs: 2,
      maxLegs: 5,
      minOdds: 1.45,
      maxOdds: 3.0,
      maxLegOdds: PARLAY_ORO_FALLBACK_MAX_LEG_ODDS,
      minConfidence: 0.74,
      markets: ['h2h', 'double_chance', 'goals_over_under'],
      allowFragileLowPriceDc: true,
      minAggregateConfidence: 0.45,
    };
  }
  return undefined;
}
