import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadConfig } from '../config.js';
import { appendAuditEvent } from '../permissions/audit.js';
import { createRuntimeContext } from './context.js';
import { writeArtifact } from './artifacts.js';

describe('artifact redaction policy', () => {
  it('redacts sensitive keys, auth schemes, query secrets, and URL credentials before writing artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-artifact-test-'));
    const cfg = loadConfig({ artifactRoot: join(root, 'artifacts'), databaseUrl: '' }, { skipApiKey: true });

    const path = writeArtifact(cfg, 'run-redaction', 'payload.json', {
      apiKey: 'api-key-123',
      nested: {
        authorization: 'Bearer token-123',
        callback: 'https://example.test/path?token=query-token&safe=value',
      },
      databaseUrl: 'postgres://user:password@db.example.test:5432/gana?schema=public',
      message: [
        'Authorization: Basic dXNlcjpwYXNz',
        'DATABASE_URL=mysql://user:pass@localhost:3306/gana',
      ].join('\n'),
    });

    const output = readFileSync(path, 'utf-8');
    assert.match(output, /\[REDACTED\]/);
    assert.doesNotMatch(output, /api-key-123/);
    assert.doesNotMatch(output, /token-123/);
    assert.doesNotMatch(output, /query-token/);
    assert.doesNotMatch(output, /password/);
    assert.doesNotMatch(output, /user:pass/);
    assert.match(output, /safe=value/);
  });

  it('records policy context in audit events while redacting payload secrets', () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-audit-test-'));
    const cfg = loadConfig({
      artifactRoot: join(root, 'artifacts'),
      databaseUrl: '',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
      model: 'gpt-5.5',
    }, { skipApiKey: true });
    const runtime = createRuntimeContext(cfg, join(root, 'session.jsonl'));

    const path = appendAuditEvent(runtime, {
      type: 'approval.requested',
      payload: {
        action: 'provider.status',
        token: 'secret-token',
        url: 'https://user:pass@example.test/status?api_key=secret-key',
      },
    });

    const entry = JSON.parse(readFileSync(path, 'utf-8').trim());
    assert.equal(entry.context.profile, 'full-permissions');
    assert.equal(entry.context.approvalMode, 'auto-grant');
    assert.equal(entry.context.model, 'gpt-5.5');
    assert.equal(entry.payload.action, 'provider.status');
    assert.equal(entry.payload.token, '[REDACTED]');
    assert.match(entry.payload.url, /\[REDACTED\]/);
    assert.doesNotMatch(JSON.stringify(entry), /secret-token|secret-key|user:pass/);
  });
});
