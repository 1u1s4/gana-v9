import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import {
  readEntity,
  readMetadata,
  readOverview,
  startDashboardServer,
} from './server.js';

const FIXTURE = {
  id: 'fixture-1',
  providerFixtureId: 'p-fx-1',
  scheduledAt: new Date('2026-05-01T12:00:00.000Z'),
  status: 'scheduled',
  scoreHome: 2,
  scoreAway: 1,
  competition: {
    id: 'competition-1',
    name: 'Primera',
    country: 'Spain',
  },
  homeTeam: { id: 'team-1', name: 'Home' },
  awayTeam: { id: 'team-2', name: 'Away' },
  _count: {
    predictions: 1,
    parlayLegs: 1,
    validationArtifacts: 1,
  },
};

const VALIDATION = {
  id: 'validation-1',
  runId: 'run-1',
  predictionId: 'prediction-1',
  parlayId: null,
  fixture: FIXTURE,
  prediction: {
    id: 'prediction-1',
    marketKey: 'h2h',
    selectionKey: 'home',
    line: null,
    fixture: FIXTURE,
  },
  parlay: null,
  status: 'won',
  reason: 'ok',
  evaluatedAt: new Date('2026-05-01T15:00:00.000Z'),
  createdAt: new Date('2026-05-01T13:00:00.000Z'),
  outcome: { reason: 'resolved' },
  settlementRuleVersion: 'v1',
};

const PARLAY_VALIDATION = {
  id: 'validation-2',
  runId: 'run-1',
  predictionId: null,
  parlayId: 'parlay-1',
  fixture: FIXTURE,
  prediction: null,
  parlay: {
    id: 'parlay-1',
    legs: [{ id: 'leg-1' }, { id: 'leg-2' }],
  },
  status: 'won',
  reason: 'parlay-ok',
  evaluatedAt: new Date('2026-05-01T16:00:00.000Z'),
  createdAt: new Date('2026-05-01T14:00:00.000Z'),
  outcome: { reason: 'resolved' },
  settlementRuleVersion: 'v1',
};

const PREDICTION = {
  id: 'prediction-1',
  runId: 'run-1',
  fixture: FIXTURE,
  marketKey: 'h2h',
  selectionKey: 'home',
  line: null,
  odds: 1.95,
  impliedProbability: 0.51,
  estimatedProbability: 0.52,
  edge: 0.04,
  confidence: 0.8,
  quality: 'high',
  status: 'candidate',
  rationaleRedacted: 'Rationale',
  warnings: [],
  generatedAt: new Date('2026-05-01T10:00:00.000Z'),
  validationArtifacts: [VALIDATION],
};

const PARLAY = {
  id: 'parlay-1',
  runId: 'run-1',
  combinedOdds: 2.4,
  aggregateConfidence: 0.77,
  aggregateQuality: 0.83,
  status: 'candidate',
  rationaleRedacted: 'Parlay rationale',
  warnings: [],
  generatedAt: new Date('2026-05-01T11:00:00.000Z'),
  validationArtifacts: [VALIDATION],
  legs: [
    {
      id: 'leg-1',
      legIndex: 0,
      predictionId: 'prediction-1',
      prediction: {
        id: 'prediction-1',
        status: 'candidate',
        confidence: 0.8,
        edge: 0.04,
      },
      fixture: FIXTURE,
      marketKey: 'h2h',
      selectionKey: 'home',
      line: null,
      odds: 1.95,
      status: 'candidate',
      inclusionReason: 'test',
    },
  ],
};

const RUN = {
  id: 'run-1',
  runtime: 'node',
  profile: 'standard',
  providerSports: 'api-football',
  providerAgentic: 'codex',
  model: 'gpt-5.5',
  status: 'succeeded',
  verdict: 'ok',
  artifactDir: '/tmp/run',
  startedAt: new Date('2026-05-01T09:00:00.000Z'),
  completedAt: new Date('2026-05-01T12:00:00.000Z'),
  createdAt: new Date('2026-05-01T08:30:00.000Z'),
  _count: {
    tasks: 0,
    artifacts: 0,
    predictions: 1,
    parlays: 1,
    validationArtifacts: 1,
  },
};

const DAILY_METRIC = {
  id: 'metric-1',
  metricDate: new Date('2026-05-01T00:00:00.000Z'),
  timezone: 'America/Guatemala',
  scope: 'all',
  sourceWindowStart: new Date('2026-05-01T06:00:00.000Z'),
  sourceWindowEnd: new Date('2026-05-02T06:00:00.000Z'),
  predictionMetrics: {
    total: 2,
    won: 1,
    lost: 1,
    hitRate: 50,
    avgOdds: 1.8,
    avgConfidence: 0.7,
  },
  parlayMetrics: {
    total: 1,
    won: 1,
    lost: 0,
    hitRate: 100,
    avgOdds: 2.4,
    avgConfidence: 0.77,
  },
  chartMetrics: {
    parlayHitRateByProfile: [{ key: 'low-odds-top', label: 'low-odds-top', total: 1, won: 1, lost: 0, hitRate: 100 }],
    parlayHitRateByOddsBucket: [{ key: '2.00-2.99', label: '2.00-2.99', total: 1, won: 1, lost: 0, hitRate: 100 }],
    predictionHitRateByMarket: [{ key: 'h2h', label: 'h2h', total: 2, won: 1, lost: 1, hitRate: 50 }],
  },
  generatedAt: new Date('2026-05-01T18:00:00.000Z'),
  createdAt: new Date('2026-05-01T18:00:00.000Z'),
};

const DAILY_RUN = {
  ...RUN,
  id: 'daily-2026-05-01',
  providerAgentic: 'codex,gemini',
  model: 'gpt-5.5,gemini-2.5-pro',
  metadata: {
    dailyBatchId: 'daily-2026-05-01',
    dailyRole: 'batch',
    date: '2026-05-01',
    providers: [{ provider: 'codex', ok: true }, { provider: 'gemini', ok: true }],
    parlays: [{ family: 'codex-only', ok: true }, { family: 'consensus-mixed', ok: true }],
    providerComparison: {
      summary: {
        sameSelection: 2,
        sameMarketDifferentSelection: 1,
        onlyCodex: 1,
        onlyGemini: 0,
        agreementRate: 0.6667,
      },
    },
    providerConsensus: { consensusPredictions: 2, providers: ['codex', 'gemini'] },
    counts: {
      parlayFamilies: {
        'codex-only': { persistedParlays: 1 },
        'consensus-mixed': { persistedParlays: 1 },
      },
      recommendations: 1,
    },
    parlayAnalysis: {
      top: [{
        rank: 1,
        parlayId: 'parlay-1',
        profile: 'low-odds-top',
        harnessStatus: 'promotable',
        combinedOdds: 1.42,
        aggregateConfidence: 0.82,
        expectedEdge: 0.08,
        riskFlags: ['low-liquidity'],
        reasons: ['test recommendation'],
      }],
      diagnostics: { selected: { totalExposureUnits: 2.2 } },
    },
  },
};

function createDashboardDb() {
  return {
    team: {
      findMany: async () => [{ id: 'team-1', name: 'Home' }, { id: 'team-2', name: 'Away' }],
    },
    competition: {
      findMany: async () => [{ id: 'competition-1', name: 'Primera' }],
    },
    prediction: {
      findMany: async () => [PREDICTION],
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where?.id === 'prediction-1') return PREDICTION;
        return null;
      },
      groupBy: async () => [
        { status: 'candidate', _count: { _all: 4 } },
        { status: 'won', _count: { _all: 2 } },
      ],
      count: async () => 2,
    },
    fixture: {
      findMany: async () => [{
        ...FIXTURE,
        predictions: [PREDICTION],
        parlayLegs: [PARLAY.legs[0]],
        validationArtifacts: [VALIDATION],
      }],
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where?.id === 'fixture-1') {
          return {
            ...FIXTURE,
            predictions: [PREDICTION],
            parlayLegs: [PARLAY.legs[0]],
            validationArtifacts: [VALIDATION],
          };
        }
        return null;
      },
      groupBy: async () => [
        { status: 'scheduled', _count: { _all: 1 } },
      ],
      count: async () => 1,
    },
    parlay: {
      findMany: async () => [PARLAY],
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where?.id === 'parlay-1') return PARLAY;
        return null;
      },
      groupBy: async () => [
        { status: 'candidate', _count: { _all: 3 } },
      ],
      count: async () => 1,
    },
    validationArtifact: {
      findMany: async () => [VALIDATION],
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where?.id === 'validation-1') return VALIDATION;
        return null;
      },
      groupBy: async () => [
        { status: 'won', _count: { _all: 5 } },
      ],
      count: async () => 5,
    },
    harnessRun: {
      findMany: async (args?: any) => {
        const where = JSON.stringify(args?.where ?? {});
        return where.includes('daily') ? [DAILY_RUN] : [RUN];
      },
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where?.id === 'run-1') {
          return {
            ...RUN,
            predictions: [PREDICTION],
            parlays: [PARLAY],
            validationArtifacts: [VALIDATION],
          };
        }
        return null;
      },
      groupBy: async () => [
        { status: 'succeeded', _count: { _all: 1 } },
      ],
      count: async (args?: any) => JSON.stringify(args?.where ?? {}).includes('daily') ? 1 : 1,
    },
    dailyMetric: {
      findMany: async () => [DAILY_METRIC],
      groupBy: async () => [
        { scope: 'all', _count: { _all: 1 } },
      ],
      count: async () => 1,
    },
    $queryRaw: async () => 1,
  };
}

const config = loadConfig({
  databaseUrl: '',
  apiFootball: {
    timezone: 'America/Guatemala',
  },
}, { skipApiKey: true });

describe('dashboard api queries', () => {
  it('reads metadata with teams and competitions', async () => {
    const metadata = await readMetadata(createDashboardDb() as any);
    assert.equal(metadata.teams.length, 2);
    assert.equal(metadata.competitions.length, 1);
    assert.equal(metadata.tabs.includes('fixtures'), true);
    assert.equal(metadata.statuses.fixtures.includes('scheduled'), true);
    assert.equal(metadata.statuses.predictions.includes('candidate'), true);
    assert.equal(metadata.directions.includes('asc'), true);
    assert.equal(metadata.sortOptions.fixtures.includes('scheduledAt'), true);
    assert.equal(metadata.sortOptions.predictions.includes('selectionKey'), true);
    assert.equal(metadata.tabs.includes('metrics'), true);
    assert.equal(metadata.sortOptions.metrics.includes('metricDate'), true);
  });

  it('reads overview for fixtures with prediction, parlay and validation activity', async () => {
    const overview = await readOverview(createDashboardDb() as any, config, new URLSearchParams('tab=fixtures&status=scheduled'));
    assert.equal(overview.activeTab, 'fixtures');
    assert.equal(overview.counts.fixtures, 1);
    assert.equal(overview.fixtures.length, 1);
    assert.equal(overview.fixtures[0]?.predictionCount, 1);
    assert.equal(overview.fixtures[0]?.parlayLegCount, 1);
    assert.equal(overview.fixtures[0]?.validationCount, 1);
    assert.equal(overview.fixtures[0]?.latestPrediction?.marketKey, 'h2h');
    assert.equal(overview.fixtures[0]?.latestValidation?.status, 'won');
  });

  it('reads overview for predictions with filters, pagination and sort', async () => {
    const db = createDashboardDb() as any;
    const params = new URLSearchParams(
      'tab=predictions&page=2&take=1&sort=confidence&direction=asc&status=candidate&market=h2h&runId=run-1&team=team-1&competition=competition-1&minConfidence=0.7&maxConfidence=0.9',
    );

    const overview = await readOverview(db, config, params);
    assert.equal(overview.activeTab, 'predictions');
    assert.equal(overview.pagination.page, 2);
    assert.equal(overview.pagination.take, 1);
    assert.equal(overview.pagination.totalPages, 2);
    assert.equal(overview.predictions.length, 1);
    assert.equal(overview.filters.status[0], 'candidate');
    assert.equal(overview.filters.market, 'h2h');
    assert.equal(overview.filters.runId, 'run-1');
  });

  it('maps atomic validation targets with readable summary', async () => {
    const overview = await readOverview(createDashboardDb() as any, config, new URLSearchParams('tab=validations'));
    assert.equal(overview.validations[0]?.target.kind, 'prediction');
    assert.equal(overview.validations[0]?.target.label, 'Atómica');
    assert.equal(overview.validations[0]?.target.summary, 'Home vs Away · h2h · home');
  });

  it('maps parlay validation targets with parlay summary', async () => {
    const baseDb = createDashboardDb();
    const db = {
      ...baseDb,
      validationArtifact: {
        ...baseDb.validationArtifact,
        findMany: async () => [PARLAY_VALIDATION],
        findUnique: async ({ where }: { where: { id?: string } }) => {
          if (where?.id === 'validation-2') return PARLAY_VALIDATION;
          return null;
        },
      },
    } as any;

    const overview = await readOverview(db, config, new URLSearchParams('tab=validations&validationTarget=parlay'));
    assert.equal(overview.validations[0]?.target.kind, 'parlay');
    assert.equal(overview.validations[0]?.target.label, 'Parlay');
    assert.equal(overview.validations[0]?.target.summary, 'Parlay de 2 legs');

    const entity = await readEntity(db, 'validation', 'validation-2');
    if ('error' in entity) {
      assert.fail('validation should exist');
    }
    const validationEntity = entity.entity as typeof overview.validations[number];
    assert.equal(validationEntity.target.kind, 'parlay');
    assert.equal(validationEntity.target.summary, 'Parlay de 2 legs');
  });

  it('preserves target type when validation relation is missing', async () => {
    const orphanValidation = {
      ...VALIDATION,
      id: 'validation-3',
      prediction: null,
    };
    const baseDb = createDashboardDb();
    const db = {
      ...baseDb,
      validationArtifact: {
        ...baseDb.validationArtifact,
        findMany: async () => [orphanValidation],
      },
    } as any;

    const overview = await readOverview(db, config, new URLSearchParams('tab=validations&validationTarget=prediction'));
    assert.equal(overview.validations[0]?.target.kind, 'prediction');
    assert.equal(overview.validations[0]?.target.id, 'prediction-1');
    assert.equal(overview.validations[0]?.target.summary, null);
  });

  it('applies validationTarget=prediction in overview filters', async () => {
    let validationWhere: Record<string, unknown> = {};
    const baseDb = createDashboardDb();
    const db = {
      ...baseDb,
      validationArtifact: {
        ...baseDb.validationArtifact,
        count: async ({ where }: { where: Record<string, unknown> }) => {
          validationWhere = where;
          return 5;
        },
        findMany: async () => [VALIDATION],
      },
    } as any;

    const overview = await readOverview(db, config, new URLSearchParams('tab=validations&validationTarget=prediction'));
    assert.equal(overview.filters.validationTarget, 'prediction');
    assert.equal(overview.activeTab, 'validations');
    const predictionClause = validationWhere.predictionId;
    const parlayClause = validationWhere.parlayId;
    assert.equal((predictionClause as { not: null })?.not, null);
    assert.equal(parlayClause, null);
  });

  it('applies validation target id in overview filters', async () => {
    let validationWhere: Record<string, unknown> = {};
    const baseDb = createDashboardDb();
    const db = {
      ...baseDb,
      validationArtifact: {
        ...baseDb.validationArtifact,
        count: async ({ where }: { where: Record<string, unknown> }) => {
          validationWhere = where;
          return 1;
        },
        findMany: async () => [VALIDATION],
      },
    } as any;

    const overview = await readOverview(
      db,
      config,
      new URLSearchParams('tab=validations&validationTarget=prediction&targetId=prediction-1'),
    );
    assert.equal(overview.filters.validationTarget, 'prediction');
    assert.equal(overview.filters.targetId, 'prediction-1');
    assert.equal(validationWhere.predictionId, 'prediction-1');
    assert.equal(validationWhere.parlayId, null);
  });

  it('applies validationTarget=parlay in overview filters', async () => {
    let validationWhere: Record<string, unknown> = {};
    const baseDb = createDashboardDb();
    const db = {
      ...baseDb,
      validationArtifact: {
        ...baseDb.validationArtifact,
        count: async ({ where }: { where: Record<string, unknown> }) => {
          validationWhere = where;
          return 5;
        },
        findMany: async () => [VALIDATION],
      },
    } as any;

    const overview = await readOverview(db, config, new URLSearchParams('tab=validations&validationTarget=parlay'));
    assert.equal(overview.filters.validationTarget, 'parlay');
    assert.equal(overview.activeTab, 'validations');
    const parlayClause = validationWhere.parlayId;
    const predictionClause = validationWhere.predictionId;
    assert.equal((parlayClause as { not: null })?.not, null);
    assert.equal(predictionClause, null);
  });

  it('reads prediction entity and validation history', async () => {
    const db = createDashboardDb() as any;
    const response = await readEntity(db, 'prediction', 'prediction-1');
    if ('error' in response) {
      assert.fail('prediction should exist');
    }
    assert.equal(response.kind, 'prediction');
    assert.equal(response.entity.id, 'prediction-1');
    assert.equal(Array.isArray(response.validationHistory), true);
    assert.equal(response.validationHistory?.length, 1);
    assert.equal(response.validationHistory?.[0]?.target.kind, 'prediction');
  });

  it('reads fixture entity with recent prediction and settlement detail', async () => {
    const response = await readEntity(createDashboardDb() as any, 'fixture', 'fixture-1');
    if ('error' in response) {
      assert.fail('fixture should exist');
    }
    assert.equal(response.kind, 'fixture');
    assert.equal(response.entity.id, 'fixture-1');
    const fixture = response.entity as any;
    assert.equal(Array.isArray(fixture.recentPredictions), true);
    assert.equal(Array.isArray(fixture.recentValidations), true);
    assert.equal(fixture.latestPrediction?.marketKey, 'h2h');
    assert.equal(fixture.latestValidation?.status, 'won');
  });

  it('reads run entity with prediction, parlay and validation activity', async () => {
    const response = await readEntity(createDashboardDb() as any, 'run', 'run-1');
    if ('error' in response) {
      assert.fail('run should exist');
    }
    assert.equal(response.kind, 'run');
    const run = response.entity as any;
    assert.equal(run.predictionCount, 1);
    assert.equal(run.parlayCount, 1);
    assert.equal(run.validationCount, 1);
    assert.equal(run.recentPredictions[0]?.id, 'prediction-1');
    assert.equal(run.recentParlays[0]?.id, 'parlay-1');
    assert.equal(run.recentValidations[0]?.id, 'validation-1');
  });

  it('reads overview for daily metrics with chart-ready payloads', async () => {
    const overview = await readOverview(createDashboardDb() as any, config, new URLSearchParams('tab=metrics&sort=metricDate&direction=desc'));

    assert.equal(overview.activeTab, 'metrics');
    assert.equal(overview.counts.metrics, 1);
    assert.equal(overview.metrics.length, 1);
    assert.equal(overview.metrics[0]?.metricDate, '2026-05-01');
    assert.equal(overview.metrics[0]?.scope, 'all');
    assert.deepEqual((overview.metrics[0]?.chartMetrics as any).predictionHitRateByMarket[0], {
      key: 'h2h',
      label: 'h2h',
      total: 2,
      won: 1,
      lost: 1,
      hitRate: 50,
    });
  });

  it('reads daily overview batches with comparison and parlay recommendations', async () => {
    const overview = await readOverview(createDashboardDb() as any, config, new URLSearchParams('tab=daily&dailyBatchId=daily-2026-05-01&provider=codex&family=consensus-mixed'));

    assert.equal(overview.activeTab, 'daily');
    assert.equal(overview.counts.daily, 1);
    assert.equal(overview.daily.length, 1);
    assert.equal(overview.daily[0]?.id, 'daily-2026-05-01');
    assert.equal(overview.daily[0]?.date, '2026-05-01');
    assert.equal((overview.daily[0]?.providerComparison as any).summary.sameSelection, 2);
    assert.equal((overview.daily[0]?.providerConsensus as any).consensusPredictions, 2);
    assert.equal(overview.daily[0]?.recommendations[0]?.profile, 'low-odds-top');
    assert.equal(overview.filters.dailyBatchId, 'daily-2026-05-01');
    assert.equal(overview.filters.provider, 'codex');
    assert.equal(overview.filters.family, 'consensus-mixed');
  });

  it('returns entity not found for missing validation id', async () => {
    const db = createDashboardDb() as any;
    const response = await readEntity(db, 'validation', 'missing');
    if ('error' in response) {
      assert.equal(response.error, 'not_found');
      return;
    }
    assert.fail('missing validation should return not_found');
  });
});

describe('dashboard endpoints', () => {
  async function withServer(fn: (base: string) => Promise<void>) {
    const server = await startDashboardServer(config, { host: '127.0.0.1', port: 0 }, createDashboardDb() as any);
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 4317;
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }

  it('serves health and metadata endpoints', async () => {
    await withServer(async (base) => {
      const health = await fetch(`${base}/api/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true });

      const metadata = await fetch(`${base}/api/metadata`);
      assert.equal(metadata.status, 200);
      const payload = await metadata.json();
      assert.equal(payload.statuses.predictions.includes('candidate'), true);
      assert.equal(payload.teams.length, 2);
    });
  });

  it('redacts raw dashboard error messages before returning JSON', async () => {
    const db = {
      ...createDashboardDb(),
      $queryRaw: async () => {
        throw new Error('connect failed mysql://user:secret-dashboard-pass@example.test/db Authorization: Bearer secret-dashboard-token');
      },
    } as any;
    const server = await startDashboardServer(config, { host: '127.0.0.1', port: 0 }, db);
    const address = server.server.address();
    const port = typeof address === 'object' && address ? address.port : 4317;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(response.status, 500);
      const payload = await response.json();
      assert.equal(payload.error, 'dashboard_error');
      assert.match(payload.message, /\[REDACTED\]/);
      assert.doesNotMatch(payload.message, /secret-dashboard-pass|secret-dashboard-token/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('serves overview and entity routes', async () => {
    await withServer(async (base) => {
      const overview = await fetch(`${base}/api/overview?tab=parlays&page=1&take=10&sort=combinedOdds&direction=desc`);
      assert.equal(overview.status, 200);
      const list = await overview.json();
      assert.equal(list.activeTab, 'parlays');
      assert.equal(Array.isArray(list.parlays), true);
      assert.equal(list.pagination.total >= 1, true);

      const metrics = await fetch(`${base}/api/overview?tab=metrics&page=1&take=10&sort=metricDate&direction=desc`);
      assert.equal(metrics.status, 200);
      const metricsPayload = await metrics.json();
      assert.equal(metricsPayload.activeTab, 'metrics');
      assert.equal(Array.isArray(metricsPayload.metrics), true);
      assert.equal(metricsPayload.metrics[0].scope, 'all');

      const prediction = await fetch(`${base}/api/entity/prediction/prediction-1`);
      assert.equal(prediction.status, 200);
      const predictionPayload = await prediction.json();
      assert.equal(predictionPayload.kind, 'prediction');
      assert.equal(predictionPayload.entity.id, 'prediction-1');

      const missing = await fetch(`${base}/api/entity/run/missing`);
      assert.equal(missing.status, 404);
      const missingPayload = await missing.json();
      assert.equal(missingPayload.error, 'not_found');
    });
  });
});
