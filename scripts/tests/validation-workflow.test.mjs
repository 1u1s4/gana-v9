import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { parseValidationArgs } from '../gana-validate-metrics-and-notify.mjs';
import { sha256Json } from '../lib/validation-runtime.mjs';
import { runValidationWorkflow } from '../lib/validation-workflow.mjs';

const DATE = '2026-07-11';
const TARGET = 'discord:channel:validation';
const NOW = new Date('2026-07-16T13:15:00.000Z');
const CLI = resolve(new URL('../gana-validate-metrics-and-notify.mjs', import.meta.url).pathname);

test('thin CLI parses the explicit backfill controls and rejects malformed flags', () => {
  assert.deepEqual(parseValidationArgs([
    '--date', DATE,
    '--backfill',
    '--test-label', 'Backfill historico',
    '--notify-only',
    '--validation-artifact', '/tmp/validation.json',
    '--metrics-artifact', '/tmp/metrics.json',
    '--no-recommendation-mirror',
    '--dry-run',
  ]), {
    includeRecommendationMirror: false,
    date: DATE,
    backfill: true,
    testLabel: 'Backfill historico',
    notifyOnly: true,
    validationArtifact: '/tmp/validation.json',
    metricsArtifact: '/tmp/metrics.json',
    dryRun: true,
  });
  assert.throws(() => parseValidationArgs(['--test-label']), /requires a value/);
  assert.throws(() => parseValidationArgs(['--mystery']), /Unknown argument/);
});

test('dry-run reports the exact historical action with zero writes, commands, API, or Discord', async (t) => {
  const fixture = workflowFixture(t);
  writeJson(fixture.validationLock, {
    status: 'review-required',
    validationExit: 1,
    metricsExit: 1,
    completedAt: '2026-07-12T00:00:00.000Z',
  });
  const before = readFileSync(fixture.validationLock, 'utf8');
  let commandCalls = 0;
  let prepareCalls = 0;
  let sendCalls = 0;

  const result = await runValidationWorkflow(fixture.options({
    backfill: true,
    testLabel: 'Backfill histórico · recuperación 2026-07-16',
    dryRun: true,
  }), fixture.dependencies({
    runCommand() {
      commandCalls += 1;
      throw new Error('dry-run must not execute commands');
    },
    async prepareNotification() {
      prepareCalls += 1;
      throw new Error('dry-run must not prepare a dynamic payload');
    },
    sendPayload() {
      sendCalls += 1;
      throw new Error('dry-run must not send');
    },
  }));

  assert.deepEqual([result.ok, result.status, result.reason], [
    true,
    'dry-run',
    'would-validate-metrics-notify',
  ]);
  assert.equal(result.plan.run, true);
  assert.equal(result.plan.phase, 'validation');
  assert.equal(result.plan.discordTarget, TARGET);
  assert.equal(result.plan.source.dailyBatchId, fixture.dailyBatchId);
  assert.deepEqual(result.plan.sideEffects, {
    commands: 0,
    databaseWrites: 0,
    apiRequests: 0,
    discordSends: 0,
    lockWrites: 0,
    mutexWrites: 0,
  });
  assert.equal(readFileSync(fixture.validationLock, 'utf8'), before);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
  assert.equal(existsSync(join(fixture.artifactRoot, 'cron', `validation-${DATE}.log`)), false);
  assert.equal(existsSync(join(fixture.artifactRoot, 'cron', 'prepared')), false);
  assert.deepEqual([commandCalls, prepareCalls, sendCalls], [0, 0, 0]);
});

test('no-publication dry-run plans a closeout without changing the legacy lock', async (t) => {
  const fixture = workflowFixture(t, { dailyStatus: 'retryable' });
  writeJson(fixture.validationLock, {
    status: 'published',
    validationExit: 1,
    metricsExit: 0,
    notifications: { stats: 'legacy-message' },
  });
  const before = readFileSync(fixture.validationLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({
    backfill: true,
    noPublication: true,
    testLabel: 'Cierre histórico · sin Daily publicado · 2026-07-16',
    dryRun: true,
  }), fixture.dependencies());

  assert.deepEqual([result.ok, result.status, result.reason], [
    true,
    'dry-run',
    'would-close-no-publication',
  ]);
  assert.equal(result.plan.phase, 'no-publication');
  assert.equal(result.plan.source.status, 'retryable');
  assert.equal(result.plan.source.reason, 'daily-not-published:retryable');
  assert.equal(readFileSync(fixture.validationLock, 'utf8'), before);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('notify-only dry-run reports notify as the effective phase', async (t) => {
  const fixture = workflowFixture(t);
  const result = await runValidationWorkflow(fixture.options({
    backfill: true,
    notifyOnly: true,
    validationArtifact: fixture.validationArtifact,
    metricsArtifact: fixture.metricsArtifact,
    testLabel: 'Reenvío histórico autorizado',
    dryRun: true,
  }), fixture.dependencies());

  assert.equal(result.status, 'dry-run');
  assert.equal(result.plan.action, 'notify-only');
  assert.equal(result.plan.phase, 'notify');
});

test('dry-run reports a corrupt validation lock without replacing it', async (t) => {
  const fixture = workflowFixture(t);
  writeFileSync(fixture.validationLock, '{corrupt-validation-lock\n');
  const before = readFileSync(fixture.validationLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({ dryRun: true }), fixture.dependencies());

  assert.deepEqual(
    [result.ok, result.status, result.reason, result.plan.run],
    [true, 'dry-run', 'would-skip:validation-lock-invalid', false],
  );
  assert.equal(result.plan.existing.exists, true);
  assert.equal(result.plan.existing.valid, false);
  assert.equal(typeof result.plan.existing.error, 'string');
  assert.equal(readFileSync(fixture.validationLock, 'utf8'), before);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('dry-run treats a JSON null validation lock as invalid and preserves it', async (t) => {
  const fixture = workflowFixture(t);
  writeFileSync(fixture.validationLock, 'null\n');
  const before = readFileSync(fixture.validationLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({ dryRun: true }), fixture.dependencies());

  assert.deepEqual(
    [result.ok, result.status, result.reason, result.plan.run],
    [true, 'dry-run', 'would-skip:validation-lock-invalid', false],
  );
  assert.equal(result.plan.existing.valid, false);
  assert.equal(readFileSync(fixture.validationLock, 'utf8'), before);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('no-publication dry-run blocks a corrupt Daily lock without changing it', async (t) => {
  const fixture = workflowFixture(t, { dailyStatus: 'retryable' });
  writeFileSync(fixture.dailyLock, '{corrupt-daily-lock\n');
  const before = readFileSync(fixture.dailyLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({
    backfill: true,
    noPublication: true,
    testLabel: 'Cierre histórico',
    dryRun: true,
  }), fixture.dependencies());

  assert.deepEqual(
    [result.ok, result.status, result.reason],
    [false, 'review-required', 'daily-lock-invalid'],
  );
  assert.equal(readFileSync(fixture.dailyLock, 'utf8'), before);
  assert.equal(existsSync(fixture.validationLock), false);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('no-publication dry-run rejects a status-less Daily lock', async (t) => {
  const fixture = workflowFixture(t, { dailyStatus: 'retryable' });
  writeFileSync(fixture.dailyLock, '{}\n');
  const before = readFileSync(fixture.dailyLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({
    backfill: true,
    noPublication: true,
    testLabel: 'Cierre histórico',
    dryRun: true,
  }), fixture.dependencies());

  assert.deepEqual(
    [result.ok, result.status, result.reason],
    [false, 'review-required', 'daily-lock-invalid'],
  );
  assert.equal(readFileSync(fixture.dailyLock, 'utf8'), before);
  assert.equal(existsSync(fixture.validationLock), false);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('notify-only dry-run blocks missing and wrong-date resume artifacts without side effects', async (t) => {
  await t.test('missing validation artifact', async (t) => {
    const fixture = workflowFixture(t);
    const missing = join(fixture.repoRoot, 'generated', 'missing-validation.json');
    const result = await runValidationWorkflow(fixture.options({
      notifyOnly: true,
      validationArtifact: missing,
      metricsArtifact: fixture.metricsArtifact,
      dryRun: true,
    }), fixture.dependencies());

    assert.equal(result.status, 'dry-run');
    assert.equal(result.plan.run, false);
    assert.match(result.reason, /^would-skip:resume-artifact-invalid:validation artifact is missing:/);
    assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
  });

  await t.test('wrong-date metrics artifact', async (t) => {
    const fixture = workflowFixture(t);
    writeJson(fixture.metricsArtifact, { date: '2026-07-10', metrics: [] });
    const before = readFileSync(fixture.metricsArtifact, 'utf8');
    const result = await runValidationWorkflow(fixture.options({
      notifyOnly: true,
      validationArtifact: fixture.validationArtifact,
      metricsArtifact: fixture.metricsArtifact,
      dryRun: true,
    }), fixture.dependencies());

    assert.equal(result.status, 'dry-run');
    assert.equal(result.plan.run, false);
    assert.match(result.reason, /resume-artifact-invalid:metrics artifact date mismatch/);
    assert.equal(readFileSync(fixture.metricsArtifact, 'utf8'), before);
    assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
  });
});

test('metrics-phase dry-run blocks a missing stored validation artifact', async (t) => {
  const fixture = workflowFixture(t);
  const missing = join(fixture.repoRoot, 'generated', 'missing-validation.json');
  writeJson(fixture.validationLock, {
    schemaVersion: 2,
    status: 'retryable',
    phase: 'metrics',
    retryAfter: '2026-07-16T12:00:00.000Z',
    validationExit: 0,
    artifacts: { validation: missing },
  });
  const before = readFileSync(fixture.validationLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({ dryRun: true }), fixture.dependencies());

  assert.equal(result.status, 'dry-run');
  assert.equal(result.plan.phase, 'metrics');
  assert.equal(result.plan.run, false);
  assert.match(result.reason, /resume-artifact-invalid:validation artifact is missing/);
  assert.equal(readFileSync(fixture.validationLock, 'utf8'), before);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('terminal validation dry-run reports a skip and does not reopen it', async (t) => {
  const fixture = workflowFixture(t);
  writeJson(fixture.validationLock, {
    schemaVersion: 2,
    status: 'published',
    completedAt: '2026-07-12T00:00:00.000Z',
    notifications: { messageIds: ['already-published'] },
  });
  const before = readFileSync(fixture.validationLock, 'utf8');

  const result = await runValidationWorkflow(fixture.options({ dryRun: true }), fixture.dependencies());

  assert.deepEqual(
    [result.ok, result.status, result.reason, result.plan.run],
    [true, 'dry-run', 'would-skip:terminal-published', false],
  );
  assert.equal(readFileSync(fixture.validationLock, 'utf8'), before);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('no-publication cannot close a published Daily whose canonical artifact is broken', async (t) => {
  const fixture = workflowFixture(t);
  rmSync(fixture.recommendationArtifact);
  const result = await runValidationWorkflow(fixture.options({
    backfill: true,
    noPublication: true,
    testLabel: 'Cierre histórico',
    dryRun: true,
  }), fixture.dependencies());

  assert.deepEqual([result.ok, result.status, result.reason], [
    false,
    'review-required',
    'daily-was-published',
  ]);
  assert.equal(existsSync(fixture.validationLock), false);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('CLI dry-run never invokes direct Telegram delivery even when globally enabled', (t) => {
  const fixture = workflowFixture(t);
  const marker = join(fixture.repoRoot, 'gateway-invoked');
  const fakePython = join(fixture.repoRoot, 'fake-python.mjs');
  writeFileSync(fakePython, [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync(${JSON.stringify(marker)}, 'invoked\\n');`,
    "console.log(JSON.stringify({ success: true }));",
  ].join('\n'));
  chmodSync(fakePython, 0o755);

  const result = spawnSync(process.execPath, [
    CLI,
    '--date', DATE,
    '--backfill',
    '--test-label', 'Backfill histórico',
    '--dry-run',
  ], {
    cwd: fixture.repoRoot,
    env: {
      ...process.env,
      GANA_ARTIFACT_ROOT: fixture.artifactRoot,
      GANA_CRON_DIRECT_TELEGRAM: 'true',
      HERMES_GATEWAY_PYTHON: fakePython,
      GANA_MAINTENANCE_PAUSED: 'false',
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Estado: dry-run/);
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(`${fixture.validationLock}.mutex`), false);
});

test('CLI dry-run rejects an impossible date locally without Telegram, lock, or mutex effects', (t) => {
  const fixture = workflowFixture(t);
  const marker = join(fixture.repoRoot, 'gateway-invoked-invalid-date');
  const fakePython = join(fixture.repoRoot, 'fake-python-invalid-date.mjs');
  writeFileSync(fakePython, [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    `writeFileSync(${JSON.stringify(marker)}, 'invoked\\n');`,
    "console.log(JSON.stringify({ success: true }));",
  ].join('\n'));
  chmodSync(fakePython, 0o755);
  const invalidLock = join(fixture.artifactRoot, 'cron', 'locks', 'validation-2026-02-30.lock');

  const result = spawnSync(process.execPath, [
    CLI,
    '--date', '2026-02-30',
    '--dry-run',
  ], {
    cwd: fixture.repoRoot,
    env: {
      ...process.env,
      GANA_ARTIFACT_ROOT: fixture.artifactRoot,
      GANA_CRON_DIRECT_TELEGRAM: 'true',
      HERMES_GATEWAY_PYTHON: fakePython,
      GANA_MAINTENANCE_PAUSED: 'false',
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /valid calendar date/);
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(invalidLock), false);
  assert.equal(existsSync(`${invalidLock}.mutex`), false);
});

test('unsafe force and an unlabelled backfill are rejected before any side effect', async (t) => {
  const fixture = workflowFixture(t);
  let commandCalls = 0;
  let sendCalls = 0;
  const dependencies = fixture.dependencies({
    runCommand() {
      commandCalls += 1;
      throw new Error('must not run');
    },
    sendPayload() {
      sendCalls += 1;
      throw new Error('must not send');
    },
  });

  const forced = await runValidationWorkflow(fixture.options({ force: true }), dependencies);
  const unlabelled = await runValidationWorkflow(fixture.options({ backfill: true }), dependencies);

  assert.deepEqual(
    [forced.ok, forced.status, forced.reason],
    [false, 'review-required', 'unsafe-force-removed'],
  );
  assert.deepEqual(
    [unlabelled.ok, unlabelled.status, unlabelled.reason],
    [false, 'review-required', 'backfill-label-required'],
  );
  assert.equal(commandCalls, 0);
  assert.equal(sendCalls, 0);
});

test('workflow blocks an unpublished Daily without commands or Discord sends', async (t) => {
  const fixture = workflowFixture(t, { dailyStatus: 'retryable' });
  let commandCalls = 0;
  let sendCalls = 0;

  const result = await runValidationWorkflow(fixture.options(), fixture.dependencies({
    runCommand() {
      commandCalls += 1;
      throw new Error('must not run');
    },
    sendPayload() {
      sendCalls += 1;
      throw new Error('must not send');
    },
  }));

  assert.deepEqual(
    [result.ok, result.status, result.reason],
    [true, 'skipped', 'daily-not-published:retryable'],
  );
  assert.equal(commandCalls, 0);
  assert.equal(sendCalls, 0);
});

test('the workflow mutex prevents a concurrent send for the same validation date', async (t) => {
  const fixture = workflowFixture(t);
  let releasePreparation;
  let preparationStarted;
  const preparationGate = new Promise((resolve) => { releasePreparation = resolve; });
  const preparationEntered = new Promise((resolve) => { preparationStarted = resolve; });
  let sends = 0;
  const dependencies = fixture.dependencies({
    pid: 4242,
    isProcessAlive: () => true,
    async prepareNotification() {
      preparationStarted();
      await preparationGate;
      return { payload: { kind: 'stats' }, mirrorPayloads: [] };
    },
    sendPayload() {
      sends += 1;
      return { message_id: `message-${sends}` };
    },
  });
  const options = fixture.options({
    notifyOnly: true,
    validationArtifact: fixture.validationArtifact,
    metricsArtifact: fixture.metricsArtifact,
  });

  const firstPromise = runValidationWorkflow(options, dependencies);
  await preparationEntered;
  const second = await runValidationWorkflow(options, dependencies);
  releasePreparation();
  const first = await firstPromise;

  assert.deepEqual([first.ok, first.status], [true, 'published']);
  assert.deepEqual(
    [second.ok, second.status, second.reason],
    [true, 'skipped', 'validation-already-running'],
  );
  assert.equal(sends, 1);
});

test('published validation skips normally and a labelled backfill reopens it', async (t) => {
  const fixture = workflowFixture(t);
  writeJson(fixture.validationLock, {
    schemaVersion: 2,
    status: 'published',
    attempt: 3,
    completedAt: '2026-07-12T00:00:00.000Z',
    notifications: { messageIds: ['old-stats', 'old-mirror'] },
  });
  let sends = 0;
  const dependencies = fixture.dependencies({
    sendPayload() {
      sends += 1;
      return { message_id: `backfill-${sends}` };
    },
  });
  const notifyOnly = {
    notifyOnly: true,
    validationArtifact: fixture.validationArtifact,
    metricsArtifact: fixture.metricsArtifact,
  };

  const normal = await runValidationWorkflow(fixture.options(notifyOnly), dependencies);
  const backfill = await runValidationWorkflow(fixture.options({
    ...notifyOnly,
    backfill: true,
    testLabel: 'Backfill historico 16/07/2026',
  }), dependencies);

  assert.deepEqual(
    [normal.ok, normal.status, normal.reason],
    [true, 'skipped', 'terminal-published'],
  );
  assert.deepEqual([backfill.ok, backfill.status], [true, 'published']);
  assert.equal(backfill.lock.mode, 'backfill');
  assert.equal(backfill.lock.attempt, 4);
  assert.equal(backfill.lock.previous.status, 'published');
  assert.equal(backfill.lock.testLabel, 'Backfill historico 16/07/2026');
  assert.equal(sends, 3);
});

test('successful injected workflow records canonical source, artifact hashes, target, and every Discord id', async (t) => {
  const fixture = workflowFixture(t);
  const commandArgs = [];
  const payloads = [
    { username: 'Gana Hermes', embeds: [{ title: 'stats' }] },
    { username: 'Gana Hermes', embeds: [{ title: 'mirror 1' }] },
    { username: 'Gana Hermes', embeds: [{ title: 'mirror 2' }] },
  ];
  const ids = ['stats-id', 'mirror-1-id', 'mirror-2-id'];
  const result = await runValidationWorkflow(fixture.options(), fixture.dependencies({
    runCommand({ args }) {
      commandArgs.push(args);
      if (args[1] === 'validate') {
        return { status: 0, stdout: `artifact: ${fixture.validationArtifact}\n` };
      }
      return { status: 0, stdout: `artifact: ${fixture.metricsArtifact}\n` };
    },
    async prepareNotification(options) {
      assert.equal(options.recommendationArtifact, fixture.recommendationArtifact);
      assert.equal(options.validationArtifact, fixture.validationArtifact);
      assert.equal(options.metricsArtifact, fixture.metricsArtifact);
      assert.equal(options.gatewayTarget, TARGET);
      return { payload: payloads[0], mirrorPayloads: payloads.slice(1) };
    },
    sendPayload(target, payload) {
      assert.equal(target, TARGET);
      assert.deepEqual(payload, payloads.shift());
      return { message_id: ids[commandArgs.length + (3 - payloads.length) - 3] };
    },
  }));

  assert.deepEqual([result.ok, result.status], [true, 'published']);
  assert.equal(commandArgs.length, 2);
  assert.equal(commandArgs[0][1], 'validate');
  assert.equal(commandArgs[1][1], 'metrics');
  assert.equal(result.lock.discordTarget, TARGET);
  assert.equal(result.lock.source.dailyBatchId, fixture.dailyBatchId);
  assert.equal(result.lock.source.recommendationArtifact, fixture.recommendationArtifact);
  assert.deepEqual(result.lock.artifacts, {
    recommendation: fixture.recommendationArtifact,
    validation: fixture.validationArtifact,
    metrics: fixture.metricsArtifact,
  });
  assert.match(result.lock.payloadSetSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.lock.notifications.messageIds, ids);
  assert.equal(result.lock.notifications.stats, ids[0]);
  assert.deepEqual(result.lock.notifications.mirrors, ids.slice(1));
  assert.deepEqual(
    result.lock.notifications.entries.map(({ status, messageId, payloadSha256 }) => ({
      status,
      messageId,
      payloadSha256,
    })),
    ids.map((messageId, index) => ({
      status: 'sent',
      messageId,
      payloadSha256: sha256Json([
        { username: 'Gana Hermes', embeds: [{ title: 'stats' }] },
        { username: 'Gana Hermes', embeds: [{ title: 'mirror 1' }] },
        { username: 'Gana Hermes', embeds: [{ title: 'mirror 2' }] },
      ][index]),
    })),
  );
  const prepared = readJson(result.lock.preparedPath);
  assert.equal(prepared.target, TARGET);
  assert.equal(prepared.payloads.length, 3);
});

test('partial Discord delivery becomes publication-uncertain and every retry sends zero messages', async (t) => {
  const fixture = workflowFixture(t);
  let sendAttempts = 0;
  const options = fixture.options({
    notifyOnly: true,
    validationArtifact: fixture.validationArtifact,
    metricsArtifact: fixture.metricsArtifact,
  });
  const dependencies = fixture.dependencies({
    async prepareNotification() {
      return {
        payload: { kind: 'stats' },
        mirrorPayloads: [{ kind: 'mirror-1' }, { kind: 'mirror-2' }],
      };
    },
    sendPayload() {
      sendAttempts += 1;
      if (sendAttempts === 2) throw new Error('gateway timeout after possible delivery');
      return { message_id: `message-${sendAttempts}` };
    },
  });

  const first = await runValidationWorkflow(options, dependencies);
  const attemptsAfterFailure = sendAttempts;
  const retry = await runValidationWorkflow({
    ...options,
    backfill: true,
    testLabel: 'Reintento historico',
  }, dependencies);

  assert.deepEqual(
    [first.ok, first.status, first.reason],
    [false, 'publication-uncertain', 'publication-uncertain'],
  );
  assert.equal(first.lock.notifications.stats, 'message-1');
  assert.deepEqual(first.lock.notifications.messageIds, ['message-1']);
  assert.deepEqual(
    [retry.ok, retry.status, retry.reason],
    [true, 'skipped', 'unsafe-terminal-publication-uncertain'],
  );
  assert.equal(sendAttempts, attemptsAfterFailure);
});

test('validation nonzero never prepares or sends and records retryable versus review-required', async (t) => {
  await t.test('no usable validation artifact is retryable', async (t) => {
    const fixture = workflowFixture(t);
    let prepareCalls = 0;
    let sendCalls = 0;
    const commandKinds = [];
    const result = await runValidationWorkflow(fixture.options(), fixture.dependencies({
      runCommand({ args }) {
        commandKinds.push(args[1]);
        return { status: 75, stdout: 'quota exceeded\n' };
      },
      async prepareNotification() {
        prepareCalls += 1;
        throw new Error('must not prepare');
      },
      sendPayload() {
        sendCalls += 1;
        throw new Error('must not send');
      },
    }));

    assert.deepEqual(
      [result.ok, result.status, result.reason],
      [false, 'review-required', 'retryable'],
    );
    assert.equal(result.lock.status, 'retryable');
    assert.equal(result.lock.validationExit, 75);
    assert.match(result.lock.retryAfter, /^2026-/);
    assert.equal(prepareCalls, 0);
    assert.equal(sendCalls, 0);

    writeJson(result.lockPath, { ...result.lock, retryAfter: '2020-01-01T00:00:00.000Z' });
    const retry = await runValidationWorkflow(fixture.options(), fixture.dependencies({
      runCommand({ args }) {
        commandKinds.push(args[1]);
        return { status: 75, stdout: 'quota still exceeded\n' };
      },
      async prepareNotification() {
        prepareCalls += 1;
        throw new Error('must not prepare');
      },
      sendPayload() {
        sendCalls += 1;
        throw new Error('must not send');
      },
    }));
    assert.equal(retry.lock.status, 'retryable');
    assert.deepEqual(commandKinds, ['validate', 'validate']);
    assert.equal(prepareCalls, 0);
    assert.equal(sendCalls, 0);
  });

  await t.test('a nonzero run with substantive validations requires review', async (t) => {
    const fixture = workflowFixture(t, { validationEntries: [{ fixtureId: 'fixture-1', status: 'settled' }] });
    let sendCalls = 0;
    let commandCalls = 0;
    const result = await runValidationWorkflow(fixture.options(), fixture.dependencies({
      runCommand() {
        commandCalls += 1;
        return { status: 2, stdout: `artifact: ${fixture.validationArtifact}\n` };
      },
      sendPayload() {
        sendCalls += 1;
        throw new Error('must not send');
      },
    }));

    assert.deepEqual(
      [result.ok, result.status, result.reason],
      [false, 'review-required', 'review-required'],
    );
    assert.equal(result.lock.status, 'review-required');
    assert.equal(result.lock.validationExit, 2);
    assert.equal(result.lock.retryAfter, undefined);
    assert.equal(sendCalls, 0);

    const retry = await runValidationWorkflow(fixture.options(), fixture.dependencies({
      runCommand() {
        commandCalls += 1;
        throw new Error('manual review must not auto-run');
      },
      sendPayload() {
        sendCalls += 1;
        throw new Error('manual review must not send');
      },
    }));
    assert.deepEqual(
      [retry.ok, retry.status, retry.reason],
      [true, 'skipped', 'review-required-manual'],
    );
    assert.equal(commandCalls, 1);
    assert.equal(sendCalls, 0);
  });
});

function workflowFixture(t, {
  date = DATE,
  dailyStatus = 'published',
  dailyBatchId = `daily-${date}-sol-high`,
  validationEntries = [],
} = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'gana-validation-workflow-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const artifactRoot = join(repoRoot, 'artifacts');
  const recommendationArtifact = join(
    artifactRoot,
    'runs',
    dailyBatchId,
    'daily-parlay-recommendations.json',
  );
  const validationArtifact = join(repoRoot, 'generated', 'validation.json');
  const metricsArtifact = join(repoRoot, 'generated', 'metrics.json');
  const validationLock = join(artifactRoot, 'cron', 'locks', `validation-${date}.lock`);
  const dailyLock = join(artifactRoot, 'cron', 'locks', `daily-e2e-${date}.lock`);
  writeJson(recommendationArtifact, {
    date,
    dailyBatchId,
    parlays: [],
    atomicPredictions: [],
  });
  writeJson(dailyLock, {
    status: dailyStatus,
    date,
    dailyBatchId,
  });
  writeJson(validationArtifact, { target: { date }, validations: validationEntries });
  writeJson(metricsArtifact, { date, metrics: [] });

  return {
    repoRoot,
    artifactRoot,
    dailyBatchId,
    recommendationArtifact,
    validationArtifact,
    metricsArtifact,
    validationLock,
    dailyLock,
    options(overrides = {}) {
      return { repoRoot, artifactRoot, date, ...overrides };
    },
    dependencies(overrides = {}) {
      return {
        now: NOW,
        pid: 4242,
        isProcessAlive: () => false,
        resolveTargets: () => ({ validation: TARGET }),
        runCommand({ args }) {
          if (args[1] === 'validate') {
            return { status: 0, stdout: `artifact: ${validationArtifact}\n` };
          }
          return { status: 0, stdout: `artifact: ${metricsArtifact}\n` };
        },
        async prepareNotification() {
          return {
            payload: { username: 'Gana Hermes', embeds: [{ title: 'stats' }] },
            mirrorPayloads: [
              { username: 'Gana Hermes', embeds: [{ title: 'mirror 1' }] },
              { username: 'Gana Hermes', embeds: [{ title: 'mirror 2' }] },
            ],
          };
        },
        sendPayload(_target, _payload) {
          return { message_id: 'default-message-id' };
        },
        ...overrides,
      };
    },
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
