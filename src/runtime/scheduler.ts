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

export function scheduleRunTasks(runId: string, input: unknown, existing: DurableTask[] = []): DurableTask[] {
  const existingTypes = new Set(existing.map((task) => task.type));
  return [
    ...existing,
    ...CANONICAL_TASK_TYPES.filter((type) => !existingTypes.has(type)).map((type, index) => {
      const inputHash = buildIdempotencyKey({ runId, type, input });
      return {
        taskId: randomUUID(),
        runId,
        type,
        status: 'queued' as const,
        priority: index,
        attempts: 0,
        maxAttempts: 3,
        idempotencyKey: buildIdempotencyKey({ runId, type }),
        inputHash,
      };
    }),
  ];
}
