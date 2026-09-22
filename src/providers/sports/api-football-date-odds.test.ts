import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ApiFootballProvider } from './api-football.js';
import type { ApiFootballProviderConfig, CanonicalOddsSnapshot } from './types.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function config(maxProviderRequestsPerRun = 20): ApiFootballProviderConfig {
  return {
    apiFootballKey: 'test-key', apiFootballBaseUrl: 'https://v3.football.api-sports.io',
    apiFootball: {
      defaultSeason: 2026, defaultSeasonInferred: false, timezone: 'America/Guatemala',
      leaguePresetsPath: '', bookmakerPresetsPath: '', defaultLeagues: [], defaultTeams: [],
      defaultMarkets: ['h2h'], lowOddsThreshold: 1.10, kickoffWindowHours: 36,
      includeLiveFixtures: false, includeCompletedFixtures: false, maxFixturesPerRun: 1,
      maxProviderRequestsPerRun, maxAgenticResearchCallsPerRun: 1,
    },
  };
}
function odds(id: number, bookmaker: string, price: string) {
  return { fixture: { id }, bookmakers: [{ id: bookmaker, name: bookmaker, bets: [
    { id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: price }] },
  ] }] };
}
function fixture(id: number) {
  return { fixture: { id, date: '2026-09-23T18:00:00Z', status: { short: 'NS' } },
    league: { id: 359, name: 'League outside presets', country: 'Fiji', season: 2026 },
    teams: { home: { id: id * 2, name: `Home ${id}` }, away: { id: id * 2 + 1, name: `Away ${id}` } }, goals: {} };
}
function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200 }); }

describe('API-Football global date odds coverage', () => {
  it('merges fixture quotes across pages and preserves global coverage beyond fixture caps', async () => {
    const requests: URL[] = [];
    const persisted: CanonicalOddsSnapshot[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input)); requests.push(url);
      if (url.pathname === '/fixtures') return response({ response: [fixture(1), fixture(2)] });
      const page = Number(url.searchParams.get('page') ?? 1);
      return response({ paging: { current: page, total: 2 }, response: page === 1
        ? [odds(1, 'Regional', '1.09')]
        : [odds(1, 'Other', '1.08'), odds(2, 'Regional', '1.10')] });
    }) as typeof fetch;
    const provider = new ApiFootballProvider(config(), { persistOddsSnapshot: async (snapshot) => {
      persisted.push(snapshot); return snapshot;
    } });
    const result = await provider.getCanonicalOddsSlateForDate({ date: '2026-09-23', markets: ['h2h'] });
    assert.equal(result.fixtures.length, 2);
    assert.equal(result.snapshots.length, 2);
    assert.equal(persisted.length, 2);
    assert.deepEqual(result.snapshots[0].quotes.map((quote) => quote.price), [1.09, 1.08]);
    assert.equal(result.snapshots[0].bookmakerCount, 2);
    assert.equal((result.snapshots[0].metadata as any).providerSnapshotIds.length, 2);
    assert.deepEqual(result.coverage, { scope: 'provider-date-odds', date: '2026-09-23', timezone: 'America/Guatemala',
      pagesExpected: 2, pagesFetched: 2, oddsFixtureCount: 2, resolvedFixtureCount: 2,
      missingFixtureIds: [], fixturesWithoutRequestedMarkets: [], complete: true });
    const queries = requests.filter((url) => url.pathname === '/odds').map((url) => url.searchParams);
    assert.deepEqual(queries.map((q) => q.get('page')), ['1', '2']);
    for (const query of queries) {
      assert.equal(query.get('date'), '2026-09-23');
      assert.equal(query.get('timezone'), 'America/Guatemala');
      assert.equal(query.get('bet'), '1');
      assert.equal(query.has('bookmaker'), false);
      assert.equal(query.has('league'), false);
    }
  });

  it('uses explicit page 1 when the implicit first page reports a different total', async () => {
    const requests: URL[] = [];
    const persisted: CanonicalOddsSnapshot[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input)); requests.push(url);
      if (url.pathname === '/fixtures') return response({ response: Array.from({ length: 9 }, (_, i) => fixture(i + 1)) });
      // Observed provider divergence: the omitted page parameter reports 8 while
      // explicit pages report 9. The implicit-only row must never escape.
      if (!url.searchParams.has('page')) return response({ paging: { current: 1, total: 8 }, response: [odds(99, 'Implicit', '1.02')] });
      const page = Number(url.searchParams.get('page'));
      return response({ paging: { current: page, total: 9 }, response: [odds(page, 'Explicit', '1.09')] });
    }) as typeof fetch;
    const provider = new ApiFootballProvider(config(), { persistOddsSnapshot: async (snapshot) => {
      persisted.push(snapshot); return snapshot;
    } });

    const result = await provider.getCanonicalOddsSlateForDate({ date: '2026-09-23', markets: ['h2h'] });

    const queries = requests.filter((url) => url.pathname === '/odds').map((url) => Object.fromEntries(url.searchParams));
    assert.deepEqual(queries, Array.from({ length: 9 }, (_, index) => ({
      date: '2026-09-23', timezone: 'America/Guatemala', bet: '1', page: String(index + 1),
    })));
    assert.equal(result.coverage?.complete, true);
    assert.equal(result.coverage?.pagesExpected, 9);
    assert.equal(result.coverage?.pagesFetched, 9);
    assert.equal(result.coverage?.oddsFixtureCount, 9);
    assert.equal(persisted.length, 9);
    assert.ok(persisted.every((snapshot) => snapshot.quotes.length === 1
      && snapshot.quotes[0].bookmaker === 'Explicit' && snapshot.quotes[0].price === 1.09));
    assert.deepEqual(result.fixtures.map((item) => item.providerFixtureId), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('marks unresolved provider fixtures as incomplete rather than silently skipping them', async () => {
    globalThis.fetch = (async (input) => new URL(String(input)).pathname === '/fixtures'
      ? response({ response: [fixture(1)] })
      : response({ paging: { current: 1, total: 1 }, response: [odds(1, 'Regional', '1.09'), odds(2, 'Regional', '1.08')] })) as typeof fetch;
    const result = await new ApiFootballProvider(config()).getCanonicalOddsSlateForDate({ date: '2026-09-23' });
    assert.equal(result.coverage?.complete, false);
    assert.deepEqual(result.coverage?.missingFixtureIds, ['2']);
    assert.equal(result.snapshots.length, 1);
  });

  it('reports a successfully empty provider slate without per-fixture requests', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return response({ paging: { current: 1, total: 1 }, response: [] }); }) as typeof fetch;
    const result = await new ApiFootballProvider(config()).getCanonicalOddsSlateForDate({ date: '2026-09-23' });
    assert.equal(calls, 1);
    assert.equal(result.coverage?.complete, true);
    assert.equal(result.coverage?.oddsFixtureCount, 0);
  });

  it('does not spend the remaining budget on a scan that cannot fetch all pages without a runtime', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return response({ paging: { current: 1, total: 3 }, response: [odds(1, 'Regional', '1.09')] }); }) as typeof fetch;
    await assert.rejects(() => new ApiFootballProvider(config(2)).getCanonicalOddsSlateForDate({ date: '2026-09-23' }), /Incomplete odds coverage.*request budget/);
    assert.equal(calls, 1);
  });

  it('rejects repeated, empty, or inconsistent subsequent pages instead of claiming complete coverage', async () => {
    for (const broken of [
      { paging: { current: 1, total: 2 }, response: [odds(2, 'Regional', '1.08')] },
      { paging: { current: 2, total: 2 }, response: [] },
      { paging: { current: 2, total: 3 }, response: [odds(2, 'Regional', '1.08')] },
      { paging: { total: 2 }, response: [odds(2, 'Regional', '1.08')] },
    ]) {
      let calls = 0;
      globalThis.fetch = (async () => response(++calls === 1
        ? { paging: { current: 1, total: 2 }, response: [odds(1, 'Regional', '1.09')] }
        : broken)) as typeof fetch;
      await assert.rejects(() => new ApiFootballProvider(config()).getCanonicalOddsSlateForDate({ date: '2026-09-23' }), /coverage cannot be verified/);
      assert.equal(calls, 2);
    }
  });

  it('does not apply winner-only API filtering to a broader analysis market request', async () => {
    globalThis.fetch = (async (input) => {
      assert.equal(new URL(String(input)).searchParams.has('bet'), false);
      return response({ paging: { current: 1, total: 1 }, response: [] });
    }) as typeof fetch;
    await new ApiFootballProvider(config()).getCanonicalOddsSlateForDate({ date: '2026-09-23', markets: ['h2h', 'double_chance'] });
  });
});
