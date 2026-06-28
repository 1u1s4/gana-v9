import { randomUUID } from 'crypto';
import { buildIdempotencyKey } from './idempotency.js';

export const CANONICAL_TASK_TYPES = [
  'fixtures.fetch',
  'odds.fetch',
  'low_odds.scan',
  'research.fixture',
  'score.fixture',
  'parlay.build',
  'validation.run',
  'parlay.analyze',
  'evidence_pack.export',
] as const;

export type CanonicalTaskType = typeof CANONICAL_TASK_TYPES[number];
export type DurableTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked';

export interface DurableTask {
  taskId: string;
  runId: string;
  type: CanonicalTaskType;
  status: DurableTaskStatus;
  priority: number;
  scheduledFor?: string;
  leaseExpiresAt?: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  inputHash: string;
  outputArtifactId?: string;
  gateResult?: unknown;
  lastErrorRedacted?: string;
}

export interface ScheduledTaskSpec {
  runId: string;
  type: CanonicalTaskType;
  priority: number;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  inputHash: string;
  payload: {
    idempotencyKey: string;
    inputHash: string;
  };
}

export interface PersistedTaskEnqueuer<PersistedTask = { id: string }> {
  enqueue(input: {
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
  }): Promise<PersistedTask>;
}

export function buildRunTaskSpecs(runId: string, input: unknown, existingTypes: Iterable<string> = []): ScheduledTaskSpec[] {
  const knownTypes = new Set(existingTypes);
  return CANONICAL_TASK_TYPES.filter((type) => !knownTypes.has(type)).map((type, index) => {
    const inputHash = buildIdempotencyKey({ runId, type, input });
    const idempotencyKey = buildIdempotencyKey({ runId, type });
    return {
      runId,
      type,
      priority: index,
      attempts: 0,
      maxAttempts: 3,
      idempotencyKey,
      inputHash,
      payload: { idempotencyKey, inputHash },
    };
  });
}

export async function enqueuePersistedRunTasks<PersistedTask extends { id: string }>(
  repository: PersistedTaskEnqueuer<PersistedTask>,
  runId: string,
  input: unknown,
  existingTypes: Iterable<string> = [],
): Promise<DurableTask[]> {
  const specs = buildRunTaskSpecs(runId, input, existingTypes);
  const tasks: DurableTask[] = [];
  for (const spec of specs) {
    const record = await repository.enqueue({
      type: spec.type,
      status: 'queued',
      priority: spec.priority,
      runId: spec.runId,
      attempts: spec.attempts,
      maxAttempts: spec.maxAttempts,
      payload: spec.payload,
    });
    tasks.push({
      taskId: record.id,
      runId: spec.runId,
      type: spec.type,
      status: 'queued',
      priority: spec.priority,
      attempts: spec.attempts,
      maxAttempts: spec.maxAttempts,
      idempotencyKey: spec.idempotencyKey,
      inputHash: spec.inputHash,
    });
  }
  return tasks;
}

export function scheduleRunTasks(runId: string, input: unknown, existing: DurableTask[] = []): DurableTask[] {
  const newTasks = buildRunTaskSpecs(runId, input, existing.map((task) => task.type)).map((spec) => ({
    taskId: randomUUID(),
    runId: spec.runId,
    type: spec.type,
    status: 'queued' as const,
    priority: spec.priority,
    attempts: spec.attempts,
    maxAttempts: spec.maxAttempts,
    idempotencyKey: spec.idempotencyKey,
    inputHash: spec.inputHash,
  }));
  return [...existing, ...newTasks];
}
