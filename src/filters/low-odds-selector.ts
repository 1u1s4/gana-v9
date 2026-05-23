import {
  isMarketKey,
  isValidMarketSelection,
  type MarketKey,
} from '../domain/markets.js';

export const LOW_ODDS_SELECTOR_MARKETS = ['h2h', 'double_chance'] as const satisfies readonly MarketKey[];
export const LOW_ODDS_SELECTOR_SELECTIONS = ['home', 'away', 'home_or_draw', 'draw_or_away'] as const;

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
  if (quote.market === 'h2h') return quote.selection === 'home' || quote.selection === 'away';
  if (quote.market === 'double_chance') return quote.selection === 'home_or_draw' || quote.selection === 'draw_or_away';
  return false;
}
