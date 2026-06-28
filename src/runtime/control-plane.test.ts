import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimNextPersistedTask, type PersistedQueueTask } from './dispatcher.js';
import { enqueuePersistedRunTasks } from './scheduler.js';
import { executePersistedTask, renewTaskLease } from './worker.js';

class InMemoryTaskQueue {
  readonly tasks: PersistedQueueTask[] = [];

  async enqueue(input: {
    type: string;
    status?: string;
    priority?: number;
    runId?: string | null;
    scheduledFor?: Date | null;
    leaseExpiresAt?: Date | null;
    attempts?: number;
    maxAttempts?: number;
    payload?: unknown;
    lastErrorRedacted?: string | null;
  }): Promise<PersistedQueueTask> {
    const task: PersistedQueueTask = {
      id: `task-${this.tasks.length + 1}`,
      runId: input.runId ?? null,
      type: input.type,
      status: input.status ?? 'queued',
      priority: input.priority ?? 0,
      scheduledFor: input.scheduledFor ?? null,
      leaseExpiresAt: input.leaseExpiresAt ?? null,
      attempts: input.attempts ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      payload: input.payload,
      lastErrorRedacted: input.lastErrorRedacted ?? null,
    };
    this.tasks.push(task);
    return task;
  }

  async listRunnable(query: { now?: Date; take?: number } = {}): Promise<PersistedQueueTask[]> {
    const now = query.now ?? new Date();
    return this.tasks
      .filter((task) => task.status === 'queued' && (!task.scheduledFor || task.scheduledFor.getTime() <= now.getTime()))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
      .slice(0, query.take);
  }

  async updateStatus(id: string, update: {
    status: string;
    leaseExpiresAt?: Date | null;
    attempts?: number;
    lastErrorRedacted?: string | null;
  }): Promise<PersistedQueueTask> {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new Error(`missing task ${id}`);
    task.status = update.status;
    if ('leaseExpiresAt' in update) task.leaseExpiresAt = update.leaseExpiresAt ?? null;
    if ('attempts' in update && update.attempts !== undefined) task.attempts = update.attempts;
    if ('lastErrorRedacted' in update) task.lastErrorRedacted = update.lastErrorRedacted ?? null;
    return task;
  }
}

describe('control-plane scheduler/dispatcher/worker boundaries', () => {
  it('scheduler only enqueues persisted queued tasks and does not claim or execute them', async () => {
    const queue = new InMemoryTaskQueue();

    const tasks = await enqueuePersistedRunTasks(queue, 'run-control-1', { date: '2026-06-28' });

    assert.equal(tasks.length, 9);
    assert.deepEqual([...new Set(queue.tasks.map((task) => task.status))], ['queued']);
    assert.equal(queue.tasks.every((task) => task.attempts === 0), true);
    assert.equal(queue.tasks.every((task) => task.leaseExpiresAt === null), true);
    assert.equal(queue.tasks[0].type, 'fixtures.fetch');
    assert.deepEqual(queue.tasks.map((task) => task.id), tasks.map((task) => task.taskId));
  });

  it('dispatcher claims the next persisted task and worker renews/completes the same lease', async () => {
    const queue = new InMemoryTaskQueue();
    await enqueuePersistedRunTasks(queue, 'run-control-2', { date: '2026-06-28' });

    const claimed = await claimNextPersistedTask(queue, new Date('2026-06-28T00:00:00.000Z'), 30_000);
    assert.equal(claimed?.type, 'fixtures.fetch');
    assert.equal(claimed?.status, 'running');
    assert.equal(claimed?.attempts, 1);
    assert.equal(claimed?.leaseExpiresAt?.toISOString(), '2026-06-28T00:00:30.000Z');

    const renewed = await renewTaskLease(queue, claimed.id, new Date('2026-06-28T00:00:10.000Z'), 45_000);
    assert.equal(renewed.status, 'running');
    assert.equal(renewed.leaseExpiresAt?.toISOString(), '2026-06-28T00:00:55.000Z');

    const result = await executePersistedTask(queue, renewed, async (task) => ({ ok: true, taskId: task.id }));
    assert.deepEqual(result.output, { ok: true, taskId: claimed.id });
    assert.equal(result.task.status, 'succeeded');
    assert.equal(result.task.leaseExpiresAt, null);
  });

  it('worker returns failed leases to the persisted queue until max attempts is reached', async () => {
    const queue = new InMemoryTaskQueue();
    const [queued] = await enqueuePersistedRunTasks(queue, 'run-control-3', { date: '2026-06-28' });
    const claimed = await claimNextPersistedTask(queue, new Date('2026-06-28T00:00:00.000Z'), 30_000);
    assert.equal(claimed?.id, queued.taskId);

    const firstFailure = await executePersistedTask(queue, claimed, async () => {
      throw new Error('transient provider failure');
    });
    assert.equal(firstFailure.task.status, 'queued');
    assert.equal(firstFailure.task.lastErrorRedacted, 'transient provider failure');

    firstFailure.task.attempts = firstFailure.task.maxAttempts;
    const finalFailure = await executePersistedTask(queue, firstFailure.task, async () => {
      throw new Error('permanent provider failure');
    });
    assert.equal(finalFailure.task.status, 'failed');
    assert.equal(finalFailure.task.leaseExpiresAt, null);
    assert.equal(finalFailure.task.lastErrorRedacted, 'permanent provider failure');
  });
});
