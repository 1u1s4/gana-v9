import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import { runParlayAnalysis } from './analysis.js';

const now = new Date('2026-05-14T12:00:00.000Z');

function config() {
  const root = mkdtempSync(join(tmpdir(), 'gana-parlay-analysis-test-'));
  return loadConfig({
    artifactRoot: join(root, 'artifacts'),
    databaseUrl: 'mysql://user:pass@localhost:3306/gana',
    apiFootball: { timezone: 'America/Guatemala' },
  }, { skipApiKey: true });
}

function parlay(input: {
  id: string;
  profile: string;
  status?: string;
  validation: 'won' | 'lost' | 'pending' | 'voided' | 'unvalidated';
  odds: number;
  confidence: number;
  legs: any[];
  metadata?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    runId: 'source-run-analysis',
    combinedOdds: input.odds,
    aggregateConfidence: input.confidence,
    aggregateQuality: 1,
    status: input.status ?? 'review-required',
    warnings: [],
    metadata: { portfolioProfile: input.profile, ...(input.metadata ?? {}) },
    generatedAt: now,
    validationArtifacts: input.validation === 'unvalidated' ? [] : [{ status: input.validation }],
    legs: input.legs,
  };
}

function leg(input: {
  id: string;
  fixtureId?: string;
  market: string;
  selection: string;
  line?: number;
  odds: number;
  confidence?: number;
  probability?: number | null;
  validation?: string;
  warnings?: string[];
}) {
  return {
    id: `leg-${input.id}`,
    predictionId: `prediction-${input.id}`,
    fixtureId: input.fixtureId ?? `fixture-${input.id}`,
    marketKey: input.market,
    selectionKey: input.selection,
    line: input.line ?? null,
    odds: input.odds,
    fixture: {
      id: input.fixtureId ?? `fixture-${input.id}`,
      homeTeam: { name: `Home ${input.id}` },
      awayTeam: { name: `Away ${input.id}` },
    },
    prediction: {
      confidence: input.confidence ?? 0.8,
      estimatedProbability: input.probability === undefined ? input.confidence ?? 0.8 : input.probability,
      warnings: input.warnings ?? [],
      metadata: {},
      validationArtifacts: input.validation ? [{ status: input.validation }] : [],
    },
  };
}

describe('runParlayAnalysis', () => {
  it('preserves a price variant scope on the analyzed leg without marking ordinary legs', async () => {
    const cfg = config();
    const legs = ['a', 'b'].map((id) => leg({
      id, market: 'h2h', selection: 'home', odds: 1.099, confidence: 0.95, probability: 0.98,
    }));
    legs[0].prediction.metadata = { quoteVariantScope: 'low-odds-top' };
    const row = parlay({ id: 'variant-parlay', profile: 'low-odds-top', status: 'promotable', validation: 'unvalidated', odds: 1.207801, confidence: 0.9025, legs });
    const result = await runParlayAnalysis(cfg, { runId: 'source-run-analysis', profileScope: 'all' }, createRuntimeContext(cfg, 'session.jsonl'), {
      now: () => now,
      db: { parlay: { findMany: async () => [row] } },
      writeArtifact: () => '/tmp/parlay-analysis.json',
    });
    assert.equal(result.top.length, 1);
    assert.equal(result.top[0].legs[0].quoteVariantScope, 'low-odds-top');
    assert.equal(result.top[0].legs[1].quoteVariantScope, undefined);
    assert.equal(result.top[0].legs[0].probability, 0.98);
  });

  it('ranks persisted parlays, assigns analytical stake, identifies banker legs, and backtests selected quality', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let artifactPayload: any;
    let query: any;
    const rows = [
      parlay({
        id: 'parlay-low-odds-top',
        profile: 'low-odds-top',
        validation: 'won',
        odds: 1.404,
        confidence: 0.84,
        status: 'promotable',
        legs: [
          leg({ id: 'safe-a', market: 'double_chance', selection: 'home_or_draw', odds: 1.2, confidence: 0.92, validation: 'won' }),
          leg({ id: 'safe-b', market: 'double_chance', selection: 'home_or_draw', odds: 1.17, confidence: 0.91, validation: 'won' }),
        ],
      }),
      parlay({
        id: 'parlay-low-odds-top-duplicate',
        profile: 'low-odds-top',
        validation: 'won',
        odds: 1.404,
        confidence: 0.84,
        status: 'promotable',
        legs: [
          leg({ id: 'safe-a', market: 'double_chance', selection: 'home_or_draw', odds: 1.2, confidence: 0.92, validation: 'won' }),
          leg({ id: 'safe-b', market: 'double_chance', selection: 'home_or_draw', odds: 1.17, confidence: 0.91, validation: 'won' }),
        ],
      }),
      parlay({
        id: 'parlay-low-variance',
        profile: 'low-variance',
        validation: 'won',
        odds: 1.83,
        confidence: 0.7,
        legs: [
          leg({ id: 'safe-c', market: 'h2h', selection: 'home', odds: 1.7, validation: 'won' }),
          leg({ id: 'safe-d', market: 'h2h', selection: 'home', odds: 1.08, validation: 'won' }),
        ],
      }),
      parlay({
        id: 'parlay-bad-h2h',
        profile: 'default',
        validation: 'lost',
        odds: 1.26,
        confidence: 0.78,
        legs: [
          leg({ id: 'bad-a', market: 'h2h', selection: 'home', odds: 1.12, validation: 'lost', warnings: ['low-liquidity'] }),
          leg({ id: 'bad-b', market: 'double_chance', selection: 'home_or_draw', odds: 1.06, validation: 'won' }),
        ],
      }),
      parlay({
        id: 'parlay-negative-edge',
        profile: 'parlay-oro',
        validation: 'lost',
        odds: 1.9,
        confidence: 0.68,
        metadata: { candidateDiagnostics: { expectedEdge: -0.2 } },
        legs: [
          leg({ id: 'bad-c', market: 'h2h', selection: 'home', odds: 1.12, validation: 'lost', warnings: ['low-liquidity'] }),
          leg({ id: 'bad-d', market: 'double_chance', selection: 'home_or_draw', odds: 1.18, validation: 'won' }),
        ],
      }),
    ];

    const result = await runParlayAnalysis(cfg, {
      date: '2026-05-13',
      top: 3,
      bankrollUnits: 100,
      profileScope: 'all',
    }, runtime, {
      now: () => now,
      db: {
        parlay: {
          findMany: async (args) => {
            query = args;
            return rows;
          },
        },
      },
      writeArtifact: (_runId, _name, payload) => {
        artifactPayload = payload;
        return '/tmp/parlay-analysis.json';
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.analyzed, 5);
    assert.equal(result.diagnostics.profileScope, 'all');
    assert.equal(result.diagnostics.rawAnalyzed, 5);
    assert.equal(result.diagnostics.profileScopedAnalyzed, 5);
    assert.equal(query.where.AND[0].legs.some.fixture.scheduledAt.gte.toISOString(), '2026-05-13T06:00:00.000Z');
    assert.equal(query.where.AND[0].legs.some.fixture.scheduledAt.lt.toISOString(), '2026-05-14T06:00:00.000Z');
    assert.equal(query.where.AND[1].legs.every.fixture.scheduledAt.gte.toISOString(), '2026-05-13T06:00:00.000Z');
    assert.equal(query.where.AND[1].legs.every.fixture.scheduledAt.lt.toISOString(), '2026-05-14T06:00:00.000Z');
    assert.equal(query.include.legs.include.prediction.select.estimatedProbability, true);
    assert.deepEqual(result.top.map((item) => item.parlayId), ['parlay-low-odds-top', 'parlay-low-variance']);
    assert.equal(result.top.every((item) => item.validationStatus === 'won'), true);
    assert.equal(result.diagnostics.universe.hitRate, 0.6);
    assert.equal(result.diagnostics.selected.hitRate, 1);
    assert.equal(result.diagnostics.selected.totalStakeUnits > 0, true);
    assert.equal(result.diagnostics.selected.totalExposureUnits > 0, true);
    assert.equal(result.diagnostics.selected.totalStakePercentOfBankroll <= 0.08, true);
    assert.equal(result.diagnostics.selected.totalExposurePercent <= 0.08, true);
    assert.equal(result.top[0].exposure.policy, 'fractional-kelly-capped-analytical-exposure');
    assert.equal(result.top[0].stake.policy, 'fractional-kelly-capped-analytical-stake');
    assert.equal(result.top[0].bankerLegs.length, 2);
    assert.equal(result.top[0].legs.every((item) => item.banker), true);
    assert.equal(result.diagnostics.bankrollPolicy.bankrollUnits, 100);
    assert.equal(result.diagnostics.exposurePolicy.analyticalUnits, 100);
    assert.match(JSON.stringify(result.diagnostics.rejected), /low-liquidity h2h short favorite/);
    assert.match(JSON.stringify(result.diagnostics.rejected), /duplicate parlay leg set across source runs/);
    assert.equal(artifactPayload.analyticalArtifactOnly, true);
    assert.equal(artifactPayload.executionCapability, 'none');
    assert.equal('bank' in result.top[0], false);
  });

  it('defaults to the stable core profile scope for bankroll selection', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const rows = [
      parlay({
        id: 'parlay-low-odds-top',
        profile: 'low-odds-top',
        validation: 'unvalidated',
        odds: 1.4,
        confidence: 0.9,
        status: 'promotable',
        legs: [
          leg({ id: 'low-a', market: 'double_chance', selection: 'home_or_draw', odds: 1.18, confidence: 0.92 }),
          leg({ id: 'low-b', market: 'double_chance', selection: 'home_or_draw', odds: 1.18, confidence: 0.91 }),
        ],
      }),
      parlay({
        id: 'parlay-core-diamante',
        profile: 'parlay-diamante',
        validation: 'unvalidated',
        odds: 1.207,
        confidence: 0.88,
        status: 'promotable',
        legs: [
          leg({ id: 'core-a', market: 'double_chance', selection: 'home_or_draw', odds: 1.1, confidence: 0.9, probability: 0.95 }),
          leg({ id: 'core-b', market: 'double_chance', selection: 'draw_or_away', odds: 1.097, confidence: 0.86, probability: 0.95 }),
        ],
      }),
      parlay({
        id: 'parlay-core-balanced',
        profile: 'balanced',
        validation: 'unvalidated',
        odds: 2.506,
        confidence: 0.657,
        legs: [
          leg({ id: 'core-c', market: 'goals_over_under', selection: 'over', odds: 1.4, confidence: 0.9 }),
          leg({ id: 'core-d', market: 'h2h', selection: 'home', odds: 1.79, confidence: 0.73 }),
        ],
      }),
      parlay({
        id: 'parlay-oro-noisy',
        profile: 'parlay-oro',
        validation: 'unvalidated',
        odds: 3.498,
        confidence: 0.2219,
        legs: [
          leg({ id: 'oro-a', market: 'h2h', selection: 'home', odds: 1.4, confidence: 0.74 }),
          leg({ id: 'oro-b', market: 'h2h', selection: 'home', odds: 1.28, confidence: 0.74 }),
        ],
      }),
    ];

    const result = await runParlayAnalysis(cfg, {
      date: '2026-05-14',
      top: 9,
      bankrollUnits: 100,
    }, runtime, {
      now: () => now,
      db: { parlay: { findMany: async () => rows } },
      writeArtifact: () => '/tmp/parlay-analysis.json',
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.profileScope, 'core');
    assert.equal(result.diagnostics.rawAnalyzed, 4);
    assert.equal(result.diagnostics.profileScopedAnalyzed, 2);
    assert.equal(result.analyzed, 2);
    assert.deepEqual(result.top.map((item) => item.parlayId), ['parlay-core-diamante']);
    assert.equal(result.top.some((item) => item.profile === 'balanced' || item.profile === 'high-conviction' || item.profile === 'low-odds-top' || item.profile === 'parlay-oro'), false);
  });

  it('does not manufacture positive edge with a diamante profile multiplier', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const rows = [
      parlay({
        id: 'parlay-diamante-safe',
        profile: 'parlay-diamante',
        validation: 'unvalidated',
        odds: 1.113,
        confidence: 0.9312,
        status: 'promotable',
        legs: [
          leg({ id: 'diamond-a', market: 'h2h', selection: 'home', odds: 1.05, confidence: 0.97, warnings: ['low-liquidity h2h short favorite'] }),
          leg({ id: 'diamond-b', market: 'h2h', selection: 'away', odds: 1.06, confidence: 0.96 }),
        ],
      }),
      parlay({
        id: 'parlay-low-odds-top',
        profile: 'low-odds-top',
        validation: 'unvalidated',
        odds: 1.404,
        confidence: 0.84,
        status: 'promotable',
        legs: [
          leg({ id: 'low-a', market: 'double_chance', selection: 'home_or_draw', odds: 1.18, confidence: 0.92 }),
          leg({ id: 'low-b', market: 'double_chance', selection: 'home_or_draw', odds: 1.19, confidence: 0.91 }),
        ],
      }),
    ];

    const result = await runParlayAnalysis(cfg, {
      date: '2026-05-17',
      top: 3,
      bankrollUnits: 100,
    }, runtime, {
      now: () => now,
      db: { parlay: { findMany: async () => rows } },
      writeArtifact: () => '/tmp/parlay-analysis.json',
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.profileScope, 'core');
    assert.equal(result.diagnostics.profileScopedAnalyzed, 1);
    assert.equal(result.top.length, 0);
    assert.equal(result.diagnostics.rejected.some((item) => item.parlayId === 'parlay-diamante-safe'), true);
  });

  it('quarantines balanced parlays from final analysis recommendations', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const rows = [
      parlay({
        id: 'parlay-balanced-low-liquidity',
        profile: 'balanced',
        validation: 'unvalidated',
        odds: 2.05,
        confidence: 0.56,
        status: 'review-required',
        legs: [
          leg({ id: 'low-a', market: 'btts', selection: 'yes', odds: 1.55, confidence: 0.74, warnings: ['low-liquidity'] }),
          leg({ id: 'low-b', market: 'goals_over_under', selection: 'over', line: 1.5, odds: 1.32, confidence: 0.76, warnings: ['Single-bookmaker quote'] }),
        ],
      }),
    ];

    const result = await runParlayAnalysis(cfg, {
      date: '2026-05-15',
      top: 3,
      bankrollUnits: 100,
      profileScope: 'all',
    }, runtime, {
      now: () => now,
      db: { parlay: { findMany: async () => rows } },
      writeArtifact: () => '/tmp/parlay-analysis.json',
    });

    assert.equal(result.top.length, 0);
    assert.match(JSON.stringify(result.diagnostics.rejected), /profile balanced is purged from final recommendations/);
  });

  it('uses persisted model probabilities for joint probability and EV, independently of evidence confidence', async () => {
    const cfg = config();
    const legs = ['prob-a', 'prob-b'].map((id) => leg({ id, market: 'h2h', selection: 'home', odds: 1.4, confidence: 0.95, probability: 0.72 }));
    for (const item of legs) item.prediction.metadata = { modelProbability: 0.99 };
    const row = parlay({ id: 'probability-row', profile: 'parlay-diamante', status: 'promotable', validation: 'unvalidated', odds: 1.96, confidence: 0.9025, legs });
    const result = await runParlayAnalysis(cfg, { runId: 'run-probability', profileScope: 'all' }, {}, {
      now: () => now, db: { parlay: { findMany: async () => [row] } }, writeArtifact: () => '/tmp/probability-analysis.json',
    });
    assert.equal(result.top.length, 1);
    assert.deepEqual(result.top[0].legs.map((item) => item.probability), [0.72, 0.72]);
    assert.equal(result.top[0].aggregateConfidence, 0.9025);
    assert.equal(result.top[0].adjustedProbability, 0.5184);
    assert.equal(result.top[0].expectedEdge, 0.016064);
  });

  it('rejects missing or invalid model probabilities instead of using high evidence confidence', async () => {
    for (const probability of [null, NaN, 1.2]) {
      const cfg = config();
      const row = parlay({ id: 'missing-probability', profile: 'parlay-diamante', status: 'promotable', validation: 'unvalidated', odds: 1.96, confidence: 0.99,
        legs: [leg({ id: 'missing-a', market: 'h2h', selection: 'home', odds: 1.4, confidence: 0.99, probability }), leg({ id: 'missing-b', market: 'h2h', selection: 'home', odds: 1.4, confidence: 0.99, probability: 0.99 })],
      });
      const result = await runParlayAnalysis(cfg, { runId: 'missing-run', profileScope: 'all' }, {}, {
        now: () => now, db: { parlay: { findMany: async () => [row] } }, writeArtifact: () => '/tmp/probability-analysis.json',
      });
      assert.equal(result.top.length, 0);
      assert.match(result.diagnostics.rejected[0].reasons.join('\n'), /missing or invalid model probability/);
    }
  });

  it('allows legacy explicit modelProbability only when the calibrated storage field is absent', async () => {
    const cfg = config();
    const legs = ['legacy-a', 'legacy-b'].map((id) => leg({ id, market: 'h2h', selection: 'home', odds: 1.4, confidence: 0.95, probability: null }));
    for (const item of legs) item.prediction.metadata = { modelProbability: 0.72 };
    const row = parlay({ id: 'legacy-probability', profile: 'low-variance', status: 'promotable', validation: 'unvalidated', odds: 1.96, confidence: 0.9025, legs });
    const result = await runParlayAnalysis(cfg, { runId: 'legacy-run', profileScope: 'all' }, {}, {
      now: () => now, db: { parlay: { findMany: async () => [row] } }, writeArtifact: () => '/tmp/probability-analysis.json',
    });
    assert.equal(result.top[0]?.adjustedProbability, 0.5184);
  });

  it('requires a persisted parlay scope', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayAnalysis(cfg, {}, runtime, { now: () => now });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /--date YYYY-MM-DD, --run-id RUN_ID, or --run-ids RUN_ID_A,RUN_ID_B/);
  });
});
