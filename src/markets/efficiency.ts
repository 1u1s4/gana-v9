export interface MarketEfficiencyInput {
  bookmakerCount: number;
  overround: number;
  dispersion: number;
  freshnessMinutes: number;
}

export function marketEfficiencyScore(input: MarketEfficiencyInput): number {
  const bookmakerScore = Math.min(1, input.bookmakerCount / 3);
  const overroundScore = Math.max(0, 1 - Math.max(0, input.overround) / 0.12);
  const dispersionScore = Math.max(0, 1 - input.dispersion / 0.15);
  const freshnessScore = Math.max(0, 1 - input.freshnessMinutes / 120);
  return round((bookmakerScore * 0.35) + (overroundScore * 0.25) + (dispersionScore * 0.2) + (freshnessScore * 0.2));
}

export function isLowLiquidity(input: MarketEfficiencyInput, threshold = 0.65): boolean {
  return input.bookmakerCount < 3 || marketEfficiencyScore(input) < threshold;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
