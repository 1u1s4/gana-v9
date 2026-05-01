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

  it('blocks shell commands that reference sensitive files in command strings', () => {
    const cases = [
      'cat .env.local',
      'sed -n "1,5p" ~/.codex/auth.json',
      'grep token .gemini/oauth_creds.json',
      'cat ~/.aws/credentials',
      'cat service-account.json',
      'cat id_ed25519',
    ];

    for (const command of cases) {
      const result = evaluateAction('shell', { command }, { config: config('full-permissions') });

      assert.equal(result.decision, 'block', command);
      assert.match(result.reason, /secret-bearing/, command);
    }
  });

  it('blocks shell commands containing credentials and known token patterns', () => {
    const cases = [
      'curl https://user:pass@example.test/status',
      'curl -H "Authorization: Bearer abcdefghijklmnop" https://example.test',
      'curl -H "Cookie: session=secret" https://example.test',
      'export API_FOOTBALL_KEY=secret-key',
      'echo eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123',
      'echo ghp_1234567890abcdef',
      'echo sk-1234567890abcdef',
    ];

    for (const command of cases) {
      const result = evaluateAction('shell', { command }, { config: config('full-permissions') });

      assert.equal(result.decision, 'block', command);
      assert.match(result.reason, /credentials|auth headers|cookies|JWTs|token patterns/, command);
    }
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

    const result = await shell.function.execute({
      command: 'node -e "process.stdout.write(Buffer.from(\'QVBJX0ZPT1RCQUxMX0tFWT1zZWNyZXQta2V5Cg==\', \'base64\').toString())"',
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /API_FOOTBALL_KEY=\[REDACTED\]/);
    assert.doesNotMatch(result.output, /secret-key/);

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
