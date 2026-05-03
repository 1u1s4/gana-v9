export interface CalibrationBin {
  lower: number;
  upper: number;
  n: number;
  predicted: number;
  observed: number;
  lowSample: boolean;
}

export function calibrationPlot(items: Array<{ probability: number; outcome: 0 | 1 }>, binSize = 0.1): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let lower = 0; lower < 1; lower += binSize) {
    const upper = Math.min(1, lower + binSize);
    const bucket = items.filter((item) => item.probability >= lower && (upper === 1 ? item.probability <= upper : item.probability < upper));
    bins.push({
      lower,
      upper,
      n: bucket.length,
      predicted: average(bucket.map((item) => item.probability)),
      observed: average(bucket.map((item) => item.outcome)),
      lowSample: bucket.length < 30,
    });
  }
  return bins;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
