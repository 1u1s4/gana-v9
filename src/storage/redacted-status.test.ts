import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDbStatus } from './db.js';
import { redactedConnectionIdentity } from './redacted-status.js';

describe('storage redacted status', () => {
  it('redacts connection identity without leaking credentials or full host', () => {
    const identity = redactedConnectionIdentity(
      'mysql://doadmin:secret@example-db-do-user-123.example.com:25060/gana_v9_ops_20260425?sslaccept=accept_invalid_certs',
    );

    assert.equal(identity.engine, 'mysql');
    assert.equal(identity.port, '25060');
    assert.notEqual(identity.host, 'example-db-do-user-123.example.com');
    assert.notEqual(identity.database, 'gana_v9_ops_20260425');
    assert.notEqual(identity.user, 'doadmin');
    assert.doesNotMatch(JSON.stringify(identity), /secret|doadmin|gana_v9_ops_20260425|example-db-do-user-123/);
  });

  it('returns an actionable missing status when DATABASE_URL is absent', async () => {
    const status = await getDbStatus({ databaseUrl: '' });

    assert.equal(status.status, 'missing');
    assert.equal(status.config.engine, 'unknown');
    assert.deepEqual(status.missing, ['connection']);
  });

  it('rejects non-mysql urls for the active PR-03 override', async () => {
    const status = await getDbStatus({ databaseUrl: 'postgresql://user:secret@example.com:5432/db' });

    assert.equal(status.status, 'disconnected');
    assert.equal(status.config.engine, 'postgresql');
    assert.doesNotMatch(JSON.stringify(status), /secret/);
  });
});
