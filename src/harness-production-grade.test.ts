import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { loadConfig } from './config.js';
import { brierScore } from './analytics/brier.js';
import { calibrationPlot } from './analytics/calibration-plot.js';
import { closingLineValue } from './analytics/clv.js';
import { buildLeaderboard } from './analytics/leaderboard.js';
import { logLoss } from './analytics/logloss.js';
import { splitHoldout } from './analytics/holdout.js';
import { proportionalDevig } from './markets/devig.js';
import { consensusFairPrices } from './markets/fair-price.js';
import { isLowLiquidity, marketEfficiencyScore } from './markets/efficiency.js';
import { lineupGate } from './markets/lineup-gate.js';
import { lineMovementVelocity } from './markets/line-movement.js';
import { generateParlayCandidates } from './parlay/candidate-generator.js';
import { correlationPenalty } from './parlay/correlation.js';
import { diversifyParlays } from './parlay/diversifier.js';
import { rankParlayCandidates } from './parlay/ranker.js';
import { createRuntimeContext } from './runtime/context.js';
import { leaseNextTask } from './runtime/dispatcher.js';
import { buildIdempotencyKey, IdempotencySet } from './runtime/idempotency.js';
import { recoverExpiredLeases } from './runtime/recovery.js';
import { scheduleRunTasks } from './runtime/scheduler.js';
import { plattScale, isotonicCalibrate } from './scoring/calibration.js';
import { detectDisagreement } from './scoring/disagreement.js';
import { evaluateEdgeGate } from './scoring/edge-gate.js';
import { combineProviderPredictions } from './scoring/ensemble.js';
import { bm25Search } from './retrieval/bm25.js';
import { buildCorpusFromEvidencePack } from './retrieval/corpus.js';
import { evaluateFreshness } from './retrieval/freshness.js';
import { claimsHaveProvenance } from './retrieval/provenance.js';
import { createToolRegistry } from './tools/index.js';
import { runCertification } from './evals/runner.js';

describe('production-grade tool registry and certification', () => {
  it('registers every agent tool with required governance attributes and no OpenRouter server tools', () => {
    const config = loadConfig({ databaseUrl: '' }, { skipApiKey: true });
    const runtime = createRuntimeContext(config, 'session.jsonl');
    const tools = createToolRegistry({ config, runtime }).listTools();

    assert.ok(tools.length >= 8);
    assert.equal(tools.some((tool) => tool.name.startsWith('openrouter:')), false);
    for (const tool of tools) {
      assert.ok(tool.schema, tool.name);
      assert.ok(tool.metadata, tool.name);
      assert.ok(tool.policy, tool.name);
      assert.ok(tool.redaction, tool.name);
      assert.ok(tool.audit, tool.name);
      assert.ok(tool.timeoutMs > 0, tool.name);
      assert.ok(tool.risk, tool.name);
      assert.ok(tool.executor, tool.name);
    }
  });

  it('runs ci-certification without real credentials', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-certify-'));
    const config = loadConfig({ artifactRoot: join(root, 'artifacts'), databaseUrl: '', apiFootballKey: '' }, { skipApiKey: true });
    const runtime = createRuntimeContext(config, join(root, 'session.jsonl'));
    const result = await runCertification(config, runtime, 'ci-certification');

    assert.equal(result.ok, true);
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf-8'));
    assert.equal(manifest.deterministic, true);
    assert.equal(manifest.hash, result.hash);
  });
});

describe('durable runtime task primitives', () => {
  it('schedules, leases, recovers, and deduplicates tasks deterministically', () => {
    const tasks = scheduleRunTasks('run-1', { date: '2026-05-03' });
    assert.equal(tasks.length, 8);
    const leased = leaseNextTask(tasks, new Date('2026-05-03T00:00:00.000Z'), 1_000);
    assert.equal(leased?.status, 'running');
    const recovered = recoverExpiredLeases(tasks, new Date('2026-05-03T00:00:02.000Z'));
    assert.equal(recovered[0].status, 'queued');

    const key = buildIdempotencyKey({ runId: 'run-1', fixtureId: 'fx', market: 'h2h' });
    const set = new IdempotencySet();
    assert.equal(set.reserve(key), true);
    assert.equal(set.reserve(key), false);
  });
});

describe('retrieval gates', () => {
  it('ranks documents, enforces freshness, and checks provenance', () => {
    const corpus = buildCorpusFromEvidencePack({
      sources: [{ id: 'src-1', type: 'odds', availableAt: '2026-05-03T10:00:00.000Z' }],
      evidenceItems: [{ id: 'ev-1', sourceId: 'src-1', summary: 'Home team price shortened sharply' }],
      claims: [{ id: 'cl-1', statement: 'Home has market support', evidenceIds: ['ev-1'] }],
    });
    assert.equal(bm25Search(corpus, 'home market', 1)[0].document.id, 'cl-1');
    assert.equal(evaluateFreshness({
      sourceType: 'odds',
      availableAt: '2026-05-03T08:00:00.000Z',
      fixtureStatus: 'scheduled',
      now: new Date('2026-05-03T10:00:00.000Z'),
    }).fresh, false);
    assert.equal(claimsHaveProvenance([{ id: 'cl-1', evidenceIds: ['ev-1'] }]).ok, true);
  });
});

describe('market, scoring, parlay, and analytics modules', () => {
  it('devigs symmetric markets and identifies weak liquidity', () => {
    const devig = proportionalDevig([{ selection: 'home', odds: 2 }, { selection: 'away', odds: 2 }]);
    assert.equal(Math.round(devig.reduce((sum, item) => sum + item.fairProbability, 0) * 1000), 1000);
    assert.equal(consensusFairPrices([
      { bookmaker: 'a', selection: 'home', odds: 1.8 },
      { bookmaker: 'a', selection: 'away', odds: 2.1 },
      { bookmaker: 'b', selection: 'home', odds: 1.82 },
      { bookmaker: 'b', selection: 'away', odds: 2.08 },
      { bookmaker: 'c', selection: 'home', odds: 1.79 },
      { bookmaker: 'c', selection: 'away', odds: 2.12 },
    ]).length, 2);
    assert.equal(isLowLiquidity({ bookmakerCount: 1, overround: 0.04, dispersion: 0.01, freshnessMinutes: 10 }), true);
    assert.ok(marketEfficiencyScore({ bookmakerCount: 3, overround: 0.04, dispersion: 0.01, freshnessMinutes: 10 }) > 0.7);
  });

  it('applies edge, lineup, line movement, calibration, and disagreement gates', () => {
    assert.deepEqual(evaluateEdgeGate({
      modelProbability: 0.55,
      marketFairProbability: 0.57,
      confidenceBand: 'high',
    }).blockers, ['no-edge']);
    assert.deepEqual(lineupGate({
      market: 'btts',
      kickoffAt: '2026-05-03T10:30:00.000Z',
      lineupConfirmed: false,
      now: new Date('2026-05-03T09:30:00.000Z'),
    }), ['lineup-pending']);
    assert.equal(Math.round(lineMovementVelocity(2, 1.84) * 100), -8);
    assert.ok(plattScale(0.6) > 0.5);
    const iso = isotonicCalibrate([{ predicted: 0.2, observed: 0 }, { predicted: 0.8, observed: 1 }]);
    assert.ok(iso(0.8) >= iso(0.2));
    assert.deepEqual(detectDisagreement([{ selection: 'home', probability: 0.55 }, { selection: 'home', probability: 0.78 }]), ['model-disagreement']);
    assert.equal(combineProviderPredictions([{ provider: 'a', selection: 'home', probability: 0.7 }]).confidenceBand, 'high');
  });

  it('penalizes correlated parlays and reports validation analytics', () => {
    const penalty = correlationPenalty([
      { fixtureId: 'fx-1', market: 'h2h' },
      { fixtureId: 'fx-1', market: 'goals_over_under' },
    ]);
    assert.ok(penalty > 0);
    const candidates = generateParlayCandidates([
      { id: 'p1', runId: 'r', fixtureId: 'fx1', market: 'h2h', selection: 'home', odds: 1.5, confidence: 0.8, quality: 'high', status: 'promotable', estimatedProbability: 0.72, edge: 0.05 },
      { id: 'p2', runId: 'r', fixtureId: 'fx2', market: 'btts', selection: 'yes', odds: 1.6, confidence: 0.75, quality: 'high', status: 'promotable', estimatedProbability: 0.68, edge: 0.04 },
    ]);
    assert.equal(rankParlayCandidates(candidates)[0].legs.length, 2);
    assert.ok(diversifyParlays(candidates).length <= 3);

    const outcomes = [{ probability: 0.7, outcome: 1 as const }, { probability: 0.4, outcome: 0 as const }];
    assert.ok(brierScore(outcomes) < 0.2);
    assert.ok(logLoss(outcomes) > 0);
    assert.ok(closingLineValue({ takenOdds: 2.1, closingOdds: 2 }) > 0);
    assert.equal(calibrationPlot(outcomes)[0].lowSample, true);
    assert.equal(buildLeaderboard(outcomes.map((item) => ({ ...item, promptVersion: 'v1', modelId: 'm', market: 'h2h', league: 'l' })))[0].lowSample, true);
    assert.equal(splitHoldout([1, 2, 3, 4], 0.25).holdout.length, 1);
  });
});
