import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RuntimeContext } from './context.js';
import { persistStageRun, withRunLifecycleOwnership } from './run-lifecycle.js';
import { inMemoryRunStore, parentRun } from './run-lifecycle.test-support.js';
import { createHarnessRunRepository } from '../storage/repositories/runtime.js';
import type { StoragePrismaClient } from '../storage/types.js';

describe('run lifecycle ownership', () => {
  it('preserves all parent fields across concurrent successful and failed stage writes', async () => {
    const parent = parentRun();
    const store = inMemoryRunStore(parent);
    const runtime = { runId: parent.id } as RuntimeContext;
    await withRunLifecycleOwnership(runtime, parent.id, () => Promise.all(['succeeded', 'failed'].map((status) => persistStageRun(store.repository, runtime, {
      ...parent, status, verdict: 'blocked', completedAt: new Date(), metadata: { stage: status },
    }))));
    assert.deepEqual(store.read(parent.id), parent);
  });

  it('creates a missing parent as running and retries a competing create without overwriting its winner', async () => {
    const parent = parentRun();
    const store = inMemoryRunStore();
    const runtime = {} as RuntimeContext;
    await withRunLifecycleOwnership(runtime, parent.id, () => persistStageRun(store.repository, runtime, {
      ...parent, status: 'succeeded', verdict: 'promotable', completedAt: new Date(),
    }));
    assert.equal(store.read(parent.id)?.status, 'running');
    assert.equal(store.read(parent.id)?.completedAt, null);
    assert.equal(store.read(parent.id)?.verdict, null);
    let calls = 0;
    const raced = createHarnessRunRepository({ harnessRun: { upsert: async (args: any) => {
      if (++calls === 1) throw Object.assign(new Error('competing insert won'), { code: 'P2002' });
      assert.deepEqual(args.update, {});
      return parent;
    } } } as unknown as Pick<StoragePrismaClient, 'harnessRun'>);
    assert.equal((await raced.upsertForRun(parent, { preserveExisting: true })).status, 'running');
    assert.equal(calls, 2);
  });

  it('does not swallow unrelated persistence failures', async () => {
    const repository = createHarnessRunRepository({ harnessRun: { upsert: async () => {
      throw Object.assign(new Error('connection unavailable'), { code: 'P1001' });
    } } } as unknown as Pick<StoragePrismaClient, 'harnessRun'>);
    await assert.rejects(repository.upsertForRun(parentRun(), { preserveExisting: true }), /connection unavailable/);
  });

  it('restores ownership on rejection and lets a standalone reuse the same explicit run ID through failure and success', async () => {
    const parent = parentRun();
    const runtime = { runId: parent.id } as RuntimeContext;
    await assert.rejects(withRunLifecycleOwnership(runtime, parent.id, async () => {
      assert.equal(runtime.runLifecycleOwnerId, parent.id);
      throw new Error('startup failed');
    }), /startup failed/);
    assert.equal(runtime.runLifecycleOwnerId, undefined);
    const store = inMemoryRunStore(parent);
    for (const status of ['failed', 'succeeded']) {
      await persistStageRun(store.repository, runtime, { ...parent, status, verdict: status === 'failed' ? 'blocked' : 'promotable', completedAt: new Date() });
      assert.equal(store.read(parent.id)?.status, status);
      assert.ok(store.read(parent.id)?.completedAt instanceof Date);
    }
  });

  it('restores an outer owner and never applies it to a different standalone run', async () => {
    const runtime = { runLifecycleOwnerId: 'outer' } as RuntimeContext;
    await withRunLifecycleOwnership(runtime, 'inner', async () => assert.equal(runtime.runLifecycleOwnerId, 'inner'));
    assert.equal(runtime.runLifecycleOwnerId, 'outer');
    const store = inMemoryRunStore();
    await persistStageRun(store.repository, runtime, { ...parentRun('standalone'), status: 'succeeded' });
    assert.equal(store.read('standalone')?.status, 'succeeded');
  });

  it('keeps a timed-out child read-only toward its parent after scope exit while a subsequent standalone can finish', async () => {
    const parent = parentRun();
    const runtime = { runId: parent.id } as RuntimeContext;
    const store = inMemoryRunStore(parent);
    let releaseChild!: () => void;
    const deferred = new Promise<void>((resolve) => { releaseChild = resolve; });
    let lateChild!: Promise<void>;
    await withRunLifecycleOwnership(runtime, parent.id, async () => {
      lateChild = (async () => {
        await deferred;
        await persistStageRun(store.repository, runtime, {
          ...parent, status: 'failed', verdict: 'blocked', metadata: { late: true }, completedAt: new Date(),
        });
      })();
      // The timeout path allows the owner to finalize while an uncooperative child is pending.
      await store.repository.upsertForRun({ ...parent, status: 'succeeded', completedAt: new Date() });
    });
    assert.equal(runtime.runLifecycleOwnerId, undefined);
    // A later standalone call on the same runtime and ID must not inherit the old async scope.
    await persistStageRun(store.repository, runtime, { ...parent, status: 'failed', verdict: 'blocked', metadata: { standalone: true } });
    const afterStandalone = store.read(parent.id);
    assert.equal(afterStandalone?.status, 'failed');
    releaseChild();
    await lateChild;
    assert.deepEqual(store.read(parent.id), afterStandalone);
  });

  it('does not grant ownership to a standalone outside the async scope while the shared runtime marker is active', async () => {
    const parent = parentRun();
    const runtime = { runId: parent.id } as RuntimeContext;
    const store = inMemoryRunStore(parent);
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => { release = resolve; });
    const pipeline = withRunLifecycleOwnership(runtime, parent.id, () => deferred);
    try {
      assert.equal(runtime.runLifecycleOwnerId, parent.id);
      await persistStageRun(store.repository, runtime, { ...parent, status: 'succeeded' });
      assert.equal(store.read(parent.id)?.status, 'succeeded');
    } finally {
      release();
      await pipeline;
    }
  });
});
