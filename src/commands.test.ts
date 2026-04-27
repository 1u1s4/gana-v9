import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from './config.js';
import { createRuntimeContext } from './runtime/context.js';
import { dispatchHeadless, printHeadlessUsage } from './commands.js';

function context() {
  const config = loadConfig({}, { skipApiKey: true });
  return {
    config,
    runtime: createRuntimeContext(config, 'session.jsonl'),
  };
}

async function captureConsole(fn: () => Promise<unknown> | unknown): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

describe('headless research command', () => {
  it('requires --fixture-id before running research', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['research', '--web', 'live'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--fixture-id is required/);
  });

  it('validates --web mode', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['research', '--fixture-id', '1001', '--web', 'invalid'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--web must be off, cached, or live/);
  });

  it('prints research usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana research --fixture-id ID --web live/);
  });
});

describe('headless score command', () => {
  it('requires --fixture-id before scoring predictions', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['score'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--fixture-id is required/);
  });

  it('prints score usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana score --fixture-id ID/);
  });
});
