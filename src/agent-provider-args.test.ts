import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { codexArgs, runAgent } from './agent.js';
import { loadConfig, type AgentConfig } from './config.js';
import { deriveNativeWebSearchRequirement } from './providers/agentic/helpers.js';

function config(overrides: Partial<AgentConfig>): AgentConfig {
  return loadConfig({
    profile: 'standard',
    approvalMode: 'manual',
    provider: 'codex',
    model: 'test-model',
    codexSandbox: 'workspace-write',
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
  it('loads ultra reasoning from AGENT_REASONING_EFFORT', () => {
    const original = process.env.AGENT_REASONING_EFFORT;
    process.env.AGENT_REASONING_EFFORT = 'ultra';
    try {
      assert.equal(loadConfig({}, { skipApiKey: true }).reasoningEffort, 'ultra');
    } finally {
      if (original === undefined) delete process.env.AGENT_REASONING_EFFORT;
      else process.env.AGENT_REASONING_EFFORT = original;
    }
  });

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

  it('passes max and ultra reasoning efforts to Codex', () => {
    for (const reasoningEffort of ['max', 'ultra'] as const) {
      const cfg = config({ reasoningEffort });
      const args = codexArgs(cfg, 'prompt', requirement(cfg));

      assert.equal(argValue(args, '-c'), `model_reasoning_effort="${reasoningEffort}"`);
    }
  });

  it('falls back to gpt-5.6-luna when Codex reports a quota limit for the primary model', async () => {
    const originalPath = process.env.PATH;
    const binDir = mkdtempSync(join(tmpdir(), 'gana-codex-bin-'));
    const callsPath = join(binDir, 'calls.jsonl');
    const codexPath = join(binDir, 'codex');
    writeFileSync(codexPath, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const model = args[args.indexOf('-m') + 1];
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ model, args }) + '\\n');
if (model === 'gpt-5.6-sol') {
  console.error('429 quota exceeded for model gpt-5.6-sol');
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
        model: 'gpt-5.6-sol',
        reasoningEffort: 'ultra',
        codexFallbackModels: ['gpt-5.6-luna'],
      });

      const result = await runAgent(cfg, 'hello');

      assert.equal(result.text, 'fallback ok');
      assert.equal(cfg.model, 'gpt-5.6-luna');
      assert.equal(cfg.reasoningEffort, undefined);
      const calls = readFileSync(callsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { model: string; args: string[] });
      assert.deepEqual(calls.map((call) => call.model), ['gpt-5.6-sol', 'gpt-5.6-luna']);
      assert.equal(calls[0].args.includes('model_reasoning_effort="ultra"'), true);
      assert.equal(calls[1].args.some((arg) => arg.startsWith('model_reasoning_effort=')), false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('uses Codex structured provider errors before stderr warnings for fallback detection', async () => {
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
  console.error('WARN plugin manifest ignored');
  console.log(JSON.stringify({ type: 'error', message: 'You have hit your usage limit for GPT-5.3-Codex-Spark.' }));
  console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'You have hit your usage limit for GPT-5.3-Codex-Spark.' } }));
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
        codexFallbackModels: ['gpt-5.6-luna'],
      });

      const result = await runAgent(cfg, 'hello');

      assert.equal(result.text, 'fallback ok');
      assert.equal(cfg.model, 'gpt-5.6-luna');
      const calls = readFileSync(callsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { model: string });
      assert.deepEqual(calls.map((call) => call.model), ['gpt-5.3-codex-spark', 'gpt-5.6-luna']);
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

  it('rejects removed Cursor provider config', () => {
    assert.throws(
      () => loadConfig({ provider: 'cursor' } as any, { skipApiKey: true }),
      /Cursor provider has been removed/,
    );
  });
});
