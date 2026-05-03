import { randomUUID } from 'crypto';
import { isMarketKey, isValidMarketSelection, marketRequiresLine } from '../domain/markets.js';
import type { PredictionStatus } from '../prediction/types.js';
import {
  calculateAggregateConfidence,
  calculateAggregateQuality,
  calculateCombinedOdds,
  resolveParlayConfig,
} from './rules.js';
import type {
  BuildParlayInput,
  BuildParlayResult,
  ParlayExclusionReason,
  ParlayInclusionReason,
  ParlayLeg,
  ParlayPredictionEvaluation,
  ParlaySourcePrediction,
  ParlayStatus,
} from './types.js';

interface SelectedPrediction {
  prediction: ParlaySourcePrediction;
  inclusionReason: ParlayInclusionReason;
}

export function buildParlay(input: BuildParlayInput): BuildParlayResult {
  const config = resolveParlayConfig(input.config);
  const parlayId = input.id ?? randomUUID();
  const predictions = [...input.predictions].sort(comparePredictions);
  const selected: SelectedPrediction[] = [];
  const evaluations: ParlayPredictionEvaluation[] = [];

  for (const prediction of predictions) {
    const excludedReasons = evaluatePrediction(prediction, selected, config);
    const includedReasons: ParlayInclusionReason[] = [];
    const eligible = excludedReasons.length === 0;

    if (eligible) {
      const inclusionReason = selected.some((selection) => selection.prediction.fixtureId === prediction.fixtureId)
        ? 'included-with-duplicate-fixture-override'
        : 'included-eligible-prediction';
      includedReasons.push(inclusionReason);
      selected.push({ prediction, inclusionReason });
    }

    evaluations.push({
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      includedReasons,
      excludedReasons,
      eligible,
    });
  }

  const legs = selected.map(({ prediction, inclusionReason }, index): ParlayLeg => ({
    parlayId,
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line,
    odds: prediction.odds,
    status: prediction.status,
    index,
    inclusionReason,
  }));
  const sourcePredictions = selected.map(({ prediction }) => prediction);
  const combinedOdds = calculateCombinedOdds(legs);
  const aggregateConfidence = calculateAggregateConfidence(sourcePredictions);
  const aggregateQuality = calculateAggregateQuality(sourcePredictions);
  const status = deriveParlayStatus(sourcePredictions, config.minLegs);

  return {
    parlay: {
      id: parlayId,
      sourceRunId: input.sourceRunId ?? sourcePredictions[0]?.runId ?? predictions[0]?.runId ?? 'unavailable-run',
      legs,
      combinedOdds,
      aggregateConfidence,
      aggregateQuality,
      rationale: buildRationale(legs.length, config.minLegs, status),
      warnings: buildWarnings(sourcePredictions, evaluations, config.allowMultipleLegsPerFixture),
      status,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
    },
    evaluations,
    config,
  };
}

function comparePredictions(a: ParlaySourcePrediction, b: ParlaySourcePrediction): number {
  return statusRank(b.status) - statusRank(a.status)
    || b.confidence - a.confidence
    || qualityRank(b.quality) - qualityRank(a.quality)
    || a.id.localeCompare(b.id);
}

function statusRank(status: PredictionStatus): number {
  if (status === 'promotable') return 3;
  if (status === 'candidate') return 2;
  if (status === 'review-required') return 1;
  return 0;
}

function qualityRank(quality: ParlaySourcePrediction['quality']): number {
  if (quality === 'high') return 3;
  if (quality === 'medium') return 2;
  return 1;
}

function evaluatePrediction(
  prediction: ParlaySourcePrediction,
  selected: readonly SelectedPrediction[],
  config: ReturnType<typeof resolveParlayConfig>,
): ParlayExclusionReason[] {
  const reasons: ParlayExclusionReason[] = [];
  const currentCombinedOdds = calculateCombinedOdds(selected.map(({ prediction }) => prediction)) ?? 1;

  if (prediction.status === 'blocked') reasons.push('excluded-blocked-prediction');
  if (prediction.status === 'draft') reasons.push('excluded-draft-prediction');
  if (!isMarketKey(prediction.market)) {
    reasons.push('excluded-invalid-market');
  } else {
    if (!isValidMarketSelection(prediction.market, prediction.selection)) {
      reasons.push('excluded-invalid-selection');
    }
    const requiresLine = marketRequiresLine(prediction.market);
    if ((requiresLine && !Number.isFinite(prediction.line)) || (!requiresLine && prediction.line !== undefined)) {
      reasons.push('excluded-invalid-line');
    }
  }
  if (!Number.isFinite(prediction.odds) || prediction.odds <= 1) reasons.push('excluded-invalid-odds');
  if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
    reasons.push('excluded-invalid-confidence');
  }
  if (prediction.confidence < config.minPredictionConfidence) {
    reasons.push('excluded-below-min-confidence');
  }
  if (prediction.blockers?.length) reasons.push('excluded-prediction-blockers');
  if (prediction.edge !== undefined && prediction.edge <= 0) reasons.push('excluded-no-edge');
  if (
    !config.allowMultipleLegsPerFixture
    && selected.some((selection) => selection.prediction.fixtureId === prediction.fixtureId)
  ) {
    reasons.push('excluded-duplicate-fixture');
  }
  if (selected.length >= config.maxLegs) {
    reasons.push('excluded-max-legs-reached');
  }
  if (config.maxCombinedOdds !== undefined && currentCombinedOdds * prediction.odds > config.maxCombinedOdds) {
    reasons.push('excluded-combined-odds-limit');
  }

  return [...new Set(reasons)];
}

function deriveParlayStatus(predictions: readonly ParlaySourcePrediction[], minLegs: number): ParlayStatus {
  if (predictions.length < minLegs) return 'blocked';
  if (predictions.some((prediction) => (prediction.blockers?.length ?? 0) > 0)) return 'blocked';
  if (predictions.some((prediction) => prediction.edge !== undefined && prediction.edge <= 0)) return 'blocked';
  if (predictions.some((prediction) => prediction.status === 'review-required')) return 'review-required';
  if (predictions.some((prediction) => (prediction.warnings?.length ?? 0) > 0 || (prediction.riskTags?.length ?? 0) > 0)) return 'review-required';
  if (predictions.every((prediction) => prediction.status === 'promotable')) return 'promotable';
  return 'candidate';
}

function buildRationale(legCount: number, minLegs: number, status: PredictionStatus): string {
  if (status === 'blocked') {
    return `Analytical parlay candidate blocked: ${legCount} eligible leg(s) selected, ${minLegs} required.`;
  }

  return [
    `Analytical parlay candidate built from ${legCount} eligible structured predictions.`,
    'This is an analytical artifact only and cannot execute a wager or monetary action.',
    'Aggregate confidence is the product of leg confidence values.',
    'Aggregate quality is the average mapped quality score.',
    'Additional legs reduce aggregate confidence because each selected leg contributes multiplicatively.',
  ].join(' ');
}

function buildWarnings(
  selected: readonly ParlaySourcePrediction[],
  evaluations: readonly ParlayPredictionEvaluation[],
  allowMultipleLegsPerFixture: boolean,
): string[] {
  const warnings: string[] = [];
  const runIds = new Set(selected.map((prediction) => prediction.runId));

  if (runIds.size > 1) {
    warnings.push('Multiple source runs contributed to this analytical artifact.');
  }
  if (
    allowMultipleLegsPerFixture
    && evaluations.some((evaluation) => evaluation.includedReasons.includes('included-with-duplicate-fixture-override'))
  ) {
    warnings.push('Duplicate fixture override included more than one leg from a fixture.');
  }
  if (selected.some((prediction) => (prediction.warnings?.length ?? 0) > 0)) {
    warnings.push('One or more selected legs carry prediction or research warnings.');
  }
  if (selected.some((prediction) => (prediction.riskTags?.length ?? 0) > 0)) {
    warnings.push('One or more selected legs carry portfolio risk tags.');
  }
  if (evaluations.some((evaluation) => evaluation.excludedReasons.includes('excluded-combined-odds-limit'))) {
    warnings.push('Combined odds limit excluded one or more predictions.');
  }

  return warnings;
}
