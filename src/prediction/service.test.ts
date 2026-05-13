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
    marketKey: 'h2h',
    selectionKey: 'home',
    line: null,
    sourceId: 'source-1',
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
    assert.equal(persisted[0].promptVersion, 'score-prediction-v2');
    assert.equal(persisted[0].scoringRuleVersion, 'scoring-v2');
    assert.equal(persisted[0].impliedProbability, 1 / 2.1);
    assert.equal(persisted[0].estimatedProbability, 0.56);
    assert.equal(persisted[0].edge, 0.56 - (1 / 2.1));
    assert.equal(persisted[0].metadata.parlayEligible, true);
  });

  it('blocks score --web live when no fresh real web research is available', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let agentCalled = false;
    let persisted = false;

    const result = await runFixtureScoring(cfg, { fixtureId: '1001', web: 'live', markets: ['h2h'] }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions-blocked.json',
      agentRunner: async () => {
        agentCalled = true;
        return { text: '{}', usage: {}, output: '' };
      },
      persistPredictions: async () => {
        persisted = true;
        return [];
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.gateResult.verdict, 'blocked');
    assert.match(result.error ?? '', /score --web live requires a fresh research bundle with real web-search evidence/);
    assert.match(result.error ?? '', /pnpm gana research --fixture-id 1001 --web live --markets h2h/);
    assert.equal(agentCalled, false);
    assert.equal(persisted, false);
  });

  it('applies market/model calibration when enough historical samples exist', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];
    let artifactPayload: any;

    const result = await runFixtureScoring(cfg, { fixtureId: '1001', markets: ['h2h'] }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: (_runId, _name, payload) => {
        artifactPayload = payload;
        return '/tmp/predictions.json';
      },
      calibrationHistory: {
        getCalibrationPoints: async () => Array.from({ length: 50 }, () => ({ predicted: 0.56, observed: 0.62 })),
      },
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            modelProbability: 0.56,
            marketFairProbability: 1 / 2.1,
            edge: 0.56 - (1 / 2.1),
            confidence: 0.75,
            confidenceBand: 'high',
            blockers: [],
            promotable: true,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by h2h-specific evidence.',
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
    assert.equal(persisted[0].estimatedProbability, 0.62);
    assert.equal(persisted[0].metadata.calibration.applied, true);
    assert.equal(persisted[0].metadata.calibration.sampleSize, 50);
    assert.equal(artifactPayload.calibrationSummary.applied, 1);
    assert.deepEqual(artifactPayload.marketCoverage.requestedMarkets, ['h2h']);
    assert.equal(artifactPayload.webSearchCoverage.mode, 'off');
  });

  it('degrades confidence when calibration history has a low sample size', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001', markets: ['h2h'] }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions.json',
      calibrationHistory: {
        getCalibrationPoints: async () => [
          { predicted: 0.55, observed: 1 },
          { predicted: 0.6, observed: 0 },
        ],
      },
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.56,
            modelProbability: 0.56,
            marketFairProbability: 1 / 2.1,
            edge: 0.56 - (1 / 2.1),
            confidence: 0.78,
            confidenceBand: 'high',
            blockers: [],
            promotable: true,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by h2h-specific evidence.',
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
    assert.equal(persisted[0].confidence, 0.49);
    assert.equal(persisted[0].metadata.calibration.applied, false);
    assert.match(persisted[0].warnings.join('\n'), /calibration degraded: sample 2\/50/);
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

  it('fills empty LLM evidenceIds from persisted evidence when the gate is review-only instead of blocking the fixture', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const thinEvidence = evidenceItems.map((item) => ({ ...item, confidence: 0.4 }));
    const thinClaims = [{
      ...claims[0],
      evidenceIds: ['evidence-1'],
    }];
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        evidenceItems: { list: async () => thinEvidence },
        claims: { list: async () => thinClaims },
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
            evidenceIds: [],
            claimIds: ['claim-1'],
            rationale: 'The LLM selected a persisted quote but omitted evidence IDs despite persisted research evidence.',
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
    assert.deepEqual(persisted[0].evidenceIds, ['evidence-1', 'evidence-2']);
    assert.match(persisted[0].warnings.join('\n'), /insufficient evidence/);
  });

  it('retries scoring once with a stricter prompt when the agent returns prose instead of JSON', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let attempts = 0;
    let retryPrompt = '';

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async (_config, input) => {
        attempts += 1;
        retryPrompt = String(input);
        if (attempts === 1) {
          return { text: 'Estoy verificando el partido antes de responder.', usage: {}, output: '' };
        }
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
            }],
          }),
          usage: {},
          output: '',
        };
      },
      persistPredictions: async (records: any[]) => records,
    });

    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
    assert.match(retryPrompt, /minimal-scoring-retry/);
  });

  it('canonicalizes LLM pick fields from a valid persisted oddsQuoteId instead of blocking quote mismatches', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const canonicalQuote = {
      ...oddsQuote,
      id: 'odds-quote-canonical',
      marketKey: 'goals_over_under',
      selectionKey: 'under',
      line: 2.5,
      price: 1.76,
    };
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsQuotes: { listLatest: async () => [canonicalQuote] },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-canonical',
            market: 'h2h',
            selection: 'home',
            line: null,
            odds: 2.1,
            probability: 0.61,
            confidence: 0.68,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'The persisted quote id is valid, but copied quote fields are stale from another allowed quote.',
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
    assert.equal(persisted[0].oddsQuoteId, 'odds-quote-canonical');
    assert.equal(persisted[0].marketKey, 'goals_over_under');
    assert.equal(persisted[0].selectionKey, 'under');
    assert.equal(persisted[0].line, 2.5);
    assert.equal(persisted[0].odds, 1.76);
    assert.equal(persisted[0].warnings.some((warning: string) => warning.includes('canonicalized from persisted odds quote')), true);
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

  it('repairs empty LLM evidenceIds from persisted gate evidence instead of blocking a grounded quote', async () => {
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
            evidenceIds: [],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by the supplied research bundle.',
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
  });

  it('persists blocked market-covering predictions when research has no usable evidence instead of dropping the fixture', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];
    const bttsQuote = {
      ...oddsQuote,
      id: 'odds-quote-btts',
      marketKey: 'btts',
      selectionKey: 'yes',
      line: null,
      price: 1.8,
      impliedProbability: 0.5555555556,
    };

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsQuotes: { listLatest: async () => [oddsQuote, bttsQuote] },
        evidenceItems: { list: async () => [] },
        claims: { list: async () => [] },
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
            confidence: 0.72,
            evidenceIds: [],
            claimIds: [],
            rationale: 'Home selection is the best h2h angle, but evidence is unavailable.',
            warnings: ['evidence unavailable'],
          }, {
            oddsQuoteId: 'odds-quote-btts',
            market: 'btts',
            selection: 'yes',
            line: null,
            odds: 1.8,
            probability: 0.6,
            confidence: 0.7,
            evidenceIds: [],
            claimIds: [],
            rationale: 'BTTS yes is the best market angle, but evidence is unavailable.',
            warnings: ['evidence unavailable'],
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
    assert.equal(result.predictions.length, 2);
    assert.equal(persisted.length, 2);
    assert.deepEqual(persisted.map((prediction) => prediction.marketKey), ['h2h', 'btts']);
    assert.deepEqual(persisted.map((prediction) => prediction.status), ['blocked', 'blocked']);
    assert.deepEqual(persisted.map((prediction) => prediction.evidenceIds), [[], []]);
  });

  it('retries LLM picks that reference unknown oddsQuoteIds before blocking a fixture', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let attempts = 0;
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories(),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => {
        attempts += 1;
        return {
          text: JSON.stringify({
            predictions: [{
              oddsQuoteId: attempts === 1 ? 'missing-quote' : 'odds-quote-1',
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
        };
      },
      persistPredictions: async (records: any[]) => {
        persisted = records;
        return records;
      },
    });

    assert.equal(attempts, 2);
    assert.equal(result.ok, true);
    assert.equal(result.predictions.length, 1);
    assert.equal(persisted[0].oddsQuoteId, 'odds-quote-1');
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

  it('requires market-specific evidence or an explicit fallback before promoting a pick', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const fixtureLevelClaims = claims.map(({ marketKey: _marketKey, selectionKey: _selectionKey, line: _line, ...claim }) => claim);
    let persisted: any[] = [];

    const result = await runFixtureScoring(cfg, { fixtureId: '1001', markets: ['h2h'] }, runtime, {
      now: () => now,
      repositories: repositories({
        claims: { list: async () => fixtureLevelClaims },
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
            modelProbability: 0.56,
            marketFairProbability: 1 / 2.1,
            edge: 0.56 - (1 / 2.1),
            confidence: 0.75,
            confidenceBand: 'high',
            blockers: [],
            promotable: true,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'Home selection is supported by general evidence.',
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
    assert.equal(persisted[0].status, 'review-required');
    assert.equal(persisted[0].metadata.promotable, false);
    assert.match(persisted[0].warnings.join('\n'), /market-specific evidence missing for h2h:home/);
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

  it('caps stale low-liquidity predictions and excludes them from parlays', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];
    const staleSource = {
      ...sourceRecords[0],
      capturedAt: new Date('2026-04-25T09:00:00.000Z'),
    };
    const lowLiquidityQuote = {
      ...oddsQuote,
      metadata: { lowLiquidity: true },
    };

    const result = await runFixtureScoring(cfg, { fixtureId: '1001' }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsQuotes: { listLatest: async () => [lowLiquidityQuote] },
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
            confidence: 0.86,
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

    assert.equal(result.gateResult.verdict, 'review-required');
    assert.equal(persisted[0].confidence, 0.49);
    assert.equal(persisted[0].quality, 'low');
    assert.equal(persisted[0].metadata.parlayEligible, false);
    assert.match(persisted[0].warnings.join('\n'), /stale low-liquidity prediction/);
  });

  it('caps uncalibrated 0.80-0.90 confidence predictions after validation overconfidence', async () => {
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
            confidence: 0.85,
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
    assert.equal(persisted[0].confidence, 0.74);
    assert.equal(persisted[0].quality, 'medium');
    assert.match(persisted[0].warnings.join('\n'), /0.80-0.90 capped/);
  });

  it('caps inflated double-chance edge against implied probability', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let persisted: any[] = [];
    const doubleChanceQuote = {
      ...oddsQuote,
      marketKey: 'double_chance',
      selectionKey: 'home_or_draw',
      price: 1.03,
      impliedProbability: 0.9708737864,
      marketImpliedProbability: 0.9708737864,
      marketFairProbability: 0.45,
    };
    const doubleChanceClaim = {
      ...claims[0],
      marketKey: 'double_chance',
      selectionKey: 'home_or_draw',
    };

    const result = await runFixtureScoring(cfg, { fixtureId: '1001', markets: ['double_chance'] }, runtime, {
      now: () => now,
      repositories: repositories({
        oddsQuotes: { listLatest: async () => [doubleChanceQuote] },
        claims: { list: async () => [doubleChanceClaim] },
      }),
      writeArtifact: () => '/tmp/predictions.json',
      agentRunner: async () => ({
        text: JSON.stringify({
          predictions: [{
            oddsQuoteId: 'odds-quote-1',
            market: 'double_chance',
            selection: 'home_or_draw',
            line: null,
            odds: 1.03,
            modelProbability: 0.96,
            marketFairProbability: 0.45,
            confidence: 0.91,
            evidenceIds: ['evidence-1', 'evidence-2'],
            claimIds: ['claim-1'],
            rationale: 'The favorite has home-or-draw support, but the fair price must be service checked.',
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
    assert.equal(persisted[0].status, 'blocked');
    assert.equal(persisted[0].edge < 0, true);
    assert.equal(persisted[0].metadata.marketFairProbability, 0.9708737864);
    assert.match(persisted[0].warnings.join('\n'), /edge capped to implied probability/);
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
