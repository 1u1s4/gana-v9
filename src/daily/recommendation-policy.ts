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
  for (const candidate of nonBlocked.length ? nonBlocked : candidates) {
    const key = atomicPredictionKey(candidate.prediction);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const ordered = [...groups.values()]
    .map(toAtomicRecommendationDraft)
    .map(markAtomicAsAnalyticalFallback)
    .sort((a, b) => b.score - a.score || b.aggregateConfidence - a.aggregateConfidence || a.combinedOdds - b.combinedOdds);
  const selected: AtomicPredictionRecommendation[] = [];
  const usedFixtureIds = new Set<string>();
  for (const recommendation of ordered) {
    const fixtureId = recommendation.legs[0]?.fixtureId;
    if (fixtureId && usedFixtureIds.has(fixtureId)) continue;
    if (fixtureId) usedFixtureIds.add(fixtureId);
    selected.push(recommendation);
  }
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
  const aggregateConfidence = round(candidates.reduce((product, candidate) => product * clamp(candidate.prediction.confidence, 0.01, 0.99), 1), 6);
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
    confidence: round(prediction.confidence, 6),
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
    .sort((a, b) => b.score - a.score || b.aggregateConfidence - a.aggregateConfidence || a.combinedOdds - b.combinedOdds);
  const selected: AtomicPredictionRecommendation[] = [];
  const usedFixtureIds = new Set<string>();
  for (const recommendation of ordered) {
    const fixtureId = recommendation.legs[0]?.fixtureId;
    if (fixtureId && usedFixtureIds.has(fixtureId)) continue;
    if (fixtureId) usedFixtureIds.add(fixtureId);
    selected.push(recommendation);
  }
  return selected.map((recommendation, index) => ({ ...recommendation, rank: rankOffset + index + 1 }));
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
    b.prediction.confidence - a.prediction.confidence
    || b.edge - a.edge
    || a.prediction.odds - b.prediction.odds,
  );
  const primary = ordered[0] as AtomicPredictionCandidate;
  const providers = uniqueStrings(ordered.map((candidate) => candidate.provider)) as DailyE2EProvider[];
  const sourceRunIds = uniqueStrings(ordered.map((candidate) => candidate.runId));
  const predictionIds = uniqueStrings(ordered.map((candidate) => candidate.prediction.id));
  const confidence = round(average(ordered.map((candidate) => candidate.prediction.confidence)), 6);
  const edge = round(average(ordered.map((candidate) => candidate.edge)), 6);
  const adjustedProbability = round(clamp(confidence * (providers.length > 1 ? 1.02 : 1), 0.01, 0.99), 6);
  const riskFlags = atomicRiskFlags(primary.prediction, providers.length);
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
    confidence: round(primary.prediction.confidence, 6),
    validationStatus: 'unvalidated',
    warnings: primary.prediction.warnings ?? [],
    banker: true,
    bankerReason: `atomic high-confidence selection ${round(primary.prediction.confidence, 3)}`,
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
    harnessStatus: primary.prediction.status,
    combinedOdds: round(primary.prediction.odds, 6),
    aggregateConfidence: confidence,
    adjustedProbability,
    expectedEdge: edge,
    score: round(atomicRecommendationScore(confidence, edge, providers.length, riskFlags.length) + fixtureFocusScore(primary), 6),
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
      providers.length > 1 ? `provider agreement: ${providers.join(', ')}` : `provider: ${primary.provider}`,
      ...focusSignals.map((signal) => `focus signal: ${signal}`),
    ],
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

export function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

