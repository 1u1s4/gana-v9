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
  odds: number;
  confidence?: number;
  validation?: string;
  warnings?: string[];
}) {
  return {
    id: `leg-${input.id}`,
    predictionId: `prediction-${input.id}`,
    fixtureId: input.fixtureId ?? `fixture-${input.id}`,
    marketKey: input.market,
    selectionKey: input.selection,
    line: null,
    odds: input.odds,
    fixture: {
      id: input.fixtureId ?? `fixture-${input.id}`,
      homeTeam: { name: `Home ${input.id}` },
      awayTeam: { name: `Away ${input.id}` },
    },
    prediction: {
      confidence: input.confidence ?? 0.8,
      warnings: input.warnings ?? [],
      metadata: {},
      validationArtifacts: input.validation ? [{ status: input.validation }] : [],
    },
  };
}

describe('runParlayAnalysis', () => {
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
    assert.equal(query.where.legs.some.fixture.scheduledAt.gte.toISOString(), '2026-05-13T06:00:00.000Z');
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
        id: 'parlay-core-high',
        profile: 'high-conviction',
        validation: 'unvalidated',
        odds: 1.806,
        confidence: 0.81,
        legs: [
          leg({ id: 'core-a', market: 'goals_over_under', selection: 'over', odds: 1.4, confidence: 0.9 }),
          leg({ id: 'core-b', market: 'h2h', selection: 'home', odds: 1.29, confidence: 0.9 }),
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
    assert.deepEqual(result.top.map((item) => item.parlayId), ['parlay-core-high', 'parlay-core-balanced']);
    assert.equal(result.top.some((item) => item.profile === 'low-odds-top' || item.profile === 'parlay-oro'), false);
  });

  it('requires a persisted parlay scope', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runParlayAnalysis(cfg, {}, runtime, { now: () => now });

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /--date YYYY-MM-DD, --run-id RUN_ID, or --run-ids RUN_ID_A,RUN_ID_B/);
  });
});
