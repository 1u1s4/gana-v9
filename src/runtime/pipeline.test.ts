import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsQuote } from '../domain/odds.js';
import { createRuntimeContext } from './context.js';
import { executeRunPipeline, exportRunArtifacts } from './pipeline.js';

function testConfig() {
  return loadConfig({
    artifactRoot: mkdtempSync(join(tmpdir(), 'gana-runtime-pipeline-')),
    databaseUrl: '',
    apiFootball: {
      defaultSeason: 2026,
      defaultSeasonInferred: false,
      defaultLeagues: [],
      defaultTeams: [],
      defaultMarkets: ['h2h'],
      lowOddsThreshold: 1.2,
      kickoffWindowHours: 36,
      includeLiveFixtures: true,
      includeCompletedFixtures: true,
      maxFixturesPerRun: 5,
    },
  }, { skipApiKey: true });
}

function fixture(): Fixture {
  return {
    id: 'fixture-1',
    provider: 'api-football',
    providerFixtureId: '1001',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    scheduledAt: '2026-04-29T18:00:00.000Z',
    status: 'scheduled',
    includedByFilters: ['included-by-manual-query'],
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  };
}

function lowOddsQuote(target: Fixture): OddsQuote {
  return {
    fixtureId: target.id,
    market: 'h2h',
    selection: 'home',
    price: 1.18,
    impliedProbability: 1 / 1.18,
    bookmaker: 'test-book',
    capturedAt: '2026-04-29T12:00:00.000Z',
    sourceSnapshotId: 'provider-snapshot-1',
  };
}

describe('executeRunPipeline', () => {
  it('writes canonical run, evidence pack, and handoff artifacts with injected services', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
    }, runtime, {
      createRunId: () => 'run-test-1',
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      discoverFixtures: async () => {
        calls.push('fixtures');
        return {
          fixtures: [target],
          evaluations: [{
            fixtureId: target.id,
            providerFixtureId: target.providerFixtureId,
            includedReasons: ['included-by-manual-query'],
            excludedReasons: [],
            eligible: true,
          }],
        };
      },
      fetchOddsSnapshot: async () => {
        calls.push('odds');
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: 'odds-snapshot-1',
          providerSnapshotId: 'provider-snapshot-1',
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: 'hash',
          quotes: [lowOddsQuote(target)],
        };
      },
      researchFixture: async () => {
        calls.push('research');
        return {
          ok: true,
          gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
        };
      },
      scoreFixture: async () => {
        calls.push('score');
        return {
          ok: true,
          runId: 'run-test-1',
          gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
          predictions: [],
        };
      },
      buildParlay: async () => {
        calls.push('parlay');
        return {
          ok: true,
          runId: 'run-test-1',
          date: '2026-04-29',
          gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
          build: {
            parlay: {
              id: 'parlay-1',
              sourceRunId: 'run-test-1',
              legs: [],
              aggregateConfidence: 0,
              aggregateQuality: 0,
              rationale: 'test',
              warnings: [],
              status: 'review-required',
              generatedAt: '2026-04-29T12:00:00.000Z',
            },
            evaluations: [],
            config: {
              minLegs: 2,
              maxLegs: 4,
              allowMultipleLegsPerFixture: false,
              minPredictionConfidence: 0,
            },
          },
        };
      },
      validateRun: async () => {
        calls.push('validate');
        return {
          ok: true,
          runId: 'run-test-1',
          target: { date: '2026-04-29' },
          gateResult: { verdict: 'pending', reasons: [], warnings: [] },
          validations: [{
            predictionId: 'prediction-1',
            status: 'pending',
            outcome: { status: 'pending' },
            evaluatedAt: '2026-04-29T12:00:00.000Z',
          }],
        };
      },
    });

    assert.equal(runtime.runId, 'run-test-1');
    assert.equal(result.runId, 'run-test-1');
    assert.equal(result.verdict, 'review-required');
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay', 'validate']);
    assert.ok(existsSync(join(result.artifactDir, 'input.json')));
    assert.ok(existsSync(join(result.artifactDir, 'filters.json')));
    assert.ok(existsSync(join(result.artifactDir, 'fixtures.json')));
    assert.ok(existsSync(join(result.artifactDir, 'low-odds-scan.json')));
    assert.ok(existsSync(join(result.artifactDir, 'evaluation.json')));
    assert.ok(existsSync(join(result.artifactDir, 'handoff.md')));
    assert.ok(result.evidencePackPath.endsWith('/evidence-packs/run-test-1/manifest.json'));
    assert.ok(result.handoffPath.endsWith('/handoffs/run-test-1.md'));

    const manifest = JSON.parse(readFileSync(result.evidencePackPath, 'utf-8'));
    assert.equal(manifest.runId, 'run-test-1');
    assert.ok(manifest.files.some((item: { name: string }) => item.name === 'input.json'));
    assert.ok(manifest.files.some((item: { name: string }) => item.name === 'handoff.md'));
  });

  it('blocks when fixture discovery fails and still exports handoff artifacts', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
    }, runtime, {
      createRunId: () => 'run-blocked-1',
      discoverFixtures: async () => {
        throw new Error('provider unavailable');
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.verdict, 'blocked');
    assert.match(result.error ?? '', /provider unavailable/);
    assert.ok(existsSync(result.evidencePackPath));
    assert.ok(existsSync(result.handoffPath));
  });
});

describe('exportRunArtifacts', () => {
  it('fails when a run is missing locally and in storage', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');

    const result = await exportRunArtifacts(config, { runId: 'missing-run' }, runtime);

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /not found/);
  });
});
