import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { createRuntimeContext } from './context.js';
import { exportRunArtifacts, runPipeline } from './run-service.js';

function testConfig() {
  return loadConfig({
    artifactRoot: mkdtempSync(join(tmpdir(), 'gana-run-service-')),
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
    homeTeamId: 'home',
    awayTeamId: 'away',
    scheduledAt: '2026-04-29T18:00:00.000Z',
    status: 'scheduled',
    includedByFilters: [],
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
  };
}

describe('run-service facade', () => {
  it('runs the pipeline and exposes command-friendly artifact fields', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();

    const result = await runPipeline(config, { date: '2026-04-29' }, runtime, {
      createRunId: () => 'run-service-1',
      discoverFixtures: async () => ({
        fixtures: [target],
        evaluations: [{
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: [],
          excludedReasons: [],
          eligible: true,
        }],
      }),
      fetchOddsSnapshot: async () => ({
        fixtureId: target.id,
        providerFixtureId: target.providerFixtureId,
        providerSnapshotId: 'provider-snapshot-1',
        capturedAt: '2026-04-29T12:00:00.000Z',
        bookmakerCount: 1,
        payloadHash: 'hash',
        quotes: [{
          fixtureId: target.id,
          market: 'h2h',
          selection: 'home',
          price: 1.18,
          impliedProbability: 1 / 1.18,
          capturedAt: '2026-04-29T12:00:00.000Z',
          sourceSnapshotId: 'provider-snapshot-1',
        }],
      }),
      researchFixture: async () => ({ ok: true, gateResult: { verdict: 'review-required', reasons: [], warnings: [] } }),
      scoreFixture: async () => ({ ok: true, runId: 'run-service-1', gateResult: { verdict: 'review-required', reasons: [], warnings: [] }, predictions: [] }),
      buildParlay: async () => ({
        ok: true,
        runId: 'run-service-1',
        date: '2026-04-29',
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
        build: {
          parlay: {
            id: 'parlay-1',
            sourceRunId: 'run-service-1',
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
      }),
      validateRun: async () => ({
        ok: true,
        runId: 'run-service-1',
        target: { date: '2026-04-29' },
        gateResult: { verdict: 'pending', reasons: [], warnings: [] },
        validations: [],
      }),
    });

    assert.equal(result.runId, 'run-service-1');
    assert.equal(result.artifactPath, result.artifactDir);
    assert.ok(result.evidencePackPath.endsWith('/manifest.json'));
    assert.ok(result.handoffPath.endsWith('/run-service-1.md'));
  });

  it('returns a failed export result for a missing run', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');

    const result = await exportRunArtifacts(config, { runId: 'missing-run' }, runtime);

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /not found/);
  });
});
