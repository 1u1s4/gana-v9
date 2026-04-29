import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { createRuntimeContext } from '../runtime/context.js';
import { createTools } from '../tools/index.js';
import { appendAuditEvent } from './audit.js';
import { evaluateAction } from './policy.js';
import { redactSecrets } from './redaction.js';

function config(profile: 'standard' | 'full-permissions' = 'standard') {
  return loadConfig({
    profile,
    approvalMode: profile === 'full-permissions' ? 'auto-grant' : 'manual',
    databaseUrl: '',
  }, { skipApiKey: true });
}

describe('permission policy', () => {
  it('allows read-only tools without approval', () => {
    const result = evaluateAction('file_read', { path: 'src/config.ts' }, { config: config() });

    assert.equal(result.decision, 'allow');
    assert.equal(result.approvalKind, 'none');
  });

  it('requires manual approval for standard profile filesystem mutations', () => {
    const result = evaluateAction('file_write', { path: 'tmp/file.txt' }, { config: config() });

    assert.equal(result.decision, 'require_approval');
    assert.equal(result.approvalKind, 'manual');
  });

  it('auto-grants standard-sensitive actions under full-permissions', () => {
    const result = evaluateAction('file_edit', { path: 'tmp/file.txt' }, { config: config('full-permissions') });

    assert.equal(result.decision, 'allow');
    assert.equal(result.approvalKind, 'auto');
  });

  it('blocks destructive shell commands even under full-permissions', () => {
    const result = evaluateAction('shell', { command: 'rm -rf .artifacts' }, { config: config('full-permissions') });

    assert.equal(result.decision, 'block');
    assert.match(result.reason, /Destructive actions/);
  });

  it('blocks secret-bearing local paths', () => {
    const result = evaluateAction('file_read', { path: '.env' }, { config: config() });

    assert.equal(result.decision, 'block');
    assert.match(result.reason, /secret-bearing/);
  });

  it('guarded tools audit auto-approvals and redact outputs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-tool-policy-'));
    const cfg = loadConfig({
      artifactRoot: join(root, 'artifacts'),
      databaseUrl: '',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
    }, { skipApiKey: true });
    const runtime = createRuntimeContext(cfg, join(root, 'session.jsonl'));
    const tools = createTools({ config: cfg, runtime });
    const shell = tools.find((item) => item.function?.name === 'shell');
    assert.ok(shell);

    const result = await shell.function.execute({ command: 'printf "API_FOOTBALL_KEY=secret-key\\n"' });
    assert.equal(result.exitCode, 0);

    const auditPath = join(cfg.artifactRoot, 'runs', 'session-session', 'audit-log.jsonl');
    const audit = readFileSync(auditPath, 'utf-8');
    assert.match(audit, /approval\.auto_granted/);
    assert.match(audit, /action\.completed/);
    assert.doesNotMatch(audit, /secret-key/);
  });
});

describe('redaction policy', () => {
  it('redacts standalone provider tokens, cookies, JWTs, and env-like secrets', () => {
    const redacted = String(redactSecrets([
      'OPENAI_API_KEY=sk-1234567890abcdef',
      'token=ghp_1234567890abcdef',
      'Cookie: session=secret; other=value',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123',
    ].join('\n')));

    assert.match(redacted, /\[REDACTED\]/);
    assert.doesNotMatch(redacted, /sk-1234567890abcdef/);
    assert.doesNotMatch(redacted, /ghp_1234567890abcdef/);
    assert.doesNotMatch(redacted, /session=secret/);
    assert.doesNotMatch(redacted, /eyJhbGci/);
  });

  it('keeps audit payloads redacted on disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-audit-redaction-'));
    const cfg = loadConfig({ artifactRoot: join(root, 'artifacts'), databaseUrl: '' }, { skipApiKey: true });
    const runtime = createRuntimeContext(cfg, join(root, 'session.jsonl'));
    const path = appendAuditEvent(runtime, {
      type: 'approval.granted',
      payload: { actionId: 'act_test', apiFootballKey: 'secret-key', url: 'mysql://user:pass@localhost/db' },
    });

    const body = readFileSync(path, 'utf-8');
    assert.match(body, /act_test/);
    assert.doesNotMatch(body, /secret-key|user:pass/);
  });
});
