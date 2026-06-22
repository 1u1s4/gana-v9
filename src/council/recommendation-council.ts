export type CouncilDecision = 'approve' | 'review' | 'reject';

export interface RecommendationCouncilInput {
  date: string;
  dailyBatchId: string;
  generatedAt: string;
  recommendations: readonly CouncilRecommendation[];
  providerComparison?: unknown;
  validationFreshness?: unknown;
}

export interface CouncilRecommendation {
  kind?: string;
  rank?: number;
  parlayId?: string;
  predictionId?: string;
  profile?: string;
  harnessStatus?: string;
  selectionMode?: string;
  combinedOdds?: number;
  aggregateConfidence?: number;
  expectedEdge?: number;
  riskFlags?: string[];
  reasons?: string[];
  providers?: string[];
  legs?: Array<{
    fixtureId?: string;
    fixture?: string;
    market?: string;
    selection?: string;
    line?: number | null;
    odds?: number | null;
    confidence?: number | null;
    warnings?: string[];
    display?: {
      fixtureLabel?: string;
      homeTeamName?: string;
      awayTeamName?: string;
      leagueName?: string;
      kickoffLocal?: string;
    };
  }>;
}

export interface CouncilRecommendationReview {
  recommendationKey: string;
  rank: number | null;
  kind: string;
  decision: CouncilDecision;
  score: number;
  panelScores: Record<string, number>;
  signals: string[];
  reasons: string[];
  feedback: string[];
}

export interface RecommendationCouncilResult {
  councilVersion: 'gana-local-council-v1';
  inspiredBy: {
    name: 'Council of High Intelligence';
    url: 'https://github.com/0xNyk/council-of-high-intelligence';
    mode: 'execution-lean triad-compatible local gate';
  };
  date: string;
  dailyBatchId: string;
  generatedAt: string;
  panel: string[];
  status: 'approved' | 'review-required' | 'blocked';
  policy: {
    approveAt: number;
    reviewAt: number;
    keepDecisions: CouncilDecision[];
    qualityGate: {
      approveRequires: string;
      reviewRequires: string;
      rejectRequires: string;
    };
  };
  approvedCount: number;
  reviewCount: number;
  rejectedCount: number;
  reviews: CouncilRecommendationReview[];
  feedbackLoop: {
    validationTarget: 'published-recommendations-only';
    outcomeArtifact: 'council-feedback.json';
    learningSignals: string[];
  };
}

const PANEL = ['feynman', 'kahneman', 'taleb', 'meadows', 'torvalds'] as const;
const APPROVE_AT = 0.68;
const REVIEW_AT = 0.52;
const APPROVE_MIN_CONFIDENCE = 0.72;
const APPROVE_MIN_EDGE = 0.02;
const REVIEW_MIN_CONFIDENCE = 0.62;
const PARLAY_REVIEW_MIN_CONFIDENCE = 0.48;
const REVIEW_MIN_EDGE = 0.01;
const KEEP_DECISIONS: CouncilDecision[] = ['approve', 'review'];
const METADATA_RISK_FLAGS = new Set([
  'single-selection',
  'provider-consensus',
  'analytical-fallback',
  'review-required',
  'council-composed',
  'daily-focus-fallback',
]);
const HARD_RISK_FLAGS = new Set([
  'stale-source',
  'corners-unverified',
  'lineup-pending',
  'selection-evidence-missing',
  'blocked-source-prediction',
  'low-liquidity-h2h-favorite',
  'inflated-double-chance-edge',
  'overinflated-edge',
]);

export function runRecommendationCouncil(input: RecommendationCouncilInput): RecommendationCouncilResult {
  const reviews = input.recommendations.map((recommendation, index) => reviewRecommendation(recommendation, index));
  const approvedCount = reviews.filter((review) => review.decision === 'approve').length;
  const reviewCount = reviews.filter((review) => review.decision === 'review').length;
  const rejectedCount = reviews.filter((review) => review.decision === 'reject').length;
  const status = approvedCount > 0
    ? 'approved'
    : reviewCount > 0
      ? 'review-required'
      : 'blocked';

  return {
    councilVersion: 'gana-local-council-v1',
    inspiredBy: {
      name: 'Council of High Intelligence',
      url: 'https://github.com/0xNyk/council-of-high-intelligence',
      mode: 'execution-lean triad-compatible local gate',
    },
    date: input.date,
    dailyBatchId: input.dailyBatchId,
    generatedAt: input.generatedAt,
    panel: [...PANEL],
    status,
    policy: {
      approveAt: APPROVE_AT,
      reviewAt: REVIEW_AT,
      keepDecisions: KEEP_DECISIONS,
      qualityGate: {
        approveRequires: `score >= ${APPROVE_AT}, confidence >= ${APPROVE_MIN_CONFIDENCE}, edge >= ${APPROVE_MIN_EDGE}, no hard risk flags`,
        reviewRequires: `score >= ${REVIEW_AT}, confidence >= ${REVIEW_MIN_CONFIDENCE} for simples or ${PARLAY_REVIEW_MIN_CONFIDENCE} for parlays, edge >= ${REVIEW_MIN_EDGE}, no hard risk flags`,
        rejectRequires: 'negative edge, hard risk flag, low confidence, or score below review gate',
      },
    },
    approvedCount,
    reviewCount,
    rejectedCount,
    reviews,
    feedbackLoop: {
      validationTarget: 'published-recommendations-only',
      outcomeArtifact: 'council-feedback.json',
      learningSignals: [
        'settled outcome by council score bucket',
        'low-odds hit rate',
        'women/youth fixture hit rate',
        'rejected-risk false negatives',
        'review-required promotion misses',
      ],
    },
  };
}

export function applyCouncilDecisions<T extends CouncilRecommendation>(
  recommendations: readonly T[],
  council: RecommendationCouncilResult,
): T[] {
  const decisions = new Map(council.reviews.map((review) => [review.recommendationKey, review]));
  return recommendations.flatMap((recommendation, index) => {
    const key = recommendationKey(recommendation, index);
    const review = decisions.get(key);
    if (!review || !KEEP_DECISIONS.includes(review.decision)) return [];
    return [{
      ...recommendation,
      rank: 0,
      councilDecision: {
        decision: review.decision,
        score: review.score,
        panelScores: review.panelScores,
        signals: review.signals,
        reasons: review.reasons,
        feedback: review.feedback,
      },
    } as T];
  }).map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));
}

function reviewRecommendation(recommendation: CouncilRecommendation, index: number): CouncilRecommendationReview {
  const profile = recommendation.profile ?? 'unknown';
  const confidence = clamp(numberOr(recommendation.aggregateConfidence, 0), 0, 0.99);
  const edge = clamp(numberOr(recommendation.expectedEdge, 0), -0.5, 0.5);
  const odds = Math.max(1, numberOr(recommendation.combinedOdds, 1));
  const riskFlags = new Set(recommendation.riskFlags ?? []);
  const signals = recommendationSignals(recommendation);
  const hardRiskCount = [...riskFlags].filter((flag) => HARD_RISK_FLAGS.has(flag) && !(profile === 'parlay-all-in' && flag === 'low-liquidity-h2h-favorite')).length;
  const riskCount = [...riskFlags].filter((flag) => !METADATA_RISK_FLAGS.has(flag)).length;
  const fallbackPenalty = recommendation.selectionMode === 'analytical-fallback' ? 0.03 : 0;
  const oddsPenalty = odds > 2.5 ? Math.min(0.12, Math.log2(odds / 2.5) * 0.05) : 0;
  const profileBoost = profile === 'parlay-diamante'
    ? 0.08
    : profile === 'parlay-all-in'
      ? 0.04
    : profile === 'low-odds-top'
      ? 0.07
      : profile === 'low-variance'
        ? 0.05
        : recommendation.kind === 'atomic-prediction'
          ? 0.04
          : 0;
  const signalBoost = (signals.includes('low-odds') ? 0.055 : 0)
    + (signals.includes('women-youth-development') ? 0.04 : 0)
    + (signals.includes('provider-consensus') ? 0.04 : 0)
    + (signals.includes('council-composed') ? 0.05 : 0);

  const base = (confidence * 0.68)
    + (Math.max(0, edge) * 0.6)
    + profileBoost
    + signalBoost
    - (riskCount * 0.015)
    - (hardRiskCount * 0.08)
    - fallbackPenalty
    - oddsPenalty;
  const panelScores = {
    feynman: clamp(base + evidenceAdjustment(recommendation) - (hardRiskCount * 0.05), 0, 1),
    kahneman: clamp(base - overconfidencePenalty(recommendation) - (edge > 0.25 ? 0.05 : 0), 0, 1),
    taleb: clamp(base - (riskCount * 0.02) - oddsPenalty, 0, 1),
    meadows: clamp(base + signalBoost + (recommendation.kind === 'atomic-prediction' ? 0.01 : 0), 0, 1),
    torvalds: clamp(base + (hardRiskCount ? -0.08 : 0.03), 0, 1),
  };
  const score = round(average(Object.values(panelScores)), 4);
  const blockers = councilBlockers(recommendation, score, hardRiskCount);
  const decision: CouncilDecision = blockers.length === 0
    && score >= APPROVE_AT
    && confidence >= APPROVE_MIN_CONFIDENCE
    && edge >= APPROVE_MIN_EDGE
    ? 'approve'
    : blockers.length === 0
      && score >= REVIEW_AT
      && confidence >= reviewMinConfidence(recommendation)
      && edge >= REVIEW_MIN_EDGE
      ? 'review'
      : 'reject';

  return {
    recommendationKey: recommendationKey(recommendation, index),
    rank: Number.isInteger(recommendation.rank) ? recommendation.rank as number : null,
    kind: recommendation.kind ?? 'parlay',
    decision,
    score,
    panelScores,
    signals,
    reasons: councilReasons(recommendation, decision, score, signals, blockers),
    feedback: councilFeedback(recommendation, decision, signals),
  };
}

function councilBlockers(
  recommendation: CouncilRecommendation,
  score: number,
  hardRiskCount: number,
): string[] {
  const blockers: string[] = [];
  const confidence = numberOr(recommendation.aggregateConfidence, 0);
  const edge = numberOr(recommendation.expectedEdge, 0);
  if (edge < 0) blockers.push('negative-edge');
  if (hardRiskCount > 0) blockers.push('hard-risk-flag');
  if (confidence < reviewMinConfidence(recommendation)) blockers.push('confidence-below-review-gate');
  if (edge < REVIEW_MIN_EDGE) blockers.push('edge-below-review-gate');
  if (score < REVIEW_AT) blockers.push('score-below-review-gate');
  return uniqueStrings(blockers);
}

function reviewMinConfidence(recommendation: CouncilRecommendation): number {
  return recommendation.kind === 'parlay' ? PARLAY_REVIEW_MIN_CONFIDENCE : REVIEW_MIN_CONFIDENCE;
}

function recommendationSignals(recommendation: CouncilRecommendation): string[] {
  const signals: string[] = [];
  const legs = recommendation.legs ?? [];
  if (
    numberOr(recommendation.combinedOdds, 99) <= 1.5
    || legs.some((leg) => numberOr(leg.odds, 99) <= 1.25)
  ) {
    signals.push('low-odds');
  }
  if (legs.some((leg) => womenYouthDevelopmentPattern().test(legText(leg)))) {
    signals.push('women-youth-development');
  }
  if ((recommendation.providers?.length ?? 0) > 1 || recommendation.riskFlags?.includes('provider-consensus')) {
    signals.push('provider-consensus');
  }
  if (recommendation.riskFlags?.includes('council-composed')) signals.push('council-composed');
  if (recommendation.selectionMode === 'analytical-fallback') signals.push('fallback-review');
  return [...new Set(signals)];
}

function councilReasons(
  recommendation: CouncilRecommendation,
  decision: CouncilDecision,
  score: number,
  signals: string[],
  blockers: string[],
): string[] {
  const reasons = [
    `council ${decision} score ${score}`,
    `confidence ${round(numberOr(recommendation.aggregateConfidence, 0), 3)}`,
    `edge ${round(numberOr(recommendation.expectedEdge, 0), 3)}`,
  ];
  if (signals.length) reasons.push(`signals: ${signals.join(', ')}`);
  if (blockers.length) reasons.push(`blockers: ${blockers.join(', ')}`);
  return reasons;
}

function councilFeedback(recommendation: CouncilRecommendation, decision: CouncilDecision, signals: string[]): string[] {
  const feedback = [
    decision === 'approve'
      ? 'track outcome as council-approved published recommendation'
      : decision === 'review'
        ? 'track separately from fully approved picks; require manual review before promotion'
        : 'do not publish unless new evidence removes council blockers',
  ];
  if (signals.includes('women-youth-development')) feedback.push('keep development/women signal in outcome buckets');
  if (signals.includes('low-odds')) feedback.push('keep low-odds signal in outcome buckets');
  if (recommendation.selectionMode === 'analytical-fallback') feedback.push('fallback picks must not train promotion thresholds as approved wins');
  return feedback;
}

function evidenceAdjustment(recommendation: CouncilRecommendation): number {
  const text = [
    ...(recommendation.reasons ?? []),
    ...(recommendation.legs ?? []).flatMap((leg) => leg.warnings ?? []),
  ].join('\n');
  if (/selection-level evidence missing|market-level only|fixture-level evidence/i.test(text)) return -0.08;
  if (/market-specific|provider snapshot|consensus|calibration/i.test(text)) return 0.03;
  return 0;
}

function overconfidencePenalty(recommendation: CouncilRecommendation): number {
  const confidence = numberOr(recommendation.aggregateConfidence, 0);
  const edge = numberOr(recommendation.expectedEdge, 0);
  if (confidence >= 0.97 && edge >= 0.25) return 0.08;
  if (recommendation.riskFlags?.includes('overinflated-edge')) return 0.06;
  if (recommendation.riskFlags?.includes('inflated-double-chance-edge')) return 0.06;
  return 0;
}

function recommendationKey(recommendation: CouncilRecommendation, index: number): string {
  return [
    recommendation.kind ?? 'parlay',
    recommendation.parlayId ?? recommendation.predictionId ?? `rank-${recommendation.rank ?? index + 1}`,
    index + 1,
  ].join(':');
}

function legText(leg: NonNullable<CouncilRecommendation['legs']>[number]): string {
  return [
    leg.fixture,
    leg.display?.fixtureLabel,
    leg.display?.homeTeamName,
    leg.display?.awayTeamName,
    leg.display?.leagueName,
  ].filter(Boolean).join(' ');
}

function womenYouthDevelopmentPattern(): RegExp {
  return /\b(w|women|femenil|femenino|femenina|u-?1[7-9]|u-?2[0-3]|sub[- ]?1[7-9]|sub[- ]?2[0-3]|reserves?|ii|b)\b/i;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
