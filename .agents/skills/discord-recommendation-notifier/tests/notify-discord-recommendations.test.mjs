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
    assert.match(payload.embeds[1].description, /> 📊 Odds 2.1 · 🍀 Conf 74% · 📈 Edge 8% · 💵 Stake 10/);
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
    assert.match(message, /> 📊 Odds 2.1 · 🍀 Conf 74% · 📈 Edge 8% · 💵 Stake 10/);
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
        { ...base, rank: 4, profile: 'principal', parlayId: 'principal-1' },
        { ...base, rank: 5, profile: 'resultados', parlayId: 'resultados-1' },
        { ...base, rank: 6, profile: 'mixto-seguro', parlayId: 'mixto-seguro-1' },
      ],
    };

    const payload = buildDiscordPayload(artifact, { max: 6 });
    const message = buildGatewayMessage(artifact, { max: 6 });

    assert.match(payload.embeds[1].title, /1️⃣ 💎 Team A vs Team B/);
    assert.match(payload.embeds[2].title, /2️⃣ 🧠 Team A vs Team B/);
    assert.match(payload.embeds[3].title, /3️⃣ 🛡️ Team A vs Team B/);
    assert.match(payload.embeds[4].title, /4️⃣ 💎 Team A vs Team B/);
    assert.match(payload.embeds[5].title, /5️⃣ ⚽ Team A vs Team B/);
    assert.match(payload.embeds[6].title, /6️⃣ 🧩 Team A vs Team B/);
    assert.match(message, /1️⃣ 💎 Team A vs Team B/);
    assert.match(message, /2️⃣ 🧠 Team A vs Team B/);
    assert.match(message, /3️⃣ 🛡️ Team A vs Team B/);
    assert.match(message, /4️⃣ 💎 Team A vs Team B/);
    assert.match(message, /5️⃣ ⚽ Team A vs Team B/);
    assert.match(message, /6️⃣ 🧩 Team A vs Team B/);
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

  it('includes the required league prediction and parlay addendum in native and gateway output', () => {
    const artifact = sampleArtifactWithRequiredLeague();

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const message = buildGatewayMessage(artifact, { max: 1 });
    const titles = payload.embeds.map((embed) => embed.title ?? '');
    const requiredEmbed = payload.embeds.find((embed) => /^🌍 Obligatorio/.test(embed.title ?? ''));
    const predictionEmbed = payload.embeds.find((embed) => /^📌 Predicciones obligatorias/.test(embed.title ?? ''));
    const principalEmbed = payload.embeds.find((embed) => /^1️⃣ 💎 principal/.test(embed.title ?? ''));
    const resultadosEmbed = payload.embeds.find((embed) => /^2️⃣ 🚫 ⚽ resultados/.test(embed.title ?? ''));

    assert.deepEqual(titles, [
      '🏆 Gana v9 · Recomendaciones',
      '1️⃣ ⚖️ Team A vs Team B',
      '🌍 Obligatorio · World Cup',
      '📌 Predicciones obligatorias · World Cup',
      '1️⃣ 💎 principal · Canada vs Bosnia & Herzegovina',
      '2️⃣ 🚫 ⚽ resultados',
      '3️⃣ 🚫 🧩 mixto-seguro',
      '',
    ]);
    assert.ok(requiredEmbed);
    assert.ok(predictionEmbed);
    assert.ok(principalEmbed);
    assert.ok(resultadosEmbed);
    assert.match(payload.embeds[0].description, /📅 Diario: 📦 1 parlay · 📌 0 simples/);
    assert.match(payload.embeds[0].description, /🌍 Obligatorio World Cup: 🟡 📦 1 parlay · 📌 1 predicción/);
    assert.match(payload.embeds[0].description, /📊 Total enviado: 📦 2 parlays · 📌 1 predicción/);
    assert.match(requiredEmbed.title, /World Cup/);
    assert.match(requiredEmbed.description, /✅ Canada vs Bosnia & Herzegovina:\n> 1 proyección fuerte \/ 1 predicción/);
    assert.match(requiredEmbed.description, /🚫 USA vs Paraguay:\n> sin predicción válida/);
    assert.match(requiredEmbed.description, /📌 1 predicción obligatoria · 🎛️ 1\/3 parlays seleccionados/);
    assert.match(predictionEmbed.description, /✅ Canada vs Bosnia & Herzegovina/);
    assert.match(predictionEmbed.description, /Canada gana @ 1.87/);
    assert.doesNotMatch(predictionEmbed.description, /Edge|codex|gemini/);
    assert.doesNotMatch(principalEmbed.description, /✅ 💎 principal · 1 selección/);
    assert.match(principalEmbed.description, /⚽ Canada vs Bosnia & Herzegovina: Canada gana @ 1.87/);
    assert.match(principalEmbed.description, /📊 Odds 1.22 · 🍀 Conf 63%/);
    assert.match(resultadosEmbed.description, /No publicado/);
    assert.doesNotMatch(JSON.stringify(payload), /Sin selecciones/);
    assert.match(message, /🌍 Obligatorio World Cup: 🟡 review-required · 1\/2 fixtures/);
  });

  it('prints every required parlay leg up to the native compact limit', () => {
    const artifact = sampleArtifactWithRequiredLeague();
    const principal = artifact.requiredLeagueRecommendations.parlayProjections[0];
    principal.combinedOdds = 1.64;
    principal.aggregateConfidence = 0.6103;
    principal.legs = [
      requiredParlayLeg('Qatar vs Switzerland', 'double_chance', 'draw_or_away', 1.05),
      requiredParlayLeg('Brazil vs Morocco', 'double_chance', 'home_or_draw', 1.14),
      requiredParlayLeg('Haiti vs Scotland', 'double_chance', 'draw_or_away', 1.17),
      requiredParlayLeg('Australia vs Türkiye', 'double_chance', 'draw_or_away', 1.17),
    ];

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const parlayEmbed = payload.embeds.find((embed) => /^1️⃣ 💎 principal/.test(embed.title ?? ''));

    assert.ok(parlayEmbed);
    assert.match(parlayEmbed.title, /Qatar vs Switzerland \+ Brazil vs Morocco \+ Haiti vs Scotland \+ Australia vs Türkiye/);
    assert.match(parlayEmbed.description, /Qatar vs Switzerland: Empate o Switzerland @ 1\.05/);
    assert.match(parlayEmbed.description, /Brazil vs Morocco: Brazil o empate @ 1\.14/);
    assert.match(parlayEmbed.description, /Haiti vs Scotland: Empate o Scotland @ 1\.17/);
    assert.match(parlayEmbed.description, /Australia vs Türkiye: Empate o Türkiye @ 1\.17/);
    assert.match(parlayEmbed.description, /📊 Odds 1\.64 · 🍀 Conf 61\.03%/);
  });

  it('adds required league general predictions grouped as match analysis', () => {
    const artifact = sampleArtifactWithRequiredLeague();
    artifact.requiredLeagueGeneralPredictions = [
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'h2h',
        selection: 'home',
        odds: 1.87,
        confidence: 0.63,
        expectedEdge: 0.04,
        provider: 'codex',
        status: 'review-required',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'h2h',
        selection: 'home',
        odds: 1.87,
        confidence: 0.7,
        expectedEdge: 0.06,
        provider: 'gemini',
        status: 'promotable',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'double_chance',
        selection: 'home_or_draw',
        odds: 1.22,
        confidence: 0.58,
        expectedEdge: -0.01,
        provider: 'codex',
        status: 'blocked',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'goals_over_under',
        selection: 'under',
        line: 2.5,
        odds: 1.64,
        confidence: 0.66,
        expectedEdge: 0.0316,
        provider: 'codex',
        status: 'review-required',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'goals_over_under',
        selection: 'over',
        line: 3.5,
        odds: 2.4,
        confidence: 0.55,
        expectedEdge: 0.02,
        provider: 'gemini',
        status: 'review-required',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'corners_over_under',
        selection: 'under',
        line: 9.5,
        odds: 1.8,
        confidence: 0.52,
        expectedEdge: 0.0136,
        provider: 'codex',
        status: 'review-required',
      },
      {
        fixture: 'USA vs Paraguay',
        providerFixtureId: '1489370',
        market: 'btts',
        selection: 'no',
        odds: 1.7,
        confidence: 0.57,
        expectedEdge: 0.0233,
        provider: 'codex',
        status: 'review-required',
      },
    ];

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const message = buildGatewayMessage(artifact, { max: 1 });
    const titles = payload.embeds.map((embed) => embed.title ?? '');
    const generalEmbed = payload.embeds.find((embed) => /^📋 Predicciones generales/.test(embed.title ?? ''));

    assert.deepEqual(titles, [
      '🏆 Gana v9 · Recomendaciones',
      '1️⃣ ⚖️ Team A vs Team B',
      '🌍 Obligatorio · World Cup',
      '📌 Predicciones obligatorias · World Cup',
      '📋 Predicciones generales · World Cup',
      '1️⃣ 💎 principal · Canada vs Bosnia & Herzegovina',
      '2️⃣ 🚫 ⚽ resultados',
      '3️⃣ 🚫 🧩 mixto-seguro',
      '',
    ]);
    assert.match(generalEmbed.description, /Canada vs Bosnia & Herzegovina/);
    assert.match(generalEmbed.description, /\t✅ ⚽ Canada gana @ 1\.87 · Conf 67%/);
    assert.match(generalEmbed.description, /\t🟡 👥 Canada o empate @ 1\.22 · Conf 70%/);
    assert.match(generalEmbed.description, /\t🟡 🥅 Menos de 2\.5 goles @ 1\.64 · Conf 66%/);
    assert.doesNotMatch(generalEmbed.description, /Más de 3\.5 goles/);
    assert.match(generalEmbed.description, /\t🟡 ⛳ Menos de 9\.5 corners @ 1\.8 · Conf 52%/);
    assert.doesNotMatch(generalEmbed.description, /🎯/);
    assert.match(generalEmbed.description, /\t🟡 🤝🏻 Ambos anotan: No @ 1\.7 · Conf 57%/);
    assert.doesNotMatch(generalEmbed.description, /Resultado:/);
    assert.doesNotMatch(generalEmbed.description, /Doble oportunidad:/);
    assert.doesNotMatch(generalEmbed.description, /Conf 63-70%/);
    assert.doesNotMatch(generalEmbed.description, /Edge/);
    assert.doesNotMatch(generalEmbed.description, /codex|gemini/);
    assert.doesNotMatch(generalEmbed.description, /Ambos anotan: Ambos anotan/);
    assert.match(message, /📋 Predicciones generales · World Cup/);
    assert.match(message, /\t✅ ⚽ Canada gana @ 1\.87 · Conf 67%/);
  });

  it('keeps required general predictions coherent for probabilities and weak binary sides', () => {
    const artifact = sampleArtifactWithRequiredLeague();
    artifact.requiredLeagueGeneralPredictions = [
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'h2h',
        selection: 'home',
        odds: 1.87,
        confidence: 0.62,
        modelProbability: 0.58,
        provider: 'codex',
        status: 'review-required',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'double_chance',
        selection: 'home_or_draw',
        odds: 1.22,
        confidence: 0.45,
        modelProbability: 0.84,
        provider: 'codex',
        status: 'blocked',
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'corners_over_under',
        selection: 'under',
        line: 9.5,
        odds: 1.8,
        confidence: 0.49,
        provider: 'codex',
        status: 'review-required',
      },
    ];

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const generalEmbed = payload.embeds.find((embed) => /^📋 Predicciones generales/.test(embed.title ?? ''));

    assert.match(generalEmbed.description, /\t🟡 ⚽ Canada gana @ 1\.87 · Conf 58%/);
    assert.match(generalEmbed.description, /\t🟡 👥 Canada o empate @ 1\.22 · Conf 84%/);
    assert.doesNotMatch(generalEmbed.description, /corners/);
  });

  it('keeps kickoff times only in selection titles and required fixture summaries', () => {
    const artifact = sampleArtifactWithRequiredLeague();
    artifact.recommendations[0].kind = 'atomic-prediction';
    artifact.recommendations[0].legs[0].display = {
      fixtureLabel: 'Team A vs Team B',
      homeTeamName: 'Team A',
      awayTeamName: 'Team B',
      kickoffLocal: '2026-05-15T20:30:00.000Z',
    };
    artifact.requiredLeagueRecommendations.coverage.fixtures[0].display = {
      ...artifact.requiredLeagueRecommendations.coverage.fixtures[0].display,
      kickoffLocal: '2026-06-12T19:00:00.000Z',
    };
    artifact.requiredLeagueRecommendations.atomicProjections[0].display = {
      fixtureLabel: 'Canada vs Bosnia & Herzegovina',
      homeTeamName: 'Canada',
      awayTeamName: 'Bosnia & Herzegovina',
      leagueName: 'World Cup',
      kickoffLocal: '2026-06-12T19:00:00.000Z',
    };
    artifact.requiredLeagueRecommendations.parlayProjections[0].legs[0].display = {
      ...artifact.requiredLeagueRecommendations.parlayProjections[0].legs[0].display,
      kickoffLocal: '2026-06-12T19:00:00.000Z',
    };

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const message = buildGatewayMessage(artifact, { max: 1 });
    const joined = JSON.stringify(payload);
    const requiredEmbed = payload.embeds.find((embed) => /^🌍 Obligatorio/.test(embed.title ?? ''));
    const predictionEmbed = payload.embeds.find((embed) => /^📌 Predicciones obligatorias/.test(embed.title ?? ''));
    const parlayEmbed = payload.embeds.find((embed) => /^1️⃣ 💎 principal/.test(embed.title ?? ''));

    assert.match(payload.embeds[1].title, /Team A vs Team B · 14:30 · h2h home/);
    assert.doesNotMatch(payload.embeds[1].title, /14:30 GT/);
    assert.match(payload.embeds[1].description, /Team A vs Team B: h2h home @ 1.4/);
    assert.doesNotMatch(payload.embeds[1].description, /Team A vs Team B · 14:30: h2h home @ 1.4/);
    assert.match(requiredEmbed.description, /Canada vs Bosnia & Herzegovina · 13:00:\n> 1 proyección fuerte/);
    assert.doesNotMatch(requiredEmbed.description, /13:00 GT/);
    assert.match(predictionEmbed.description, /Canada vs Bosnia & Herzegovina\n/);
    assert.doesNotMatch(predictionEmbed.description, /Canada vs Bosnia & Herzegovina · 13:00/);
    assert.match(parlayEmbed.title, /Canada vs Bosnia & Herzegovina · 13:00/);
    assert.match(parlayEmbed.description, /⚽ Canada vs Bosnia & Herzegovina: Canada gana @ 1.87/);
    assert.doesNotMatch(parlayEmbed.description, /⚽ Canada vs Bosnia & Herzegovina · 13:00: Canada gana @ 1.87/);
    assert.match(message, /Team A vs Team B · 14:30/);
    assert.doesNotMatch(message, /14:30 GT/);
    assert.match(message, /Team A vs Team B: h2h home @ 1.4/);
    assert.match(message, /Canada vs Bosnia & Herzegovina · 13:00:\n> 1 proyección fuerte/);
    assert.match(message, /⚽ Canada vs Bosnia & Herzegovina: Canada gana @ 1.87/);
    assert.doesNotMatch(message, /⚽ Canada vs Bosnia & Herzegovina · 13:00: Canada gana @ 1.87/);
    assert.match(joined, /Canada vs Bosnia & Herzegovina · 13:00:\\n> 1 proyección fuerte/);
    assert.doesNotMatch(joined, /\d{2}:\d{2} GT/);
  });

  it('does not send an empty-selection box when the required addendum has publishable predictions and parlays', () => {
    const artifact = {
      date: '2026-06-12',
      dailyBatchId: 'daily-required-only',
      recommendations: [],
      parlayApproaches: [
        { profile: 'parlay-diamante', status: 'blocked', combinedOdds: null },
        { profile: 'parlay-refinado', status: 'blocked', combinedOdds: null },
        { profile: 'low-variance', status: 'blocked', combinedOdds: null },
      ],
      requiredLeagueRecommendations: sampleRequiredLeagueRecommendationsPassed(),
    };

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const message = buildGatewayMessage(artifact, { max: 1 });
    const titles = payload.embeds.map((embed) => embed.title ?? '');

    assert.deepEqual(titles, [
      '🏆 Gana v9 · Recomendaciones',
      '🌍 Obligatorio · World Cup',
      '📌 Predicciones obligatorias · World Cup',
      '1️⃣ 💎 principal · USA vs Paraguay + Canada vs Bosnia & Herzegovina',
      '2️⃣ ⚽ resultados · USA vs Paraguay + Canada vs Bosnia & Herzegovina',
      '3️⃣ 🧩 mixto-seguro · USA vs Paraguay + Canada vs Bosnia & Herzegovina',
      '',
    ]);
    assert.match(payload.embeds[0].description, /📅 Diario: 📦 0 parlays · 📌 0 simples/);
    assert.match(payload.embeds[0].description, /🌍 Obligatorio World Cup: ✅ 📦 3 parlays · 📌 2 predicciones/);
    assert.match(payload.embeds[0].description, /📊 Total enviado: 📦 3 parlays · 📌 2 predicciones/);
    assert.match(payload.embeds[0].description, /🎛️ Enfoques diarios:/);
    assert.doesNotMatch(JSON.stringify(payload), /Sin selecciones/);
    assert.doesNotMatch(message, /Sin selecciones/);
  });

  it('explains blocked duplicate required parlays in user-facing Spanish', () => {
    const requiredLeagueRecommendations = sampleRequiredLeagueRecommendationsPassed();
    for (const projection of requiredLeagueRecommendations.parlayProjections.slice(1)) {
      projection.status = 'blocked';
      projection.legs = [];
      projection.combinedOdds = null;
      projection.aggregateConfidence = null;
      projection.reasons = ['duplicate of principal; identical required-league parlay is not published twice'];
      projection.riskFlags = ['duplicate-required-league-parlay', 'blocked'];
    }
    const artifact = {
      date: '2026-06-12',
      dailyBatchId: 'daily-required-deduped',
      recommendations: [],
      requiredLeagueRecommendations,
    };

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const principalEmbed = payload.embeds.find((embed) => /^1️⃣ 💎 principal/.test(embed.title ?? ''));
    const resultadosEmbed = payload.embeds.find((embed) => /^2️⃣ 🚫 ⚽ resultados/.test(embed.title ?? ''));

    assert.ok(principalEmbed);
    assert.ok(resultadosEmbed);
    assert.doesNotMatch(principalEmbed.description, /✅ 💎 principal · 2 selecciones/);
    assert.match(resultadosEmbed.description, /Duplicado de principal; no se publica cupón idéntico\./);
    assert.doesNotMatch(resultadosEmbed.description, /identical required-league parlay/);
  });

  it('prioritizes required confidence-floor reasons over duplicate risk flags', () => {
    const requiredLeagueRecommendations = sampleRequiredLeagueRecommendationsPassed();
    for (const projection of requiredLeagueRecommendations.parlayProjections) {
      projection.status = 'blocked';
      projection.legs = [];
      projection.combinedOdds = null;
      projection.aggregateConfidence = null;
      projection.reasons = [
        `no unique required-league parlay meets positive-edge and confidence floors for ${projection.profile}`,
        'mejor combo rechazado: Canada vs Bosnia & Herzegovina goals_over_under under 2.5 @ 1.64 (66.00%) + USA vs Paraguay goals_over_under under 2.5 @ 1.53 (65.00%); cuota 2.51; confianza agregada 42.90%; edge esperado 7.64%; no supera: confianza agregada 42.90% < 45.00%',
      ];
      projection.riskFlags = [
        'required-league-addendum',
        'blocked',
        'required-league-confidence-floor',
        'duplicate-required-league-parlay',
        'insufficient-required-league-parlay-diversity',
      ];
    }
    const artifact = {
      date: '2026-06-12',
      dailyBatchId: 'daily-required-confidence-gated',
      recommendations: [],
      requiredLeagueRecommendations,
    };

    const payload = buildDiscordPayload(artifact, { max: 1 });
    const blockedEmbeds = payload.embeds.filter((embed) => /^\d️⃣ 🚫/.test(embed.title ?? ''));
    const diagnosticEmbed = payload.embeds.find((embed) => /^🔎 Mejor combo evaluado/.test(embed.title ?? ''));

    assert.equal(blockedEmbeds.length, 3);
    assert.ok(diagnosticEmbed);
    assert.equal(blockedEmbeds.every((embed) => /No publicado: confianza agregada insuficiente\./.test(embed.description ?? '')), true);
    assert.match(diagnosticEmbed.description, /Canada vs Bosnia & Herzegovina: Menos de 2\.5 goles @ 1\.64 · Conf 66%/);
    assert.match(diagnosticEmbed.description, /USA vs Paraguay: Menos de 2\.5 goles @ 1\.53 · Conf 65%/);
    assert.match(diagnosticEmbed.description, /📊 Odds 2\.51 · 🍀 Conf 42\.9% · 📈 Edge 7\.64%/);
    assert.match(diagnosticEmbed.description, /🚧 No supera piso: confianza agregada 42\.90% < 45\.00%/);
    assert.equal(payload.embeds.filter((embed) => /^🔎 Mejor combo evaluado/.test(embed.title ?? '')).length, 1);
    assert.doesNotMatch(diagnosticEmbed.description, /mejor combo rechazado:/);
    assert.doesNotMatch(JSON.stringify(blockedEmbeds), /No se publica principal/);
    assert.doesNotMatch(JSON.stringify(blockedEmbeds), /Duplicado de/);
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
    assert.match(payload.embeds[1].description, /> ⛳ Team A vs Team B: corners under 9.5 @ 1.82/);
    assert.match(message, /> 🥅 Team A vs Team B: goals under 2.5 @ 1.6/);
    assert.match(message, /> ⛳ Team A vs Team B: corners under 9.5 @ 1.82/);
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

  it('loads required league addendum from the sibling artifact path', () => {
    const root = join(tmpdir(), `gana-discord-required-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const requiredPath = join(root, 'daily-required-league-recommendations.json');
    const recommendationsPath = join(root, 'daily-parlay-recommendations.json');
    writeFileSync(requiredPath, JSON.stringify(sampleRequiredLeagueRecommendations()));
    writeFileSync(recommendationsPath, JSON.stringify({
      ...sampleArtifact(),
      requiredLeagueRecommendationsPath: 'daily-required-league-recommendations.json',
    }));

    const loaded = loadRecommendations(recommendationsPath);
    const payload = buildDiscordPayload(loaded.artifact, { max: 1 });

    assert.equal(loaded.artifact.requiredLeagueRecommendations.atomicProjections.length, 1);
    assert.match(payload.embeds.find((embed) => /Obligatorio/.test(embed.title ?? ''))?.description ?? '', /Canada vs Bosnia/);
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

function sampleArtifactWithRequiredLeague() {
  return {
    ...sampleArtifact(),
    requiredLeagueRecommendations: sampleRequiredLeagueRecommendations(),
  };
}

function requiredParlayLeg(fixture, market, selection, odds) {
  const [homeTeamName, awayTeamName] = fixture.split(' vs ');
  return {
    fixture,
    providerFixtureId: fixture,
    market,
    selection,
    odds,
    confidence: 0.8,
    display: {
      fixtureLabel: fixture,
      homeTeamName,
      awayTeamName,
      leagueName: 'World Cup',
    },
  };
}

function sampleRequiredLeagueRecommendations() {
  return {
    coverage: {
      fixtureCount: 2,
      coveredFixtures: 1,
      missingPredictionFixtures: 1,
      status: 'review-required',
      fixtures: [
        {
          fixture: 'Canada vs Bosnia & Herzegovina',
          providerFixtureId: '1539000',
          status: 'covered',
          predictionCount: 1,
          promotableCount: 1,
          display: {
            fixtureLabel: 'Canada vs Bosnia & Herzegovina',
            leagueName: 'World Cup',
          },
          league: { name: 'World Cup', country: 'World', providerCompetitionId: '1', season: 2026 },
        },
        {
          fixture: 'USA vs Paraguay',
          providerFixtureId: '1489370',
          status: 'missing-predictions',
          predictionCount: 0,
          promotableCount: 0,
          display: {
            fixtureLabel: 'USA vs Paraguay',
            leagueName: 'World Cup',
          },
          league: { name: 'World Cup', country: 'World', providerCompetitionId: '1', season: 2026 },
        },
      ],
    },
    goalCheck: {
      status: 'review-required',
      nextActions: ['retry research/scoring for 1489370 (USA vs Paraguay) with fresh web evidence'],
    },
    atomicProjections: [{
      fixture: 'Canada vs Bosnia & Herzegovina',
      providerFixtureId: '1539000',
      market: 'h2h',
      selection: 'home',
      odds: 1.87,
      confidence: 0.63,
      status: 'promotable',
    }],
    parlayProjections: [
      {
        profile: 'principal',
        status: 'selected',
        combinedOdds: 1.22,
        aggregateConfidence: 0.63,
        legs: [{
          fixture: 'Canada vs Bosnia & Herzegovina',
          providerFixtureId: '1539000',
          market: 'h2h',
          selection: 'home',
          odds: 1.87,
          confidence: 0.63,
          display: {
            fixtureLabel: 'Canada vs Bosnia & Herzegovina',
            homeTeamName: 'Canada',
            awayTeamName: 'Bosnia & Herzegovina',
            leagueName: 'World Cup',
          },
        }],
      },
      { profile: 'resultados', status: 'blocked', combinedOdds: null, legs: [] },
      { profile: 'mixto-seguro', status: 'blocked', combinedOdds: null, legs: [] },
    ],
  };
}

function sampleRequiredLeagueRecommendationsPassed() {
  const base = sampleRequiredLeagueRecommendations();
  return {
    ...base,
    coverage: {
      ...base.coverage,
      coveredFixtures: 2,
      missingPredictionFixtures: 0,
      status: 'passed',
      fixtures: [
        {
          ...base.coverage.fixtures[0],
          status: 'covered',
          predictionCount: 10,
          promotableCount: 1,
        },
        {
          ...base.coverage.fixtures[1],
          status: 'covered',
          predictionCount: 10,
          promotableCount: 3,
        },
      ],
    },
    goalCheck: {
      status: 'passed',
      nextActions: [],
    },
    atomicProjections: [
      {
        fixture: 'USA vs Paraguay',
        providerFixtureId: '1489370',
        market: 'h2h',
        selection: 'home',
        odds: 1.96,
        confidence: 0.655,
        expectedEdge: 0.040964,
        status: 'promotable',
        providers: ['gemini', 'codex'],
        display: {
          fixtureLabel: 'USA vs Paraguay',
          homeTeamName: 'USA',
          awayTeamName: 'Paraguay',
          leagueName: 'World Cup',
        },
      },
      {
        fixture: 'Canada vs Bosnia & Herzegovina',
        providerFixtureId: '1539000',
        market: 'h2h',
        selection: 'home',
        odds: 1.86,
        confidence: 0.575,
        expectedEdge: 0.058,
        status: 'promotable',
        providers: ['codex', 'gemini'],
        display: {
          fixtureLabel: 'Canada vs Bosnia & Herzegovina',
          homeTeamName: 'Canada',
          awayTeamName: 'Bosnia & Herzegovina',
          leagueName: 'World Cup',
        },
      },
    ],
    parlayProjections: ['principal', 'resultados', 'mixto-seguro'].map((profile) => ({
      profile,
      status: 'selected',
      combinedOdds: 3.6456,
      aggregateConfidence: 0.376625,
      legs: [
        {
          fixture: 'USA vs Paraguay',
          providerFixtureId: '1489370',
          market: 'h2h',
          selection: 'home',
          odds: 1.96,
          confidence: 0.655,
          display: {
            fixtureLabel: 'USA vs Paraguay',
            homeTeamName: 'USA',
            awayTeamName: 'Paraguay',
            leagueName: 'World Cup',
          },
        },
        {
          fixture: 'Canada vs Bosnia & Herzegovina',
          providerFixtureId: '1539000',
          market: 'h2h',
          selection: 'home',
          odds: 1.86,
          confidence: 0.575,
          display: {
            fixtureLabel: 'Canada vs Bosnia & Herzegovina',
            homeTeamName: 'Canada',
            awayTeamName: 'Bosnia & Herzegovina',
            leagueName: 'World Cup',
          },
        },
      ],
    })),
  };
}
