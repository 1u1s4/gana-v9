import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from './config.js';
import { createRuntimeContext } from './runtime/context.js';
import { dispatchHeadless, listCommands, printHeadlessUsage } from './commands.js';

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

describe('headless parlay command', () => {
  it('requires --date before building parlays', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['parlay'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--date YYYY-MM-DD/);
  });

  it('prints parlay usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana parlay --date YYYY-MM-DD/);
  });
});

describe('headless validate command', () => {
  it('requires exactly one validation target', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['validate'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /exactly one/);
  });

  it('rejects multiple validation targets', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['validate', '--date', '2026-04-25', '--prediction-id', 'prediction-1'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /exactly one/);
  });

  it('prints validate usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana validate --date YYYY-MM-DD/);
    assert.match(output, /pnpm gana validate --prediction-id ID/);
    assert.match(output, /pnpm gana validate --parlay-id ID/);
  });
});

describe('headless run command', () => {
  it('requires --date before running the canonical pipeline', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['run'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--date YYYY-MM-DD/);
  });

  it('prints run usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana run --date YYYY-MM-DD/);
  });
});

describe('headless export command', () => {
  it('requires --run-id before exporting artifacts', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['export'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--run-id is required/);
  });

  it('prints export usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana export --run-id RUN_ID/);
  });
});

describe('artifacts command surface', () => {
  it('lists artifacts headlessly', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    const output = await captureConsole(async () => {
      result = await dispatchHeadless(['artifacts'], context());
    });

    assert.equal(result?.ok, true);
    assert.equal(result?.exitCode, 0);
    assert.match(output, /artifacts/);
  });

  it('registers slash commands for PR-12 headless operations', () => {
    const names = listCommands().map((command) => command.name);

    assert.ok(names.includes('/run'));
    assert.ok(names.includes('/export'));
    assert.ok(names.includes('/artifacts'));
  });

  it('prints artifacts usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana artifacts --run-id RUN_ID/);
  });
});
