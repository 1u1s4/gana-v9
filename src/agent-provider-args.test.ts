import assert from 'node:assert/strict';
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

  it('blocks monetary prompts before provider execution', async () => {
    const cfg = config({ provider: 'openrouter' });

    await assert.rejects(
      () => runAgent(cfg, 'place bet $50 on the home team'),
      /Monetary automation is blocked/,
    );
  });
});
