import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildResearchFixturePrompt, buildScorePredictionPrompt, RESEARCH_FIXTURE_PROMPT_VERSION } from './prompts.js';
import type { Fixture } from '../domain/fixtures.js';
import { detectMonetaryAction } from '../security/no-monetary-actions.js';

const fixture: Fixture = {
  id: 'fixture-1',
  provider: 'api-football',
  providerFixtureId: '1001',
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  scheduledAt: '2026-04-26T18:00:00.000Z',
  status: 'scheduled',
  includedByFilters: ['manual-include'],
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:00:00.000Z',
};

describe('research prompts', () => {
  it('keeps research factual readiness separate from downstream estimation and service calibration', () => {
    const research = buildResearchFixturePrompt({ fixture, web: 'live', runId: 'run', createdAt: fixture.createdAt });
    assert.match(research, /factual evidence is ready for scoring/);
    assert.match(research, /material factual gap or conflict prevents reliable use/);
    assert.match(research, /do not use their absence alone as a research review reason/);
    const score = buildScorePredictionPrompt();
    assert.match(score, /uncalibrated, evidence-grounded event estimate before service-side calibration/);
    assert.match(score, /does not by itself prevent an evidence-grounded, explicitly uncertain model estimate/);
    assert.match(score, /The service applies empirical calibration and its existing sample-size and promotion gates afterward/);
    assert.match(score, /If the evidence cannot support a defensible estimate, retain probability\/modelProbability=null/);
    assert.doesNotMatch(score, /as your calibrated model estimate/);
  });

  it('exports the research fixture prompt version', () => {
    assert.equal(RESEARCH_FIXTURE_PROMPT_VERSION, 'research-fixture-v2');
  });

  it('requires JSON-only structured research with evidence references', () => {
    const prompt = buildResearchFixturePrompt({
      fixture,
      web: 'live',
      runId: 'run-1',
      createdAt: '2026-04-25T12:00:00.000Z',
    });

    assert.match(prompt, /Return only valid JSON starting with "\{"/);
    assert.match(prompt, /sources/);
    assert.match(prompt, /evidenceItems/);
    assert.match(prompt, /claims/);
    assert.match(prompt, /Every EvidenceItem\.sourceId/);
    assert.match(prompt, /Every Claim\.evidenceIds/);
    assert.match(prompt, /include at least one source with type "web-search" in the returned JSON/);
    assert.match(prompt, /research-fixture-v2/);
    assert.match(prompt, /fixtureStatistics/);
    assert.match(prompt, /Use API-Football fixture, statistics, and odds context/);
    assert.match(prompt, /gateResult\.verdict to "promotable"/);
    assert.match(prompt, /gateResult\.verdict to "review-required"/);
    assert.match(prompt, /gateResult\.verdict to "blocked"/);
    assert.match(prompt, /structured research generated with sufficient evidence/);
    assert.match(prompt, /Monetary safety/);
    assert.match(prompt, /analytical artifacts only/);
  });

  it('keeps score prompts analytical-only for monetary safety', () => {
    const prompt = buildScorePredictionPrompt();

    assert.match(prompt, /Monetary safety/);
    assert.match(prompt, /analytical artifacts only/);
    assert.match(prompt, /starting with "\{" as the first character/);
    assert.match(prompt, /conservative high-probability alternatives/);
    assert.match(prompt, /under 3\.0\/3\.25\/3\.5/);
    assert.match(prompt, /promotable=false/);
    assert.match(prompt, /same directional thesis/);
    assert.match(prompt, /main failure scenario/);
    assert.match(prompt, /Never copy probability into confidence/);
  });

  it('exposes BTTS quotes even when bookmaker duplicates fill the first 40 records', () => {
    const base = { fixtureId: 'fixture-1', market: 'h2h' as const, selection: 'home', price: 1.8, impliedProbability: 1 / 1.8, capturedAt: fixture.createdAt, sourceSnapshotId: 'snapshot' };
    const prompt = buildResearchFixturePrompt({
      fixture, web: 'live', runId: 'run', createdAt: fixture.createdAt,
      oddsSnapshot: { fixtureId: fixture.id, providerFixtureId: fixture.providerFixtureId, providerSnapshotId: 'snapshot', capturedAt: fixture.createdAt, bookmakerCount: 45, payloadHash: 'hash',
        quotes: [...Array.from({ length: 45 }, (_, i) => ({ ...base, bookmaker: `book-${i}` })), { ...base, market: 'btts', selection: 'yes' }],
      },
    });
    const payload = JSON.parse(prompt.split('\nInput:\n')[1]);
    assert.deepEqual(payload.oddsSnapshot.availableMarkets, ['h2h', 'btts']);
    assert.deepEqual(payload.oddsSnapshot.quotes.map((q: any) => q.market), ['h2h', 'btts']);
    assert.equal(payload.oddsSnapshot.originalQuoteCount, 46);
    assert.match(prompt, /exact fixture date/);
    assert.match(prompt, /exclude target-fixture results, post-match reports/);
  });

  it('separates live collection time from strict historical availability', () => {
    const startedAt = '2026-04-25T12:00:00.000Z';
    const contextCapturedAt = '2026-04-25T12:00:03.000Z';
    const make = (target: typeof fixture) => buildResearchFixturePrompt({
      fixture: target, web: 'live', runId: 'run', createdAt: startedAt, contextCapturedAt,
    });
    const live = make(fixture);
    const liveTiming = JSON.parse(live.split('\nInput:\n')[1]).researchTiming;
    assert.deepEqual(liveTiming, {
      mode: 'live-prematch', startedAt, contextCapturedAt,
      kickoffExclusive: fixture.scheduledAt, historicalAsOf: null,
    });
    assert.match(live, /Normal API capture after execution start does not make pre-match evidence future information/);
    assert.match(live, /if kickoff passes during live research, do not promote/);
    const historical = make({ ...fixture, status: 'completed', scheduledAt: '2026-04-24T18:00:00.000Z' });
    const historicalTiming = JSON.parse(historical.split('\nInput:\n')[1]).researchTiming;
    assert.equal(historicalTiming.mode, 'historical');
    assert.equal(historicalTiming.historicalAsOf, '2026-04-24T18:00:00.000Z');
    assert.match(historical, /A later retrieval timestamp or a backdated statistics query does not prove historical availability/);
    const staleScheduled = make({ ...fixture, scheduledAt: startedAt });
    assert.equal(JSON.parse(staleScheduled.split('\nInput:\n')[1]).researchTiming.mode, 'historical');
  });

  it('sanitizes negated monetary warnings before scoring guard checks', () => {
    const prompt = buildScorePredictionPrompt({
      runId: 'run-1',
      createdAt: '2026-05-27T00:00:00.000Z',
      web: 'live',
      requiredMarkets: ['h2h'],
      marketFocus: ['h2h'],
      fixture,
      fixtureStatistics: null,
      oddsSnapshot: { fixtureId: 'fixture-1' },
      researchBundle: {
        id: 'bundle-1',
        warnings: [
          'Do not treat this analytical artifact as an instruction to place bets or move money.',
          'Do not treat this research as betting instruction or a recommendation to place a wager.',
        ],
      },
      sources: [],
      evidenceItems: [],
      claims: [],
      allowedQuotes: [],
      providerContextWarnings: [],
    });

    const monetary = detectMonetaryAction(prompt);

    assert.equal(monetary.blocked, false);
    assert.doesNotMatch(prompt, /place a wager|move money|place bets/i);
  });
});
