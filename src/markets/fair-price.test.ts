import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consensusFairPrices } from './fair-price.js';
import { buildOddsMarketAnalytics } from '../providers/sports/api-football.js';

const outcomes = ['home_or_draw', 'home_or_away', 'draw_or_away'];
const doubleChanceBook = (bookmaker: string) => [0.8, 0.7, 0.5].map((probability, index) => ({
  bookmaker, selection: outcomes[index], odds: 1 / (probability * 1.05),
}));

test('double chance preserves overlapping probability mass two and normalizes the bookmaker margin', () => {
  const fair = consensusFairPrices(doubleChanceBook('book-a'), 'double_chance');
  assert.equal(fair.length, 3);
  assert.ok(Math.abs(fair.reduce((sum, quote) => sum + quote.marketFairProbability, 0) - 2) < 1e-12);
  for (const [index, expected] of [0.8, 0.7, 0.5].entries()) {
    assert.ok(Math.abs(fair[index].marketFairProbability - expected) < 1e-12);
    assert.ok(Math.abs(fair[index].overround - 0.05) < 1e-12);
  }
  const exclusive = consensusFairPrices([
    { bookmaker: 'book-a', selection: 'home', odds: 1 / 0.525 },
    { bookmaker: 'book-a', selection: 'draw', odds: 1 / 0.315 },
    { bookmaker: 'book-a', selection: 'away', odds: 1 / 0.21 },
  ], 'h2h');
  assert.ok(Math.abs(exclusive.reduce((sum, quote) => sum + quote.marketFairProbability, 0) - 1) < 1e-12);
  assert.ok(Math.abs(fair[0].marketFairProbability - exclusive[0].marketFairProbability - exclusive[1].marketFairProbability) < 1e-12);
});

test('incomplete and incoherent books do not create a fair benchmark or inflate coverage', () => {
  const valid = doubleChanceBook('complete');
  const partial = doubleChanceBook('partial').slice(0, 2);
  const incoherent = outcomes.map((selection, index) => ({ bookmaker: 'bad', selection, odds: [1.1, 3, 5][index] }));
  assert.deepEqual(consensusFairPrices(partial, 'double_chance'), []);
  assert.deepEqual(consensusFairPrices(incoherent, 'double_chance'), []);
  const fair = consensusFairPrices([...valid, ...partial, ...incoherent], 'double_chance');
  assert.equal(fair.length, 3);
  assert.equal(fair.every((quote) => quote.bookmakerCount === 1), true);
  assert.deepEqual(consensusFairPrices([{ bookmaker: 'one', selection: 'home', odds: 1.5 }], 'h2h'), []);
  assert.deepEqual(consensusFairPrices([{ bookmaker: 'one', selection: 'over', odds: 1.5 }], 'goals_over_under'), []);
});

test('provider analytics repairs the live double-chance prices without weakening the coverage gate', () => {
  const quotes = [1.28, 1.36, 1.67].map((price, index) => ({
    fixtureId: 'fixture', sourceSnapshotId: 'source', capturedAt: '2026-09-22T07:34:23.327Z',
    bookmaker: 'Bet365', market: 'double_chance' as const, selection: outcomes[index], price, impliedProbability: 1 / price,
  }));
  const analytics = buildOddsMarketAnalytics(quotes);
  const homeOrDraw = analytics.get('Bet365|double_chance|home_or_draw|null');
  assert.equal(homeOrDraw?.marketFairProbability, 0.73865);
  assert.equal(homeOrDraw?.overround, 0.057673);
  assert.equal(homeOrDraw?.marketBookmakerCount, 1);
  assert.equal(homeOrDraw?.lowLiquidity, true);
  const broad = ['a', 'b', 'c'].flatMap((bookmaker) => doubleChanceBook(bookmaker).map((quote) => ({
    ...quotes[0], bookmaker, selection: quote.selection, price: quote.odds, impliedProbability: 1 / quote.odds,
  })));
  assert.equal([...buildOddsMarketAnalytics(broad).values()].every((quote) => quote.marketBookmakerCount === 3 && !quote.lowLiquidity), true);
});
