import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  DAILY_TERMINAL_STATUSES,
  dailyOpsPaths,
  guatemalaClock,
  planDailyOps,
  runDailyOpsDispatch,
} from '../lib/daily-ops-dispatch.mjs';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const CLI = resolve(REPO_ROOT, 'scripts/gana-daily-ops-dispatch.mjs');

const AT = Object.freeze({
  beforeMorning: new Date('2026-07-15T13:14:00.000Z'),
  morning: new Date('2026-07-15T13:15:00.000Z'),
  daily: new Date('2026-07-15T16:15:00.000Z'),
  strategy: new Date('2026-07-15T19:15:00.000Z'),
  recovery1: new Date('2026-07-16T00:15:00.000Z'),
  recovery2: new Date('2026-07-16T04:15:00.000Z'),
});

const ROLLOVER_AT = Object.freeze({
  afterMidnight: new Date('2026-07-16T06:18:00.000Z'),
  morning: new Date('2026-07-16T13:15:00.000Z'),
  daily: new Date('2026-07-16T16:15:00.000Z'),
});

const ROLLOVER_RETRY_AFTER = '2026-07-16T06:17:08.501Z';

test('Guatemala clock exposes the five exact checkpoints and preserves the local date', () => {
  const expected = [
    [AT.morning, 'morning', '07:15'],
    [AT.daily, 'daily', '10:15'],
    [AT.strategy, 'strategy', '13:15'],
    [AT.recovery1, 'recovery-1', '18:15'],
    [AT.recovery2, 'recovery-2', '22:15'],
  ];
  for (const [instant, id, wallClock] of expected) {
    const clock = guatemalaClock(instant);
    assert.equal(clock.date, '2026-07-15');
    assert.deepEqual(clock.checkpoint, { id, wallClock });
  }
  assert.equal(guatemalaClock(AT.beforeMorning).checkpoint, null);
});

test('07:15 enables independent morning work and a late wake also catches up Daily', () => {
  withArtifacts((artifactRoot) => {
    publishDailyForDate(artifactRoot, '2026-07-14');
    const before = planDailyOps({ now: AT.beforeMorning, artifactRoot });
    assert.deepEqual(before.morning.map((item) => item.run), [false, false]);
    assert.equal(before.heavy, null);

    const morning = planDailyOps({ now: AT.morning, artifactRoot });
    assert.deepEqual(morning.morning.map((item) => item.run), [true, true]);
    assert.equal(morning.heavy, null);

    const late = planDailyOps({ now: new Date('2026-07-15T19:40:00.000Z'), artifactRoot });
    assert.deepEqual(late.morning.map((item) => item.run), [true, true]);
    assert.equal(late.heavy?.flow, 'daily');
    assert.equal(late.heavy?.mode, 'initial');
    assert.equal(late.heavy?.targetDate, '2026-07-16');
  });
});

test('validation catch-up scans 14 prior dates by default and keeps blocked Daily dates visible', () => {
  withArtifacts((artifactRoot) => {
    const plan = planDailyOps({ now: AT.morning, artifactRoot });
    assert.deepEqual(plan.validationCatchup, { from: '2026-07-01', to: '2026-07-14' });
    assert.equal(plan.validationBacklog.length, 14);
    assert.deepEqual(
      [plan.validationBacklog[0].date, plan.validationBacklog.at(-1).date],
      ['2026-07-01', '2026-07-14'],
    );
    assert.equal(plan.validationBacklog.at(-1).reason, 'daily-lock-missing');
    assert.equal(plan.morning[1].run, false);
    assert.equal(plan.morning[1].reason, 'validation-backlog-no-runnable');
  });
});

test('validation catch-up prioritizes yesterday, then the oldest runnable historical date', () => {
  withArtifacts((artifactRoot) => {
    const yesterdayArtifact = publishDailyForDate(artifactRoot, '2026-07-14');
    const oldestArtifact = publishDailyForDate(artifactRoot, '2026-07-03', 'daily-2026-07-03-recovered');
    const options = {
      now: AT.morning,
      artifactRoot,
      validationCatchupFrom: '2026-07-02',
    };

    let plan = planDailyOps(options);
    assert.equal(plan.morning[1].targetDate, '2026-07-14');
    assert.equal(plan.morning[1].recommendationArtifact, yesterdayArtifact);

    publishValidationForDate(artifactRoot, '2026-07-14', yesterdayArtifact);
    plan = planDailyOps(options);
    assert.equal(plan.morning[1].targetDate, '2026-07-03');
    assert.equal(plan.morning[1].recommendationArtifact, oldestArtifact);

    writeJson(pathsFor(artifactRoot).retentionMarker, { status: 'completed' });
    const calls = [];
    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.morning,
      env: { GANA_VALIDATION_CATCHUP_FROM: '2026-07-02' },
      execute(action, childEnv) {
        calls.push({ action, childEnv });
        return { status: 0, stdout: '{}' };
      },
    });
    assert.equal(summary.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action.flow, 'validation');
    assert.equal(calls[0].action.targetDate, '2026-07-03');
    assert.equal(calls[0].action.recommendationArtifact, oldestArtifact);
    assert.equal(calls[0].childEnv.GANA_VALIDATION_DATE, '2026-07-03');
    assert.equal(calls[0].childEnv.GANA_VALIDATION_RECOMMENDATION_ARTIFACT, oldestArtifact);
  });
});

test('validation catch-up only trusts a published Daily lock and its canonical exact artifact', () => {
  withArtifacts((artifactRoot) => {
    const date = '2026-07-14';
    const dailyBatchId = `daily-${date}-full`;
    const dailyLock = join(artifactRoot, 'cron', 'locks', `daily-e2e-${date}.lock`);
    const artifact = join(artifactRoot, 'runs', dailyBatchId, 'daily-parlay-recommendations.json');
    const options = { now: AT.morning, artifactRoot, validationCatchupFrom: date };

    writeJson(dailyLock, { date, dailyBatchId, status: 'retryable' });
    writeJson(artifact, { date, dailyBatchId, recommendations: [] });
    let plan = planDailyOps(options);
    assert.equal(plan.morning[1].run, false);
    assert.equal(plan.validationBacklog[0].reason, 'daily-not-published-retryable');
    assert.equal(plan.validationBacklog[0].dailyStatus, 'retryable');

    writeJson(dailyLock, { date, dailyBatchId, status: 'published' });
    rmSync(artifact);
    plan = planDailyOps(options);
    assert.equal(plan.validationBacklog[0].reason, 'canonical-recommendation-artifact-missing');

    writeJson(artifact, { date: '2026-07-13', dailyBatchId, recommendations: [] });
    plan = planDailyOps(options);
    assert.equal(plan.validationBacklog[0].reason, 'canonical-recommendation-artifact-misaligned');

    writeJson(artifact, { date, dailyBatchId, recommendations: [] });
    plan = planDailyOps(options);
    assert.equal(plan.morning[1].run, true);
    assert.equal(plan.morning[1].recommendationArtifact, artifact);
  });
});

test('an exact not-applicable closeout is terminal only while Daily was not published', () => {
  withArtifacts((artifactRoot) => {
    const date = '2026-07-14';
    const dailyBatchId = `daily-${date}-full`;
    const dailyLock = join(artifactRoot, 'cron', 'locks', `daily-e2e-${date}.lock`);
    const validationLock = join(artifactRoot, 'cron', 'locks', `validation-${date}.lock`);
    const options = { now: AT.morning, artifactRoot, validationCatchupFrom: date };
    writeJson(dailyLock, { date, dailyBatchId, status: 'retryable' });
    writeJson(validationLock, {
      schemaVersion: 2,
      date,
      status: 'not-applicable',
      source: { dailyLock, dailyStatus: 'retryable' },
      notifications: { messageIds: ['1527426926120271984'] },
    });

    let plan = planDailyOps(options);
    assert.deepEqual(plan.validationBacklog, []);
    assert.equal(plan.morning[1].reason, 'validation-backlog-empty');

    publishDailyForDate(artifactRoot, date, dailyBatchId);
    plan = planDailyOps(options);
    assert.equal(plan.morning[1].run, false);
    assert.equal(plan.validationBacklog[0].reason, 'not-applicable-validation-misaligned');
  });
});

test('validation lock states distinguish safe retries from uncertain publications', () => {
  withArtifacts((artifactRoot) => {
    const date = '2026-07-14';
    const artifact = publishDailyForDate(artifactRoot, date);
    const lock = join(artifactRoot, 'cron', 'locks', `validation-${date}.lock`);
    const options = { now: AT.morning, artifactRoot, validationCatchupFrom: date };
    const validationAction = () => planDailyOps(options).morning[1];
    const backlog = () => planDailyOps(options).validationBacklog;

    assert.equal(validationAction().reason, 'validation-lock-missing');

    writeJson(lock, {
      date,
      status: 'review-required',
      validationExit: 1,
      metricsExit: 1,
      notifications: { alerts: 'discord:1510041125614915756' },
    });
    assert.equal(validationAction().reason, 'legacy-review-required-without-notifications');

    writeJson(lock, {
      schemaVersion: 2,
      date,
      status: 'review-required',
      validationExit: 1,
      metricsExit: null,
      notifications: { messageIds: [] },
    });
    assert.equal(validationAction().run, false);
    assert.equal(backlog()[0].reason, 'review-required-manual');

    writeJson(lock, {
      date,
      status: 'review-required',
      notifications: { stats: '1527426926120271984' },
    });
    assert.equal(validationAction().run, false);
    assert.equal(backlog()[0].reason, 'review-required-notification-uncertain');

    writeJson(lock, {
      date,
      status: 'retryable',
      retryAfter: '2026-07-15T13:14:00.000Z',
    });
    assert.equal(validationAction().reason, 'validation-retryable-due');

    writeJson(lock, {
      date,
      status: 'retryable',
      retryAfter: '2026-07-15T13:16:00.000Z',
    });
    assert.equal(validationAction().run, false);
    assert.equal(backlog()[0].reason, 'validation-retryable-not-due');

    for (const status of ['running-validation', 'running-metrics']) {
      writeJson(lock, { date, status });
      const staleAt = new Date(AT.morning.getTime() - (21 * 60 * 60 * 1000));
      utimesSync(lock, staleAt, staleAt);
      assert.equal(validationAction().reason, 'stale-running-lock-delegated-to-wrapper', status);
      const recentAt = new Date(AT.morning.getTime() - (60 * 60 * 1000));
      utimesSync(lock, recentAt, recentAt);
      assert.equal(validationAction().run, false, status);
      assert.equal(backlog()[0].reason, 'validation-running', status);
    }

    for (const status of ['publishing', 'publication-uncertain']) {
      writeJson(lock, { date, status });
      assert.equal(validationAction().run, false, status);
      assert.equal(backlog()[0].reason, `validation-${status}`, status);
    }

    publishValidationForDate(artifactRoot, date, join(artifactRoot, 'runs', 'wrong', 'daily-parlay-recommendations.json'));
    assert.equal(validationAction().run, false);
    assert.equal(backlog()[0].reason, 'published-validation-misaligned');

    publishValidationForDate(artifactRoot, date, artifact);
    assert.equal(validationAction().run, false);
    assert.equal(validationAction().reason, 'validation-backlog-empty');
    assert.deepEqual(backlog(), []);

    writeJson(lock, {
      schemaVersion: 2,
      date,
      status: 'published',
      validationExit: 0,
      metricsExit: 0,
      source: {
        dailyBatchId: `daily-${date}-full`,
        recommendationArtifact: artifact,
      },
      artifacts: {
        recommendation: artifact,
        validation: join(artifactRoot, 'runs', 'validation-v2', 'validations.json'),
        metrics: join(artifactRoot, 'runs', 'metrics-v2', 'daily-metrics.json'),
      },
      notifications: {
        stats: '1527426926120271984',
        mirrors: ['1527426944126156872'],
        messageIds: ['1527426926120271984', '1527426944126156872'],
      },
    });
    assert.equal(validationAction().reason, 'validation-backlog-empty');
    assert.deepEqual(backlog(), []);
  });
});

test('invalid validation catch-up start dates fail closed', () => {
  withArtifacts((artifactRoot) => {
    assert.throws(
      () => planDailyOps({ now: AT.morning, artifactRoot, validationCatchupFrom: '2026-02-31' }),
      /valid YYYY-MM-DD/,
    );
    assert.throws(
      () => planDailyOps({ now: AT.morning, artifactRoot, validationCatchupFrom: '2026-07-15' }),
      /on or before 2026-07-14/,
    );
  });
});

test('a due rollover Daily at 00:18 still waits for the 07:15 checkpoint', () => {
  withArtifacts((artifactRoot) => {
    const paths = rolloverPathsFor(artifactRoot);
    writeJson(paths.rolloverDailyLock, {
      status: 'retryable',
      retryAfter: ROLLOVER_RETRY_AFTER,
    });

    const plan = planDailyOps({ now: ROLLOVER_AT.afterMidnight, artifactRoot });
    assert.equal(plan.local.time, '00:18:00');
    assert.equal(plan.heavy, null);
  });
});

test('07:15 recovers a due retryable Daily for the slate that rolled into today', () => {
  withArtifacts((artifactRoot) => {
    const paths = rolloverPathsFor(artifactRoot);
    writeJson(paths.rolloverDailyLock, {
      status: 'retryable',
      retryAfter: ROLLOVER_RETRY_AFTER,
    });

    const plan = planDailyOps({ now: ROLLOVER_AT.morning, artifactRoot });
    assert.deepEqual([plan.heavy?.flow, plan.heavy?.mode], ['daily', 'retry']);
    assert.equal(plan.heavy?.targetDate, '2026-07-16');
    assert.equal(plan.heavy?.path, paths.rolloverDailyLock);
    assert.equal(plan.heavy?.reason, 'daily-rollover-retryable-due');
  });
});

test('10:15 prioritizes a due rollover retry over the new next-slate initial run', () => {
  withArtifacts((artifactRoot) => {
    const paths = rolloverPathsFor(artifactRoot);
    writeJson(paths.rolloverDailyLock, {
      status: 'retryable',
      retryAfter: ROLLOVER_RETRY_AFTER,
    });
    assert.equal(existsSync(paths.dailyLock), false);

    const plan = planDailyOps({ now: ROLLOVER_AT.daily, artifactRoot });
    assert.deepEqual([plan.heavy?.flow, plan.heavy?.mode], ['daily', 'retry']);
    assert.equal(plan.heavy?.targetDate, '2026-07-16');
  });
});

test('a terminal rollover slate does not block the next-slate initial run', () => {
  withArtifacts((artifactRoot) => {
    const paths = rolloverPathsFor(artifactRoot);
    for (const status of DAILY_TERMINAL_STATUSES) {
      writeJson(paths.rolloverDailyLock, {
        status,
        retryAfter: ROLLOVER_RETRY_AFTER,
      });
      const plan = planDailyOps({ now: ROLLOVER_AT.daily, artifactRoot });
      assert.deepEqual([plan.heavy?.flow, plan.heavy?.mode], ['daily', 'initial'], status);
      assert.equal(plan.heavy?.targetDate, '2026-07-17', status);
      assert.equal(plan.heavy?.path, paths.dailyLock, status);
    }
  });
});

test('rollover execution binds Daily date and batch to the recovered target', () => {
  withArtifacts((artifactRoot) => {
    const paths = rolloverPathsFor(artifactRoot);
    writeJson(paths.retentionMarker, { status: 'completed' });
    writeJson(paths.validationLock, { status: 'published' });
    writeJson(paths.rolloverDailyLock, {
      status: 'retryable',
      retryAfter: ROLLOVER_RETRY_AFTER,
    });
    const calls = [];

    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: ROLLOVER_AT.morning,
      env: {},
      execute(action, childEnv) {
        calls.push({ action, childEnv });
        return { status: 0, stdout: '{}' };
      },
    });

    assert.equal(summary.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action.flow, 'daily');
    assert.equal(calls[0].action.targetDate, '2026-07-16');
    assert.equal(calls[0].childEnv.GANA_DAILY_DATE, '2026-07-16');
    assert.equal(calls[0].childEnv.GANA_DAILY_BATCH_ID, 'daily-2026-07-16-full');
    assert.equal(calls[0].childEnv.GANA_DAILY_E2E_NOT_BEFORE, '07:15');
    assert.equal(calls[0].action.command.includes('--force'), false);
  });
});

test('heavy priority is never-attempted Daily, then strategy, then expired Daily retry', () => {
  withArtifacts((artifactRoot) => {
    let plan = planDailyOps({ now: AT.recovery1, artifactRoot });
    assert.deepEqual([plan.heavy?.flow, plan.heavy?.mode], ['daily', 'initial']);

    writeJson(plan.paths.dailyLock, {
      status: 'retryable',
      retryAfter: '2026-07-15T23:00:00.000Z',
    });
    plan = planDailyOps({ now: AT.recovery1, artifactRoot });
    assert.deepEqual([plan.heavy?.flow, plan.heavy?.mode], ['strategy', 'initial']);

    writeJson(plan.paths.strategyLock, { status: 'published' });
    plan = planDailyOps({ now: AT.recovery1, artifactRoot });
    assert.deepEqual([plan.heavy?.flow, plan.heavy?.mode], ['daily', 'retry']);
    assert.equal(plan.heavy?.retryAfter, '2026-07-15T23:00:00.000Z');
  });
});

test('Daily retry runs only from 18:15 and only after retryAfter', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    writeJson(paths.strategyLock, { status: 'published' });
    writeJson(paths.dailyLock, {
      status: 'retryable',
      retryAfter: '2026-07-15T18:00:00.000Z',
    });
    assert.equal(planDailyOps({ now: AT.strategy, artifactRoot }).heavy, null);

    writeJson(paths.dailyLock, {
      status: 'retryable',
      retryAfter: '2026-07-16T01:00:00.000Z',
    });
    assert.equal(planDailyOps({ now: AT.recovery1, artifactRoot }).heavy, null);

    writeJson(paths.dailyLock, {
      status: 'retryable',
      retryAfter: AT.recovery1.toISOString(),
    });
    assert.equal(planDailyOps({ now: AT.recovery1, artifactRoot }).heavy?.mode, 'retry');
  });
});

test('known terminal Daily states never retry or call providers', () => {
  assert.equal(DAILY_TERMINAL_STATUSES.has('published'), true);
  assert.equal(DAILY_TERMINAL_STATUSES.has('publication-uncertain'), true);
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    writeJson(paths.strategyLock, { status: 'published' });
    for (const status of ['published', 'review-required', 'blocked', 'publication-uncertain']) {
      writeJson(paths.dailyLock, { status, retryAfter: '2020-01-01T00:00:00.000Z' });
      const plan = planDailyOps({ now: AT.recovery2, artifactRoot });
      assert.equal(plan.heavy, null, status);
    }
  });
});

test('a malformed or unknown Daily lock blocks automatic execution conservatively', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    writeJson(paths.strategyLock, { status: 'published' });
    mkdirSync(dirname(paths.dailyLock), { recursive: true });
    writeFileSync(paths.dailyLock, '{broken');
    const malformed = planDailyOps({ now: AT.recovery2, artifactRoot });
    assert.equal(malformed.heavy, null);
    assert.equal(malformed.state.daily.valid, false);

    writeJson(paths.dailyLock, { status: 'mystery' });
    assert.equal(planDailyOps({ now: AT.recovery2, artifactRoot }).heavy, null);
  });
});

test('strategy running lock is recovered only when both owner and child PIDs are dead', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    writeJson(paths.dailyLock, { status: 'published' });
    writeJson(paths.strategyLock, { status: 'running', ownerPid: 4567, childPid: 5678 });

    const alive = planDailyOps({
      now: AT.strategy,
      artifactRoot,
      isProcessAlive: (pid) => pid === 5678,
    });
    assert.equal(alive.heavy, null);

    const dead = planDailyOps({
      now: AT.strategy,
      artifactRoot,
      isProcessAlive: () => false,
    });
    assert.deepEqual([dead.heavy?.flow, dead.heavy?.mode], ['strategy', 'stale-recovery']);
  });
});

test('morning failures are independent and at most one heavy flow executes per tick', () => {
  withArtifacts((artifactRoot) => {
    publishDailyForDate(artifactRoot, '2026-07-14');
    const calls = [];
    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.strategy,
      env: { GANA_MAINTENANCE_PAUSED: 'false' },
      execute(action) {
        calls.push(action);
        if (action.flow === 'retention') return { status: 17, stdout: '{"status":"error"}' };
        if (action.flow === 'validation') writeJson(pathsFor(artifactRoot).validationLock, { status: 'published' });
        return { status: 0, stdout: '{}' };
      },
    });

    assert.deepEqual(calls.map((call) => call.flow), ['retention', 'validation', 'daily']);
    assert.equal(calls.filter((call) => call.kind === 'heavy').length, 1);
    assert.equal(calls.some((call) => call.command.includes('--force')), false);
    assert.equal(summary.status, 'review-required');
    assert.equal(summary.actions.find((action) => action.flow === 'validation')?.status, 'completed');
    assert.equal(summary.actions.find((action) => action.flow === 'daily')?.mode, 'initial');
    const marker = JSON.parse(readFileSync(pathsFor(artifactRoot).retentionMarker, 'utf8'));
    assert.equal(marker.status, 'review-required');
    assert.equal(existsSync(pathsFor(artifactRoot).globalLock), false);
  });
});

test('a signaled wrapper is recorded as failed rather than a successful zero exit', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    writeJson(paths.retentionMarker, { status: 'completed' });
    writeJson(paths.validationLock, { status: 'published' });
    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.daily,
      env: {},
      execute() {
        return { status: null, signal: 'SIGTERM' };
      },
    });
    assert.equal(summary.status, 'review-required');
    assert.equal(summary.actions.at(-1).status, 'failed');
    assert.equal(summary.actions.at(-1).exitCode, 1);
    assert.equal(summary.actions.at(-1).signal, 'SIGTERM');
  });
});

test('retention terminal marker makes the daily operation idempotent', () => {
  withArtifacts((artifactRoot) => {
    publishDailyForDate(artifactRoot, '2026-07-14');
    const paths = pathsFor(artifactRoot);
    const firstCalls = [];
    const first = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.morning,
      env: {},
      execute(action) {
        firstCalls.push(action.flow);
        if (action.flow === 'validation') writeJson(paths.validationLock, { status: 'published' });
        return { status: 0, stdout: '{}' };
      },
    });
    assert.equal(first.status, 'completed');
    assert.deepEqual(firstCalls, ['retention', 'validation']);
    assert.equal(JSON.parse(readFileSync(paths.retentionMarker, 'utf8')).status, 'completed');

    const secondCalls = [];
    const second = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.morning,
      env: {},
      execute(action) {
        secondCalls.push(action.flow);
        return { status: 0, stdout: '{}' };
      },
    });
    assert.equal(second.status, 'skipped');
    assert.deepEqual(secondCalls, []);
  });
});

test('a retention mutex skip is not mistaken for a terminal daily marker', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    writeJson(paths.validationLock, { status: 'published' });
    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.morning,
      env: {},
      execute() {
        return {
          status: 0,
          stdout: JSON.stringify({ status: 'skipped', reason: 'retention-already-running' }),
        };
      },
    });
    assert.equal(summary.actions[0].status, 'skipped');
    assert.equal(existsSync(paths.retentionMarker), false);
  });
});

test('maintenance pause and dry-run do not acquire locks or execute commands', () => {
  withArtifacts((artifactRoot) => {
    publishDailyForDate(artifactRoot, '2026-07-14');
    let calls = 0;
    const paused = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.recovery2,
      env: { GANA_MAINTENANCE_PAUSED: 'true' },
      execute() {
        calls += 1;
      },
    });
    assert.equal(paused.status, 'paused');
    assert.equal(calls, 0);
    assert.equal(existsSync(pathsFor(artifactRoot).globalLock), false);

    const dryRun = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.recovery2,
      dryRun: true,
      env: { GANA_MAINTENANCE_PAUSED: 'false' },
      execute() {
        calls += 1;
      },
    });
    assert.equal(dryRun.status, 'dry-run');
    assert.equal(dryRun.actions.filter((action) => action.decision === 'would-run').length, 3);
    assert.equal(calls, 0);
    assert.equal(existsSync(pathsFor(artifactRoot).globalLock), false);
  });
});

test('live global dispatcher owner blocks overlap without touching its lock', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    mkdirSync(paths.globalLock, { recursive: true });
    writeJson(join(paths.globalLock, 'owner.json'), {
      token: 'live-owner',
      pid: 4321,
      startedAt: AT.morning.toISOString(),
    });
    let calls = 0;
    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.morning,
      env: {},
      isProcessAlive: (pid) => pid === 4321,
      execute() {
        calls += 1;
      },
    });
    assert.equal(summary.status, 'skipped');
    assert.equal(summary.reason, 'dispatcher-already-running');
    assert.equal(calls, 0);
    assert.equal(JSON.parse(readFileSync(join(paths.globalLock, 'owner.json'), 'utf8')).token, 'live-owner');
  });
});

test('dead-PID global lock is safely reclaimed and released after the tick', () => {
  withArtifacts((artifactRoot) => {
    const paths = pathsFor(artifactRoot);
    mkdirSync(paths.globalLock, { recursive: true });
    writeJson(join(paths.globalLock, 'owner.json'), {
      token: 'dead-owner',
      pid: 999999,
      startedAt: AT.beforeMorning.toISOString(),
    });
    const summary = runDailyOpsDispatch({
      repoRoot: REPO_ROOT,
      artifactRoot,
      now: AT.beforeMorning,
      env: {},
      isProcessAlive: () => false,
      execute() {
        throw new Error('nothing should be due before 07:15');
      },
    });
    assert.equal(summary.status, 'skipped');
    assert.equal(summary.globalLock.reclaimed, true);
    assert.equal(existsSync(paths.globalLock), false);
  });
});

test('CLI requires --dry-run for --now and always emits a JSON summary', () => {
  withArtifacts((artifactRoot) => {
    const invalid = spawnSync(process.execPath, [CLI, '--now', AT.daily.toISOString()], {
      cwd: REPO_ROOT,
      env: { ...process.env, GANA_MAINTENANCE_PAUSED: 'false', GANA_ARTIFACT_ROOT: artifactRoot },
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    const invalidSummary = JSON.parse(invalid.stdout);
    assert.equal(invalidSummary.status, 'error');
    assert.match(invalidSummary.reason, /only together with --dry-run/);

    const dryRun = spawnSync(process.execPath, [CLI, '--dry-run', '--now', AT.daily.toISOString()], {
      cwd: REPO_ROOT,
      env: { ...process.env, GANA_MAINTENANCE_PAUSED: 'false', GANA_ARTIFACT_ROOT: artifactRoot },
      encoding: 'utf8',
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const summary = JSON.parse(dryRun.stdout);
    assert.equal(summary.status, 'dry-run');
    assert.deepEqual(summary.checkpoint, { id: 'daily', wallClock: '10:15' });
    assert.equal(summary.heavyDecision.flow, 'daily');
    assert.equal(existsSync(pathsFor(artifactRoot).globalLock), false);
  });
});

function withArtifacts(run) {
  const root = mkdtempSync(join(tmpdir(), 'gana-daily-ops-dispatch-'));
  const artifactRoot = join(root, 'artifacts');
  try {
    run(artifactRoot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function pathsFor(artifactRoot) {
  return dailyOpsPaths(artifactRoot, {
    today: '2026-07-15',
    previous: '2026-07-14',
    next: '2026-07-16',
  });
}

function rolloverPathsFor(artifactRoot) {
  return dailyOpsPaths(artifactRoot, {
    today: '2026-07-16',
    previous: '2026-07-15',
    next: '2026-07-17',
  });
}

function publishDailyForDate(artifactRoot, date, dailyBatchId = `daily-${date}-full`) {
  writeJson(join(artifactRoot, 'cron', 'locks', `daily-e2e-${date}.lock`), {
    date,
    dailyBatchId,
    status: 'published',
  });
  const artifact = join(artifactRoot, 'runs', dailyBatchId, 'daily-parlay-recommendations.json');
  writeJson(artifact, {
    date,
    dailyBatchId,
    recommendations: [],
  });
  return artifact;
}

function publishValidationForDate(artifactRoot, date, recommendationArtifact, overrides = {}) {
  writeJson(join(artifactRoot, 'cron', 'locks', `validation-${date}.lock`), {
    date,
    runSlug: `validation-${date}`,
    status: 'published',
    validationExit: 0,
    metricsExit: 0,
    artifacts: [recommendationArtifact],
    notifications: { stats: '1527426926120271984' },
    ...overrides,
  });
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
