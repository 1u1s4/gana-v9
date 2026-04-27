import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import type { Fixture } from '../domain/fixtures.js';
import { runFixtureResearch } from './research.js';

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
    assert.equal(result.bundle?.promptVersion, 'research-fixture-v1');
    assert.equal(result.bundle?.sources.some((source) => source.type === 'api-football'), true);
    assert.equal(result.bundle?.sources.some((source) => source.type === 'web-search'), true);
    assert.equal(persisted.length, 1);
    assert.ok(result.artifactPath);
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
    });

    const result = await runFixtureResearch(cfg, { fixtureId: '1001', web: 'live' }, runtime, {
      now: () => createdAt,
      provider: { getFixture: async () => fixture },
      agentRunner: async () => ({ text: output, usage: {}, output }),
      persistBundle: async () => {},
    });

    assert.equal(result.bundle?.gateResult.verdict, 'review-required');
    assert.match(result.bundle?.gateResult.warnings.join('\n') ?? '', /no web-search source/);
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
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.ok(result.artifactPath);
    const artifact = readFileSync(result.artifactPath as string, 'utf-8');
    assert.doesNotMatch(artifact, /super-secret-token/);
    assert.match(artifact, /\[REDACTED\]/);
  });
});
