import type { FixtureId, ProviderSnapshotId } from './ids.js';
import type { MarketKey } from './markets.js';

export interface OddsQuote {
  fixtureId: FixtureId;
  market: MarketKey;
  selection: string;
  line?: number;
  price: number;
  impliedProbability: number;
  bookmaker?: string;
  capturedAt: string;
  sourceSnapshotId: ProviderSnapshotId;
}

export type OddsQuoteValidationError =
  | 'invalid-price'
  | 'invalid-implied-probability'
  | 'invalid-line';

export function calculateImpliedProbability(price: number): number {
  return 1 / price;
}

export function isValidDecimalOdds(price: number): boolean {
  return Number.isFinite(price) && price > 1;
}

export function isValidImpliedProbability(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

export function isValidLine(line: number | undefined): boolean {
  return line === undefined || Number.isFinite(line);
}

export function validateOddsQuote(quote: OddsQuote): OddsQuoteValidationError[] {
  const errors: OddsQuoteValidationError[] = [];

  if (!isValidDecimalOdds(quote.price)) errors.push('invalid-price');
  if (!isValidImpliedProbability(quote.impliedProbability)) errors.push('invalid-implied-probability');
  if (!isValidLine(quote.line)) errors.push('invalid-line');

  return errors;
}
