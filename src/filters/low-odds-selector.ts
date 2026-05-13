import {
  DEFAULT_MARKETS,
  isMarketKey,
  isValidMarketSelection,
  normalizeMarketScope,
  type MarketKey,
} from '../domain/markets.js';

export const LOW_ODDS_SELECTOR_MARKETS = [...DEFAULT_MARKETS] as const satisfies readonly MarketKey[];
export const LOW_ODDS_SELECTOR_SELECTIONS = ['home', 'away'] as const;

export function lowOddsSelectorMarketScope(markets?: readonly MarketKey[]): MarketKey[] {
  return normalizeMarketScope(markets, LOW_ODDS_SELECTOR_MARKETS);
}

export function isLowOddsFixtureSelectorQuote(
  quote: { market: string; selection: string },
  markets: readonly MarketKey[] = LOW_ODDS_SELECTOR_MARKETS,
): boolean {
  if (!isMarketKey(quote.market)) return false;
  if (!markets.includes(quote.market)) return false;
  if (!isValidMarketSelection(quote.market, quote.selection)) return false;
  if (quote.market === 'h2h') {
    return quote.selection === 'home' || quote.selection === 'away';
  }
  return true;
}
