import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd, env as processEnv } from 'node:process';
import { describe, it } from 'node:test';
import {
  DEFAULT_DISCORD_TARGET,
  resolveDiscordTarget,
  resolveDiscordTargets,
} from '../scripts/discord-targets.mjs';

describe('discord target routing', () => {
  it('prefers a flow-specific target over --gateway-target', () => {
    const target = resolveDiscordTarget('recommendations', {
      gatewayTarget: 'discord:global-cli',
      env: {
        GANA_DISCORD_RECOMMENDATIONS_TARGET: 'discord:recommendations',
        GANA_DISCORD_TARGET: 'discord:global-env',
      },
    });

    assert.equal(target, 'discord:recommendations');
  });

  it('uses --gateway-target before the global env fallback', () => {
    const target = resolveDiscordTarget('validation', {
      gatewayTarget: 'discord:global-cli',
      env: {
        GANA_DISCORD_TARGET: 'discord:global-env',
      },
    });

    assert.equal(target, 'discord:global-cli');
  });

  it('falls back to the current production channel when nothing is configured', () => {
    assert.equal(resolveDiscordTarget('alerts', { env: {} }), DEFAULT_DISCORD_TARGET);
  });

  it('loads flow-specific targets from .env in the current working directory', () => {
    const originalCwd = cwd();
    const tempDir = mkdtempSync(join(tmpdir(), 'gana-discord-targets-'));
    const originalFlowTarget = processEnv.GANA_DISCORD_RECOMMENDATIONS_TARGET;
    const originalGlobalTarget = processEnv.GANA_DISCORD_TARGET;
    delete processEnv.GANA_DISCORD_RECOMMENDATIONS_TARGET;
    delete processEnv.GANA_DISCORD_TARGET;

    try {
      writeFileSync(
        join(tempDir, '.env'),
        'export GANA_DISCORD_RECOMMENDATIONS_TARGET=discord:from-dotenv\n',
      );
      chdir(tempDir);

      const target = resolveDiscordTarget('recommendations', {
        gatewayTarget: 'discord:global-cli',
      });

      assert.equal(target, 'discord:from-dotenv');
    } finally {
      chdir(originalCwd);
      if (originalFlowTarget === undefined) {
        delete processEnv.GANA_DISCORD_RECOMMENDATIONS_TARGET;
      } else {
        processEnv.GANA_DISCORD_RECOMMENDATIONS_TARGET = originalFlowTarget;
      }
      if (originalGlobalTarget === undefined) {
        delete processEnv.GANA_DISCORD_TARGET;
      } else {
        processEnv.GANA_DISCORD_TARGET = originalGlobalTarget;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves all supported operational flows', () => {
    const targets = resolveDiscordTargets({
      gatewayTarget: 'discord:fallback',
      env: {
        GANA_DISCORD_RECOMMENDATIONS_TARGET: 'discord:recommendations',
      },
    });

    assert.equal(targets.recommendations, 'discord:recommendations');
    assert.equal(targets.validation, 'discord:fallback');
    assert.equal(targets.strategy, 'discord:fallback');
    assert.equal(targets.alerts, 'discord:fallback');
  });
});
