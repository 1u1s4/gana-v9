import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const DAILY_OPS_TIMEZONE = 'America/Guatemala';
export const DAILY_OPS_CHECKPOINTS = Object.freeze([
  Object.freeze({ id: 'morning', wallClock: '07:15', minute: (7 * 60) + 15 }),
  Object.freeze({ id: 'daily', wallClock: '10:15', minute: (10 * 60) + 15 }),
  Object.freeze({ id: 'strategy', wallClock: '13:15', minute: (13 * 60) + 15 }),
  Object.freeze({ id: 'recovery-1', wallClock: '18:15', minute: (18 * 60) + 15 }),
  Object.freeze({ id: 'recovery-2', wallClock: '22:15', minute: (22 * 60) + 15 }),
]);

const MORNING_MINUTE = DAILY_OPS_CHECKPOINTS[0].minute;
const DAILY_MINUTE = DAILY_OPS_CHECKPOINTS[1].minute;
const STRATEGY_MINUTE = DAILY_OPS_CHECKPOINTS[2].minute;
const RECOVERY_MINUTE = DAILY_OPS_CHECKPOINTS[3].minute;
const CHILD_RUNNING_STALE_MS = 20 * 60 * 60 * 1000;
const GLOBAL_LOCK_INITIALIZATION_GRACE_MS = 30 * 1000;

const RETENTION_TERMINAL_STATUSES = new Set([
  'completed',
  'published',
  'review-required',
  'blocked',
  'failed',
  'succeeded',
]);

const STRATEGY_TERMINAL_STATUSES = new Set([
  'published',
  'review-required',
  'blocked',
  'completed',
  'failed',
  'succeeded',
]);

// Every Daily state except an explicitly due `retryable` state is deliberately
// non-runnable. This allowlist documents the known terminal states while the
// conservative fallback also blocks unknown/corrupt locks.
export const DAILY_TERMINAL_STATUSES = new Set([
  'published',
  'review-required',
  'blocked',
  'publication-uncertain',
  'publication-ledger-error',
  'ledger-conflict',
  'completed',
  'succeeded',
  'failed',
]);

export function resolveArtifactRoot(repoRoot, value = '.artifacts/gana-v9') {
  const selected = typeof value === 'string' && value.trim() ? value.trim() : '.artifacts/gana-v9';
  return isAbsolute(selected) ? selected : resolve(repoRoot, selected);
}

export function guatemalaClock(now = new Date()) {
  const instant = validDate(now, 'now');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_OPS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  const minuteOfDay = (Number(parts.hour) * 60) + Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    minuteOfDay,
    checkpoint: latestCheckpoint(minuteOfDay),
  };
}

export function offsetIsoDate(date, offsetDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid ISO date: ${date}`);
  const shifted = new Date(`${date}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

export function dailyOpsPaths(artifactRoot, dates) {
  const lockRoot = resolve(artifactRoot, 'cron', 'locks');
  return {
    globalLock: resolve(lockRoot, 'daily-ops-dispatch.lock'),
    retentionMarker: resolve(lockRoot, `raw-retention-${dates.today}.lock`),
    validationLock: resolve(lockRoot, `validation-${dates.previous}.lock`),
    dailyLock: resolve(lockRoot, `daily-e2e-${dates.next}.lock`),
    strategyLock: resolve(lockRoot, `strategy-review-${dates.previous}.lock`),
  };
}

export function planDailyOps({
  now = new Date(),
  artifactRoot,
  maintenancePaused = false,
  isProcessAlive = processIsAlive,
} = {}) {
  if (!artifactRoot) throw new Error('artifactRoot is required.');
  const instant = validDate(now, 'now');
  const local = guatemalaClock(instant);
  const dates = {
    today: local.date,
    previous: offsetIsoDate(local.date, -1),
    next: offsetIsoDate(local.date, 1),
  };
  const paths = dailyOpsPaths(artifactRoot, dates);
  const retention = inspectJsonPath(paths.retentionMarker);
  const validation = inspectJsonPath(paths.validationLock);
  const daily = inspectJsonPath(paths.dailyLock);
  const strategy = inspectJsonPath(paths.strategyLock);
  const morningEligible = local.minuteOfDay >= MORNING_MINUTE;

  const morning = [
    planRetention({ eligible: morningEligible, state: retention, path: paths.retentionMarker }),
    planValidation({ eligible: morningEligible, state: validation, now: instant, path: paths.validationLock }),
  ];

  const heavy = chooseHeavyAction({
    now: instant,
    minuteOfDay: local.minuteOfDay,
    daily,
    strategy,
    paths,
    dates,
    isProcessAlive,
  });

  return {
    maintenancePaused,
    now: instant.toISOString(),
    timezone: DAILY_OPS_TIMEZONE,
    local,
    dates,
    paths,
    morning,
    heavy,
    state: {
      retention: publicState(retention),
      validation: publicState(validation),
      daily: publicState(daily),
      strategy: publicState(strategy),
    },
  };
}

export function runDailyOpsDispatch({
  repoRoot,
  artifactRoot,
  now = new Date(),
  dryRun = false,
  env = process.env,
  execute = executeSubprocess,
  isProcessAlive = processIsAlive,
  pid = process.pid,
} = {}) {
  if (!repoRoot) throw new Error('repoRoot is required.');
  if (!artifactRoot) throw new Error('artifactRoot is required.');
  const instant = validDate(now, 'now');
  const maintenancePaused = env.GANA_MAINTENANCE_PAUSED === 'true';
  const initialPlan = planDailyOps({
    now: instant,
    artifactRoot,
    maintenancePaused,
    isProcessAlive,
  });
  const summary = baseSummary(initialPlan, dryRun);

  if (maintenancePaused) {
    summary.status = 'paused';
    summary.reason = 'GANA_MAINTENANCE_PAUSED=true';
    return summary;
  }

  if (dryRun) {
    summary.status = 'dry-run';
    summary.actions = plannedActions(initialPlan);
    summary.reason = summary.actions.some((action) => action.decision === 'would-run')
      ? 'planned-without-side-effects'
      : 'nothing-due';
    return summary;
  }

  const lock = acquireGlobalLock(initialPlan.paths.globalLock, {
    now: instant,
    pid,
    isProcessAlive,
  });
  summary.globalLock = publicGlobalLock(lock, initialPlan.paths.globalLock);
  if (!lock.acquired) {
    summary.status = 'skipped';
    summary.reason = lock.reason;
    return summary;
  }

  try {
    // Re-read every child lock only after owning the dispatcher lock. Dry-run
    // intentionally skips this mutation and reports the initial snapshot.
    const plan = planDailyOps({
      now: instant,
      artifactRoot,
      maintenancePaused: false,
      isProcessAlive,
    });
    Object.assign(summary, baseSummary(plan, false));
    summary.globalLock = publicGlobalLock(lock, plan.paths.globalLock);
    const actions = [];

    for (const morningAction of plan.morning) {
      if (!morningAction.run) {
        actions.push(skippedAction(morningAction));
        continue;
      }
      const action = actionDefinition(morningAction.flow, plan, repoRoot, artifactRoot);
      const result = safelyExecute(execute, action, { ...env, ...action.env });
      const recorded = executedAction(action, result);
      if (morningAction.flow === 'retention') {
        const retentionOutcome = classifyRetentionOutcome(result);
        recorded.status = retentionOutcome.actionStatus;
        recorded.reason = retentionOutcome.reason;
        if (retentionOutcome.terminal) {
          try {
            writeJsonAtomic(plan.paths.retentionMarker, {
              schemaVersion: 1,
              flow: 'raw-retention',
              date: plan.dates.today,
              status: retentionOutcome.markerStatus,
              exitCode: result.exitCode,
              signal: result.signal,
              reason: retentionOutcome.reason,
              completedAt: new Date().toISOString(),
            });
            recorded.marker = plan.paths.retentionMarker;
          } catch (error) {
            recorded.status = 'failed';
            recorded.reason = `retention-marker-write-failed: ${errorMessage(error)}`;
          }
        }
      }
      actions.push(recorded);
    }

    if (plan.heavy) {
      const action = actionDefinition(plan.heavy.flow, plan, repoRoot, artifactRoot);
      const result = safelyExecute(execute, action, { ...env, ...action.env });
      actions.push(executedAction(action, result));
    }

    summary.actions = actions;
    const executed = actions.filter((action) => action.decision === 'executed');
    const failed = executed.filter((action) => action.status === 'failed');
    summary.status = failed.length > 0 ? 'review-required' : (executed.length > 0 ? 'completed' : 'skipped');
    summary.reason = failed.length > 0
      ? `${failed.length}-flow(s)-failed`
      : (executed.length > 0 ? 'dispatch-completed' : plan.heavy?.reason ?? 'nothing-due');
    return summary;
  } finally {
    releaseGlobalLock(lock);
  }
}

export function acquireGlobalLock(lockPath, {
  now = new Date(),
  pid = process.pid,
  isProcessAlive = processIsAlive,
  initializationGraceMs = GLOBAL_LOCK_INITIALIZATION_GRACE_MS,
  token = randomUUID(),
} = {}) {
  const instant = validDate(now, 'now');
  mkdirSync(dirname(lockPath), { recursive: true });
  let reclaimed = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      mkdirSync(lockPath);
      const ownerPath = resolve(lockPath, 'owner.json');
      writeJsonAtomic(ownerPath, {
        schemaVersion: 1,
        token,
        pid,
        startedAt: instant.toISOString(),
      });
      return {
        acquired: true,
        lockPath,
        ownerPath,
        token,
        pid,
        reclaimed,
        release() {
          releaseGlobalLock(this);
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        // If owner publication failed after mkdir, only remove the directory
        // created by this token-less acquisition attempt.
        const owner = inspectJsonPath(resolve(lockPath, 'owner.json'));
        if (!owner.exists) rmSync(lockPath, { recursive: true, force: true });
        throw error;
      }
    }

    const current = inspectGlobalLock(lockPath, instant, isProcessAlive);
    if (!current.stale) {
      return {
        acquired: false,
        lockPath,
        reason: current.reason,
        owner: current.owner,
        reclaimed: false,
      };
    }
    if (current.ageMs < initializationGraceMs && current.reason !== 'dispatcher-owner-pid-dead') {
      return {
        acquired: false,
        lockPath,
        reason: 'dispatcher-lock-initializing',
        owner: current.owner,
        reclaimed: false,
      };
    }

    const quarantine = resolve(dirname(lockPath), `${basename(lockPath)}.stale-${token}`);
    try {
      renameSync(lockPath, quarantine);
      rmSync(quarantine, { recursive: true, force: true });
      reclaimed = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        return {
          acquired: false,
          lockPath,
          reason: 'dispatcher-stale-lock-reclaim-race',
          owner: current.owner,
          reclaimed: false,
        };
      }
    }
  }

  return {
    acquired: false,
    lockPath,
    reason: 'dispatcher-lock-acquisition-race',
    reclaimed: false,
  };
}

export function releaseGlobalLock(lock) {
  if (!lock?.acquired || lock.released) return false;
  const owner = inspectJsonPath(lock.ownerPath);
  if (!owner.exists || owner.value?.token !== lock.token) return false;
  rmSync(lock.lockPath, { recursive: true, force: true });
  lock.released = true;
  return true;
}

export function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function latestCheckpoint(minuteOfDay) {
  let selected = null;
  for (const checkpoint of DAILY_OPS_CHECKPOINTS) {
    if (minuteOfDay >= checkpoint.minute) selected = checkpoint;
  }
  return selected ? { id: selected.id, wallClock: selected.wallClock } : null;
}

function planRetention({ eligible, state, path }) {
  if (!eligible) return { flow: 'retention', run: false, path, reason: 'before-07:15' };
  if (!state.exists) return { flow: 'retention', run: true, path, reason: 'daily-marker-missing' };
  const status = state.value?.status;
  if (RETENTION_TERMINAL_STATUSES.has(status)) {
    return { flow: 'retention', run: false, path, reason: `terminal-${status}` };
  }
  return { flow: 'retention', run: false, path, reason: state.error ? 'marker-invalid' : `marker-blocks-${status ?? 'unknown'}` };
}

function planValidation({ eligible, state, now, path }) {
  if (!eligible) return { flow: 'validation', run: false, path, reason: 'before-07:15' };
  if (!state.exists) return { flow: 'validation', run: true, path, reason: 'daily-lock-missing' };
  const status = state.value?.status;
  if (status === 'running' && state.mtimeMs !== undefined && now.getTime() - state.mtimeMs >= CHILD_RUNNING_STALE_MS) {
    return { flow: 'validation', run: true, path, reason: 'stale-running-lock-delegated-to-wrapper' };
  }
  return { flow: 'validation', run: false, path, reason: state.error ? 'lock-invalid' : `lock-blocks-${status ?? 'unknown'}` };
}

function chooseHeavyAction({ now, minuteOfDay, daily, strategy, paths, dates, isProcessAlive }) {
  if (minuteOfDay < DAILY_MINUTE) return null;

  // A missing Daily lock is the only definition of "never attempted" and has
  // first priority at every checkpoint from 10:15 onward.
  if (!daily.exists) {
    return {
      flow: 'daily',
      mode: 'initial',
      targetDate: dates.next,
      path: paths.dailyLock,
      reason: 'daily-never-attempted',
    };
  }

  const strategyPending = minuteOfDay >= STRATEGY_MINUTE
    ? inspectStrategyPending(strategy, now, isProcessAlive)
    : { pending: false, reason: 'before-13:15' };
  if (strategyPending.pending) {
    return {
      flow: 'strategy',
      mode: strategyPending.mode,
      targetDate: dates.previous,
      path: paths.strategyLock,
      reason: strategyPending.reason,
    };
  }

  if (minuteOfDay < RECOVERY_MINUTE) return null;
  const dailyStatus = daily.value?.status;
  if (dailyStatus !== 'retryable') return null;
  const retryAfter = daily.value?.retryAfter;
  const retryAt = typeof retryAfter === 'string' ? Date.parse(retryAfter) : Number.NaN;
  if (!Number.isFinite(retryAt) || retryAt > now.getTime()) return null;
  return {
    flow: 'daily',
    mode: 'retry',
    targetDate: dates.next,
    path: paths.dailyLock,
    retryAfter,
    reason: 'daily-retryable-due',
  };
}

function inspectStrategyPending(state, now, isProcessAlive) {
  if (!state.exists) return { pending: true, mode: 'initial', reason: 'strategy-lock-missing' };
  if (state.error) return { pending: false, reason: 'strategy-lock-invalid' };
  const status = state.value?.status;
  if (STRATEGY_TERMINAL_STATUSES.has(status)) return { pending: false, reason: `terminal-${status}` };
  if (status !== 'running') return { pending: false, reason: `strategy-lock-blocks-${status ?? 'unknown'}` };
  const ownerPids = [state.value?.ownerPid, state.value?.childPid, state.value?.pid]
    .map(Number)
    .filter((pid, index, all) => Number.isInteger(pid) && pid > 0 && all.indexOf(pid) === index);
  if (ownerPids.length > 0) {
    return ownerPids.some(isProcessAlive)
      ? { pending: false, reason: 'strategy-running-owner-alive' }
      : { pending: true, mode: 'stale-recovery', reason: 'strategy-running-owner-dead' };
  }
  if (state.mtimeMs !== undefined && now.getTime() - state.mtimeMs >= CHILD_RUNNING_STALE_MS) {
    return { pending: true, mode: 'stale-recovery', reason: 'strategy-running-lock-stale' };
  }
  return { pending: false, reason: 'strategy-running-owner-unknown' };
}

function actionDefinition(flow, plan, repoRoot, artifactRoot) {
  const commonEnv = { GANA_ARTIFACT_ROOT: artifactRoot };
  if (flow === 'retention') {
    return {
      flow,
      kind: 'morning',
      targetDate: plan.dates.today,
      command: [resolve(repoRoot, 'scripts/gana-raw-retention-apply.sh')],
      displayCommand: 'scripts/gana-raw-retention-apply.sh',
      env: commonEnv,
      cwd: repoRoot,
    };
  }
  if (flow === 'validation') {
    return {
      flow,
      kind: 'morning',
      targetDate: plan.dates.previous,
      command: [resolve(repoRoot, 'scripts/gana-previous-day-validation-notify.sh')],
      displayCommand: 'scripts/gana-previous-day-validation-notify.sh',
      env: { ...commonEnv, GANA_VALIDATION_DATE: plan.dates.previous },
      cwd: repoRoot,
    };
  }
  if (flow === 'daily') {
    return {
      flow,
      kind: 'heavy',
      mode: plan.heavy.mode,
      targetDate: plan.dates.next,
      command: [resolve(repoRoot, 'scripts/gana-daily-e2e-notify.sh')],
      displayCommand: 'scripts/gana-daily-e2e-notify.sh',
      env: {
        ...commonEnv,
        GANA_DAILY_DATE: plan.dates.next,
        GANA_DAILY_BATCH_ID: `daily-${plan.dates.next}-full`,
      },
      cwd: repoRoot,
    };
  }
  if (flow === 'strategy') {
    return {
      flow,
      kind: 'heavy',
      mode: plan.heavy.mode,
      targetDate: plan.dates.previous,
      command: [resolve(repoRoot, 'scripts/gana-strategy-review.sh')],
      displayCommand: 'scripts/gana-strategy-review.sh',
      env: {
        ...commonEnv,
        GANA_STRATEGY_REVIEW_DATE: plan.dates.previous,
        GANA_STRATEGY_REVIEW_SCOPE: `strategy-${plan.dates.previous}`,
      },
      cwd: repoRoot,
    };
  }
  throw new Error(`Unknown dispatch flow: ${flow}`);
}

function executeSubprocess(action, childEnv) {
  const child = spawnSync(action.command[0], action.command.slice(1), {
    cwd: action.cwd,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    exitCode: Number.isInteger(child.status) ? child.status : 1,
    signal: child.signal ?? null,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    error: child.error,
  };
}

function safelyExecute(execute, action, childEnv) {
  const startedAt = new Date();
  try {
    const raw = execute(action, childEnv) ?? {};
    return {
      exitCode: Number.isInteger(raw.exitCode) ? raw.exitCode : (Number.isInteger(raw.status) ? raw.status : 1),
      signal: raw.signal ?? null,
      stdout: stringOutput(raw.stdout),
      stderr: stringOutput(raw.stderr),
      error: raw.error,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      exitCode: 1,
      signal: null,
      stdout: '',
      stderr: '',
      error,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    };
  }
}

function classifyRetentionOutcome(result) {
  const parsed = parseJsonOutput(result.stdout);
  if (parsed?.status === 'skipped' || parsed?.status === 'paused') {
    return {
      terminal: false,
      markerStatus: undefined,
      actionStatus: 'skipped',
      reason: parsed.reason ?? `retention-${parsed.status}`,
    };
  }
  if (result.exitCode === 0 && !result.error) {
    return {
      terminal: true,
      markerStatus: 'completed',
      actionStatus: 'completed',
      reason: 'retention-completed',
    };
  }
  return {
    terminal: true,
    markerStatus: 'review-required',
    actionStatus: 'failed',
    reason: result.error ? `retention-spawn-failed: ${errorMessage(result.error)}` : `retention-exit-${result.exitCode}`,
  };
}

function executedAction(action, result) {
  return {
    flow: action.flow,
    kind: action.kind,
    mode: action.mode,
    targetDate: action.targetDate,
    command: action.displayCommand,
    decision: 'executed',
    status: result.exitCode === 0 && !result.error ? 'completed' : 'failed',
    exitCode: result.exitCode,
    signal: result.signal,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    reason: result.error ? errorMessage(result.error) : undefined,
  };
}

function skippedAction(action) {
  return {
    flow: action.flow,
    kind: 'morning',
    decision: 'skipped',
    reason: action.reason,
  };
}

function plannedActions(plan) {
  const actions = plan.morning.map((action) => ({
    flow: action.flow,
    kind: 'morning',
    decision: action.run ? 'would-run' : 'skipped',
    reason: action.reason,
  }));
  if (plan.heavy) {
    actions.push({
      flow: plan.heavy.flow,
      kind: 'heavy',
      mode: plan.heavy.mode,
      targetDate: plan.heavy.targetDate,
      decision: 'would-run',
      reason: plan.heavy.reason,
    });
  }
  return actions;
}

function baseSummary(plan, dryRun) {
  return {
    schemaVersion: 1,
    flow: 'daily-ops-dispatch',
    status: 'pending',
    dryRun,
    timezone: plan.timezone,
    now: plan.now,
    localDate: plan.local.date,
    localTime: plan.local.time,
    checkpoint: plan.local.checkpoint,
    dates: plan.dates,
    state: plan.state,
    heavyDecision: plan.heavy ? {
      flow: plan.heavy.flow,
      mode: plan.heavy.mode,
      targetDate: plan.heavy.targetDate,
      reason: plan.heavy.reason,
    } : null,
    actions: [],
  };
}

function publicGlobalLock(lock, path) {
  return {
    path,
    acquired: lock.acquired,
    reclaimed: Boolean(lock.reclaimed),
    reason: lock.reason,
    ownerPid: lock.owner?.pid,
  };
}

function inspectGlobalLock(lockPath, now, isProcessAlive) {
  const ownerState = inspectJsonPath(resolve(lockPath, 'owner.json'));
  let mtimeMs;
  try {
    mtimeMs = statSync(lockPath).mtimeMs;
  } catch {
    return { stale: true, reason: 'dispatcher-lock-missing', ageMs: Number.POSITIVE_INFINITY };
  }
  const startedAt = Date.parse(ownerState.value?.startedAt ?? '');
  const ageMs = Math.max(0, now.getTime() - (Number.isFinite(startedAt) ? startedAt : mtimeMs));
  const ownerPid = Number(ownerState.value?.pid);
  if (Number.isInteger(ownerPid) && ownerPid > 0) {
    if (isProcessAlive(ownerPid)) {
      return { stale: false, reason: 'dispatcher-already-running', owner: ownerState.value, ageMs };
    }
    return { stale: true, reason: 'dispatcher-owner-pid-dead', owner: ownerState.value, ageMs };
  }
  return {
    stale: true,
    reason: ownerState.error ? 'dispatcher-owner-invalid' : 'dispatcher-owner-missing',
    owner: ownerState.value,
    ageMs,
  };
}

function inspectJsonPath(path) {
  if (!existsSync(path)) return { exists: false, path };
  let mtimeMs;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    // The file may disappear between exists/stat during a wrapper handoff.
    return { exists: false, path };
  }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON value is not an object.');
    return { exists: true, path, value, mtimeMs };
  } catch (error) {
    return { exists: true, path, error, mtimeMs };
  }
}

function publicState(state) {
  if (!state.exists) return { exists: false };
  return {
    exists: true,
    status: state.value?.status ?? 'unknown',
    retryAfter: state.value?.retryAfter,
    ownerPid: state.value?.ownerPid ?? state.value?.pid,
    childPid: state.value?.childPid,
    valid: !state.error,
  };
}

function writeJsonAtomic(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function parseJsonOutput(output) {
  const text = stringOutput(output).trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stringOutput(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value === undefined || value === null ? '' : String(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date/time.`);
  return date;
}
