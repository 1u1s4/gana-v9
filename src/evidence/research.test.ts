import { inMemoryRunStore, parentRun, runInTestScope } from '../runtime/run-lifecycle.test-support.js';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import type { Fixture } from '../domain/fixtures.js';
import type { CanonicalOddsSnapshot, FixtureStatistics } from '../providers/sports/types.js';
import { runFixtureResearch } from './research.js';
import type { ResearchBundle } from './types.js';
import { hashPayload } from '../runtime/artifacts.js';

const createdAt = new Date('2026-04-25T12:00:00.000Z');

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

const fixtureStatistics: FixtureStatistics = {
  providerFixtureId: '1001',
  cornersHome: 4,
  cornersAway: 6,
  totalCorners: 10,
  capturedAt: createdAt.toISOString(),
  providerSnapshotId: 'provider-statistics-snapshot-1',
};

const oddsSnapshot: CanonicalOddsSnapshot = {
  fixtureId: 'fixture-1',
  providerFixtureId: '1001',
  providerSnapshotId: 'provider-odds-snapshot-1',
  oddsSnapshotId: 'odds-snapshot-1',
  capturedAt: createdAt.toISOString(),
  bookmakerCount: 1,
  payloadHash: 'odds-payload-hash',
  quotes: [{
    fixtureId: 'fixture-1',
    market: 'goals_over_under',
    selection: 'over',
    line: 2.5,
    price: 1.72,
    impliedProbability: 0.5813953488372093,
    bookmaker: 'Example Book',
    capturedAt: createdAt.toISOString(),
    sourceSnapshotId: 'provider-odds-snapshot-1',
  }],
};

function config() {
  return loadConfig({
    artifactRoot: mkdtempSync(join(tmpdir(), 'gana-research-test-')),
    provider: 'codex',
    model: 'gpt-5.5',
    nativeWebSearch: true,
    nativeWebSearchMode: 'live',
  }, { skipApiKey: true });
}

function agentOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    sources: [{
      id: 'source-web-1',
      type: 'web-search',
      url: 'https://example.com/team-news',
      title: 'Team news',
      capturedAt: createdAt.toISOString(),
    }],
    evidenceItems: [{
      id: 'evidence-1',
      sourceId: 'source-web-1',
      claimIds: ['claim-1'],
      summary: 'Current team news supports the claim.',
      confidence: 0.8,
    }],
    claims: [{
      id: 'claim-1',
      statement: 'Home team has current availability concerns.',
      subject: { type: 'fixture', id: 'fixture-1' },
      supportLevel: 'supported',
      evidenceIds: ['evidence-1'],
      conflictStatus: 'none',
    }],
    gateResult: {
      verdict: 'review-required',
      reasons: ['research generated'],
      warnings: [],
    },
    warnings: [],
    ...overrides,
  });
}

function emitNativeWebSearch(options: any, query = 'fixture 1001 team news injuries') {
  options?.onEvent?.({
    type: 'tool_call',
    name: 'web_search',
    callId: `web-${query}`,
    args: { query },
  });
  options?.onEvent?.({
    type: 'tool_result',
    name: 'web_search',
    callId: `web-${query}`,
    output: `Search completed: ${query}`,
  });
}

describe('runFixtureResearch', () => {
  it('timestamps provider context after collection without backdating capture or freezing live research at startup', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let current = createdAt;
    let capturedPrompt: any;
    const contextCapturedAt = '2026-04-25T12:00:03.000Z';
    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => current,
      provider: {
        getFixture: async () => fixture,
        getCanonicalOddsSnapshot: async () => {
          current = new Date(contextCapturedAt);
          return { ...oddsSnapshot, capturedAt: contextCapturedAt };
        },
      },
      agentRunner: async (_config, prompt, options) => {
        assert.equal(typeof prompt, 'string');
        if (typeof prompt !== 'string') throw new Error('Research prompt must be a string');
        capturedPrompt = JSON.parse(prompt.split('\nInput:\n')[1]);
        emitNativeWebSearch(options);
        return { text: agentOutput(), usage: {}, output: agentOutput() };
      },
      persistBundle: async () => {},
    });
    assert.equal(capturedPrompt.createdAt, createdAt.toISOString());
    assert.equal(capturedPrompt.researchTiming.contextCapturedAt, contextCapturedAt);
    assert.equal(capturedPrompt.researchTiming.mode, 'live-prematch');
    assert.equal(capturedPrompt.researchTiming.historicalAsOf, null);
    assert.deepEqual(result.bundle?.metadata?.researchTiming, capturedPrompt.researchTiming);
    assert.equal(result.bundle?.sources.find((source) => source.id === 'source_api_football_fixture')?.capturedAt, contextCapturedAt);
    assert.equal(result.bundle?.sources.find((source) => source.id === 'source_api_football_odds_snapshot')?.capturedAt, contextCapturedAt);
  });

  it('keeps the Codex response schema strict-compatible for claim subjects', () => {
    const schema = JSON.parse(readFileSync('skills/research-fixture-v2/output.schema.json', 'utf8'));
    const subject = schema.properties.claims.items.properties.subject;

    assert.deepEqual(subject.required, ['type', 'id', 'market']);
    assert.deepEqual(subject.properties.market.type, ['string', 'null']);
    const sourceSchema = schema.properties.sources.items;
    assert.ok(sourceSchema.required.includes('url'));
    assert.deepEqual(sourceSchema.properties.url.type, ['string', 'null']);
  });

  it('persists a promotable research bundle from strict agent JSON', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: string[] = [];
    let requiredWeb = false;

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        requiredWeb = options?.nativeWebSearchRequirement?.required ?? false;
        emitNativeWebSearch(options);
        return { text: agentOutput(), usage: {}, output: agentOutput() };
      },
      persistBundle: async (bundle) => {
        persisted.push(bundle.id);
      },
    });

    assert.equal(result.ok, true);
    assert.equal(requiredWeb, true);
    assert.equal(result.bundle?.promptVersion, 'research-fixture-v2');
    assert.equal(result.bundle?.sources.some((source) => source.type === 'api-football'), true);
    assert.equal(result.bundle?.sources.some((source) => source.type === 'web-search'), true);
    assert.equal(persisted.length, 1);
    assert.ok(result.artifactPath);
    const artifact = JSON.parse(readFileSync(result.artifactPath!, 'utf8'));
    assert.ok(Array.isArray(artifact.warnings));
    assert.deepEqual(artifact.warnings, artifact.gateResult.warnings);
  });

  it('passes completed-fixture statistics and odds into an audit research prompt', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let prompt = '';
    let statisticsRequested = false;
    let oddsRequested = false;

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: {
        getFixture: async () => ({ ...fixture, status: 'completed', scheduledAt: '2026-04-24T18:00:00.000Z' }),
        getFixtureStatistics: async () => {
          statisticsRequested = true;
          return fixtureStatistics;
        },
        getCanonicalOddsSnapshot: async () => {
          oddsRequested = true;
          return oddsSnapshot;
        },
      },
      agentRunner: async (_config, input, options) => {
        prompt = typeof input === 'string' ? input : JSON.stringify(input);
        emitNativeWebSearch(options);
        return { text: agentOutput(), usage: {}, output: agentOutput() };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(statisticsRequested, true);
    assert.equal(oddsRequested, true);
    assert.match(prompt, /"fixtureStatistics"/);
    assert.match(prompt, /"totalCorners": 10/);
    assert.match(prompt, /"oddsSnapshot"/);
    assert.match(prompt, /"market": "goals_over_under"/);
    assert.equal(result.bundle?.sources.some((source) => source.id === 'source_api_football_fixture_statistics'), true);
    assert.equal(result.bundle?.sources.some((source) => source.id === 'source_api_football_odds_snapshot'), true);
  });

  it('passes recent results to the prompt and preserves canonical statistics provenance when the model reuses source IDs', async () => {
    const cfg = config();
    const statistic = {
      teamId: 42, leagueId: 39, season: 2026, date: '2026-04-24',
      providerSnapshotId: 'team-snapshot-42', capturedAt: createdAt.toISOString(),
      form: 'WWD', fixtures: { played: { total: 3 } }, goals: {}, cleanSheet: {}, failedToScore: {},
    };
    const response = JSON.parse(agentOutput());
    const historySourceId = 'source_api_football_league_history_39_2026_2026-04-24';
    const teamHistorySourceId = 'source_api_football_team_history_42_2026_2025-10-27_2026-04-24';
    const history = { leagueId: 39, season: 2026, from: '2026-01-01', to: '2026-04-24', capturedAt: createdAt.toISOString(),
      providerSnapshotId: 'history-snapshot', payloadHash: 'b'.repeat(64),
      fixtures: [{ providerFixtureId: 'prior-match', leagueId: 39, season: 2026, scheduledAt: '2026-04-20T18:00:00Z',
        providerHomeTeamId: '42', providerAwayTeamId: '49', homeTeamName: 'Home', awayTeamName: 'Away',
        providerStatus: 'FT' as const, scoreHome90: 1, scoreAway90: 0, venue: null, round: null }],
      coverage: { returnedFixtures: 1, includedFixtures: 1, excludedFixtures: 0, unknownRegulationScoreFixtures: 0 } };
    let promptInput: any;
    response.sources.push({ id: 'source_api_football_team_42', type: 'web-search',
      url: 'https://example.com/model-locator', externalId: 'model-locator', title: 'Model replacement',
      capturedAt: createdAt.toISOString(), metadata: {},
    });
    response.sources.push({ id: historySourceId, type: 'web-search', url: 'https://example.com/model-history',
      externalId: 'model-history', capturedAt: createdAt.toISOString(), metadata: {} });
    response.sources.push({ id: teamHistorySourceId, type: 'web-search', url: 'https://example.com/model-team-history',
      externalId: 'model-team-history', capturedAt: createdAt.toISOString(), metadata: {} });
    response.evidenceItems.push({ id: 'team-evidence', sourceId: 'source_api_football_team_42', claimIds: ['team-claim'], summary: 'Three games in the supplied sample.', confidence: 0.8 });
    response.claims.push({ id: 'team-claim', statement: 'The provider sample contains three games.', subject: { type: 'team', id: '42', market: null }, supportLevel: 'supported', evidenceIds: ['team-evidence'], conflictStatus: 'none' });
    const output = JSON.stringify(response);
    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, createRuntimeContext(cfg, 'source-provenance.jsonl'), {
      now: () => createdAt,
      provider: {
        getFixture: async () => ({ ...fixture, leagueId: 39, season: 2026, providerHomeTeamId: '42', providerAwayTeamId: '49' }),
        getTeamStatistics: async (query) => ({ ...statistic, teamId: query.team, providerSnapshotId: `team-snapshot-${query.team}`, date: query.date }),
        getCompletedLeagueFixtures: async () => history,
        getCompletedTeamFixtures: async (query) => ({
          teamId: query.team, seasons: query.seasons, from: query.from, to: query.to,
          capturedAt: createdAt.toISOString(), payloadHash: 'c'.repeat(64),
          providerSnapshotIds: query.seasons.map((season) => `team-history-${query.team}-${season}`),
          snapshots: query.seasons.map((season) => ({ season, capturedAt: createdAt.toISOString(),
            payloadHash: 'd'.repeat(64), providerSnapshotId: `team-history-${query.team}-${season}` })),
          fixtures: history.fixtures.map((match) => ({ ...match, leagueName: 'Premier League', leagueType: 'League' })),
          coverage: { ...history.coverage, complete: true, requestedSeasons: query.seasons, fetchedSeasons: query.seasons },
        }),
      },
      agentRunner: async (_config, input, options) => {
        if (typeof input !== 'string') throw new Error('Expected research prompt');
        promptInput = JSON.parse(input.split('\nInput:\n')[1]);
        assert.match(input, /descriptive records, not an official table/);
        emitNativeWebSearch(options); return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });
    assert.equal(result.ok, true);
    const source = result.bundle?.sources.find((item) => item.id === 'source_api_football_team_42');
    assert.equal(source?.type, 'api-football');
    assert.equal(source?.snapshotId, statistic.providerSnapshotId);
    assert.equal(source?.externalId, 'teams/statistics?team=42&league=39&season=2026&date=2026-04-24');
    assert.equal(source?.metadata?.cutoffDate, '2026-04-24');
    assert.equal(source?.hash, hashPayload({ ...statistic, sourceId: 'source_api_football_team_42' }));
    assert.equal(source?.url, undefined);
    assert.equal(result.bundle?.evidenceItems.find((item) => item.id === 'team-evidence')?.sourceId, source?.id);
    assert.equal(promptInput.recentPerformance.sourceId, historySourceId);
    assert.equal(promptInput.recentPerformance.teams[0].sample.home.played, 1);
    assert.equal(promptInput.recentPerformance.teams[0].recentMatches[0].opponentBeforeMatch.pointsPerMatch, null);
    const historySource = result.bundle?.sources.find((item) => item.id === historySourceId);
    assert.equal(historySource?.type, 'api-football');
    assert.equal(historySource?.snapshotId, history.providerSnapshotId);
    assert.equal(historySource?.hash, history.payloadHash);
    assert.equal(historySource?.url, undefined);
    assert.equal(historySource?.metadata?.cutoffDate, history.to);
    assert.equal(promptInput.recentTeamPerformance.length, 2);
    assert.equal(promptInput.recentTeamPerformance[0].recentMatches[0].sourceId, teamHistorySourceId);
    assert.equal(promptInput.recentTeamPerformance[0].recentMatches[0].providerFixtureId, 'prior-match');
    const teamHistorySource = result.bundle?.sources.find((item) => item.id === teamHistorySourceId);
    assert.equal(teamHistorySource?.type, 'api-football');
    assert.equal(teamHistorySource?.snapshotId, 'team-history-42-2026');
    assert.equal(teamHistorySource?.hash, 'd'.repeat(64));
    assert.equal(teamHistorySource?.url, undefined);
    assert.equal(teamHistorySource?.metadata?.cutoffDate, '2026-04-24');
  });

  it('downgrades live web research without a web-search source to review-required', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'source_api_football_fixture',
        claimIds: ['claim-1'],
        summary: 'Provider fixture context supports the claim.',
        confidence: 0.6,
      }],
      gateResult: {
        verdict: 'promotable',
        reasons: ['agent marked research promotable'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({ text: output, usage: {}, output }),
      persistBundle: async () => {},
    });

    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.equal(result.bundle?.sources.some((source) => source.type === 'web-search'), false);
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no real web-search source|no web-search source/);
  });

  it('requires a real native web-search tool call even when live output includes a web source', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      gateResult: {
        verdict: 'promotable',
        reasons: ['agent marked research promotable'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({ text: output, usage: {}, output }),
      persistBundle: async () => {},
    });

    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.equal(result.bundle?.sources.some((source) => source.type === 'web-search' && source.url), true);
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no real Codex web_search tool call was observed/);
  });

  it('surfaces an explicit browser fallback warning for live web providers without native search', async () => {
    const cfg = loadConfig({
      artifactRoot: mkdtempSync(join(tmpdir(), 'gana-research-test-')),
      provider: 'openrouter',
      model: 'openai/gpt-5.5',
      nativeWebSearch: false,
    }, { skipApiKey: true });
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      gateResult: {
        verdict: 'promotable',
        reasons: ['agent marked research promotable'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({ text: output, usage: {}, output }),
      persistBundle: async () => {},
    });

    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /OpenRouter\/browser fallback|no native web-search tool|browser fallback/i);
  });

  it('normalizes web-search capturedAt values before schema validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [{
        id: 'source-web-1',
        type: 'web-search',
        url: 'https://example.com/team-news',
        title: 'Team news',
        capturedAt: '2026-05-06T09:30:00-03:00',
      }, {
        id: 'source-web-2',
        type: 'web-search',
        url: 'https://example.com/match-preview',
        title: 'Match preview',
        capturedAt: 'x',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.sources.find((source) => source.id === 'source-web-1')?.capturedAt, '2026-05-06T12:30:00.000Z');
    assert.equal(result.bundle?.sources.find((source) => source.id === 'source-web-2')?.capturedAt, createdAt.toISOString());
  });

  it('keeps native search without a cited web page review-required', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'source_api_football_fixture',
        claimIds: ['claim-1'],
        summary: 'Provider fixture context supports the claim.',
        confidence: 0.7,
      }],
      gateResult: {
        verdict: 'promotable',
        reasons: ['agent marked research promotable with native web search'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        options?.onEvent?.({
          type: 'tool_call',
          name: 'web_search',
          callId: 'web-1',
          args: { query: 'fixture 1001 team news injuries' },
        });
        options?.onEvent?.({
          type: 'tool_result',
          name: 'web_search',
          callId: 'web-1',
          output: 'Search completed: fixture 1001 team news injuries',
        });
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    const synthetic = result.bundle?.sources.find((source) => source.id === 'source_native_web_search');
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.equal(synthetic?.type, 'web-search');
    assert.equal(synthetic?.metadata?.synthesized, true);
    assert.deepEqual(synthetic?.metadata?.queries, ['fixture 1001 team news injuries']);
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no real web-search source/);
  });

  it('retries live web research when the agent returns an empty tool-not-performed payload', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let attempts = 0;
    const emptyOutput = agentOutput({
      sources: [{
        id: 'local-note',
        type: 'db',
        externalId: 'noop',
        title: 'No-op',
        capturedAt: createdAt.toISOString(),
      }],
      evidenceItems: [],
      claims: [],
      gateResult: {
        verdict: 'review-required',
        reasons: ['Tool call not yet performed'],
        warnings: ['No valid external evidence gathered'],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        attempts += 1;
        if (attempts === 1) return { text: emptyOutput, usage: {}, output: emptyOutput };
        emitNativeWebSearch(options);
        const output = agentOutput({
          gateResult: {
            verdict: 'promotable',
            reasons: ['web evidence gathered on retry'],
            warnings: [],
          },
        });
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(attempts, 2);
    assert.equal(result.bundle?.gateResult.verdict, 'promotable');
    assert.equal(result.bundle?.claims.length, 1);
    assert.doesNotMatch(result.bundle?.gateResult.reasons.join('\n') ?? '', /Tool call not yet performed/);
  });

  it('accepts provider output with explanatory text around the JSON object', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = `I will return JSON now.\n${agentOutput()}\nDone.`;

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims.length, 1);
  });

  it('repairs evidence source ids omitted from the structured source list', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [{
        id: 'source_1',
        type: 'api-football',
        externalId: '1001',
        title: 'API-Football fixture snapshot',
        capturedAt: createdAt.toISOString(),
      }],
      evidenceItems: [
        {
          id: 'evidence_1',
          sourceId: 'source_4',
          claimIds: ['claim_1'],
          summary: 'Web result corroborates the away win.',
          confidence: 0.96,
        },
        {
          id: 'evidence_2',
          sourceId: 'source_2',
          claimIds: ['claim_2'],
          summary: 'Fixture statistics show a 4-6 corner split and 10 total corners.',
          confidence: 0.99,
        },
        {
          id: 'evidence_3',
          sourceId: 'source_3',
          claimIds: ['claim_3'],
          summary: 'Odds priced Junior slightly shorter in h2h and over 8.5 corners favored.',
          confidence: 0.93,
        },
      ],
      claims: [
        {
          id: 'claim_1',
          statement: 'The web result supports the fixture outcome.',
          subject: { type: 'fixture', id: 'fixture-1' },
          supportLevel: 'supported',
          evidenceIds: ['evidence_1'],
          conflictStatus: 'none',
        },
        {
          id: 'claim_2',
          statement: 'Fixture statistics list 10 total corners.',
          subject: { type: 'fixture', id: 'fixture-1' },
          supportLevel: 'supported',
          evidenceIds: ['evidence_2'],
          conflictStatus: 'none',
        },
        {
          id: 'claim_3',
          statement: 'Odds context supports h2h and corners market angles without material conflict.',
          subject: { type: 'market', market: 'h2h' },
          supportLevel: 'supported',
          evidenceIds: ['evidence_3'],
          conflictStatus: 'none',
        },
      ],
      gateResult: {
        verdict: 'review-required',
        reasons: ['without material conflict'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: {
        getFixture: async () => ({ ...fixture, status: 'completed', scheduledAt: '2026-04-24T18:00:00.000Z' }),
        getFixtureStatistics: async () => fixtureStatistics,
        getCanonicalOddsSnapshot: async () => oddsSnapshot,
      },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.equal(result.bundle?.sources.some((source) => source.id === 'source_4' && source.type === 'web-search'), true);
    assert.equal(result.bundle?.evidenceItems.find((item) => item.id === 'evidence_2')?.sourceId, 'source_api_football_fixture_statistics');
    assert.equal(result.bundle?.evidenceItems.find((item) => item.id === 'evidence_3')?.sourceId, 'source_api_football_odds_snapshot');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /synthesized omitted web-search source "source_4"/);
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped unknown evidence source "source_2"/);
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped unknown evidence source "source_3"/);
  });

  it('synthesizes omitted web sources when the missing source id identifies a web source', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [{
        id: 'web_source_1',
        type: 'web-search',
        url: 'https://example.com/team-news',
        title: 'Team news',
        capturedAt: createdAt.toISOString(),
      }],
      evidenceItems: [{
        id: 'evidence_1',
        sourceId: 'web_source_3',
        claimIds: ['claim_1'],
        summary: 'BTTS yes because both defenses have been vulnerable.',
        confidence: 0.8,
      }],
      claims: [{
        id: 'claim_1',
        statement: 'Both teams are expected to score.',
        subject: { type: 'market', id: 'fixture-1', market: 'btts' },
        supportLevel: 'supported',
        evidenceIds: ['evidence_1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.sources.some((source) => source.id === 'web_source_3' && source.type === 'web-search'), true);
    assert.match(result.bundle?.warnings.join('\n') ?? '', /synthesized omitted web-search source "web_source_3"/);
  });

  it('quarantines an unverified odds claim without manufacturing provider evidence', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      evidenceItems: [],
      claims: [{
        id: 'claim_h2h_home_odds',
        statement: 'The odds for the home win are 2.15 at Bet365.',
        subject: { type: 'market', id: 'fixture-1', market: 'h2h' },
        supportLevel: 'supported',
        evidenceIds: [],
        conflictStatus: 'none',
        metadata: { bookmaker: 'Bet365', price: 2.15 },
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: {
        getFixture: async () => fixture,
        getCanonicalOddsSnapshot: async () => oddsSnapshot,
      },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    const claim = result.bundle?.claims.find((item) => item.id === 'claim_h2h_home_odds');
    const evidence = result.bundle?.evidenceItems.find((item) => item.id === 'evidence_repaired_claim_h2h_home_odds');
    assert.equal(result.ok, true);
    assert.equal(claim, undefined);
    assert.equal(evidence, undefined);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.equal((result.bundle?.metadata?.unverifiedClaims as any[])?.[0]?.id, 'claim_h2h_home_odds');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /quarantined claim "claim_h2h_home_odds"/);
  });

  it('does not count an unsupported market claim as researched coverage', async () => {
    const cfg = config();
    const output = agentOutput({ claims: [{
      id: 'claim-1', statement: 'No reliable goal sample was found.',
      subject: { type: 'market', market: 'goals_over_under' }, supportLevel: 'unsupported',
      evidenceIds: ['evidence-1'], conflictStatus: 'none',
    }] });
    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live', markets: ['goals_over_under'], oddsSnapshot }, createRuntimeContext(cfg, 'session.jsonl'), {
      now: () => createdAt, provider: { getFixture: async () => fixture }, persistBundle: async () => {},
      agentRunner: async (_config, _input, options) => { emitNativeWebSearch(options); return { text: output, usage: {}, output }; },
    });
    const coverage = result.bundle?.metadata?.marketCoverage as any;
    assert.deepEqual(coverage.evidenceMarkets, []);
    assert.deepEqual(coverage.skippedMarkets, [{ market: 'goals_over_under', reason: 'missing market-specific research evidence' }]);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
  });

  it('requires cited evidence even when a real URL and native search are present', async () => {
    const cfg = config();
    const output = agentOutput({
      evidenceItems: [{ id: 'evidence-1', sourceId: 'source_api_football_fixture', claimIds: ['claim-1'], summary: 'Fixture identity only.', confidence: 0.8 }],
      gateResult: { verdict: 'promotable', reasons: ['Source listed'], warnings: [] },
    });
    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, createRuntimeContext(cfg, 'session.jsonl'), {
      now: () => createdAt, provider: { getFixture: async () => fixture }, persistBundle: async () => {},
      agentRunner: async (_config, _input, options) => { emitNativeWebSearch(options); return { text: output, usage: {}, output }; },
    });
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no real web-search source/);
  });

  it('restores a web URL from a real externalId, but rejects opaque placeholder locators', async () => {
    for (const externalId of ['https://example.com/real-page', 'web-search:source-web-1']) {
      const cfg = config();
      const output = agentOutput({
        sources: [{ id: 'source-web-1', type: 'web-search', url: null, externalId, capturedAt: createdAt.toISOString() }],
        gateResult: { verdict: 'promotable', reasons: ['Structured source'], warnings: [] },
      });
      const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, createRuntimeContext(cfg, 'session.jsonl'), {
        now: () => createdAt, provider: { getFixture: async () => fixture }, persistBundle: async () => {},
        agentRunner: async (_config, _input, options) => { emitNativeWebSearch(options); return { text: output, usage: {}, output }; },
      });
      assert.equal(result.bundle?.gateResult.verdict, externalId.startsWith('https:') ? 'promotable' : 'review-required');
      assert.equal(result.bundle?.sources.find((source) => source.id === 'source-web-1')?.url, externalId.startsWith('https:') ? externalId : undefined);
    }
  });

  it('repairs blank and null source locators before validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [{
        id: 'provider-snapshot-odds',
        type: 'provider-snapshot',
        url: '',
        title: 'API-Football odds snapshot',
        hash: null,
        metadata: { provider: 'api-football', providerFixtureId: '1001' },
      }, {
        id: 'api-football-fixture',
        type: 'api-football',
        url: null,
        title: 'API-Football fixture',
        hash: '',
        metadata: { provider: 'api-football', providerFixtureId: '1001' },
      }, {
        id: 'source-web-1',
        type: 'web-search',
        url: 'https://example.com/team-news',
        title: 'Team news',
        capturedAt: createdAt.toISOString(),
        hash: '',
      }],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'provider-snapshot-odds',
        claimIds: ['claim-1'],
        summary: 'Provider odds support the claim.',
        confidence: 0.8,
      }, {
        id: 'evidence-2',
        sourceId: 'source-web-1',
        claimIds: ['claim-1'],
        summary: 'Web source supports the claim.',
        confidence: 0.8,
      }],
      claims: [{
        id: 'claim-1',
        statement: 'The goals market is priced from current odds and web context.',
        subject: { type: 'market', id: 'fixture-1', market: 'goals_over_under' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1', 'evidence-2'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    const providerSource = result.bundle?.sources.find((source) => source.id === 'provider-snapshot-odds');
    const apiFootballSource = result.bundle?.sources.find((source) => source.id === 'api-football-fixture');
    const webSource = result.bundle?.sources.find((source) => source.id === 'source-web-1');
    assert.equal(result.ok, true);
    assert.equal(providerSource?.url, undefined);
    assert.equal(providerSource?.hash, undefined);
    assert.equal(providerSource?.capturedAt, createdAt.toISOString());
    assert.match(providerSource?.externalId ?? '', /^api-football:\/\//);
    assert.equal(apiFootballSource?.url, undefined);
    assert.equal(apiFootballSource?.hash, undefined);
    assert.match(apiFootballSource?.externalId ?? '', /^api-football:\/\//);
    assert.equal(webSource?.hash, undefined);
  });

  it('repairs source ids accidentally included in claim evidence references', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let sawAbortSignal = false;
    const output = agentOutput({
      claims: [{
        id: 'claim-1',
        statement: 'Home team has current availability concerns.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1', 'source-web-1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        sawAbortSignal = options?.signal instanceof AbortSignal;
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(sawAbortSignal, true);
    assert.deepEqual(result.bundle?.claims[0]?.evidenceIds, ['evidence-1']);
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped source reference "source-web-1"/);
  });

  it('repairs market claim subjects that use id instead of market', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      claims: [{
        id: 'claim-1',
        statement: 'The goals market leans over.',
        subject: { type: 'market', id: 'goals_over_under' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims[0]?.subject.market, 'goals_over_under');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped market subject id "goals_over_under"/);
  });

  it('repairs unsupported claim subject types before validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      claims: [{
        id: 'claim-1',
        statement: 'League standings show the teams are adjacent in the table.',
        subject: { type: 'league_standings', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims[0]?.subject.type, 'fixture');
    assert.equal(result.bundle?.claims[0]?.subject.id, 'fixture-1');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped invalid subject type "league_standings" to fixture/);
  });

  it('repairs missing research gate results conservatively before validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      gateResult: undefined,
      claims: [{
        id: 'claim-1',
        statement: 'The fixture context is supported by current sources.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped invalid or missing research gateResult "missing"/);
  });

  it('repairs non-schema conflict statuses to potential before validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      claims: [{
        id: 'claim-1',
        statement: 'A live source reports minor timing uncertainty.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'minor',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims[0]?.conflictStatus, 'potential');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped conflictStatus "minor" to "potential"/);
  });

  it('repairs common supportLevel aliases before validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      claims: [{
        id: 'claim-1',
        statement: 'Corners evidence is thinner than the core markets.',
        subject: { type: 'market', market: 'corners_over_under' },
        supportLevel: 'partially_supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims[0]?.supportLevel, 'partial');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped supportLevel "partially_supported" to "partial"/);
  });

  it('repairs human market subject labels such as match winner before validation', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      claims: [{
        id: 'claim-1',
        statement: 'Match winner odds show Talleres home win is priced near the market midpoint.',
        subject: { type: 'market', market: 'match winner' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims[0]?.subject.market, 'h2h');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /inferred market subject "h2h"/);
  });

  it('preserves review-required for objectively sufficient live research despite soft LLM review warnings', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = agentOutput({
      sources: [{
        id: 'source-web-1',
        type: 'web-search',
        url: 'https://example.com/team-news',
        title: 'Team news',
        capturedAt: createdAt.toISOString(),
      }, {
        id: 'source-web-2',
        type: 'web-search',
        url: 'https://example.com/match-preview',
        title: 'Match preview',
        capturedAt: createdAt.toISOString(),
      }],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'source-web-1',
        claimIds: ['claim-1'],
        summary: 'Current team news supports the fixture context.',
        confidence: 0.82,
      }, {
        id: 'evidence-2',
        sourceId: 'source-web-2',
        claimIds: ['claim-2'],
        summary: 'Current market preview supports the odds context.',
        confidence: 0.78,
      }],
      claims: [{
        id: 'claim-1',
        statement: 'Home team context is supported by current reporting.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }, {
        id: 'claim-2',
        statement: 'The goals market context is supported by current reporting.',
        subject: { type: 'market', market: 'goals_over_under' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-2'],
        conflictStatus: 'none',
      }],
      gateResult: {
        verdict: 'review-required',
        reasons: ['Hay evidencia descriptiva de cuotas, pero evidencia estadística insuficiente para promover conclusiones predictivas'],
        warnings: ['fixture-statistics context is incomplete, so tactical confidence remains limited', 'odds-led lean'],
      },
      warnings: ['fixture-statistics context is incomplete, so tactical confidence remains limited', 'odds-led lean'],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /odds-led lean/);
  });

  it('preserves review-required for live research with positive no-conflict reasons and reference repair warnings', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session-research-no-conflict');
    const output = agentOutput({
      sources: [{
        id: 'source-web-1',
        type: 'web-search',
        url: 'https://example.com/team-news',
        title: 'Team news',
        capturedAt: createdAt.toISOString(),
      }, {
        id: 'source-web-2',
        type: 'web-search',
        url: 'https://example.com/match-preview',
        title: 'Match preview',
        capturedAt: createdAt.toISOString(),
      }],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'source-web-1',
        claimIds: ['claim-1'],
        summary: 'Current fixture context is confirmed.',
        confidence: 0.9,
      }, {
        id: 'evidence-2',
        sourceId: 'source-web-2',
        claimIds: ['claim-2'],
        summary: 'Current market context is confirmed.',
        confidence: 0.88,
      }],
      claims: [{
        id: 'claim-1',
        statement: 'Fixture context is confirmed.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }, {
        id: 'claim-2',
        statement: 'The h2h market context is confirmed.',
        subject: { type: 'market', id: 'h2h' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-2'],
        conflictStatus: 'none',
      }],
      gateResult: {
        verdict: 'review-required',
        reasons: ['API-Football provider odds are present and support the main market angles without material conflict.'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.doesNotMatch(result.bundle?.gateResult.reasons.join('\n') ?? '', /objective research gate passed/);
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /mapped market subject id "h2h"/);
  });

  it('preserves review-required for otherwise sufficient research when only the schedule claim has a kickoff-time conflict', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session-research-schedule-conflict');
    const output = agentOutput({
      sources: [{
        id: 'source-web-1',
        type: 'web-search',
        url: 'https://example.com/orense-preview',
        title: 'Orense preview',
        capturedAt: createdAt.toISOString(),
      }, {
        id: 'source-web-2',
        type: 'web-search',
        url: 'https://example.com/orense-market',
        title: 'Orense market preview',
        capturedAt: createdAt.toISOString(),
      }],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'source-web-1',
        claimIds: ['claim-1'],
        summary: 'Current web preview identifies Orense as the home favorite.',
        confidence: 0.88,
      }, {
        id: 'evidence-2',
        sourceId: 'source-web-2',
        claimIds: ['claim-2'],
        summary: 'Current web and market context supports the Orense home side.',
        confidence: 0.84,
      }, {
        id: 'evidence-3',
        sourceId: 'source_api_football_fixture',
        claimIds: ['claim-schedule'],
        summary: 'Kickoff time differs across provider and web sources.',
        confidence: 0.97,
      }],
      claims: [{
        id: 'claim-1',
        statement: 'Orense SC is the supported home favorite.',
        subject: { type: 'market', market: 'h2h' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-1'],
        conflictStatus: 'none',
      }, {
        id: 'claim-2',
        statement: 'The home-or-draw market angle is supported by current context.',
        subject: { type: 'market', market: 'double_chance' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-2'],
        conflictStatus: 'none',
      }, {
        id: 'claim-schedule',
        statement: 'The kickoff timestamp differs across sources and should be treated as provisional.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['evidence-3'],
        conflictStatus: 'conflict',
      }],
      gateResult: {
        verdict: 'review-required',
        reasons: ['Kickoff time differs across sources, so the schedule remains provisional.'],
        warnings: ['Kickoff time differs across sources.'],
      },
      warnings: ['Kickoff time differs across sources.'],
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        emitNativeWebSearch(options);
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /Kickoff time differs across sources/);
    assert.doesNotMatch(result.bundle?.gateResult.reasons.join('\n') ?? '', /objective research gate passed/);
  });

  it('emits a review-required API-Football fallback bundle when the agent runner fails', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: ResearchBundle[] = [];

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => {
        throw new Error('Codex provider exited before JSON API_KEY=super-secret-token');
      },
      persistBundle: async (bundle) => {
        persisted.push(bundle);
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'review-required');
    assert.equal(result.bundle?.sources.length, 1);
    assert.equal(result.bundle?.sources[0]?.type, 'api-football');
    assert.equal(result.bundle?.sources.some((source) => source.type === 'web-search'), false);
    assert.equal(result.bundle?.claims.length, 1);
    assert.equal(result.bundle?.claims[0]?.evidenceIds[0], result.bundle?.evidenceItems[0]?.id);
    assert.match(result.bundle?.gateResult.reasons.join('\n') ?? '', /insufficient for promotion/);
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /agentic research failed/);
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no real web-search source|no web-search source/);
    assert.doesNotMatch(JSON.stringify(result.bundle), /super-secret-token/);
    assert.match(JSON.stringify(result.bundle), /\[REDACTED\]/);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.id, result.bundle?.id);
    assert.match(result.artifactPath ?? '', /research-bundle\.json$/);

    const artifact = JSON.parse(readFileSync(result.artifactPath as string, 'utf-8')) as ResearchBundle;
    assert.equal(artifact.metadata?.fallback, true);
    assert.equal(artifact.gateResult.verdict, 'review-required');
  });

  it('retries once when live web research returns incomplete JSON before falling back', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let attempts = 0;
    let retryPrompt = '';

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, input, options) => {
        attempts += 1;
        retryPrompt = String(input);
        if (attempts > 1) emitNativeWebSearch(options);
        return {
          text: attempts === 1 ? '{"sources":[' : agentOutput({
            gateResult: { verdict: 'promotable', reasons: ['retry returned valid JSON'], warnings: [] },
          }),
          usage: {},
          output: '',
        };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'promotable');
    assert.equal(attempts, 2);
    assert.match(retryPrompt, /minimal-research-retry mode/);
  });

  it('retries live web research when an intermediate payload says verification is in progress', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let attempts = 0;
    const intermediateOutput = agentOutput({
      sources: [],
      evidenceItems: [],
      claims: [],
      gateResult: {
        verdict: 'review-required',
        reasons: ['Live web verification is in progress.'],
        warnings: [],
      },
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        attempts += 1;
        if (attempts === 1) return { text: intermediateOutput, usage: {}, output: intermediateOutput };
        emitNativeWebSearch(options);
        const output = agentOutput({
          gateResult: {
            verdict: 'promotable',
            reasons: ['web evidence gathered on retry'],
            warnings: [],
          },
        });
        return { text: output, usage: {}, output };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
    assert.equal(result.bundle?.gateResult.verdict, 'promotable');
  });

  it('retries live web research in minimal mode after an agent timeout', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let attempts = 0;
    let retryPrompt = '';

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, input, options) => {
        attempts += 1;
        retryPrompt = String(input);
        if (attempts === 1) throw new Error('research agent timed out after 300s');
        emitNativeWebSearch(options);
        return {
          text: agentOutput({
            gateResult: { verdict: 'promotable', reasons: ['minimal timeout retry returned valid JSON'], warnings: [] },
          }),
          usage: {},
          output: '',
        };
      },
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.gateResult.verdict, 'promotable');
    assert.equal(attempts, 2);
    assert.match(retryPrompt, /minimal-research-retry mode/);
    assert.match(retryPrompt, /maximum 2 current web sources/);
  });

  it('returns blocked and writes redacted raw output when agent output is not JSON', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'off' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({
        text: 'API_KEY=super-secret-token\nnot json',
        usage: {},
        output: 'not json',
      }),
      persistBundle: async () => {
        throw new Error('should not persist invalid JSON');
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.bundle, undefined);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.ok(result.artifactPath);
    assert.match(result.artifactPath, /research-raw-output\.json$/);
    const artifact = readFileSync(result.artifactPath as string, 'utf-8');
    assert.doesNotMatch(artifact, /super-secret-token/);
    assert.match(artifact, /\[REDACTED\]/);
  });
});


describe('research run ownership', () => {
  for (const nested of [true, false]) {
    it(`persists research while ${nested ? 'preserving its running parent' : 'finalizing a standalone with an existing run ID'}`, async () => {
      const cfg = { ...config(), databaseUrl: 'postgresql://unused/test' };
      const parent = parentRun();
      const store = inMemoryRunStore(parent);
      const runtime = { ...createRuntimeContext(cfg, 'session.jsonl'), runId: parent.id };
      let persisted = 0;
      const result = await runInTestScope(nested, runtime, () => runFixtureResearch(cfg, { fixtureId: '1001', web: 'off' }, runtime, {
        now: () => createdAt,
        provider: { getFixture: async () => fixture },
        agentRunner: async () => ({ text: agentOutput(), usage: {}, output: agentOutput() }),
        repositories: { harnessRuns: store.repository, researchBundles: { createWithItems: async () => { persisted++; } } } as any,
      }));
      assert.ok(result.bundle);
      assert.equal(persisted, 1);
      if (nested) assert.deepEqual(store.read(parent.id), parent);
      else {
        assert.equal(store.read(parent.id)?.status, 'succeeded');
        assert.ok(store.read(parent.id)?.completedAt instanceof Date);
      }
    });
  }
});


for (const nested of [true, false]) {
  it(`research persistence failure ${nested ? 'preserves the parent' : 'marks a standalone failed'}`, async () => {
    const cfg = { ...config(), databaseUrl: 'postgresql://unused/test' };
    const parent = parentRun();
    const store = inMemoryRunStore(parent);
    const runtime = { ...createRuntimeContext(cfg, 'session.jsonl'), runId: parent.id };
    const result = await runInTestScope(nested, runtime, () => runFixtureResearch(cfg, { fixtureId: '1001', web: 'off' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({ text: agentOutput(), usage: {}, output: agentOutput() }),
      repositories: { harnessRuns: store.repository, researchBundles: { createWithItems: async () => { throw new Error('test bundle persistence failed'); } } } as any,
    }));
    assert.equal(result.ok, false);
    if (nested) assert.deepEqual(store.read(parent.id), parent);
    else {
      assert.equal(store.read(parent.id)?.status, 'failed');
      assert.equal(store.read(parent.id)?.verdict, 'blocked');
    }
  });
}
