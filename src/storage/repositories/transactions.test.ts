import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createResearchBundleRepository } from './evidence.js';
import { createParlayRepository } from './parlays.js';
import { createPredictionRepository } from './predictions.js';
import { createOddsSnapshotRepository } from './snapshots.js';
import { createValidationArtifactRepository } from './validation.js';

const now = new Date('2026-04-29T12:00:00.000Z');

function delegate(record: any = {}) {
  return {
    create: async (args: any) => ({ id: record.id ?? args.data.id ?? 'created-1', ...record, ...args.data, createdAt: now, updatedAt: now }),
    createMany: async (args: any) => ({ count: args.data.length }),
    findFirst: async () => null,
    findMany: async () => [],
    findUnique: async () => null,
    update: async (args: any) => ({ id: args.where.id, ...args.data, createdAt: now, updatedAt: now }),
    upsert: async (args: any) => ({ id: args.where.id ?? 'upsert-1', ...args.create, createdAt: now, updatedAt: now }),
  };
}

describe('compound storage writes', () => {
  it('creates odds snapshots and quotes inside a transaction', async () => {
    let transactions = 0;
    let persistedQuotes: any[] = [];
    const db: any = {
      oddsSnapshot: delegate({ id: 'odds-snapshot-1' }),
      oddsQuote: {
        ...delegate(),
        createMany: async (args: any) => {
          persistedQuotes = args.data;
          return { count: args.data.length };
        },
      },
      $transaction: async (fn: (tx: any) => Promise<unknown>) => {
        transactions += 1;
        return fn(db);
      },
    };

    const repo = createOddsSnapshotRepository(db);
    const snapshot = await repo.createWithQuotes({
      snapshot: { fixtureId: 'fixture-1', providerFixtureId: '1001', bookmakerCount: 1 },
      quotes: [{
        fixtureId: 'fixture-1',
        bookmaker: 'book',
        marketKey: 'h2h',
        selectionKey: 'home',
        price: 1.18,
        marketFairProbability: 0.82,
        overround: 0.04,
        marketEfficiencyScore: 0.71,
      }],
    });

    assert.equal(snapshot.id, 'odds-snapshot-1');
    assert.equal(transactions, 1);
    assert.equal(persistedQuotes[0].marketFairProbability, 0.82);
    assert.equal(persistedQuotes[0].overround, 0.04);
    assert.equal(persistedQuotes[0].marketEfficiencyScore, 0.71);
  });

  it('creates research bundle graphs inside a transaction', async () => {
    let transactions = 0;
    const db: any = {
      researchBundle: delegate({ id: 'research-bundle-1' }),
      sourceRecord: delegate(),
      evidenceItem: delegate({ sourceId: 'research-bundle-1:source-1' }),
      claim: delegate(),
      artifact: delegate({ id: 'artifact-1' }),
      $transaction: async (fn: (tx: any) => Promise<unknown>) => {
        transactions += 1;
        return fn(db);
      },
    };

    const repo = createResearchBundleRepository(db);
    await repo.createWithItems({
      bundle: {
        id: 'research-bundle-1',
        runId: 'run-1',
        fixtureId: 'fixture-1',
        sources: [{ id: 'source-1', sourceType: 'web-search' }],
        evidenceItems: [{ id: 'evidence-1', sourceId: 'source-1' }],
        claims: [{ id: 'claim-1', statement: 'Team news supports the selection.', evidenceIds: ['evidence-1'] }],
      },
      artifactPath: '/tmp/research-bundle.json',
    });

    assert.equal(transactions, 1);
  });

  it('creates parlays and legs inside a transaction', async () => {
    let transactions = 0;
    const db: any = {
      parlay: delegate({ id: 'parlay-1' }),
      parlayLeg: delegate(),
      $transaction: async (fn: (tx: any) => Promise<unknown>) => {
        transactions += 1;
        return fn(db);
      },
    };

    const repo = createParlayRepository(db);
    const parlay = await repo.createWithLegs({
      parlay: {
        runId: 'run-1',
        aggregateConfidence: 0.5,
        aggregateQuality: 0.5,
        rationaleRedacted: 'Analytical parlay.',
      },
      legs: [{
        predictionId: 'prediction-1',
        fixtureId: 'fixture-1',
        marketKey: 'h2h',
        selectionKey: 'home',
        odds: 1.8,
      }],
    });

    assert.equal(parlay.id, 'parlay-1');
    assert.equal(transactions, 1);
  });

  it('redacts sensitive DB payload fields before persistence', async () => {
    const persisted: any[] = [];
    const redactingDelegate = {
      ...delegate(),
      create: async (args: any) => {
        persisted.push(args.data);
        return { id: args.data.id ?? 'created-1', ...args.data, createdAt: now, updatedAt: now };
      },
    };

    await createPredictionRepository({ prediction: redactingDelegate as any }).create({
      fixtureId: 'fixture-1',
      oddsSnapshotId: 'odds-snapshot-1',
      oddsQuoteId: 'odds-quote-1',
      marketKey: 'h2h',
      selectionKey: 'home',
      odds: 1.5,
      impliedProbability: 0.66,
      confidence: 0.8,
      rationaleRedacted: 'DATABASE_URL=mysql://user:secret-pass@example.test/db',
      promptVersion: 'score-v1',
      scoringRuleVersion: 'scoring-v1',
      metadata: { authorization: 'Bearer secret-token' },
    });

    await createValidationArtifactRepository({ validationArtifact: redactingDelegate as any }).create({
      settlementRuleVersion: 'settlement-v1',
      status: 'blocked',
      reason: 'x-apisports-key secret-key',
      resultInput: { cookie: 'session=secret-cookie' },
      outcome: { reason: 'OPENAI_API_KEY=sk-1234567890abcdef' },
      metadata: { databaseUrl: 'mysql://user:secret-pass@example.test/db' },
    });

    const body = JSON.stringify(persisted);
    assert.match(body, /\[REDACTED\]/);
    assert.doesNotMatch(body, /secret-pass|secret-token|secret-key|secret-cookie|sk-1234567890abcdef/);
  });
});
