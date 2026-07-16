import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
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
    apiFootball: {
      leaguePresetsPath: join(root, 'league-presets.json'),
    },
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
    apiFootball: {
      leaguePresetsPath: join(root, 'league-presets.json'),
    },
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
    assert.match(output, /pnpm gana parlay --date YYYY-MM-DD --run-ids RUN_ID_A,RUN_ID_B/);
    assert.match(output, /pnpm gana parlay --run-id RUN_ID --portfolio llm/);
    assert.match(output, /pnpm gana parlay --run-id RUN_ID --portfolio low-odds-top/);
    assert.match(output, /pnpm gana parlay --date YYYY-MM-DD --run-ids RUN_ID_A,RUN_ID_B --portfolio low-variance/);
    assert.match(output, /pnpm gana parlay analyze --date YYYY-MM-DD --top 9 --bankroll 100 --profile-scope core/);
    assert.match(output, /pnpm gana parlay analyze --run-ids RUN_ID_A,RUN_ID_B --top 9 --bankroll 100 --profile-scope all/);
  });

  it('requires a date or run id before analyzing persisted parlays', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['parlay', 'analyze'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--date YYYY-MM-DD, --run-id RUN_ID, or --run-ids RUN_ID_A,RUN_ID_B/);
  });

  it('surfaces missing database configuration before parlay analysis', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['parlay', 'analyze', '--date', '2026-05-13'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /DATABASE_URL is required/);
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

describe('headless daily metrics command', () => {
  it('requires --date before computing daily metrics', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['metrics', 'daily'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--date YYYY-MM-DD/);
  });

  it('surfaces missing database configuration before metrics persistence', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['metrics', 'daily', '--date', '2026-05-13'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /DATABASE_URL is required/);
  });

  it('prints metrics usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana metrics daily --date YYYY-MM-DD --days 3 --persist true\|false/);
  });
});

describe('headless strategy review command', () => {
  it('requires a date, range, or all flag', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['strategy-review'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /strategy-review requires/);
  });

  it('prints strategy review usage and registers the slash command', async () => {
    const output = await captureConsole(() => printHeadlessUsage());
    const names = listCommands().map((command) => command.name);

    assert.ok(names.includes('/strategy-review'));
    assert.match(output, /pnpm gana strategy-review --date YYYY-MM-DD --agent true\|false/);
    assert.match(output, /pnpm gana strategy-review --all --through YYYY-MM-DD/);
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

    assert.match(output, /pnpm gana run --date YYYY-MM-DD --web live --markets h2h,btts --validate auto\|force\|off/);
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

describe('headless daily-e2e command', () => {
  it('requires --date before running the daily pipeline', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['daily-e2e', '--providers', 'codex'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--date YYYY-MM-DD/);
  });

  it('rejects unsupported providers before running', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless(['daily-e2e', '--date', '2026-05-14', '--providers', 'codex,openrouter'], context());
    });

    assert.equal(result?.ok, false);
    assert.equal(result?.exitCode, 1);
    assert.match(result?.message ?? '', /--providers must be codex/);
  });

  it('prints daily-e2e usage and registers the slash command', async () => {
    const output = await captureConsole(() => printHeadlessUsage());
    const names = listCommands().map((command) => command.name);

    assert.ok(names.includes('/daily-e2e'));
    assert.match(output, /pnpm gana daily-e2e --date YYYY-MM-DD --providers codex --provider-concurrency 1 --codex-model gpt-5.6-terra/);
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
    assert.ok(names.includes('/metrics'));
    assert.ok(names.includes('/parlay-analysis'));
  });

  it('prints artifacts usage', async () => {
    const output = await captureConsole(() => printHeadlessUsage());

    assert.match(output, /pnpm gana artifacts --run-id RUN_ID/);
  });
});

describe('league preset command surface', () => {
  it('lists league presets from the configured JSON file without requiring a database', async () => {
    const ctx = context();
    writeFileSync(ctx.config.apiFootball.leaguePresetsPath, `${JSON.stringify({
      presetKey: 'default',
      leagues: [
        { id: '140', name: 'La Liga', country: 'Spain', season: 2026, priority: 20, enabled: true },
      ],
    })}\n`);

    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    const output = await captureConsole(async () => {
      result = await dispatchHeadless(['leagues', 'list'], ctx);
    });

    assert.equal(result?.ok, true);
    assert.equal(result?.exitCode, 0);
    assert.match(output, /140/);
    assert.match(output, /La Liga/);
  });

  it('adds league presets to the configured JSON file with priority', async () => {
    const ctx = context();

    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    await captureConsole(async () => {
      result = await dispatchHeadless([
        'leagues',
        'add',
        '--id',
        '339',
        '--name',
        'Liga Nacional',
        '--country',
        'Guatemala',
        '--priority',
        '110',
      ], ctx);
    });

    assert.equal(result?.ok, true);
    assert.equal(result?.exitCode, 0);

    const file = JSON.parse(readFileSync(ctx.config.apiFootball.leaguePresetsPath, 'utf-8'));
    assert.equal(file.leagues[0].id, '339');
    assert.equal(file.leagues[0].priority, 110);
    assert.equal('season' in file.leagues[0], false);
  });
});

describe('low-odds command surface', () => {
  it('wires headless scan low-odds with threshold and markets flags', async () => {
    let result: Awaited<ReturnType<typeof dispatchHeadless>> | undefined;
    const output = await captureConsole(async () => {
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
    assert.match(output, /can take several minutes on full slates/);
    assert.match(output, /quiet output is normal/);
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

describe('Codex reasoning commands', () => {
  function withModelCatalog(ctx: CommandContext): void {
    const catalogPath = join(mkdtempSync(join(tmpdir(), 'gana-models-test-')), 'models.json');
    writeFileSync(catalogPath, JSON.stringify({
      models: [
        {
          id: 'gpt-5.6-sol',
          supportedReasoning: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        },
        {
          id: 'gpt-5.6-luna',
          supportedReasoning: ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      ],
    }));
    ctx.config.codexModelListPath = catalogPath;
  }

  it('accepts ultra reasoning for gpt-5.6-sol', async () => {
    const ctx = commandContext();
    withModelCatalog(ctx);
    ctx.config.model = 'gpt-5.6-sol';

    const output = await captureConsole(() => dispatch('/think ultra', ctx));

    assert.equal(ctx.config.reasoningEffort, 'ultra');
    assert.match(output, /Codex reasoning/);
    assert.match(output, /ultra/);
  });

  it('accepts max but rejects unsupported ultra reasoning for gpt-5.6-luna', async () => {
    const ctx = commandContext();
    withModelCatalog(ctx);
    ctx.config.model = 'gpt-5.6-luna';

    await captureConsole(() => dispatch('/think max', ctx));
    const output = await captureConsole(() => dispatch('/think ultra', ctx));

    assert.equal(ctx.config.reasoningEffort, 'max');
    assert.match(output, /gpt-5\.6-luna supports: low, medium, high, xhigh, max/);
  });

  it('resets reasoning to the model default when switching models', async () => {
    const ctx = commandContext();
    withModelCatalog(ctx);
    ctx.config.model = 'gpt-5.6-sol';
    ctx.config.reasoningEffort = 'ultra';
    ctx.rl = {
      question: (_prompt: string, callback: (answer: string) => void) => callback('1'),
    } as CommandContext['rl'];

    let output = '';
    try {
      output = await captureConsole(() => dispatch('/model luna', ctx));
    } finally {
      process.stdin.pause();
    }

    assert.equal(ctx.config.model, 'gpt-5.6-luna');
    assert.equal(ctx.config.reasoningEffort, undefined);
    assert.match(output, /Reasoning.*model default/);
  });
});
