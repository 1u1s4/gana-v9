import { randomUUID } from 'node:crypto';

const ROLLBACK_CODE = 'GANA_DB_CANARY_ROLLBACK';

class CanaryRollback extends Error {
  constructor() {
    super('Intentional database canary rollback.');
    this.code = ROLLBACK_CODE;
  }
}

export async function runDbWriteCanary(client, options = {}) {
  const id = options.id ?? randomUUID();
  const now = options.now ?? new Date();
  const calls = [];

  try {
    await client.$transaction(async (tx) => {
      const created = await tx.harnessRun.create({
        data: {
          id,
          runtime: 'db-write-canary',
          profile: 'supabase-cutover',
          providerSports: 'api-football',
          status: 'running',
          startedAt: now,
          metadata: { canary: true, generatedAt: now.toISOString() },
        },
      });
      calls.push('create');
      if (created.id !== id || created.status !== 'running') {
        throw new Error('Database canary create returned an unexpected row.');
      }

      const read = await tx.harnessRun.findUnique({ where: { id } });
      calls.push('read');
      if (!read || read.id !== id || read.status !== 'running') {
        throw new Error('Database canary could not read its transactional row.');
      }

      const updated = await tx.harnessRun.update({
        where: { id },
        data: { status: 'completed', completedAt: now },
      });
      calls.push('update');
      if (updated.status !== 'completed') {
        throw new Error('Database canary update was not visible in its transaction.');
      }

      throw new CanaryRollback();
    });
    throw new Error('Database canary transaction committed instead of rolling back.');
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === ROLLBACK_CODE)) throw error;
  }

  const persisted = await client.harnessRun.findUnique({ where: { id } });
  calls.push('verifyRollback');
  if (persisted) {
    await client.harnessRun.delete({ where: { id } }).catch(() => undefined);
    throw new Error('Database canary row remained after rollback; it was cleaned up defensively.');
  }

  return {
    ok: true,
    id,
    operations: calls,
    rolledBack: true,
  };
}
