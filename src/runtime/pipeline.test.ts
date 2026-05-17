import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsQuote } from '../domain/odds.js';
import { createRuntimeContext } from './context.js';
import { computeAgentFixtureTimeoutMs, executeRunPipeline, exportRunArtifacts, type RunPipelineDependencies } from './pipeline.js';

function testConfig() {
  return loadConfig({
    artifactRoot: mkdtempSync(join(tmpdir(), 'gana-runtime-pipeline-')),
    databaseUrl: '',
    apiFootball: {
      defaultSeason: 2026,
      defaultSeasonInferred: false,
      timezone: 'America/Guatemala',
      leaguePresetsPath: join(mkdtempSync(join(tmpdir(), 'gana-league-presets-')), 'league-presets.json'),
      bookmakerPresetsPath: join(mkdtempSync(join(tmpdir(), 'gana-bookmaker-presets-')), 'bookmaker-presets.json'),
      bookmakerAllowlist: ['test-book'],
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

function fixture(overrides: Partial<Fixture> = {}): Fixture {
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
    ...overrides,
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

function lowOddsQuoteFor(target: Fixture, overrides: Partial<OddsQuote>): OddsQuote {
  return {
    ...lowOddsQuote(target),
    ...overrides,
  };
}

function predictionRecord(input: {
  runId: string;
  fixtureId?: string;
  providerFixtureId?: string;
  oddsQuoteId?: string;
  market?: string;
  selection?: string;
  line?: number;
}): any {
  const oddsQuoteId = input.oddsQuoteId ?? 'odds-quote-1';
  return {
    id: `prediction-${oddsQuoteId}`,
    runId: input.runId,
    fixtureId: input.fixtureId ?? 'fixture-1',
    providerFixtureId: input.providerFixtureId ?? '1001',
    market: input.market ?? 'h2h',
    selection: input.selection ?? 'home',
    line: input.line,
    odds: 1.18,
    impliedProbability: 1 / 1.18,
    oddsSnapshotId: 'odds-snapshot-1',
    oddsQuoteId,
    evidenceIds: ['evidence-1'],
    claimIds: ['claim-1'],
    status: 'review-required',
    confidence: 0.5,
    quality: 'low',
    promptVersion: 'score-prediction-v1',
    scoringRuleVersion: 'scoring-v1',
    generatedAt: '2026-04-29T12:00:00.000Z',
  };
}

function successfulPipelineDeps(input: {
  target: Fixture;
  calls: string[];
  runId: string;
  date: string;
  now?: string;
  scoreFixture?: RunPipelineDependencies['scoreFixture'];
  validateRun?: RunPipelineDependencies['validateRun'];
  buildParlay?: RunPipelineDependencies['buildParlay'];
  analyzeParlays?: RunPipelineDependencies['analyzeParlays'];
  discoverLowOddsFixtures?: RunPipelineDependencies['discoverLowOddsFixtures'];
  fetchLowOddsSnapshot?: RunPipelineDependencies['fetchLowOddsSnapshot'];
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
        requestedLeagues: [],
        requestedTeams: [],
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
    discoverLowOddsFixtures: input.discoverLowOddsFixtures ?? (async () => ({
      fixtures: [input.target],
      evaluations: [{
        fixtureId: input.target.id,
        providerFixtureId: input.target.providerFixtureId,
        includedReasons: ['included-by-manual-query'],
        excludedReasons: [],
        eligible: true,
      }],
      requestedLeagues: [],
      requestedTeams: [],
    })),
    fetchLowOddsSnapshot: input.fetchLowOddsSnapshot ?? (async () => ({
      fixtureId: input.target.id,
      providerFixtureId: input.target.providerFixtureId,
      oddsSnapshotId: 'odds-snapshot-1',
      providerSnapshotId: 'provider-snapshot-1',
      quoteRecordIds: { 'test-book|h2h|home|': 'odds-quote-1' },
      capturedAt: evaluatedAt,
      bookmakerCount: 1,
      payloadHash: 'hash',
      quotes: [lowOddsQuote(input.target)],
    })),
    researchFixture: async () => {
      input.calls.push('research');
      return {
        ok: true,
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
      };
    },
    scoreFixture: input.scoreFixture ?? (async () => {
      input.calls.push('score');
      return {
        ok: true,
        runId: input.runId,
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
        predictions: [predictionRecord({
          runId: input.runId,
          fixtureId: input.target.id,
          providerFixtureId: input.target.providerFixtureId,
        })],
      };
    }),
    buildParlay: input.buildParlay ?? (async () => {
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
    }),
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
    analyzeParlays: input.analyzeParlays ?? (async () => ({
        ok: true,
        runId: input.runId,
        date: input.date,
        analyzed: 1,
        top: [{
          rank: 1,
          parlayId: 'parlay-1',
          sourceRunId: input.runId,
          profile: 'default',
          validationStatus: 'pending',
          harnessStatus: 'review-required',
          combinedOdds: 1.8,
          aggregateConfidence: 0.6,
          adjustedProbability: 0.62,
          expectedEdge: 0.116,
          score: 0.5,
          exposure: { units: 1, percentOfAnalyticalBankroll: 0.01, policy: 'fractional-kelly-capped-analytical-exposure' },
          stake: { units: 1, percentOfBankroll: 0.01, policy: 'fractional-kelly-capped-analytical-stake' }, bankerLegs: [],
          reasons: ['test recommendation'],
          riskFlags: [],
          legs: [],
        }],
        diagnostics: {
          generatedAt: evaluatedAt,
          analyticalArtifactOnly: true,
          executionCapability: 'none',
          profileScope: 'core',
          rawAnalyzed: 1,
          profileScopedAnalyzed: 1,
          exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' },
          bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' },
          universe: { won: 0, lost: 0, voided: 0, pending: 1, unvalidated: 0, settled: 0, hitRate: null },
          selected: { won: 0, lost: 0, voided: 0, pending: 1, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 1, totalStakePercentOfBankroll: 0.01, totalExposureUnits: 1, totalExposurePercent: 0.01 },
          rejected: [],
        },
        artifactPath: '/tmp/parlay-analysis.json',
      })),
  };
}

describe('computeAgentFixtureTimeoutMs', () => {
  it('does not let live research timeout before JSON retries can finish', () => {
    assert.equal(computeAgentFixtureTimeoutMs({
      baseTimeoutMs: 180_000,
      web: 'live',
      researchAgentTimeoutMs: 300_000,
      researchJsonAttempts: 2,
      abortGraceMs: 30_000,
    }), 630_000);
  });

  it('preserves longer explicit fixture timeout budgets', () => {
    assert.equal(computeAgentFixtureTimeoutMs({
      baseTimeoutMs: 900_000,
      web: 'live',
      researchAgentTimeoutMs: 300_000,
      researchJsonAttempts: 2,
      abortGraceMs: 30_000,
    }), 900_000);
  });

  it('keeps non-live modes on the configured fixture timeout', () => {
    assert.equal(computeAgentFixtureTimeoutMs({
      baseTimeoutMs: 180_000,
      web: 'off',
      researchAgentTimeoutMs: 300_000,
      researchJsonAttempts: 2,
      abortGraceMs: 30_000,
    }), 180_000);
  });
});

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
          requestedLeagues: [],
          requestedTeams: [],
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
      discoverLowOddsFixtures: async () => ({
        fixtures: [target],
        evaluations: [{
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchLowOddsSnapshot: async () => ({
        fixtureId: target.id,
        providerFixtureId: target.providerFixtureId,
        oddsSnapshotId: 'odds-snapshot-1',
        providerSnapshotId: 'provider-snapshot-1',
        quoteRecordIds: { 'test-book|h2h|home|': 'odds-quote-1' },
        capturedAt: '2026-04-29T12:00:00.000Z',
        bookmakerCount: 1,
        payloadHash: 'hash',
        quotes: [lowOddsQuote(target)],
      }),
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
          predictions: [predictionRecord({
            runId: 'run-test-1',
            fixtureId: target.id,
            providerFixtureId: target.providerFixtureId,
          })],
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
      analyzeParlays: async () => {
        calls.push('parlay-analysis');
        return {
          ok: true,
          runId: 'run-test-1',
          date: '2026-04-29',
          analyzed: 1,
          top: [{
            rank: 1,
            parlayId: 'parlay-1',
            sourceRunId: 'run-test-1',
            profile: 'default',
            validationStatus: 'pending',
            harnessStatus: 'review-required',
            combinedOdds: 1.8,
            aggregateConfidence: 0.6,
            adjustedProbability: 0.62,
            expectedEdge: 0.116,
            score: 0.5,
            exposure: { units: 1, percentOfAnalyticalBankroll: 0.01, policy: 'fractional-kelly-capped-analytical-exposure' },
            stake: { units: 1, percentOfBankroll: 0.01, policy: 'fractional-kelly-capped-analytical-stake' }, bankerLegs: [],
            reasons: ['pipeline parlay analysis'],
            riskFlags: [],
            legs: [],
          }],
          diagnostics: {
            generatedAt: '2026-04-29T12:00:00.000Z',
            analyticalArtifactOnly: true,
            executionCapability: 'none',
            profileScope: 'core',
            rawAnalyzed: 1,
            profileScopedAnalyzed: 1,
            exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' },
            bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' },
            universe: { won: 0, lost: 0, voided: 0, pending: 1, unvalidated: 0, settled: 0, hitRate: null },
            selected: { won: 0, lost: 0, voided: 0, pending: 1, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 1, totalStakePercentOfBankroll: 0.01, totalExposureUnits: 1, totalExposurePercent: 0.01 },
            rejected: [],
          },
          artifactPath: '/tmp/parlay-analysis.json',
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
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay', 'validate', 'parlay-analysis']);
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
    assert.equal(evaluation.counts.parlayRecommendations, 1);
    assert.equal(evaluation.parlayAnalysisDiagnostics.selected.totalStakeUnits, 1);
    assert.equal(evaluation.lowOddsPredictionCoverage.hits, 1);
    assert.equal(evaluation.lowOddsPredictionCoverage.predictedHitOddsQuoteIds, 1);
    assert.equal(evaluation.lowOddsPredictionCoverage.missingPredictionHits, 0);
    assert.equal(evaluation.lowOddsPredictionCoverage.complete, true);
    assert.equal(evaluation.validation.mode, 'auto');
    assert.equal(evaluation.validation.status, 'completed');
    assert.equal(evaluation.validation.validations, 1);

    const manifest = JSON.parse(readFileSync(result.evidencePackPath, 'utf-8'));
    assert.equal(manifest.runId, 'run-test-1');
    assert.equal(manifest.handoff.parlay, 'no-parlay-today');
    assert.ok(manifest.files.some((item: { name: string }) => item.name === 'input.json'));
    assert.ok(manifest.files.some((item: { name: string }) => item.name === 'handoff.md'));
    const handoff = readFileSync(result.handoffPath, 'utf-8');
    assert.match(handoff, /handoff\.parlay: no-parlay-today/);
    assert.match(handoff, /parlayRecommendations: 1/);
  });

  it('uses injected artifact exporter on successful runs', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const calls: string[] = [];
    const exportCalls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, runtime, {
      ...successfulPipelineDeps({
        target,
        calls,
        runId: 'run-injected-exporter',
        date: '2026-04-29',
      }),
      exportArtifacts: async (_config, input) => {
        exportCalls.push(input.runId);
        return {
          ok: true,
          runId: input.runId,
          artifactDir: '/tmp/custom-artifact-dir',
          evidencePackPath: '/tmp/custom-evidence-pack.json',
          handoffPath: '/tmp/custom-handoff.md',
          manifestPath: '/tmp/custom-evidence-pack.json',
        };
      },
    });

    assert.deepEqual(exportCalls, ['run-injected-exporter']);
    assert.equal(result.evidencePackPath, '/tmp/custom-evidence-pack.json');
    assert.equal(result.handoffPath, '/tmp/custom-handoff.md');
  });

  it('continues with primary slate when low-odds scan fails', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, runtime, successfulPipelineDeps({
      target,
      calls,
      runId: 'run-low-odds-degraded',
      date: '2026-04-29',
      discoverLowOddsFixtures: async () => {
        throw new Error('low odds provider unavailable');
      },
    }));

    assert.equal(result.status, 'succeeded');
    assert.equal(result.verdict, 'review-required');
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay']);
    assert.equal(result.fixtures.length, 1);
    assert.equal(result.lowOddsScan.hitCount, 0);

    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    const lowOddsStep = evaluation.steps.find((step: any) => step.name === 'scan low odds');
    assert.equal(lowOddsStep.ok, false);
    assert.equal(lowOddsStep.verdict, 'review-required');
    assert.match(lowOddsStep.warnings.join('\n'), /low odds provider unavailable/);
    assert.ok(existsSync(result.handoffPath));
  });

  it('exports review-required parlays with real legs as analytical review candidates in handoff', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, runtime, successfulPipelineDeps({
      target,
      calls,
      runId: 'run-review-parlay-handoff',
      date: '2026-04-29',
      buildParlay: async () => {
        calls.push('parlay');
        return {
          ok: true,
          runId: 'run-review-parlay-handoff',
          date: '2026-04-29',
          gateResult: { verdict: 'review-required', reasons: ['soft warnings require review'], warnings: ['low-liquidity'] },
          build: {
            parlay: {
              id: 'parlay-review-1',
              sourceRunId: 'run-review-parlay-handoff',
              legs: [{
                parlayId: 'parlay-review-1',
                predictionId: 'prediction-1',
                fixtureId: target.id,
                market: 'h2h',
                selection: 'home',
                odds: 1.8,
                status: 'review-required',
                index: 0,
                inclusionReason: 'included-eligible-prediction',
              }],
              aggregateConfidence: 0.61,
              aggregateQuality: 0.55,
              rationale: 'review candidate with real persisted legs',
              warnings: ['low-liquidity'],
              status: 'review-required',
              generatedAt: '2026-04-29T12:00:00.000Z',
            },
            evaluations: [],
            config: { minLegs: 1, maxLegs: 4, allowMultipleLegsPerFixture: false, minPredictionConfidence: 0 },
          },
        };
      },
    }));

    assert.equal(result.verdict, 'review-required');
    const manifest = JSON.parse(readFileSync(result.evidencePackPath, 'utf-8'));
    assert.equal(manifest.handoff.parlay, 'analytical-review-candidate');
    assert.match(readFileSync(result.handoffPath, 'utf-8'), /handoff\.parlay: analytical-review-candidate/);
  });

  it('resumes a run from completed HarnessTask checkpoints without reexecuting completed steps', async () => {
    const config = testConfig();
    const target = fixture();
    const calls: string[] = [];
    const deps = successfulPipelineDeps({
      target,
      calls,
      runId: 'run-resume-checkpoint',
      date: '2026-04-29',
    });

    const firstRuntime = createRuntimeContext(config, 'session.jsonl');
    const first = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, firstRuntime, deps);

    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay']);
    const firstTasks = JSON.parse(readFileSync(join(first.artifactDir, 'tasks.json'), 'utf-8'));
    assert.equal(firstTasks.find((task: { type: string }) => task.type === 'score.fixture').status, 'succeeded');

    const secondRuntime = createRuntimeContext(config, 'session-2.jsonl');
    const second = await executeRunPipeline(config, {
      date: '2026-04-29',
      runId: 'run-resume-checkpoint',
      validate: false,
    }, secondRuntime, deps);

    assert.equal(second.runId, first.runId);
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay']);
    assert.equal(second.scoring.length, 1);
    assert.equal(second.parlay?.runId, 'run-resume-checkpoint');
  });

  it('reruns completed tasks when their checkpoint JSON is corrupt', async () => {
    const config = testConfig();
    const target = fixture();
    const calls: string[] = [];
    const deps = successfulPipelineDeps({
      target,
      calls,
      runId: 'run-corrupt-checkpoint',
      date: '2026-04-29',
    });

    const firstRuntime = createRuntimeContext(config, 'session.jsonl');
    const first = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, firstRuntime, deps);
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay']);

    writeFileSync(join(first.artifactDir, 'fixtures.json'), '{not valid json');

    const secondRuntime = createRuntimeContext(config, 'session-2.jsonl');
    const second = await executeRunPipeline(config, {
      date: '2026-04-29',
      runId: 'run-corrupt-checkpoint',
      validate: false,
    }, secondRuntime, deps);

    assert.equal(second.runId, first.runId);
    assert.equal(second.fixtures.length, 1);
    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay', 'fixtures']);
  });

  it('scans low odds across the full date slate instead of only default league fixtures', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const calls: string[] = [];
    const defaultTarget = fixture({
      id: 'default-fixture',
      providerFixtureId: '1001',
    });
    const fijiTarget = fixture({
      id: 'fiji-fixture',
      providerFixtureId: '9001',
      homeTeamName: 'Tailevu Naitasiri',
      awayTeamName: 'Ba',
      leagueId: 359,
      competitionId: '359',
    });
    const discoveryQueries: Array<{ leaguesDefault?: boolean; teamsDefault?: boolean }> = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, runtime, successfulPipelineDeps({
      target: defaultTarget,
      calls,
      runId: 'run-global-low-odds-slate',
      date: '2026-04-29',
      discoverLowOddsFixtures: async (_config, query) => {
        discoveryQueries.push(query);
        calls.push('low-odds-fixtures');
        return {
          fixtures: [defaultTarget, fijiTarget],
          evaluations: [defaultTarget, fijiTarget].map((item) => ({
            fixtureId: item.id,
            providerFixtureId: item.providerFixtureId,
            includedReasons: ['included-by-manual-query'],
            excludedReasons: [],
            eligible: true,
          })),
          requestedLeagues: [],
          requestedTeams: [],
        };
      },
      fetchLowOddsSnapshot: async (_config, providerFixtureId) => {
        calls.push(`low-odds:${providerFixtureId}`);
        const isFijiTarget = providerFixtureId === fijiTarget.providerFixtureId;
        const target = isFijiTarget ? fijiTarget : defaultTarget;
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: `low-odds-snapshot-${target.providerFixtureId}`,
          providerSnapshotId: `provider-snapshot-${target.providerFixtureId}`,
          quoteRecordIds: isFijiTarget ? { 'test-book|h2h|away|': 'odds-quote-fiji-ba' } : undefined,
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: `hash-${target.providerFixtureId}`,
          quotes: isFijiTarget
            ? [lowOddsQuoteFor(fijiTarget, { selection: 'away', price: 1.14, impliedProbability: 1 / 1.14 })]
            : [
              lowOddsQuoteFor(defaultTarget, {
                market: 'double_chance',
                selection: 'home_or_draw',
                price: 1.1,
                impliedProbability: 1 / 1.1,
              }),
            ],
        };
      },
      scoreFixture: async (_cfg, input) => {
        calls.push(`score:${input.fixtureId}`);
        const target = input.fixtureId === fijiTarget.providerFixtureId ? fijiTarget : defaultTarget;
        const isFijiTarget = target.providerFixtureId === fijiTarget.providerFixtureId;
        return {
          ok: true,
          runId: 'run-global-low-odds-slate',
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          predictions: isFijiTarget
            ? [predictionRecord({
              runId: 'run-global-low-odds-slate',
              fixtureId: target.id,
              providerFixtureId: target.providerFixtureId,
              oddsQuoteId: 'odds-quote-fiji-ba',
              selection: 'away',
            })]
            : [],
        };
      },
    }));

    assert.equal(result.verdict, 'review-required');
    assert.deepEqual(discoveryQueries, [{ date: '2026-04-29', fullDay: true }]);
    assert.equal(result.lowOddsScan.fixtureCount, 2);
    assert.equal(result.lowOddsScan.hitCount, 1);
    assert.equal(result.lowOddsScan.hits[0]?.providerFixtureId, '9001');
    assert.equal(result.lowOddsScan.hits[0]?.market, 'h2h');
    assert.equal(result.lowOddsScan.hits[0]?.oddsQuoteId, 'odds-quote-fiji-ba');

    const lowOddsScan = JSON.parse(readFileSync(join(result.artifactDir, 'low-odds-scan.json'), 'utf-8'));
    assert.deepEqual(
      lowOddsScan.candidateFixtures.map((fixture: { providerFixtureId: string }) => fixture.providerFixtureId),
      ['1001', '9001'],
    );
    const selected = JSON.parse(readFileSync(join(result.artifactDir, 'selected-fixtures.json'), 'utf-8'));
    assert.equal(selected.lowOddsUniqueFixtures, 1);
    assert.equal(selected.selectedFixtures, 2);

    const resumeRuntime = createRuntimeContext(config, 'session-resume.jsonl');
    const resumed = await executeRunPipeline(config, {
      date: '2026-04-29',
      runId: 'run-global-low-odds-slate',
      validate: false,
    }, resumeRuntime, successfulPipelineDeps({ target: defaultTarget, calls, runId: 'run-global-low-odds-slate', date: '2026-04-29' }));
    const resumedSelected = JSON.parse(readFileSync(join(resumed.artifactDir, 'selected-fixtures.json'), 'utf-8'));
    assert.equal(resumedSelected.lowOddsUniqueFixtures, 1);
    assert.equal(resumedSelected.selectedFixtures, 2);

    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(evaluation.lowOddsPredictionCoverage.hits, 1);
    assert.equal(evaluation.lowOddsPredictionCoverage.missingPredictionHits, 0);
    assert.equal(evaluation.lowOddsPredictionCoverage.complete, true);
    assert.ok(calls.includes('score:1001'));
    assert.ok(calls.includes('score:9001'));
  });

  it('flags incomplete low-odds prediction coverage in the run evaluation', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const calls: string[] = [];
    const target = fixture();

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
    }, runtime, successfulPipelineDeps({
      target,
      calls,
      runId: 'run-missing-low-odds-prediction',
      date: '2026-04-29',
      scoreFixture: async () => {
        calls.push('score');
        return {
          ok: true,
          runId: 'run-missing-low-odds-prediction',
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          predictions: [],
        };
      },
    }));

    assert.equal(result.verdict, 'review-required');

    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(evaluation.lowOddsPredictionCoverage.hits, 1);
    assert.equal(evaluation.lowOddsPredictionCoverage.predictedHitOddsQuoteIds, 0);
    assert.equal(evaluation.lowOddsPredictionCoverage.missingPredictionHits, 1);
    assert.deepEqual(evaluation.lowOddsPredictionCoverage.missingIndicatorFixtureIds, [target.id]);
    assert.equal(evaluation.lowOddsPredictionCoverage.complete, false);
    assert.match(
      evaluation.steps.find((step: { name: string }) => step.name === 'score').warnings.join('\n'),
      /missing predictions for 1 low-odds indicator fixture/,
    );

    const handoff = readFileSync(result.handoffPath, 'utf-8');
    assert.match(handoff, /lowOddsPredicted: 0\/1/);
  });

  it('falls back to scoring the eligible fixture slate when no h2h home or away low odds exist', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, runtime, {
      createRunId: () => 'run-h2h-home-away-only',
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
          requestedLeagues: [],
          requestedTeams: [],
        };
      },
      fetchOddsSnapshot: async () => {
        calls.push('odds');
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: 'odds-snapshot-1',
          providerSnapshotId: 'provider-snapshot-1',
          quoteRecordIds: {
            'test-book|h2h|draw|': 'odds-quote-draw',
            'test-book|double_chance|home_or_draw|': 'odds-quote-double',
          },
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: 'hash',
          quotes: [
            lowOddsQuoteFor(target, { selection: 'draw', price: 1.1, impliedProbability: 1 / 1.1 }),
            lowOddsQuoteFor(target, { market: 'double_chance', selection: 'home_or_draw', price: 1.12, impliedProbability: 1 / 1.12 }),
          ],
        };
      },
      discoverLowOddsFixtures: async () => ({
        fixtures: [target],
        evaluations: [{
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchLowOddsSnapshot: async () => ({
        fixtureId: target.id,
        providerFixtureId: target.providerFixtureId,
        oddsSnapshotId: 'odds-snapshot-1',
        providerSnapshotId: 'provider-snapshot-1',
        quoteRecordIds: {
          'test-book|h2h|draw|': 'odds-quote-draw',
          'test-book|double_chance|home_or_draw|': 'odds-quote-double',
        },
        capturedAt: '2026-04-29T12:00:00.000Z',
        bookmakerCount: 1,
        payloadHash: 'hash',
        quotes: [
          lowOddsQuoteFor(target, { selection: 'draw', price: 1.1, impliedProbability: 1 / 1.1 }),
          lowOddsQuoteFor(target, { market: 'double_chance', selection: 'home_or_draw', price: 1.12, impliedProbability: 1 / 1.12 }),
        ],
      }),
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
          runId: 'run-h2h-home-away-only',
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
          predictions: [predictionRecord({
            runId: 'run-h2h-home-away-only',
            fixtureId: target.id,
            providerFixtureId: target.providerFixtureId,
            oddsQuoteId: 'fallback-prediction-quote',
          })],
        };
      },
      buildParlay: async () => {
        calls.push('parlay');
        return {
          ok: false,
          runId: 'run-h2h-home-away-only',
          date: '2026-04-29',
          gateResult: { verdict: 'blocked', reasons: ['no predictions found'], warnings: [] },
          build: {
            parlay: {
              id: 'parlay-1',
              sourceRunId: 'run-h2h-home-away-only',
              legs: [],
              aggregateConfidence: 0,
              aggregateQuality: 0,
              rationale: 'test',
              warnings: [],
              status: 'blocked',
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
    });

    assert.deepEqual(calls, ['fixtures', 'odds', 'research', 'score', 'parlay']);
    assert.equal(result.lowOddsScan.hitCount, 0);

    const lowOddsScan = JSON.parse(readFileSync(join(result.artifactDir, 'low-odds-scan.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(lowOddsScan.hitCount, 0);
    const lowOddsStep = evaluation.steps.find((step: { name: string }) => step.name === 'scan low odds');
    assert.equal(lowOddsStep.ok, true);
    assert.equal(lowOddsStep.verdict, 'promotable');
    assert.deepEqual(lowOddsStep.warnings, []);
    assert.equal(evaluation.counts.predictions, 1);
  });

  it('uses h2h favorites as low-odds selector while preserving requested analysis scope', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const target = fixture();
    const observed: Record<string, unknown[]> = {};

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      web: 'off',
      validate: false,
      markets: ['double_chance'],
    }, runtime, {
      createRunId: () => 'run-market-scope',
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      discoverFixtures: async () => ({
        fixtures: [target],
        evaluations: [{
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchOddsSnapshot: async (_config, _providerFixtureId, _runtime, markets) => {
        observed.odds = markets ?? [];
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: 'odds-snapshot-1',
          providerSnapshotId: 'provider-snapshot-1',
          quoteRecordIds: {
            'test-book|double_chance|home_or_draw|': 'odds-quote-double',
          },
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: 'hash',
          quotes: [
            lowOddsQuoteFor(target, { market: 'double_chance', selection: 'home_or_draw', price: 1.12, impliedProbability: 1 / 1.12 }),
          ],
        };
      },
      discoverLowOddsFixtures: async () => ({
        fixtures: [target],
        evaluations: [{
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchLowOddsSnapshot: async (_config, _providerFixtureId, _runtime, markets) => {
        observed.lowOdds = markets ?? [];
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: 'odds-snapshot-1',
          providerSnapshotId: 'provider-snapshot-1',
          quoteRecordIds: {
            'test-book|h2h|home|': 'odds-quote-low-favorite',
          },
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: 'hash',
          quotes: [
            lowOddsQuoteFor(target, { market: 'h2h', selection: 'home', price: 1.12, impliedProbability: 1 / 1.12 }),
          ],
        };
      },
      researchFixture: async (_config, input) => {
        observed.research = input.markets ?? [];
        return {
          ok: true,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          bundle: {
            sources: [{ type: 'web-search', metadata: {}, url: 'https://example.com', capturedAt: '2026-04-29T12:00:00.000Z' }],
            metadata: { marketCoverage: { requiredMarkets: ['double_chance'], quotedMarkets: ['double_chance'], evidenceMarkets: ['double_chance'], skippedMarkets: [] } },
          },
        } as any;
      },
      scoreFixture: async (_config, input) => {
        observed.score = input.markets ?? [];
        return {
          ok: true,
          runId: 'run-market-scope',
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          predictions: [predictionRecord({
            runId: 'run-market-scope',
            fixtureId: target.id,
            providerFixtureId: target.providerFixtureId,
            oddsQuoteId: 'odds-quote-double',
            market: 'double_chance',
            selection: 'home_or_draw',
          })],
          marketCoverage: {
            requestedMarkets: ['double_chance'],
            quotedMarkets: ['double_chance'],
            predictedMarkets: ['double_chance'],
            skippedMarkets: [],
          },
        } as any;
      },
      buildParlay: async () => ({
        ok: false,
        runId: 'run-market-scope',
        date: '2026-04-29',
        gateResult: { verdict: 'blocked', reasons: ['no predictions found'], warnings: [] },
        build: {
          parlay: {
            id: 'parlay-1',
            sourceRunId: 'run-market-scope',
            legs: [],
            aggregateConfidence: 0,
            aggregateQuality: 0,
            rationale: 'test',
            warnings: [],
            status: 'blocked',
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
    });

    assert.deepEqual(observed.odds, ['double_chance']);
    assert.deepEqual(observed.lowOdds, ['h2h']);
    assert.deepEqual(observed.research, ['double_chance']);
    assert.deepEqual(observed.score, ['double_chance']);
    assert.equal(result.lowOddsScan.hitCount, 1);
    assert.equal(result.lowOddsScan.hits[0]?.market, 'h2h');
    assert.deepEqual(result.lowOddsScan.selectorMarketScope, ['h2h']);
    assert.deepEqual(result.lowOddsScan.analysisMarketScope, ['double_chance']);

    const inputArtifact = JSON.parse(readFileSync(join(result.artifactDir, 'input.json'), 'utf-8'));
    const lowOddsScan = JSON.parse(readFileSync(join(result.artifactDir, 'low-odds-scan.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    const manifest = JSON.parse(readFileSync(result.evidencePackPath, 'utf-8'));
    const handoff = readFileSync(result.handoffPath, 'utf-8');
    assert.deepEqual(inputArtifact.marketScope, ['double_chance']);
    assert.deepEqual(lowOddsScan.selectorMarketScope, ['h2h']);
    assert.deepEqual(lowOddsScan.analysisMarketScope, ['double_chance']);
    assert.equal(evaluation.lowOddsPredictionCoverage.complete, true);
    assert.equal(evaluation.lowOddsPredictionCoverage.predictedHitOddsQuoteIds, 1);
    assert.deepEqual(evaluation.marketCoverage.requestedMarkets, ['double_chance']);
    assert.deepEqual(evaluation.marketCoverage.lowOddsSelectorMarkets, ['h2h']);
    assert.deepEqual(evaluation.marketCoverage.lowOddsAnalysisMarkets, ['double_chance']);
    assert.equal(evaluation.webSearchCoverage.required, false);
    assert.deepEqual(manifest.marketCoverage.requestedMarkets, ['double_chance']);
    assert.equal(manifest.webSearchCoverage.required, false);
    assert.match(handoff, /marketCoverage:/);
    assert.match(handoff, /webSearchCoverage:/);
  });

  it('caps selected fixtures after low-odds expansion before live research and scoring', async () => {
    const config = testConfig();
    (config.apiFootball as any).maxFixturesPerRun = 2;
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const primaryA = fixture({ id: 'fixture-primary-a', providerFixtureId: '1001' });
    const primaryB = fixture({ id: 'fixture-primary-b', providerFixtureId: '1002' });
    const lowOnly = fixture({ id: 'fixture-low-only', providerFixtureId: '9001' });
    const researched: string[] = [];
    const scored: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      web: 'off',
      validate: false,
      markets: ['h2h'],
    }, runtime, {
      createRunId: () => 'run-selected-fixture-cap',
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      discoverFixtures: async () => ({
        fixtures: [primaryA, primaryB],
        evaluations: [primaryA, primaryB].map((target) => ({
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        })),
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchOddsSnapshot: async (_config, providerFixtureId) => {
        const target = providerFixtureId === primaryA.providerFixtureId ? primaryA : primaryB;
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: `odds-snapshot-${target.providerFixtureId}`,
          providerSnapshotId: `provider-snapshot-${target.providerFixtureId}`,
          quoteRecordIds: {
            [`test-book|h2h|home|`]: `odds-quote-${target.providerFixtureId}`,
          },
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: 'hash',
          quotes: [lowOddsQuoteFor(target, { price: 1.8, impliedProbability: 1 / 1.8 })],
        };
      },
      discoverLowOddsFixtures: async () => ({
        fixtures: [lowOnly],
        evaluations: [{
          fixtureId: lowOnly.id,
          providerFixtureId: lowOnly.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchLowOddsSnapshot: async () => ({
        fixtureId: lowOnly.id,
        providerFixtureId: lowOnly.providerFixtureId,
        oddsSnapshotId: 'odds-snapshot-low',
        providerSnapshotId: 'provider-snapshot-low',
        quoteRecordIds: {
          'test-book|h2h|home|': 'odds-quote-low',
        },
        capturedAt: '2026-04-29T12:00:00.000Z',
        bookmakerCount: 1,
        payloadHash: 'hash',
        quotes: [lowOddsQuoteFor(lowOnly, { price: 1.18, impliedProbability: 1 / 1.18 })],
      }),
      researchFixture: async (_config, input) => {
        researched.push(input.fixtureId);
        return { ok: true, gateResult: { verdict: 'promotable', reasons: [], warnings: [] } };
      },
      scoreFixture: async (_config, input) => {
        scored.push(input.fixtureId);
        return {
          ok: true,
          runId: 'run-selected-fixture-cap',
          fixtureId: input.fixtureId,
          providerFixtureId: input.fixtureId,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          predictions: [predictionRecord({
            runId: 'run-selected-fixture-cap',
            providerFixtureId: input.fixtureId,
            oddsQuoteId: `odds-quote-${input.fixtureId}`,
          })],
        } as any;
      },
      buildParlay: async () => ({
        ok: false,
        runId: 'run-selected-fixture-cap',
        date: '2026-04-29',
        gateResult: { verdict: 'blocked', reasons: ['no predictions found'], warnings: [] },
        build: {
          parlay: {
            id: 'parlay-1',
            sourceRunId: 'run-selected-fixture-cap',
            legs: [],
            aggregateConfidence: 0,
            aggregateQuality: 0,
            rationale: 'test',
            warnings: [],
            status: 'blocked',
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
    });

    assert.deepEqual(researched, ['9001', '1001']);
    assert.deepEqual(scored, ['9001', '1001']);

    const selected = JSON.parse(readFileSync(join(result.artifactDir, 'selected-fixtures.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(selected.mergedFixtures, 3);
    assert.equal(selected.selectedFixtures, 2);
    assert.equal(selected.capped, true);
    assert.match(selected.warnings.join('\n'), /selected fixtures capped from 3 to 2/);
    assert.equal(evaluation.counts.selectedFixtures, 2);
    assert.equal(evaluation.fixtureSelection.capped, true);
  });

  it('filters low-odds expanded fixtures to the requested local date before research and scoring', async () => {
    const config = testConfig();
    (config.apiFootball as any).maxFixturesPerRun = 5;
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const primary = fixture({
      id: 'fixture-primary-local-day',
      providerFixtureId: '1001',
      scheduledAt: '2026-04-29T18:00:00.000Z',
    });
    const previousLocalDay = fixture({
      id: 'fixture-previous-local-day',
      providerFixtureId: '9001',
      scheduledAt: '2026-04-29T01:00:00.000Z',
    });
    const sameLocalDayUtcNextDay = fixture({
      id: 'fixture-same-local-day-utc-next-day',
      providerFixtureId: '9002',
      scheduledAt: '2026-04-30T03:00:00.000Z',
    });
    const researched: string[] = [];
    const scored: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      web: 'off',
      validate: false,
      markets: ['h2h'],
    }, runtime, {
      createRunId: () => 'run-local-date-low-odds-filter',
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      discoverFixtures: async () => ({
        fixtures: [primary],
        evaluations: [{
          fixtureId: primary.id,
          providerFixtureId: primary.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        }],
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchOddsSnapshot: async () => ({
        fixtureId: primary.id,
        providerFixtureId: primary.providerFixtureId,
        oddsSnapshotId: 'odds-snapshot-primary',
        providerSnapshotId: 'provider-snapshot-primary',
        quoteRecordIds: {
          'test-book|h2h|home|': 'odds-quote-primary',
        },
        capturedAt: '2026-04-29T12:00:00.000Z',
        bookmakerCount: 1,
        payloadHash: 'hash-primary',
        quotes: [lowOddsQuoteFor(primary, { price: 1.8, impliedProbability: 1 / 1.8 })],
      }),
      discoverLowOddsFixtures: async () => ({
        fixtures: [previousLocalDay, sameLocalDayUtcNextDay],
        evaluations: [previousLocalDay, sameLocalDayUtcNextDay].map((target) => ({
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-manual-query'],
          excludedReasons: [],
          eligible: true,
        })),
        requestedLeagues: [],
        requestedTeams: [],
      }),
      fetchLowOddsSnapshot: async (_config, providerFixtureId) => {
        const target = providerFixtureId === previousLocalDay.providerFixtureId
          ? previousLocalDay
          : sameLocalDayUtcNextDay;
        return {
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          oddsSnapshotId: `odds-snapshot-${target.providerFixtureId}`,
          providerSnapshotId: `provider-snapshot-${target.providerFixtureId}`,
          quoteRecordIds: {
            'test-book|h2h|home|': `odds-quote-${target.providerFixtureId}`,
          },
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: `hash-${target.providerFixtureId}`,
          quotes: [lowOddsQuoteFor(target, { price: 1.18, impliedProbability: 1 / 1.18 })],
        };
      },
      researchFixture: async (_config, input) => {
        researched.push(input.fixtureId);
        return { ok: true, gateResult: { verdict: 'promotable', reasons: [], warnings: [] } };
      },
      scoreFixture: async (_config, input) => {
        scored.push(input.fixtureId);
        const scoredFixture = [primary, sameLocalDayUtcNextDay].find((fixture) => fixture.providerFixtureId === input.fixtureId);
        return {
          ok: true,
          runId: 'run-local-date-low-odds-filter',
          fixtureId: scoredFixture?.id ?? input.fixtureId,
          providerFixtureId: input.fixtureId,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          predictions: [predictionRecord({
            runId: 'run-local-date-low-odds-filter',
            fixtureId: scoredFixture?.id ?? input.fixtureId,
            providerFixtureId: input.fixtureId,
            oddsQuoteId: `odds-quote-${input.fixtureId}`,
          })],
        } as any;
      },
      buildParlay: async () => ({
        ok: false,
        runId: 'run-local-date-low-odds-filter',
        date: '2026-04-29',
        gateResult: { verdict: 'blocked', reasons: ['no predictions found'], warnings: [] },
        build: {
          parlay: {
            id: 'parlay-1',
            sourceRunId: 'run-local-date-low-odds-filter',
            legs: [],
            aggregateConfidence: 0,
            aggregateQuality: 0,
            rationale: 'test',
            warnings: [],
            status: 'blocked',
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
    });

    assert.deepEqual(researched, ['9002', '1001']);
    assert.deepEqual(scored, ['9002', '1001']);

    const selected = JSON.parse(readFileSync(join(result.artifactDir, 'selected-fixtures.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(selected.mergedFixtures, 3);
    assert.equal(selected.localDateEligibleFixtures, 2);
    assert.equal(selected.localDateExcludedFixtures, 1);
    assert.equal(selected.selectedFixtures, 2);
    assert.equal(selected.capped, false);
    assert.match(selected.warnings.join('\n'), /excluded 1 fixtures outside local date 2026-04-29 in timezone America\/Guatemala/);
    assert.deepEqual(selected.fixtures.map((item: { providerFixtureId: string }) => item.providerFixtureId), ['9002', '1001']);
    assert.equal(evaluation.counts.selectedFixtures, 2);
    assert.equal(evaluation.fixtureSelection.localDateExcludedFixtures, 1);
    assert.equal(evaluation.lowOddsPredictionCoverage.complete, true);
    assert.deepEqual(evaluation.lowOddsPredictionCoverage.missingIndicatorFixtureIds, []);
    assert.deepEqual(evaluation.lowOddsPredictionCoverage.excludedIndicatorFixtureIds, [previousLocalDay.id]);
  });

  it('tracks low-odds prediction coverage across all requested league presets', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const fixtures = [
      fixture({ id: 'fixture-serie-a', providerFixtureId: '135001' }),
      fixture({ id: 'fixture-mls', providerFixtureId: '253001' }),
    ];
    const scoreCalls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2026-04-29',
      validate: false,
    }, runtime, {
      createRunId: () => 'run-all-leagues-low-odds',
      now: () => new Date('2026-04-29T12:00:00.000Z'),
      discoverFixtures: async () => ({
        fixtures,
        evaluations: fixtures.map((target) => ({
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          includedReasons: ['included-by-default-league'],
          excludedReasons: [],
          eligible: true,
        })),
        requestedLeagues: [
          { providerCompetitionId: '135', name: 'Serie A', country: 'Italy', season: 2025 },
          { providerCompetitionId: '253', name: 'Major League Soccer', country: 'USA', season: 2026 },
        ],
        requestedTeams: [],
      }),
      fetchOddsSnapshot: async (_cfg, providerFixtureId) => {
        const target = fixtures.find((item) => item.providerFixtureId === providerFixtureId)!;
        const oddsQuoteId = `odds-quote-${providerFixtureId}`;
        return {
          fixtureId: target.id,
          providerFixtureId,
          oddsSnapshotId: `snapshot-${providerFixtureId}`,
          providerSnapshotId: `provider-snapshot-${providerFixtureId}`,
          quoteRecordIds: { 'test-book|h2h|home|': oddsQuoteId },
          capturedAt: '2026-04-29T12:00:00.000Z',
          bookmakerCount: 1,
          payloadHash: `hash-${providerFixtureId}`,
          quotes: [lowOddsQuote(target)],
        };
      },
      researchFixture: async () => ({
        ok: true,
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
      }),
      scoreFixture: async (_cfg, input) => {
        scoreCalls.push(input.fixtureId);
        const target = fixtures.find((item) => item.providerFixtureId === input.fixtureId)!;
        return {
          ok: true,
          runId: 'run-all-leagues-low-odds',
          fixtureId: target.id,
          providerFixtureId: target.providerFixtureId,
          gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
          predictions: [predictionRecord({
            runId: 'run-all-leagues-low-odds',
            fixtureId: target.id,
            providerFixtureId: target.providerFixtureId,
            oddsQuoteId: `odds-quote-${target.providerFixtureId}`,
          })],
        };
      },
      buildParlay: async () => ({
        ok: true,
        runId: 'run-all-leagues-low-odds',
        date: '2026-04-29',
        gateResult: { verdict: 'review-required', reasons: [], warnings: [] },
        build: {
          parlay: {
            id: 'parlay-1',
            sourceRunId: 'run-all-leagues-low-odds',
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
    });

    assert.deepEqual(scoreCalls.sort(), ['135001', '253001']);

    const lowOddsScan = JSON.parse(readFileSync(join(result.artifactDir, 'low-odds-scan.json'), 'utf-8'));
    const evaluation = JSON.parse(readFileSync(join(result.artifactDir, 'evaluation.json'), 'utf-8'));
    assert.equal(lowOddsScan.requestedLeagues.length, 2);
    assert.deepEqual(lowOddsScan.requestedLeagues.map((league: { season: number }) => league.season), [2025, 2026]);
    assert.equal(evaluation.counts.lowOddsHits, 2);
    assert.equal(evaluation.lowOddsPredictionCoverage.predictedHitOddsQuoteIds, 2);
    assert.equal(evaluation.lowOddsPredictionCoverage.complete, true);
  });

  it('forces validation for future dates when requested', async () => {
    const config = testConfig();
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const calls: string[] = [];

    const result = await executeRunPipeline(config, {
      date: '2099-01-01',
      validate: 'force',
    }, runtime, successfulPipelineDeps({
      target: fixture({ scheduledAt: '2099-01-01T18:00:00.000Z' }),
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
      target: fixture({ scheduledAt: '2099-01-01T18:00:00.000Z' }),
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
    const tasks = JSON.parse(readFileSync(join(result.artifactDir, 'tasks.json'), 'utf-8'));
    const validationTask = tasks.find((task: any) => task.type === 'validation.run');
    assert.equal(evaluation.counts.validations, 0);
    assert.equal(evaluation.validation.mode, 'auto');
    assert.equal(evaluation.validation.status, 'skipped');
    assert.equal(evaluation.validation.reason, 'future-date');
    assert.equal(evaluation.validation.validations, 0);
    assert.equal(validationTask.status, 'succeeded');
    assert.equal(validationTask.gateResult.reason, 'skipped:future-date');

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
