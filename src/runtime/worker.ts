import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from './context.js';
import { writeArtifact } from './artifacts.js';
import type { DurableTask } from './scheduler.js';

export type TaskHandler = (task: DurableTask) => Promise<unknown>;

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
