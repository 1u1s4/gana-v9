import type { RunPipelineResult } from '../runtime/run-service.js';
import type { PredictionRecordView } from '../prediction/types.js';
import type { DailyE2EProvider } from './types.js';

export interface DailyProviderPredictionInput {
  provider: DailyE2EProvider;
  model: string;
  runId?: string;
  result?: RunPipelineResult;
}

export interface DailyProviderComparison {
  dailyBatchId: string;
  date: string;
  summary: DailyProviderComparisonSummary;
  items: DailyProviderComparisonItem[];
  providerSummaries: DailyProviderSummary[];
  analyticalArtifactOnly: true;
  executionCapability: 'none';
}

export interface DailyProviderConsensus {
  dailyBatchId: string;
  date: string;
  summary: {
    consensusPredictions: number;
    providers: string[];
    avgConfidence: number | null;
    avgEdge: number | null;
  };
  items: DailyProviderComparisonItem[];
  analyticalArtifactOnly: true;
  executionCapability: 'none';
}

export interface DailyProviderComparisonSummary {
  comparablePredictions: number;
  matchedGroups: number;
  sameSelection: number;
  sameSelectionDifferentLine: number;
  sameMarketDifferentSelection: number;
  sameMarketDifferentSelectionAndLine: number;
  materialDisagreements: number;
  onlyCodex: number;
  onlyGemini: number;
  onlyByProvider: Record<string, number>;
  agreementRate: number | null;
  disagreementRate: number | null;
  avgConfidenceByProvider: Record<string, number | null>;
  avgEdgeByProvider: Record<string, number | null>;
}

export interface DailyProviderSummary {
  provider: string;
  model: string;
  runId?: string;
  totalPredictions: number;
  promotable: number;
  reviewRequired: number;
  blocked: number;
  avgConfidence: number | null;
  avgEdge: number | null;
}

export interface DailyProviderComparisonItem {
  key: string;
  fixtureId: string;
  providerFixtureId?: string;
  market: string;
  line: number | null;
  classification:
    | 'same-selection'
    | 'same-selection-different-line'
    | 'same-market-different-selection'
    | 'same-market-different-selection-and-line'
    | 'only-provider';
  providers: DailyProviderPredictionSummary[];
}

export interface DailyProviderPredictionSummary {
  provider: string;
  model: string;
  runId?: string;
  predictionId: string;
  selection: string;
  line: number | null;
  odds: number;
  probability: number | null;
  modelProbability: number | null;
  confidence: number;
  edge: number | null;
  status: string;
  warnings: string[];
}

export function buildDailyProviderComparison(input: {
  dailyBatchId: string;
  date: string;
  providers: DailyProviderPredictionInput[];
}): { comparison: DailyProviderComparison; consensus: DailyProviderConsensus } {
  const predictionGroups = new Map<string, DailyProviderPredictionSummary[]>();
  const providerSummaries = input.providers.map((provider) => {
    const predictions = collectPredictions(provider.result);
    for (const prediction of predictions) {
      const key = comparisonKey(prediction);
      const current = predictionGroups.get(key) ?? [];
      current.push(toPredictionSummary(provider, prediction));
      predictionGroups.set(key, current);
    }
    return summarizeProvider(provider, predictions);
  });

  const items = [...predictionGroups.entries()]
    .map(([key, providers]) => toComparisonItem(key, providers))
    .sort((a, b) => classificationOrder(a.classification) - classificationOrder(b.classification)
      || a.fixtureId.localeCompare(b.fixtureId)
      || a.market.localeCompare(b.market)
      || (a.line ?? -1) - (b.line ?? -1));

  const sameSelection = items.filter((item) => item.classification === 'same-selection').length;
  const sameSelectionDifferentLine = items.filter((item) => item.classification === 'same-selection-different-line').length;
  const sameMarketDifferentSelection = items.filter((item) => item.classification === 'same-market-different-selection').length;
  const sameMarketDifferentSelectionAndLine = items.filter((item) => item.classification === 'same-market-different-selection-and-line').length;
  const onlyByProvider = countOnlyProvider(items);
  const materialDisagreements = sameSelectionDifferentLine + sameMarketDifferentSelection + sameMarketDifferentSelectionAndLine;
  const matchedGroups = sameSelection + materialDisagreements;
  const agreementRate = matchedGroups ? round(sameSelection / matchedGroups, 4) : null;
  const disagreementRate = matchedGroups ? round(materialDisagreements / matchedGroups, 4) : null;
  const allPredictionSummaries = items.flatMap((item) => item.providers);

  const summary: DailyProviderComparisonSummary = {
    comparablePredictions: allPredictionSummaries.length,
    matchedGroups,
    sameSelection,
    sameSelectionDifferentLine,
    sameMarketDifferentSelection,
    sameMarketDifferentSelectionAndLine,
    materialDisagreements,
    onlyCodex: onlyByProvider.codex ?? 0,
    onlyGemini: onlyByProvider.gemini ?? 0,
    onlyByProvider,
    agreementRate,
    disagreementRate,
    avgConfidenceByProvider: averageByProvider(allPredictionSummaries, 'confidence'),
    avgEdgeByProvider: averageByProvider(allPredictionSummaries, 'edge'),
  };

  const consensusItems = items.filter((item) => item.classification === 'same-selection');
  const consensusPredictions = consensusItems.flatMap((item) => item.providers);
  const comparison: DailyProviderComparison = {
    dailyBatchId: input.dailyBatchId,
    date: input.date,
    summary,
    providerSummaries,
    items,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
  const consensus: DailyProviderConsensus = {
    dailyBatchId: input.dailyBatchId,
    date: input.date,
    summary: {
      consensusPredictions: consensusItems.length,
      providers: [...new Set(consensusPredictions.map((item) => item.provider))].sort(),
      avgConfidence: average(consensusPredictions.map((item) => item.confidence)),
      avgEdge: average(consensusPredictions.map((item) => item.edge).filter((value): value is number => value !== null)),
    },
    items: consensusItems,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
  return { comparison, consensus };
}

function collectPredictions(result: RunPipelineResult | undefined): PredictionRecordView[] {
  return result?.scoring.flatMap((fixture) => fixture.predictions) ?? [];
}

function comparisonKey(prediction: PredictionRecordView): string {
  return `${prediction.fixtureId}|${prediction.providerFixtureId ?? 'none'}|${prediction.market}`;
}

function toPredictionSummary(
  provider: DailyProviderPredictionInput,
  prediction: PredictionRecordView,
): DailyProviderPredictionSummary {
  return {
    provider: provider.provider,
    model: provider.model,
    runId: provider.runId,
    predictionId: prediction.id,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    probability: prediction.probability ?? null,
    modelProbability: prediction.modelProbability ?? prediction.probability ?? null,
    confidence: prediction.confidence,
    edge: prediction.edge ?? null,
    status: prediction.status,
    warnings: prediction.warnings ?? [],
  };
}

function summarizeProvider(
  provider: DailyProviderPredictionInput,
  predictions: PredictionRecordView[],
): DailyProviderSummary {
  return {
    provider: provider.provider,
    model: provider.model,
    ...(provider.runId ? { runId: provider.runId } : {}),
    totalPredictions: predictions.length,
    promotable: predictions.filter((prediction) => prediction.status === 'promotable').length,
    reviewRequired: predictions.filter((prediction) => prediction.status === 'review-required').length,
    blocked: predictions.filter((prediction) => prediction.status === 'blocked').length,
    avgConfidence: average(predictions.map((prediction) => prediction.confidence)),
    avgEdge: average(predictions.map((prediction) => prediction.edge).filter((value): value is number => value !== undefined)),
  };
}

function toComparisonItem(key: string, providers: DailyProviderPredictionSummary[]): DailyProviderComparisonItem {
  const [fixtureId, providerFixtureId, market] = key.split('|');
  const selections = new Set(providers.map((provider) => provider.selection));
  const lines = new Set(providers.map((provider) => lineKey(provider.line)));
  const uniqueProviders = new Set(providers.map((provider) => provider.provider));
  const classification = uniqueProviders.size === 1
    ? 'only-provider'
    : selections.size === 1 && lines.size === 1
      ? 'same-selection'
      : selections.size === 1
        ? 'same-selection-different-line'
        : lines.size === 1
          ? 'same-market-different-selection'
          : 'same-market-different-selection-and-line';
  return {
    key,
    fixtureId: fixtureId ?? '',
    ...(providerFixtureId && providerFixtureId !== 'none' ? { providerFixtureId } : {}),
    market: market ?? 'unknown',
    line: lines.size === 1 ? providers[0]?.line ?? null : null,
    classification,
    providers: providers.sort((a, b) => a.provider.localeCompare(b.provider)),
  };
}

function lineKey(line: number | null): string {
  return line === null ? 'none' : String(line);
}

function countOnlyProvider(items: DailyProviderComparisonItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.classification !== 'only-provider') continue;
    const provider = item.providers[0]?.provider;
    if (!provider) continue;
    counts[provider] = (counts[provider] ?? 0) + 1;
  }
  return counts;
}

function averageByProvider(
  predictions: DailyProviderPredictionSummary[],
  field: 'confidence' | 'edge',
): Record<string, number | null> {
  const groups = new Map<string, number[]>();
  for (const prediction of predictions) {
    const value = prediction[field];
    if (value === null) continue;
    const current = groups.get(prediction.provider) ?? [];
    current.push(value);
    groups.set(prediction.provider, current);
  }
  return Object.fromEntries([...groups.entries()].map(([provider, values]) => [provider, average(values)]));
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

function classificationOrder(classification: DailyProviderComparisonItem['classification']): number {
  if (classification === 'same-selection') return 0;
  if (classification === 'same-selection-different-line') return 1;
  if (classification === 'same-market-different-selection') return 2;
  if (classification === 'same-market-different-selection-and-line') return 3;
  return 4;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
