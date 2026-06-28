import type { DurableTask } from './scheduler.js';

export interface PersistedQueueTask {
  id: string;
  runId: string | null;
  type: string;
  status: string;
  priority: number;
  scheduledFor: Date | null;
  leaseExpiresAt: Date | null;
  attempts: number;
  maxAttempts: number;
  payload?: unknown;
  lastErrorRedacted?: string | null;
}

export interface PersistedTaskQueue<Task extends PersistedQueueTask = PersistedQueueTask> {
  listRunnable(query?: { now?: Date; take?: number }): Promise<Task[]>;
  updateStatus(id: string, update: {
    status: string;
    leaseExpiresAt?: Date | null;
    attempts?: number;
    lastErrorRedacted?: string | null;
  }): Promise<Task>;
}

export function leaseNextTask(tasks: DurableTask[], now = new Date(), leaseMs = 60_000): DurableTask | undefined {
  const candidate = tasks
    .filter((task) => task.status === 'queued' && (!task.scheduledFor || Date.parse(task.scheduledFor) <= now.getTime()))
    .sort((a, b) => a.priority - b.priority || a.taskId.localeCompare(b.taskId))[0];
  if (!candidate) return undefined;
  candidate.status = 'running';
  candidate.attempts += 1;
  candidate.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
  return candidate;
}

export async function claimNextPersistedTask<Task extends PersistedQueueTask>(
  queue: PersistedTaskQueue<Task>,
  now = new Date(),
  leaseMs = 60_000,
): Promise<Task | undefined> {
  const [candidate] = await queue.listRunnable({ now, take: 1 });
  if (!candidate) return undefined;
  return queue.updateStatus(candidate.id, {
    status: 'running',
    attempts: candidate.attempts + 1,
    leaseExpiresAt: new Date(now.getTime() + leaseMs),
    lastErrorRedacted: null,
  });
}
