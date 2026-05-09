import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { codexArgs, cursorArgs, geminiArgs, runAgent } from './agent.js';
import { loadConfig, type AgentConfig } from './config.js';
import { deriveNativeWebSearchRequirement } from './providers/agentic/helpers.js';

function config(overrides: Partial<AgentConfig>): AgentConfig {
  return loadConfig({
    profile: 'standard',
    approvalMode: 'manual',
    provider: 'codex',
    model: 'test-model',
    codexSandbox: 'workspace-write',
    geminiApprovalMode: 'default',
    cursorTrust: false,
    cursorForce: false,
    nativeWebSearch: false,
    ...overrides,
  }, { skipApiKey: true });
}

function requirement(cfg: AgentConfig) {
  return deriveNativeWebSearchRequirement(cfg, { required: false });
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('native provider args', () => {
  it('does not elevate Codex sandbox from full-permissions profile alone', () => {
    const cfg = config({
      provider: 'codex',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
      codexSandbox: 'workspace-write',
    });

    assert.equal(argValue(codexArgs(cfg, 'prompt', requirement(cfg)), '--sandbox'), 'workspace-write');
  });

  it('uses Codex danger-full-access only when explicitly configured', () => {
    const cfg = config({
      provider: 'codex',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
      codexSandbox: 'danger-full-access',
    });

    assert.equal(argValue(codexArgs(cfg, 'prompt', requirement(cfg)), '--sandbox'), 'danger-full-access');
  });

  it('can send Codex prompts over stdin with structured output files', () => {
    const cfg = config({ provider: 'codex' });
    const args = codexArgs(cfg, 'prompt', requirement(cfg), {
      outputSchemaPath: '/tmp/schema.json',
      outputLastMessagePath: '/tmp/last-message.json',
      useStdinPrompt: true,
    });

    assert.equal(argValue(args, '--output-schema'), '/tmp/schema.json');
    assert.equal(argValue(args, '--output-last-message'), '/tmp/last-message.json');
    assert.equal(args.at(-1), '-');
    assert.equal(args.includes('prompt'), false);
  });

  it('omits unsupported Codex resume --output-schema while preserving last-message capture', () => {
    const cfg = config({ provider: 'codex', codexThreadId: 'thread-1' });
    const args = codexArgs(cfg, 'prompt', requirement(cfg), {
      outputSchemaPath: '/tmp/schema.json',
      outputLastMessagePath: '/tmp/last-message.json',
      useStdinPrompt: true,
    });

    assert.equal(args.slice(0, 3).join(' '), 'exec resume --json');
    assert.equal(args.includes('--output-schema'), false);
    assert.equal(argValue(args, '--output-last-message'), '/tmp/last-message.json');
    assert.equal(args.at(-2), 'thread-1');
    assert.equal(args.at(-1), '-');
  });

  it('does not elevate Gemini approval mode from full-permissions profile alone', () => {
    const cfg = config({
      provider: 'gemini',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
      geminiApprovalMode: 'default',
    });

    assert.equal(argValue(geminiArgs(cfg, 'prompt'), '--approval-mode'), 'default');
  });

  it('uses Gemini yolo only when explicitly configured', () => {
    const cfg = config({
      provider: 'gemini',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
      geminiApprovalMode: 'yolo',
    });

    assert.equal(argValue(geminiArgs(cfg, 'prompt'), '--approval-mode'), 'yolo');
  });

  it('does not add Cursor trust or force from full-permissions profile alone', () => {
    const cfg = config({
      provider: 'cursor',
      profile: 'full-permissions',
      approvalMode: 'auto-grant',
      cursorTrust: false,
      cursorForce: false,
    });
    const args = cursorArgs(cfg, 'prompt', requirement(cfg));

    assert.equal(args.includes('--trust'), false);
    assert.equal(args.includes('--force'), false);
  });

  it('adds Cursor trust and force only from explicit flags', () => {
    const cfg = config({
      provider: 'cursor',
      cursorTrust: true,
      cursorForce: true,
    });
    const args = cursorArgs(cfg, 'prompt', requirement(cfg));

    assert.equal(args.includes('--trust'), true);
    assert.equal(args.includes('--force'), true);
  });

  it('falls back to gpt-5.4-mini when Codex reports a quota limit for the primary model', async () => {
    const originalPath = process.env.PATH;
    const binDir = mkdtempSync(join(tmpdir(), 'gana-codex-bin-'));
    const callsPath = join(binDir, 'calls.jsonl');
    const codexPath = join(binDir, 'codex');
    writeFileSync(codexPath, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const model = args[args.indexOf('-m') + 1];
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ model, args }) + '\\n');
if (model === 'gpt-5.3-codex-spark') {
  console.error('429 quota exceeded for model gpt-5.3-codex-spark');
  process.exit(1);
}
console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'fallback ok' } }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 2 } }));
`);
    chmodSync(codexPath, 0o755);
    process.env.PATH = `${binDir}:${originalPath ?? ''}`;
    try {
      const cfg = config({
        provider: 'codex',
        model: 'gpt-5.3-codex-spark',
        codexFallbackModels: ['gpt-5.4-mini'],
      });

      const result = await runAgent(cfg, 'hello');

      assert.equal(result.text, 'fallback ok');
      assert.equal(cfg.model, 'gpt-5.4-mini');
      const calls = readFileSync(callsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { model: string });
      assert.deepEqual(calls.map((call) => call.model), ['gpt-5.3-codex-spark', 'gpt-5.4-mini']);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('blocks monetary prompts before provider execution', async () => {
    const cfg = config({ provider: 'openrouter' });

    await assert.rejects(
      () => runAgent(cfg, 'place bet $50 on the home team'),
      /Monetary automation is blocked/,
    );
  });
});
