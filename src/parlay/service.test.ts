import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import { createParlayRepository } from '../storage/repositories/parlays.js';
import { createPredictionRepository } from '../storage/repositories/predictions.js';
import { runParlayBuild } from './service.js';

const now = new Date('2026-04-25T12:00:00.000Z');

function config(overrides: Record<string, unknown> = {}) {
  return loadConfig({
    databaseUrl: 'mysql://user:pass@localhost:3306/gana',
    provider: 'codex',
    model: 'gpt-5.5',
    ...overrides,
  }, { skipApiKey: true });
}

function prediction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prediction-1',
    runId: 'prediction-run-1',
    fixtureId: 'fixture-1',
    oddsSnapshotId: 'odds-snapshot-1',
    oddsQuoteId: 'odds-quote-1',
    researchBundleId: 'research-bundle-1',
    artifactId: 'artifact-1',
    marketKey: 'h2h',
    selectionKey: 'home',
    line: null,
    odds: 2,
    impliedProbability: 0.5,
    estimatedProbability: null,
    edge: null,
    confidence: 0.8,
    quality: 'high',
    rationaleRedacted: 'Candidate rationale.',
    warnings: [],
    evidenceIds: ['evidence-1'],
    includedByFilters: [],
    providerAgentic: 'codex',
    model: 'gpt-5.5',
    promptVersion: 'score-prediction-v1',
    scoringRuleVersion: 'scoring-v1',
    status: 'candidate',
    generatedAt: now,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('runParlayBuild', () => {
  it('builds, writes, and persists analytical parlay artifacts from persisted predictions', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any;
    let artifactPayload: any;

    const result = await runParlayBuild(cfg, { date: '2026-04-25' }, runtime, {
      now: () => now,
      writeArtifact: (_runId, _name, payload) => {
        artifactPayload = payload;
        return '/tmp/parlays.json';
      },
      repositories: {
        predictions: {
          list: async () => {
            throw new Error('date-only parlay builds should not use run-scoped list when runtime has no runId');
          },
          listForFixtureDate: async (date, query) => {
            assert.equal(date, '2026-04-25');
            assert.deepEqual(query.status, ['candidate', 'promotable']);
            return [
              prediction({ id: 'prediction-1', fixtureId: 'fixture-1', odds: 2, confidence: 0.8 }),
              prediction({ id: 'prediction-2', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.7 }),
              prediction({ id: 'prediction-3', fixtureId: 'fixture-3', status: 'blocked' }),
            ] as any[];
          },
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-parlays-1' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted = input;
            return { id: input.parlay.id } as any;
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'candidate');
    assert.equal(result.build.parlay.legs.length, 2);
    assert.equal(result.build.parlay.combinedOdds, 3);
    assert.equal(result.artifactPath, '/tmp/parlays.json');
    assert.equal(artifactPayload.analyticalArtifactOnly, true);
    assert.equal(artifactPayload.qualityVerdict, 'candidate');
    assert.equal(artifactPayload.executionCapability, 'none');
    assert.match(artifactPayload.notice, /cannot execute/i);
    assert.equal(persisted.parlay.artifactId, 'artifact-parlays-1');
    assert.equal(persisted.parlay.metadata.qualityVerdict, 'candidate');
    assert.equal(persisted.parlay.metadata.executionCapability, 'none');
    assert.equal(persisted.legs.length, 2);
  });

  it('uses every current-run projection, including normal and low-odds-expanded fixtures', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let listQuery: any;

    const result = await runParlayBuild(cfg, { date: '2026-04-25', sourceRunId: 'current-run-1' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/parlays.json',
      repositories: {
        predictions: {
          list: async (query) => {
            listQuery = query;
            return [
              prediction({ id: 'normal-projection', runId: 'current-run-1', fixtureId: 'fixture-normal', odds: 2, confidence: 0.8 }),
              prediction({ id: 'low-odds-expanded-projection', runId: 'current-run-1', fixtureId: 'fixture-low-odds-expanded', odds: 1.5, confidence: 0.7 }),
            ] as any[];
          },
          listForFixtureDate: async () => {
            throw new Error('run-scoped parlay builds must not read every prediction for the fixture date');
          },
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-parlays-1' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(listQuery, {
      runId: 'current-run-1',
      status: ['candidate', 'promotable'],
      take: 500,
    });
    assert.equal(result.build.parlay.legs.length, 2);
    assert.deepEqual(result.build.parlay.legs.map((leg) => leg.predictionId), [
      'normal-projection',
      'low-odds-expanded-projection',
    ]);
  });

  it('can combine predictions from multiple source runs without date-wide contamination', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let listQuery: any;

    const result = await runParlayBuild(cfg, { date: '2026-04-25', sourceRunIds: ['codex-run', 'gemini-run'] }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/parlays.json',
      repositories: {
        predictions: {
          list: async (query) => {
            listQuery = query;
            return [
              prediction({ id: 'codex-pick', runId: 'codex-run', fixtureId: 'fixture-1', odds: 1.6, confidence: 0.8 }),
              prediction({ id: 'gemini-pick', runId: 'gemini-run', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.78 }),
            ] as any[];
          },
          listForFixtureDate: async () => {
            throw new Error('multi-run parlay builds must not read every prediction for the fixture date');
          },
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-parlays-1' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(listQuery, {
      runIds: ['codex-run', 'gemini-run'],
      status: ['candidate', 'promotable'],
      take: 500,
    });
    assert.equal(result.build.parlay.sourceRunId, 'codex-run,gemini-run');
    assert.deepEqual(result.build.parlay.legs.map((leg) => leg.predictionId), ['codex-pick', 'gemini-pick']);
  });

  it('keeps hard research warning predictions out of the main parlay build', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, { date: '2026-04-25', sourceRunId: 'current-run-1' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/parlays.json',
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'current-run-1', fixtureId: 'fixture-1', odds: 2, confidence: 0.8, metadata: { parlayEligible: false } }),
            prediction({ id: 'prediction-2', runId: 'current-run-1', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.8, warnings: ['research is not promotable'] }),
            prediction({ id: 'prediction-3', runId: 'current-run-1', fixtureId: 'fixture-3', odds: 1.5, confidence: 0.8, warnings: ['stale news source'] }),
            prediction({ id: 'prediction-4', runId: 'current-run-1', fixtureId: 'fixture-4', odds: 1.5, confidence: 0.8 }),
            prediction({ id: 'prediction-5', runId: 'current-run-1', fixtureId: 'fixture-5', odds: 1.5, confidence: 0.8 }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-parlays-1' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.build.parlay.legs.map((leg) => leg.predictionId), ['prediction-4', 'prediction-5']);
    assert.deepEqual(
      result.build.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-1')?.excludedReasons,
      ['excluded-parlay-ineligible'],
    );
    assert.deepEqual(
      result.build.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-2')?.excludedReasons,
      ['excluded-research-not-promotable'],
    );
    assert.deepEqual(
      result.build.evaluations.find((evaluation) => evaluation.predictionId === 'prediction-3')?.excludedReasons,
      ['excluded-research-not-promotable'],
    );
  });

  it('builds and persists an LLM parlay portfolio from source-run predictions', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];
    const artifactNames: string[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        if (prompt.includes('(conservative)')) {
          return { text: JSON.stringify({ parlays: [
            { title: 'Conservative A', predictionIds: ['prediction-1', 'prediction-2'], rationale: 'Two high confidence legs.' },
            { title: 'Conservative B', predictionIds: ['prediction-3', 'prediction-4'], rationale: 'Two independent legs.' },
            { title: 'Conservative C', predictionIds: ['prediction-1', 'prediction-3', 'prediction-5'], rationale: 'Three independent conservative legs.' },
          ] }) } as any;
        }
        if (prompt.includes('(balanced)')) {
          return { text: JSON.stringify({ parlays: [
            { title: 'Balanced A', predictionIds: ['prediction-1', 'prediction-2', 'prediction-3'], rationale: 'Three compatible legs.' },
          ] }) } as any;
        }
        return { text: JSON.stringify({ parlays: [], noParlayReason: 'Strict profiles already filled the portfolio.' }) } as any;
      },
      writeArtifact: (_runId, name) => {
        artifactNames.push(name);
        return `/tmp/${name}`;
      },
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-1');
            assert.deepEqual(query.status, ['candidate', 'review-required', 'promotable']);
            return [
              prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.2, confidence: 0.86, edge: 0.03 }),
              prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.55, confidence: 0.87, edge: 0.03 }),
              prediction({ id: 'prediction-3', runId: 'source-run-1', fixtureId: 'fixture-3', odds: 1.4, confidence: 0.88, edge: 0.03 }),
              prediction({ id: 'prediction-4', runId: 'source-run-1', fixtureId: 'fixture-4', odds: 1.55, confidence: 0.89, edge: 0.03 }),
              prediction({ id: 'prediction-5', runId: 'source-run-1', fixtureId: 'fixture-5', odds: 1.3, confidence: 0.9, edge: 0.03 }),
              prediction({ id: 'prediction-low', runId: 'source-run-1', fixtureId: 'fixture-6', odds: 2, confidence: 0.71, edge: 0.03 }),
            ] as any[];
          },
          listForFixtureDate: async () => {
            throw new Error('portfolio builds must be source-run scoped');
          },
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-1' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.sourceRunId, 'source-run-1');
    assert.equal(result.portfolio?.parlays.length, 8);
    assert.deepEqual(result.persistedParlayIds, ['parlay-1', 'parlay-2', 'parlay-3', 'parlay-4', 'parlay-5', 'parlay-6', 'parlay-7', 'parlay-8']);
    assert.equal(persisted.length, 8);
    assert.equal(persisted[0].parlay.metadata.portfolioId, result.portfolio?.id);
    assert.equal(persisted[0].parlay.metadata.portfolioProfile, 'conservative');
    assert.equal(persisted[0].legs.length, 2);
    assert.deepEqual(artifactNames, ['parlay-portfolio.json', 'parlays.json']);
  });

  it('builds a low-odds-top portfolio from the highest-confidence low-priced predictions', async () => {
    const cfg = config({ apiFootball: { lowOddsThreshold: 1.2 } });
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];
    let artifactPayload: any;

    const result = await runParlayBuild(cfg, {
      date: '2026-05-10',
      sourceRunId: 'source-run-low-odds',
      portfolio: 'low-odds-top',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name, payload) => {
        if (name === 'parlay-low-odds-top.json') artifactPayload = payload;
        return `/tmp/${name}`;
      },
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-low-odds');
            assert.deepEqual(query.status, ['candidate', 'review-required', 'promotable']);
            return [
              prediction({ id: 'top-1', runId: 'source-run-low-odds', fixtureId: 'fixture-1', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.16, confidence: 0.91, status: 'promotable', edge: 0.04 }),
              prediction({ id: 'top-2', runId: 'source-run-low-odds', fixtureId: 'fixture-2', marketKey: 'double_chance', selectionKey: 'draw_or_away', odds: 1.18, confidence: 0.9, status: 'candidate', edge: 0.03 }),
              prediction({ id: 'top-3', runId: 'source-run-low-odds', fixtureId: 'fixture-3', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.19, confidence: 0.89, status: 'promotable', edge: 0.03 }),
              prediction({ id: 'top-4', runId: 'source-run-low-odds', fixtureId: 'fixture-4', marketKey: 'double_chance', selectionKey: 'draw_or_away', odds: 1.12, confidence: 0.88, status: 'promotable', edge: 0.03 }),
              prediction({ id: 'top-5', runId: 'source-run-low-odds', fixtureId: 'fixture-5', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.15, confidence: 0.87, status: 'candidate', edge: 0.03 }),
              prediction({ id: 'not-double-chance', runId: 'source-run-low-odds', fixtureId: 'fixture-6', marketKey: 'h2h', selectionKey: 'home', odds: 1.16, confidence: 0.99, status: 'promotable', edge: 0.2 }),
              prediction({ id: 'not-low-odds', runId: 'source-run-low-odds', fixtureId: 'fixture-7', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.35, confidence: 0.99, status: 'promotable', edge: 0.2 }),
              prediction({ id: 'hard-warning', runId: 'source-run-low-odds', fixtureId: 'fixture-8', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.14, confidence: 0.99, status: 'review-required', edge: 0.05, warnings: ['research is not promotable'] }),
              prediction({ id: 'negative-edge', runId: 'source-run-low-odds', fixtureId: 'fixture-9', marketKey: 'double_chance', selectionKey: 'draw_or_away', odds: 1.1, confidence: 0.98, status: 'promotable', edge: -0.01 }),
            ] as any[];
          },
          listForFixtureDate: async () => {
            throw new Error('low-odds-top portfolio builds must be source-run scoped');
          },
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-low-odds-top' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.profiles[0]?.profile, 'low-odds-top');
    assert.equal(result.portfolio?.profiles[0]?.included, 6);
    assert.equal(result.portfolio?.parlays.length, 6);
    assert.deepEqual(
      result.portfolio?.parlays[0]?.build.parlay.legs.map((leg) => leg.predictionId),
      ['top-1', 'top-2'],
    );
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'not-double-chance')), false);
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'not-low-odds')), false);
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'hard-warning')), false);
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'negative-edge')), false);
    assert.equal(persisted[0].parlay.metadata.portfolioProfile, 'low-odds-top');
    assert.equal(persisted[0].parlay.metadata.lowOddsThreshold, 1.2);
    assert.equal(artifactPayload.portfolio.profiles[0].profile, 'low-odds-top');
  });

  it('falls back for low-odds-top when strict double-chance coverage is too thin', async () => {
    const cfg = config({ apiFootball: { lowOddsThreshold: 1.2 } });
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, {
      date: '2026-05-14',
      sourceRunId: 'source-run-low-odds-fallback',
      portfolio: 'low-odds-top',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-low-odds-fallback');
            return [
              prediction({ id: 'strict-dc', runId: 'source-run-low-odds-fallback', fixtureId: 'fixture-1', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.18, confidence: 0.91, status: 'promotable', edge: 0.03 }),
              prediction({ id: 'fallback-h2h', runId: 'source-run-low-odds-fallback', fixtureId: 'fixture-2', marketKey: 'h2h', selectionKey: 'home', odds: 1.29, confidence: 0.9, status: 'promotable', edge: 0.08 }),
              prediction({ id: 'fallback-total', runId: 'source-run-low-odds-fallback', fixtureId: 'fixture-3', marketKey: 'goals_over_under', selectionKey: 'over', line: 1.5, odds: 1.3, confidence: 0.86, status: 'promotable', edge: 0.04 }),
              prediction({ id: 'too-high', runId: 'source-run-low-odds-fallback', fixtureId: 'fixture-4', marketKey: 'h2h', selectionKey: 'away', odds: 1.5, confidence: 0.95, status: 'promotable', edge: 0.1 }),
            ] as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-low-odds-fallback' }) as any },
        parlays: { createWithLegs: async () => ({ id: 'parlay-low-odds-fallback' }) as any },
      },
    });

    const selectedIds = new Set(result.build.parlay.legs.map((leg) => leg.predictionId));
    const diagnostics = result.portfolio?.diagnostics?.pool[0];
    assert.equal(result.ok, true);
    assert.equal(diagnostics?.fallback, true);
    assert.equal(diagnostics?.strictEligible, 1);
    assert.equal(selectedIds.has('strict-dc'), true);
    assert.equal(selectedIds.has('fallback-h2h') || selectedIds.has('fallback-total'), true);
    assert.equal(selectedIds.has('too-high'), false);
    assert.match(result.portfolio?.profiles[0].warnings.join('\n') ?? '', /fallback selected/);
  });

  it('keeps LLM portfolio risk notes informational when legs are promotable', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let conservativePrompt = '';

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        if (prompt.includes('(conservative)')) {
          conservativePrompt = prompt;
          return { text: JSON.stringify({ parlays: [
            {
              title: 'Promotable with notes',
              predictionIds: ['prediction-1', 'prediction-2'],
              rationale: 'Two promotable legs inside the profile range.',
              riskNotes: ['Normal match-state variance.'],
            },
          ] }) } as any;
        }
        return { text: JSON.stringify({ parlays: [] }) } as any;
      },
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.8, status: 'promotable', edge: 0.03 }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.8, status: 'promotable', edge: 0.03 }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-1' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    assert.match(conservativePrompt, /Use predictionIds only/);
    assert.match(conservativePrompt, /Do not use fixtureId/);
    assert.match(conservativePrompt, /parlay-portfolio-v3/);
    assert.match(conservativePrompt, /riskTags/);
    assert.match(conservativePrompt, /edge/);
    assert.match(conservativePrompt, /fragile_low_total_over/);
    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'promotable');
    assert.equal(result.portfolio?.parlays[0]?.build.parlay.status, 'promotable');
    assert.deepEqual(result.portfolio?.parlays[0]?.build.parlay.warnings, ['Normal match-state variance.']);
  });

  it('fills strict portfolio slots deterministically from soft-warning legs when the LLM returns too few parlays', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async () => ({ text: JSON.stringify({ parlays: [] }) }) as any,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.86, status: 'promotable', edge: 0.03, warnings: ['low-liquidity odds market'] }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.4, confidence: 0.85, status: 'promotable', edge: 0.03, warnings: ['low-liquidity odds market'] }),
            prediction({ id: 'prediction-3', runId: 'source-run-1', fixtureId: 'fixture-3', odds: 1.45, confidence: 0.84, status: 'promotable', edge: 0.03, warnings: ['low-liquidity odds market'] }),
            prediction({ id: 'prediction-4', runId: 'source-run-1', fixtureId: 'fixture-4', odds: 1.55, confidence: 0.83, status: 'promotable', edge: 0.03, warnings: ['lineup pending'] }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-fallback' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    const conservative = result.portfolio?.profiles.find((profile) => profile.profile === 'conservative');
    assert.equal(result.ok, true);
    assert.equal(conservative?.included, 5);
    assert.match(conservative?.warnings.join('\n') ?? '', /deterministic portfolio fallback filled 5 conservative parlay/);
    assert.equal(result.portfolio?.parlays.filter((entry) => entry.profile === 'conservative').length, 5);
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.status === 'review-required'), false);
    assert.equal(persisted.length >= 3, true);
  });

  it('blocks with diagnostics when portfolio LLM prompts fail', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];
    const artifactNames: string[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async () => {
        throw new Error('Reading additional input from stdin...');
      },
      writeArtifact: (_runId, name) => {
        artifactNames.push(name);
        return `/tmp/${name}`;
      },
      repositories: {
        predictions: {
          list: async () => [
            prediction({
              id: 'prediction-1',
              runId: 'source-run-1',
              fixtureId: 'fixture-1',
              marketKey: 'double_chance',
              selectionKey: 'home_or_away',
              odds: 1.29,
              confidence: 0.7,
              quality: 'medium',
              status: 'review-required',
              edge: 0.4,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-2',
              runId: 'source-run-1',
              fixtureId: 'fixture-2',
              marketKey: 'double_chance',
              selectionKey: 'home_or_away',
              odds: 1.3,
              confidence: 0.7,
              quality: 'medium',
              status: 'review-required',
              edge: 0.4,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-3',
              runId: 'source-run-1',
              fixtureId: 'fixture-3',
              marketKey: 'goals_over_under',
              selectionKey: 'over',
              line: 1.5,
              odds: 1.2,
              confidence: 0.7,
              quality: 'medium',
              status: 'review-required',
              edge: 0.06,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-4',
              runId: 'source-run-1',
              fixtureId: 'fixture-4',
              marketKey: 'double_chance',
              selectionKey: 'home_or_away',
              odds: 1.37,
              confidence: 0.7,
              quality: 'medium',
              status: 'review-required',
              edge: 0.4,
              warnings: ['research is not promotable'],
            }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-fallback' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.equal(result.portfolio?.parlays.length, 0);
    assert.equal(result.portfolio?.profiles[0].included, 0);
    assert.match(result.gateResult.warnings.join('\n'), /Reading additional input from stdin/);
    assert.doesNotMatch(result.gateResult.warnings.join('\n'), /deterministic portfolio fallback/);
    assert.equal(persisted.length, 0);
    assert.deepEqual(artifactNames, ['parlay-portfolio-blocked.json']);
  });

  it('blocks with a no-parlay reason when the LLM returns an empty portfolio', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async () => ({ text: JSON.stringify({ parlays: [], noParlayReason: 'No compatible legs inside target odds.' }) }) as any,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.3, confidence: 0.7, quality: 'medium', status: 'review-required', edge: 0.03, warnings: ['research warning'] }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.35, confidence: 0.7, quality: 'medium', status: 'review-required', edge: 0.03, warnings: ['research warning'] }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-fallback' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.equal(result.portfolio?.parlays.length, 0);
    assert.equal(result.portfolio?.rejected.length, 0);
    assert.match(result.gateResult.warnings.join('\n'), /No compatible legs inside target odds/);
  });

  it('fills review portfolio parlays deterministically when review-required predictions are available', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-11',
      sourceRunId: 'source-run-review',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async () => ({ text: JSON.stringify({ parlays: [], noParlayReason: 'Model declined despite compatible review legs.' }) }) as any,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'review-1', runId: 'source-run-review', fixtureId: 'fixture-1', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.2, confidence: 0.72, quality: 'medium', status: 'review-required', edge: 0.04, warnings: ['research is not promotable'] }),
            prediction({ id: 'review-2', runId: 'source-run-review', fixtureId: 'fixture-2', marketKey: 'h2h', selectionKey: 'home', odds: 1.85, confidence: 0.71, quality: 'medium', status: 'review-required', edge: 0.08, warnings: ['research is not promotable'] }),
            prediction({ id: 'review-3', runId: 'source-run-review', fixtureId: 'fixture-3', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.18, confidence: 0.7, quality: 'medium', status: 'review-required', edge: 0.04, warnings: ['web research required but no web-search source was linked'] }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-review-fallback' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    const review = result.portfolio?.profiles.find((profile) => profile.profile === 'review');
    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'review-required');
    assert.equal(review?.included, 3);
    assert.match(review?.warnings.join('\n') ?? '', /deterministic portfolio fallback filled 3 review parlay/);
    assert.equal(result.portfolio?.parlays.every((entry) => entry.profile === 'review'), true);
    assert.equal(result.portfolio?.parlays.every((entry) => entry.build.parlay.status === 'review-required'), true);
    assert.equal(persisted.length, 3);
  });

  it('lets the review profile use weaker warning legs as review-required LLM output', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];
    let reviewPrompt = '';

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        if (!prompt.includes('(review)')) return { text: JSON.stringify({ parlays: [] }) } as any;
        reviewPrompt = prompt;
        return { text: JSON.stringify({ parlays: [
          {
            title: 'Review-only double chance',
            predictionIds: ['prediction-1', 'prediction-2'],
            rationale: 'Two weak but high-edge review legs remain analytical only.',
            riskNotes: ['Draw exposure and research warnings keep this review-required.'],
          },
          {
            title: 'Review-only home favorites',
            predictionIds: ['prediction-3', 'prediction-4'],
            rationale: 'Two independent review legs stay within the review profile bounds.',
            riskNotes: ['Research warnings keep this review-required.'],
          },
          {
            title: 'Review-only goals mix',
            predictionIds: ['prediction-5', 'prediction-6'],
            rationale: 'Two independent totals legs with enough confidence for review.',
            riskNotes: ['Low-liquidity warnings keep this review-required.'],
          },
        ] }) } as any;
      },
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({
              id: 'prediction-1',
              runId: 'source-run-1',
              fixtureId: 'fixture-1',
              marketKey: 'double_chance',
              selectionKey: 'home_or_away',
              odds: 1.29,
              confidence: 0.7,
              quality: 'medium',
              status: 'review-required',
              edge: 0.4,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-2',
              runId: 'source-run-1',
              fixtureId: 'fixture-2',
              marketKey: 'double_chance',
              selectionKey: 'home_or_away',
              odds: 1.3,
              confidence: 0.7,
              quality: 'medium',
              status: 'review-required',
              edge: 0.4,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-3',
              runId: 'source-run-1',
              fixtureId: 'fixture-3',
              marketKey: 'h2h',
              selectionKey: 'home',
              odds: 1.34,
              confidence: 0.71,
              quality: 'medium',
              status: 'review-required',
              edge: 0.04,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-4',
              runId: 'source-run-1',
              fixtureId: 'fixture-4',
              marketKey: 'h2h',
              selectionKey: 'home',
              odds: 1.28,
              confidence: 0.72,
              quality: 'medium',
              status: 'review-required',
              edge: 0.04,
              warnings: ['research is not promotable'],
            }),
            prediction({
              id: 'prediction-5',
              runId: 'source-run-1',
              fixtureId: 'fixture-5',
              marketKey: 'goals_over_under',
              selectionKey: 'over',
              line: 2.5,
              odds: 1.42,
              confidence: 0.73,
              quality: 'medium',
              status: 'review-required',
              edge: 0.04,
              warnings: ['low-liquidity'],
            }),
            prediction({
              id: 'prediction-6',
              runId: 'source-run-1',
              fixtureId: 'fixture-6',
              marketKey: 'goals_over_under',
              selectionKey: 'over',
              line: 1.5,
              odds: 1.29,
              confidence: 0.72,
              quality: 'medium',
              status: 'review-required',
              edge: 0.04,
              warnings: ['low-liquidity'],
            }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-review' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    assert.match(reviewPrompt, /Review profile/);
    assert.match(reviewPrompt, /Create up to 3 parlays/);
    assert.match(reviewPrompt, /Minimum leg confidence for this profile: 0.7/);
    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'review-required');
    assert.equal(result.portfolio?.parlays.length, 3);
    assert.equal(result.portfolio?.parlays[0].profile, 'review');
    assert.equal(result.portfolio?.parlays[1].profile, 'review');
    assert.equal(result.portfolio?.parlays[2].profile, 'review');
    assert.equal(result.portfolio?.parlays[0].build.parlay.status, 'review-required');
    assert.equal(result.portfolio?.parlays[0].build.config.minPredictionConfidence, 0.7);
    assert.equal(persisted.length, 3);
  });

  it('rejects LLM portfolio parlays that duplicate a fixture without justification', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        if (!prompt.includes('(conservative)')) return { text: JSON.stringify({ parlays: [] }) } as any;
        return { text: JSON.stringify({ parlays: [
          { title: 'Bad duplicate', predictionIds: ['prediction-1', 'prediction-2'], rationale: 'Same fixture.' },
        ] }) } as any;
      },
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.8, edge: 0.03 }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.8, edge: 0.03 }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-1' }) as any },
        parlays: {
          createWithLegs: async () => {
            throw new Error('invalid portfolio parlays should not be persisted');
          },
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.gateResult.warnings.join('\n'), /duplicate fixture without justification/);
    assert.equal(result.portfolio?.parlays.length, 0);
    assert.equal(result.portfolio?.rejected.length, 1);
  });

  it('filters fragile low-edge legs out of the LLM portfolio prompt', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let inspectedPrompts = 0;

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        inspectedPrompts++;
        assert.doesNotMatch(prompt, /prediction-fragile-over/);
        assert.doesNotMatch(prompt, /prediction-fragile-dc/);
        if (!prompt.includes('(conservative)')) return { text: JSON.stringify({ parlays: [] }) } as any;
        return { text: JSON.stringify({ parlays: [
          { title: 'Clean conservative', predictionIds: ['prediction-1', 'prediction-2'], rationale: 'Clean legs inside the profile range.' },
        ] }) } as any;
      },
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.4, confidence: 0.85, edge: 0.03 }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.4, confidence: 0.85, edge: 0.03 }),
            prediction({
              id: 'prediction-fragile-over',
              runId: 'source-run-1',
              fixtureId: 'fixture-3',
              marketKey: 'goals_over_under',
              selectionKey: 'over',
              line: 1.5,
              odds: 1.33,
              confidence: 0.9,
              edge: 0.01,
            }),
            prediction({
              id: 'prediction-fragile-dc',
              runId: 'source-run-1',
              fixtureId: 'fixture-4',
              marketKey: 'double_chance',
              selectionKey: 'home_or_draw',
              odds: 1.2,
              confidence: 0.9,
              edge: 0.01,
            }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-1' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    assert.equal(inspectedPrompts, 3);
    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.parlays.length, 1);
  });

  it('filters high-odds, stale low-liquidity, unverified corners, and inflated double-chance legs from portfolio prompts', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let inspectedPrompts = 0;

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-risk-filter',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        inspectedPrompts++;
        assert.doesNotMatch(prompt, /prediction-high-odds/);
        assert.doesNotMatch(prompt, /prediction-stale-low-liquidity/);
        assert.doesNotMatch(prompt, /prediction-unverified-corners/);
        assert.doesNotMatch(prompt, /prediction-inflated-dc/);
        if (!prompt.includes('(conservative)')) return { text: JSON.stringify({ parlays: [] }) } as any;
        return { text: JSON.stringify({ parlays: [
          { title: 'Clean conservative', predictionIds: ['prediction-1', 'prediction-2'], rationale: 'Clean low-risk legs inside the profile range.' },
        ] }) } as any;
      },
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({ id: 'prediction-1', runId: 'source-run-risk-filter', fixtureId: 'fixture-1', odds: 1.4, confidence: 0.85, edge: 0.03 }),
            prediction({ id: 'prediction-2', runId: 'source-run-risk-filter', fixtureId: 'fixture-2', odds: 1.4, confidence: 0.85, edge: 0.03 }),
            prediction({ id: 'prediction-high-odds', runId: 'source-run-risk-filter', fixtureId: 'fixture-3', odds: 2.35, confidence: 0.9, edge: 0.1 }),
            prediction({ id: 'prediction-stale-low-liquidity', runId: 'source-run-risk-filter', fixtureId: 'fixture-4', odds: 1.4, confidence: 0.9, edge: 0.1, warnings: ['stale odds source', 'low-liquidity'] }),
            prediction({ id: 'prediction-unverified-corners', runId: 'source-run-risk-filter', fixtureId: 'fixture-5', marketKey: 'corners_over_under', selectionKey: 'under', line: 9.5, odds: 1.7, confidence: 0.9, edge: 0.1 }),
            prediction({ id: 'prediction-inflated-dc', runId: 'source-run-risk-filter', fixtureId: 'fixture-6', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.1, confidence: 0.9, edge: 0.45, metadata: { marketFairProbability: 0.4 } }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-1' }) as any },
        parlays: { createWithLegs: async (input) => ({ id: input.parlay.id }) as any },
      },
    });

    const conservativePool = result.portfolio?.diagnostics?.pool.find((pool) => pool.profile === 'conservative');
    assert.equal(inspectedPrompts, 3);
    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.parlays.length, 1);
    assert.equal(conservativePool?.eligible, 2);
    assert.match(JSON.stringify(conservativePool?.excludedReasons), /above automatic parlay leg odds ceiling 2.2/);
    assert.match(JSON.stringify(conservativePool?.excludedReasons), /stale low-liquidity prediction/);
    assert.match(JSON.stringify(conservativePool?.excludedReasons), /corners market lacks settlement reliability/);
    assert.match(JSON.stringify(conservativePool?.excludedReasons), /inflated double-chance edge/);
  });

  it('rejects portfolio parlays with draw-exposure legs', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-1',
      portfolio: 'llm',
    }, runtime, {
      now: () => now,
      agentRunner: async (_config, input) => {
        const prompt = String(input);
        if (!prompt.includes('(conservative)')) return { text: JSON.stringify({ parlays: [] }) } as any;
        return { text: JSON.stringify({ parlays: [
          { title: 'Draw exposure', predictionIds: ['prediction-draw-exposure', 'prediction-2'], rationale: 'This tries to avoid the draw.' },
        ] }) } as any;
      },
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async () => [
            prediction({
              id: 'prediction-draw-exposure',
              runId: 'source-run-1',
              fixtureId: 'fixture-1',
              marketKey: 'double_chance',
              selectionKey: 'home_or_away',
              odds: 1.3,
              confidence: 0.86,
              edge: 0.03,
            }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.86, edge: 0.03 }),
          ] as any[],
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-portfolio-1' }) as any },
        parlays: {
          createWithLegs: async () => {
            throw new Error('draw-exposure parlays should not be persisted');
          },
        },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.gateResult.warnings.join('\n'), /unknown prediction id: prediction-draw-exposure/);
    assert.equal(result.portfolio?.parlays.length, 0);
  });

  it('builds deterministic market-diverse parlays with ranking, diversification, and correlation diagnostics', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];
    const artifactNames: string[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-diverse',
      portfolio: 'market-diverse',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => {
        artifactNames.push(name);
        return `/tmp/${name}`;
      },
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-diverse');
            return [
              prediction({ id: 'prediction-h2h', runId: 'source-run-diverse', fixtureId: 'fixture-1', marketKey: 'h2h', selectionKey: 'home', odds: 1.35, confidence: 0.84, edge: 0.05, estimatedProbability: 0.82 }),
              prediction({ id: 'prediction-btts', runId: 'source-run-diverse', fixtureId: 'fixture-2', marketKey: 'btts', selectionKey: 'yes', odds: 1.48, confidence: 0.8, edge: 0.04, estimatedProbability: 0.76 }),
              prediction({ id: 'prediction-goals', runId: 'source-run-diverse', fixtureId: 'fixture-3', marketKey: 'goals_over_under', selectionKey: 'over', line: 2.5, odds: 1.55, confidence: 0.79, edge: 0.04, estimatedProbability: 0.74 }),
              prediction({ id: 'prediction-corners', runId: 'source-run-diverse', fixtureId: 'fixture-4', marketKey: 'corners_over_under', selectionKey: 'under', line: 9.5, odds: 1.5, confidence: 0.78, edge: 0.04, estimatedProbability: 0.73, warnings: ['corners-settlement-reliable'] }),
              prediction({ id: 'prediction-correlated-total', runId: 'source-run-diverse', fixtureId: 'fixture-1', marketKey: 'goals_over_under', selectionKey: 'over', line: 1.5, odds: 1.42, confidence: 0.79, edge: 0.04, estimatedProbability: 0.74 }),
            ] as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-market-diverse' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    const markets = new Set(result.build.parlay.legs.map((leg) => leg.market));
    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.profiles[0].profile, 'market-diverse');
    assert.equal(result.portfolio?.promptVersion, 'deterministic-market-diverse-v1');
    assert.equal(markets.size >= 3, true);
    assert.match(result.build.parlay.rationale, /candidate-generator, ranker, diversifier, and correlation checks/);
    assert.equal(result.portfolio?.rejected.some((entry) => entry.reasons.some((reason) => /same-fixture h2h\/totals correlation/.test(reason))), true);
    assert.equal(persisted.length, result.portfolio?.parlays.length);
    assert.equal(persisted[0].parlay.metadata.portfolioProfile, 'market-diverse');
    assert.equal(typeof persisted[0].parlay.metadata.candidateDiagnostics.expectedEdge, 'number');
    assert.deepEqual(artifactNames.slice(0, 2), ['parlay-market-diverse.json', 'parlays.json']);
  });

  it('does not starve market-diverse generation on two-leg candidates when the pool is large', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const markets = ['h2h', 'btts', 'goals_over_under'] as const;

    const result = await runParlayBuild(cfg, {
      date: '2026-05-14',
      sourceRunId: 'source-run-large-diverse',
      portfolio: 'market-diverse',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-large-diverse');
            return Array.from({ length: 30 }, (_, index) => {
              const market = markets[index % markets.length];
              return prediction({
                id: `large-${index}`,
                runId: 'source-run-large-diverse',
                fixtureId: `fixture-${index}`,
                marketKey: market,
                selectionKey: market === 'h2h' ? 'home' : market === 'btts' ? 'yes' : 'over',
                line: market === 'goals_over_under' ? 2.5 : null,
                odds: 1.4,
                confidence: 0.8,
                edge: 0.05,
                estimatedProbability: 0.74,
              });
            }) as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-large-diverse' }) as any },
        parlays: { createWithLegs: async () => ({ id: 'parlay-large-diverse' }) as any },
      },
    });

    const selectedMarkets = new Set(result.build.parlay.legs.map((leg) => leg.market));
    assert.equal(result.ok, true);
    assert.equal(result.build.parlay.legs.length >= 3, true);
    assert.equal(selectedMarkets.size >= 3, true);
    assert.equal(result.portfolio?.profiles[0].profile, 'market-diverse');
  });

  it('narrows low-variance parlays to low-priced double-chance legs', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-low-variance',
      portfolio: 'low-variance',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-low-variance');
            return [
              prediction({ id: 'dc-1', runId: 'source-run-low-variance', fixtureId: 'fixture-1', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.18, confidence: 0.9, edge: 0.03, estimatedProbability: 0.86 }),
              prediction({ id: 'dc-2', runId: 'source-run-low-variance', fixtureId: 'fixture-2', marketKey: 'double_chance', selectionKey: 'away_or_draw', odds: 1.17, confidence: 0.88, edge: 0.025, estimatedProbability: 0.85 }),
              prediction({ id: 'dc-3', runId: 'source-run-low-variance', fixtureId: 'fixture-3', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.15, confidence: 0.87, edge: 0.02, estimatedProbability: 0.84 }),
              prediction({ id: 'h2h-low', runId: 'source-run-low-variance', fixtureId: 'fixture-4', marketKey: 'h2h', selectionKey: 'home', odds: 1.1, confidence: 0.95, edge: 0.04, estimatedProbability: 0.9 }),
              prediction({ id: 'dc-expensive', runId: 'source-run-low-variance', fixtureId: 'fixture-5', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.23, confidence: 0.92, edge: 0.04, estimatedProbability: 0.87 }),
              prediction({ id: 'dc-draw-risk', runId: 'source-run-low-variance', fixtureId: 'fixture-6', marketKey: 'double_chance', selectionKey: 'home_or_away', odds: 1.12, confidence: 0.91, edge: 0.03, estimatedProbability: 0.86 }),
            ] as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-low-variance' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    const selectedIds = new Set(result.build.parlay.legs.map((leg) => leg.predictionId));
    const excluded = result.portfolio?.diagnostics?.pool[0]?.excludedReasons ?? [];

    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.profiles[0].profile, 'low-variance');
    assert.equal(result.build.parlay.legs.length <= 3, true);
    assert.equal((result.build.parlay.combinedOdds ?? 0) <= 1.8, true);
    assert.equal(result.build.parlay.legs.every((leg) => leg.market === 'double_chance' && leg.odds <= 1.2), true);
    assert.equal(selectedIds.has('h2h-low'), false);
    assert.equal(selectedIds.has('dc-expensive'), false);
    assert.equal(selectedIds.has('dc-draw-risk'), false);
    assert.equal(excluded.some((item) => item.predictionId === 'h2h-low' && item.reasons.some((reason) => /market not allowed/.test(reason))), true);
    assert.equal(excluded.some((item) => item.predictionId === 'dc-expensive' && item.reasons.some((reason) => /leg odds ceiling/.test(reason))), true);
    assert.equal(excluded.some((item) => item.predictionId === 'dc-draw-risk' && item.reasons.some((reason) => /draw exposure/.test(reason))), true);
    assert.equal(persisted.length, result.portfolio?.parlays.length);
  });

  it('falls back for low-variance when strict low-priced double-chance legs are insufficient', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, {
      date: '2026-05-14',
      sourceRunId: 'source-run-low-variance-fallback',
      portfolio: 'low-variance',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-low-variance-fallback');
            return [
              prediction({ id: 'strict-dc', runId: 'source-run-low-variance-fallback', fixtureId: 'fixture-1', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.18, confidence: 0.9, edge: 0.015, estimatedProbability: 0.86, warnings: ['low-liquidity'] }),
              prediction({ id: 'fallback-h2h', runId: 'source-run-low-variance-fallback', fixtureId: 'fixture-2', marketKey: 'h2h', selectionKey: 'home', odds: 1.29, confidence: 0.91, edge: 0.08, estimatedProbability: 0.84 }),
              prediction({ id: 'low-liquidity-short', runId: 'source-run-low-variance-fallback', fixtureId: 'fixture-3', marketKey: 'h2h', selectionKey: 'home', odds: 1.12, confidence: 0.96, edge: 0.05, estimatedProbability: 0.9, warnings: ['low-liquidity'] }),
            ] as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-low-variance-fallback' }) as any },
        parlays: { createWithLegs: async () => ({ id: 'parlay-low-variance-fallback' }) as any },
      },
    });

    const selectedIds = new Set(result.build.parlay.legs.map((leg) => leg.predictionId));
    const diagnostics = result.portfolio?.diagnostics?.pool[0];
    assert.equal(result.ok, true);
    assert.equal(diagnostics?.fallback, true);
    assert.equal(diagnostics?.strictEligible, 0);
    assert.equal(selectedIds.has('strict-dc'), true);
    assert.equal(selectedIds.has('fallback-h2h'), true);
    assert.equal(selectedIds.has('low-liquidity-short'), false);
    assert.equal(
      diagnostics?.excludedReasons.some((item) => item.predictionId === 'low-liquidity-short' && item.reasons.some((reason) => /low-liquidity h2h short favorite/.test(reason))),
      true,
    );
  });

  it('builds parlay-oro by maximizing combined odds from safe low-priced predictions', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persisted: any[] = [];
    const artifactNames: string[] = [];

    const result = await runParlayBuild(cfg, {
      date: '2026-05-02',
      sourceRunId: 'source-run-oro',
      portfolio: 'parlay-oro',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => {
        artifactNames.push(name);
        return `/tmp/${name}`;
      },
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-oro');
            return [
              prediction({ id: 'low-liquidity-h2h', runId: 'source-run-oro', fixtureId: 'fixture-1', marketKey: 'h2h', selectionKey: 'home', odds: 1.12, confidence: 0.95, edge: 0.03, estimatedProbability: 0.9, warnings: ['low-liquidity'] }),
              prediction({ id: 'safe-2', runId: 'source-run-oro', fixtureId: 'fixture-2', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.18, confidence: 0.92, edge: 0.025, estimatedProbability: 0.88 }),
              prediction({ id: 'safe-3', runId: 'source-run-oro', fixtureId: 'fixture-3', marketKey: 'double_chance', selectionKey: 'away_or_draw', odds: 1.2, confidence: 0.91, edge: 0.02, estimatedProbability: 0.87 }),
              prediction({ id: 'safe-4', runId: 'source-run-oro', fixtureId: 'fixture-4', marketKey: 'h2h', selectionKey: 'away', odds: 1.08, confidence: 0.94, edge: 0.03, estimatedProbability: 0.91 }),
              prediction({ id: 'safe-5', runId: 'source-run-oro', fixtureId: 'fixture-5', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.17, confidence: 0.9, edge: 0.02, estimatedProbability: 0.86 }),
              prediction({ id: 'safe-6', runId: 'source-run-oro', fixtureId: 'fixture-6', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.16, confidence: 0.89, edge: 0.02, estimatedProbability: 0.84 }),
              prediction({ id: 'too-expensive', runId: 'source-run-oro', fixtureId: 'fixture-7', marketKey: 'h2h', selectionKey: 'home', odds: 1.35, confidence: 0.99, edge: 0.04, estimatedProbability: 0.92 }),
              prediction({ id: 'too-weak', runId: 'source-run-oro', fixtureId: 'fixture-8', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.2, confidence: 0.7, edge: 0.04, estimatedProbability: 0.86 }),
              prediction({ id: 'draw-risk', runId: 'source-run-oro', fixtureId: 'fixture-9', marketKey: 'double_chance', selectionKey: 'home_or_away', odds: 1.19, confidence: 0.91, edge: 0.02, estimatedProbability: 0.86 }),
            ] as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-parlay-oro' }) as any },
        parlays: {
          createWithLegs: async (input) => {
            persisted.push(input);
            return { id: `parlay-${persisted.length}` } as any;
          },
        },
      },
    });

    const firstLegIds = result.build.parlay.legs.map((leg) => leg.predictionId);
    assert.equal(result.ok, true);
    assert.equal(result.portfolio?.profiles[0].profile, 'parlay-oro');
    assert.equal(result.portfolio?.promptVersion, 'deterministic-parlay-oro-v1');
    assert.equal(result.build.parlay.legs.length, 5);
    assert.equal((result.build.parlay.combinedOdds ?? 0) > 1.8, true);
    assert.deepEqual(new Set(firstLegIds), new Set(['safe-2', 'safe-3', 'safe-4', 'safe-5', 'safe-6']));
    assert.equal(firstLegIds.includes('low-liquidity-h2h'), false);
    assert.equal(firstLegIds.includes('too-expensive'), false);
    assert.equal(firstLegIds.includes('too-weak'), false);
    assert.equal(firstLegIds.includes('draw-risk'), false);
    assert.equal(result.build.parlay.legs.every((leg) => leg.odds <= 1.25), true);
    assert.equal(result.build.parlay.legs.every((leg) => leg.market === 'h2h' || leg.market === 'double_chance'), true);
    assert.equal(persisted[0].parlay.metadata.portfolioProfile, 'parlay-oro');
    assert.equal(persisted[0].parlay.metadata.promptVersion, 'deterministic-parlay-oro-v1');
    assert.equal(
      result.portfolio?.diagnostics?.pool[0].excludedReasons.some((item) => item.predictionId === 'too-expensive' && item.reasons.some((reason) => /leg odds ceiling/.test(reason))),
      true,
    );
    assert.equal(
      result.portfolio?.diagnostics?.pool[0].excludedReasons.some((item) => item.predictionId === 'low-liquidity-h2h' && item.reasons.some((reason) => /low-liquidity h2h short favorite/.test(reason))),
      true,
    );
    assert.deepEqual(artifactNames.slice(0, 2), ['parlay-oro.json', 'parlays.json']);
  });

  it('falls back for parlay-oro when the strict low-odds pool is empty', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, {
      date: '2026-05-14',
      sourceRunId: 'source-run-oro-fallback',
      portfolio: 'parlay-oro',
    }, runtime, {
      now: () => now,
      writeArtifact: (_runId, name) => `/tmp/${name}`,
      repositories: {
        predictions: {
          list: async (query) => {
            assert.equal(query.runId, 'source-run-oro-fallback');
            return [
              prediction({ id: 'h2h-fallback', runId: 'source-run-oro-fallback', fixtureId: 'fixture-1', marketKey: 'h2h', selectionKey: 'home', odds: 1.29, confidence: 0.9, edge: 0.09, estimatedProbability: 0.84 }),
              prediction({ id: 'dc-fallback', runId: 'source-run-oro-fallback', fixtureId: 'fixture-2', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.33, confidence: 0.88, edge: 0.04, estimatedProbability: 0.82 }),
              prediction({ id: 'total-fallback', runId: 'source-run-oro-fallback', fixtureId: 'fixture-3', marketKey: 'goals_over_under', selectionKey: 'over', line: 1.5, odds: 1.35, confidence: 0.82, edge: 0.05, estimatedProbability: 0.78 }),
              prediction({ id: 'too-expensive', runId: 'source-run-oro-fallback', fixtureId: 'fixture-4', marketKey: 'h2h', selectionKey: 'away', odds: 1.6, confidence: 0.95, edge: 0.1, estimatedProbability: 0.84 }),
            ] as any[];
          },
          listForFixtureDate: async () => [],
        },
        harnessRuns: { upsertForRun: async () => ({}) },
        artifacts: { create: async () => ({ id: 'artifact-oro-fallback' }) as any },
        parlays: { createWithLegs: async () => ({ id: 'parlay-oro-fallback' }) as any },
      },
    });

    const selectedIds = new Set(result.build.parlay.legs.map((leg) => leg.predictionId));
    const diagnostics = result.portfolio?.diagnostics?.pool[0];
    assert.equal(result.ok, true);
    assert.equal(diagnostics?.fallback, true);
    assert.equal(diagnostics?.strictEligible, 0);
    assert.equal(selectedIds.has('h2h-fallback'), true);
    assert.equal(selectedIds.has('dc-fallback') || selectedIds.has('total-fallback'), true);
    assert.equal(selectedIds.has('too-expensive'), false);
    assert.match(result.portfolio?.profiles[0].warnings.join('\n') ?? '', /fallback eligibility/);
  });

  it('writes a blocked artifact when database access is unavailable', async () => {
    const cfg = config({ databaseUrl: '' });
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayBuild(cfg, { date: '2026-04-25' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/parlays-blocked.json',
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.error ?? '', /DATABASE_URL/);
    assert.equal(result.artifactPath, '/tmp/parlays-blocked.json');
  });
});

describe('prediction repository fixture date query', () => {
  it('supports array status filters for run-scoped prediction queries', async () => {
    let where: any;
    const repo = createPredictionRepository({
      prediction: {
        findMany: async (args: any) => {
          where = args.where;
          return [];
        },
      } as any,
    });

    await repo.list({ runId: 'run-1', status: ['candidate', 'review-required'] });

    assert.equal(where.runId, 'run-1');
    assert.deepEqual(where.status, { in: ['candidate', 'review-required'] });
  });

  it('filters predictions with a UTC day window on fixture scheduledAt', async () => {
    let args: any;
    const repo = createPredictionRepository({
      prediction: {
        findMany: async (input: any) => {
          args = input;
          return [];
        },
      } as any,
    });

    await repo.listForFixtureDate('2026-04-25', { status: ['candidate', 'promotable'], take: 50, skip: 100 });

    assert.deepEqual(args.where.status, { in: ['candidate', 'promotable'] });
    assert.equal(args.where.fixture.scheduledAt.gte.toISOString(), '2026-04-25T00:00:00.000Z');
    assert.equal(args.where.fixture.scheduledAt.lt.toISOString(), '2026-04-26T00:00:00.000Z');
    assert.equal(args.take, 50);
    assert.equal(args.skip, 100);
  });

  it('filters predictions with a configured local day window', async () => {
    let where: any;
    const repo = createPredictionRepository({
      prediction: {
        findMany: async (args: any) => {
          where = args.where;
          return [];
        },
      } as any,
    });

    await repo.listForFixtureDate('2026-05-02', { timezone: 'America/Guatemala' });

    assert.equal(where.fixture.scheduledAt.gte.toISOString(), '2026-05-02T06:00:00.000Z');
    assert.equal(where.fixture.scheduledAt.lt.toISOString(), '2026-05-03T06:00:00.000Z');
  });
});

describe('parlay repository fixture date query', () => {
  it('filters parlays through leg fixtures with a configured local day window', async () => {
    let args: any;
    const repo = createParlayRepository({
      parlay: {
        findMany: async (input: any) => {
          args = input;
          return [];
        },
      } as any,
      parlayLeg: {} as any,
    });

    await repo.listForFixtureDate('2026-05-02', {
      status: ['candidate', 'review-required'],
      take: 25,
      skip: 50,
      timezone: 'America/Guatemala',
    });

    const scheduledAt = args.where.legs.some.fixture.scheduledAt;
    assert.deepEqual(args.where.status, { in: ['candidate', 'review-required'] });
    assert.equal(scheduledAt.gte.toISOString(), '2026-05-02T06:00:00.000Z');
    assert.equal(scheduledAt.lt.toISOString(), '2026-05-03T06:00:00.000Z');
    assert.equal(args.take, 25);
    assert.equal(args.skip, 50);
  });
});
