import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  buildDbPublicationLedgerPlan,
  collectPublicationLedgerTargetIds,
  countPublishableSelections,
  validatePublicationLedgerAlignment,
  validatePublicationTargetIds,
} from './daily-e2e-wrapper-state.mjs';

const NOTIFIER_PATH = '.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
const DEFAULT_MAX_SELECTIONS = 25;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export function validatePublishDatabaseUrl(databaseUrl) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    return { ok: false, reason: 'missing-database-url' };
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, reason: 'invalid-database-url' };
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return { ok: false, reason: 'database-url-not-postgresql' };
  }
  if (parsed.searchParams.get('schema') !== 'gana_ops') {
    return { ok: false, reason: 'database-url-schema-not-gana-ops' };
  }
  return { ok: true, reason: 'postgresql-gana-ops-url' };
}

export async function publishDailyRecommendations(input, dependencies = {}) {
  const {
    artifact,
    artifactPath,
    date,
    dailyBatchId,
    discordTarget,
    databaseUrl,
    sourceManifest,
    sourceManifestSha256,
    maxSelections = DEFAULT_MAX_SELECTIONS,
    mode = 'daily-e2e',
  } = input;
  const now = dependencies.now ?? (() => new Date());
  const attemptId = (dependencies.randomUUID ?? randomUUID)();

  if (!artifact || artifact.date !== date || artifact.dailyBatchId !== dailyBatchId) {
    return blocked('artifact-identity-mismatch');
  }
  if (!sourceManifest || !isSha256(sourceManifestSha256)
    || createHash('sha256').update(JSON.stringify(sourceManifest)).digest('hex') !== sourceManifestSha256) {
    return blocked('missing-or-invalid-source-manifest-proof');
  }
  const counts = countPublishableSelections(artifact);
  if (counts.total === 0) return { ...blocked('no-publishable-selections'), counts };
  const alignment = validatePublicationLedgerAlignment(artifact);
  if (!alignment.ok) return { ...blocked(alignment.reason), counts, alignment };
  const targetValidation = validatePublicationTargetIds(artifact);
  if (!targetValidation.ok) return { ...blocked(targetValidation.reason), counts, alignment, targetValidation };

  const databaseGate = validatePublishDatabaseUrl(databaseUrl);
  if (!databaseGate.ok) return { ...blocked(databaseGate.reason), counts, alignment, targetValidation, databaseGate };

  const createPrismaClient = dependencies.createPrismaClient ?? defaultCreatePrismaClient;
  const runNotifier = dependencies.runNotifier ?? runNotifierProcess;
  const prisma = await createPrismaClient(databaseUrl);
  try {
    const preflight = await withTransaction(prisma, async (tx) => {
      const health = await verifyPostgresHealth(tx);
      if (!health.ok) return { ...blocked(health.reason), health };
      const advisoryLock = await acquirePublicationAdvisoryLock(tx, date);
      if (!advisoryLock.ok) return blocked(advisoryLock.reason);
      const existing = await inspectExistingPublicationLedger(tx, { artifact, date, dailyBatchId });
      if (existing.status !== 'empty') return existing;
      const dbLedger = await verifyDbPersistenceLedger(artifact, { prisma: tx });
      if (!dbLedger.ok) return { ...blocked(dbLedger.reason), dbLedger };
      return { status: 'ready', health, dbLedger };
    });
    if (preflight.status !== 'ready') return { ...preflight, counts, alignment, targetValidation, databaseGate };

    const dryRunResult = await runNotifier({
      artifactPath,
      discordTarget,
      maxSelections,
      expectedSourceManifestSha256: sourceManifestSha256,
      dryRun: true,
    });
    const dryRun = validateNotifierResult(dryRunResult, {
      artifactPath,
      discordTarget,
      recommendationCount: counts.recommendations,
      expectedSourceManifestSha256: sourceManifestSha256,
      phase: 'dry-run',
    });
    if (!dryRun.ok) {
      return {
        ...blocked(dryRun.reason),
        counts,
        alignment,
        targetValidation,
        databaseGate,
        dbLedger: preflight.dbLedger,
      };
    }

    const reservedAt = now();
    const reservation = await withTransaction(prisma, async (tx) => {
      const health = await verifyPostgresHealth(tx);
      if (!health.ok) return { ...blocked(health.reason), health };
      const advisoryLock = await acquirePublicationAdvisoryLock(tx, date);
      if (!advisoryLock.ok) return blocked(advisoryLock.reason);
      const existing = await inspectExistingPublicationLedger(tx, { artifact, date, dailyBatchId });
      if (existing.status !== 'empty') return existing;
      const dbLedger = await verifyDbPersistenceLedger(artifact, { prisma: tx });
      if (!dbLedger.ok) return { ...blocked(dbLedger.reason), dbLedger };
      const publicationLedger = await reserveDiscordPublicationLedger(artifact, {
        prisma: tx,
        artifactPath,
        dailyBatchId,
        date,
        discordTarget,
        dryRun: dryRun.output,
        attemptId,
        mode,
        reservedAt,
      });
      return { status: 'reserved', health, dbLedger, publicationLedger };
    });
    if (reservation.status !== 'reserved') {
      return {
        ...reservation,
        counts,
        alignment,
        targetValidation,
        databaseGate,
        dryRun: dryRun.output,
      };
    }

    let sendResult;
    try {
      sendResult = await runNotifier({
        artifactPath,
        discordTarget,
        maxSelections,
        preparedPayloadPath: dryRun.output.payloadPath,
        expectedPayloadSha256: dryRun.output.payloadSha256,
        expectedSourceManifestSha256: sourceManifestSha256,
        dryRun: false,
      });
    } catch (error) {
      await markPublicationUncertain(prisma, {
        artifact,
        dailyBatchId,
        attemptId,
        reason: `notifier-threw:${safeErrorMessage(error, databaseUrl)}`,
      });
      return publicationUncertain('notifier-send-threw', {
        counts,
        alignment,
        targetValidation,
        databaseGate,
        dbLedger: reservation.dbLedger,
        dryRun: dryRun.output,
        publicationLedger: reservation.publicationLedger,
      });
    }
    const notification = validateNotifierResult(sendResult, {
      artifactPath,
      discordTarget,
      recommendationCount: counts.recommendations,
      expectedPayloadSha256: dryRun.output.payloadSha256,
      expectedPayloadCount: dryRun.output.payloadCount,
      expectedSourceManifestSha256: sourceManifestSha256,
      phase: 'send',
      requireMessageIds: true,
    });
    if (!notification.ok) {
      await markPublicationUncertain(prisma, {
        artifact,
        dailyBatchId,
        attemptId,
        reason: notification.reason,
      });
      return publicationUncertain(notification.reason, {
        counts,
        alignment,
        targetValidation,
        databaseGate,
        dbLedger: reservation.dbLedger,
        dryRun: dryRun.output,
        publicationLedger: reservation.publicationLedger,
      });
    }

    const completedAt = now();
    let publicationLedger;
    try {
      publicationLedger = await withTransaction(prisma, (tx) => finalizeDiscordPublicationLedger(artifact, {
        prisma: tx,
        dailyBatchId,
        notification: notification.output,
        attemptId,
        mode,
        completedAt,
      }));
    } catch (error) {
      return {
        status: 'publication-ledger-error',
        reason: `publication-ledger-finalize-failed:${safeErrorMessage(error, databaseUrl)}`,
        sent: true,
        reserved: true,
        counts,
        alignment,
        targetValidation,
        databaseGate,
        dbLedger: reservation.dbLedger,
        dryRun: dryRun.output,
        notification: notification.output,
        publicationLedger: reservation.publicationLedger,
      };
    }

    return {
      status: 'published',
      reason: publicationLedger.reason,
      sent: true,
      reserved: true,
      counts,
      alignment,
      targetValidation,
      databaseGate,
      dbLedger: reservation.dbLedger,
      dryRun: dryRun.output,
      notification: notification.output,
      publicationLedger,
      completedAt,
    };
  } catch (error) {
    return {
      ...blocked(`publication-workflow-failed:${safeErrorMessage(error, databaseUrl)}`),
      counts,
      alignment,
      targetValidation,
      databaseGate,
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function verifyDbPersistenceLedger(artifact, { prisma } = {}) {
  const targets = collectPublicationLedgerTargetIds(artifact);
  const plan = buildDbPublicationLedgerPlan(artifact);
  const parlayIds = plan.persistedParlayIds;
  const predictionIds = plan.predictionIds;
  if (!prisma) return { ok: false, reason: 'missing-prisma-client' };
  if (targets.parlayIds.length + predictionIds.length === 0) {
    return { ok: false, reason: 'empty-ledger-targets', parlayIds: targets.parlayIds, predictionIds };
  }
  if (plan.invalidParlayIds.length || predictionIds.some((id) => !uuidOrNull(id))) {
    return {
      ok: false,
      reason: 'invalid-ledger-target-ids',
      parlayIds: targets.parlayIds,
      dbParlayIds: parlayIds,
      artifactOnlyParlayIds: plan.artifactOnlyParlayIds,
      invalidParlayIds: plan.invalidParlayIds,
      predictionIds,
    };
  }
  const [parlays, predictions] = await Promise.all([
    parlayIds.length
      ? prisma.parlay.findMany({ where: { id: { in: parlayIds } }, select: { id: true } })
      : Promise.resolve([]),
    predictionIds.length
      ? prisma.prediction.findMany({ where: { id: { in: predictionIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  const foundParlays = new Set(parlays.map((item) => item.id));
  const foundPredictions = new Set(predictions.map((item) => item.id));
  const missingParlayIds = parlayIds.filter((id) => !foundParlays.has(id));
  const missingPredictionIds = predictionIds.filter((id) => !foundPredictions.has(id));
  if (missingParlayIds.length || missingPredictionIds.length) {
    return {
      ok: false,
      reason: `missing-db-ledger-targets:p=${missingParlayIds.length},pred=${missingPredictionIds.length}`,
      parlayIds: targets.parlayIds,
      dbParlayIds: parlayIds,
      artifactOnlyParlayIds: plan.artifactOnlyParlayIds,
      invalidParlayIds: plan.invalidParlayIds,
      predictionIds,
      missingParlayIds,
      missingPredictionIds,
    };
  }
  return {
    ok: true,
    reason: `verified-db-ledger:p=${parlayIds.length},artifact-p=${plan.artifactOnlyParlayIds.length},pred=${predictionIds.length}`,
    parlayIds: targets.parlayIds,
    dbParlayIds: parlayIds,
    artifactOnlyParlayIds: plan.artifactOnlyParlayIds,
    invalidParlayIds: plan.invalidParlayIds,
    predictionIds,
  };
}

export function discordMessageIds(notification) {
  const values = [
    notification?.discordResult?.message_id,
    ...(Array.isArray(notification?.discordResults)
      ? notification.discordResults.map((item) => item?.message_id)
      : []),
  ];
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

async function defaultCreatePrismaClient(databaseUrl) {
  const { PrismaClient } = await import('@prisma/client');
  return new PrismaClient({ datasourceUrl: databaseUrl });
}

async function withTransaction(prisma, callback) {
  if (typeof prisma?.$transaction !== 'function') throw new Error('Prisma client does not support transactions.');
  return prisma.$transaction(callback, TRANSACTION_OPTIONS);
}

async function verifyPostgresHealth(prisma) {
  const rows = await prisma.$queryRawUnsafe(`
    select
      current_schema()::text as schema_name,
      current_setting('transaction_read_only')::text as transaction_read_only,
      (to_regclass('gana_ops.predictions') is not null) as predictions_table,
      (to_regclass('gana_ops.parlays') is not null) as parlays_table,
      (to_regclass('gana_ops.public_recommendation_publications') is not null) as publications_table
  `);
  const row = rows?.[0] ?? {};
  if (row.schema_name !== 'gana_ops') return { ok: false, reason: `database-schema-not-gana-ops:${row.schema_name ?? 'unknown'}` };
  if (row.transaction_read_only !== 'off') return { ok: false, reason: 'database-is-read-only' };
  if (!row.predictions_table || !row.parlays_table || !row.publications_table) {
    return { ok: false, reason: 'database-health-missing-required-tables' };
  }
  return { ok: true, reason: 'postgresql-gana-ops-healthy' };
}

async function acquirePublicationAdvisoryLock(prisma, date) {
  const rows = await prisma.$queryRawUnsafe(
    'select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as acquired',
    `gana:discord:recommendations:${date}`,
  );
  return rows?.[0]?.acquired === true
    ? { ok: true, reason: 'publication-advisory-lock-acquired' }
    : { ok: false, reason: 'publication-advisory-lock-busy' };
}

async function inspectExistingPublicationLedger(prisma, { artifact, date, dailyBatchId }) {
  const targetRows = publicationTargetRows(artifact);
  const rows = await prisma.publicRecommendationPublication.findMany({
    where: {
      slateDate: new Date(`${date}T00:00:00.000Z`),
      channel: 'discord',
      target: 'recommendations',
    },
    select: {
      dailyBatchId: true,
      targetType: true,
      targetId: true,
      status: true,
      payloadSha256: true,
      discordMessageId: true,
      discordMessageIds: true,
    },
  });
  if (!rows.length) return { status: 'empty', reason: 'publication-ledger-empty' };

  const expectedKeys = new Set(targetRows.map(targetKey));
  const matchingBatchRows = rows.filter((row) => row.dailyBatchId === dailyBatchId);
  const foundKeys = new Set(matchingBatchRows.map(targetKey));
  const publishedMessageIds = uniqueStrings(matchingBatchRows.flatMap((row) => [
    row.discordMessageId,
    ...(Array.isArray(row.discordMessageIds) ? row.discordMessageIds : []),
  ]));
  const payloadHashes = uniqueStrings(matchingBatchRows.map((row) => row.payloadSha256));
  const exactPublished = rows.length === targetRows.length
    && matchingBatchRows.length === targetRows.length
    && expectedKeys.size === foundKeys.size
    && [...expectedKeys].every((key) => foundKeys.has(key))
    && matchingBatchRows.every((row) => row.status === 'published')
    && publishedMessageIds.length > 0
    && payloadHashes.length === 1;
  if (exactPublished) {
    return {
      status: 'already-published',
      reason: `publication-ledger-already-published:${matchingBatchRows.length}/${targetRows.length}`,
      messageIds: publishedMessageIds,
      existingRows: matchingBatchRows.length,
    };
  }
  return {
    status: 'ledger-conflict',
    reason: `publication-ledger-conflict:rows=${rows.length},matching=${matchingBatchRows.length},expected=${targetRows.length}`,
    existingRows: rows.length,
  };
}

async function reserveDiscordPublicationLedger(artifact, {
  prisma,
  artifactPath,
  dailyBatchId,
  date,
  discordTarget,
  dryRun,
  attemptId,
  mode,
  reservedAt,
}) {
  const targetRows = publicationTargetRows(artifact);
  const run = await prisma.harnessRun.findUnique({ where: { id: dailyBatchId }, select: { id: true } });
  const result = await prisma.publicRecommendationPublication.createMany({
    data: targetRows.map((row) => ({
      id: randomUUID(),
      dailyBatchId,
      runId: run?.id ?? null,
      slateDate: new Date(`${date}T00:00:00.000Z`),
      channel: 'discord',
      target: 'recommendations',
      status: 'publishing',
      targetType: row.targetType,
      targetId: row.targetId,
      predictionId: row.predictionId,
      parlayId: row.parlayId,
      discordTarget,
      discordMessageId: null,
      discordMessageIds: [],
      artifactPath,
      payloadPath: stringOrNull(dryRun.payloadPath),
      payloadSha256: stringOrNull(dryRun.payloadSha256),
      publishedAt: reservedAt,
      metadata: {
        attemptId,
        mode,
        phase: 'reserved',
        sourceManifestSha256: stringOrNull(dryRun.sourceManifestSha256),
      },
    })),
  });
  if (result.count !== targetRows.length) {
    throw new Error(`publication-ledger-reservation-count-mismatch:${result.count}/${targetRows.length}`);
  }
  return {
    ok: true,
    reason: `reserved-publication-ledger:${result.count}/${targetRows.length}`,
    reserved: result.count,
    expected: targetRows.length,
    attemptId,
    payloadPath: stringOrNull(dryRun.payloadPath),
    payloadSha256: stringOrNull(dryRun.payloadSha256),
    discordMessageIds: [],
  };
}

async function finalizeDiscordPublicationLedger(artifact, {
  prisma,
  dailyBatchId,
  notification,
  attemptId,
  mode,
  completedAt,
}) {
  const targetRows = publicationTargetRows(artifact);
  const messageIds = discordMessageIds(notification);
  const result = await prisma.publicRecommendationPublication.updateMany({
    where: {
      dailyBatchId,
      channel: 'discord',
      target: 'recommendations',
      status: 'publishing',
      OR: targetRows.map((row) => ({ targetType: row.targetType, targetId: row.targetId })),
    },
    data: {
      status: 'published',
      discordMessageId: messageIds[0] ?? null,
      discordMessageIds: messageIds,
      payloadPath: stringOrNull(notification.payloadPath),
      payloadSha256: stringOrNull(notification.payloadSha256),
      publishedAt: completedAt,
      metadata: {
        attemptId,
        mode,
        phase: 'published',
        sourceManifestSha256: stringOrNull(notification.sourceManifestSha256),
      },
    },
  });
  if (result.count !== targetRows.length) {
    throw new Error(`publication-ledger-finalize-count-mismatch:${result.count}/${targetRows.length}`);
  }
  const found = await prisma.publicRecommendationPublication.findMany({
    where: {
      dailyBatchId,
      channel: 'discord',
      target: 'recommendations',
      OR: targetRows.map((row) => ({ targetType: row.targetType, targetId: row.targetId })),
    },
    select: { targetType: true, targetId: true, status: true, discordMessageId: true, discordMessageIds: true },
  });
  const foundKeys = new Set(found.filter((row) => row.status === 'published').map(targetKey));
  const missing = targetRows.filter((row) => !foundKeys.has(targetKey(row)));
  if (missing.length) throw new Error(`missing-publication-ledger-rows:${missing.length}`);
  return {
    ok: true,
    reason: `persisted-publication-ledger:${found.length}/${targetRows.length}`,
    inserted: targetRows.length,
    expected: targetRows.length,
    discordMessageIds: messageIds,
    payloadPath: stringOrNull(notification.payloadPath),
    payloadSha256: stringOrNull(notification.payloadSha256),
  };
}

async function markPublicationUncertain(prisma, { artifact, dailyBatchId, attemptId, reason }) {
  const targetRows = publicationTargetRows(artifact);
  try {
    await prisma.publicRecommendationPublication.updateMany({
      where: {
        dailyBatchId,
        channel: 'discord',
        target: 'recommendations',
        status: 'publishing',
        OR: targetRows.map((row) => ({ targetType: row.targetType, targetId: row.targetId })),
      },
      data: {
        status: 'send-uncertain',
        metadata: { attemptId, phase: 'send-uncertain', reason },
      },
    });
  } catch {
    // A durable publishing reservation is already enough to block an automatic resend.
  }
}

function publicationTargetRows(artifact) {
  const targets = collectPublicationLedgerTargetIds(artifact);
  return [
    ...targets.parlayIds.map((id) => ({
      targetType: 'parlay',
      targetId: id,
      parlayId: uuidOrNull(id),
      predictionId: null,
    })),
    ...targets.predictionIds.map((id) => ({
      targetType: 'prediction',
      targetId: id,
      parlayId: null,
      predictionId: uuidOrNull(id),
    })),
  ];
}

function validateNotifierResult(result, {
  artifactPath,
  discordTarget,
  recommendationCount,
  expectedPayloadSha256,
  expectedPayloadCount,
  expectedSourceManifestSha256,
  phase,
  requireMessageIds = false,
}) {
  if (!result || result.ok === false) {
    return { ok: false, reason: `${phase}-notifier-failed:${result?.reason ?? 'unknown'}` };
  }
  const output = result.output ?? result;
  if (resolve(output.artifactPath ?? '') !== resolve(artifactPath)) {
    return { ok: false, reason: `${phase}-artifact-path-mismatch` };
  }
  if (output.transport !== 'discord-native' || output.gatewayTarget !== discordTarget) {
    return { ok: false, reason: `${phase}-transport-target-mismatch` };
  }
  if (output.selectionCount !== recommendationCount) {
    return { ok: false, reason: `${phase}-recommendation-count-mismatch:${output.selectionCount}/${recommendationCount}` };
  }
  if (!/^[0-9a-f]{64}$/i.test(output.payloadSha256 ?? '') || !output.payloadPath) {
    return { ok: false, reason: `${phase}-invalid-payload-proof` };
  }
  if (!Number.isInteger(output.payloadCount) || output.payloadCount < 1) {
    return { ok: false, reason: `${phase}-invalid-payload-count` };
  }
  if (Array.isArray(output.payloads) && output.payloads.length !== output.payloadCount) {
    return { ok: false, reason: `${phase}-payload-count-mismatch:${output.payloads.length}/${output.payloadCount}` };
  }
  if (expectedPayloadSha256 && output.payloadSha256 !== expectedPayloadSha256) {
    return { ok: false, reason: `${phase}-payload-sha-mismatch` };
  }
  if (expectedPayloadCount && output.payloadCount !== expectedPayloadCount) {
    return { ok: false, reason: `${phase}-payload-count-mismatch:${output.payloadCount}/${expectedPayloadCount}` };
  }
  if (expectedSourceManifestSha256 && output.sourceManifestSha256 !== expectedSourceManifestSha256) {
    return { ok: false, reason: `${phase}-source-manifest-sha-mismatch` };
  }
  if (requireMessageIds) {
    const results = Array.isArray(output.discordResults) ? output.discordResults : [];
    const resultMessageIds = results.map((item) => typeof item?.message_id === 'string' ? item.message_id.trim() : '');
    if (results.length !== output.payloadCount
      || resultMessageIds.some((messageId) => !messageId)
      || new Set(resultMessageIds).size !== output.payloadCount) {
      return { ok: false, reason: `${phase}-discord-result-count-mismatch:${resultMessageIds.filter(Boolean).length}/${output.payloadCount}` };
    }
  }
  return { ok: true, reason: `${phase}-verified`, output };
}

function runNotifierProcess({
  artifactPath,
  discordTarget,
  maxSelections,
  preparedPayloadPath,
  expectedPayloadSha256,
  expectedSourceManifestSha256,
  dryRun,
}) {
  const args = buildRecommendationNotifierArgs({
    artifactPath,
    discordTarget,
    maxSelections,
    preparedPayloadPath,
    expectedPayloadSha256,
    expectedSourceManifestSha256,
    dryRun,
  });
  const result = spawnSync('node', args, {
    cwd: resolve(new URL('../..', import.meta.url).pathname),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      reason: result.error?.message ?? `exit-${result.status ?? 'unknown'}`,
      stderr: String(result.stderr ?? '').trim(),
    };
  }
  try {
    return { ok: true, output: JSON.parse(String(result.stdout ?? '').trim()) };
  } catch {
    return { ok: false, reason: 'invalid-notifier-json' };
  }
}

export function buildRecommendationNotifierArgs({
  artifactPath,
  discordTarget,
  maxSelections,
  preparedPayloadPath,
  expectedPayloadSha256,
  expectedSourceManifestSha256,
  dryRun,
}) {
  if (!isSha256(expectedSourceManifestSha256)) throw new Error('Notifier source-manifest SHA-256 proof is required.');
  if (!dryRun && !isSha256(expectedPayloadSha256)) throw new Error('Notifier payload SHA-256 proof is required before send.');
  return [
    NOTIFIER_PATH,
    '--artifact', artifactPath,
    '--transport', 'discord-native',
    '--gateway-target', discordTarget,
    '--max', String(maxSelections),
    '--expected-source-manifest-sha256', expectedSourceManifestSha256,
    ...(dryRun
      ? ['--dry-run']
      : [
        '--prepared-payload', preparedPayloadPath,
        '--expected-payload-sha256', expectedPayloadSha256,
      ]),
  ];
}

function blocked(reason) {
  return { status: 'blocked', reason, sent: false, reserved: false };
}

function publicationUncertain(reason, details) {
  return {
    status: 'publication-uncertain',
    reason,
    sent: 'unknown',
    reserved: true,
    ...details,
  };
}

function targetKey(row) {
  return `${row.targetType}:${row.targetId}`;
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function uuidOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function safeErrorMessage(error, databaseUrl) {
  const raw = error instanceof Error ? error.message : String(error);
  return databaseUrl ? raw.replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]') : raw;
}
