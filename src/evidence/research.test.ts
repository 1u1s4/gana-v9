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

describe('runFixtureResearch', () => {
  it('builds, validates, persists, and writes a research bundle', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: string[] = [];
    let requiredWeb = false;

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async (_config, _input, options) => {
        requiredWeb = options?.nativeWebSearchRequirement?.required ?? false;
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
  });

  it('passes API-Football statistics and odds context into the research prompt', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let prompt = '';
    let statisticsRequested = false;
    let oddsRequested = false;

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: {
        getFixture: async () => fixture,
        getFixtureStatistics: async () => {
          statisticsRequested = true;
          return fixtureStatistics;
        },
        getCanonicalOddsSnapshot: async () => {
          oddsRequested = true;
          return oddsSnapshot;
        },
      },
      agentRunner: async (_config, input) => {
        prompt = typeof input === 'string' ? input : JSON.stringify(input);
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
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no web-search source/);
  });

  it('accepts provider output with explanatory text around the JSON object', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const output = `I will return JSON now.\n${agentOutput()}\nDone.`;

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({ text: output, usage: {}, output }),
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims.length, 1);
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
      agentRunner: async () => ({ text: output, usage: {}, output }),
      persistBundle: async () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.bundle?.claims[0]?.subject.market, 'goals_over_under');
    assert.match(result.bundle?.warnings.join('\n') ?? '', /mapped market subject id "goals_over_under"/);
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
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no web-search source/);
    assert.doesNotMatch(JSON.stringify(result.bundle), /super-secret-token/);
    assert.match(JSON.stringify(result.bundle), /\[REDACTED\]/);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.id, result.bundle?.id);
    assert.match(result.artifactPath ?? '', /research-bundle\.json$/);

    const artifact = JSON.parse(readFileSync(result.artifactPath as string, 'utf-8')) as ResearchBundle;
    assert.equal(artifact.metadata?.fallback, true);
    assert.equal(artifact.gateResult.verdict, 'review-required');
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
