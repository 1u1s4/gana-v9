import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import { runFixtureScoring } from './service.js';

const now = new Date('2026-04-25T12:00:00.000Z');

const fixture = {
  id: 'fixture-1',
  providerId: 'provider-1',
  providerFixtureId: '1001',
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  scheduledAt: now,
  status: 'scheduled',
  includedByFilters: ['manual-include'],
  createdAt: now,
  updatedAt: now,
};

const oddsSnapshot = {
  id: 'odds-snapshot-1',
  fixtureId: 'fixture-1',
  providerFixtureId: '1001',
  providerSnapshotId: 'provider-snapshot-1',
  bookmakerCount: 1,
  capturedAt: now,
  payloadHash: 'hash',
  metadata: null,
  createdAt: now,
};

const oddsQuote = {
  id: 'odds-quote-1',
  snapshotId: 'odds-snapshot-1',
  fixtureId: 'fixture-1',
  bookmaker: 'book',
  bookmakerKey: 'book',
  marketKey: 'h2h',
  selectionKey: 'home',
  line: null,
  price: 2.1,
  impliedProbability: 0.4761904762,
  capturedAt: now,
  metadata: null,
  createdAt: now,
};

const researchBundle = {
  id: 'research-bundle-1',
  runId: 'research-run-1',
  fixtureId: 'fixture-1',
  providerFixtureId: '1001',
  artifactId: null,
  status: 'promotable',
  gateResult: { verdict: 'promotable', reasons: ['research complete'], warnings: [] },
  providerAgentic: 'codex',
  model: 'gpt-5.5',
  promptVersion: 'research-fixture-v1',
  warnings: [],
  metadata: null,
  createdAt: now,
  updatedAt: now,
};

const evidenceItems = [
  { id: 'evidence-1', confidence: 0.8, bundleId: 'research-bundle-1', sourceId: 'source-1', fixtureId: 'fixture-1', createdAt: now, updatedAt: now },
  { id: 'evidence-2', confidence: 0.7, bundleId: 'research-bundle-1', sourceId: 'source-1', fixtureId: 'fixture-1', createdAt: now, updatedAt: now },
];

const claims = [
  {
    id: 'claim-1',
    bundleId: 'research-bundle-1',
    fixtureId: 'fixture-1',
    statement: 'Research supports home selection.',
    supportLevel: 'supported',
    evidenceIds: ['evidence-1', 'evidence-2'],
    conflictStatus: 'none',
    critical: false,
    createdAt: now,
    updatedAt: now,
  },
];

function config() {
  return loadConfig({
    databaseUrl: 'mysql://user:pass@localhost:3306/gana',
    provider: 'codex',
    model: 'gpt-5.5',
  }, { skipApiKey: true });
}

function repositories(overrides: Record<string, unknown> = {}) {
  return {
    sportsProviders: { findByCode: async () => ({ id: 'provider-1' }) },
    fixtures: {
      findById: async (id: string) => id === fixture.id ? fixture : null,
      findByProviderKey: async (_providerId: string, id: string) => id === fixture.providerFixtureId ? fixture : null,
    },
    oddsSnapshots: { listLatestByFixture: async () => [oddsSnapshot] },
    oddsQuotes: { listLatest: async () => [oddsQuote] },
    researchBundles: { list: async () => [researchBundle] },
    evidenceItems: { list: async () => evidenceItems },
    claims: { list: async () => claims },
    harnessRuns: { upsertForRun: async () => ({}) },
    artifacts: { create: async () => ({ id: 'artifact-1' }) },
    predictions: { create: async (input: any) => ({ ...input, createdAt: now, updatedAt: now }) },
    ...overrides,
  } as any;
}

describe('runFixtureScoring', () => {
  it('generates and persists predictions linked to fixture, persisted odds, evidence, and versions', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions.json',
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'promotable');
    assert.equal(result.predictions.length, 1);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].fixtureId, 'fixture-1');
    assert.equal(persisted[0].oddsSnapshotId, 'odds-snapshot-1');
    assert.equal(persisted[0].oddsQuoteId, 'odds-quote-1');
    assert.equal(persisted[0].researchBundleId, 'research-bundle-1');
    assert.deepEqual(persisted[0].evidenceIds, ['evidence-1', 'evidence-2']);
    assert.equal(persisted[0].providerAgentic, 'codex');
    assert.equal(persisted[0].model, 'gpt-5.5');
    assert.equal(persisted[0].promptVersion, 'score-prediction-v1');
    assert.equal(persisted[0].scoringRuleVersion, 'scoring-v1');
    assert.equal(persisted[0].impliedProbability, 1 / 2.1);
    assert.equal(persisted[0].edge, null);
  });

  it('blocks without a persisted odds snapshot and does not persist predictions', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted = false;

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsSnapshots: { listLatestByFixture: async () => [] },
      }),
      writeArtifact: () => '/tmp/predictions-blocked.json',
      persistPredictions: async () => {
        persisted = true;
        return [];
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.gateResult.reasons.join('\n'), /missing persisted odds/i);
    assert.equal(persisted, false);
  });
});
