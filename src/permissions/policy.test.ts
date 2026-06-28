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
      'grep token ~/.config/oauth_creds.json',
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
    const jwt = `eyJ${'hbGciOiJIUzI1NiJ9'}.eyJ${'zdWIiOiIxMjM0NTY3ODkwIn0'}.signature123`;
    const githubToken = `ghp_${'1234567890abcdef'}`;
    const openAiKey = `sk-${'1234567890abcdef'}`;
    const bearerToken = `abcd${'efghijklmnop'}`;
    const cases = [
      'curl https://user:pass@example.test/status',
      `curl -H "Authorization: Bearer ${bearerToken}" https://example.test`,
      'curl -H "Cookie: session=secret" https://example.test',
      'export API_FOOTBALL_KEY=secret-key',
      `echo ${jwt}`,
      `echo ${githubToken}`,
      `echo ${openAiKey}`,
    ];

    for (const command of cases) {
      const result = evaluateAction('shell', { command }, { config: config('full-permissions') });

      assert.equal(result.decision, 'block', command);
      assert.match(result.reason, /credentials|auth headers|cookies|JWTs|token patterns/, command);
    }
  });

  it('guarded tools audit auto-approvals and redact mutation args', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-tool-policy-'));
    const cfg = loadConfig({
      artifactRoot: join(root, 'artifacts'),
      databaseUrl: '',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
    }, { skipApiKey: true });
    const runtime = createRuntimeContext(cfg, join(root, 'session.jsonl'));
    runtime.runId = 'tool-policy-test';
    runtime.traceId = 'trace-tool-policy-test';
    const tools = createTools({ config: cfg, runtime });
    const fileWrite = tools.find((item) => item.function?.name === 'file_write');
    assert.ok(fileWrite);

    const result = await fileWrite.function.execute({
      path: '.artifacts/redacted-tool-output.txt',
      content: 'API_FOOTBALL_KEY=secret-key',
      reason: 'verify guarded tool audit redaction',
      dryRun: false,
      idempotencyKey: 'redaction-test',
    });
    assert.equal(result.written, true);

    const auditPath = join(cfg.artifactRoot, 'runs', 'tool-policy-test', 'audit-log.jsonl');
    const audit = readFileSync(auditPath, 'utf-8');
    assert.match(audit, /approval\.auto_granted/);
    assert.match(audit, /action\.completed/);
    assert.doesNotMatch(audit, /secret-key/);

    const spans = readFileSync(join(cfg.artifactRoot, 'runs', 'tool-policy-test', 'spans.jsonl'), 'utf-8');
    assert.match(spans, /policy\.evaluate/);
    assert.match(spans, /tool\.execute\.file_write/);
    assert.doesNotMatch(spans, /secret-key/);
  });

  it('registers analytical promotion tools and gates them behind manual approval', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gana-promote-policy-'));
    const cfg = loadConfig({
      artifactRoot: join(root, 'artifacts'),
      databaseUrl: '',
      profile: 'standard',
      approvalMode: 'manual',
    }, { skipApiKey: true });
    const runtime = createRuntimeContext(cfg, join(root, 'session.jsonl'));
    runtime.runId = 'promotion-policy-test';
    runtime.traceId = 'trace-promotion-policy-test';
    const tools = createTools({ config: cfg, runtime });
    const artifactPromote = tools.find((item) => item.function?.name === 'artifact_promote');
    const predictionPromote = tools.find((item) => item.function?.name === 'prediction_promote');
    assert.ok(artifactPromote);
    assert.ok(predictionPromote);

    assert.equal(evaluateAction('artifact_promote', { artifactId: 'artifact-1', runId: 'run-1' }, { config: cfg }).decision, 'require_approval');
    assert.equal(evaluateAction('prediction_promote', { predictionId: 'prediction-1', runId: 'run-1' }, { config: cfg }).decision, 'require_approval');

    const result = await artifactPromote.function.execute({
      artifactId: 'artifact-1',
      runId: 'run-1',
      target: 'handoff',
      reason: 'manual promotion review',
      dryRun: false,
      idempotencyKey: 'promote-approval-test',
    }, { toolCallId: 'tool-call-promote-1' });
    assert.equal(result.blocked, true);
    assert.equal(result.decision, 'require_approval');
    assert.ok(result.approvalId);

    const spans = readFileSync(join(cfg.artifactRoot, 'runs', 'promotion-policy-test', 'spans.jsonl'), 'utf-8');
    assert.match(spans, /policy\.evaluate/);
    assert.match(spans, /pending_approval/);
  });
});

describe('redaction policy', () => {
  it('redacts standalone provider tokens, cookies, JWTs, and env-like secrets', () => {
    const openAiKey = `sk-${'1234567890abcdef'}`;
    const githubToken = `ghp_${'1234567890abcdef'}`;
    const jwt = `eyJ${'hbGciOiJIUzI1NiJ9'}.eyJ${'zdWIiOiIxMjM0NTY3ODkwIn0'}.signature123`;
    const redacted = String(redactSecrets([
      `OPENAI_API_KEY=${openAiKey}`,
      `token=${githubToken}`,
      'Cookie: session=secret; other=value',
      `Authorization: Bearer ${jwt}`,
    ].join('\n')));

    assert.match(redacted, /\[REDACTED\]/);
    assert.equal(redacted.includes(openAiKey), false);
    assert.equal(redacted.includes(githubToken), false);
    assert.doesNotMatch(redacted, /session=secret/);
    assert.equal(redacted.includes(jwt), false);
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
