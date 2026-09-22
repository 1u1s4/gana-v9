import { isBelowLowOddsThreshold } from '../filters/low-odds-selector.js';
import { LOW_ODDS_WINNER_MAX_LEG_ODDS } from '../parlay/eligibility.js';
import { isApiFootballBookmakerAllowed } from '../providers/sports/api-football.js';
import type { OddsQuoteRecord } from '../storage/types.js';

/** Only selectable persisted rows from the very same event/snapshot may supply a price. */
export function selectLowOddsPriceVariantQuote(
  source: OddsQuoteRecord,
  selectableQuotes: readonly OddsQuoteRecord[],
  bookmakerAllowlist?: string[],
  threshold = LOW_ODDS_WINNER_MAX_LEG_ODDS,
): OddsQuoteRecord | undefined {
  const ceiling = Math.min(threshold, LOW_ODDS_WINNER_MAX_LEG_ODDS);
  if (source.marketKey !== 'h2h' || !['home', 'away'].includes(source.selectionKey) || source.line != null) return;
  if (!Number.isFinite(Number(source.price)) || Number(source.price) <= 1) return;
  // The normal best price already represents this profile; do not duplicate it.
  if (isBelowLowOddsThreshold(Number(source.price), ceiling)) return;
  return selectableQuotes.filter((quote) =>
    quote.id !== source.id
    && quote.fixtureId === source.fixtureId
    && quote.snapshotId === source.snapshotId
    && quote.marketKey === source.marketKey
    && quote.selectionKey === source.selectionKey
    && quote.line == null
    && isBelowLowOddsThreshold(Number(quote.price), ceiling)
    && isApiFootballBookmakerAllowed(quote.bookmaker, bookmakerAllowlist),
  ).sort((a, b) => Number(b.price) - Number(a.price) || a.id.localeCompare(b.id))[0];
}

export function isLowOddsPriceVariant(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prediction = value as Record<string, unknown>;
  if (prediction.quoteVariantScope === 'low-odds-top') return true;
  const metadata = prediction.metadata;
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).quoteVariantScope === 'low-odds-top');
}
