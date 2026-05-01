import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsQuote } from '../domain/odds.js';
import { createRuntimeContext } from './context.js';
import { executeRunPipeline, exportRunArtifacts, type RunPipelineDependencies } from './pipeline.js';

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

function successfulPipelineDeps(input: {
  target: Fixture;
  calls: string[];
  runId: string;
  date: string;
  now?: string;
  validateRun?: RunPipelineDependencies['validateRun'];
}): RunPipelineDependencies {
  const evaluatedAt = input.now ?? '2026-04-29T12:00:00.000Z';
  return {
    createRunId: () => input.runId,
    now: () => new Date(evaluatedAt),
    discoverFixtures: async () => {
      input.calls.push('fixtures');
      return {
        fixtures: [input.target],
        evaluations: [{
          fixtureId: input.target.id,
          providerFixtureId: input.target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
      };
    },
    fetchOddsSnapshot: async () => {
      input.calls.push('odds');
      return {
        fixtureId: input.target.id,
        providerFixtureId: input.target.providerFixtureId,
        oddsSnapshotId: 'odds-snapshot-1',
        providerSnapshotId: 'provider-snapshot-1',
        quoteRecordIds: { 'test-book|h2h|home|': 'odds-quote-1' },
        capturedAt: evaluatedAt,
        bookmakerCount: 1,
        payloadHash: 'hash',
        quotes: [lowOddsQuote(input.target)],
      };
    },
    researchFixture: async () => {
      input.calls.push('research');
      return {
        ok: true,
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
      };
    },
    scoreFixture: async () => {
      input.calls.push('score');
      return {
        ok: true,
        runId: input.runId,
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
        predictions: [],
      };
    },
    buildParlay: async () => {
      input.calls.push('parlay');
      return {
        ok: true,
        runId: input.runId,
        date: input.date,
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
        build: {
          parlay: {
            id: 'parlay-1',
            sourceRunId: input.runId,
            legs: [],
            aggregateConfidence: 0,
            aggregateQuality: 0,
            rationale: 'test',
            warnings: [],
            status: 'review-required',
            generatedAt: evaluatedAt,
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
    validateRun: input.validateRun ?? (async () => {
      input.calls.push('validate');
      return {
        ok: true,
        runId: input.runId,
        target: { date: input.date },
        gateResult: { verdict: 'pending', reasons: [], warnings: [] },
        validations: [{
          predictionId: 'prediction-1',
          status: 'pending',
          outcome: { status: 'pending' },
          evaluatedAt,
        }],
      };
    }),
  };
}

describe('executeRunPipeline', () => {
  it('writes canonical run, evidence pack, and handoff artifacts with injected services', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const calls: string[] = [];
    const persistedHits: unknown[] = [];

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
          quoteRecordIds: { 'test-book|h2h|home|': 'odds-quote-1' },
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
      repositories: {
        lowOddsScans: {
          create: async () => ({ id: 'scan-1' }),
          updateStatus: async () => ({}),
        },
        lowOddsHits: {
          createMany: async (inputs) => {
            persistedHits.push(...inputs);
            return { count: inputs.length };
          },
        },
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
    assert.equal(result.lowOddsScan.scanId, 'scan-1');
    assert.equal(persistedHits.length, 1);

    const lowOddsScan = JSON.parse(readFileSync(join(result.artifactDir, 'low-odds-scan.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(lowOddsScan.scanId, 'scan-1');
    assert.equal(lowOddsScan.hits[0].oddsQuoteId, 'odds-quote-1');
    assert.equal(evaluation.lowOddsScanId, 'scan-1');
    assert.equal(evaluation.counts.validations, 1);
    assert.equal(evaluation.validation.mode, 'auto');
    assert.equal(evaluation.validation.status, 'completed');
    assert.equal(evaluation.validation.validations, 1);

    const manifest = JSON.parse(readFileSync(result.evidencePackPath, 'utf-8'));
    assert.equal(manifest.runId, 'run-test-1');
    assert.ok(manifest.files.some((item: { name: string }) => item.name === 'input.json'));
    assert.ok(manifest.files.some((item: { name: string }) => item.name === 'handoff.md'));
  });

  it('forces validation for future dates when requested', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2099-01-01',
      validate: 'force',
    }, runtime, successfulPipelineDeps({
      target: fixture(),
      calls,
      runId: 'run-force-validation',
      date: '2099-01-01',
      now: '2026-04-29T12:00:00.000Z',
    }));

    assert.equal(result.validation?.validations.length, 1);
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay', 'validate']);

    const input = JSON.parse(readFileSync(join(result.artifactDir, 'input.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(input.validate, 'force');
    assert.equal(evaluation.validation.mode, 'force');
    assert.equal(evaluation.validation.status, 'completed');
    assert.equal(evaluation.validation.validations, 1);
  });

  it('records skipped auto validation separately from zero validations', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2099-01-01',
    }, runtime, successfulPipelineDeps({
      target: fixture(),
      calls,
      runId: 'run-skip-validation',
      date: '2099-01-01',
      now: '2026-04-29T12:00:00.000Z',
      validateRun: async () => {
        throw new Error('validation should have been skipped');
      },
    }));

    assert.equal(result.validation, undefined);
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay']);

    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(evaluation.counts.validations, 0);
    assert.equal(evaluation.validation.mode, 'auto');
    assert.equal(evaluation.validation.status, 'skipped');
    assert.equal(evaluation.validation.reason, 'future-date');
    assert.equal(evaluation.validation.validations, 0);

    const handoff = readFileSync(result.handoffPath, 'utf-8');
    assert.match(handoff, /validationStatus: skipped \(future-date\)/);
    assert.match(handoff, /validationMode: auto/);
  });

  it('records executed validation with zero targets separately from skipped validation', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
    }, runtime, successfulPipelineDeps({
      target: fixture(),
      calls,
      runId: 'run-zero-validation-targets',
      date: '2026-04-29',
      now: '2026-04-29T12:00:00.000Z',
      validateRun: async () => {
        calls.push('validate');
        return {
          ok: true,
          runId: 'run-zero-validation-targets',
          target: { date: '2026-04-29' },
          gateResult: { verdict: 'blocked', reasons: ['no validation targets found'], warnings: [] },
          validations: [],
          artifactPath: '/tmp/validations-blocked.json',
        };
      },
    }));

    assert.equal(result.validation?.validations.length, 0);
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay', 'validate']);

    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(evaluation.counts.validations, 0);
    assert.equal(evaluation.validation.status, 'completed');
    assert.equal(evaluation.validation.verdict, 'blocked');
    assert.equal(evaluation.validation.validations, 0);
    assert.equal(evaluation.validation.artifactPath, '/tmp/validations-blocked.json');
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

  it('summarizes storage-only validation exports without unknown verdicts', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');

    const result = await exportRunArtifacts(config, { runId: 'validation-run-1' }, runtime, {
      now: () => new Date('2026-05-01T12:00:00.000Z'),
      repositories: {
        harnessRuns: {
          findById: async () => ({
            id: 'validation-run-1',
            status: 'succeeded',
            verdict: 'pending',
            artifactDir: null,
            metadata: { settlementRuleVersion: 'settlement-v1' },
          }),
        },
        artifacts: {
          listByRun: async () => [{
            name: 'validations.json',
            kind: 'validations',
            path: '/tmp/validations.json',
            sha256: 'hash',
          }],
          create: async () => ({}),
        },
      },
    });

    assert.equal(result.ok, true);
    assert.ok(result.handoffPath);

    const handoff = readFileSync(result.handoffPath, 'utf-8');
    assert.match(handoff, /verdict: pending/);
    assert.match(handoff, /status: succeeded/);
    assert.match(handoff, /validations: 1/);
    assert.match(handoff, /validationStatus: pending/);
    assert.match(handoff, /Wait for fixture completion/);
  });
});
