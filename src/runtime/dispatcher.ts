import type { DurableTask } from './scheduler.js';

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
