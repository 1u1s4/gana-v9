import { proportionalDevig, type DevigResult, type DevigSelection } from './devig.js';

export interface ConsensusFairPrice {
  selection: string;
  marketImpliedProbability: number;
  marketFairProbability: number;
  consensusFairOdds: number;
  overround: number;
  bookmakerCount: number;
}

export function consensusFairPrices(quotes: Array<DevigSelection & { bookmaker?: string }>): ConsensusFairPrice[] {
  const byBook = new Map<string, DevigSelection[]>();
  for (const quote of quotes) {
    const bookmaker = quote.bookmaker ?? 'unknown';
    byBook.set(bookmaker, [...(byBook.get(bookmaker) ?? []), quote]);
  }
  const devigged = [...byBook.values()].flatMap((book) => proportionalDevig(book));
  const bySelection = new Map<string, DevigResult[]>();
  for (const result of devigged) bySelection.set(result.selection, [...(bySelection.get(result.selection) ?? []), result]);
  return [...bySelection.entries()].map(([selection, results]) => {
    const fair = average(results.map((result) => result.fairProbability));
    return {
      selection,
      marketImpliedProbability: average(results.map((result) => result.impliedProbability)),
      marketFairProbability: fair,
      consensusFairOdds: fair > 0 ? 1 / fair : Infinity,
      overround: average(results.map((result) => result.overround)),
      bookmakerCount: results.length,
    };
  });
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
