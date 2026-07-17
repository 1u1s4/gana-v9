import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const MUTEX_INITIALIZATION_GRACE_MS = 30 * 1000;
const MUTEX_STALE_MS = 20 * 60 * 60 * 1000;

export function readJsonFile(path) {
  return inspectJsonFile(path).value;
}

export function inspectJsonFile(path) {
  if (!existsSync(path)) return { exists: false, valid: false, path };
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { exists: true, valid: false, path, error: 'JSON root must be an object.' };
    }
    return { exists: true, valid: true, path, value };
  } catch (error) {
    return { exists: true, valid: false, path, error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

export function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function resolveCanonicalPublishedRecommendation({ artifactRoot, date }) {
  requireIsoDate(date, 'date');
  const lockPath = resolve(artifactRoot, 'cron', 'locks', `daily-e2e-${date}.lock`);
  const dailyState = inspectJsonFile(lockPath);
  if (!dailyState.exists) {
    return { ok: false, reason: 'daily-lock-missing', lockPath };
  }
  if (!dailyState.valid) return { ok: false, reason: 'daily-lock-invalid', lockPath, dailyState };
  const dailyLock = dailyState.value;
  if (typeof dailyLock.status !== 'string' || !dailyLock.status.trim()) {
    return { ok: false, reason: 'daily-lock-invalid', lockPath, dailyState, dailyLock };
  }
  if (dailyLock.date !== date) {
    return { ok: false, reason: 'daily-lock-date-mismatch', lockPath, dailyState, dailyLock };
  }
  if (dailyLock.status !== 'published') {
    return {
      ok: false,
      reason: `daily-not-published:${dailyLock.status ?? 'unknown'}`,
      lockPath,
      dailyLock,
    };
  }

  const dailyBatchId = typeof dailyLock.dailyBatchId === 'string' ? dailyLock.dailyBatchId.trim() : '';
  if (!dailyBatchId || !dailyBatchId.startsWith(`daily-${date}-`)) {
    return {
      ok: false,
      reason: 'daily-batch-id-missing-or-mismatched',
      lockPath,
      dailyLock,
    };
  }

  const runsRoot = resolve(artifactRoot, 'runs');
  const recommendationArtifact = resolve(runsRoot, dailyBatchId, 'daily-parlay-recommendations.json');
  const relativePath = relative(runsRoot, recommendationArtifact);
  if (relativePath.startsWith('..') || relativePath === '') {
    return { ok: false, reason: 'daily-batch-path-escapes-runs-root', lockPath, dailyLock };
  }
  if (!existsSync(recommendationArtifact)) {
    return {
      ok: false,
      reason: 'canonical-recommendation-artifact-missing',
      lockPath,
      dailyLock,
      dailyBatchId,
      recommendationArtifact,
    };
  }

  const artifact = readJsonFile(recommendationArtifact);
  if (!artifact || artifact.date !== date) {
    return {
      ok: false,
      reason: 'canonical-recommendation-artifact-date-mismatch',
      lockPath,
      dailyLock,
      dailyBatchId,
      recommendationArtifact,
    };
  }
  if (artifact.dailyBatchId && artifact.dailyBatchId !== dailyBatchId) {
    return {
      ok: false,
      reason: 'canonical-recommendation-artifact-batch-mismatch',
      lockPath,
      dailyLock,
      dailyBatchId,
      recommendationArtifact,
    };
  }

  return {
    ok: true,
    lockPath,
    dailyLock,
    dailyBatchId,
    recommendationArtifact,
    artifact,
  };
}

export function assertExplicitCanonicalRecommendation(explicitPath, canonical) {
  if (!explicitPath) return canonical.recommendationArtifact;
  const selected = resolve(explicitPath);
  if (selected !== resolve(canonical.recommendationArtifact)) {
    throw new Error(`Recommendation artifact is not the published Daily artifact: ${selected}`);
  }
  return selected;
}

export function validateArtifactForDate(path, date, kind) {
  if (!path || !existsSync(path)) throw new Error(`${kind} artifact is missing: ${path ?? 'undefined'}`);
  const payload = readJsonFile(path);
  if (!payload) throw new Error(`${kind} artifact is not valid JSON: ${path}`);
  const artifactDate = artifactDateFor(payload, kind);
  if (artifactDate !== date) {
    throw new Error(`${kind} artifact date mismatch: expected ${date}, found ${artifactDate ?? 'unknown'}`);
  }
  return payload;
}

export function artifactPathFromOutput(stdout) {
  const plain = String(stdout ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  const matches = [...plain.matchAll(/^\s*artifact:\s*(.+?)\s*$/gm)];
  return matches.at(-1)?.[1]?.trim();
}

export function acquireValidationMutex(lockPath, {
  now = new Date(),
  pid = process.pid,
  token = randomUUID(),
  isProcessAlive = processIsAlive,
  initializationGraceMs = MUTEX_INITIALIZATION_GRACE_MS,
  staleMs = MUTEX_STALE_MS,
} = {}) {
  const mutexPath = `${lockPath}.mutex`;
  const ownerPath = resolve(mutexPath, 'owner.json');
  mkdirSync(dirname(mutexPath), { recursive: true });
  let reclaimed = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      mkdirSync(mutexPath);
      const fd = openSync(ownerPath, 'wx');
      try {
        writeSync(fd, `${JSON.stringify({ schemaVersion: 1, token, pid, startedAt: now.toISOString() }, null, 2)}\n`);
      } finally {
        closeSync(fd);
      }
      return {
        acquired: true,
        mutexPath,
        ownerPath,
        token,
        pid,
        reclaimed,
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        const owner = readJsonFile(ownerPath);
        if (!owner) rmSync(mutexPath, { recursive: true, force: true });
        throw error;
      }
    }

    let stat;
    try {
      stat = statSync(mutexPath);
    } catch {
      continue;
    }
    const owner = readJsonFile(ownerPath);
    const ownerPid = Number(owner?.pid);
    const startedAt = Date.parse(owner?.startedAt ?? '');
    const ageMs = Math.max(0, now.getTime() - (Number.isFinite(startedAt) ? startedAt : stat.mtimeMs));
    if (Number.isInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid)) {
      return { acquired: false, mutexPath, ownerPath, owner, reason: 'validation-already-running', reclaimed: false };
    }
    if (!owner && ageMs < initializationGraceMs) {
      return { acquired: false, mutexPath, ownerPath, reason: 'validation-mutex-initializing', reclaimed: false };
    }
    if (owner && ageMs < staleMs && (!Number.isInteger(ownerPid) || ownerPid <= 0)) {
      return { acquired: false, mutexPath, ownerPath, owner, reason: 'validation-owner-unknown', reclaimed: false };
    }

    const quarantine = resolve(dirname(mutexPath), `${basename(mutexPath)}.stale-${token}`);
    try {
      renameSync(mutexPath, quarantine);
      rmSync(quarantine, { recursive: true, force: true });
      reclaimed = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        return { acquired: false, mutexPath, ownerPath, owner, reason: 'validation-mutex-reclaim-race', reclaimed: false };
      }
    }
  }

  return { acquired: false, mutexPath, ownerPath, reason: 'validation-mutex-acquisition-race', reclaimed: false };
}

export function inspectValidationMutex(lockPath, {
  now = new Date(),
  isProcessAlive = processIsAlive,
  initializationGraceMs = MUTEX_INITIALIZATION_GRACE_MS,
  staleMs = MUTEX_STALE_MS,
} = {}) {
  const mutexPath = `${lockPath}.mutex`;
  const ownerPath = resolve(mutexPath, 'owner.json');
  if (!existsSync(mutexPath)) {
    return { exists: false, mutexPath, ownerPath, wouldAcquire: true, wouldReclaim: false };
  }
  let stat;
  try {
    stat = statSync(mutexPath);
  } catch {
    return { exists: false, mutexPath, ownerPath, wouldAcquire: true, wouldReclaim: false };
  }
  const ownerState = inspectJsonFile(ownerPath);
  const owner = ownerState.value;
  const ownerPid = Number(owner?.pid);
  const startedAt = Date.parse(owner?.startedAt ?? '');
  const ageMs = Math.max(0, now.getTime() - (Number.isFinite(startedAt) ? startedAt : stat.mtimeMs));
  if (Number.isInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid)) {
    return {
      exists: true,
      mutexPath,
      ownerPath,
      owner,
      ageMs,
      wouldAcquire: false,
      wouldReclaim: false,
      reason: 'validation-already-running',
    };
  }
  if (!ownerState.valid && ageMs < initializationGraceMs) {
    return {
      exists: true,
      mutexPath,
      ownerPath,
      ageMs,
      wouldAcquire: false,
      wouldReclaim: false,
      reason: 'validation-mutex-initializing',
    };
  }
  if (ownerState.valid && ageMs < staleMs && (!Number.isInteger(ownerPid) || ownerPid <= 0)) {
    return {
      exists: true,
      mutexPath,
      ownerPath,
      owner,
      ageMs,
      wouldAcquire: false,
      wouldReclaim: false,
      reason: 'validation-owner-unknown',
    };
  }
  return {
    exists: true,
    mutexPath,
    ownerPath,
    owner,
    ageMs,
    wouldAcquire: true,
    wouldReclaim: true,
    reason: Number.isInteger(ownerPid) && ownerPid > 0
      ? 'validation-owner-dead'
      : 'validation-mutex-stale',
  };
}

export function releaseValidationMutex(mutex) {
  if (!mutex?.acquired || mutex.released) return false;
  const owner = readJsonFile(mutex.ownerPath);
  if (owner?.token !== mutex.token) return false;
  rmSync(mutex.mutexPath, { recursive: true, force: true });
  mutex.released = true;
  return true;
}

export function classifyValidationState(lock, {
  now = new Date(),
  backfill = false,
} = {}) {
  if (!lock) return { run: true, phase: 'validation', mode: backfill ? 'backfill' : 'initial' };
  const status = lock.status;
  if (status === 'publishing' || status === 'publication-uncertain') {
    return { run: false, reason: `unsafe-terminal-${status}` };
  }
  if (backfill) {
    return { run: true, phase: 'validation', mode: 'backfill' };
  }
  if (status === 'published' || status === 'not-applicable') {
    return { run: false, reason: `terminal-${status}` };
  }
  if (status === 'retryable') {
    const retryAt = Date.parse(lock.retryAfter ?? '');
    if (!Number.isFinite(retryAt)) return { run: false, reason: 'retryable-without-valid-retry-after' };
    if (retryAt > now.getTime()) return { run: false, reason: 'retry-backoff-active' };
    const phase = resumablePhase(lock);
    return { run: true, phase, mode: 'retry' };
  }
  if (status === 'review-required') {
    if (hasNotificationEvidence(lock)) return { run: false, reason: 'review-required-with-publication-evidence' };
    if (Number(lock.schemaVersion) >= 2) return { run: false, reason: 'review-required-manual' };
    return { run: true, phase: resumablePhase(lock), mode: 'legacy-retry' };
  }
  if (status === 'running' || String(status ?? '').startsWith('running-')) {
    return { run: true, phase: resumablePhase(lock), mode: 'stale-recovery' };
  }
  return { run: false, reason: `unknown-state-${status ?? 'missing'}` };
}

export function notificationMessageIds(result) {
  const stats = result?.message_id ?? result?.id;
  return stats ? [String(stats)] : [];
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

function artifactDateFor(payload, kind) {
  if (kind === 'recommendation') return payload.date;
  if (kind === 'validation') return payload.target?.date ?? payload.date ?? payload.metricDate;
  if (kind === 'metrics') {
    if (payload.date) return payload.date;
    if (Array.isArray(payload.metrics) && payload.metrics.length === 1) return payload.metrics[0]?.metricDate;
    return payload.metricDate;
  }
  return payload.date ?? payload.metricDate;
}

function resumablePhase(lock) {
  if (lock?.phase === 'validation') return 'validation';
  if (Number.isFinite(lock?.validationExit) && lock.validationExit !== 0) return 'validation';
  if (lock?.phase === 'metrics') return lock?.artifacts?.validation ? 'metrics' : 'validation';
  if (lock?.artifacts?.metrics && lock?.artifacts?.validation) return 'notify';
  if (lock?.artifacts?.validation) return 'metrics';
  return 'validation';
}

function hasNotificationEvidence(lock) {
  const notifications = lock?.notifications;
  return Boolean(
    notifications?.stats
    || notifications?.messageId
    || (Array.isArray(notifications?.messageIds) && notifications.messageIds.length)
    || (Array.isArray(notifications?.mirrors) && notifications.mirrors.length),
  );
}

function requireIsoDate(value, name) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} must be YYYY-MM-DD.`);
  const parsed = new Date(`${text}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${name} must be a valid calendar date in YYYY-MM-DD.`);
  }
}
