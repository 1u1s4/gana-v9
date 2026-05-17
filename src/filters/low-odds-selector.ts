import {
  isMarketKey,
  isValidMarketSelection,
  type MarketKey,
} from '../domain/markets.js';

export const LOW_ODDS_SELECTOR_MARKETS = ['h2h'] as const satisfies readonly MarketKey[];
export const LOW_ODDS_SELECTOR_SELECTIONS = ['home', 'away'] as const;

export function lowOddsSelectorMarketScope(_markets?: readonly MarketKey[]): MarketKey[] {
  return [...LOW_ODDS_SELECTOR_MARKETS];
}

export function isLowOddsFixtureSelectorQuote(
  quote: { market: string; selection: string },
  markets: readonly MarketKey[] = LOW_ODDS_SELECTOR_MARKETS,
): boolean {
  if (!isMarketKey(quote.market)) return false;
  if (!markets.includes(quote.market)) return false;
  if (!isValidMarketSelection(quote.market, quote.selection)) return false;
  return quote.market === 'h2h' && (quote.selection === 'home' || quote.selection === 'away');
}
