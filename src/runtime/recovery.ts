import type { DurableTask } from './scheduler.js';

export function recoverExpiredLeases(tasks: DurableTask[], now = new Date()): DurableTask[] {
  return tasks.map((task) => {
    if (task.status !== 'running' || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) > now.getTime()) return task;
    if (task.attempts >= task.maxAttempts) {
      return { ...task, status: 'failed', lastErrorRedacted: 'lease expired after max attempts' };
    }
    return { ...task, status: 'queued', leaseExpiresAt: undefined, lastErrorRedacted: 'lease expired; task requeued' };
  });
}
