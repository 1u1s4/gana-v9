import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  acquireValidationMutex,
  assertExplicitCanonicalRecommendation,
  classifyValidationState,
  inspectValidationMutex,
  releaseValidationMutex,
  resolveCanonicalPublishedRecommendation,
} from '../lib/validation-runtime.mjs';

const DATE = '2026-07-11';

test('canonical recommendation is selected from the published Daily lock, not a newer artifact', (t) => {
  const fixture = validationFixture(t, {
    date: DATE,
    dailyBatchId: `daily-${DATE}-sol-high`,
  });
  const newerPath = join(
    fixture.artifactRoot,
    'runs',
    `daily-${DATE}-norway-fix`,
    'daily-parlay-recommendations.json',
  );
  writeJson(newerPath, {
    date: DATE,
    dailyBatchId: `daily-${DATE}-norway-fix`,
    generatedAt: '2099-01-01T00:00:00.000Z',
  });

  const canonical = resolveCanonicalPublishedRecommendation({
    artifactRoot: fixture.artifactRoot,
    date: DATE,
  });

  assert.equal(canonical.ok, true);
  assert.equal(canonical.dailyBatchId, `daily-${DATE}-sol-high`);
  assert.equal(canonical.recommendationArtifact, fixture.recommendationArtifact);
  assert.throws(
    () => assertExplicitCanonicalRecommendation(newerPath, canonical),
    /not the published Daily artifact/,
  );
});

test('an unpublished Daily is blocked even when its recommendation artifact exists', async (t) => {
  const fixture = validationFixture(t, {
    date: DATE,
    dailyBatchId: `daily-${DATE}-full`,
    dailyStatus: 'retryable',
  });
  const canonical = resolveCanonicalPublishedRecommendation({
    artifactRoot: fixture.artifactRoot,
    date: DATE,
  });

  assert.equal(canonical.ok, false);
  assert.equal(canonical.reason, 'daily-not-published:retryable');
  assert.equal(canonical.dailyLock.status, 'retryable');
});

test('a corrupt Daily lock is distinct from a missing Daily lock', (t) => {
  const fixture = validationFixture(t, {
    date: DATE,
    dailyBatchId: `daily-${DATE}-full`,
  });
  const dailyLock = join(fixture.artifactRoot, 'cron', 'locks', `daily-e2e-${DATE}.lock`);
  writeFileSync(dailyLock, '{not-json\n');

  const canonical = resolveCanonicalPublishedRecommendation({
    artifactRoot: fixture.artifactRoot,
    date: DATE,
  });

  assert.equal(canonical.ok, false);
  assert.equal(canonical.reason, 'daily-lock-invalid');
  assert.equal(canonical.dailyState.exists, true);
  assert.equal(canonical.dailyState.valid, false);
});

test('non-object and status-less Daily locks fail closed as invalid', (t) => {
  const fixture = validationFixture(t, {
    date: DATE,
    dailyBatchId: `daily-${DATE}-full`,
  });
  const dailyLock = join(fixture.artifactRoot, 'cron', 'locks', `daily-e2e-${DATE}.lock`);

  for (const value of ['null\n', '[]\n', '{}\n']) {
    writeFileSync(dailyLock, value);
    const canonical = resolveCanonicalPublishedRecommendation({
      artifactRoot: fixture.artifactRoot,
      date: DATE,
    });
    assert.equal(canonical.ok, false);
    assert.equal(canonical.reason, 'daily-lock-invalid');
  }
});

test('canonical resolution rejects impossible calendar dates', (t) => {
  const fixture = validationFixture(t, {
    date: DATE,
    dailyBatchId: `daily-${DATE}-full`,
  });

  assert.throws(
    () => resolveCanonicalPublishedRecommendation({
      artifactRoot: fixture.artifactRoot,
      date: '2026-02-30',
    }),
    /valid calendar date/,
  );
});

test('validation mutex excludes a concurrent owner and releases only its own token', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gana-validation-mutex-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lockPath = join(root, 'cron', 'locks', `validation-${DATE}.lock`);
  const now = new Date('2026-07-16T13:15:00.000Z');

  const first = acquireValidationMutex(lockPath, {
    now,
    pid: 4242,
    token: 'owner-a',
    isProcessAlive: () => true,
  });
  const second = acquireValidationMutex(lockPath, {
    now,
    pid: 4343,
    token: 'owner-b',
    isProcessAlive: (pid) => pid === 4242,
  });

  assert.equal(first.acquired, true);
  assert.deepEqual(
    { acquired: second.acquired, reason: second.reason, ownerPid: second.owner?.pid },
    { acquired: false, reason: 'validation-already-running', ownerPid: 4242 },
  );
  assert.equal(releaseValidationMutex({ ...first, token: 'not-the-owner' }), false);
  assert.equal(releaseValidationMutex(first), true);
  assert.equal(releaseValidationMutex(first), false);
});

test('mutex inspection is read-only for both live and dead owners', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gana-validation-mutex-preview-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lockPath = join(root, 'cron', 'locks', `validation-${DATE}.lock`);
  const mutexPath = `${lockPath}.mutex`;
  const ownerPath = join(mutexPath, 'owner.json');
  writeJson(ownerPath, {
    schemaVersion: 1,
    token: 'preview-owner',
    pid: 4242,
    startedAt: '2026-07-16T12:00:00.000Z',
  });
  const before = readFileSync(ownerPath, 'utf8');
  const now = new Date('2026-07-16T13:15:00.000Z');

  const live = inspectValidationMutex(lockPath, {
    now,
    isProcessAlive: (pid) => pid === 4242,
  });
  const dead = inspectValidationMutex(lockPath, {
    now,
    isProcessAlive: () => false,
  });

  assert.deepEqual(
    [live.wouldAcquire, live.wouldReclaim, live.reason],
    [false, false, 'validation-already-running'],
  );
  assert.deepEqual(
    [dead.wouldAcquire, dead.wouldReclaim, dead.reason],
    [true, true, 'validation-owner-dead'],
  );
  assert.equal(readFileSync(ownerPath, 'utf8'), before);
});

test('published validation is terminal normally but explicit backfill reopens it', () => {
  const published = {
    status: 'published',
    completedAt: '2026-07-02T14:00:00.000Z',
    notifications: { messageIds: ['discord-old'] },
  };

  assert.deepEqual(
    classifyValidationState(published, { now: new Date('2026-07-16T13:15:00.000Z') }),
    { run: false, reason: 'terminal-published' },
  );
  assert.deepEqual(
    classifyValidationState(published, {
      now: new Date('2026-07-16T13:15:00.000Z'),
      backfill: true,
    }),
    { run: true, phase: 'validation', mode: 'backfill' },
  );
});

test('failed validation artifacts never advance a retry directly to metrics or notification', () => {
  const retryable = {
    schemaVersion: 2,
    status: 'retryable',
    phase: 'validation',
    validationExit: 75,
    retryAfter: '2026-07-16T12:00:00.000Z',
    artifacts: {
      validation: '/tmp/validations-blocked.json',
      metrics: '/tmp/stale-metrics.json',
    },
  };
  assert.deepEqual(
    classifyValidationState(retryable, { now: new Date('2026-07-16T13:15:00.000Z') }),
    { run: true, phase: 'validation', mode: 'retry' },
  );

  const reviewRequired = {
    ...retryable,
    status: 'review-required',
    retryAfter: undefined,
  };
  assert.deepEqual(
    classifyValidationState(reviewRequired, { now: new Date('2026-07-16T13:15:00.000Z') }),
    { run: false, reason: 'review-required-manual' },
  );
  assert.deepEqual(
    classifyValidationState({
      status: 'review-required',
      validationExit: 1,
      artifacts: ['/tmp/legacy-validation.log'],
    }),
    { run: true, phase: 'validation', mode: 'legacy-retry' },
  );
});

function validationFixture(t, {
  date,
  dailyBatchId,
  dailyStatus = 'published',
}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'gana-validation-runtime-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const artifactRoot = join(repoRoot, 'artifacts');
  const recommendationArtifact = join(
    artifactRoot,
    'runs',
    dailyBatchId,
    'daily-parlay-recommendations.json',
  );
  writeJson(recommendationArtifact, { date, dailyBatchId, parlays: [], atomicPredictions: [] });
  writeJson(join(artifactRoot, 'cron', 'locks', `daily-e2e-${date}.lock`), {
    status: dailyStatus,
    date,
    dailyBatchId,
  });
  return { repoRoot, artifactRoot, recommendationArtifact };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
