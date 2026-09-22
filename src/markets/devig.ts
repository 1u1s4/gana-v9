export interface DevigSelection {
  selection: string;
  odds: number;
  weight?: number;
}

export interface DevigResult {
  selection: string;
  impliedProbability: number;
  fairProbability: number;
  fairOdds: number;
  overround: number;
}

export function proportionalDevig(selections: DevigSelection[], probabilityMass: 1 | 2 = 1): DevigResult[] {
  const implied = selections.map((selection) => ({ ...selection, impliedProbability: 1 / selection.odds }));
  const total = implied.reduce((sum, selection) => sum + selection.impliedProbability, 0);
  // The three double-chance outcomes each contain two disjoint 1X2 results.
  // Their fair probabilities sum to two, unlike exclusive outcome markets.
  const overround = total / probabilityMass - 1;
  return implied.map((selection) => {
    const fairProbability = total > 0 ? probabilityMass * selection.impliedProbability / total : 0;
    return {
      selection: selection.selection,
      impliedProbability: selection.impliedProbability,
      fairProbability,
      fairOdds: fairProbability > 0 ? 1 / fairProbability : Infinity,
      overround,
    };
  });
}

export function powerDevig(selections: DevigSelection[], tolerance = 1e-9): DevigResult[] {
  const implied = selections.map((selection) => 1 / selection.odds);
  let low = 0.01;
  let high = 5;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const sum = implied.reduce((acc, probability) => acc + probability ** mid, 0);
    if (Math.abs(sum - 1) < tolerance) break;
    if (sum > 1) low = mid;
    else high = mid;
  }
  const k = (low + high) / 2;
  const adjusted = implied.map((probability) => probability ** k);
  const total = adjusted.reduce((sum, value) => sum + value, 0);
  return selections.map((selection, index) => {
    const fairProbability = adjusted[index] / total;
    return {
      selection: selection.selection,
      impliedProbability: implied[index],
      fairProbability,
      fairOdds: 1 / fairProbability,
      overround: implied.reduce((sum, value) => sum + value, 0) - 1,
    };
  });
}

export const shinDevig = powerDevig;
