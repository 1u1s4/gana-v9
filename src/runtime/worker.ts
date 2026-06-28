import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from './context.js';
import { writeArtifact } from './artifacts.js';
import type { PersistedQueueTask } from './dispatcher.js';
import type { DurableTask } from './scheduler.js';

export type TaskHandler = (task: DurableTask) => Promise<unknown>;
export type PersistedTaskHandler<Task extends PersistedQueueTask = PersistedQueueTask> = (task: Task) => Promise<unknown>;

export interface TaskLeaseStore<Task = unknown> {
  updateStatus(id: string, update: {
    status: string;
    leaseExpiresAt?: Date | null;
    attempts?: number;
    lastErrorRedacted?: string | null;
  }): Promise<Task>;
}

export function nextLeaseExpiry(now = new Date(), leaseMs = 60_000): Date {
  return new Date(now.getTime() + leaseMs);
}

export async function renewTaskLease<Task>(store: TaskLeaseStore<Task>, taskId: string, now = new Date(), leaseMs = 60_000): Promise<Task> {
  return store.updateStatus(taskId, { status: 'running', leaseExpiresAt: nextLeaseExpiry(now, leaseMs) });
}

export async function completeTaskLease<Task>(store: TaskLeaseStore<Task>, taskId: string, attempts?: number): Promise<Task> {
  return store.updateStatus(taskId, { status: 'succeeded', leaseExpiresAt: null, attempts, lastErrorRedacted: null });
}

export async function failTaskLease<Task>(store: TaskLeaseStore<Task>, task: { id: string; attempts: number; maxAttempts: number }, error: string): Promise<Task> {
  return store.updateStatus(task.id, {
    status: task.attempts >= task.maxAttempts ? 'failed' : 'queued',
    leaseExpiresAt: null,
    attempts: task.attempts,
    lastErrorRedacted: error,
  });
}

export async function executePersistedTask<Task extends PersistedQueueTask>(
  store: TaskLeaseStore<Task>,
  task: Task,
  handler: PersistedTaskHandler<Task>,
): Promise<{ task: Task; output?: unknown }> {
  try {
    const output = await handler(task);
    return { task: await completeTaskLease(store, task.id, task.attempts), output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { task: await failTaskLease(store, task, message) };
  }
}

export async function executeDurableTask(
  config: AgentConfig,
  runtime: RuntimeContext,
  task: DurableTask,
  handler: TaskHandler,
): Promise<DurableTask> {
  runtime.taskId = task.taskId;
  try {
    const output = await handler(task);
    const artifactPath = writeArtifact(config, task.runId, `${task.type}-${task.taskId}.json`, output);
    return { ...task, status: 'succeeded', outputArtifactId: artifactPath, gateResult: { verdict: 'promotable' } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const artifactPath = writeArtifact(config, task.runId, `${task.type}-${task.taskId}-failed.json`, { error: message });
    return { ...task, status: 'failed', outputArtifactId: artifactPath, lastErrorRedacted: message };
  } finally {
    runtime.taskId = undefined;
  }
}
