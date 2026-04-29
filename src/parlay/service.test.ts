import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
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
  it('filters predictions with a UTC day window on fixture scheduledAt', async () => {
    let where: any;
    const repo = createPredictionRepository({
      prediction: {
        findMany: async (args: any) => {
          where = args.where;
          return [];
        },
      } as any,
    });

    await repo.listForFixtureDate('2026-04-25', { status: ['candidate', 'promotable'] });

    assert.deepEqual(where.status, { in: ['candidate', 'promotable'] });
    assert.equal(where.fixture.scheduledAt.gte.toISOString(), '2026-04-25T00:00:00.000Z');
    assert.equal(where.fixture.scheduledAt.lt.toISOString(), '2026-04-26T00:00:00.000Z');
  });
});
