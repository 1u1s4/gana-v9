import type { MarketKey } from '../domain/markets.js';

export const LOW_ODDS_SELECTOR_MARKETS = ['h2h'] as const satisfies readonly MarketKey[];
export const LOW_ODDS_SELECTOR_SELECTIONS = ['home', 'away'] as const;

export function lowOddsSelectorMarketScope(): MarketKey[] {
  return [...LOW_ODDS_SELECTOR_MARKETS];
}

export function isLowOddsFixtureSelectorQuote(quote: { market: string; selection: string }): boolean {
  return quote.market === 'h2h'
    && (quote.selection === 'home' || quote.selection === 'away');
}
