import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fixture } from '../domain/fixtures.js';
import type { ParlayAnalysisRecommendation } from '../parlay/analysis.js';
import type { PredictionRecordView } from '../prediction/types.js';
import type { RunPipelineResult } from '../runtime/run-service.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';
import type { AtomicPredictionCandidate, AtomicPredictionRecommendation, DailyE2EProvider, DailyFinalRecommendation, RecommendationLegDisplay } from './types.js';

export type DailyRecommendationModelResolver = (provider: DailyE2EProvider) => string;

export const DAILY_PARLAY_RECOMMENDATION_LIMIT = 3;
export const DAILY_PARLAY_ANALYSIS_TOP = 12;
export const DAILY_FALLBACK_PARLAY_LIMIT = 3;
export const DAILY_FALLBACK_PARLAY_LEGS = 2;
export const DAILY_COUNCIL_COMPOSED_PARLAY_LIMIT = 3;
export const DAILY_PARLAY_CONSERVATIVE_MAX_ODDS = 2.2;
export const DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE = 0.7;
export const DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE = 0.78;
export const DAILY_ATOMIC_RECOMMENDATION_LIMIT = 10;
export const ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR = 0.9;
export const ATOMIC_RECOMMENDATION_EDGE_FLOOR = 0;
export const ATOMIC_RECOMMENDATION_PROFILE = 'atomic-high-confidence';
export const ATOMIC_SAFETY_DOUBLE_CHANCE_MIN_ODDS = 1.05;
export const ATOMIC_SAFETY_DOUBLE_CHANCE_MAX_ODDS = 1.25;
export const ATOMIC_SAFETY_MIN_EFFECTIVE_CONFIDENCE = 0.7;
export const ATOMIC_SAFETY_TOTALS_MAX_ODDS = 1.6;
export const ATOMIC_SAFETY_BREAK_EVEN_EDGE_FLOOR = -0.05;
export const ATOMIC_SAFETY_REVIEW_EDGE_FLOOR = 0.01;
export const DAILY_STAKE_BUCKETS = [1, 5, 10, 15, 20, 25] as const;
export const VALIDATION_FRESHNESS_MIN_COVERAGE = 0.6;
export const VALIDATION_FRESHNESS_MAX_UNRESOLVED_RATE = 0.25;
export const DAILY_PREFERRED_PARLAY_PROFILE_ORDER = ['parlay-diamante', 'parlay-refinado', 'low-variance'] as const;
export const DAILY_FINAL_PARLAY_ALLOWED_PROFILES = ['parlay-diamante', 'parlay-refinado', 'parlay-all-in', 'low-odds-top', 'low-variance'] as const;
export const DAILY_FINAL_PARLAY_BLOCKED_PROFILES = ['balanced', 'high-conviction', 'market-diverse', 'parlay-oro', 'default', 'review', 'totals', 'aggressive'] as const;
export const DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS = [
  'high-combined-odds',
  'stale-source',
  'corners-unverified',
  'negative-portfolio-edge',
  'duplicate-leg-set',
  'historically-weak-profile',
  'low-liquidity-h2h-favorite',
] as const;
export const DAILY_FINAL_DEMOTED_MODELS = ['gpt-5.4-mini'] as const;
const DAILY_FOCUS_FALLBACK_RISK_FLAG = 'daily-focus-fallback';
const DAILY_FOCUS_PROFILE_WINDOW_MISS_RISK_FLAG = 'profile-window-miss';
const DAILY_FOCUS_FALLBACK_MIN_LEGS = 2;
const DAILY_FOCUS_FALLBACK_MAX_SOURCE_LEGS = 18;
export const ATOMIC_BLOCKED_RISK_FLAGS = [
  'stale-source',
  'corners-market',
  'corners-unverified',
  'low-liquidity-h2h-favorite',
  'low-liquidity',
  'lineup-pending',
  'selection-evidence-missing',
  'h2h-away',
  'inflated-double-chance-edge',
  'overinflated-edge',
] as const;

export function selectDailyParlayRecommendations(
  recommendations: readonly ParlayAnalysisRecommendation[],
  limit: number,
): ParlayAnalysisRecommendation[] {
  const selected: ParlayAnalysisRecommendation[] = [];
  const usedIds = new Set<string>();
  const usedProfiles = new Set<string>();
  const usedSignatures = new Set<string>();
  const add = (recommendation: ParlayAnalysisRecommendation) => {
    if (selected.length >= limit || usedIds.has(recommendation.parlayId)) return;
    if (usedProfiles.has(recommendation.profile)) return;
    if (!isConservativeDailyParlayRecommendation(recommendation)) return;
    const signature = parlayLogicalSignature(recommendation);
    if (!signature || usedSignatures.has(signature)) return;
    selected.push(recommendation);
    usedIds.add(recommendation.parlayId);
    usedProfiles.add(recommendation.profile);
    usedSignatures.add(signature);
  };

  for (const profile of DAILY_PREFERRED_PARLAY_PROFILE_ORDER) {
    for (const recommendation of recommendations) {
      if (recommendation.profile !== profile) continue;
      add(recommendation);
      if (usedProfiles.has(profile)) break;
    }
  }

  for (const recommendation of recommendations) {
    if (!usedProfiles.has(recommendation.profile)) add(recommendation);
  }
  for (const recommendation of recommendations) add(recommendation);

  return selected.slice(0, limit).map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1,
  }));
}

export function buildDailyParlayApproaches(input: {
  recommendations: readonly DailyFinalRecommendation[];
  analysisTop: readonly ParlayAnalysisRecommendation[];
  rejected: readonly any[];
}) {
  return DAILY_PREFERRED_PARLAY_PROFILE_ORDER.map((profile) => {
    const selected = input.recommendations.find((recommendation) => recommendation.profile === profile);
    if (selected) {
      return {
        profile,
        status: 'selected',
        parlayId: selected.parlayId,
        rank: selected.rank,
        combinedOdds: round(selected.combinedOdds, 4),
        aggregateConfidence: round(selected.aggregateConfidence, 4),
        expectedEdge: round(selected.expectedEdge, 6),
        warnings: selected.riskFlags ?? [],
        reasons: selected.reasons ?? [],
      };
    }

    const candidate = input.analysisTop.find((recommendation) => recommendation.profile === profile);
    const rejected = input.rejected.find((item) => item?.profile === profile);
    return {
      profile,
      status: 'blocked',
      parlayId: candidate?.parlayId ?? rejected?.parlayId ?? null,
      combinedOdds: candidate && Number.isFinite(candidate.combinedOdds) ? round(candidate.combinedOdds, 4) : null,
      aggregateConfidence: candidate && Number.isFinite(candidate.aggregateConfidence) ? round(candidate.aggregateConfidence, 4) : null,
      expectedEdge: candidate && Number.isFinite(candidate.expectedEdge) ? round(candidate.expectedEdge, 6) : null,
      warnings: uniqueStrings([
        ...(candidate?.riskFlags ?? []),
      ]),
      reasons: uniqueStrings([
        ...dailyParlayApproachBlockReasons(candidate),
        ...((rejected?.reasons ?? []) as string[]),
        ...(!candidate && !rejected ? ['no same-day analyzed candidate for preferred profile'] : []),
      ]),
    };
  });
}

function dailyParlayApproachBlockReasons(recommendation: ParlayAnalysisRecommendation | undefined): string[] {
  if (!recommendation) return [];
  const reasons: string[] = [];
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') reasons.push(`validation status ${recommendation.validationStatus}`);
  if (!DAILY_FINAL_PARLAY_ALLOWED_PROFILES.includes(recommendation.profile as any)) reasons.push('profile not allowed for daily final parlays');
  if (DAILY_FINAL_PARLAY_BLOCKED_PROFILES.includes(recommendation.profile as any)) reasons.push('profile blocked for daily final parlays');
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) reasons.push('invalid combined odds');
  if (!Number.isFinite(recommendation.aggregateConfidence)) reasons.push('invalid aggregate confidence');
  if (!Number.isFinite(recommendation.expectedEdge) || recommendation.expectedEdge <= 0) reasons.push('non-positive expected edge');
  if ((recommendation.legs?.length ?? 0) < 2) reasons.push('leg count below daily minimum');
  if (recommendation.profile === 'parlay-refinado') {
    const riskFlags = new Set(recommendation.riskFlags ?? []);
    for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
      if (riskFlags.has(flag)) reasons.push(`blocked risk flag: ${flag}`);
    }
    if (recommendation.combinedOdds > 2.1) reasons.push('combined odds above parlay-refinado daily max');
    if (recommendation.aggregateConfidence < DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE) reasons.push('aggregate confidence below parlay-refinado daily floor');
    return reasons;
  }
  if (recommendation.profile === 'parlay-diamante') {
    if (recommendation.combinedOdds < 1.1 || recommendation.combinedOdds > 1.3) reasons.push('combined odds outside parlay-diamante daily window');
    if (recommendation.aggregateConfidence < DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE) reasons.push('aggregate confidence below parlay-diamante daily floor');
  } else {
    if ((recommendation.legs?.length ?? 0) > 3) reasons.push('leg count above conservative daily maximum');
    if (recommendation.combinedOdds > DAILY_PARLAY_CONSERVATIVE_MAX_ODDS) reasons.push('combined odds above conservative daily max');
    if (recommendation.aggregateConfidence < DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE) reasons.push('aggregate confidence below conservative daily floor');
  }
  const riskFlags = new Set(recommendation.riskFlags ?? []);
  for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
    if (riskFlags.has(flag)) reasons.push(`blocked risk flag: ${flag}`);
  }
  if (!reasons.length) reasons.push('not selected after diversity, council, or duplicate-signature gates');
  return reasons;
}

function isConservativeDailyParlayRecommendation(recommendation: ParlayAnalysisRecommendation): boolean {
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') return false;
  if (!DAILY_FINAL_PARLAY_ALLOWED_PROFILES.includes(recommendation.profile as any)) return false;
  if (DAILY_FINAL_PARLAY_BLOCKED_PROFILES.includes(recommendation.profile as any)) return false;
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) return false;
  if (!Number.isFinite(recommendation.aggregateConfidence)) return false;
  if (!Number.isFinite(recommendation.expectedEdge) || recommendation.expectedEdge <= 0) return false;
  if ((recommendation.legs?.length ?? 0) < 2) return false;
  if (recommendation.profile === 'parlay-all-in') {
    const riskFlags = new Set(recommendation.riskFlags ?? []);
    const blocked = ['stale-source', 'corners-unverified', 'negative-portfolio-edge', 'historically-weak-profile'];
    if (blocked.some((flag) => riskFlags.has(flag))) return false;
    return recommendation.aggregateConfidence >= 0.48;
  }
  if (recommendation.profile === 'parlay-refinado') {
    const riskFlags = new Set(recommendation.riskFlags ?? []);
    for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
      if (riskFlags.has(flag)) return false;
    }
    if (riskFlags.has('high-combined-odds') || recommendation.combinedOdds > 2.1) return false;
    return recommendation.aggregateConfidence >= DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE;
  }
  if ((recommendation.legs?.length ?? 0) > 3) return false;
  const riskFlags = new Set(recommendation.riskFlags ?? []);
  for (const flag of DAILY_FINAL_PARLAY_BLOCKED_RISK_FLAGS) {
    if (riskFlags.has(flag)) return false;
  }
  if (recommendation.profile === 'parlay-diamante') {
    return recommendation.combinedOdds >= 1.1
      && recommendation.combinedOdds <= 1.3
      && recommendation.aggregateConfidence >= DAILY_PARLAY_DIAMANTE_MIN_CONFIDENCE;
  }
  if (recommendation.combinedOdds > DAILY_PARLAY_CONSERVATIVE_MAX_ODDS || riskFlags.has('high-combined-odds')) return false;
  return recommendation.aggregateConfidence >= DAILY_PARLAY_CONSERVATIVE_MIN_CONFIDENCE;
}

export function selectDailyFallbackParlayRecommendations(
  recommendations: readonly ParlayAnalysisRecommendation[],
  limit: number,
): DailyFinalRecommendation[] {
  const selected: DailyFinalRecommendation[] = [];
  const usedIds = new Set<string>();
  const usedSignatures = new Set<string>();
  for (const recommendation of recommendations) {
    if (selected.length >= limit || usedIds.has(recommendation.parlayId)) continue;
    if (!isAnalyticalFallbackParlayRecommendation(recommendation)) continue;
    const signature = parlayLogicalSignature(recommendation);
    if (!signature || usedSignatures.has(signature)) continue;
    selected.push(markParlayAsAnalyticalFallback(recommendation, selected.length + 1));
    usedIds.add(recommendation.parlayId);
    usedSignatures.add(signature);
  }
  return selected;
}

function isAnalyticalFallbackParlayRecommendation(recommendation: ParlayAnalysisRecommendation): boolean {
  if (recommendation.validationStatus === 'lost' || recommendation.validationStatus === 'blocked') return false;
  if (!Number.isFinite(recommendation.combinedOdds) || recommendation.combinedOdds <= 1) return false;
  if (!Number.isFinite(recommendation.aggregateConfidence) || recommendation.aggregateConfidence <= 0) return false;
  if ((recommendation.legs?.length ?? 0) < 2) return false;
  return true;
}

function markParlayAsAnalyticalFallback(recommendation: ParlayAnalysisRecommendation, rank: number): DailyFinalRecommendation {
  return {
    ...recommendation,
    kind: 'parlay',
    rank,
    harnessStatus: 'review-required',
    selectionMode: 'analytical-fallback',
    fallbackReasons: ['strict daily parlay promotion gate selected 0 parlays'],
    riskFlags: uniqueStrings([
      ...(recommendation.riskFlags ?? []),
      'analytical-fallback',
      'review-required',
    ]),
    reasons: uniqueStrings([
      ...(recommendation.reasons ?? []),
      'analytical fallback: strict daily parlay promotion gate selected 0 parlays',
    ]),
  };
}

function parlayLogicalSignature(recommendation: Pick<ParlayAnalysisRecommendation, 'legs'>): string {
  return (recommendation.legs ?? [])
    .map((leg) => legSelectionKey(leg.fixtureId, leg.market, leg.selection, leg.line))
    .filter(Boolean)
    .sort()
    .join('|');
}

export function recommendationLegPredictionIds(recommendations: readonly Pick<DailyFinalRecommendation, 'legs'>[]): Set<string> {
  return new Set(recommendations.flatMap((recommendation) =>
    recommendation.legs
      .map((leg) => leg.predictionId)
      .filter((predictionId): predictionId is string => Boolean(predictionId)),
  ));
}

export function recommendationLegSelectionKeys(recommendations: readonly Pick<DailyFinalRecommendation, 'legs'>[]): Set<string> {
  return new Set(recommendations.flatMap((recommendation) =>
    recommendation.legs
      .map((leg) => legSelectionKey(leg.fixtureId, leg.market, leg.selection, leg.line))
      .filter((key): key is string => Boolean(key)),
  ));
}

export function recommendationLegFixtureIds(recommendations: readonly Pick<DailyFinalRecommendation, 'legs'>[]): Set<string> {
  return new Set(recommendations.flatMap((recommendation) =>
    recommendation.legs
      .map((leg) => typeof leg.fixtureId === 'string' ? leg.fixtureId : null)
      .filter((fixtureId): fixtureId is string => Boolean(fixtureId)),
  ));
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildFallbackParlayRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  resolveModel: DailyRecommendationModelResolver,
  limit: number,
): DailyFinalRecommendation[] {
  let remaining = selectFallbackParlayCandidatePool(collectFallbackPredictionCandidates(
    providerPipelineResults,
    providers,
    resolveModel,
  ));
  const recommendations: DailyFinalRecommendation[] = [];
  const usedSignatures = new Set<string>();

  while (recommendations.length < limit && remaining.length >= DAILY_FALLBACK_PARLAY_LEGS) {
    const legs: AtomicPredictionCandidate[] = [];
    const usedFixtureIds = new Set<string>();
    for (const candidate of remaining) {
      const fixtureId = candidate.prediction.fixtureId;
      if (usedFixtureIds.has(fixtureId)) continue;
      legs.push(candidate);
      usedFixtureIds.add(fixtureId);
      if (legs.length >= DAILY_FALLBACK_PARLAY_LEGS) break;
    }
    if (legs.length < DAILY_FALLBACK_PARLAY_LEGS) break;

    const signature = legs.map((candidate) => atomicPredictionKey(candidate.prediction)).sort().join('|');
    if (!usedSignatures.has(signature)) {
      recommendations.push(toFallbackParlayRecommendation(legs, recommendations.length + 1));
      usedSignatures.add(signature);
    }

    const selectedFixtureIds = new Set(legs.map((candidate) => candidate.prediction.fixtureId));
    const selectedPredictionIds = new Set(legs.map((candidate) => candidate.prediction.id));
    remaining = remaining.filter((candidate) =>
      !selectedFixtureIds.has(candidate.prediction.fixtureId)
      && !selectedPredictionIds.has(candidate.prediction.id)
    );
  }

  return recommendations;
}

export function buildFallbackAtomicPredictionRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  resolveModel: DailyRecommendationModelResolver,
  rankOffset: number,
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
  excludedFixtureIds: ReadonlySet<string> = new Set(),
): AtomicPredictionRecommendation[] {
  const groups = new Map<string, AtomicPredictionCandidate[]>();
  const candidates = collectFallbackPredictionCandidates(
    providerPipelineResults,
    providers,
    resolveModel,
    excludedPredictionIds,
    excludedSelectionKeys,
    excludedFixtureIds,
  );
  const nonBlocked = candidates.filter((candidate) => candidate.prediction.status !== 'blocked');
  const safetyBlocked = candidates.filter((candidate) =>
    candidate.prediction.status === 'blocked' && atomicSafetyOverride(candidate.prediction)
  );
  const candidatePool = nonBlocked.length
    ? uniqueCandidatesById([...nonBlocked, ...safetyBlocked])
    : candidates;
  for (const candidate of candidatePool) {
    const key = atomicPredictionKey(candidate.prediction);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const ordered = [...groups.values()]
    .map(toAtomicRecommendationDraft)
    .map(markAtomicAsAnalyticalFallback)
    .sort(compareAtomicRecommendationsForSelection);
  const selected = selectAtomicRecommendationsByFixture(ordered);
  return selected.map((recommendation, index) => ({ ...recommendation, rank: rankOffset + index + 1 }));
}

function collectFallbackPredictionCandidates(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  resolveModel: DailyRecommendationModelResolver,
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
  excludedFixtureIds: ReadonlySet<string> = new Set(),
): AtomicPredictionCandidate[] {
  const bestByKey = new Map<string, AtomicPredictionCandidate>();
  for (const provider of providers) {
    const result = providerPipelineResults[provider];
    if (!result?.runId) continue;
    const fixtureDisplays = fixtureDisplayMap(displayFixturesFromPipelineResult(result));
    const providerModel = resolveModel(provider);
    for (const scoring of result.scoring) {
      for (const prediction of scoring.predictions) {
        const edge = atomicPredictionEdge(prediction);
        const model = prediction.model ?? providerModel;
        const key = atomicPredictionKey(prediction);
        if (!isFallbackPredictionCandidate(prediction)) continue;
        if (DAILY_FINAL_DEMOTED_MODELS.includes(model as any)) continue;
        if (excludedPredictionIds.has(prediction.id) || excludedSelectionKeys.has(key)) continue;
        if (excludedFixtureIds.has(prediction.fixtureId)) continue;
        const display = fixtureDisplays.get(prediction.fixtureId);
        const candidate: AtomicPredictionCandidate = {
          provider,
          model,
          runId: result.runId,
          prediction,
          fixture: display?.fixtureLabel ?? scoring.fixtureId ?? prediction.fixtureId,
          display,
          edge,
        };
        const current = bestByKey.get(key);
        if (!current || fallbackCandidateScore(candidate) > fallbackCandidateScore(current)) {
          bestByKey.set(key, candidate);
        }
      }
    }
  }
  return [...bestByKey.values()].sort((a, b) =>
    fallbackCandidateScore(b) - fallbackCandidateScore(a)
    || b.prediction.confidence - a.prediction.confidence
    || a.prediction.odds - b.prediction.odds
  );
}

function selectFallbackParlayCandidatePool(candidates: AtomicPredictionCandidate[]): AtomicPredictionCandidate[] {
  const pools = [
    candidates.filter((candidate) => candidate.prediction.parlayEligible !== false && candidate.prediction.status === 'promotable'),
    candidates.filter((candidate) => candidate.prediction.parlayEligible !== false && candidate.prediction.status !== 'blocked'),
    candidates.filter((candidate) => candidate.prediction.status !== 'blocked'),
    candidates,
  ];
  return pools.find((pool) => uniqueFixtureCount(pool) >= DAILY_FALLBACK_PARLAY_LEGS) ?? [];
}

function uniqueFixtureCount(candidates: readonly AtomicPredictionCandidate[]): number {
  return new Set(candidates.map((candidate) => candidate.prediction.fixtureId)).size;
}

export function isFallbackPredictionCandidate(prediction: PredictionRecordView): boolean {
  return Number.isFinite(prediction.odds)
    && prediction.odds > 1
    && Number.isFinite(prediction.confidence)
    && prediction.confidence > 0
    && Boolean(prediction.id)
    && Boolean(prediction.fixtureId);
}

function fallbackCandidateScore(candidate: AtomicPredictionCandidate): number {
  const prediction = candidate.prediction;
  const statusBonus = prediction.status === 'promotable'
    ? 0.5
    : prediction.status === 'candidate'
      ? 0.35
      : prediction.status === 'review-required'
        ? 0.2
        : prediction.status === 'draft'
          ? 0.1
          : -0.3;
  const parlayEligibleBonus = prediction.parlayEligible === false ? -0.25 : 0.08;
  const riskPenalty = fallbackRiskFlags(prediction).length * 0.025;
  const oddsPenalty = Math.log2(Math.max(1.01, prediction.odds)) * 0.04;
  const focusBonus = fixtureFocusScore(candidate);
  return round(statusBonus + parlayEligibleBonus + (prediction.confidence * 0.7) + (Math.max(0, candidate.edge) * 0.35) + focusBonus - riskPenalty - oddsPenalty, 6);
}

function fixtureFocusScore(candidate: Pick<AtomicPredictionCandidate, 'fixture' | 'display' | 'prediction'>): number {
  const signals = fixtureFocusSignals(candidate);
  return (signals.includes('low-odds') ? 0.035 : 0)
    + (signals.includes('women-youth-development') ? 0.03 : 0);
}

function fixtureFocusSignals(candidate: Pick<AtomicPredictionCandidate, 'fixture' | 'display' | 'prediction'>): string[] {
  const signals: string[] = [];
  if (candidate.prediction.odds <= 1.3) signals.push('low-odds');
  const text = [
    candidate.fixture,
    candidate.display?.fixtureLabel,
    candidate.display?.homeTeamName,
    candidate.display?.awayTeamName,
    candidate.display?.leagueName,
    ...(candidate.prediction.warnings ?? []),
    candidate.prediction.rationale ?? '',
  ].filter(Boolean).join(' ');
  if (/\b(w|women|femenil|femenino|femenina|u-?1[7-9]|u-?2[0-3]|sub[- ]?1[7-9]|sub[- ]?2[0-3]|reserves?|ii|b)\b/i.test(text)) {
    signals.push('women-youth-development');
  }
  return uniqueStrings(signals);
}

function toFallbackParlayRecommendation(candidates: AtomicPredictionCandidate[], rank: number): DailyFinalRecommendation {
  const combinedOdds = round(candidates.reduce((product, candidate) => product * candidate.prediction.odds, 1), 6);
  const aggregateConfidence = round(candidates.reduce((product, candidate) => product * clamp(atomicCandidateEffectiveConfidence(candidate), 0.01, 0.99), 1), 6);
  const providerCount = new Set(candidates.map((candidate) => candidate.provider)).size;
  const adjustedProbability = round(clamp(aggregateConfidence * (providerCount > 1 ? 1.02 : 1), 0.01, 0.99), 6);
  const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
  const riskFlags = uniqueStrings([
    'analytical-fallback',
    'review-required',
    ...candidates.flatMap((candidate) => fallbackRiskFlags(candidate.prediction)),
  ]);
  const legs = candidates.map(parlayLegFromFallbackCandidate);
  const sourceRunIds = uniqueStrings(candidates.map((candidate) => candidate.runId));

  return {
    kind: 'parlay',
    rank,
    parlayId: `analytical-fallback-${candidates.map((candidate) => candidate.prediction.id).join('-').slice(0, 48)}`,
    sourceRunId: sourceRunIds[0] ?? null,
    sourceRunIds,
    profile: 'analytical-fallback',
    validationStatus: 'unvalidated',
    harnessStatus: 'review-required',
    selectionMode: 'analytical-fallback',
    fallbackReasons: ['strict daily parlay promotion gate selected 0 parlays'],
    combinedOdds,
    aggregateConfidence,
    adjustedProbability,
    expectedEdge,
    score: round((adjustedProbability * 0.65) + (Math.max(0, expectedEdge) * 0.2) - (riskFlags.length * 0.01), 6),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'analytical-fallback-review-only-exposure',
    },
    stake: {
      units: 0,
      percentOfBankroll: 0,
      policy: 'analytical-fallback-review-only-stake',
    },
    bankerLegs: legs
      .filter((leg) => leg.banker)
      .map((leg) => ({
        predictionId: leg.predictionId,
        fixtureId: leg.fixtureId,
        fixture: leg.fixture,
        ...(leg.display ? { display: leg.display } : {}),
        market: leg.market,
        selection: leg.selection,
        line: leg.line,
        odds: leg.odds,
        confidence: leg.confidence,
        reason: leg.bankerReason ?? 'analytical fallback banker leg',
      })),
    reasons: [
      'analytical fallback: strict daily parlay promotion gate selected 0 parlays',
      `selected ${legs.length} review-required leg(s) from available predictions`,
      `source runs: ${sourceRunIds.join(', ') || 'unknown'}`,
      `aggregate confidence ${round(aggregateConfidence, 3)}`,
      `adjusted edge ${round(expectedEdge, 3)}`,
    ],
    riskFlags,
    legs,
  };
}

function parlayLegFromFallbackCandidate(candidate: AtomicPredictionCandidate): ParlayAnalysisRecommendation['legs'][number] {
  const prediction = candidate.prediction;
  const warnings = uniqueStrings([
    ...(prediction.warnings ?? []),
    ...(prediction.blockers ?? []),
  ]);
  const banker = prediction.confidence >= 0.65
    && prediction.odds <= 1.5
    && prediction.market !== 'corners_over_under'
    && prediction.status !== 'blocked';
  return {
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    fixture: candidate.fixture,
    ...(candidate.display ? { display: candidate.display } : {}),
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: round(prediction.odds, 6),
    confidence: round(atomicCandidateEffectiveConfidence(candidate), 6),
    validationStatus: 'unvalidated',
    warnings,
    banker,
    ...(banker ? { bankerReason: `analytical fallback banker: confidence ${round(prediction.confidence, 3)} with odds ${round(prediction.odds, 3)}` } : {}),
  };
}

function markAtomicAsAnalyticalFallback(recommendation: AtomicPredictionRecommendation): AtomicPredictionRecommendation {
  return {
    ...recommendation,
    harnessStatus: recommendation.harnessStatus === 'blocked' ? 'review-required' : recommendation.harnessStatus,
    selectionMode: 'analytical-fallback',
    fallbackReasons: ['strict daily atomic promotion gate selected 0 simples'],
    riskFlags: uniqueStrings([
      ...(recommendation.riskFlags ?? []),
      'analytical-fallback',
      'review-required',
    ]),
    reasons: uniqueStrings([
      ...(recommendation.reasons ?? []),
      'analytical fallback: strict daily atomic promotion gate selected 0 simples',
    ]),
  };
}

function fallbackRiskFlags(prediction: PredictionRecordView): string[] {
  const flags = atomicRiskFlags(prediction, 1).filter((flag) => flag !== 'single-selection');
  if (prediction.status !== 'promotable') flags.push(`source-${prediction.status}`);
  if (prediction.status === 'blocked') flags.push('blocked-source-prediction');
  if (prediction.parlayEligible === false) flags.push('parlay-ineligible-source');
  return uniqueStrings(flags);
}

export function buildAtomicPredictionRecommendations(
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
  providers: DailyE2EProvider[],
  resolveModel: DailyRecommendationModelResolver,
  rankOffset: number,
  excludedPredictionIds: ReadonlySet<string> = new Set(),
  excludedSelectionKeys: ReadonlySet<string> = new Set(),
  excludedFixtureIds: ReadonlySet<string> = new Set(),
): AtomicPredictionRecommendation[] {
  const groups = new Map<string, AtomicPredictionCandidate[]>();
  for (const provider of providers) {
    const result = providerPipelineResults[provider];
    if (!result?.ok) continue;
    const fixtureDisplays = fixtureDisplayMap(displayFixturesFromPipelineResult(result));
    const providerModel = resolveModel(provider);
    for (const scoring of result.scoring) {
      for (const prediction of scoring.predictions) {
        const edge = atomicPredictionEdge(prediction);
        const model = prediction.model ?? providerModel;
        if (DAILY_FINAL_DEMOTED_MODELS.includes(model as any)) continue;
        if (!isAtomicRecommendationEligible(prediction, edge)) continue;
        const key = atomicPredictionKey(prediction);
        if (excludedPredictionIds.has(prediction.id) || excludedSelectionKeys.has(key)) continue;
        if (excludedFixtureIds.has(prediction.fixtureId)) continue;
        const display = fixtureDisplays.get(prediction.fixtureId);
        groups.set(key, [...(groups.get(key) ?? []), {
          provider,
          model,
          runId: result.runId,
          prediction,
          fixture: display?.fixtureLabel ?? scoring.fixtureId ?? prediction.fixtureId,
          display,
          edge,
        }]);
      }
    }
  }

  const ordered = [...groups.values()]
    .map(toAtomicRecommendationDraft)
    .sort(compareAtomicRecommendationsForSelection);
  const selected = selectAtomicRecommendationsByFixture(ordered);
  return selected.map((recommendation, index) => ({ ...recommendation, rank: rankOffset + index + 1 }));
}

function uniqueCandidatesById(candidates: readonly AtomicPredictionCandidate[]): AtomicPredictionCandidate[] {
  const seen = new Set<string>();
  const unique: AtomicPredictionCandidate[] = [];
  for (const candidate of candidates) {
    const id = candidate.prediction.id;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(candidate);
  }
  return unique;
}

function compareAtomicRecommendationsForSelection(a: AtomicPredictionRecommendation, b: AtomicPredictionRecommendation): number {
  return atomicRecommendationSelectionScore(b) - atomicRecommendationSelectionScore(a)
    || b.score - a.score
    || b.aggregateConfidence - a.aggregateConfidence
    || a.combinedOdds - b.combinedOdds;
}

function selectAtomicRecommendationsByFixture(
  ordered: readonly AtomicPredictionRecommendation[],
): AtomicPredictionRecommendation[] {
  const byFixture = atomicRecommendationsByFixture(ordered);
  const selected: AtomicPredictionRecommendation[] = [];
  const usedFixtureIds = new Set<string>();
  for (const recommendation of ordered) {
    const fixtureId = recommendation.legs[0]?.fixtureId;
    if (fixtureId && usedFixtureIds.has(fixtureId)) continue;
    const replacement = fixtureId
      ? saferAtomicReplacement(recommendation, byFixture.get(fixtureId) ?? [recommendation])
      : recommendation;
    const replacementFixtureId = replacement.legs[0]?.fixtureId;
    if (replacementFixtureId && usedFixtureIds.has(replacementFixtureId)) continue;
    if (replacementFixtureId) usedFixtureIds.add(replacementFixtureId);
    selected.push(replacement);
  }
  return selected;
}

function atomicRecommendationsByFixture(
  recommendations: readonly AtomicPredictionRecommendation[],
): Map<string, AtomicPredictionRecommendation[]> {
  const byFixture = new Map<string, AtomicPredictionRecommendation[]>();
  for (const recommendation of recommendations) {
    const fixtureId = recommendation.legs[0]?.fixtureId;
    if (!fixtureId) continue;
    byFixture.set(fixtureId, [...(byFixture.get(fixtureId) ?? []), recommendation]);
  }
  return byFixture;
}

function saferAtomicReplacement(
  recommendation: AtomicPredictionRecommendation,
  fixtureRecommendations: readonly AtomicPredictionRecommendation[],
): AtomicPredictionRecommendation {
  const leg = recommendation.legs[0];
  if (!leg) return recommendation;
  const candidates = fixtureRecommendations
    .filter((candidate) => candidate.predictionId !== recommendation.predictionId)
    .filter((candidate) => isSaferAtomicReplacement(recommendation, candidate))
    .sort((a, b) =>
      b.aggregateConfidence - a.aggregateConfidence
      || atomicRecommendationSafetyScore(b) - atomicRecommendationSafetyScore(a)
      || b.expectedEdge - a.expectedEdge
      || a.combinedOdds - b.combinedOdds
    );
  return candidates[0] ?? recommendation;
}

function isSaferAtomicReplacement(
  current: AtomicPredictionRecommendation,
  candidate: AtomicPredictionRecommendation,
): boolean {
  const currentLeg = current.legs[0];
  const candidateLeg = candidate.legs[0];
  if (!currentLeg || !candidateLeg) return false;
  if (!atomicRecommendationSafetyOverride(candidate)) return false;
  if (candidate.aggregateConfidence + 0.000001 < current.aggregateConfidence) return false;

  if (currentLeg.market === 'h2h' && candidateLeg.market === 'double_chance') {
    if (currentLeg.selection === 'home') return candidateLeg.selection === 'home_or_draw';
    if (currentLeg.selection === 'away') return candidateLeg.selection === 'draw_or_away';
    return false;
  }

  if (
    currentLeg.market === 'goals_over_under'
    && candidateLeg.market === 'goals_over_under'
    && currentLeg.selection === candidateLeg.selection
    && Number.isFinite(currentLeg.line)
    && Number.isFinite(candidateLeg.line)
  ) {
    if (currentLeg.selection === 'over') return Number(candidateLeg.line) < Number(currentLeg.line);
    if (currentLeg.selection === 'under') return Number(candidateLeg.line) > Number(currentLeg.line);
  }

  return false;
}

function atomicRecommendationSelectionScore(recommendation: AtomicPredictionRecommendation): number {
  const safetyOverride = atomicRecommendationSafetyOverride(recommendation);
  const doubleChancePenalty = safetyOverride === 'model-probability-double-chance' ? 0.25 : 0;
  const h2hFavoritePenalty = recommendation.riskFlags.includes('low-liquidity-h2h-favorite') ? 0.1 : 0;
  return recommendation.score - doubleChancePenalty - h2hFavoritePenalty;
}

function atomicRecommendationSafetyScore(recommendation: AtomicPredictionRecommendation): number {
  return recommendation.aggregateConfidence
    + (Math.max(0, recommendation.expectedEdge) * 0.2)
    - (Math.log2(Math.max(1.01, recommendation.combinedOdds)) * 0.02);
}

function atomicRecommendationSafetyOverride(recommendation: AtomicPredictionRecommendation): string | undefined {
  if (recommendation.riskFlags.includes('model-probability-double-chance')) return 'model-probability-double-chance';
  if (recommendation.riskFlags.includes('model-probability-conservative-total')) return 'model-probability-conservative-total';
  return undefined;
}

export function applyDailyStakeRecommendations<T extends DailyFinalRecommendation>(
  recommendations: readonly T[],
): T[] {
  if (!recommendations.length) return [];
  return recommendations.map((recommendation) => {
    const stake = dailyStakeBucket(recommendation);
    return {
      ...recommendation,
      stakeRecommendation: {
        stake,
        percentOfBankroll: round(stake / 100, 6),
        unitLabel: 'percent-of-bankroll',
        allowedStakes: DAILY_STAKE_BUCKETS,
        policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
      },
    };
  });
}

function dailyStakeBucket(recommendation: DailyFinalRecommendation): number {
  const confidence = clamp(Number(recommendation.aggregateConfidence), 0.01, 0.99);
  const edge = Math.max(0, Number.isFinite(recommendation.expectedEdge) ? recommendation.expectedEdge : 0);
  const odds = Math.max(1.01, Number(recommendation.combinedOdds) || 1.01);
  const profileBonus = recommendation.profile === 'parlay-diamante'
    ? 2
    : recommendation.profile === 'parlay-all-in'
      ? -0.5
    : recommendation.profile === 'low-variance'
      ? 1.5
      : recommendation.kind === 'atomic-prediction'
        ? -1.5
        : 0;
  const riskPenalty = (recommendation.riskFlags?.length ?? 0) * 0.75;
  const oddsPenalty = Math.log2(odds) * 1.5;
  const rawStake = (confidence * 10)
    + (Math.min(edge, 0.35) * 20)
    + profileBonus
    - riskPenalty
    - oddsPenalty;
  return nearestStakeBucket(rawStake);
}

function nearestStakeBucket(value: number): number {
  return DAILY_STAKE_BUCKETS.reduce((best, bucket) =>
    Math.abs(bucket - value) < Math.abs(best - value) ? bucket : best,
  DAILY_STAKE_BUCKETS[0]);
}

export function buildMissingDailyFocusParlayRecommendations(input: {
  recommendations: readonly DailyFinalRecommendation[];
  candidateRecommendations?: readonly DailyFinalRecommendation[];
}): DailyFinalRecommendation[] {
  const existingProfiles = new Set(input.recommendations
    .filter((recommendation) => recommendation.kind === 'parlay' && isUsableDailyFocusParlay(recommendation))
    .map((recommendation) => recommendation.profile));
  const missingProfiles = DAILY_PREFERRED_PARLAY_PROFILE_ORDER.filter((profile) => !existingProfiles.has(profile));
  if (!missingProfiles.length) return [];

  const candidateLegs = collectDailyFocusLegCandidates([
    ...(input.candidateRecommendations ?? []),
    ...input.recommendations,
  ]);
  if (candidateLegs.length < DAILY_FOCUS_FALLBACK_MIN_LEGS) return [];

  const usedSelectionKeys = new Set<string>();
  const composed: DailyFinalRecommendation[] = [];
  for (const profile of missingProfiles) {
    const selected = selectDailyFocusLegs(profile, candidateLegs, usedSelectionKeys);
    if (selected.length < DAILY_FOCUS_FALLBACK_MIN_LEGS) continue;
    const recommendation = toDailyFocusParlayRecommendation(profile, selected, composed.length + 1);
    composed.push(recommendation);
    for (const candidate of selected) {
      const key = legSelectionKey(candidate.leg.fixtureId, candidate.leg.market, candidate.leg.selection, candidate.leg.line);
      if (key) usedSelectionKeys.add(key);
    }
  }
  return composed;
}

function isUsableDailyFocusParlay(recommendation: DailyFinalRecommendation): boolean {
  return recommendation.kind === 'parlay'
    && Number.isFinite(recommendation.combinedOdds)
    && recommendation.combinedOdds > 1
    && Number.isFinite(recommendation.aggregateConfidence)
    && recommendation.aggregateConfidence >= 0.48
    && Number.isFinite(recommendation.expectedEdge)
    && recommendation.expectedEdge > 0;
}

type DailyFocusProfile = typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number];

interface DailyFocusLegCandidate {
  leg: ParlayAnalysisRecommendation['legs'][number];
  sourceRunIds: string[];
  providers: string[];
  sourceProfiles: string[];
  sourceRiskFlags: string[];
  sourceReasons: string[];
  sourceSelectionModes: string[];
  sourceEdge: number;
  sourceScore: number;
}

function collectDailyFocusLegCandidates(
  recommendations: readonly DailyFinalRecommendation[],
): DailyFocusLegCandidate[] {
  const bestByKey = new Map<string, DailyFocusLegCandidate>();
  for (const recommendation of recommendations) {
    for (const leg of recommendation.legs ?? []) {
      if (!isDailyFocusLegEligible(leg, recommendation)) continue;
      const key = leg.predictionId || legSelectionKey(leg.fixtureId, leg.market, leg.selection, leg.line);
      if (!key) continue;
      const candidate: DailyFocusLegCandidate = {
        leg: {
          ...leg,
          confidence: round(focusLegConfidence(leg, recommendation), 6),
          odds: round(Number(leg.odds), 6),
          banker: true,
          bankerReason: `daily focus fallback leg from ${recommendation.profile}`,
        },
        sourceRunIds: uniqueStrings([
          ...('sourceRunIds' in recommendation ? recommendation.sourceRunIds ?? [] : []),
          ...('sourceRunId' in recommendation && recommendation.sourceRunId ? [recommendation.sourceRunId] : []),
        ]),
        providers: uniqueStrings('providers' in recommendation ? recommendation.providers ?? [] : []),
        sourceProfiles: [recommendation.profile],
        sourceRiskFlags: recommendation.riskFlags ?? [],
        sourceReasons: recommendation.reasons ?? [],
        sourceSelectionModes: recommendation.selectionMode ? [recommendation.selectionMode] : [],
        sourceEdge: Number.isFinite(recommendation.expectedEdge) ? recommendation.expectedEdge : 0,
        sourceScore: Number.isFinite(recommendation.score) ? recommendation.score : 0,
      };
      const current = bestByKey.get(key);
      if (!current || dailyFocusLegScore('parlay-refinado', candidate) > dailyFocusLegScore('parlay-refinado', current)) {
        bestByKey.set(key, candidate);
      }
    }
  }
  return [...bestByKey.values()].sort((a, b) =>
    dailyFocusLegScore('parlay-refinado', b) - dailyFocusLegScore('parlay-refinado', a)
    || focusLegConfidence(b.leg) - focusLegConfidence(a.leg)
    || Number(a.leg.odds) - Number(b.leg.odds)
  );
}

function isDailyFocusLegEligible(
  leg: ParlayAnalysisRecommendation['legs'][number],
  recommendation: DailyFinalRecommendation,
): boolean {
  if (!leg.predictionId || !leg.fixtureId) return false;
  if (!Number.isFinite(leg.odds) || Number(leg.odds) <= 1) return false;
  if (!Number.isFinite(focusLegConfidence(leg, recommendation)) || focusLegConfidence(leg, recommendation) < 0.6) return false;
  if (leg.market === 'corners_over_under') return false;
  const riskFlags = new Set(recommendation.riskFlags ?? []);
  if (riskFlags.has('blocked-source-prediction')) return false;
  if (riskFlags.has('stale-source')) return false;
  if (riskFlags.has('corners-unverified')) return false;
  if (riskFlags.has('lineup-pending')) return false;
  if (riskFlags.has('selection-evidence-missing')) return false;
  if (riskFlags.has('inflated-double-chance-edge')) return false;
  if (riskFlags.has('overinflated-edge')) return false;
  return true;
}

function selectDailyFocusLegs(
  profile: DailyFocusProfile,
  candidates: readonly DailyFocusLegCandidate[],
  usedSelectionKeys: ReadonlySet<string>,
): DailyFocusLegCandidate[] {
  const preferred = candidates
    .filter((candidate) => dailyFocusLegProfileEligible(profile, candidate))
    .sort((a, b) => dailyFocusLegScore(profile, b) - dailyFocusLegScore(profile, a));
  const freshPreferred = preferred.filter((candidate) => {
    const key = legSelectionKey(candidate.leg.fixtureId, candidate.leg.market, candidate.leg.selection, candidate.leg.line);
    return key ? !usedSelectionKeys.has(key) : true;
  });
  const freshKeys = new Set(freshPreferred.map((candidate) =>
    legSelectionKey(candidate.leg.fixtureId, candidate.leg.market, candidate.leg.selection, candidate.leg.line)
  ));
  const freshSupplemented = freshPreferred.length > 0 && freshPreferred.length < DAILY_FOCUS_FALLBACK_MIN_LEGS
    ? [
      ...freshPreferred,
      ...preferred
        .filter((candidate) => {
          const key = legSelectionKey(candidate.leg.fixtureId, candidate.leg.market, candidate.leg.selection, candidate.leg.line);
          return key ? !freshKeys.has(key) : true;
        })
        .slice(0, DAILY_FOCUS_FALLBACK_MIN_LEGS - freshPreferred.length),
    ]
    : freshPreferred;
  const pools = [
    freshPreferred,
    freshSupplemented,
    preferred,
    candidates.filter((candidate) => {
      const key = legSelectionKey(candidate.leg.fixtureId, candidate.leg.market, candidate.leg.selection, candidate.leg.line);
      return key ? !usedSelectionKeys.has(key) : true;
    }).sort((a, b) => dailyFocusLegScore(profile, b) - dailyFocusLegScore(profile, a)),
    [...candidates].sort((a, b) => dailyFocusLegScore(profile, b) - dailyFocusLegScore(profile, a)),
  ];
  for (const pool of pools) {
    const selected = bestDailyFocusCombination(profile, pool.slice(0, DAILY_FOCUS_FALLBACK_MAX_SOURCE_LEGS));
    if (selected.length >= DAILY_FOCUS_FALLBACK_MIN_LEGS) return selected;
  }
  return [];
}

function dailyFocusLegProfileEligible(profile: DailyFocusProfile, candidate: DailyFocusLegCandidate): boolean {
  const leg = candidate.leg;
  if (profile === 'parlay-diamante') {
    return ['h2h', 'double_chance', 'goals_over_under'].includes(leg.market)
      && Number(leg.odds) <= 1.5;
  }
  if (profile === 'low-variance') {
    return ['h2h', 'double_chance', 'goals_over_under'].includes(leg.market)
      && Number(leg.odds) <= 1.6;
  }
  return ['h2h', 'double_chance', 'goals_over_under', 'btts'].includes(leg.market)
    && Number(leg.odds) <= 1.8;
}

function bestDailyFocusCombination(
  profile: DailyFocusProfile,
  candidates: readonly DailyFocusLegCandidate[],
): DailyFocusLegCandidate[] {
  let best: { legs: DailyFocusLegCandidate[]; score: number } | undefined;
  const maxLegs = profile === 'low-variance' ? 2 : 3;
  for (let size = DAILY_FOCUS_FALLBACK_MIN_LEGS; size <= Math.min(maxLegs, candidates.length); size += 1) {
    collectDailyFocusCombinations(profile, candidates, size, 0, [], (legs, score) => {
      if (!best || score > best.score) best = { legs, score };
    });
  }
  return best?.legs ?? [];
}

function collectDailyFocusCombinations(
  profile: DailyFocusProfile,
  candidates: readonly DailyFocusLegCandidate[],
  size: number,
  start: number,
  current: DailyFocusLegCandidate[],
  visit: (legs: DailyFocusLegCandidate[], score: number) => void,
): void {
  if (current.length === size) {
    const fixtureIds = current.map((candidate) => candidate.leg.fixtureId);
    if (new Set(fixtureIds).size !== fixtureIds.length) return;
    visit([...current], dailyFocusCombinationScore(profile, current));
    return;
  }
  for (let index = start; index < candidates.length; index += 1) {
    current.push(candidates[index] as DailyFocusLegCandidate);
    collectDailyFocusCombinations(profile, candidates, size, index + 1, current, visit);
    current.pop();
  }
}

function dailyFocusCombinationScore(profile: DailyFocusProfile, candidates: readonly DailyFocusLegCandidate[]): number {
  const combinedOdds = candidates.reduce((product, candidate) => product * Number(candidate.leg.odds), 1);
  const aggregateConfidence = average(candidates.map((candidate) => focusLegConfidence(candidate.leg)));
  const marketDiversity = new Set(candidates.map((candidate) => candidate.leg.market)).size / Math.max(1, candidates.length);
  const profileScore = candidates.reduce((sum, candidate) => sum + dailyFocusLegScore(profile, candidate), 0) / Math.max(1, candidates.length);
  return profileScore
    + (aggregateConfidence * 0.35)
    + (dailyFocusOddsFit(profile, combinedOdds) * 0.15)
    + (marketDiversity * 0.04)
    + (Math.max(0, combinedOdds * aggregateConfidence - 1) * 0.08)
    - ((candidates.length - DAILY_FOCUS_FALLBACK_MIN_LEGS) * 0.015);
}

function dailyFocusLegScore(profile: DailyFocusProfile, candidate: DailyFocusLegCandidate): number {
  const leg = candidate.leg;
  const confidence = focusLegConfidence(leg);
  const odds = Number(leg.odds);
  const edge = Math.max(0, candidate.sourceEdge);
  const marketBoost = dailyFocusMarketBoost(profile, leg);
  const lowOddsBoost = odds <= 1.25 ? 0.06 : odds <= 1.5 ? 0.025 : 0;
  const reviewPenalty = candidate.sourceSelectionModes.includes('analytical-fallback') ? 0.015 : 0;
  const riskPenalty = candidate.sourceRiskFlags.filter((flag) => !['single-selection', 'analytical-fallback', 'review-required'].includes(flag)).length * 0.02;
  return confidence + (edge * 0.2) + marketBoost + lowOddsBoost + (candidate.sourceScore * 0.04) - reviewPenalty - riskPenalty;
}

function dailyFocusMarketBoost(profile: DailyFocusProfile, leg: ParlayAnalysisRecommendation['legs'][number]): number {
  if (profile === 'low-variance') {
    if (leg.market === 'double_chance') return 0.09;
    if (leg.market === 'h2h' && Number(leg.odds) <= 1.35) return 0.055;
    if (leg.market === 'goals_over_under') return conservativeTotalsBoost(leg);
    return 0;
  }
  if (profile === 'parlay-diamante') {
    if ((leg.market === 'h2h' || leg.market === 'double_chance') && Number(leg.odds) <= 1.25) return 0.085;
    if (leg.market === 'goals_over_under') return conservativeTotalsBoost(leg) * 0.75;
    return 0.02;
  }
  if (leg.market === 'double_chance') return 0.06;
  if (leg.market === 'h2h') return 0.045;
  if (leg.market === 'goals_over_under') return conservativeTotalsBoost(leg);
  if (leg.market === 'btts' && leg.selection === 'no') return 0.02;
  return 0;
}

function conservativeTotalsBoost(leg: ParlayAnalysisRecommendation['legs'][number]): number {
  const line = Number(leg.line ?? NaN);
  if (!Number.isFinite(line)) return 0.01;
  if (leg.selection === 'over') return line <= 1.5 ? 0.06 : line <= 2.5 ? 0.035 : 0.005;
  if (leg.selection === 'under') return line >= 3.5 ? 0.06 : line >= 2.5 ? 0.03 : 0.005;
  return 0;
}

function dailyFocusOddsFit(profile: DailyFocusProfile, combinedOdds: number): number {
  const [min, max] = profile === 'parlay-diamante'
    ? [1.1, 1.3]
    : profile === 'parlay-refinado'
      ? [1.3, 2.1]
      : [1.25, 2.2];
  if (combinedOdds >= min && combinedOdds <= max) return 1;
  const distance = combinedOdds < min ? min - combinedOdds : combinedOdds - max;
  return Math.max(0, 1 - distance);
}

function toDailyFocusParlayRecommendation(
  profile: DailyFocusProfile,
  candidates: readonly DailyFocusLegCandidate[],
  rank: number,
): DailyFinalRecommendation {
  const legs = candidates.map((candidate) => ({
    ...candidate.leg,
    banker: true,
    bankerReason: `daily ${profile} fallback leg: confidence ${round(focusLegConfidence(candidate.leg), 3)}`,
  }));
  const combinedOdds = round(legs.reduce((product, leg) => product * Number(leg.odds), 1), 6);
  const aggregateConfidence = round(average(legs.map((leg) => focusLegConfidence(leg))), 6);
  const adjustedProbability = round(clamp(aggregateConfidence, 0.01, 0.99), 6);
  const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
  const sourceRunIds = uniqueStrings(candidates.flatMap((candidate) => candidate.sourceRunIds));
  const providers = uniqueStrings(candidates.flatMap((candidate) => candidate.providers));
  const sourceProfiles = uniqueStrings(candidates.flatMap((candidate) => candidate.sourceProfiles));
  const riskFlags = uniqueStrings([
    DAILY_FOCUS_FALLBACK_RISK_FLAG,
    'analytical-fallback',
    'review-required',
    ...dailyFocusProfileWindowMiss(profile, combinedOdds),
    ...candidates.flatMap((candidate) => candidate.sourceRiskFlags),
  ].filter((flag) => flag !== 'single-selection'));
  const reasons = uniqueStrings([
    `daily focus fallback: strict ${profile} build unavailable`,
    'built from reviewed simple recommendations or candidate parlay legs',
    'uses average leg confidence for review-only daily focus coverage',
    `source profiles: ${sourceProfiles.join(', ') || 'unknown'}`,
    `providers: ${providers.join(', ') || 'unknown'}`,
    `aggregate confidence ${round(aggregateConfidence, 3)}`,
    `adjusted edge ${round(expectedEdge, 3)}`,
    ...dailyFocusProfileWindowReasons(profile, combinedOdds),
  ]);
  const parlayId = `daily-focus-${profile}-${createHash('sha256')
    .update(legs.map((leg) => legSelectionKey(leg.fixtureId, leg.market, leg.selection, leg.line) || leg.predictionId).join('|'))
    .digest('hex')
    .slice(0, 16)}`;

  return {
    kind: 'parlay',
    rank,
    parlayId,
    sourceRunId: sourceRunIds[0] ?? null,
    sourceRunIds,
    profile,
    validationStatus: 'unvalidated',
    harnessStatus: 'review-required',
    selectionMode: 'analytical-fallback',
    fallbackReasons: [`strict ${profile} builder had no selected same-day candidate`],
    combinedOdds,
    aggregateConfidence,
    adjustedProbability,
    expectedEdge,
    score: round((aggregateConfidence * 0.64) + (Math.max(0, expectedEdge) * 0.24) + dailyFocusProfileScoreBonus(profile) - (riskFlags.length * 0.006), 6),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'daily-focus-fallback-review-only-exposure',
    },
    stake: {
      units: 0,
      percentOfBankroll: 0,
      policy: 'daily-focus-fallback-review-only-stake',
    },
    bankerLegs: legs.map((leg) => ({
      predictionId: leg.predictionId,
      fixtureId: leg.fixtureId,
      fixture: leg.fixture,
      ...(leg.display ? { display: leg.display } : {}),
      market: leg.market,
      selection: leg.selection,
      line: leg.line,
      odds: leg.odds,
      confidence: leg.confidence,
      reason: leg.bankerReason ?? `daily ${profile} fallback leg`,
    })),
    reasons,
    riskFlags,
    legs,
  };
}

function dailyFocusProfileScoreBonus(profile: DailyFocusProfile): number {
  return profile === 'parlay-diamante' ? 0.06 : profile === 'low-variance' ? 0.04 : 0.035;
}

function dailyFocusProfileWindowMiss(profile: DailyFocusProfile, combinedOdds: number): string[] {
  if (profile === 'parlay-diamante' && (combinedOdds < 1.1 || combinedOdds > 1.3)) return [DAILY_FOCUS_PROFILE_WINDOW_MISS_RISK_FLAG];
  if (profile === 'parlay-refinado' && (combinedOdds < 1.3 || combinedOdds > 2.1)) return [DAILY_FOCUS_PROFILE_WINDOW_MISS_RISK_FLAG];
  if (profile === 'low-variance' && (combinedOdds < 1.25 || combinedOdds > 2.2)) return [DAILY_FOCUS_PROFILE_WINDOW_MISS_RISK_FLAG];
  return [];
}

function dailyFocusProfileWindowReasons(profile: DailyFocusProfile, combinedOdds: number): string[] {
  if (!dailyFocusProfileWindowMiss(profile, combinedOdds).length) return [];
  return [`fallback odds ${round(combinedOdds, 3)} outside strict ${profile} profile window`];
}

function focusLegConfidence(
  leg: Pick<ParlayAnalysisRecommendation['legs'][number], 'confidence'>,
  recommendation?: Pick<DailyFinalRecommendation, 'aggregateConfidence'>,
): number {
  const legConfidence = Number(leg.confidence);
  if (Number.isFinite(legConfidence) && legConfidence > 0) return clamp(legConfidence, 0.01, 0.99);
  const recommendationConfidence = Number(recommendation?.aggregateConfidence);
  return Number.isFinite(recommendationConfidence) ? clamp(recommendationConfidence, 0.01, 0.99) : 0;
}

export function buildCouncilComposedParlayRecommendations(
  recommendations: readonly DailyFinalRecommendation[],
): DailyFinalRecommendation[] {
  const atomic = recommendations
    .filter((recommendation): recommendation is AtomicPredictionRecommendation => recommendation.kind === 'atomic-prediction')
    .filter((recommendation) => recommendation.legs.length > 0)
    .sort((a, b) =>
      b.score - a.score
      || b.expectedEdge - a.expectedEdge
      || b.aggregateConfidence - a.aggregateConfidence
      || a.combinedOdds - b.combinedOdds
    );
  const parlays: DailyFinalRecommendation[] = [];
  const usedPredictionIds = new Set<string>();
  const usedFixtureIds = new Set<string>();

  for (let index = 0; index < atomic.length && parlays.length < DAILY_COUNCIL_COMPOSED_PARLAY_LIMIT; index += 1) {
    const first = atomic[index] as AtomicPredictionRecommendation;
    if (usedPredictionIds.has(first.predictionId) || usedFixtureIds.has(first.legs[0]?.fixtureId ?? '')) continue;
    const second = atomic.find((candidate, candidateIndex) =>
      candidateIndex > index
      && !usedPredictionIds.has(candidate.predictionId)
      && !usedFixtureIds.has(candidate.legs[0]?.fixtureId ?? '')
      && candidate.legs[0]?.fixtureId !== first.legs[0]?.fixtureId
    );
    if (!second) break;
    const parlay = councilComposedParlay([first, second], parlays.length + 1);
    parlays.push(parlay);
    for (const recommendation of [first, second]) {
      usedPredictionIds.add(recommendation.predictionId);
      const fixtureId = recommendation.legs[0]?.fixtureId;
      if (fixtureId) usedFixtureIds.add(fixtureId);
    }
  }

  return parlays;
}

function councilComposedParlay(
  recommendations: [AtomicPredictionRecommendation, AtomicPredictionRecommendation],
  rank: number,
): DailyFinalRecommendation {
  const legs = recommendations.map((recommendation) => ({
    ...recommendation.legs[0],
    banker: true,
    bankerReason: `council-composed parlay leg: confidence ${round(recommendation.aggregateConfidence, 3)} edge ${round(recommendation.expectedEdge, 3)}`,
  }));
  const combinedOdds = round(legs.reduce((product, leg) => product * Number(leg.odds ?? 1), 1), 6);
  const aggregateConfidence = round(legs.reduce((product, leg) => product * clamp(Number(leg.confidence ?? 0), 0.01, 0.99), 1), 6);
  const adjustedProbability = round(clamp(aggregateConfidence, 0.01, 0.99), 6);
  const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
  const sourceRunIds = uniqueStrings(recommendations.flatMap((recommendation) => recommendation.sourceRunIds));
  const providers = uniqueStrings(recommendations.flatMap((recommendation) => recommendation.providers));
  const riskFlags = uniqueStrings([
    'council-composed',
    'review-required',
    ...recommendations.flatMap((recommendation) => recommendation.riskFlags ?? [])
      .filter((flag) => flag !== 'single-selection'),
  ]);
  const parlayId = `council-parlay-${createHash('sha256')
    .update(legs.map((leg) => leg.predictionId).join('|'))
    .digest('hex')
    .slice(0, 16)}`;

  return {
    kind: 'parlay',
    rank,
    parlayId,
    sourceRunId: sourceRunIds[0] ?? null,
    sourceRunIds,
    profile: 'low-variance',
    validationStatus: 'unvalidated',
    harnessStatus: 'review-required',
    selectionMode: recommendations.some((recommendation) => recommendation.selectionMode === 'analytical-fallback')
      ? 'analytical-fallback'
      : 'promotion-gate',
    fallbackReasons: ['council composed parlay from reviewed simple recommendations'],
    combinedOdds,
    aggregateConfidence,
    adjustedProbability,
    expectedEdge,
    score: round((aggregateConfidence * 0.62) + (Math.max(0, expectedEdge) * 0.28) - (riskFlags.length * 0.01), 6),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'council-composed-review-only-exposure',
    },
    stake: {
      units: 0,
      percentOfBankroll: 0,
      policy: 'council-composed-review-only-stake',
    },
    bankerLegs: legs.map((leg) => ({
      predictionId: leg.predictionId,
      fixtureId: leg.fixtureId,
      fixture: leg.fixture,
      ...(leg.display ? { display: leg.display } : {}),
      market: leg.market,
      selection: leg.selection,
      line: leg.line,
      odds: leg.odds,
      confidence: leg.confidence,
      reason: leg.bankerReason ?? 'council-composed parlay leg',
    })),
    reasons: [
      'council composed parlay: daily output requires parlay coverage',
      'built from simple recommendations that passed the council review gate',
      `providers: ${providers.join(', ') || 'unknown'}`,
      `aggregate confidence ${round(aggregateConfidence, 3)}`,
      `adjusted edge ${round(expectedEdge, 3)}`,
    ],
    riskFlags,
    legs,
  };
}

function toAtomicRecommendationDraft(candidates: AtomicPredictionCandidate[]): AtomicPredictionRecommendation {
  const ordered = [...candidates].sort((a, b) =>
    atomicCandidateEffectiveConfidence(b) - atomicCandidateEffectiveConfidence(a)
    || atomicCandidateEffectiveEdge(b) - atomicCandidateEffectiveEdge(a)
    || a.prediction.odds - b.prediction.odds,
  );
  const primary = ordered[0] as AtomicPredictionCandidate;
  const providers = uniqueStrings(ordered.map((candidate) => candidate.provider)) as DailyE2EProvider[];
  const sourceRunIds = uniqueStrings(ordered.map((candidate) => candidate.runId));
  const predictionIds = uniqueStrings(ordered.map((candidate) => candidate.prediction.id));
  const confidence = round(average(ordered.map(atomicCandidateEffectiveConfidence)), 6);
  const displayConfidence = round(average(ordered.map(atomicCandidateDisplayConfidence)), 6);
  const edge = round(average(ordered.map(atomicCandidateEffectiveEdge)), 6);
  const rankingConfidence = round(average(ordered.map((candidate) => candidate.prediction.confidence)), 6);
  const rankingEdge = round(average(ordered.map((candidate) => candidate.edge)), 6);
  const adjustedProbability = round(clamp(confidence * (providers.length > 1 ? 1.02 : 1), 0.01, 0.99), 6);
  const safetyOverride = atomicSafetyOverride(primary.prediction);
  const riskFlags = uniqueStrings([
    ...atomicRiskFlags(primary.prediction, providers.length),
    ...(safetyOverride ? ['model-probability-safety-confidence', safetyOverride] : []),
  ]);
  const focusSignals = fixtureFocusSignals(primary);
  const leg = {
    predictionId: primary.prediction.id,
    fixtureId: primary.prediction.fixtureId,
    fixture: primary.fixture,
    ...(primary.display ? { display: primary.display } : {}),
    market: primary.prediction.market,
    selection: primary.prediction.selection,
    line: primary.prediction.line ?? null,
    odds: round(primary.prediction.odds, 6),
    confidence: round(atomicCandidateEffectiveConfidence(primary), 6),
    validationStatus: 'unvalidated',
    warnings: primary.prediction.warnings ?? [],
    banker: true,
    bankerReason: `atomic high-confidence selection ${round(atomicCandidateEffectiveConfidence(primary), 3)}`,
  };

  return {
    kind: 'atomic-prediction',
    rank: 0,
    parlayId: `atomic-${primary.prediction.id}`,
    predictionId: primary.prediction.id,
    predictionIds,
    sourceRunId: primary.runId,
    sourceRunIds,
    provider: primary.provider,
    providers,
    model: primary.model,
    profile: ATOMIC_RECOMMENDATION_PROFILE,
    validationStatus: 'unvalidated',
    harnessStatus: primary.prediction.status === 'blocked' && safetyOverride ? 'review-required' : primary.prediction.status,
    combinedOdds: round(primary.prediction.odds, 6),
    aggregateConfidence: confidence,
    displayConfidence,
    adjustedProbability,
    expectedEdge: edge,
    score: round(atomicRecommendationScore(rankingConfidence, rankingEdge, providers.length, riskFlags.length) + fixtureFocusScore(primary), 6),
    exposure: {
      units: 0,
      percentOfAnalyticalBankroll: 0,
      policy: 'single-selection-analytical-watchlist',
    },
    bankerLegs: [{
      predictionId: leg.predictionId,
      fixtureId: leg.fixtureId,
      fixture: leg.fixture,
      ...(primary.display ? { display: primary.display } : {}),
      market: leg.market,
      selection: leg.selection,
      line: leg.line,
      odds: leg.odds,
      confidence: leg.confidence,
      reason: leg.bankerReason,
    }],
    reasons: [
      `profile ${ATOMIC_RECOMMENDATION_PROFILE}`,
      `confidence ${round(confidence, 3)}`,
      `edge ${round(edge, 3)}`,
      safetyOverride ? `safety override: ${safetyOverride}` : '',
      providers.length > 1 ? `provider agreement: ${providers.join(', ')}` : `provider: ${primary.provider}`,
      ...focusSignals.map((signal) => `focus signal: ${signal}`),
    ].filter(Boolean),
    riskFlags,
    legs: [leg],
  };
}

function isAtomicRecommendationEligible(prediction: PredictionRecordView, edge: number): boolean {
  if (prediction.status !== 'promotable') return false;
  if (!Number.isFinite(prediction.confidence) || prediction.confidence < ATOMIC_RECOMMENDATION_CONFIDENCE_FLOOR) return false;
  if (!Number.isFinite(prediction.odds) || prediction.odds <= 1) return false;
  if (!Number.isFinite(edge) || edge <= ATOMIC_RECOMMENDATION_EDGE_FLOOR) return false;
  if (prediction.model && DAILY_FINAL_DEMOTED_MODELS.includes(prediction.model as any)) return false;
  const riskFlags = atomicRiskFlags(prediction, 1);
  return !riskFlags.some((flag) => ATOMIC_BLOCKED_RISK_FLAGS.includes(flag as any));
}

export function atomicPredictionEdge(prediction: PredictionRecordView): number {
  if (Number.isFinite(prediction.edge)) return prediction.edge as number;
  const probability = prediction.probability ?? prediction.modelProbability ?? prediction.marketFairProbability;
  return Number.isFinite(probability) ? prediction.odds * (probability as number) - 1 : 0;
}

function atomicCandidateEffectiveConfidence(candidate: AtomicPredictionCandidate): number {
  const prediction = candidate.prediction;
  const safetyOverride = atomicSafetyOverride(prediction);
  if (!safetyOverride) return prediction.confidence;
  return round(Math.max(prediction.confidence, atomicProbabilityConfidence(prediction)), 6);
}

function atomicCandidateDisplayConfidence(candidate: AtomicPredictionCandidate): number {
  return round(Math.max(
    atomicCandidateEffectiveConfidence(candidate),
    atomicProbabilityConfidence(candidate.prediction),
  ), 6);
}

function atomicCandidateEffectiveEdge(candidate: AtomicPredictionCandidate): number {
  const prediction = candidate.prediction;
  const safetyOverride = atomicSafetyOverride(prediction);
  if (!safetyOverride) return candidate.edge;
  const confidenceEdge = prediction.odds * atomicCandidateEffectiveConfidence(candidate) - 1;
  return round(Math.max(candidate.edge, confidenceEdge, ATOMIC_SAFETY_REVIEW_EDGE_FLOOR), 6);
}

function atomicSafetyOverride(prediction: PredictionRecordView): 'model-probability-double-chance' | 'model-probability-conservative-total' | undefined {
  const confidence = atomicProbabilityConfidence(prediction);
  if (confidence < ATOMIC_SAFETY_MIN_EFFECTIVE_CONFIDENCE) return undefined;
  const confidenceEdge = prediction.odds * confidence - 1;
  if (confidenceEdge < ATOMIC_SAFETY_BREAK_EVEN_EDGE_FLOOR) return undefined;

  if (
    prediction.market === 'double_chance'
    && prediction.selection !== 'home_or_away'
    && prediction.odds >= ATOMIC_SAFETY_DOUBLE_CHANCE_MIN_ODDS
    && prediction.odds <= ATOMIC_SAFETY_DOUBLE_CHANCE_MAX_ODDS
  ) {
    return 'model-probability-double-chance';
  }

  if (
    prediction.market === 'goals_over_under'
    && prediction.odds <= ATOMIC_SAFETY_TOTALS_MAX_ODDS
    && Number.isFinite(prediction.line)
    && (
      (prediction.selection === 'over' && Number(prediction.line) <= 1.5)
      || (prediction.selection === 'under' && Number(prediction.line) >= 3.25)
    )
  ) {
    return 'model-probability-conservative-total';
  }

  return undefined;
}

function atomicProbabilityConfidence(prediction: PredictionRecordView): number {
  return clamp(firstFinite(
    prediction.modelProbability,
    prediction.probability,
    prediction.impliedProbability,
    prediction.marketImpliedProbability,
    prediction.confidence,
  ), 0.01, 0.99);
}

function atomicRiskFlags(prediction: PredictionRecordView, providerCount: number): string[] {
  const flags: string[] = ['single-selection'];
  if (providerCount > 1) flags.push('provider-consensus');
  const text = [
    prediction.rationale ?? '',
    ...(prediction.warnings ?? []),
    ...(prediction.blockers ?? []),
  ].join('\n');
  if (prediction.market === 'corners_over_under') {
    flags.push('corners-market');
    if (!/corners[- ]settlement[- ]reliable|corner settlement reliable|settlement reliable for corners/i.test(text)) {
      flags.push('corners-unverified');
    }
  }
  if (/stale (?:news|source|odds) source|stale odds/i.test(text)) flags.push('stale-source');
  if (/low[-_ ]liquidity|low liquidity|single[-_ ]bookmaker/i.test(text)) flags.push('low-liquidity');
  if (
    prediction.market === 'h2h'
    && prediction.selection !== 'draw'
    && prediction.odds <= 1.2
    && /low[-_ ]liquidity|low liquidity|single[-_ ]bookmaker|low_liquidity_h2h_favorite/i.test(text)
  ) {
    flags.push('low-liquidity-h2h-favorite');
  }
  if (/lineup[-_ ]pending|lineup pending|lineups? unconfirmed|lineup confirmation pending/i.test(text)) flags.push('lineup-pending');
  if (/no selection(?:\/line)?[- ]specific|selection[- ]level .*not supplied|selection[- ]level .*missing|market[- ]level only|support is market[- ]level only|fixture[- ]level evidence/i.test(text)) {
    flags.push('selection-evidence-missing');
  }
  if (prediction.market === 'h2h' && prediction.selection === 'away' && prediction.odds > 1.2) flags.push('h2h-away');
  if (prediction.market === 'double_chance' && prediction.odds <= 1.25 && Number(prediction.edge ?? 0) >= 0.25) flags.push('inflated-double-chance-edge');
  if (Number(prediction.edge ?? 0) >= 0.2) flags.push('overinflated-edge');
  return flags;
}

function atomicRecommendationScore(confidence: number, edge: number, providerCount: number, riskFlagCount: number): number {
  return round((confidence * 0.7) + (Math.max(0, edge) * 0.22) + (providerCount > 1 ? 0.06 : 0) - (riskFlagCount * 0.01), 6);
}

export function atomicPredictionKey(prediction: PredictionRecordView): string {
  return legSelectionKey(prediction.fixtureId, prediction.market, prediction.selection, prediction.line);
}

function legSelectionKey(fixtureId: unknown, market: unknown, selection: unknown, line: unknown): string {
  return [
    String(fixtureId ?? ''),
    String(market ?? ''),
    String(selection ?? ''),
    line ?? 'none',
  ].join('|');
}

export function hydrateRecommendationDisplay<T extends DailyFinalRecommendation>(
  recommendation: T,
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>,
): T {
  const displays = fixtureDisplayMap(Object.values(providerPipelineResults).flatMap(displayFixturesFromPipelineResult));
  const hydrateLeg = (leg: any) => {
    const display = displays.get(String(leg.fixtureId ?? ''));
    if (!display) return leg;
    return {
      ...leg,
      fixture: shouldReplaceFixtureLabel(leg.fixture) ? display.fixtureLabel : leg.fixture,
      display,
    };
  };
  return {
    ...recommendation,
    legs: Array.isArray(recommendation.legs) ? recommendation.legs.map(hydrateLeg) : recommendation.legs,
    bankerLegs: Array.isArray(recommendation.bankerLegs) ? recommendation.bankerLegs.map(hydrateLeg) : recommendation.bankerLegs,
  };
}

function fixtureDisplayMap(fixtures: Fixture[]): Map<string, RecommendationLegDisplay> {
  const displays = new Map<string, RecommendationLegDisplay>();
  for (const fixture of fixtures) {
    const display = fixtureDisplay(fixture);
    if (!display) continue;
    const existing = displays.get(fixture.id);
    if (!existing || fixtureDisplayQuality(display) > fixtureDisplayQuality(existing)) {
      displays.set(fixture.id, display);
    }
  }
  return displays;
}

export function displayFixturesFromPipelineResult(result: RunPipelineResult | undefined): Fixture[] {
  if (!result) return [];
  return [
    ...displayFixturesFromArtifactDir(result.artifactDir),
    ...(result.fixtures ?? []),
    ...(result.lowOddsScan?.candidateFixtures ?? []),
  ];
}

function displayFixturesFromArtifactDir(artifactDir: string | undefined): Fixture[] {
  if (!artifactDir) return [];
  try {
    const payload = JSON.parse(readFileSync(join(artifactDir, 'fixtures.json'), 'utf-8')) as unknown;
    const fixtures = fixtureArrayFromPayload(payload);
    return fixtures.filter(isFixtureLike);
  } catch {
    return [];
  }
}

function fixtureArrayFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as { fixtures?: unknown }).fixtures)) {
    return (payload as { fixtures: unknown[] }).fixtures;
  }
  return [];
}

function isFixtureLike(value: unknown): value is Fixture {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { id?: unknown }).id === 'string';
}

export function fixtureDisplay(fixture: Fixture): RecommendationLegDisplay | undefined {
  const homeTeamName = preferredDisplayName(fixture.homeTeamName, fixture.homeTeamId);
  const awayTeamName = preferredDisplayName(fixture.awayTeamName, fixture.awayTeamId);
  if (!homeTeamName || !awayTeamName) return undefined;
  const leagueName = preferredDisplayName((fixture as { competitionName?: unknown }).competitionName, fixture.competitionId);
  return {
    fixtureLabel: `${homeTeamName} vs ${awayTeamName}`,
    homeTeamName,
    awayTeamName,
    ...(leagueName ? { leagueName } : {}),
    kickoffLocal: fixture.scheduledAt,
  };
}

function preferredDisplayName(...values: unknown[]): string | undefined {
  const strings = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  return strings.find((value) => !isUuidLike(value));
}

export function fixtureDisplayQuality(display: RecommendationLegDisplay): number {
  return [
    display.homeTeamName,
    display.awayTeamName,
    display.fixtureLabel,
    display.leagueName,
  ].reduce((score, value) => {
    if (!value) return score;
    return score + (shouldReplaceFixtureLabel(value) ? 0 : 1);
  }, display.kickoffLocal ? 1 : 0);
}

export function recommendationLegsOutsideRequestedDate(
  recommendations: readonly Pick<DailyFinalRecommendation, 'rank' | 'legs'>[],
  date: string,
  timezone?: string,
): string[] {
  const window = fixtureDateRange(date, timezone);
  const offDate: string[] = [];
  for (const recommendation of recommendations) {
    for (const leg of recommendation.legs ?? []) {
      const kickoff = leg.display?.kickoffLocal;
      if (!kickoff) continue;
      const scheduledAt = new Date(kickoff);
      if (!Number.isFinite(scheduledAt.getTime())) continue;
      if (scheduledAt < window.start || scheduledAt >= window.end) {
        offDate.push(`#${recommendation.rank ?? '?'} ${leg.fixture ?? leg.fixtureId} @ ${scheduledAt.toISOString()}`);
      }
    }
  }
  return offDate;
}

function shouldReplaceFixtureLabel(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return true;
  const normalized = value.trim();
  return isUuidLike(normalized) || normalized.split(/\s+vs\.?\s+/i).every(isUuidLike);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function firstFinite(...values: unknown[]): number {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

export function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
