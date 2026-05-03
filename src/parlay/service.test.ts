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
            assert.deepEqual(query.status, ['candidate', 'review-required', 'promotable']);
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
    assert.match(artifactPayload.notice, /cannot execute/i);
    assert.equal(persisted.parlay.artifactId, 'artifact-parlays-1');
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
      status: ['candidate', 'review-required', 'promotable'],
      take: 500,
    });
    assert.equal(result.build.parlay.legs.length, 2);
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
          ] }) } as any;
        }
        if (prompt.includes('(balanced)')) {
          return { text: JSON.stringify({ parlays: [
            { title: 'Balanced A', predictionIds: ['prediction-1', 'prediction-2', 'prediction-3'], rationale: 'Three compatible legs.' },
            { title: 'Balanced B', predictionIds: ['prediction-2', 'prediction-3', 'prediction-4'], rationale: 'Three independent fixtures.' },
            { title: 'Balanced C', predictionIds: ['prediction-1', 'prediction-3', 'prediction-4'], rationale: 'Higher quality blend.' },
          ] }) } as any;
        }
        return { text: JSON.stringify({ parlays: [
          { title: 'Aggressive A', predictionIds: ['prediction-1', 'prediction-2', 'prediction-3', 'prediction-4'], rationale: 'Four-leg upside profile.' },
        ] }) } as any;
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
              prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.25, confidence: 0.8 }),
              prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.6, confidence: 0.82 }),
              prediction({ id: 'prediction-3', runId: 'source-run-1', fixtureId: 'fixture-3', odds: 1.5, confidence: 0.84 }),
              prediction({ id: 'prediction-4', runId: 'source-run-1', fixtureId: 'fixture-4', odds: 2, confidence: 0.86 }),
              prediction({ id: 'prediction-low', runId: 'source-run-1', fixtureId: 'fixture-5', odds: 2, confidence: 0.59 }),
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
    assert.equal(result.portfolio?.parlays.length, 6);
    assert.deepEqual(result.persistedParlayIds, ['parlay-1', 'parlay-2', 'parlay-3', 'parlay-4', 'parlay-5', 'parlay-6']);
    assert.equal(persisted.length, 6);
    assert.equal(persisted[0].parlay.metadata.portfolioId, result.portfolio?.id);
    assert.equal(persisted[0].parlay.metadata.portfolioProfile, 'conservative');
    assert.equal(persisted[0].legs.length, 2);
    assert.deepEqual(artifactNames, ['parlay-portfolio.json', 'parlays.json']);
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
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.8, status: 'promotable' }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-2', odds: 1.5, confidence: 0.8, status: 'promotable' }),
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
    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'promotable');
    assert.equal(result.portfolio?.parlays[0]?.build.parlay.status, 'promotable');
    assert.deepEqual(result.portfolio?.parlays[0]?.build.parlay.warnings, ['Normal match-state variance.']);
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
            prediction({ id: 'prediction-1', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.8 }),
            prediction({ id: 'prediction-2', runId: 'source-run-1', fixtureId: 'fixture-1', odds: 1.5, confidence: 0.8 }),
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
