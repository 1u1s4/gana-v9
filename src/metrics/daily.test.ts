import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { runDailyMetrics } from './daily.js';

const config = loadConfig({
  databaseUrl: '',
  apiFootball: {
    timezone: 'America/Guatemala',
  },
}, { skipApiKey: true });

describe('daily metrics service', () => {
  it('blocks actionable persistence when no database is configured', async () => {
    const result = await runDailyMetrics(config, { date: '2026-05-13' }, {});

    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /DATABASE_URL is required/);
    assert.equal(result.metrics.length, 0);
  });

  it('computes prediction and parlay metrics, persists them, and writes an analytical artifact', async () => {
    const upserts: unknown[] = [];
    const writes: Array<{ runId: string; name: string; payload: unknown }> = [];
    const db = {
      prediction: {
        findMany: async () => [
          {
            marketKey: 'h2h',
            odds: 1.8,
            confidence: 0.72,
            edge: 0.06,
            validationArtifacts: [{ status: 'won' }],
          },
          {
            marketKey: 'h2h',
            odds: 2.1,
            confidence: 0.61,
            edge: -0.02,
            validationArtifacts: [{ status: 'lost' }],
          },
          {
            marketKey: 'btts',
            odds: 1.95,
            confidence: 0.64,
            edge: 0.03,
            validationArtifacts: [],
          },
        ],
      },
      parlay: {
        findMany: async () => [
          {
            combinedOdds: 1.42,
            aggregateConfidence: 0.82,
            metadata: { portfolioProfile: 'low-odds-top' },
            validationArtifacts: [{ status: 'won' }],
            legs: [{ marketKey: 'double_chance' }],
          },
          {
            combinedOdds: 2.35,
            aggregateConfidence: 0.58,
            metadata: { profile: 'balanced' },
            validationArtifacts: [{ status: 'lost' }],
            legs: [{ marketKey: 'h2h' }],
          },
        ],
      },
      dailyMetric: {
        upsert: async (args: unknown) => {
          upserts.push(args);
          return {};
        },
      },
    };

    const result = await runDailyMetrics(config, { date: '2026-05-13', days: 1, scope: 'e2e-test' }, { runId: 'metrics-run-1' }, {
      db,
      now: () => new Date('2026-05-14T12:00:00.000Z'),
      writeArtifact: (runId, name, payload) => {
        writes.push({ runId, name, payload });
        return `/tmp/${runId}/${name}`;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.persisted, 1);
    assert.equal(upserts.length, 1);
    assert.equal(writes[0]?.name, 'daily-metrics.json');
    assert.equal(result.artifactPath, '/tmp/metrics-run-1/daily-metrics.json');

    const snapshot = result.metrics[0];
    assert.equal(snapshot?.metricDate, '2026-05-13');
    assert.equal(snapshot?.scope, 'e2e-test');
    assert.equal(snapshot?.predictionMetrics.total, 3);
    assert.equal(snapshot?.predictionMetrics.won, 1);
    assert.equal(snapshot?.predictionMetrics.lost, 1);
    assert.equal(snapshot?.predictionMetrics.unvalidated, 1);
    assert.equal(snapshot?.predictionMetrics.hitRate, 50);
    assert.equal(snapshot?.predictionMetrics.avgEdge, 0.0233);
    assert.equal(snapshot?.predictionMetrics.byMarket?.some((item) => item.key === 'h2h' && item.total === 2), true);
    assert.equal(snapshot?.predictionMetrics.byMarket?.some((item) => item.label === 'h2h'), true);
    assert.equal(snapshot?.parlayMetrics.total, 2);
    assert.equal(snapshot?.parlayMetrics.hitRate, 50);
    assert.equal(snapshot?.parlayMetrics.byProfile?.some((item) => item.key === 'low-odds-top'), true);
    assert.equal(snapshot?.chartMetrics.parlayHitRateByProfile.length, 2);

    const payload = writes[0]?.payload as any;
    assert.equal(payload.analyticalArtifactOnly, true);
    assert.equal(payload.executionCapability, 'none');
    assert.equal(payload.metrics[0].chartMetrics.parlayHitRateByProfile.some((item: any) => item.label === 'low-odds-top'), true);
  });

  it('supports no-persist analytical snapshots without requiring the daily_metrics table', async () => {
    const db = {
      prediction: { findMany: async () => [] },
      parlay: { findMany: async () => [] },
    };

    const result = await runDailyMetrics(config, { date: '2026-05-13', persist: false }, { runId: 'metrics-run-2' }, {
      db,
      writeArtifact: () => '/tmp/daily-metrics.json',
    });

    assert.equal(result.ok, true);
    assert.equal(result.persisted, 0);
    assert.equal(result.metrics[0]?.predictionMetrics.total, 0);
    assert.equal(result.metrics[0]?.parlayMetrics.total, 0);
  });

  it('writes chart-ready labels in artifacts without circular metric references', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-daily-metrics-artifact-'));
    const artifactConfig = loadConfig({
      ...config,
      artifactRoot: join(root, 'artifacts'),
    }, { skipApiKey: true });
    const db = {
      prediction: {
        findMany: async () => [{
          marketKey: 'double_chance',
          odds: 1.22,
          confidence: 0.86,
          edge: 0.03,
          validationArtifacts: [{ status: 'won' }],
        }],
      },
      parlay: {
        findMany: async () => [{
          combinedOdds: 1.44,
          aggregateConfidence: 0.82,
          metadata: { portfolioProfile: 'low-odds-top' },
          validationArtifacts: [{ status: 'won' }],
          legs: [{ marketKey: 'double_chance' }],
        }],
      },
    };

    const result = await runDailyMetrics(artifactConfig, { date: '2026-05-13', persist: false }, { runId: 'metrics-run-3' }, { db });
    assert.equal(result.ok, true);
    const artifact = JSON.parse(readFileSync(result.artifactPath ?? '', 'utf-8'));
    const serialized = JSON.stringify(artifact);

    assert.equal(serialized.includes('[Circular]'), false);
    assert.equal(artifact.metrics[0].chartMetrics.parlayHitRateByProfile[0].label, 'low-odds-top');
    assert.equal(artifact.metrics[0].predictionMetrics.byMarket[0].label, 'double_chance');
  });
});
