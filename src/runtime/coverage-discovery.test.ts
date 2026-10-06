import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverByMarketCoverage } from './coverage-discovery.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsSnapshotView } from './pipeline.js';
const now = new Date('2026-10-06T18:00:00Z');
const fixture = (id: string): Fixture => ({ id, providerFixtureId: id, provider: 'api-football', status: 'scheduled',
  scheduledAt: '2026-10-07T18:00:00Z', providerHomeTeamId: '1', providerAwayTeamId: '2', leagueId: 71, season: 2026 } as Fixture);
const snapshot = (id: string, books = 2): OddsSnapshotView => ({ fixtureId: id, providerFixtureId: id,
  quotes: Array.from({ length: books }, (_, i) => ['home','draw','away'].map((selection, j) => ({
    fixtureId: id, market: 'h2h' as const, selection, price: [2,3.5,4][j], impliedProbability: 1/[2,3.5,4][j],
    bookmaker: `book-${i}`, capturedAt: '2026-10-06T17:50:00Z', sourceSnapshotId: 'source',
  }))).flat() });
test('coverage adds moderate-price fixtures, preserves primary set and ranks actual distinct complete books', () => {
  const result = discoverByMarketCoverage(['1','2','3'].map(fixture), [snapshot('1'),snapshot('2'),snapshot('3',3)],new Set(['1']),now,1);
  assert.deepEqual(result.selectedFixtureIds,['3']);
  assert.deepEqual(result.candidates.find(c=>c.fixtureId==='1')!.reasons,['already-selected']);
  assert.ok(result.candidates.find(c=>c.fixtureId==='2')!.reasons.includes('discovery-budget'));
});
test('coverage refuses stale, duplicate-book, incomplete, invalid-margin and started opportunities', () => {
  const cases = [snapshot('stale'),snapshot('duplicate',1),snapshot('incomplete'),snapshot('margin'),snapshot('started')];
  cases[0].quotes.forEach(q=>q.capturedAt='2026-10-06T15:00:00Z');
  cases[1].quotes.push(...cases[1].quotes);
  cases[2].quotes=cases[2].quotes.filter(q=>q.selection!=='draw');
  cases[3].quotes.forEach(q=>q.price=1.1);
  const fixtures=cases.map(s=>fixture(s.fixtureId));fixtures[4].scheduledAt='2026-10-06T17:00:00Z';
  assert.deepEqual(discoverByMarketCoverage(fixtures,cases,new Set(),now).selectedFixtureIds,[]);
});
