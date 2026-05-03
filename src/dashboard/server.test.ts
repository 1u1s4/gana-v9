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
};

const VALIDATION = {
  id: 'validation-1',
  runId: 'run-1',
  predictionId: 'prediction-1',
  parlayId: null,
  fixture: FIXTURE,
  status: 'won',
  reason: 'ok',
  evaluatedAt: new Date('2026-05-01T15:00:00.000Z'),
  createdAt: new Date('2026-05-01T13:00:00.000Z'),
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
      findMany: async () => [RUN],
      findUnique: async ({ where }: { where: { id?: string } }) => {
        if (where?.id === 'run-1') return RUN;
        return null;
      },
      groupBy: async () => [
        { status: 'succeeded', _count: { _all: 1 } },
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
    assert.equal(metadata.statuses.predictions.includes('candidate'), true);
    assert.equal(metadata.directions.includes('asc'), true);
    assert.equal(metadata.sortOptions.predictions.includes('selectionKey'), true);
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

  it('serves overview and entity routes', async () => {
    await withServer(async (base) => {
      const overview = await fetch(`${base}/api/overview?tab=parlays&page=1&take=10&sort=combinedOdds&direction=desc`);
      assert.equal(overview.status, 200);
      const list = await overview.json();
      assert.equal(list.activeTab, 'parlays');
      assert.equal(Array.isArray(list.parlays), true);
      assert.equal(list.pagination.total >= 1, true);

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
