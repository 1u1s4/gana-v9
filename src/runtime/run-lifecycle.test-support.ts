import { createHarnessRunRepository } from '../storage/repositories/runtime.js';
import type { HarnessRunInput, HarnessRunRecord, StoragePrismaClient } from '../storage/types.js';
import type { RuntimeContext } from './context.js';
import { withRunLifecycleOwnership } from './run-lifecycle.js';

export function runInTestScope<T>(nested: boolean, runtime: RuntimeContext, operation: () => Promise<T>): Promise<T> {
  return nested ? withRunLifecycleOwnership(runtime, runtime.runId!, operation) : operation();
}

export function inMemoryRunStore(initial?: HarnessRunInput & { id: string }) {
  const rows = new Map<string, Record<string, unknown>>();
  if (initial) rows.set(initial.id, structuredClone({ ...initial }));
  const writes: Array<{ where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const repository = createHarnessRunRepository({
    harnessRun: {
      async findUnique({ where }: { where: { id: string } }) {
        return structuredClone(rows.get(where.id) ?? null);
      },
      async upsert(args: typeof writes[number]) {
        writes.push(args);
        const existing = rows.get(args.where.id);
        const next = existing ? { ...existing, ...args.update } : { ...args.create };
        rows.set(args.where.id, next);
        return structuredClone(next) as unknown as HarnessRunRecord;
      },
    },
  } as unknown as Pick<StoragePrismaClient, 'harnessRun'>);
  return { repository, writes, read: (id: string) => structuredClone(rows.get(id)) };
}

export function parentRun(id = 'parent-run'): HarnessRunInput & { id: string } {
  return {
    id, runtime: 'test', profile: 'standard', providerSports: 'api-football',
    status: 'running', verdict: null, completedAt: null,
    startedAt: new Date('2026-04-25T10:00:00.000Z'), metadata: { parent: true },
  };
}
