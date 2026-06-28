import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * J-44 smoke model for the persisted harness queue resiliency contract.
 *
 * This deliberately uses an in-memory fake persistence adapter instead of the
 * real Prisma client so the smoke runs in CI without external provider or DB
 * I/O. The fake keeps durable queue rows and TaskRun rows in a shared store,
 * which lets two worker adapters race against the same persisted state.
 */
type SmokeTaskStatus = 'queued' | 'running' | 'succeeded' | 'quarantined';
type SmokeTaskRunStatus = 'running' | 'expired' | 'failed' | 'succeeded';

interface SmokeTask {
  id: string;
  type: string;
  status: SmokeTaskStatus;
  attempts: number;
  maxAttempts: number;
  priority: number;
  scheduledFor: Date | null;
  leaseExpiresAt: Date | null;
  activeTaskRunId: string | null;
  quarantineReason: string | null;
  manualRedriveToken: string | null;
}

interface SmokeTaskRun {
  id: string;
  taskId: string;
  workerId: string;
  attempt: number;
  status: SmokeTaskRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
}

class PersistedQueueSmokeStore {
  private readonly tasks = new Map<string, SmokeTask>();
  private readonly taskRuns = new Map<string, SmokeTaskRun>();
  private nextRunSequence = 1;

  enqueue(input: Pick<SmokeTask, 'id' | 'type' | 'priority' | 'maxAttempts'> & Partial<Pick<SmokeTask, 'scheduledFor'>>): SmokeTask {
    const task: SmokeTask = {
      id: input.id,
      type: input.type,
      status: 'queued',
      attempts: 0,
      maxAttempts: input.maxAttempts,
      priority: input.priority,
      scheduledFor: input.scheduledFor ?? null,
      leaseExpiresAt: null,
      activeTaskRunId: null,
      quarantineReason: null,
      manualRedriveToken: null,
    };
    this.tasks.set(task.id, task);
    return { ...task };
  }

  adapter(workerId: string): SmokeWorkerAdapter {
    return new SmokeWorkerAdapter(workerId, this);
  }

  claimNext(workerId: string, now: Date, leaseMs: number): { task: SmokeTask; taskRun: SmokeTaskRun } | null {
    const candidate = [...this.tasks.values()]
      .filter((task) => task.status === 'queued' && (!task.scheduledFor || task.scheduledFor.getTime() <= now.getTime()))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];

    if (!candidate) return null;

    candidate.status = 'running';
    candidate.attempts += 1;
    candidate.leaseExpiresAt = new Date(now.getTime() + leaseMs);
    candidate.quarantineReason = null;
    candidate.manualRedriveToken = null;

    const taskRun: SmokeTaskRun = {
      id: `task-run-${this.nextRunSequence++}`,
      taskId: candidate.id,
      workerId,
      attempt: candidate.attempts,
      status: 'running',
      startedAt: now,
      finishedAt: null,
    };
    candidate.activeTaskRunId = taskRun.id;
    this.taskRuns.set(taskRun.id, taskRun);
    return { task: { ...candidate }, taskRun: { ...taskRun } };
  }

  recoverExpiredLeases(now: Date): SmokeTask[] {
    const recovered: SmokeTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'running' || !task.leaseExpiresAt || task.leaseExpiresAt.getTime() > now.getTime()) continue;

      const activeRun = task.activeTaskRunId ? this.taskRuns.get(task.activeTaskRunId) : undefined;
      if (activeRun) {
        activeRun.status = 'expired';
        activeRun.finishedAt = now;
      }

      if (task.attempts >= task.maxAttempts) {
        this.quarantine(task, `lease expired after ${task.attempts} attempts`);
      } else {
        task.status = 'queued';
        task.scheduledFor = new Date(now.getTime() + retryBackoffMs(task.attempts));
        task.leaseExpiresAt = null;
        task.activeTaskRunId = null;
      }
      recovered.push({ ...task });
    }
    return recovered;
  }

  failActiveRun(taskId: string, now: Date, reason: string): SmokeTask {
    const task = this.requireTask(taskId);
    assert.equal(task.status, 'running');
    const activeRun = task.activeTaskRunId ? this.taskRuns.get(task.activeTaskRunId) : undefined;
    if (activeRun) {
      activeRun.status = 'failed';
      activeRun.finishedAt = now;
    }

    if (task.attempts >= task.maxAttempts) {
      this.quarantine(task, reason);
    } else {
      task.status = 'queued';
      task.scheduledFor = new Date(now.getTime() + retryBackoffMs(task.attempts));
      task.leaseExpiresAt = null;
      task.activeTaskRunId = null;
    }
    return { ...task };
  }

  redriveFromDlq(taskId: string, token: string, now: Date): SmokeTask {
    const task = this.requireTask(taskId);
    assert.equal(task.status, 'quarantined');
    assert.equal(task.manualRedriveToken, token);

    task.status = 'queued';
    task.attempts = 0;
    task.scheduledFor = now;
    task.leaseExpiresAt = null;
    task.activeTaskRunId = null;
    task.quarantineReason = null;
    task.manualRedriveToken = null;
    return { ...task };
  }

  task(taskId: string): SmokeTask {
    return { ...this.requireTask(taskId) };
  }

  runsForTask(taskId: string): SmokeTaskRun[] {
    return [...this.taskRuns.values()].filter((run) => run.taskId === taskId).map((run) => ({ ...run }));
  }

  private quarantine(task: SmokeTask, reason: string): void {
    task.status = 'quarantined';
    task.scheduledFor = null;
    task.leaseExpiresAt = null;
    task.activeTaskRunId = null;
    task.quarantineReason = reason;
    task.manualRedriveToken = `redrive:${task.id}:${task.attempts}`;
  }

  private requireTask(taskId: string): SmokeTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`unknown task ${taskId}`);
    return task;
  }
}

class SmokeWorkerAdapter {
  constructor(private readonly workerId: string, private readonly store: PersistedQueueSmokeStore) {}

  claimNext(now: Date, leaseMs = 60_000): { task: SmokeTask; taskRun: SmokeTaskRun } | null {
    return this.store.claimNext(this.workerId, now, leaseMs);
  }
}

function retryBackoffMs(attempt: number): number {
  return Math.min(5 * 60_000, 2 ** Math.max(0, attempt - 1) * 1_000);
}

describe('cross-worker persisted queue smoke and recovery coverage', () => {
  it('prevents two worker adapters from double-claiming the same persisted queued task', () => {
    const store = new PersistedQueueSmokeStore();
    store.enqueue({ id: 'task-1', type: 'score.fixture', priority: 10, maxAttempts: 3 });

    const firstClaim = store.adapter('worker-a').claimNext(new Date('2026-06-28T10:00:00.000Z'));
    const secondClaim = store.adapter('worker-b').claimNext(new Date('2026-06-28T10:00:00.000Z'));

    assert.equal(firstClaim?.task.id, 'task-1');
    assert.equal(firstClaim?.taskRun.workerId, 'worker-a');
    assert.equal(secondClaim, null, 'shared persisted queue state must make the running task invisible to the second worker');
    assert.equal(store.task('task-1').status, 'running');
    assert.equal(store.runsForTask('task-1').length, 1, 'only one TaskRun is created for the first claim');
  });

  it('recovers expired running leases and reattempts them with a new TaskRun after backoff', () => {
    const store = new PersistedQueueSmokeStore();
    store.enqueue({ id: 'task-2', type: 'research.fixture', priority: 1, maxAttempts: 3 });

    const firstClaim = store.adapter('worker-a').claimNext(new Date('2026-06-28T10:00:00.000Z'), 1_000);
    assert.equal(firstClaim?.taskRun.id, 'task-run-1');

    const recovered = store.recoverExpiredLeases(new Date('2026-06-28T10:00:02.000Z'));
    assert.equal(recovered[0]?.status, 'queued');
    assert.equal(recovered[0]?.scheduledFor?.toISOString(), '2026-06-28T10:00:03.000Z');
    assert.equal(store.adapter('worker-b').claimNext(new Date('2026-06-28T10:00:02.500Z')), null, 'backoff window blocks immediate retry');

    const secondClaim = store.adapter('worker-b').claimNext(new Date('2026-06-28T10:00:03.000Z'));
    const runs = store.runsForTask('task-2');

    assert.equal(secondClaim?.taskRun.id, 'task-run-2');
    assert.equal(secondClaim?.taskRun.workerId, 'worker-b');
    assert.notEqual(secondClaim?.taskRun.id, firstClaim?.taskRun.id, 'reattempts must be represented by a fresh TaskRun');
    assert.deepEqual(runs.map((run) => run.status), ['expired', 'running']);
    assert.deepEqual(runs.map((run) => run.attempt), [1, 2]);
  });

  it('backs off retries and moves exhausted tasks to quarantine/DLQ with manual redrive', () => {
    const store = new PersistedQueueSmokeStore();
    store.enqueue({ id: 'task-3', type: 'parlay.build', priority: 1, maxAttempts: 2 });

    store.adapter('worker-a').claimNext(new Date('2026-06-28T10:00:00.000Z'));
    const afterFirstFailure = store.failActiveRun('task-3', new Date('2026-06-28T10:00:10.000Z'), 'provider timeout redacted');
    assert.equal(afterFirstFailure.status, 'queued');
    assert.equal(afterFirstFailure.scheduledFor?.toISOString(), '2026-06-28T10:00:11.000Z');

    assert.equal(store.adapter('worker-b').claimNext(new Date('2026-06-28T10:00:10.500Z')), null, 'retry backoff must delay the next claim');
    store.adapter('worker-b').claimNext(new Date('2026-06-28T10:00:11.000Z'));
    const exhausted = store.failActiveRun('task-3', new Date('2026-06-28T10:00:20.000Z'), 'provider timeout redacted');

    assert.equal(exhausted.status, 'quarantined');
    assert.equal(exhausted.quarantineReason, 'provider timeout redacted');
    assert.equal(exhausted.manualRedriveToken, 'redrive:task-3:2');
    assert.equal(store.adapter('worker-c').claimNext(new Date('2026-06-28T10:00:21.000Z')), null, 'DLQ tasks are not runnable until manually redriven');

    const redriven = store.redriveFromDlq('task-3', exhausted.manualRedriveToken!, new Date('2026-06-28T10:01:00.000Z'));
    assert.equal(redriven.status, 'queued');
    assert.equal(redriven.attempts, 0);
    assert.equal(redriven.manualRedriveToken, null);

    const redriveClaim = store.adapter('worker-c').claimNext(new Date('2026-06-28T10:01:00.000Z'));
    assert.equal(redriveClaim?.taskRun.id, 'task-run-3');
    assert.equal(redriveClaim?.taskRun.attempt, 1);
  });
});
