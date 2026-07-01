import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { readPublicRecommendations } from './service.js';

const FIXTURE = {
  id: 'fixture-1',
  providerFixtureId: 'provider-fixture-1',
  scheduledAt: new Date('2026-07-02T19:00:00.000Z'),
  status: 'scheduled',
  competition: { id: 'competition-1', name: 'Mundial 2026', country: 'World' },
  homeTeam: { id: 'team-1', name: 'Paraguay', country: 'PY' },
  awayTeam: { id: 'team-2', name: 'Francia', country: 'FR' },
};

const SECOND_FIXTURE = {
  ...FIXTURE,
  id: 'fixture-2',
  providerFixtureId: 'provider-fixture-2',
  homeTeam: { id: 'team-3', name: 'Mexico', country: 'MX' },
  awayTeam: { id: 'team-4', name: 'Canada', country: 'CA' },
};

const PREDICTIONS = [
  {
    id: 'prediction-1',
    runId: 'run-codex',
    fixtureId: 'fixture-1',
    marketKey: 'double_chance',
    selectionKey: 'away_or_draw',
    line: null,
    odds: 1.32,
    impliedProbability: 0.757,
    estimatedProbability: 0.79,
    edge: 0.043,
    confidence: 0.72,
    quality: 'high',
    status: 'promotable',
    generatedAt: new Date('2026-07-02T12:00:00.000Z'),
    fixture: FIXTURE,
  },
  {
    id: 'prediction-2',
    runId: 'run-codex',
    fixtureId: 'fixture-2',
    marketKey: 'total_goals',
    selectionKey: 'over',
    line: 1.5,
    odds: 1.25,
    impliedProbability: 0.8,
    estimatedProbability: 0.83,
    edge: 0.037,
    confidence: 0.74,
    quality: 'high',
    status: 'promotable',
    generatedAt: new Date('2026-07-02T12:05:00.000Z'),
    fixture: SECOND_FIXTURE,
  },
];

const PARLAYS = [{
  id: 'parlay-1',
  runId: 'run-codex-parlay',
  combinedOdds: 1.65,
  aggregateConfidence: 0.7,
  aggregateQuality: 0.8,
  status: 'promotable',
  generatedAt: new Date('2026-07-02T13:00:00.000Z'),
  legs: [{
    id: 'leg-1',
    legIndex: 0,
    predictionId: 'prediction-1',
    fixture: FIXTURE,
    prediction: PREDICTIONS[0],
    marketKey: 'double_chance',
    selectionKey: 'away_or_draw',
    line: null,
    odds: 1.32,
    status: 'pending',
  }],
}];

describe('readPublicRecommendations', () => {
  it('hydrates daily artifact recommendations from persisted predictions and parlays', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-public-recs-'));
    try {
      writeDailyArtifact(root, {
        recommendations: [
          parlayRecommendation('parlay-1'),
          atomicRecommendation('prediction-2'),
        ],
        requiredLeagueGeneralPredictions: [requiredLeagueGeneralPrediction()],
      });
      writeRequiredLeagueArtifact(root);
      const response = await readPublicRecommendations(
        createDb({ runs: [dailyRun(root)], predictions: PREDICTIONS, parlays: PARLAYS }) as any,
        { date: '2026-07-02', timezone: 'America/Guatemala', now: new Date('2026-07-02T14:00:00.000Z') },
        { defaultTimezone: 'America/Guatemala' },
      );

      assert.equal(response.contractVersion, 'gana-v9.public-recommendations.v1');
      assert.equal(response.stale, false);
      assert.equal(response.dailySummary.total, 3);
      assert.equal(response.dailySummary.parlays, 1);
      assert.equal(response.dailySummary.atomicPredictions, 1);
      assert.equal(response.dailySummary.requiredLeagueGeneralPredictions, 1);
      assert.equal(response.parlays[0]?.source.persisted, true);
      assert.equal(response.parlays[0]?.odds, 1.65);
      assert.equal(response.parlays[0]?.stake?.percentOfBankroll, 0.01);
      assert.equal(response.parlays[0]?.legs[0]?.fixture.label, 'Paraguay vs Francia');
      assert.equal(response.atomicPredictions[0]?.predictionId, 'prediction-2');
      assert.equal(response.atomicPredictions[0]?.fixture.label, 'Mexico vs Canada');
      assert.equal(response.requiredLeagueGeneralPredictions[0]?.fixture.label, 'Required Home vs Required Away');
      assert.equal(response.requiredLeague.atomicProjections.length, 1);
      assert.equal(response.requiredLeague.selectedParlayApproaches.length, 1);
      assert.equal(response.source.publicationLedger.status, 'artifact-only');
      assert.equal(response.source.publicationLedger.migrationRequired, true);
      assert.doesNotMatch(JSON.stringify(response), /rationale|Rationale|prompt/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns an honest stale empty response when the requested daily batch is missing', async () => {
    const response = await readPublicRecommendations(
      createDb({ runs: [dailyRun('/tmp/missing-artifacts', '2026-07-01')], predictions: PREDICTIONS, parlays: PARLAYS }) as any,
      { date: '2026-07-02', timezone: 'America/Guatemala' },
      { defaultTimezone: 'America/Guatemala' },
    );

    assert.equal(response.stale, true);
    assert.deepEqual(response.staleReasons, ['no_daily_batch_for_date']);
    assert.equal(response.dailySummary.total, 0);
    assert.equal(response.parlays.length, 0);
    assert.equal(response.atomicPredictions.length, 0);
    assert.equal(response.source.latestAvailableDate, '2026-07-01');
  });

  it('reports persisted Discord publication ledger rows for the public batch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-public-recs-ledger-'));
    try {
      writeDailyArtifact(root, {
        recommendations: [
          parlayRecommendation('parlay-1'),
          atomicRecommendation('prediction-2'),
        ],
      });
      writeRequiredLeagueArtifact(root);
      const response = await readPublicRecommendations(
        createDb({
          runs: [dailyRun(root)],
          predictions: PREDICTIONS,
          parlays: PARLAYS,
          publications: [
            publicationRow({ targetType: 'parlay', targetId: 'parlay-1', parlayId: 'parlay-1' }),
            publicationRow({ targetType: 'prediction', targetId: 'prediction-2', predictionId: 'prediction-2' }),
          ],
        }) as any,
        { date: '2026-07-02', timezone: 'America/Guatemala' },
        { defaultTimezone: 'America/Guatemala' },
      );

      assert.equal(response.source.publicationLedger.status, 'persisted');
      assert.equal(response.source.publicationLedger.migrationRequired, false);
      assert.equal(response.source.publicationLedger.publicationCount, 2);
      assert.deepEqual(response.source.publicationLedger.discordMessageIds, ['discord-message-1', 'discord-message-2']);
      assert.equal(response.source.publicationLedger.payloadPath, '/tmp/discord-payload.json');
      assert.equal(
        response.source.publicationLedger.payloadSha256,
        'a'.repeat(64),
      );
      assert.deepEqual(response.source.publicationLedger.parlayIds, ['parlay-1']);
      assert.deepEqual(response.source.publicationLedger.predictionIds, ['prediction-2']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps artifact-only parlays only when persisted prediction legs can hydrate them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-public-recs-artifact-only-'));
    try {
      writeDailyArtifact(root, {
        recommendations: [parlayRecommendation('analytical-fallback-1')],
      });
      const response = await readPublicRecommendations(
        createDb({ runs: [dailyRun(root)], predictions: [PREDICTIONS[0]], parlays: [] }) as any,
        { date: '2026-07-02', timezone: 'America/Guatemala' },
        { defaultTimezone: 'America/Guatemala' },
      );

      assert.equal(response.stale, false);
      assert.equal(response.parlays.length, 1);
      assert.equal(response.parlays[0]?.source.persisted, false);
      assert.equal(response.parlays[0]?.source.kind, 'artifact');
      assert.equal(response.parlays[0]?.legs[0]?.predictionId, 'prediction-1');
      assert.match(response.warnings.join('\n'), /artifact-only/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function createDb(input: { runs: any[]; predictions: any[]; parlays: any[]; publications?: any[] }) {
  return {
    harnessRun: {
      findFirst: async (args?: any) => {
        const date = dailyDateFromArgs(args);
        const runs = date
          ? input.runs.filter((run) => run.metadata?.date === date)
          : input.runs.filter((run) => run.id?.startsWith('daily-') || run.metadata?.dailyRole === 'batch');
        return runs.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0] ?? null;
      },
    },
    prediction: {
      findMany: async (args?: any) => {
        const ids = new Set(args?.where?.id?.in ?? []);
        return input.predictions.filter((prediction) => ids.has(prediction.id));
      },
    },
    parlay: {
      findMany: async (args?: any) => {
        const ids = new Set(args?.where?.id?.in ?? []);
        return input.parlays.filter((parlay) => ids.has(parlay.id));
      },
    },
    publicRecommendationPublication: {
      findMany: async (args?: any) => {
        const where = args?.where ?? {};
        return (input.publications ?? [])
          .filter((row) => row.dailyBatchId === where.dailyBatchId)
          .filter((row) => !where.channel || row.channel === where.channel)
          .filter((row) => !where.target || row.target === where.target)
          .filter((row) => !where.status || row.status === where.status)
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
      },
    },
  };
}

function dailyDateFromArgs(args: any): string | null {
  const json = JSON.stringify(args ?? {});
  return /"path":"\$\.date","equals":"(\d{4}-\d{2}-\d{2})"/.exec(json)?.[1] ?? null;
}

function dailyRun(root: string, date = '2026-07-02') {
  return {
    id: `daily-${date}`,
    status: 'succeeded',
    verdict: 'promotable',
    artifactDir: root,
    completedAt: new Date(`${date}T14:00:00.000Z`),
    createdAt: new Date(`${date}T10:00:00.000Z`),
    providerAgentic: 'codex',
    model: 'gpt-5.5',
    metadata: {
      dailyRole: 'batch',
      date,
      analyticalArtifactOnly: true,
      providers: [{ provider: 'codex', model: 'gpt-5.5', ok: true }],
      sharedInputs: {
        pairedProviders: ['codex'],
        providerModels: { codex: 'gpt-5.5' },
      },
      counts: {
        requiredLeagueFixtures: 1,
        requiredLeagueMissingPredictionFixtures: 0,
      },
      requiredLeagueCoverage: {
        fixtureCount: 1,
        missingPredictionFixtures: 0,
      },
      requiredLeagueGoalCheck: {
        status: 'passed',
      },
    },
  };
}

function writeDailyArtifact(root: string, payload: Record<string, unknown>) {
  writeFileSync(join(root, 'daily-parlay-recommendations.json'), `${JSON.stringify({
    dailyBatchId: 'daily-2026-07-02',
    date: '2026-07-02',
    requiredLeagueRecommendationsPath: join(root, 'daily-required-league-recommendations.json'),
    ...payload,
  })}\n`);
}

function writeRequiredLeagueArtifact(root: string) {
  writeFileSync(join(root, 'daily-required-league-recommendations.json'), `${JSON.stringify({
    coverage: { fixtureCount: 1, missingPredictionFixtures: 0 },
    goalCheck: { status: 'passed' },
    atomicProjections: [{
      predictionId: 'prediction-1',
      market: 'double_chance',
      selection: 'away_or_draw',
      odds: 1.32,
      confidence: 0.72,
      expectedEdge: 0.043,
      status: 'selected',
    }],
    parlayProjections: [{
      id: 'required-parlay-1',
      status: 'selected',
      profile: 'required-league-safe',
      combinedOdds: 1.65,
      aggregateConfidence: 0.7,
      expectedEdge: 0.04,
      legs: [{
        predictionId: 'prediction-1',
        market: 'double_chance',
        selection: 'away_or_draw',
        odds: 1.32,
        confidence: 0.72,
        banker: true,
      }],
    }],
  })}\n`);
}

function parlayRecommendation(parlayId: string) {
  return {
    kind: 'parlay',
    rank: 1,
    parlayId,
    sourceRunIds: ['run-codex-parlay'],
    profile: 'low-variance',
    harnessStatus: 'promotable',
    combinedOdds: 1.65,
    aggregateConfidence: 0.7,
    adjustedProbability: 0.66,
    expectedEdge: 0.04,
    stakeRecommendation: {
      stake: 1,
      percentOfBankroll: 0.01,
      unitLabel: 'percent-of-bankroll',
      policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
    },
    riskFlags: ['low-liquidity-watch'],
    legs: [{
      predictionId: 'prediction-1',
      fixture: 'Paraguay vs Francia',
      market: 'double_chance',
      selection: 'away_or_draw',
      odds: 1.32,
      confidence: 0.72,
      banker: true,
    }],
  };
}

function atomicRecommendation(predictionId: string) {
  return {
    kind: 'atomic-prediction',
    rank: 2,
    predictionId,
    sourceRunIds: ['run-codex'],
    profile: 'atomic-high-confidence',
    harnessStatus: 'promotable',
    combinedOdds: 1.25,
    aggregateConfidence: 0.74,
    displayConfidence: 0.74,
    adjustedProbability: 0.78,
    expectedEdge: 0.037,
    stakeRecommendation: {
      stake: 0.75,
      percentOfBankroll: 0.0075,
      unitLabel: 'percent-of-bankroll',
      policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation',
    },
    legs: [{
      predictionId,
      fixture: 'Mexico vs Canada',
      market: 'total_goals',
      selection: 'over',
      line: 1.5,
      odds: 1.25,
      confidence: 0.74,
    }],
  };
}

function requiredLeagueGeneralPrediction() {
  return {
    fixtureId: 'required-fixture-1',
    providerFixtureId: 'required-provider-fixture-1',
    fixture: 'Required Home vs Required Away',
    display: {
      fixtureLabel: 'Required Home vs Required Away',
      homeTeamName: 'Required Home',
      awayTeamName: 'Required Away',
      leagueName: 'Mundial 2026',
      kickoffLocal: '2026-07-02 14:00 GT',
    },
    market: 'h2h',
    selection: 'home',
    odds: 1.8,
    confidence: 0.61,
    expectedEdge: 0.02,
    status: 'review-required',
  };
}

function publicationRow(overrides: Record<string, unknown>) {
  return {
    id: `publication-${String(overrides.targetId)}`,
    dailyBatchId: 'daily-2026-07-02',
    runId: 'daily-2026-07-02',
    slateDate: new Date('2026-07-02T00:00:00.000Z'),
    channel: 'discord',
    target: 'recommendations',
    targetType: 'prediction',
    targetId: 'prediction-1',
    predictionId: null,
    parlayId: null,
    status: 'published',
    discordTarget: 'discord:recommendations',
    discordMessageId: 'discord-message-1',
    discordMessageIds: ['discord-message-1', 'discord-message-2'],
    artifactPath: '/tmp/daily-parlay-recommendations.json',
    payloadPath: '/tmp/discord-payload.json',
    payloadSha256: 'a'.repeat(64),
    publishedAt: new Date('2026-07-02T14:05:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-07-02T14:05:01.000Z'),
    ...overrides,
  };
}
