import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createResearchBundleRepository } from './evidence.js';
import { createParlayLegRepository, createParlayRepository } from './parlays.js';
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

  it('promotes valid provider snapshot source IDs to the relational FK', async () => {
    const sources: any[] = [];
    const db: any = {
      researchBundle: delegate({ id: 'research-bundle-1' }),
      sourceRecord: {
        ...delegate(),
        create: async (args: any) => {
          sources.push(args.data);
          return { id: args.data.id, ...args.data, createdAt: now };
        },
      },
      evidenceItem: delegate(),
      claim: delegate(),
      artifact: delegate(),
      $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
    };

    await createResearchBundleRepository(db).createWithItems({
      bundle: {
        id: 'research-bundle-1',
        runId: 'run-1',
        fixtureId: 'fixture-1',
        sources: [
          { id: 'provider', sourceType: 'provider-snapshot', snapshotId: '02e6633e-7164-46f7-b81a-c779a8dbff70' },
          { id: 'synthetic', sourceType: 'provider-snapshot', snapshotId: 'provider-snapshot:hash' },
          { id: 'web', sourceType: 'web-search', snapshotId: 'ce1a030e-a669-4ebb-98ec-98c7f94529df' },
        ],
      },
    });

    assert.equal(sources[0].providerSnapshotId, '02e6633e-7164-46f7-b81a-c779a8dbff70');
    assert.equal('providerSnapshotId' in sources[1], false);
    assert.equal(sources[1].metadata.snapshotId, 'provider-snapshot:hash');
    assert.equal('providerSnapshotId' in sources[2], false);
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
      createMany: async (args: any) => {
        persisted.push(...args.data);
        return { count: args.data.length };
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

    const validationOpenAiKey = `sk-${'123...cdef'}`;

    await createValidationArtifactRepository({ validationArtifact: redactingDelegate as any }).create({
      settlementRuleVersion: 'settlement-v1',
      status: 'blocked',
      reason: 'x-apisports-key secret-key',
      resultInput: { cookie: 'session=secret-cookie' },
      outcome: { reason: `OPENAI_API_KEY=${validationOpenAiKey}` },
      metadata: { databaseUrl: 'mysql://user:***@example.test/db' },
    });

    await createParlayLegRepository({ parlayLeg: redactingDelegate as any }).create({
      parlayId: 'parlay-1',
      predictionId: 'prediction-1',
      fixtureId: 'fixture-1',
      marketKey: 'h2h',
      selectionKey: 'home',
      odds: 1.8,
      legIndex: 0,
      inclusionReason: 'Authorization: Bearer secret...en',
      metadata: { apiKey: 'secret-parlay-key' },
    });

    await createParlayLegRepository({ parlayLeg: redactingDelegate as any }).createMany([{
      parlayId: 'parlay-1',
      predictionId: 'prediction-2',
      fixtureId: 'fixture-1',
      marketKey: 'btts',
      selectionKey: 'yes',
      odds: 1.9,
      legIndex: 1,
      inclusionReason: 'DATABASE_URL=mysql://secret-parlay-pass@example.test/db',
      metadata: { authorization: 'Bearer secret-parlay-batch-token' },
    }]);

    const body = JSON.stringify(persisted);
    assert.match(body, /\[REDACTED\]/);
    assert.doesNotMatch(body, /secret-pass|secret-token|secret-key|secret-cookie|secret-parlay-token|secret-parlay-key|secret-parlay-pass|secret-parlay-batch-token/);
    assert.equal(body.includes(validationOpenAiKey), false);
  });
});
