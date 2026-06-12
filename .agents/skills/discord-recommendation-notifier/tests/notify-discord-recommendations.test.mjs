import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildDiscordPayload,
  buildDiscordPayloads,
  buildDiscordSinglePayload,
  buildGatewayMessage,
  findLatestRecommendationsArtifact,
  loadRecommendations,
  parseArgs,
  sendDiscordNativePayload,
  sendHermesGatewayMessage,
  sendDiscordPayload,
} from '../scripts/notify-discord-recommendations.mjs';

describe('discord recommendation notifier', () => {
  it('builds a native Discord embed payload from daily recommendations without mentions or monetary execution copy', () => {
    const payload = buildDiscordPayload(sampleArtifact(), { max: 1, username: 'Hermes Test' });

    assert.equal(payload.username, 'Hermes Test');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].title, '🏆 Gana v9 · Recomendaciones');
    assert.equal(payload.embeds.length, 3);
    assert.match(payload.embeds[0].description, /📦 1 parlay · 📌 0 simples/);
    assert.match(payload.embeds[1].title, /1️⃣ ⚖️ Team A vs Team B/);
    assert.match(payload.embeds[1].description, /> ⚽ Team A vs Team B: h2h home @ 1.4/);
    assert.match(payload.embeds[1].description, /> 📊 Odds 2.1 · 🧠 Conf 74% · 📈 Edge 8% · 💵 Stake 10/);
    assert.doesNotMatch(payload.embeds[1].description, /Expo/);
    assert.doesNotMatch(JSON.stringify(payload), /\bbet\b/i);
  });

  it('prints an empty-selection field when the artifact has no recommendations', () => {
    const payload = buildDiscordPayload({ date: '2026-05-15', dailyBatchId: 'daily-empty', recommendations: [] });

    assert.equal(payload.embeds.length, 3);
    assert.equal(payload.embeds[1].title, 'Sin selecciones');
  });

  it('builds a plain Hermes gateway message for Discord delivery', () => {
    const message = buildGatewayMessage(sampleArtifact(), { max: 1 });

    assert.match(message, /🏆 Gana v9 · Recomendaciones en revisión/);
    assert.match(message, /📦 1 parlay · 📌 0 simples/);
    assert.match(message, /1️⃣ ⚖️ Team A vs Team B/);
    assert.match(message, /> ⚽ Team A vs Team B: h2h home @ 1.4/);
    assert.match(message, /> 📊 Odds 2.1 · 🧠 Conf 74% · 📈 Edge 8% · 💵 Stake 10/);
    assert.doesNotMatch(message, /Expo n\/a/);
    assert.match(message, /🛡️ Revisión manual requerida antes de promoción/);
    assert.doesNotMatch(message, /\bbet\b/i);
  });

  it('formats atomic high-confidence predictions as simple recommendations', () => {
    const payload = buildDiscordPayload(sampleArtifactWithAtomic(), { max: 2 });
    const message = buildGatewayMessage(sampleArtifactWithAtomic(), { max: 2 });

    assert.match(payload.embeds[0].description, /📦 1 parlay · 📌 1 simple/);
    assert.match(payload.embeds[2].title, /📌 Simple · Team C vs Team D · h2h away/);
    assert.match(payload.embeds[2].description, /> ⚽ Team C vs Team D: h2h away @ 1.18/);
    assert.match(payload.embeds[2].description, /💵 Stake 10/);
    assert.match(message, /2️⃣ 📌 Simple · Team C vs Team D · h2h away/);
  });

  it('labels parlay recommendation titles with profile-specific emojis', () => {
    const base = sampleArtifact().recommendations[0];
    const artifact = {
      date: '2026-06-09',
      recommendations: [
        { ...base, rank: 1, profile: 'parlay-diamante', parlayId: 'diamante-1' },
        { ...base, rank: 2, profile: 'parlay-refinado', parlayId: 'refinado-1' },
        { ...base, rank: 3, profile: 'low-variance', parlayId: 'low-variance-1' },
      ],
    };

    const payload = buildDiscordPayload(artifact, { max: 3 });
    const message = buildGatewayMessage(artifact, { max: 3 });

    assert.match(payload.embeds[1].title, /1️⃣ 💎 Team A vs Team B/);
    assert.match(payload.embeds[2].title, /2️⃣ 🧠 Team A vs Team B/);
    assert.match(payload.embeds[3].title, /3️⃣ 🛡️ Team A vs Team B/);
    assert.match(message, /1️⃣ 💎 Team A vs Team B/);
    assert.match(message, /2️⃣ 🧠 Team A vs Team B/);
    assert.match(message, /3️⃣ 🛡️ Team A vs Team B/);
  });

  it('prints preferred parlay approach status lines in native and gateway output', () => {
    const artifact = {
      ...sampleArtifact(),
      parlayApproaches: [
        { profile: 'parlay-diamante', status: 'blocked', combinedOdds: null },
        { profile: 'parlay-refinado', status: 'selected', combinedOdds: 1.43 },
        { profile: 'low-variance', status: 'blocked', combinedOdds: null },
      ],
    };

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const message = buildGatewayMessage(artifact, { max: 1 });

    assert.match(payload.embeds[0].description, /🎛️ Enfoques: 🚫 💎 parlay-diamante · ✅ 🧠 parlay-refinado @ 1.43 · 🚫 🛡️ low-variance/);
    assert.match(message, /🎛️ Enfoques: 🚫 💎 parlay-diamante · ✅ 🧠 parlay-refinado @ 1.43 · 🚫 🛡️ low-variance/);
  });

  it('uses hydrated display labels and never renders full UUID vs UUID fixtures', () => {
    const artifact = sampleArtifactWithAtomic();
    const uuidA = 'a28f3e87-bc59-4e9e-b1fd-062759061d86';
    const uuidB = 'badde2e5-bc59-4e9e-b1fd-062759061d86';
    artifact.recommendations[1].legs[0] = {
      ...artifact.recommendations[1].legs[0],
      fixtureId: uuidA,
      fixture: `${uuidA} vs ${uuidB}`,
      display: {
        fixtureLabel: 'Fluminense vs Sao Paulo',
        homeTeamName: 'Fluminense',
        awayTeamName: 'Sao Paulo',
        leagueName: 'Brazil Serie A',
      },
    };

    const payload = buildDiscordPayload(artifact, { max: 2 });
    const message = buildGatewayMessage(artifact, { max: 2 });

    assert.match(payload.embeds[2].title, /Fluminense vs Sao Paulo/);
    assert.match(payload.embeds[2].description, /Fluminense vs Sao Paulo: h2h away @ 1.18/);
    assert.doesNotMatch(JSON.stringify(payload), new RegExp(uuidA));
    assert.doesNotMatch(message, new RegExp(uuidB));
  });

  it('shares fixture display labels across recommendations with the same fixture id', () => {
    const artifact = sampleArtifactWithAtomic();
    const fixtureId = artifact.recommendations[0].legs[0].fixtureId;
    artifact.recommendations[0].legs[0] = {
      ...artifact.recommendations[0].legs[0],
      fixtureId,
      fixture: 'Team A vs Team B',
      display: {
        fixtureLabel: 'Team A vs Team B',
        homeTeamName: 'Team A',
        awayTeamName: 'Team B',
      },
    };
    artifact.recommendations[1].legs[0] = {
      ...artifact.recommendations[1].legs[0],
      fixtureId,
      fixture: fixtureId,
      display: undefined,
    };

    const payloads = buildDiscordPayloads(artifact, { max: 2 });
    const message = buildGatewayMessage(artifact, { max: 2 });

    assert.match(payloads[0].embeds[2].title, /📌 Simple · Team A vs Team B · h2h away/);
    assert.match(payloads[0].embeds[2].description, /> ⚽ Team A vs Team B: h2h away @ 1.18/);
    assert.doesNotMatch(JSON.stringify(payloads), new RegExp(fixtureId));
    assert.doesNotMatch(message, new RegExp(fixtureId));
  });

  it('labels over-under markets with the explicit family', () => {
    const artifact = sampleArtifact();
    artifact.recommendations[0].legs = [
      {
        ...artifact.recommendations[0].legs[0],
        market: 'goals_over_under',
        selection: 'under',
        line: 2.5,
        odds: 1.6,
      },
      {
        ...artifact.recommendations[0].legs[0],
        predictionId: 'prediction-corners',
        market: 'corners_over_under',
        selection: 'under',
        line: 9.5,
        odds: 1.82,
      },
    ];

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const message = buildGatewayMessage(artifact, { max: 1 });

    assert.match(payload.embeds[1].description, /> 🥅 Team A vs Team B: goals under 2.5 @ 1.6/);
    assert.match(payload.embeds[1].description, /> 🎯 Team A vs Team B: corners under 9.5 @ 1.82/);
    assert.match(message, /> 🥅 Team A vs Team B: goals under 2.5 @ 1.6/);
    assert.match(message, /> 🎯 Team A vs Team B: corners under 9.5 @ 1.82/);
  });

  it('caps native Discord embeds at the platform limit', () => {
    const artifact = sampleArtifact();
    artifact.recommendations = Array.from({ length: 12 }, (_, index) => ({
      ...sampleArtifact().recommendations[0],
      rank: index + 1,
      parlayId: `parlay-${index + 1}`,
    }));

    const payload = buildDiscordPayload(artifact, { max: 10 });

    assert.equal(payload.embeds.length, 10);
    assert.match(payload.embeds.at(-1).description, /Revisión manual requerida/);
  });

  it('splits more than eight Discord selections into multiple native payloads', () => {
    const artifact = sampleArtifact();
    artifact.recommendations = Array.from({ length: 14 }, (_, index) => ({
      ...sampleArtifact().recommendations[0],
      rank: index + 1,
      parlayId: `parlay-${index + 1}`,
      kind: index < 4 ? 'parlay' : 'atomic-prediction',
    }));

    const payloads = buildDiscordPayloads(artifact, { max: 14 });

    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].embeds.length, 10);
    assert.equal(payloads[1].embeds.length, 6);
    assert.equal(payloads[0].embeds[0].title, '🏆 Gana v9 · Recomendaciones');
    assert.doesNotMatch(payloads[0].embeds[0].description, /Parte 1\/2/);
    assert.match(payloads[0].embeds[0].description, /📦 4 parlays · 📌 10 simples/);
    assert.doesNotMatch(payloads[0].embeds.at(-1).description ?? '', /Revisión manual requerida/);
    assert.match(payloads[1].embeds[0].title, /🔟 📌 Simple/);
    assert.match(payloads[1].embeds.at(-1).description, /Revisión manual requerida/);
    assert.equal(payloads[0].embeds[1].color, 0xf2c94c);
    assert.equal(payloads[0].embeds[2].color, 0x27ae60);
    assert.equal(payloads[0].embeds[5].color, 0x9b51e0);
  });

  it('keeps exactly nine Discord selections within the native embed limit', () => {
    const artifact = sampleArtifact();
    artifact.recommendations = Array.from({ length: 9 }, (_, index) => ({
      ...sampleArtifact().recommendations[0],
      rank: index + 1,
      parlayId: `parlay-${index + 1}`,
      kind: index === 0 ? 'parlay' : 'atomic-prediction',
    }));

    const payloads = buildDiscordPayloads(artifact, { max: 9 });

    assert.equal(payloads.length, 2);
    assert.equal(payloads.every((payload) => payload.embeds.length <= 10), true);
    assert.equal(payloads[0].embeds.length, 9);
    assert.equal(payloads[1].embeds.length, 2);
    assert.match(payloads[0].embeds[0].description, /📦 1 parlay · 📌 8 simples/);
    assert.doesNotMatch(payloads[0].embeds.at(-1).description ?? '', /Revisión manual requerida/);
    assert.match(payloads[1].embeds.at(-1).description, /Revisión manual requerida/);
  });

  it('can pack fourteen selections into one native Discord message when requested', () => {
    const artifact = sampleArtifact();
    artifact.recommendations = Array.from({ length: 14 }, (_, index) => ({
      ...sampleArtifact().recommendations[0],
      rank: index + 1,
      parlayId: `parlay-${index + 1}`,
      kind: index < 4 ? 'parlay' : 'atomic-prediction',
    }));

    const payload = buildDiscordSinglePayload(artifact, { max: 14 });

    assert.equal(payload.embeds.length <= 10, true);
    assert.equal(payload.embeds[0].title, '🏆 Gana v9 · Recomendaciones');
    assert.match(payload.embeds[0].description, /📦 4 parlays · 📌 10 simples/);
    assert.match(payload.embeds[1].title, /Selecciones/);
    assert.match(payload.embeds.map((embed) => embed.description ?? '').join('\n'), /14\. 📌 Simple/);
  });

  it('loads artifacts and resolves the newest recommendations file', () => {
    const root = join(tmpdir(), `gana-discord-notifier-${Date.now()}`);
    const older = join(root, 'older');
    const newer = join(root, 'newer');
    mkdirSync(older, { recursive: true });
    mkdirSync(newer, { recursive: true });
    writeFileSync(join(older, 'daily-parlay-recommendations.json'), JSON.stringify({ date: '2026-05-14', recommendations: [] }));
    writeFileSync(join(newer, 'daily-parlay-recommendations.json'), JSON.stringify(sampleArtifact()));
    utimesSync(join(older, 'daily-parlay-recommendations.json'), new Date('2026-05-14T00:00:00Z'), new Date('2026-05-14T00:00:00Z'));
    utimesSync(join(newer, 'daily-parlay-recommendations.json'), new Date('2026-05-15T00:00:00Z'), new Date('2026-05-15T00:00:00Z'));

    const latest = findLatestRecommendationsArtifact(root);
    const loaded = loadRecommendations(latest);

    assert.equal(latest.endsWith(join('newer', 'daily-parlay-recommendations.json')), true);
    assert.equal(loaded.artifact.dailyBatchId, 'daily-2026-05-15');
    assert.equal(loaded.recommendations.length, 1);
  });

  it('parses CLI arguments and posts to the provided fetch implementation', async () => {
    const args = parseArgs(['--artifact', 'artifact.json', '--webhook-url', 'https://discord.test/webhook', '--transport', 'webhook', '--max', '3', '--single-message']);
    const calls = [];
    const result = await sendDiscordPayload(args.webhookUrl, { ok: true }, async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 204,
        text: async () => '',
      };
    });

    assert.equal(args.artifact, 'artifact.json');
    assert.equal(args.transport, 'webhook');
    assert.equal(args.max, 3);
    assert.equal(args.singleMessage, true);
    assert.equal(result.status, 204);
    assert.equal(calls[0].url, 'https://discord.test/webhook');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
  });

  it('sends native Discord embeds using Hermes gateway config bridge', () => {
    const calls = [];
    const result = sendDiscordNativePayload('discord:123', { embeds: [{ title: 'ok' }] }, { hermesPython: '/tmp/hermes-python' }, (command, args, options) => {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: JSON.stringify({ success: true, platform: 'discord', chat_id: '123', message_id: '456', embeds: 1 }),
        stderr: '',
      };
    });

    assert.equal(result.success, true);
    assert.equal(result.message_id, '456');
    assert.equal(calls[0].command, '/tmp/hermes-python');
    assert.match(calls[0].options.input, /"target":"discord:123"/);
    assert.match(calls[0].options.input, /"embeds":/);
  });

  it('sends through Hermes gateway using the send_message tool bridge', () => {
    const calls = [];
    const result = sendHermesGatewayMessage('discord', 'hello', { hermesPython: '/tmp/hermes-python' }, (command, args, options) => {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: JSON.stringify({ success: true, platform: 'discord' }),
        stderr: '',
      };
    });

    assert.deepEqual(result, { success: true, platform: 'discord' });
    assert.equal(calls[0].command, '/tmp/hermes-python');
    assert.match(calls[0].options.input, /"target":"discord"/);
    assert.match(calls[0].options.input, /"message":"hello"/);
    assert.match(calls[0].options.env.PYTHONPATH, /hermes-agent/);
  });
});

function sampleArtifact() {
  return {
    date: '2026-05-15',
    dailyBatchId: 'daily-2026-05-15',
    sourceRunIds: ['codex-run', 'gemini-run'],
    recommendations: [{
      rank: 1,
      parlayId: 'parlay-1',
      sourceRunId: 'mixed-run',
      profile: 'balanced',
      validationStatus: 'pending',
      harnessStatus: 'promotable',
      combinedOdds: 2.1,
      aggregateConfidence: 0.74,
      adjustedProbability: 0.62,
      expectedEdge: 0.08,
      score: 0.9123,
      stakeRecommendation: {
        stake: 10,
        percentOfBankroll: 0.1,
        unitLabel: 'percent-of-bankroll',
        allowedStakes: [1, 5, 10, 15, 20, 25],
        policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
      },
      riskFlags: ['none'],
      legs: [{
        predictionId: 'prediction-1',
        fixtureId: 'fixture-1',
        fixture: 'Team A vs Team B',
        market: 'h2h',
        selection: 'home',
        line: null,
        odds: 1.4,
        confidence: 0.74,
        validationStatus: 'pending',
        warnings: [],
        banker: true,
      }],
    }],
    diagnostics: {
      profileScope: 'all',
      analyticalArtifactOnly: true,
      executionCapability: 'none',
    },
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
}

function sampleArtifactWithAtomic() {
  const artifact = sampleArtifact();
  return {
    ...artifact,
    recommendations: [
      ...artifact.recommendations.map((recommendation) => ({ ...recommendation, kind: 'parlay' })),
      {
        kind: 'atomic-prediction',
        rank: 2,
        parlayId: 'atomic-prediction-2',
        predictionId: 'prediction-2',
        predictionIds: ['prediction-2'],
        sourceRunId: 'codex-run',
        sourceRunIds: ['codex-run'],
        provider: 'codex',
        providers: ['codex'],
        model: 'gpt-5.5',
        profile: 'atomic-high-confidence',
        validationStatus: 'unvalidated',
        harnessStatus: 'promotable',
        combinedOdds: 1.18,
        aggregateConfidence: 0.92,
        adjustedProbability: 0.92,
        expectedEdge: 0.07,
        score: 0.84,
        exposure: { units: 0, percentOfAnalyticalBankroll: 0, policy: 'single-selection-analytical-watchlist' },
        stakeRecommendation: {
          stake: 10,
          percentOfBankroll: 0.1,
          unitLabel: 'percent-of-bankroll',
          allowedStakes: [1, 5, 10, 15, 20, 25],
          policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
        },
        bankerLegs: [],
        reasons: ['confidence 0.92', 'edge 0.07'],
        riskFlags: ['single-selection'],
        legs: [{
          predictionId: 'prediction-2',
          fixtureId: 'fixture-2',
          fixture: 'Team C vs Team D',
          market: 'h2h',
          selection: 'away',
          line: null,
          odds: 1.18,
          confidence: 0.92,
          validationStatus: 'unvalidated',
          warnings: [],
          banker: true,
        }],
      },
    ],
  };
}
