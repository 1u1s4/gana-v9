import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildDiscordPayload,
  buildGatewayMessage,
  buildValidationMirrorPayload,
  buildValidationMirrorMessage,
  findLatestMetricsArtifact,
  findLatestRecommendationArtifact,
  findLatestValidationArtifact,
  loadDailyStats,
  parseArgs,
  runDailyStatsNotification,
} from '../scripts/notify-discord-daily-stats.mjs';

describe('discord daily stats notifier', () => {
  it('builds a native Discord embed payload from daily metrics without mentions or execution copy', () => {
    const payload = buildDiscordPayload(sampleMetricsArtifact(), {
      date: '2026-05-14',
      username: 'Hermes Test',
      validationArtifact: sampleValidationArtifact(),
    });

    assert.equal(payload.username, 'Hermes Test');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].title, '📊 Gana v9 · Validación diaria');
    assert.match(payload.embeds[0].description, /📅 2026-05-14 · America\/Guatemala/);
    assert.match(payload.embeds[1].title, /🎯 Predicciones/);
    assert.match(payload.embeds[1].description, /> ✅ 8 · ❌ 2 · ➖ 1 · ⏳ 3 · 🚫 0 · ⚪ 1/);
    assert.match(payload.embeds[1].description, /> 📌 Total 15 · 📈 Hit 80% · 🎲 Odds 1.72 · 🧠 Conf 69% · 📊 Edge \+5.5%/);
    assert.match(payload.embeds[2].title, /🧩 Parlays/);
    assert.match(payload.embeds[3].description, /> Gate: won/);
    assert.doesNotMatch(JSON.stringify(payload), /\bstake\b/i);
    assert.doesNotMatch(JSON.stringify(payload), /\bbet\b/i);
  });

  it('builds a plain Hermes gateway message for stats delivery', () => {
    const message = buildGatewayMessage(sampleMetricsArtifact(), {
      date: '2026-05-14',
      validationArtifact: sampleValidationArtifact(),
    });

    assert.match(message, /📊 Gana v9 · Validación diaria/);
    assert.match(message, /🎯 Predicciones/);
    assert.match(message, /🧩 Parlays/);
    assert.match(message, /🛡️ Gate: won/);
    assert.match(message, /🛡️ Revisión manual requerida antes de promover conclusiones/);
    assert.doesNotMatch(message, /\bstake\b/i);
    assert.doesNotMatch(message, /\bbet\b/i);
  });

  it('builds a validated mirror of the prior recommendation message', () => {
    const payload = buildValidationMirrorPayload(sampleRecommendationArtifact(), {
      date: '2026-05-14',
      validationArtifact: sampleValidationArtifact(),
      testLabel: 'Esto es una prueba',
      maxRecommendations: 2,
    });
    const message = buildValidationMirrorMessage(sampleRecommendationArtifact(), {
      date: '2026-05-14',
      validationArtifact: sampleValidationArtifact(),
      testLabel: 'Esto es una prueba',
      maxRecommendations: 2,
    });

    assert.equal(payload.embeds[0].title, '📊 Gana v9 · Validación de recomendaciones');
    assert.match(payload.embeds[0].description, /🧪 Esto es una prueba/);
    assert.match(payload.embeds[0].description, /📦 1 parlays · 📌 1 simples/);
    assert.match(payload.embeds[1].title, /1️⃣ ❌ Team A vs Team B/);
    assert.match(payload.embeds[1].description, /> ✅ ⚽ Team A vs Team B: h2h home @ 1.4/);
    assert.match(payload.embeds[1].description, /> ❌ 🥅 Team A vs Team B: goals under 2.5 @ 1.6/);
    assert.match(payload.embeds[1].description, /Resultado ❌ lost/);
    assert.match(payload.embeds[2].title, /2️⃣ ✅ 📌 Simple · Team C vs Team D · corners under 9.5/);
    assert.match(payload.embeds[2].description, /> ✅ 🎯 Team C vs Team D: corners under 9.5 @ 1.82/);
    assert.match(message, /2️⃣ ✅ 📌 Simple · Team C vs Team D · corners under 9.5/);
    assert.doesNotMatch(JSON.stringify(payload), /\bstake\b/i);
    assert.doesNotMatch(message, /\bbet\b/i);
  });

  it('finds the newest metrics and validation artifacts for a date', () => {
    const root = join(tmpdir(), `gana-daily-stats-${Date.now()}`);
    const older = join(root, 'older');
    const newer = join(root, 'newer');
    mkdirSync(older, { recursive: true });
    mkdirSync(newer, { recursive: true });
    writeFileSync(join(older, 'daily-metrics.json'), JSON.stringify({ date: '2026-05-14', metrics: [sampleSnapshot('2026-05-14')] }));
    writeFileSync(join(newer, 'daily-metrics.json'), JSON.stringify(sampleMetricsArtifact()));
    writeFileSync(join(older, 'validations.json'), JSON.stringify({ target: { date: '2026-05-14' }, validations: [] }));
    writeFileSync(join(newer, 'validations.json'), JSON.stringify(sampleValidationArtifact()));
    writeFileSync(join(older, 'daily-parlay-recommendations.json'), JSON.stringify({ date: '2026-05-14', recommendations: [] }));
    writeFileSync(join(newer, 'daily-parlay-recommendations.json'), JSON.stringify(sampleRecommendationArtifact()));
    utimesSync(join(older, 'daily-metrics.json'), new Date('2026-05-14T00:00:00Z'), new Date('2026-05-14T00:00:00Z'));
    utimesSync(join(newer, 'daily-metrics.json'), new Date('2026-05-15T00:00:00Z'), new Date('2026-05-15T00:00:00Z'));
    utimesSync(join(older, 'validations.json'), new Date('2026-05-14T00:00:00Z'), new Date('2026-05-14T00:00:00Z'));
    utimesSync(join(newer, 'validations.json'), new Date('2026-05-15T00:00:00Z'), new Date('2026-05-15T00:00:00Z'));
    utimesSync(join(older, 'daily-parlay-recommendations.json'), new Date('2026-05-14T00:00:00Z'), new Date('2026-05-14T00:00:00Z'));
    utimesSync(join(newer, 'daily-parlay-recommendations.json'), new Date('2026-05-15T00:00:00Z'), new Date('2026-05-15T00:00:00Z'));

    const metricsPath = findLatestMetricsArtifact(root, '2026-05-14');
    const validationPath = findLatestValidationArtifact(root, '2026-05-14');
    const recommendationPath = findLatestRecommendationArtifact(root, '2026-05-14');
    const loaded = loadDailyStats(metricsPath, validationPath, recommendationPath);

    assert.equal(metricsPath.endsWith(join('newer', 'daily-metrics.json')), true);
    assert.equal(validationPath.endsWith(join('newer', 'validations.json')), true);
    assert.equal(recommendationPath.endsWith(join('newer', 'daily-parlay-recommendations.json')), true);
    assert.equal(loaded.metricsArtifact.runId, 'daily-2026-05-14-metrics');
    assert.equal(loaded.validationArtifact.gateResult.verdict, 'won');
    assert.equal(loaded.recommendationArtifact.dailyBatchId, 'daily-2026-05-14');
  });

  it('supports dry-run without sending to Discord', async () => {
    const root = join(tmpdir(), `gana-daily-stats-dry-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'daily-metrics.json'), JSON.stringify(sampleMetricsArtifact()));
    const args = parseArgs(['--artifact-root', root, '--date', '2026-05-14', '--dry-run', '--gateway-target', 'discord:123']);
    const result = await runDailyStatsNotification(args);

    assert.equal(result.dryRun, true);
    assert.equal(result.metricDate, '2026-05-14');
    assert.equal(result.gatewayTarget, 'discord:123');
    assert.equal(result.payload.embeds[0].title, '📊 Gana v9 · Validación diaria');
    assert.equal(result.mirrorPayload, undefined);
  });
});

function sampleMetricsArtifact() {
  return {
    runId: 'daily-2026-05-14-metrics',
    date: '2026-05-14',
    days: 1,
    scope: 'daily-2026-05-14',
    metrics: [sampleSnapshot('2026-05-14')],
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
}

function sampleRecommendationArtifact() {
  return {
    dailyBatchId: 'daily-2026-05-14',
    date: '2026-05-14',
    recommendations: [
      {
        kind: 'parlay',
        rank: 1,
        parlayId: 'parlay-1',
        combinedOdds: 2.24,
        aggregateConfidence: 0.74,
        expectedEdge: 0.08,
        validationStatus: 'unvalidated',
        legs: [
          {
            predictionId: 'prediction-h2h-win',
            fixture: 'Team A vs Team B',
            market: 'h2h',
            selection: 'home',
            odds: 1.4,
            confidence: 0.8,
          },
          {
            predictionId: 'prediction-goals-loss',
            fixture: 'Team A vs Team B',
            market: 'goals_over_under',
            selection: 'under',
            line: 2.5,
            odds: 1.6,
            confidence: 0.68,
          },
        ],
      },
      {
        kind: 'atomic-prediction',
        rank: 2,
        parlayId: 'atomic-1',
        combinedOdds: 1.82,
        aggregateConfidence: 0.9,
        expectedEdge: 0.03,
        validationStatus: 'unvalidated',
        legs: [{
          predictionId: 'prediction-corners-win',
          fixture: 'Team C vs Team D',
          market: 'corners_over_under',
          selection: 'under',
          line: 9.5,
          odds: 1.82,
          confidence: 0.9,
        }],
      },
    ],
  };
}

function sampleSnapshot(metricDate) {
  return {
    metricDate,
    timezone: 'America/Guatemala',
    scope: `daily-${metricDate}`,
    predictionMetrics: {
      total: 15,
      won: 8,
      lost: 2,
      voided: 1,
      pending: 3,
      blocked: 0,
      unvalidated: 1,
      settled: 10,
      hitRate: 80,
      avgOdds: 1.72,
      avgConfidence: 0.69,
      avgEdge: 0.055,
      byProvider: [
        { label: 'codex', total: 8, won: 5, lost: 1, hitRate: 83.3 },
        { label: 'gemini', total: 7, won: 3, lost: 1, hitRate: 75 },
      ],
    },
    parlayMetrics: {
      total: 2,
      won: 1,
      lost: 1,
      voided: 0,
      pending: 0,
      blocked: 0,
      unvalidated: 0,
      settled: 2,
      hitRate: 50,
      avgOdds: 2.18,
      avgConfidence: 0.58,
      byProfile: [
        { label: 'balanced', total: 2, won: 1, lost: 1, hitRate: 50 },
      ],
    },
  };
}

function sampleValidationArtifact() {
  return {
    runId: 'validation-run',
    target: { date: '2026-05-14' },
    gateResult: { verdict: 'won', reasons: [], warnings: [] },
    validations: [
      { predictionId: 'prediction-h2h-win', status: 'won' },
      { predictionId: 'prediction-goals-loss', status: 'lost' },
      { predictionId: 'prediction-corners-win', status: 'won' },
    ],
  };
}
