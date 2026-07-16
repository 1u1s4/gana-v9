import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runDbWriteCanary } from '../lib/db-write-canary.mjs';

describe('database write canary', () => {
  it('creates, reads and updates inside a transaction, then proves rollback', async () => {
    const rows = new Map();
    const operations = [];
    const harnessRun = {
      create: async ({ data }) => {
        operations.push('create');
        const row = { ...data };
        rows.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }) => {
        operations.push('read');
        return rows.get(where.id) ?? null;
      },
      update: async ({ where, data }) => {
        operations.push('update');
        const row = { ...rows.get(where.id), ...data };
        rows.set(where.id, row);
        return row;
      },
      delete: async ({ where }) => {
        operations.push('delete');
        rows.delete(where.id);
      },
    };
    const client = {
      harnessRun,
      $transaction: async (callback) => {
        const snapshot = new Map(rows);
        try {
          return await callback({ harnessRun });
        } catch (error) {
          rows.clear();
          for (const [key, value] of snapshot) rows.set(key, value);
          throw error;
        }
      },
    };

    const result = await runDbWriteCanary(client, {
      id: '11111111-1111-4111-8111-111111111111',
      now: new Date('2026-07-14T18:00:00.000Z'),
    });

    assert.equal(result.ok, true);
    assert.equal(result.rolledBack, true);
    assert.deepEqual(result.operations, ['create', 'read', 'update', 'verifyRollback']);
    assert.deepEqual(operations, ['create', 'read', 'update', 'read']);
    assert.equal(rows.size, 0);
  });
});
