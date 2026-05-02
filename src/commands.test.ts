import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from './config.js';
import { createRuntimeContext } from './runtime/context.js';
import { dispatch, dispatchHeadless, listCommands, printHeadlessUsage, type CommandContext } from './commands.js';

function context() {
  const root = mkdtempSync(join(tmpdir(), 'gana-commands-test-'));
  const config = loadConfig({
    artifactRoot: join(root, 'artifacts'),
    databaseUrl: '',
    profile: 'standard',
    approvalMode: 'manual',
  }, { skipApiKey: true });
  return {
    config,
    runtime: createRuntimeContext(config, join(root, 'session.jsonl')),
  };
}

function commandContext(): CommandContext {
  const root = mkdtempSync(join(tmpdir(), 'gana-slash-test-'));
  const sessionPath = join(root, 'session.jsonl');
  const config = loadConfig({
    artifactRoot: join(root, 'artifacts'),
    databaseUrl: '',
    profile: 'standard',
    approvalMode: 'manual',
  }, { skipApiKey: true });
  return {
    config,
    runtime: createRuntimeContext(config, sessionPath),
    rl: {} as CommandContext['rl'],
    messages: [],
    sessionPath,
    resetSession: () => sessionPath,
    totalTokens: { input: 0, output: 0 },
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

  it('uses default parlay rules when optional override flags are omitted', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['parlay', '--date', '2026-05-02'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /DATABASE_URL is required/);
    assert.doesNotMatch(result?.message ?? '', /minLegs/);
  });

  it('requires --run-id for LLM parlay portfolios', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['parlay', '--portfolio', 'llm'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--run-id is required/);
  });

  it('prints parlay usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana parlay --date YYYY-MM-DD/);
    assert.match(output, /pnpm gana parlay --run-id RUN_ID --portfolio llm/);
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

    assert.match(output, /pnpm gana run --date YYYY-MM-DD --web live --validate auto\|force\|off/);
  });

  it('validates run validation mode before executing the pipeline', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['run', '--date', '2026-04-25', '--validate', 'invalid'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--validate must be auto, force, or off/);
  });

  it('blocks monetary automation in headless arguments', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    const output = await captureConsole(async () => {
      result = await dispatchHeadless(['run', '--date', '2026-04-25', '--note', 'place bet $50'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /Monetary automation is blocked/);
    assert.match(output, /Monetary automation is blocked/);
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

describe('low-odds command surface', () => {
  it('wires headless scan low-odds with threshold and markets flags', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless([
        'scan',
        'low-odds',
        '--date',
        '2026-04-25',
        '--threshold',
        '1.20',
        '--markets',
        'h2h,double_chance,btts',
      ], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /DATABASE_URL is required/);
  });

  it('rejects unsupported headless scan markets before running the scan', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless([
        'scan',
        'low-odds',
        '--date',
        '2026-04-25',
        '--markets',
        'h2h,unsupported',
      ], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /unsupported market\(s\): unsupported/);
  });

  it('accepts slash-style low-odds tokens', async () => {
    const ctx = commandContext();

    await assert.rejects(
      captureConsole(() => dispatch('/low-odds today threshold:1.20 leagues:default teams:default markets:h2h,double_chance,btts', ctx)),
      /DATABASE_URL is required/,
    );
  });

  it('rejects unsupported slash-style low-odds markets before running the scan', async () => {
    const ctx = commandContext();

    await assert.rejects(
      captureConsole(() => dispatch('/low-odds 2026-04-25 markets:unsupported', ctx)),
      /unsupported market\(s\): unsupported/,
    );
  });

  it('prints low-odds market flag usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana scan low-odds --date YYYY-MM-DD --threshold 1\.20/);
  });
});

describe('slash policy commands', () => {
  it('registers profile and approval commands', () => {
    const names = listCommands().map((command) => command.name);

    assert.ok(names.includes('/profile'));
    assert.ok(names.includes('/approval'));
  });

  it('shows current profile and approval usage without changing policy', async () => {
    const ctx = commandContext();
    const output = await captureConsole(() => dispatch('/profile', ctx));

    assert.equal(ctx.config.profile, 'standard');
    assert.equal(ctx.config.approvalMode, 'manual');
    assert.match(output, /profile/);
    assert.match(output, /standard/);
    assert.match(output, /approvalMode/);
    assert.match(output, /manual/);
    assert.match(output, /\/profile standard\|full-permissions/);
  });

  it('changes profile and approval mode together and audits the policy change', async () => {
    const ctx = commandContext();
    const output = await captureConsole(() => dispatch('/profile full-permissions', ctx));

    assert.equal(ctx.config.profile, 'full-permissions');
    assert.equal(ctx.config.approvalMode, 'auto-grant');
    assert.equal(ctx.runtime.profile, 'full-permissions');
    assert.equal(ctx.runtime.approvalMode, 'auto-grant');
    assert.match(output, /full-permissions/);
    assert.match(output, /auto-grant/);

    const auditPath = join(ctx.config.artifactRoot, 'runs', 'session-session', 'audit-log.jsonl');
    const [entry] = readFileSync(auditPath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(entry.type, 'profile.changed');
    assert.equal(entry.context.profile, 'full-permissions');
    assert.equal(entry.context.approvalMode, 'auto-grant');
    assert.equal(entry.payload.profile, 'full-permissions');
    assert.equal(entry.payload.approvalMode, 'auto-grant');
  });

  it('prints approval policy and writes config-status audit metadata', async () => {
    const ctx = commandContext();
    ctx.config.profile = 'full-permissions';
    ctx.config.approvalMode = 'auto-grant';
    const output = await captureConsole(() => dispatch('/approval', ctx));

    assert.match(output, /profile/);
    assert.match(output, /full-permissions/);
    assert.match(output, /approvalMode/);
    assert.match(output, /auto-grant/);
    assert.match(output, /auto-grant for configured standard actions/);
    assert.match(output, /autoGranted/);
    assert.match(output, /audit-log\.jsonl/);

    const auditPath = join(ctx.config.artifactRoot, 'runs', 'session-session', 'audit-log.jsonl');
    const [entry] = readFileSync(auditPath, 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(entry.type, 'config.status');
    assert.equal(entry.context.profile, 'full-permissions');
    assert.equal(entry.context.approvalMode, 'auto-grant');
    assert.equal(entry.payload.command, '/approval');
    assert.equal(entry.payload.approvalMode, 'auto-grant');
  });

  it('blocks monetary automation in slash command input', async () => {
    const ctx = commandContext();
    const output = await captureConsole(() => dispatch('/run --date 2026-04-25 --note place bet $50', ctx));

    assert.match(output, /Monetary automation is blocked/);
  });
});
