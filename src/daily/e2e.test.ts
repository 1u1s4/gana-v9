import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import { runDailyE2E } from './e2e.js';

function context() {
  const root = mkdtempSync(join(tmpdir(), 'gana-daily-e2e-test-'));
  const config = loadConfig({
    artifactRoot: join(root, 'artifacts'),
    databaseUrl: '',
    provider: 'codex',
    model: 'gpt-5.5',
    apiFootball: {
      maxFixturesPerRun: 80,
      maxAgenticResearchCallsPerRun: 80,
    },
  }, { skipApiKey: true });
  return {
    config,
    runtime: createRuntimeContext(config, join(root, 'session.jsonl')),
  };
}

describe('runDailyE2E', () => {
  it('orchestrates Codex and Gemini runs, mixed parlays, recommendations, metrics, and batch artifacts', async () => {
    const ctx = context();
    const pipelineCalls: any[] = [];
    const parlayCalls: any[] = [];
    const analysisCalls: any[] = [];
    const metricsCalls: any[] = [];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-14',
      providers: ['codex', 'gemini'],
      maxFixtures: 12,
      threshold: 1.2,
      web: 'live',
      parlayProfile: 'balanced',
      persistMetrics: true,
      dailyBatchId: 'daily-2026-05-14',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input, runtime, deps) => {
        pipelineCalls.push({ provider: config.provider, model: config.model, input, runtime, deps });
        const runId = `${config.provider}-run`;
        return {
          ok: true,
          runId,
          date: input.date,
          status: 'succeeded',
          verdict: 'promotable',
          artifactDir: join(ctx.config.artifactRoot, 'runs', runId),
          artifactPath: join(ctx.config.artifactRoot, 'runs', runId),
          evidencePackPath: join(ctx.config.artifactRoot, 'evidence-packs', runId, 'manifest.json'),
          handoffPath: join(ctx.config.artifactRoot, 'handoffs', `${runId}.md`),
          steps: [],
          fixtures: [],
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [],
          parlay: {
            ok: true,
            runId,
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            build: { parlay: { legs: [] } },
            artifactPath: `/tmp/${runId}/parlays.json`,
            persistedParlayIds: [`${config.provider}-parlay`],
          },
        } as any;
      },
      buildParlay: async (_config, input, runtime) => {
        parlayCalls.push({ input, runId: runtime.runId });
        return {
          ok: true,
          runId: runtime.runId ?? 'parlay-run',
          date: input.date,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 2.1, aggregateConfidence: 0.7, aggregateQuality: 0.8 } },
          artifactPath: `/tmp/${runtime.runId}/parlays.json`,
          persistedParlayIds: [`${runtime.runId}-persisted`],
        } as any;
      },
      analyzeParlays: async (_config, input, runtime) => {
        analysisCalls.push({ input, runId: runtime.runId });
        return {
          ok: true,
          runId: runtime.runId ?? 'analysis-run',
          date: input.date,
          analyzed: 3,
          top: [],
          diagnostics: {
            generatedAt: '2026-05-14T00:00:00.000Z',
            analyticalArtifactOnly: true,
            executionCapability: 'none',
            profileScope: 'all',
            rawAnalyzed: 3,
            profileScopedAnalyzed: 3,
            exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' },
            bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' },
            universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 3, settled: 0, hitRate: null },
            selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 },
            rejected: [],
          },
        } as any;
      },
      buildDailyMetrics: async (_config, input, runtime) => {
        metricsCalls.push({ input, runId: runtime.runId });
        return {
          ok: true,
          runId: runtime.runId ?? 'metrics-run',
          date: input.date,
          days: input.days ?? 1,
          scope: input.scope ?? 'global',
          metrics: [],
          persisted: 1,
          artifactPath: `/tmp/${runtime.runId}/daily-metrics.json`,
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.dailyBatchId, 'daily-2026-05-14');
    assert.deepEqual(pipelineCalls.map((call) => call.provider), ['codex', 'gemini']);
    assert.equal(pipelineCalls[0].input.metadata.dailyBatchId, 'daily-2026-05-14');
    assert.equal(pipelineCalls[1].input.metadata.dailyRole, 'gemini');
    assert.equal(pipelineCalls[0].input.markets.length > 0, true);
    assert.equal(pipelineCalls[0].runtime.runId, undefined);
    assert.equal(pipelineCalls[0].deps, pipelineCalls[1].deps);
    assert.deepEqual(parlayCalls.map((call) => call.input.sourceRunIds).filter(Boolean), [['codex-run', 'gemini-run']]);
    assert.equal(parlayCalls.some((call) => call.input.sourceRunId === 'codex-run' && call.input.portfolio === 'balanced'), true);
    assert.equal(parlayCalls.some((call) => call.input.sourceRunId === 'gemini-run' && call.input.portfolio === 'balanced'), true);
    assert.deepEqual(analysisCalls[0].input.runIds.includes('codex-run'), true);
    assert.deepEqual(analysisCalls[0].input.runIds.includes('gemini-run'), true);
    assert.equal(metricsCalls[0].input.scope, 'daily-2026-05-14');

    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf-8'));
    assert.equal(summary.analyticalArtifactOnly, true);
    assert.equal(summary.executionCapability, 'none');
    assert.equal(summary.sharedInputs.maxFixturesPerRun, 12);
    assert.equal(summary.sharedInputs.lowOddsThreshold, 1.2);
    assert.match(readFileSync(result.reportPath, 'utf-8'), /Artifact analitico\. No ejecuta apuestas/);
    const recommendations = JSON.parse(readFileSync(join(result.artifactDir, 'daily-parlay-recommendations.json'), 'utf-8'));
    assert.equal(recommendations.executionCapability, 'none');
  });

  it('rejects non-native daily providers before running', async () => {
    const ctx = context();
    await assert.rejects(
      runDailyE2E(ctx.config, {
        date: '2026-05-14',
        providers: ['codex', 'openrouter' as any],
      }, ctx.runtime, {
        runPipeline: async () => {
          throw new Error('should not run');
        },
      }),
      /codex,gemini/,
    );
  });
});
