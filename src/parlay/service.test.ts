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

  it('uses only current-run predictions when runtime has a run id', async () => {
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
              prediction({ id: 'prediction-1', runId: 'current-run-1', fixtureId: 'fixture-1', odds: 2, confidence: 0.8 }),
              prediction({ id: 'prediction-2', runId: 'current-run-1', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.7 }),
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
              prediction({ id: 'top-1', runId: 'source-run-low-odds', fixtureId: 'fixture-1', odds: 1.16, confidence: 0.91, status: 'promotable', edge: 0.04 }),
              prediction({ id: 'top-2', runId: 'source-run-low-odds', fixtureId: 'fixture-2', odds: 1.18, confidence: 0.9, status: 'candidate', edge: 0.03 }),
              prediction({ id: 'top-3', runId: 'source-run-low-odds', fixtureId: 'fixture-3', odds: 1.19, confidence: 0.89, status: 'promotable', edge: 0.03 }),
              prediction({ id: 'top-4', runId: 'source-run-low-odds', fixtureId: 'fixture-4', odds: 1.12, confidence: 0.88, status: 'promotable', edge: 0.03 }),
              prediction({ id: 'top-5', runId: 'source-run-low-odds', fixtureId: 'fixture-5', odds: 1.15, confidence: 0.87, status: 'candidate', edge: 0.03 }),
              prediction({ id: 'not-low-odds', runId: 'source-run-low-odds', fixtureId: 'fixture-6', odds: 1.35, confidence: 0.99, status: 'promotable', edge: 0.2 }),
              prediction({ id: 'hard-warning', runId: 'source-run-low-odds', fixtureId: 'fixture-7', odds: 1.14, confidence: 0.99, status: 'review-required', edge: 0.05, warnings: ['research is not promotable'] }),
              prediction({ id: 'negative-edge', runId: 'source-run-low-odds', fixtureId: 'fixture-8', odds: 1.1, confidence: 0.98, status: 'promotable', edge: -0.01 }),
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
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'not-low-odds')), false);
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'hard-warning')), false);
    assert.equal(result.portfolio?.parlays.some((entry) => entry.build.parlay.legs.some((leg) => leg.predictionId === 'negative-edge')), false);
    assert.equal(persisted[0].parlay.metadata.portfolioProfile, 'low-odds-top');
    assert.equal(persisted[0].parlay.metadata.lowOddsThreshold, 1.2);
    assert.equal(artifactPayload.portfolio.profiles[0].profile, 'low-odds-top');
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
            prediction({ id: 'review-1', runId: 'source-run-review', fixtureId: 'fixture-1', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.2, confidence: 0.72, quality: 'medium', status: 'review-required', edge: 0.43, warnings: ['research is not promotable'] }),
            prediction({ id: 'review-2', runId: 'source-run-review', fixtureId: 'fixture-2', marketKey: 'h2h', selectionKey: 'home', odds: 1.85, confidence: 0.71, quality: 'medium', status: 'review-required', edge: 0.08, warnings: ['research is not promotable'] }),
            prediction({ id: 'review-3', runId: 'source-run-review', fixtureId: 'fixture-3', marketKey: 'double_chance', selectionKey: 'home_or_draw', odds: 1.18, confidence: 0.7, quality: 'medium', status: 'review-required', edge: 0.4, warnings: ['web research required but no web-search source was linked'] }),
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
