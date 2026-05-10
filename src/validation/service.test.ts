import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { createRuntimeContext } from '../runtime/context.js';
import { runValidation } from './service.js';

const now = new Date('2026-04-25T20:00:00.000Z');

const finalFixture = {
  id: 'fixture-1',
  provider: 'api-football',
  providerFixtureId: '1001',
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  scheduledAt: '2026-04-25T18:00:00.000Z',
  status: 'completed',
  scoreHome: 2,
  scoreAway: 1,
  includedByFilters: [],
  providerSnapshotId: 'snapshot-result-1',
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T20:00:00.000Z',
} satisfies Fixture;

const fixtureRecord = {
  id: 'fixture-1',
  providerId: 'provider-1',
  providerFixtureId: '1001',
  competitionId: null,
  season: 2026,
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  scheduledAt: new Date('2026-04-25T18:00:00.000Z'),
  status: 'completed',
  scoreHome: 2,
  scoreAway: 1,
  includedByFilters: [],
  metadata: null,
  createdAt: now,
  updatedAt: now,
};

function config() {
  return loadConfig({
    databaseUrl: 'mysql://user:pass@localhost:3306/gana',
    provider: 'codex',
    model: 'gpt-5.5',
  }, { skipApiKey: true });
}

function prediction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prediction-1',
    runId: 'prediction-run-1',
    fixtureId: 'fixture-1',
    oddsSnapshotId: 'odds-snapshot-1',
    oddsQuoteId: 'odds-quote-1',
    researchBundleId: 'research-bundle-1',
    artifactId: null,
    marketKey: 'h2h',
    selectionKey: 'home',
    line: null,
    odds: 2,
    impliedProbability: 0.5,
    estimatedProbability: null,
    edge: null,
    confidence: 0.8,
    quality: 'high',
    rationaleRedacted: 'Candidate rationale.',
    warnings: [],
    evidenceIds: ['evidence-1'],
    includedByFilters: [],
    providerAgentic: 'codex',
    model: 'gpt-5.5',
    promptVersion: 'score-prediction-v1',
    scoringRuleVersion: 'scoring-v1',
    status: 'candidate',
    generatedAt: now,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function repositories(overrides: Record<string, unknown> = {}) {
  return {
    predictions: {
      findById: async (id: string) => id === 'missing' ? null : prediction({ id }),
      listForFixtureDate: async () => [prediction({ id: 'prediction-date-1' })],
    },
    fixtures: { findById: async () => fixtureRecord },
    parlays: {
      findById: async (id: string) => id === 'missing' ? null : {
        id,
        runId: 'parlay-run-1',
        artifactId: null,
        combinedOdds: 3,
        aggregateConfidence: 0.56,
        aggregateQuality: 0.8,
        rationaleRedacted: 'Analytical parlay.',
        warnings: [],
        status: 'candidate',
        generatedAt: now,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
      listForFixtureDate: async () => [],
    },
    parlayLegs: {
      list: async () => [
        {
          id: 'leg-1',
          parlayId: 'parlay-1',
          predictionId: 'prediction-1',
          fixtureId: 'fixture-1',
          marketKey: 'h2h',
          selectionKey: 'home',
          line: null,
          odds: 2,
          status: 'candidate',
          legIndex: 0,
          inclusionReason: 'included-eligible-prediction',
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'leg-2',
          parlayId: 'parlay-1',
          predictionId: 'prediction-2',
          fixtureId: 'fixture-1',
          marketKey: 'btts',
          selectionKey: 'no',
          line: null,
          odds: 2,
          status: 'candidate',
          legIndex: 1,
          inclusionReason: 'included-eligible-prediction',
          metadata: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      updateStatus: async (id: string, status: string) => ({ id, status }),
    },
    harnessRuns: { upsertForRun: async () => ({}) },
    artifacts: { create: async () => ({ id: 'artifact-validation-1' }) },
    validationArtifacts: { create: async (input: any) => ({ id: 'validation-1', ...input, createdAt: now, updatedAt: now }) },
    ...overrides,
  } as any;
}

function fetcher(statistics: Record<string, unknown> = {}) {
  return {
    fetch: async (input: any) => ({
      fixture: finalFixture,
      statistics: input.market === 'corners_over_under'
        ? { fixtureId: input.fixtureId, capturedAt: now.toISOString(), sourceSnapshotId: 'snapshot-statistics-1', ...statistics }
        : undefined,
      providerSnapshotId: input.market === 'corners_over_under' ? 'snapshot-statistics-1' : 'snapshot-result-1',
      resultProviderSnapshotId: 'snapshot-result-1',
      statisticsProviderSnapshotId: input.market === 'corners_over_under' ? 'snapshot-statistics-1' : undefined,
    }),
  };
}

describe('runValidation prediction targets', () => {
  const cases = [
    ['h2h', 'home', null, 'won'],
    ['double_chance', 'home_or_draw', null, 'won'],
    ['goals_over_under', 'over', 2.5, 'won'],
    ['btts', 'yes', null, 'won'],
    ['corners_over_under', 'over', 9.5, 'won'],
  ] as const;

  for (const [market, selection, line, expected] of cases) {
    it(`validates ${market} predictions`, async () => {
      const cfg = config();
      const runtime = createRuntimeContext(cfg, 'session.jsonl');

      const result = await runValidation(cfg, { predictionId: 'prediction-1' }, runtime, {
        now: () => now,
        writeArtifact: () => '/tmp/validations.json',
        fetcher: fetcher({ cornersHome: 6, cornersAway: 4 }),
        repositories: repositories({
          predictions: {
            findById: async () => prediction({
              marketKey: market,
              selectionKey: selection,
              line,
              impliedProbability: 0.5,
            }),
            listForFixtureDate: async () => [],
          },
        }),
      });

      assert.equal(result.ok, true);
      assert.equal(result.validations[0]?.status, expected);
      assert.equal(result.validations[0]?.outcome.status, expected);
    });
  }

  it('voids corners validation when provider statistics omit corners', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');

    const result = await runValidation(cfg, { predictionId: 'prediction-1' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations-blocked.json',
      fetcher: fetcher(),
      repositories: repositories({
        predictions: {
          findById: async () => prediction({ marketKey: 'corners_over_under', selectionKey: 'over', line: 9.5 }),
          listForFixtureDate: async () => [],
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.validations[0]?.status, 'voided');
    assert.equal(result.validations[0]?.reason, 'corners-statistics-unavailable');
  });

  it('emits tracking-only validation analytics and leaderboard entries', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    let artifactPayload: any;
    let leaderboardRows: any[] = [];

    const result = await runValidation(cfg, { predictionId: 'prediction-1' }, runtime, {
      now: () => now,
      writeArtifact: (_runId, _name, payload) => {
        artifactPayload = payload;
        return '/tmp/validations.json';
      },
      fetcher: fetcher(),
      repositories: repositories({
        predictions: {
          findById: async () => prediction({ estimatedProbability: 0.7, model: 'gpt-test', competitionId: 'league-1' }),
          listForFixtureDate: async () => [],
        },
        leaderboardEntries: {
          createMany: async (rows: any[]) => {
            leaderboardRows = rows;
            return { count: rows.length };
          },
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.analytics?.trackingOnly, true);
    assert.equal(result.analytics?.outcomes.length, 1);
    assert.equal(result.analytics?.leaderboard[0]?.n, 1);
    assert.equal(result.analytics?.leaderboard[0]?.lowSample, true);
    assert.equal(artifactPayload.analytics.disclaimer.includes('tracking-only-not-betting'), true);
    assert.equal(leaderboardRows.length, 1);
    assert.equal(leaderboardRows[0].modelId, 'gpt-test');
  });
});

describe('runValidation parlay and date targets', () => {
  it('aggregates parlay leg outcomes and updates leg statuses', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const statuses: string[] = [];

    const result = await runValidation(cfg, { parlayId: 'parlay-1' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations.json',
      fetcher: fetcher(),
      repositories: repositories({
        parlayLegs: {
          ...repositories().parlayLegs,
          updateStatus: async (_id: string, status: string) => {
            statuses.push(status);
            return {} as any;
          },
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.validations[0]?.status, 'lost');
    assert.deepEqual(statuses, ['won', 'lost']);
  });

  it('settles parlays with won legs and voided/push legs as won', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const statuses: string[] = [];

    const result = await runValidation(cfg, { parlayId: 'parlay-1' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations.json',
      fetcher: fetcher(),
      repositories: repositories({
        parlayLegs: {
          list: async () => [
            {
              id: 'leg-won',
              parlayId: 'parlay-1',
              predictionId: 'prediction-1',
              fixtureId: 'fixture-1',
              marketKey: 'h2h',
              selectionKey: 'home',
              line: null,
              odds: 2,
              status: 'candidate',
              legIndex: 0,
              inclusionReason: 'included-eligible-prediction',
              metadata: null,
              createdAt: now,
              updatedAt: now,
            },
            {
              id: 'leg-voided',
              parlayId: 'parlay-1',
              predictionId: 'prediction-2',
              fixtureId: 'fixture-1',
              marketKey: 'corners_over_under',
              selectionKey: 'over',
              line: 9.5,
              odds: 2,
              status: 'candidate',
              legIndex: 1,
              inclusionReason: 'included-eligible-prediction',
              metadata: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
          updateStatus: async (_id: string, status: string) => {
            statuses.push(status);
            return {} as any;
          },
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.validations[0]?.status, 'won');
    assert.deepEqual(statuses, ['won', 'voided']);
  });

  it('validates predictions and parlays by configured fixture date', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const persistedArtifacts: any[] = [];
    const persistedValidations: any[] = [];
    const predictionQueries: any[] = [];
    const parlayQueries: any[] = [];

    const result = await runValidation(cfg, { date: '2026-04-25' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations.json',
      fetcher: fetcher(),
      repositories: repositories({
        predictions: {
          ...repositories().predictions,
          listForFixtureDate: async (_date: Date | string, query: any) => {
            predictionQueries.push(query);
            return [prediction({ id: 'prediction-date-1' })];
          },
        },
        artifacts: {
          create: async (input: any) => {
            persistedArtifacts.push(input);
            return { id: 'artifact-validation-1' };
          },
        },
        validationArtifacts: {
          create: async (input: any) => {
            persistedValidations.push(input);
            return {
              id: `validation-${persistedValidations.length}`,
              ...input,
              createdAt: now,
              updatedAt: now,
            };
          },
        },
        parlays: {
          ...repositories().parlays,
          listForFixtureDate: async (_date: Date | string, query: any) => {
            parlayQueries.push(query);
            return [await repositories().parlays.findById('parlay-1')];
          },
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.validations.length, 2);
    assert.equal(result.target.date, '2026-04-25');
    assert.equal(persistedArtifacts.length, 1);
    assert.equal(persistedArtifacts[0].kind, 'validations');
    assert.equal(persistedArtifacts[0].name, 'validations.json');
    assert.equal(persistedValidations.length, 2);
    assert.deepEqual(persistedValidations.map((item) => item.artifactId), ['artifact-validation-1', 'artifact-validation-1']);
    assert.deepEqual(persistedValidations.map((item) => item.status), ['won', 'lost']);
    assert.deepEqual(result.validations.map((item) => item.id), ['validation-1', 'validation-2']);
    assert.deepEqual(predictionQueries.map((query) => query.skip), [0]);
    assert.deepEqual(parlayQueries.map((query) => query.skip), [0]);
    assert.equal(predictionQueries[0].timezone, 'America/Guatemala');
    assert.equal(parlayQueries[0].timezone, 'America/Guatemala');
  });

  it('keeps date validation pending when unsettled fixtures exist alongside already lost settled targets', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const pendingFixtureRecord = {
      ...fixtureRecord,
      id: 'fixture-pending',
      providerFixtureId: '2002',
      status: 'scheduled',
      scoreHome: null,
      scoreAway: null,
    };
    const pendingFixture = {
      ...finalFixture,
      id: 'fixture-pending',
      providerFixtureId: '2002',
      status: 'scheduled' as const,
      scoreHome: undefined,
      scoreAway: undefined,
    } satisfies Fixture;

    const result = await runValidation(cfg, { date: '2026-04-25' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations.json',
      fetcher: {
        fetch: async (input: any) => ({
          fixture: input.fixtureId === 'fixture-pending' ? pendingFixture : finalFixture,
          providerSnapshotId: input.fixtureId === 'fixture-pending' ? 'snapshot-pending' : 'snapshot-result-1',
          resultProviderSnapshotId: input.fixtureId === 'fixture-pending' ? 'snapshot-pending' : 'snapshot-result-1',
        }),
      },
      repositories: repositories({
        predictions: {
          ...repositories().predictions,
          listForFixtureDate: async () => [
            prediction({ id: 'prediction-pending', fixtureId: 'fixture-pending', selectionKey: 'home' }),
            prediction({ id: 'prediction-lost', fixtureId: 'fixture-1', selectionKey: 'away' }),
          ],
        },
        fixtures: {
          findById: async (id: string) => id === 'fixture-pending' ? pendingFixtureRecord : fixtureRecord,
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.validations.map((item) => item.status), ['pending', 'lost']);
    assert.equal(result.gateResult.verdict, 'pending');
    assert.match(result.gateResult.reasons.join('\n'), /fixture-not-completed/);
  });

  it('validates all prediction pages and reuses fetched fixture results', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const predictions = Array.from({ length: 501 }, (_, index) => prediction({
      id: `prediction-date-${index + 1}`,
      marketKey: index % 2 === 0 ? 'h2h' : 'btts',
      selectionKey: index % 2 === 0 ? 'home' : 'yes',
    }));
    const predictionQueries: any[] = [];
    let fixtureReads = 0;
    const fetchInputs: any[] = [];

    const result = await runValidation(cfg, { date: '2026-04-25' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations.json',
      fetcher: {
        fetch: async (input: any) => {
          fetchInputs.push(input);
          return fetcher().fetch(input);
        },
      },
      repositories: repositories({
        predictions: {
          ...repositories().predictions,
          listForFixtureDate: async (_date: Date | string, query: any) => {
            predictionQueries.push(query);
            return predictions.slice(query.skip, query.skip + query.take);
          },
        },
        fixtures: {
          findById: async () => {
            fixtureReads += 1;
            return fixtureRecord;
          },
        },
        validationArtifacts: {
          create: async (input: any) => ({
            id: `validation-${input.predictionId}`,
            ...input,
            createdAt: now,
            updatedAt: now,
          }),
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.validations.length, 501);
    assert.deepEqual(predictionQueries.map((query) => query.skip), [0, 500]);
    assert.equal(fixtureReads, 1);
    assert.equal(fetchInputs.length, 1);
    assert.equal(fetchInputs[0].market, 'h2h');
  });

  it('fetches corner statistics separately from fixture results', async () => {
    const cfg = config();
    const runtime = createRuntimeContext(cfg, 'session.jsonl');
    const fetchInputs: any[] = [];

    const result = await runValidation(cfg, { date: '2026-04-25' }, runtime, {
      now: () => now,
      writeArtifact: () => '/tmp/validations.json',
      fetcher: {
        fetch: async (input: any) => {
          fetchInputs.push(input);
          return fetcher({ cornersHome: 6, cornersAway: 4 }).fetch(input);
        },
      },
      repositories: repositories({
        predictions: {
          ...repositories().predictions,
          listForFixtureDate: async () => [
            prediction({ id: 'prediction-h2h', marketKey: 'h2h', selectionKey: 'home' }),
            prediction({ id: 'prediction-btts', marketKey: 'btts', selectionKey: 'yes' }),
            prediction({ id: 'prediction-corners', marketKey: 'corners_over_under', selectionKey: 'over', line: 9.5 }),
          ],
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.validations.length, 3);
    assert.deepEqual(fetchInputs.map((input) => input.market), ['h2h', 'corners_over_under']);
  });
});
