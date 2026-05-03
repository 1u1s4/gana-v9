export function detectDisagreement(predictions: Array<{ selection: string; probability: number }>, threshold = 0.15): string[] {
  const blockers: string[] = [];
  if (new Set(predictions.map((prediction) => prediction.selection)).size > 1) blockers.push('model-disagreement');
  const probabilities = predictions.map((prediction) => prediction.probability);
  if (probabilities.length && Math.max(...probabilities) - Math.min(...probabilities) > threshold) {
    blockers.push('model-disagreement');
  }
  return [...new Set(blockers)];
}
