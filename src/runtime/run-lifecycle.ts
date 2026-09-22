import { AsyncLocalStorage } from 'node:async_hooks';
import type { HarnessRunInput } from '../storage/types.js';
import type { RuntimeContext } from './context.js';

const runOwnership = new AsyncLocalStorage<{ runtime: RuntimeContext; runId: string }>();

export interface RunWriteOptions {
  preserveExisting?: boolean;
}

export interface StageRunRepository {
  upsertForRun?(input: HarnessRunInput & { id: string }, options?: RunWriteOptions): Promise<unknown>;
}

/** Stage persistence must not finish or replace the enclosing pipeline's run. */
export async function persistStageRun(
  repository: StageRunRepository | undefined,
  runtime: RuntimeContext,
  input: HarnessRunInput & { id: string },
): Promise<void> {
  const inheritedOwner = runOwnership.getStore();
  const ownerId = inheritedOwner?.runtime === runtime ? inheritedOwner.runId : undefined;
  if (ownerId === input.id) {
    await repository?.upsertForRun?.(input, { preserveExisting: true });
  } else {
    await repository?.upsertForRun?.(input);
  }
}

export async function withRunLifecycleOwnership<T>(
  runtime: RuntimeContext,
  runId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previousOwner = runtime.runLifecycleOwnerId;
  runtime.runLifecycleOwnerId = runId;
  try {
    // Async descendants retain ownership even if a timeout lets the pipeline return first.
    return await runOwnership.run({ runtime, runId }, operation);
  } finally {
    if (previousOwner === undefined) delete runtime.runLifecycleOwnerId;
    else runtime.runLifecycleOwnerId = previousOwner;
  }
}
