import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settlePublishedPick, summarizePublishedPicks } from '../retro-published-portfolio.mjs';
const pick = { id: 'p', kind: 'parlay', odds: 2.4, legs: [{ predictionId: 'a', odds: 1.5 }, { predictionId: 'b', odds: 1.6 }] };
test('missing leg settlement never becomes a win', () => {
  assert.equal(settlePublishedPick(pick, [{ predictionId: 'a', status: 'won' }]).status, 'unvalidated');
  assert.equal(settlePublishedPick(pick, [{ predictionId: 'a', status: 'lost' }]).status, 'lost');
});
test('void leg returns stake and reduces combined payout instead of using published odds', () => {
  assert.deepEqual(settlePublishedPick(pick, [{ predictionId: 'a', status: 'won' }, { predictionId: 'b', status: 'voided' }]), { status: 'won', returnUnits: 1.5 });
  assert.deepEqual(settlePublishedPick(pick, [{ predictionId: 'a', status: 'voided' }, { predictionId: 'b', status: 'voided' }]), { status: 'voided', returnUnits: 1 });
});
test('direct parlay win without full leg evidence has unknown payout', () => {
  assert.deepEqual(settlePublishedPick(pick, [{ parlayId: 'p', status: 'won' }]), { status: 'won', returnUnits: null });
});
test('unresolved and void picks are excluded from decided hit rate, unresolved excluded from ROI', () => {
  const rows = [
    { date: '2026-09-01', fixtureSet: 'a', status: 'won', returnUnits: 1.5 },
    { date: '2026-09-01', fixtureSet: 'b', status: 'lost', returnUnits: 0 },
    { date: '2026-09-01', fixtureSet: 'c', status: 'voided', returnUnits: 1 },
    { date: '2026-09-01', fixtureSet: 'd', status: 'pending', returnUnits: null },
  ];
  const summary = summarizePublishedPicks(rows);
  assert.equal(summary.hitRate, 0.5);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.payoutKnown, 3);
  assert.equal(summary.flatUnitPnl, -0.5);
});
