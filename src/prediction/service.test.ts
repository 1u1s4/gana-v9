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

const sourceRecords = [
  {
    id: 'source-1',
    bundleId: 'research-bundle-1',
    runId: 'research-run-1',
    fixtureId: 'fixture-1',
    artifactId: null,
    providerSnapshotId: 'provider-snapshot-1',
    sourceType: 'provider-snapshot',
    url: null,
    title: 'Provider snapshot',
    externalId: 'provider-snapshot-1',
    hash: 'hash',
    capturedAt: now,
    warnings: null,
    metadata: null,
    createdAt: now,
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
    sourceRecords: { list: async () => sourceRecords },
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
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by the supplied evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
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
    assert.equal(persisted[0].estimatedProbability, 0.56);
    assert.equal(persisted[0].edge, 0.56 - (1 / 2.1));
    assert.equal(persisted[0].metadata.parlayEligible, true);
  });

  it('repairs LLM evidence and claim references that omit persisted bundle prefixes', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const prefixedEvidence = evidenceItems.map((item) => ({ ...item, id: `research-bundle-1:${item.id}` }));
    const prefixedClaims = claims.map((claim) => ({
      ...claim,
      id: `research-bundle-1:${claim.id}`,
      evidenceIds: ['research-bundle-1:evidence-1', 'research-bundle-1:evidence-2'],
    }));
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        evidenceItems: { list: async () => prefixedEvidence },
        claims: { list: async () => prefixedClaims },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by the supplied evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'promotable');
    assert.deepEqual(persisted[0].evidenceIds, ['research-bundle-1:evidence-1', 'research-bundle-1:evidence-2']);
    assert.deepEqual(result.predictions[0].claimIds, ['research-bundle-1:claim-1']);
  });

  it('repairs LLM evidence references that cite source ids or urls instead of evidence item ids', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const webSource = {
      ...sourceRecords[0],
      id: 'source-web-1',
      sourceType: 'web-search',
      url: 'https://example.com/match-preview',
      externalId: 'match-preview',
    };
    const webEvidence = evidenceItems.map((item, index) => ({
      ...item,
      id: `web-evidence-${index + 1}`,
      sourceId: webSource.id,
    }));
    const webClaims = [{
      ...claims[0],
      id: 'web-claim-1',
      evidenceIds: webEvidence.map((item) => item.id),
    }];
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        sourceRecords: { list: async () => [webSource] },
        evidenceItems: { list: async () => webEvidence },
        claims: { list: async () => webClaims },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['other-bundle:web-evidence-1'],
            claimIds: ['web-claim-1'],
            rationale: 'Home selection is supported by the supplied web preview evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'promotable');
    assert.deepEqual(persisted[0].evidenceIds, ['web-evidence-1', 'web-evidence-2']);
  });

  it('augments under-cited LLM picks with gate-approved evidence to avoid false evidence-thin blockers', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['evidence-1'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by the supplied evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'promotable');
    assert.deepEqual(persisted[0].evidenceIds, ['evidence-1', 'evidence-2']);
    assert.equal(persisted[0].warnings.includes('evidence-thin'), false);
  });

  it('keeps scoring prompts compact by trimming representative allowed quotes', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const manyQuotes = [
      oddsQuote,
      ...Array.from({ length: 120 }, (_, index) => ({
        ...oddsQuote,
        id: `corner-quote-${index}`,
        marketKey: 'corners_over_under',
        selectionKey: index % 2 === 0 ? 'over' : 'under',
        line: 5 + (index / 4),
        price: 1.5 + (index % 10) / 10,
      })),
    ];
    let prompt = '';

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsQuotes: { listLatest: async () => manyQuotes },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async (_config, input) => {
        prompt = String(input);
        return {
          text: JSON.stringify({
            predictions: [{
              oddsQuoteId: 'odds-quote-1',
              market: 'h2h',
              selection: 'home',
              line: null,
              odds: 2.1,
              probability: 0.56,
              confidence: 0.75,
              evidenceIds: ['evidence-1', 'evidence-2'],
              claimIds: ['claim-1'],
              rationale: 'Home selection is supported by the supplied evidence.',
              warnings: [],
            }, {
              oddsQuoteId: 'corner-quote-18',
              market: 'corners_over_under',
              selection: 'over',
              line: 9.5,
              odds: 2.3,
              probability: 0.5,
              confidence: 0.68,
              evidenceIds: ['evidence-1', 'evidence-2'],
              claimIds: ['claim-1'],
              rationale: 'Corners over is supported by the supplied evidence and odds context.',
              warnings: [],
            }],
          }),
          usage: {},
          output: '',
        };
      },
      persistPredictions: async (records: any[]) => records,
    });

    const payload = JSON.parse(prompt.slice(prompt.indexOf('Input:') + 'Input:'.length));
    assert.equal(result.ok, true);
    assert.equal(payload.allowedQuotes.length, 80);
    assert.equal(payload.allowedQuotes.some((quote: any) => quote.oddsQuoteId === 'odds-quote-1'), true);
    assert.match(payload.providerContextWarnings.join('\n'), /allowedQuotes trimmed/);
  });

  it('blocks LLM outputs that omit available markets instead of adding deterministic fallback picks', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted = false;
    const bttsQuote = {
      ...oddsQuote,
      id: 'odds-quote-btts',
      marketKey: 'btts',
      selectionKey: 'no',
      line: null,
      price: 1.72,
      impliedProbability: 0.5813953488,
    };
    const cornersQuote = {
      ...oddsQuote,
      id: 'odds-quote-corners',
      marketKey: 'corners_over_under',
      selectionKey: 'over',
      line: 9.5,
      price: 1.9,
      impliedProbability: 0.5263157895,
    };

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsQuotes: { listLatest: async () => [oddsQuote, bttsQuote, cornersQuote] },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by the supplied evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async () => {
        persisted = true;
        return [];
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.error ?? '', /omitted required market "btts"/);
    assert.match(result.error ?? '', /omitted required market "corners_over_under"/);
    assert.equal(persisted, false);
  });

  it('blocks invalid LLM picks that reference quotes outside the persisted odds snapshot', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted = false;

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions-blocked.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'missing-quote',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['evidence-1'],
            claimIds: ['claim-1'],
            rationale: 'Invalid quote reference.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async () => {
        persisted = true;
        return [];
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.error ?? '', /unknown oddsQuoteId/);
    assert.equal(persisted, false);
  });

  it('applies line movement, lineup, and model disagreement blockers from persisted context', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];
    const kickoffSoon = new Date(now.getTime() + 60 * 60_000);
    const bttsQuote = {
      ...oddsQuote,
      id: 'odds-quote-btts',
      marketKey: 'btts',
      selectionKey: 'yes',
      price: 2,
      impliedProbability: 0.5,
      marketFairProbability: 0.45,
      metadata: {
        openingOdds: 2.3,
        providerPredictions: [
          { provider: 'codex', selection: 'yes', probability: 0.9 },
          { provider: 'gemini', selection: 'yes', probability: 0.62 },
        ],
      },
    };

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        fixtures: {
          findById: async () => ({ ...fixture, scheduledAt: kickoffSoon, metadata: { lineupConfirmed: false } }),
          findByProviderKey: async () => ({ ...fixture, scheduledAt: kickoffSoon, metadata: { lineupConfirmed: false } }),
        },
        oddsQuotes: { listLatest: async () => [bttsQuote] },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-btts',
            market: 'btts',
            selection: 'yes',
            line: null,
            odds: 2,
            probability: 0.9,
            confidence: 0.9,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'BTTS is supported by the supplied evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.deepEqual(result.predictions[0].blockers.sort(), ['model-disagreement', 'stale-pick']);
    assert.match(result.predictions[0].warnings.join('\n'), /lineup-pending/);
    assert.deepEqual(persisted[0].metadata.blockers.sort(), ['model-disagreement', 'stale-pick']);
  });

  it('downgrades predictions when linked research sources are stale', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];
    const staleSource = {
      ...sourceRecords[0],
      capturedAt: new Date('2026-04-25T09:00:00.000Z'),
    };

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        sourceRecords: { list: async () => [staleSource] },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            confidence: 0.75,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by the supplied evidence.',
            warnings: [],
          }],
        }),
        usage: {},
        output: '',
      }),
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.gateResult.verdict, 'review-required');
    assert.match(result.predictions[0].warnings.join('\n'), /stale odds source/);
    assert.equal(persisted[0].metadata.parlayEligible, false);
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
