import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  buildRecommendationNotifierArgs,
  publishDailyRecommendations,
  validatePublishDatabaseUrl,
} from '../lib/daily-e2e-publication.mjs';

const DATE = '2026-07-15';
const BATCH = 'daily-2026-07-15-full';
const PREDICTION_ID = '11111111-1111-5111-8111-111111111111';
const ARTIFACT_PATH = `/tmp/${BATCH}/daily-parlay-recommendations.json`;
const DATABASE_URL = 'postgresql://redacted@localhost/db?schema=gana_ops';
const DISCORD_TARGET = 'discord:test-channel';
const PAYLOAD_SHA = 'a'.repeat(64);
const SOURCE_MANIFEST = {
  schemaVersion: 1,
  sources: [{ role: 'recommendations', field: null, path: ARTIFACT_PATH, byteLength: 1, sha256: 'b'.repeat(64) }],
};
const SOURCE_MANIFEST_SHA = createHash('sha256').update(JSON.stringify(SOURCE_MANIFEST)).digest('hex');

describe('daily E2E publication workflow', () => {
  it('places both expected integrity proofs on the notifier command before send', () => {
    const args = buildRecommendationNotifierArgs({
      artifactPath: ARTIFACT_PATH,
      discordTarget: DISCORD_TARGET,
      maxSelections: 25,
      preparedPayloadPath: '/tmp/prepared-payload.json',
      expectedPayloadSha256: PAYLOAD_SHA,
      expectedSourceManifestSha256: SOURCE_MANIFEST_SHA,
      dryRun: false,
    });

    assert.deepEqual(args.slice(-6), [
      '--expected-source-manifest-sha256', SOURCE_MANIFEST_SHA,
      '--prepared-payload', '/tmp/prepared-payload.json',
      '--expected-payload-sha256', PAYLOAD_SHA,
    ]);
    assert.throws(() => buildRecommendationNotifierArgs({
      artifactPath: ARTIFACT_PATH,
      discordTarget: DISCORD_TARGET,
      maxSelections: 25,
      preparedPayloadPath: '/tmp/prepared-payload.json',
      expectedSourceManifestSha256: SOURCE_MANIFEST_SHA,
      dryRun: false,
    }), /payload SHA-256 proof is required/);
  });

  it('requires a PostgreSQL gana_ops URL before creating a Prisma client', async () => {
    assert.equal(validatePublishDatabaseUrl(undefined).reason, 'missing-database-url');
    assert.equal(validatePublishDatabaseUrl('mysql://localhost/db').reason, 'database-url-not-postgresql');
    assert.equal(validatePublishDatabaseUrl('postgresql://localhost/db?schema=public').reason, 'database-url-schema-not-gana-ops');

    let created = 0;
    const result = await publishDailyRecommendations(baseInput({ databaseUrl: undefined }), {
      createPrismaClient: async () => { created += 1; },
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'missing-database-url');
    assert.equal(created, 0);
  });

  it('does not touch DB or notifier when there are no publishable selections', async () => {
    let created = 0;
    let notified = 0;
    const artifact = makeArtifact({ recommendations: [], predictionIds: [] });
    const result = await publishDailyRecommendations(baseInput({ artifact }), {
      createPrismaClient: async () => { created += 1; },
      runNotifier: async () => { notified += 1; },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'no-publishable-selections');
    assert.equal(created, 0);
    assert.equal(notified, 0);
  });

  it('runs dry-run first, reserves the ledger, sends the prepared payload, and finalizes without any E2E/provider call', async () => {
    const fake = createFakePrisma();
    const notifierCalls = [];
    const result = await publishDailyRecommendations(baseInput(), {
      createPrismaClient: async () => fake.client,
      randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      now: sequenceNow('2026-07-14T19:00:00.000Z', '2026-07-14T19:00:05.000Z'),
      runNotifier: async (call) => {
        notifierCalls.push(call);
        return call.dryRun ? dryRunOutput() : sendOutput();
      },
    });

    assert.equal(result.status, 'published');
    assert.equal(result.sent, true);
    assert.equal(notifierCalls.length, 2);
    assert.equal(notifierCalls[0].dryRun, true);
    assert.equal(notifierCalls[1].dryRun, false);
    assert.equal(notifierCalls[1].preparedPayloadPath, '/tmp/prepared-payload.json');
    assert.equal(notifierCalls[1].expectedPayloadSha256, PAYLOAD_SHA);
    assert.equal(notifierCalls[1].expectedSourceManifestSha256, SOURCE_MANIFEST_SHA);
    assert.equal(notifierCalls.some((call) => 'providers' in call || 'web' in call || 'runE2E' in call), false);
    assert.equal(fake.calls.createMany, 1);
    assert.equal(fake.rows.length, 1);
    assert.equal(fake.rows[0].status, 'published');
    assert.deepEqual(fake.rows[0].discordMessageIds, ['message-1']);
    assert.equal(fake.rows[0].payloadSha256, PAYLOAD_SHA);
  });

  it('blocks before notifier when the DB health gate is not gana_ops', async () => {
    const fake = createFakePrisma({ schemaName: 'public' });
    let notified = 0;
    const result = await publishDailyRecommendations(baseInput(), {
      createPrismaClient: async () => fake.client,
      runNotifier: async () => { notified += 1; },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'database-schema-not-gana-ops:public');
    assert.equal(notified, 0);
    assert.equal(fake.calls.createMany, 0);
  });

  it('does not send when a complete publication ledger already exists', async () => {
    const fake = createFakePrisma({ existingRows: [publishedRow()] });
    let notified = 0;
    const result = await publishDailyRecommendations(baseInput(), {
      createPrismaClient: async () => fake.client,
      runNotifier: async () => { notified += 1; },
    });

    assert.equal(result.status, 'already-published');
    assert.equal(notified, 0);
    assert.equal(fake.calls.createMany, 0);
  });

  it('blocks partial, uncertain, or cross-batch ledger rows without sending', async () => {
    for (const row of [
      { ...publishedRow(), status: 'publishing' },
      { ...publishedRow(), dailyBatchId: 'daily-other-batch' },
      { ...publishedRow(), targetId: '22222222-2222-5222-8222-222222222222' },
    ]) {
      const fake = createFakePrisma({ existingRows: [row] });
      let notified = 0;
      const result = await publishDailyRecommendations(baseInput(), {
        createPrismaClient: async () => fake.client,
        runNotifier: async () => { notified += 1; },
      });
      assert.equal(result.status, 'ledger-conflict');
      assert.equal(notified, 0);
    }
  });

  it('does not reserve or send when notifier dry-run fails', async () => {
    const fake = createFakePrisma();
    const notifierCalls = [];
    const result = await publishDailyRecommendations(baseInput(), {
      createPrismaClient: async () => fake.client,
      runNotifier: async (call) => {
        notifierCalls.push(call);
        return { ok: false, reason: 'render-failed' };
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'dry-run-notifier-failed:render-failed');
    assert.equal(notifierCalls.length, 1);
    assert.equal(fake.calls.createMany, 0);
    assert.equal(fake.rows.length, 0);
  });

  it('keeps a durable uncertain reservation after send failure and prevents an automatic resend', async () => {
    const fake = createFakePrisma();
    let notifierCalls = 0;
    const dependencies = {
      createPrismaClient: async () => fake.client,
      runNotifier: async (call) => {
        notifierCalls += 1;
        return call.dryRun ? dryRunOutput() : { ok: false, reason: 'discord-timeout' };
      },
    };
    const first = await publishDailyRecommendations(baseInput(), dependencies);

    assert.equal(first.status, 'publication-uncertain');
    assert.equal(fake.rows.length, 1);
    assert.equal(fake.rows[0].status, 'send-uncertain');
    assert.equal(notifierCalls, 2);

    const second = await publishDailyRecommendations(baseInput(), dependencies);
    assert.equal(second.status, 'ledger-conflict');
    assert.equal(notifierCalls, 2);
  });

  it('does not finalize unless every prepared Discord payload returns one distinct message ID', async () => {
    const fake = createFakePrisma();
    const result = await publishDailyRecommendations(baseInput(), {
      createPrismaClient: async () => fake.client,
      runNotifier: async (call) => call.dryRun
        ? dryRunOutput({ payloadCount: 2 })
        : sendOutput({ payloadCount: 2, messageIds: ['message-1'] }),
    });

    assert.equal(result.status, 'publication-uncertain');
    assert.equal(result.reason, 'send-discord-result-count-mismatch:1/2');
    assert.equal(fake.rows[0].status, 'send-uncertain');
    assert.equal(fake.calls.updateMany, 1);
  });

  it('finalizes a multipage publication only when every page has a distinct message ID', async () => {
    const fake = createFakePrisma();
    const result = await publishDailyRecommendations(baseInput(), {
      createPrismaClient: async () => fake.client,
      runNotifier: async (call) => call.dryRun
        ? dryRunOutput({ payloadCount: 2 })
        : sendOutput({ payloadCount: 2, messageIds: ['message-1', 'message-2'] }),
    });

    assert.equal(result.status, 'published');
    assert.deepEqual(result.publicationLedger.discordMessageIds, ['message-1', 'message-2']);
    assert.deepEqual(fake.rows[0].discordMessageIds, ['message-1', 'message-2']);
  });

  it('rejects invalid target IDs before Prisma or notifier', async () => {
    let created = 0;
    const artifact = makeArtifact({ predictionIds: ['not-a-uuid'] });
    artifact.recommendations[0].predictionId = 'not-a-uuid';
    const result = await publishDailyRecommendations(baseInput({ artifact }), {
      createPrismaClient: async () => { created += 1; },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'invalid-publication-target-ids:p=0,pred=1');
    assert.equal(created, 0);
  });
});

function baseInput(overrides = {}) {
  return {
    artifact: makeArtifact(),
    artifactPath: ARTIFACT_PATH,
    date: DATE,
    dailyBatchId: BATCH,
    discordTarget: DISCORD_TARGET,
    databaseUrl: DATABASE_URL,
    sourceManifest: SOURCE_MANIFEST,
    sourceManifestSha256: SOURCE_MANIFEST_SHA,
    maxSelections: 25,
    mode: 'publish-existing',
    ...overrides,
  };
}

function makeArtifact({ recommendations, predictionIds = [PREDICTION_ID] } = {}) {
  return {
    date: DATE,
    dailyBatchId: BATCH,
    persistencePolicy: { finalOperationalStore: 'database-ledger' },
    publishedTargets: { parlayIds: [], predictionIds },
    recommendations: recommendations ?? [{ kind: 'atomic-prediction', predictionId: predictionIds[0] }],
  };
}

function dryRunOutput({ payloadCount = 1 } = {}) {
  return {
    ok: true,
    output: {
      artifactPath: ARTIFACT_PATH,
      payloadPath: '/tmp/prepared-payload.json',
      payloadSha256: PAYLOAD_SHA,
      payloadCount,
      payloads: Array.from({ length: payloadCount }, (_, index) => ({ embeds: [{ title: `payload-${index + 1}` }] })),
      sourceManifestSha256: SOURCE_MANIFEST_SHA,
      selectionCount: 1,
      transport: 'discord-native',
      gatewayTarget: DISCORD_TARGET,
    },
  };
}

function sendOutput({ payloadCount = 1, messageIds = ['message-1'] } = {}) {
  const discordResults = messageIds.map((messageId) => ({ message_id: messageId }));
  return {
    ok: true,
    output: {
      ...dryRunOutput({ payloadCount }).output,
      discordResult: discordResults[0],
      discordResults,
    },
  };
}

function publishedRow() {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    dailyBatchId: BATCH,
    slateDate: new Date(`${DATE}T00:00:00.000Z`),
    channel: 'discord',
    target: 'recommendations',
    targetType: 'prediction',
    targetId: PREDICTION_ID,
    predictionId: PREDICTION_ID,
    parlayId: null,
    status: 'published',
    payloadSha256: PAYLOAD_SHA,
    discordMessageId: 'message-1',
    discordMessageIds: ['message-1'],
  };
}

function createFakePrisma({ existingRows = [], schemaName = 'gana_ops', advisoryLock = true } = {}) {
  const rows = existingRows.map((row) => ({ ...row }));
  const calls = { createMany: 0, updateMany: 0, transactions: 0, disconnects: 0 };
  const client = {
    async $transaction(callback) {
      calls.transactions += 1;
      return callback(client);
    },
    async $queryRawUnsafe(sql) {
      if (String(sql).includes('current_schema')) {
        return [{
          schema_name: schemaName,
          transaction_read_only: 'off',
          predictions_table: true,
          parlays_table: true,
          publications_table: true,
        }];
      }
      if (String(sql).includes('pg_try_advisory_xact_lock')) return [{ acquired: advisoryLock }];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async $disconnect() { calls.disconnects += 1; },
    parlay: {
      async findMany({ where }) { return (where.id.in ?? []).map((id) => ({ id })); },
    },
    prediction: {
      async findMany({ where }) { return (where.id.in ?? []).map((id) => ({ id })); },
    },
    harnessRun: {
      async findUnique() { return { id: BATCH }; },
    },
    publicRecommendationPublication: {
      async findMany({ where }) {
        return rows.filter((row) => matchesWhere(row, where)).map((row) => ({ ...row }));
      },
      async createMany({ data }) {
        calls.createMany += 1;
        rows.push(...data.map((row) => ({ ...row })));
        return { count: data.length };
      },
      async updateMany({ where, data }) {
        calls.updateMany += 1;
        const matched = rows.filter((row) => matchesWhere(row, where));
        for (const row of matched) Object.assign(row, data);
        return { count: matched.length };
      },
    },
  };
  return { client, rows, calls };
}

function matchesWhere(row, where = {}) {
  for (const key of ['dailyBatchId', 'channel', 'target', 'status']) {
    if (where[key] !== undefined && row[key] !== where[key]) return false;
  }
  if (where.slateDate && new Date(row.slateDate).getTime() !== new Date(where.slateDate).getTime()) return false;
  if (Array.isArray(where.OR) && !where.OR.some((item) => row.targetType === item.targetType && row.targetId === item.targetId)) return false;
  return true;
}

function sequenceNow(...values) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}
