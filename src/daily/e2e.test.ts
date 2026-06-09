import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
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
      providerConcurrency: 2,
      maxFixtures: 12,
      threshold: 1.2,
      web: 'live',
      parlayProfile: 'balanced',
      persistMetrics: true,
      dailyBatchId: 'daily-2026-05-14',
      models: { gemini: 'gemini-3.1-pro' },
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input, runtime, deps) => {
        pipelineCalls.push({ provider: config.provider, model: config.model, input, runtime, deps });
        const runId = `${config.provider}-run`;
        const predictions = config.provider === 'codex' ? [highConfidencePrediction(runId)] : [];
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
          fixtures: [fixture()],
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [{
            ok: true,
            runId,
            fixtureId: 'fixture-1',
            providerFixtureId: 'provider-fixture-1',
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            predictions,
          }],
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
    assert.deepEqual(result.recommendations, { total: 1, parlays: 0, atomic: 1 });
    assert.deepEqual(pipelineCalls.map((call) => call.provider), ['codex', 'gemini']);
    assert.equal(pipelineCalls[0].model, 'gpt-5.5');
    assert.equal(pipelineCalls[1].model, 'gemini-3.1-pro');
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
    assert.deepEqual(summary.sharedInputs.providerModels, { codex: 'gpt-5.5', gemini: 'gemini-3.1-pro' });
    assert.equal(summary.counts.recommendations, 1);
    assert.equal(summary.counts.atomicRecommendations, 1);
    assert.equal(summary.providerComparison.summary.comparablePredictions, 1);
    assert.equal(summary.runDiagnostics.emptyRun, false);
    assert.equal(summary.runDiagnostics.totalProviderPredictions, 1);
    const report = readFileSync(result.reportPath, 'utf-8');
    assert.match(report, /total: 1/);
    assert.match(report, /simples: 1/);
    assert.match(report, /emptyRun: false/);
    assert.match(report, /Artifact analitico\. No ejecuta apuestas/);
    const recommendations = JSON.parse(readFileSync(join(result.artifactDir, 'daily-parlay-recommendations.json'), 'utf-8'));
    assert.equal(recommendations.executionCapability, 'none');
    assert.equal(recommendations.runDiagnostics.emptyRun, false);
    assert.equal(recommendations.recommendations[0].kind, 'atomic-prediction');
    assert.equal(recommendations.recommendations[0].stakeRecommendation.stake, 10);
    assert.equal(recommendations.recommendations[0].stakeRecommendation.percentOfBankroll, 0.1);
    assert.deepEqual(recommendations.recommendationPolicy.stakeRecommendation.allowedStakes, [1, 5, 10, 15, 20, 25]);
    assert.equal(recommendations.atomicRecommendations[0].legs[0].fixture, 'Team A vs Team B');
    assert.deepEqual(recommendations.atomicRecommendations[0].legs[0].display, {
      awayTeamName: 'Team B',
      fixtureLabel: 'Team A vs Team B',
      homeTeamName: 'Team A',
      kickoffLocal: '2026-05-14T16:00:00.000Z',
    });
    assert.equal(recommendations.recommendationPolicy.portfolioBuckets.includes('corners-watchlist'), true);
    const progress = JSON.parse(readFileSync(join(result.artifactDir, 'daily-progress.json'), 'utf-8'));
    assert.equal(progress.phase, 'completed');
    assert.equal(progress.providerConcurrency, 2);
    assert.equal(progress.providers.codex.predictions, 1);
    assert.equal(progress.providers.codex.promotable, 1);
    const comparison = JSON.parse(readFileSync(join(result.artifactDir, 'daily-provider-comparison.json'), 'utf-8'));
    assert.equal(comparison.executionCapability, 'none');
    const consensus = JSON.parse(readFileSync(join(result.artifactDir, 'daily-provider-consensus.json'), 'utf-8'));
    assert.equal(consensus.analyticalArtifactOnly, true);
  });

  it('hydrates recommendation display labels from persisted fixture artifacts before in-memory IDs', async () => {
    const ctx = context();

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-14',
      providers: ['codex'],
      persistMetrics: false,
      dailyBatchId: 'daily-display-hydration',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => {
        const runId = `${config.provider}-run`;
        const artifactDir = join(ctx.config.artifactRoot, 'runs', runId);
        mkdirSync(artifactDir, { recursive: true });
        writeFileSync(join(artifactDir, 'fixtures.json'), JSON.stringify({ fixtures: [fixture()] }));
        return {
          ok: true,
          runId,
          date: input.date,
          status: 'succeeded',
          verdict: 'promotable',
          artifactDir,
          artifactPath: artifactDir,
          evidencePackPath: '/tmp/evidence.json',
          handoffPath: '/tmp/handoff.md',
          steps: [],
          fixtures: [{
            ...fixture(),
            homeTeamId: 'a261fa9e-d768-4f76-a870-cce18505194a',
            awayTeamId: 'ec3bd773-bb11-47f9-93ed-039d264e70a4',
            homeTeamName: 'a261fa9e-d768-4f76-a870-cce18505194a',
            awayTeamName: 'ec3bd773-bb11-47f9-93ed-039d264e70a4',
          }],
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [{
            ok: true,
            runId,
            fixtureId: 'fixture-1',
            providerFixtureId: 'provider-fixture-1',
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            predictions: [highConfidencePrediction(runId)],
          }],
          parlay: {
            ok: true,
            runId,
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            build: { parlay: { legs: [] } },
            persistedParlayIds: ['codex-parlay'],
          },
        } as any;
      },
      buildParlay: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'parlay-run',
        date: input.date,
        gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
        build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 1.4, aggregateConfidence: 0.8, aggregateQuality: 0.8 } },
        persistedParlayIds: [`${runtime.runId}-persisted`],
      }) as any,
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: input.runIds?.length ?? 0,
        top: [],
        diagnostics: { generatedAt: '2026-05-14T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 1, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    const recommendations = JSON.parse(readFileSync(join(result.artifactDir, 'daily-parlay-recommendations.json'), 'utf-8'));
    assert.equal(recommendations.atomicRecommendations[0].legs[0].fixture, 'Team A vs Team B');
    assert.equal(recommendations.atomicRecommendations[0].legs[0].display.fixtureLabel, 'Team A vs Team B');
  });

  it('composes daily parlays from council-kept simples when candidate parlays are rejected', async () => {
    const ctx = context();
    const fixtures = [
      fixture('2026-05-21T16:00:00.000Z'),
      { ...fixture('2026-05-21T17:00:00.000Z'), id: 'fixture-2', homeTeamName: 'Team C', awayTeamName: 'Team D' },
      { ...fixture('2026-05-21T18:00:00.000Z'), id: 'fixture-3', homeTeamName: 'Team E', awayTeamName: 'Team F' },
      { ...fixture('2026-05-21T19:00:00.000Z'), id: 'fixture-4', homeTeamName: 'Team G', awayTeamName: 'Team H' },
    ];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-21',
      providers: ['codex'],
      parlayProfile: 'portfolio-v2',
      persistMetrics: false,
      dailyBatchId: 'daily-council-composed-parlays',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => {
        const runId = `${config.provider}-run`;
        return {
          ok: true,
          runId,
          date: input.date,
          status: 'succeeded',
          verdict: 'promotable',
          artifactDir: join(ctx.config.artifactRoot, 'runs', runId),
          artifactPath: join(ctx.config.artifactRoot, 'runs', runId),
          evidencePackPath: '/tmp/evidence.json',
          handoffPath: '/tmp/handoff.md',
          steps: [],
          fixtures,
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: fixtures.length, hitCount: 0, hits: [], candidateFixtures: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [{
            ok: true,
            runId,
            fixtureId: 'fixture-1',
            providerFixtureId: 'provider-fixture-1',
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            predictions: [
              highConfidencePrediction(runId),
              {
                ...highConfidencePrediction(runId),
                id: 'prediction-atomic-2',
                fixtureId: 'fixture-2',
                providerFixtureId: 'provider-fixture-2',
                odds: 1.65,
                edge: 0.08,
                confidence: 0.91,
                selection: 'away',
              },
              {
                ...highConfidencePrediction(runId),
                id: 'prediction-atomic-3',
                fixtureId: 'fixture-3',
                providerFixtureId: 'provider-fixture-3',
                odds: 1.45,
                edge: 0.05,
                confidence: 0.9,
                market: 'goals_over_under',
                selection: 'over',
                line: 2.5,
              },
              {
                ...highConfidencePrediction(runId),
                id: 'prediction-atomic-4',
                fixtureId: 'fixture-4',
                providerFixtureId: 'provider-fixture-4',
                odds: 1.48,
                edge: 0.04,
                confidence: 0.9,
              },
            ],
          }],
          parlay: {
            ok: true,
            runId,
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            build: { parlay: { legs: [] } },
            persistedParlayIds: ['codex-parlay'],
          },
        } as any;
      },
      buildParlay: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'parlay-run',
        date: input.date,
        gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
        build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 1.4, aggregateConfidence: 0.8, aggregateQuality: 0.8 } },
        persistedParlayIds: [`${runtime.runId}-persisted`],
      }) as any,
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: input.runIds?.length ?? 0,
        top: [parlayRecommendation({
          rank: 1,
          parlayId: 'bad-negative-edge-parlay',
          profile: 'low-variance',
          combinedOdds: 1.55,
          aggregateConfidence: 0.55,
          adjustedProbability: 0.55,
          expectedEdge: -0.14,
          predictionId: 'external-parlay-leg-1',
        })],
        diagnostics: { generatedAt: '2026-05-21T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 1, unvalidated: 0, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    const recommendations = JSON.parse(readFileSync(join(result.artifactDir, 'daily-parlay-recommendations.json'), 'utf-8'));
    assert.equal(recommendations.parlayRecommendations.length >= 1, true);
    assert.equal(recommendations.parlayRecommendations[0].riskFlags.includes('council-composed'), true);
    assert.equal(recommendations.parlayRecommendations[0].legs.length, 2);
    assert.equal(recommendations.recommendations.some((item: any) => item.kind === 'parlay'), true);
  });

  it('limits final parlays to four, prefers the diamante safety window, and excludes used legs from simples', async () => {
    const ctx = context();
    const duplicateLowVarianceLegs = parlayRecommendation({ predictionId: 'prediction-low-variance' }).legs.map((leg: any, index: number) => ({
      ...leg,
      predictionId: `prediction-low-variance-duplicate-${index}`,
    }));
    const analysisTop = [
      parlayRecommendation({ rank: 1, parlayId: 'balanced-1', profile: 'balanced', combinedOdds: 1.8, predictionId: 'prediction-balanced-1' }),
      parlayRecommendation({ rank: 2, parlayId: 'balanced-2', profile: 'balanced', combinedOdds: 1.9, predictionId: 'prediction-extra-balanced' }),
      parlayRecommendation({ rank: 3, parlayId: 'diamante-1', profile: 'parlay-diamante', combinedOdds: 1.12, predictionId: 'prediction-atomic-1' }),
      parlayRecommendation({ rank: 4, parlayId: 'low-variance-1', profile: 'low-variance', combinedOdds: 1.4, predictionId: 'prediction-low-variance' }),
      parlayRecommendation({ rank: 5, parlayId: 'high-odds-1', profile: 'high-conviction', combinedOdds: 2.6, aggregateConfidence: 0.95, expectedEdge: 0.2, predictionId: 'prediction-high-odds' }),
      parlayRecommendation({ rank: 6, parlayId: 'market-diverse-duplicate', profile: 'market-diverse', combinedOdds: 1.85, predictionId: 'prediction-market-diverse', legs: duplicateLowVarianceLegs }),
      parlayRecommendation({ rank: 7, parlayId: 'high-conviction-1', profile: 'high-conviction', combinedOdds: 1.7, predictionId: 'prediction-high-conviction' }),
      parlayRecommendation({ rank: 8, parlayId: 'low-odds-top-1', profile: 'low-odds-top', combinedOdds: 1.35, aggregateConfidence: 0.82, expectedEdge: 0.08, predictionId: 'prediction-low-odds-top' }),
    ];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-19',
      providers: ['codex'],
      parlayProfile: 'balanced',
      persistMetrics: false,
      dailyBatchId: 'daily-final-selection-policy',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => {
        const runId = `${config.provider}-run`;
        const firstFixture = fixture('2026-05-19T16:00:00.000Z');
        const secondFixture = { ...fixture('2026-05-19T18:00:00.000Z'), id: 'fixture-2', homeTeamName: 'Team C', awayTeamName: 'Team D' };
        return {
          ok: true,
          runId,
          date: input.date,
          status: 'succeeded',
          verdict: 'promotable',
          artifactDir: join(ctx.config.artifactRoot, 'runs', runId),
          artifactPath: join(ctx.config.artifactRoot, 'runs', runId),
          evidencePackPath: '/tmp/evidence.json',
          handoffPath: '/tmp/handoff.md',
          steps: [],
          fixtures: [firstFixture],
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 1, hitCount: 0, hits: [], candidateFixtures: [secondFixture], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [{
            ok: true,
            runId,
            fixtureId: 'fixture-1',
            providerFixtureId: 'provider-fixture-1',
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            predictions: [
              highConfidencePrediction(runId),
              {
                ...highConfidencePrediction(runId),
                id: 'prediction-atomic-2',
                fixtureId: 'fixture-2',
                providerFixtureId: 'provider-fixture-2',
                selection: 'away',
                odds: 1.18,
                edge: 0.08,
                confidence: 0.94,
              },
            ],
          }],
          parlay: {
            ok: true,
            runId,
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            build: { parlay: { legs: [] } },
            persistedParlayIds: ['codex-parlay'],
          },
        } as any;
      },
      buildParlay: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'parlay-run',
        date: input.date,
        gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
        build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 1.8, aggregateConfidence: 0.8, aggregateQuality: 0.8 } },
        persistedParlayIds: [`${runtime.runId}-persisted`],
      }) as any,
      analyzeParlays: async (_config, input, runtime) => {
        assert.equal(input.top, 12);
        return {
          ok: true,
          runId: runtime.runId ?? 'analysis-run',
          date: input.date,
          analyzed: analysisTop.length,
          top: analysisTop,
          diagnostics: { generatedAt: '2026-05-19T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 6, profileScopedAnalyzed: 6, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 6, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 5, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
        } as any;
      },
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.recommendations.parlays >= 1, true);
    assert.equal(result.recommendations.atomic >= 1, true);
    const recommendations = JSON.parse(readFileSync(join(result.artifactDir, 'daily-parlay-recommendations.json'), 'utf-8'));
    assert.equal(recommendations.parlayRecommendations.length, 3);
    assert.equal(recommendations.parlayRecommendations[0].profile, 'parlay-diamante');
    assert.deepEqual(recommendations.parlayRecommendations.map((item: any) => item.rank), [1, 2, 3]);
    assert.equal(recommendations.parlayRecommendations.some((item: any) => item.parlayId === 'balanced-2'), false);
    assert.equal(recommendations.parlayRecommendations.some((item: any) => item.parlayId === 'high-odds-1'), false);
    assert.equal(recommendations.parlayRecommendations.some((item: any) => item.parlayId === 'market-diverse-duplicate'), false);
    assert.equal(recommendations.parlayRecommendations.some((item: any) => item.parlayId === 'high-conviction-1'), false);
    assert.equal(recommendations.parlayRecommendations.some((item: any) => item.parlayId === 'low-odds-top-1'), true);
    assert.deepEqual(recommendations.atomicRecommendations.map((item: any) => item.predictionId), ['prediction-atomic-2']);
    assert.equal(recommendations.atomicRecommendations[0].legs[0].fixture, 'Team C vs Team D');
    assert.deepEqual(recommendations.atomicRecommendations[0].legs[0].display, {
      awayTeamName: 'Team D',
      fixtureLabel: 'Team C vs Team D',
      homeTeamName: 'Team C',
      kickoffLocal: '2026-05-19T18:00:00.000Z',
    });
    assert.equal(recommendations.recommendationPolicy.atomicExcludesSelectedParlayLegs, true);
    assert.equal(recommendations.recommendationPolicy.parlayRecommendationLimit, 4);
    assert.equal(recommendations.recommendationPolicy.parlayAnalysisTop, 12);
    assert.equal(recommendations.recommendationPolicy.atomicRecommendationLimit, 10);
    assert.equal(recommendations.recommendationPolicy.parlayConservativeGate.maxCombinedOdds, 2.2);
    assert.equal(recommendations.recommendationPolicy.parlayConservativeGate.semanticDuplicateSignature, 'fixtureId:market:selection:line');
    assert.deepEqual(recommendations.recommendationPolicy.parlayConservativeGate.allowedProfiles, ['parlay-diamante', 'parlay-all-in', 'low-odds-top', 'low-variance']);
    assert.equal(recommendations.recommendationPolicy.atomicExcludesSelectedParlayFixtures, true);
    assert.deepEqual(recommendations.recommendationPolicy.demotedModels, ['gpt-5.4-mini']);
    assert.equal(recommendations.recommendationPolicy.stakeRecommendation.policy, 'bucketed-bankroll-percentage-confidence-edge-recommendation');
    assert.equal(recommendations.recommendations.every((item: any) => [1, 5, 10, 15, 20, 25].includes(item.stakeRecommendation.stake)), true);
    assert.equal(
      Number(recommendations.recommendations.reduce((sum: number, item: any) => sum + item.stakeRecommendation.percentOfBankroll, 0).toFixed(6)) < 1,
      true,
    );
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf-8'));
    assert.equal(summary.counts.parlayRecommendations, 3);
    assert.equal(summary.counts.atomicRecommendations, 1);
  });

  it('blocks weak analytical fallback recommendations when strict promotion gates select none', async () => {
    const ctx = context();
    const fixtures = [
      fixture('2026-05-20T16:00:00.000Z'),
      { ...fixture('2026-05-20T18:00:00.000Z'), id: 'fixture-2', providerFixtureId: 'provider-fixture-2', homeTeamName: 'Team C', awayTeamName: 'Team D' },
      { ...fixture('2026-05-20T20:00:00.000Z'), id: 'fixture-3', providerFixtureId: 'provider-fixture-3', homeTeamName: 'Team E', awayTeamName: 'Team F' },
      { ...fixture('2026-05-20T22:00:00.000Z'), id: 'fixture-4', providerFixtureId: 'provider-fixture-4', homeTeamName: 'Team G', awayTeamName: 'Team H' },
      { ...fixture('2026-05-20T23:00:00.000Z'), id: 'fixture-5', providerFixtureId: 'provider-fixture-5', homeTeamName: 'Team I', awayTeamName: 'Team J' },
    ];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-20',
      providers: ['codex'],
      parlayProfile: 'portfolio-v2',
      persistMetrics: false,
      dailyBatchId: 'daily-analytical-fallback-output',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => {
        const runId = `${config.provider}-run`;
        return {
          ok: true,
          runId,
          date: input.date,
          status: 'succeeded',
          verdict: 'review-required',
          artifactDir: join(ctx.config.artifactRoot, 'runs', runId),
          artifactPath: join(ctx.config.artifactRoot, 'runs', runId),
          evidencePackPath: '/tmp/evidence.json',
          handoffPath: '/tmp/handoff.md',
          steps: [],
          fixtures,
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: fixtures.length, hitCount: 0, hits: [], candidateFixtures: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [{
            ok: true,
            runId,
            fixtureId: 'fixture-1',
            providerFixtureId: 'provider-fixture-1',
            gateResult: { verdict: 'review-required', reasons: ['manual review required'], warnings: [] },
            predictions: [
              fallbackPrediction(runId, 'fallback-prediction-1', 'fixture-1', { odds: 1.42, confidence: 0.66, market: 'h2h', selection: 'home' }),
              fallbackPrediction(runId, 'fallback-prediction-2', 'fixture-2', { odds: 1.36, confidence: 0.64, market: 'goals_over_under', selection: 'over', line: 2.5 }),
              fallbackPrediction(runId, 'fallback-prediction-3', 'fixture-3', { odds: 1.55, confidence: 0.62, market: 'btts', selection: 'yes' }),
              fallbackPrediction(runId, 'fallback-prediction-4', 'fixture-4', { odds: 1.48, confidence: 0.6, market: 'h2h', selection: 'away' }),
              fallbackPrediction(runId, 'fallback-prediction-5', 'fixture-5', { odds: 1.52, confidence: 0.58, market: 'double_chance', selection: 'home_or_draw' }),
            ],
          }],
          parlay: {
            ok: false,
            runId,
            gateResult: { verdict: 'blocked', reasons: ['strict parlay gate found no promotion-safe build'], warnings: [] },
            build: { parlay: { legs: [] } },
            persistedParlayIds: [],
          },
        } as any;
      },
      buildParlay: async (_config, input, runtime) => ({
        ok: false,
        runId: runtime.runId ?? 'parlay-run',
        date: input.date,
        gateResult: { verdict: 'blocked', reasons: ['no valid analytical parlays generated'], warnings: [] },
        build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 0, aggregateConfidence: 0, aggregateQuality: 0 } },
        persistedParlayIds: [],
      }) as any,
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: input.runIds?.length ?? 0,
        top: [],
        diagnostics: { generatedAt: '2026-05-20T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 1, unvalidated: 0, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [{ parlayId: 'strict-parlay-1', reasons: ['strict gate rejected all candidates'] }] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, false);
    const recommendations = JSON.parse(readFileSync(join(result.artifactDir, 'daily-parlay-recommendations.json'), 'utf-8'));
    assert.equal(recommendations.councilCandidateRecommendations.length >= 1, true);
    assert.equal(recommendations.parlayRecommendations.length, 0);
    assert.equal(recommendations.atomicRecommendations.length, 0);
    assert.equal(recommendations.recommendations.length, 0);
    assert.equal(recommendations.council.rejectedCount >= 1, true);
    assert.equal(recommendations.recommendationPolicy.fallbackRecommendations.enabled, true);
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf-8'));
    assert.equal(summary.status, 'failed');
    assert.equal(summary.verdict, 'review-required');
    assert.equal(summary.counts.strictParlayRecommendations, 0);
    assert.equal(summary.counts.fallbackParlayRecommendations, 0);
    assert.equal(summary.counts.strictAtomicRecommendations, 0);
    assert.equal(summary.counts.fallbackAtomicRecommendations, 0);
    assert.equal(summary.counts.councilRejected >= 1, true);
  });

  it('keeps useful output when one parallel provider throws', async () => {
    const ctx = context();

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-14',
      providers: ['codex', 'gemini'],
      providerConcurrency: 2,
      persistMetrics: false,
      dailyBatchId: 'daily-partial-provider',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => {
        if (config.provider === 'codex') throw new Error('codex provider blocked');
        return {
          ok: true,
          runId: `${config.provider}-run`,
          date: input.date,
          status: 'succeeded',
          verdict: 'promotable',
          artifactDir: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
          artifactPath: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
          evidencePackPath: '/tmp/evidence.json',
          handoffPath: '/tmp/handoff.md',
          steps: [],
          fixtures: [],
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [],
          parlay: {
            ok: true,
            runId: `${config.provider}-run`,
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            build: { parlay: { legs: [] } },
            persistedParlayIds: ['gemini-parlay'],
          },
        } as any;
      },
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: 1,
        top: [],
        diagnostics: { generatedAt: '2026-05-14T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 1, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.providers.find((provider) => provider.provider === 'codex')?.ok, false);
    assert.equal(result.providers.find((provider) => provider.provider === 'gemini')?.ok, true);
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf-8'));
    assert.equal(summary.verdict, 'review-required');
    assert.equal(summary.parlays.some((family: any) => family.family === 'gemini-only' && family.ok), true);
    const progress = JSON.parse(readFileSync(join(result.artifactDir, 'daily-progress.json'), 'utf-8'));
    assert.equal(progress.providers.codex.status, 'blocked');
    assert.equal(progress.providers.gemini.status, 'completed');
  });

  it('uses blocked provider runs for mixed parlays when scoring produced predictions', async () => {
    const ctx = context();
    const parlayCalls: any[] = [];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-18',
      providers: ['codex', 'gemini'],
      parlayProfile: 'balanced',
      persistMetrics: false,
      dailyBatchId: 'daily-usable-blocked-provider',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => {
        const runId = `${config.provider}-run`;
        return {
          ok: config.provider !== 'codex',
          runId,
          date: input.date,
          status: config.provider === 'codex' ? 'failed' : 'succeeded',
          verdict: config.provider === 'codex' ? 'blocked' : 'promotable',
          artifactDir: join(ctx.config.artifactRoot, 'runs', runId),
          artifactPath: join(ctx.config.artifactRoot, 'runs', runId),
          evidencePackPath: '/tmp/evidence.json',
          handoffPath: '/tmp/handoff.md',
          steps: [],
          fixtures: [fixture('2026-05-18T16:00:00.000Z')],
          lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
          oddsSnapshots: [],
          research: [],
          scoring: [{
            ok: true,
            runId,
            fixtureId: 'fixture-1',
            providerFixtureId: 'provider-fixture-1',
            gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
            predictions: [highConfidencePrediction(runId)],
          }],
          parlay: {
            ok: false,
            runId,
            gateResult: { verdict: 'blocked', reasons: ['no valid analytical parlays generated'], warnings: [] },
            build: { parlay: { legs: [] } },
            persistedParlayIds: [],
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
          build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 1.8, aggregateConfidence: 0.8, aggregateQuality: 0.8 } },
          persistedParlayIds: [`${runtime.runId}-persisted`],
        } as any;
      },
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: input.runIds?.length ?? 0,
        top: [],
        diagnostics: { generatedAt: '2026-05-18T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 1, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.providers.find((provider) => provider.provider === 'codex')?.ok, false);
    assert.equal(parlayCalls.some((call) =>
      call.input.sourceRunIds?.includes('codex-run') && call.input.sourceRunIds?.includes('gemini-run')
    ), true);
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf-8'));
    assert.equal(summary.parlays.some((family: any) =>
      family.family === 'consensus-mixed' && family.sourceRunIds.includes('codex-run') && family.sourceRunIds.includes('gemini-run')
    ), true);
  });

  it('keeps a valid provider-only daily run review-required when mixed consensus is unavailable', async () => {
    const ctx = context();
    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-14',
      providers: ['codex'],
      persistMetrics: false,
      dailyBatchId: 'daily-codex-only',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => ({
        ok: true,
        runId: `${config.provider}-run`,
        date: input.date,
        status: 'succeeded',
        verdict: 'promotable',
        artifactDir: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
        artifactPath: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
        evidencePackPath: '/tmp/evidence.json',
        handoffPath: '/tmp/handoff.md',
        steps: [],
        fixtures: [],
        lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
        oddsSnapshots: [],
        research: [],
        scoring: [],
        parlay: {
          ok: true,
          runId: `${config.provider}-run`,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          build: { parlay: { legs: [] } },
          persistedParlayIds: ['codex-parlay'],
        },
      }) as any,
      buildParlay: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'codex-parlay-run',
        date: input.date,
        gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
        build: { parlay: { id: 'codex-parlay', legs: [], combinedOdds: 1.4, aggregateConfidence: 0.8, aggregateQuality: 0.8 } },
        persistedParlayIds: ['codex-parlay'],
      }) as any,
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: 1,
        top: [],
        diagnostics: { generatedAt: '2026-05-14T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 1, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf-8'));
    assert.equal(summary.verdict, 'review-required');
    assert.equal(summary.providers[0].provider, 'codex');
    assert.equal(summary.parlays.some((family: any) => family.family === 'consensus-mixed' && family.ok === false), true);
    const runJson = JSON.parse(readFileSync(join(result.artifactDir, 'run.json'), 'utf-8'));
    assert.equal(runJson.providerAgentic, 'codex');
  });

  it('expands portfolio-v2 with parlay-diamante as the first daily profile', async () => {
    const ctx = context();
    const parlayCalls: any[] = [];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-17',
      providers: ['codex'],
      parlayProfile: 'portfolio-v2',
      persistMetrics: false,
      dailyBatchId: 'daily-portfolio-v2',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => ({
        ok: true,
        runId: `${config.provider}-run`,
        date: input.date,
        status: 'succeeded',
        verdict: 'promotable',
        artifactDir: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
        artifactPath: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
        evidencePackPath: '/tmp/evidence.json',
        handoffPath: '/tmp/handoff.md',
        steps: [],
        fixtures: [],
        lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
        oddsSnapshots: [],
        research: [],
        scoring: [],
        parlay: {
          ok: true,
          runId: `${config.provider}-run`,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          build: { parlay: { legs: [] } },
          persistedParlayIds: ['codex-parlay'],
        },
      }) as any,
      buildParlay: async (_config, input, runtime) => {
        parlayCalls.push({ input, runId: runtime.runId });
        return {
          ok: true,
          runId: runtime.runId ?? 'portfolio-v2-parlay-run',
          date: input.date,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 1.12, aggregateConfidence: 0.9, aggregateQuality: 1 } },
          persistedParlayIds: [`${runtime.runId}-persisted`],
        } as any;
      },
      analyzeParlays: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'analysis-run',
        date: input.date,
        analyzed: input.runIds?.length ?? 0,
        top: [],
        diagnostics: { generatedAt: '2026-05-17T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 1, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
      }) as any,
      buildDailyMetrics: async (_config, input, runtime) => ({
        ok: true,
        runId: runtime.runId ?? 'metrics-run',
        date: input.date,
        days: 1,
        scope: input.scope ?? 'global',
        metrics: [],
        persisted: 0,
        artifactPath: '/tmp/daily-metrics.json',
      }),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(parlayCalls.map((call) => call.input.portfolio), [
      'parlay-diamante',
      'parlay-all-in',
      'low-odds-top',
      'low-variance',
      'balanced',
      'market-diverse',
      'high-conviction',
      'parlay-oro',
    ]);
    assert.equal(result.parlays[0]?.profile, 'parlay-diamante');
  });

  it('keeps derived daily child run ids inside database id limits', async () => {
    const ctx = context();
    const parlayRuntimeIds: string[] = [];

    const result = await runDailyE2E(ctx.config, {
      date: '2026-05-14',
      providers: ['codex', 'gemini'],
      parlayProfile: 'balanced',
      persistMetrics: false,
      dailyBatchId: 'daily-2026-05-15-smoke-with-long-name',
    }, ctx.runtime, {
      repositories: undefined,
      runPipeline: async (config, input) => ({
        ok: true,
        runId: `${config.provider}-run`,
        date: input.date,
        status: 'succeeded',
        verdict: 'promotable',
        artifactDir: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
        artifactPath: join(ctx.config.artifactRoot, 'runs', `${config.provider}-run`),
        evidencePackPath: '/tmp/evidence.json',
        handoffPath: '/tmp/handoff.md',
        steps: [],
        fixtures: [],
        lowOddsScan: { date: input.date, threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
        oddsSnapshots: [],
        research: [],
        scoring: [],
        parlay: {
          ok: true,
          runId: `${config.provider}-run`,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          build: { parlay: { legs: [] } },
          persistedParlayIds: [`${config.provider}-parlay`],
        },
      }) as any,
      buildParlay: async (_config, input, runtime) => {
        parlayRuntimeIds.push(runtime.runId ?? '');
        return {
          ok: true,
          runId: runtime.runId ?? 'parlay-run',
          date: input.date,
          gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
          build: { parlay: { id: `${runtime.runId}-parlay`, legs: [], combinedOdds: 1.4, aggregateConfidence: 0.8, aggregateQuality: 0.8 } },
          persistedParlayIds: [`${runtime.runId}-persisted`],
        } as any;
      },
      analyzeParlays: async (_config, input, runtime) => {
        parlayRuntimeIds.push(runtime.runId ?? '');
        return {
          ok: true,
          runId: runtime.runId ?? 'analysis-run',
          date: input.date,
          analyzed: 1,
          top: [],
          diagnostics: { generatedAt: '2026-05-14T00:00:00.000Z', analyticalArtifactOnly: true, executionCapability: 'none', profileScope: 'all', rawAnalyzed: 1, profileScopedAnalyzed: 1, exposurePolicy: { analyticalUnits: 100, maxPortfolioExposure: 0.08, maxParlayExposure: 0.025, unitLabel: 'analytical-units' }, bankrollPolicy: { bankrollUnits: 100, maxPortfolioStake: 0.08, maxParlayStake: 0.025, unitLabel: 'analytical-units' }, universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 1, settled: 0, hitRate: null }, selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 }, rejected: [] },
        } as any;
      },
      buildDailyMetrics: async (_config, input, runtime) => {
        parlayRuntimeIds.push(runtime.runId ?? '');
        return {
          ok: true,
          runId: runtime.runId ?? 'metrics-run',
          date: input.date,
          days: 1,
          scope: input.scope ?? 'global',
          metrics: [],
          persisted: 0,
          artifactPath: '/tmp/daily-metrics.json',
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(parlayRuntimeIds.length, 5);
    assert.equal(parlayRuntimeIds.every((id) => id.length <= 36), true);
    assert.equal(new Set(parlayRuntimeIds).size, parlayRuntimeIds.length);
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

function fixture(scheduledAt = '2026-05-14T16:00:00.000Z') {
  return {
    id: 'fixture-1',
    provider: 'api-football',
    providerFixtureId: 'provider-fixture-1',
    homeTeamId: 'home-1',
    awayTeamId: 'away-1',
    homeTeamName: 'Team A',
    awayTeamName: 'Team B',
    scheduledAt,
    status: 'scheduled',
    includedByFilters: [],
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  };
}

function highConfidencePrediction(runId: string) {
  return {
    id: 'prediction-atomic-1',
    runId,
    fixtureId: 'fixture-1',
    providerFixtureId: 'provider-fixture-1',
    market: 'h2h',
    selection: 'home',
    odds: 1.24,
    impliedProbability: 0.806,
    marketFairProbability: 0.82,
    modelProbability: 0.91,
    edge: 0.12,
    confidence: 0.93,
    quality: 'high',
    confidenceBand: 'high',
    status: 'promotable',
    oddsSnapshotId: 'odds-snapshot-1',
    oddsQuoteId: 'odds-quote-1',
    evidenceIds: ['evidence-1'],
    claimIds: [],
    warnings: [],
    blockers: [],
    promptVersion: 'score-prediction-v2',
    scoringRuleVersion: 'scoring-v2',
  };
}

function fallbackPrediction(runId: string, id: string, fixtureId: string, overrides: Record<string, unknown> = {}) {
  return {
    ...highConfidencePrediction(runId),
    id,
    fixtureId,
    providerFixtureId: `provider-${fixtureId}`,
    odds: 1.5,
    impliedProbability: 0.66,
    marketFairProbability: 0.67,
    modelProbability: 0.68,
    edge: 0.02,
    confidence: 0.6,
    quality: 'medium',
    confidenceBand: 'medium',
    status: 'review-required',
    warnings: ['manual review required before promotion'],
    blockers: [],
    parlayEligible: true,
    ...overrides,
  };
}

function parlayRecommendation(overrides: Record<string, unknown>) {
  const predictionId = String(overrides.predictionId ?? 'prediction-1');
  const fixtureId = predictionId === 'prediction-atomic-1' ? 'fixture-1' : `fixture-${predictionId}`;
  const baseLeg = {
    predictionId,
    fixtureId,
    fixture: 'Team A vs Team B',
    market: 'h2h',
    selection: 'home',
    line: null,
    odds: 1.2,
    confidence: 0.93,
    validationStatus: 'unvalidated',
    warnings: [],
    banker: false,
  };
  return {
    rank: 1,
    parlayId: 'parlay-1',
    sourceRunId: 'parlay-run',
    profile: 'balanced',
    validationStatus: 'unvalidated',
    harnessStatus: 'promotable',
    combinedOdds: 1.8,
    aggregateConfidence: 0.8,
    adjustedProbability: 0.82,
    expectedEdge: 0.1,
    score: 0.9,
    exposure: { units: 0, percentOfAnalyticalBankroll: 0, policy: 'test' },
    stake: { units: 0, percentOfBankroll: 0, policy: 'test' },
    bankerLegs: [],
    reasons: [],
    riskFlags: [],
    legs: [
      baseLeg,
      {
        ...baseLeg,
        predictionId: `${predictionId}-leg-2`,
        fixtureId: `${fixtureId}-leg-2`,
        selection: 'away',
      },
    ],
    ...overrides,
  };
}
