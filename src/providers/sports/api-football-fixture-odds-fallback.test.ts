import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { Fixture } from '../../domain/fixtures.js';
import type { RuntimeContext } from '../../runtime/context.js';
import { ApiFootballProvider } from './api-football.js';
import type { ApiFootballPersistence, ApiFootballProviderConfig, CanonicalOddsSnapshot } from './types.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('fixture-empty odds recovery', () => {
  it('recovers only the requested fixture from fresh league/date pages with exact provenance and bookmaker scope', async () => {
    const requests: URL[] = [];
    const captured: unknown[] = [];
    let persisted: CanonicalOddsSnapshot | undefined;
    globalThis.fetch = (async (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.searchParams.has('fixture')) return response([]);
      if (url.searchParams.get('page') === '1') return response([oddsRow('other', 1.99)], 1, 2);
      return response([oddsRow('1638288', 1.07), oddsRow('other', 1.99)], 2, 2);
    }) as typeof fetch;
    const provider = new ApiFootballProvider(config({ bookmakerAllowlist: ['Bet365'] }), {
      providerId: 'provider-id',
      resolveFixtureByProviderFixtureId: async () => fixture({ scheduledAt: '2026-09-23T01:00:00.000Z' }),
      snapshotSink: { capture: async (snapshot) => { captured.push(snapshot); return { id: `snapshot-${captured.length}` }; } },
      persistOddsSnapshot: async (snapshot) => { persisted = snapshot; return snapshot; },
    });

    const snapshot = await provider.getCanonicalOddsSnapshot({ fixtureId: '1638288', markets: ['h2h'] });

    assert.equal(requests.length, 3);
    assert.deepEqual(Object.fromEntries(requests[1].searchParams), {
      date: '2026-09-22', league: '525', season: '2026', timezone: 'America/Guatemala', bet: '1', page: '1',
    });
    assert.equal(requests[2].searchParams.get('page'), '2');
    assert.equal(snapshot, persisted);
    assert.equal(snapshot.providerSnapshotId, 'snapshot-3');
    assert.equal(snapshot.quotes.length, 3);
    assert.equal(snapshot.quotes[0].price, 1.07);
    assert.ok(snapshot.quotes.every((quote) => quote.fixtureId === 'fixture-1638288' && quote.bookmaker === 'Bet365'
      && quote.sourceSnapshotId === 'snapshot-3' && quote.capturedAt === snapshot.capturedAt));
    assert.equal(snapshot.marketReferenceQuotes?.length, 6);
    assert.equal((snapshot.metadata as any).marketReferenceBookmakerCount, 2);
    assert.deepEqual((snapshot.metadata as any).fixtureOddsFallback, {
      query: { date: '2026-09-22', league: 525, season: 2026, timezone: 'America/Guatemala', bet: 1 },
      emptyFixtureSnapshotIds: ['snapshot-1'], pagesExpected: 2, pagesFetched: 2,
      providerSnapshotIds: ['snapshot-2', 'snapshot-3'], matchedFixture: true,
    });
  });

  it('preserves the full-market query and filters requested markets after recovery', async () => {
    const requests: URL[] = [];
    globalThis.fetch = (async (input) => {
      const url = requestUrl(input);
      requests.push(url);
      return response(url.searchParams.has('fixture') ? [] : [oddsRow('1638288')]);
    }) as typeof fetch;
    const snapshot = await provider().getCanonicalOddsSnapshot({ fixtureId: '1638288', markets: ['h2h', 'double_chance'] });
    assert.ok(requests.every((url) => !url.searchParams.has('bet')));
    assert.ok(snapshot.quotes.some((quote) => quote.market === 'double_chance'));
    assert.ok(snapshot.quotes.some((quote) => quote.market === 'h2h'));
  });

  it('returns no quotes when the successful fallback has only other fixtures', async () => {
    globalThis.fetch = (async (input) => response(requestUrl(input).searchParams.has('fixture') ? [] : [oddsRow('other')])) as typeof fetch;
    const snapshot = await provider().getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    assert.deepEqual(snapshot.quotes, []);
    assert.deepEqual(snapshot.marketReferenceQuotes, []);
    assert.equal((snapshot.metadata as any).fixtureOddsFallback.matchedFixture, false);
  });

  it('does not broaden discovery when the fixture scope is missing or invalid', async () => {
    let requests = 0;
    globalThis.fetch = (async () => { requests++; return response([]); }) as typeof fetch;
    for (const invalid of [{ leagueId: undefined }, { season: undefined }, { scheduledAt: 'invalid' }]) {
      const snapshot = await provider({}, fixture(invalid)).getCanonicalOddsSnapshot({ fixtureId: '1638288' });
      assert.deepEqual(snapshot.quotes, []);
      assert.equal((snapshot.metadata as any).fixtureOddsFallback.skipped, 'fixture-scope-unavailable');
    }
    assert.equal(requests, 3);
  });

  it('does not retry a nonempty fixture response whose markets produce no quotes', async () => {
    let requests = 0;
    globalThis.fetch = (async () => { requests++; return response([{ fixture: { id: '1638288' }, bookmakers: [] }]); }) as typeof fetch;
    const snapshot = await provider().getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    assert.equal(requests, 1);
    assert.deepEqual(snapshot.quotes, []);
  });

  it('propagates HTTP and provider errors without treating them as empty odds', async () => {
    for (const failure of [
      () => new Response(JSON.stringify({ response: [] }), { status: 503 }),
      () => new Response(JSON.stringify({ errors: { season: 'The season field is required.' }, response: [] }), { status: 200 }),
    ]) {
      let requests = 0;
      globalThis.fetch = (async () => { requests++; return failure(); }) as typeof fetch;
      await assert.rejects(() => provider().getCanonicalOddsSnapshot({ fixtureId: '1638288' }));
      assert.equal(requests, 1);
    }
    let requests = 0;
    globalThis.fetch = (async () => ++requests === 1 ? response([])
      : new Response(JSON.stringify({ errors: { rateLimit: 'Too many requests.' }, response: [] }), { status: 200 })) as typeof fetch;
    await assert.rejects(() => provider().getCanonicalOddsSnapshot({ fixtureId: '1638288' }));
    assert.equal(requests, 2);
  });

  it('requires complete fallback pagination and preserves the shared request budget', async () => {
    let requests = 0;
    globalThis.fetch = (async () => ++requests === 1 ? response([]) : response([oddsRow('1638288')], 1, 3)) as typeof fetch;
    const shared = runtime(3);
    await assert.rejects(() => provider({}, fixture(), shared).getCanonicalOddsSnapshot({ fixtureId: '1638288' }), /Incomplete odds coverage/);
    assert.equal(requests, 2);
    assert.equal(shared.providerRequestCount, 2);

    requests = 0;
    globalThis.fetch = (async () => ++requests === 1 ? response([])
      : requests === 2 ? response([oddsRow('1638288')], 1, 2) : response([], 2, 2)) as typeof fetch;
    await assert.rejects(() => provider().getCanonicalOddsSnapshot({ fixtureId: '1638288' }), /full coverage cannot be verified/);
    assert.equal(requests, 3);
  });

  it('deduplicates concurrent fallback pages in one runtime but never reuses completed odds', async () => {
    const shared = runtime();
    const requests: URL[] = [];
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const start = new Promise<void>((resolve) => { started = resolve; });
    let hold = true;
    globalThis.fetch = (async (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.searchParams.has('fixture')) return response([]);
      if (hold) { started(); await waiting; }
      return response([oddsRow('1638288'), oddsRow('1638289', 1.05)]);
    }) as typeof fetch;
    const first = provider({}, fixture(), shared).getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    const second = provider({}, fixture({ id: 'fixture-1638289', providerFixtureId: '1638289' }), shared)
      .getCanonicalOddsSnapshot({ fixtureId: '1638289' });
    await start;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requests.filter((url) => !url.searchParams.has('fixture')).length, 1);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.quotes[0].price, 1.07);
    assert.equal(b.quotes[0].price, 1.05);
    assert.equal(shared.providerRequestCount, 3);
    hold = false;
    await provider({}, fixture(), shared).getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    assert.equal(shared.providerRequestCount, 5);
  });

  it('isolates concurrent recovery by API account and runtime, and evicts failures', async () => {
    const shared = runtime();
    const requests: URL[] = [];
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    globalThis.fetch = (async (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.searchParams.has('fixture')) return response([]);
      await waiting;
      return new Response(JSON.stringify({ errors: { rateLimit: 'Too many requests.' }, response: [] }), { status: 200 });
    }) as typeof fetch;
    const first = provider({}, fixture(), shared).getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    const second = provider({}, fixture(), shared, 'other-account').getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    const third = provider({}, fixture(), runtime()).getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    const failures = Promise.allSettled([first, second, third]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requests.filter((url) => !url.searchParams.has('fixture')).length, 3);
    release();
    assert.ok((await failures).every((result) => result.status === 'rejected'));
    globalThis.fetch = (async (input) => response(requestUrl(input).searchParams.has('fixture') ? [] : [oddsRow('1638288')])) as typeof fetch;
    const recovered = await provider({}, fixture(), shared).getCanonicalOddsSnapshot({ fixtureId: '1638288' });
    assert.equal(recovered.quotes[0].price, 1.07);
  });
});

function provider(overrides: Partial<ApiFootballProviderConfig['apiFootball']> = {}, stored = fixture(), shared?: RuntimeContext, key = 'test-key') {
  const persistence: ApiFootballPersistence = { resolveFixtureByProviderFixtureId: async () => stored };
  return new ApiFootballProvider({ ...config(overrides), apiFootballKey: key }, persistence, shared);
}

function config(overrides: Partial<ApiFootballProviderConfig['apiFootball']> = {}): ApiFootballProviderConfig {
  return {
    apiFootballKey: 'test-key', apiFootballBaseUrl: 'https://v3.football.api-sports.io',
    apiFootball: {
      defaultSeason: 2026, defaultSeasonInferred: false, timezone: 'America/Guatemala',
      leaguePresetsPath: 'config/league-presets.test.json', bookmakerPresetsPath: 'config/bookmaker-presets.test.json',
      defaultLeagues: [], defaultTeams: [], defaultMarkets: ['h2h'], lowOddsThreshold: 1.1,
      kickoffWindowHours: 36, includeLiveFixtures: false, includeCompletedFixtures: false,
      maxFixturesPerRun: 10, maxProviderRequestsPerRun: 500, maxAgenticResearchCallsPerRun: 10, ...overrides,
    },
  };
}

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-1638288', provider: 'api-football', providerFixtureId: '1638288', leagueId: 525, season: 2026,
    homeTeamId: 'home', awayTeamId: 'away', scheduledAt: '2026-09-22T19:00:00.000Z', status: 'scheduled',
    includedByFilters: [], createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z', ...overrides,
  };
}

function runtime(limit = 100): RuntimeContext {
  return {
    sessionPath: 'session.jsonl', artifactRoot: '.artifacts/test', profile: 'standard', approvalMode: 'manual',
    providerAgentic: 'codex', providerSports: 'api-football', model: 'test-model', providerRequestCount: 0,
    providerRequestLimit: limit,
  };
}

function oddsRow(id: string, home = 1.07) {
  return { fixture: { id }, bookmakers: ['Bet365', 'Other Book'].map((name, index) => ({
    id: index + 1, name, bets: [
      { id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: String(home) }, { value: 'Draw', odd: '9.0' }, { value: 'Away', odd: '17.0' }] },
      { id: 12, name: 'Double Chance', values: [{ value: 'Home/Draw', odd: '1.02' }] },
    ],
  })) };
}

function requestUrl(input: string | URL | Request) { return new URL(input instanceof Request ? input.url : String(input)); }
function response(rows: unknown[], current = 1, total = 1) {
  return new Response(JSON.stringify({ errors: [], paging: { current, total }, response: rows }), { status: 200 });
}
