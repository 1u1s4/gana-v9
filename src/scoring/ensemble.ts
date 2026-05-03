import type { ConfidenceBand } from './edge-gate.js';

export interface ProviderPrediction {
  provider: string;
  selection: string;
  probability: number;
  weight?: number;
}

export function combineProviderPredictions(predictions: ProviderPrediction[]): {
  selection?: string;
  probability: number;
  confidenceBand: ConfidenceBand;
} {
  if (!predictions.length) return { probability: 0, confidenceBand: 'low' };
  const totals = new Map<string, { probability: number; weight: number }>();
  for (const prediction of predictions) {
    const weight = prediction.weight ?? 1;
    const current = totals.get(prediction.selection) ?? { probability: 0, weight: 0 };
    current.probability += prediction.probability * weight;
    current.weight += weight;
    totals.set(prediction.selection, current);
  }
  const [selection, aggregate] = [...totals.entries()].sort((a, b) => b[1].probability - a[1].probability)[0];
  const probability = aggregate.probability / aggregate.weight;
  return { selection, probability, confidenceBand: probability >= 0.7 ? 'high' : probability >= 0.55 ? 'medium' : 'low' };
}
