export interface CalibrationPoint {
  predicted: number;
  observed: number;
}

export function plattScale(probability: number, alpha = 1, beta = 0): number {
  const logit = Math.log(clamp(probability) / (1 - clamp(probability)));
  return 1 / (1 + Math.exp(-(alpha * logit + beta)));
}

export function isotonicCalibrate(points: CalibrationPoint[]): (probability: number) => number {
  const sorted = [...points].sort((a, b) => a.predicted - b.predicted)
    .map((point) => ({ x: point.predicted, y: point.observed, weight: 1 }));
  for (let i = 0; i < sorted.length - 1;) {
    if (sorted[i].y <= sorted[i + 1].y) {
      i++;
      continue;
    }
    const weight = sorted[i].weight + sorted[i + 1].weight;
    const y = ((sorted[i].y * sorted[i].weight) + (sorted[i + 1].y * sorted[i + 1].weight)) / weight;
    sorted.splice(i, 2, { x: sorted[i].x, y, weight });
    i = Math.max(0, i - 1);
  }
  return (probability: number) => {
    if (!sorted.length) return clamp(probability);
    const target = clamp(probability);
    let best = sorted[0];
    for (const point of sorted) {
      if (Math.abs(point.x - target) < Math.abs(best.x - target)) best = point;
    }
    return clamp(best.y);
  };
}

function clamp(value: number): number {
  return Math.max(1e-6, Math.min(1 - 1e-6, value));
}
