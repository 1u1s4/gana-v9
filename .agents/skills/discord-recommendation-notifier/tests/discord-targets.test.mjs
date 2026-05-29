import assert from 'node:assert/strict';
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

  it('resolves all supported operational flows', () => {
    const targets = resolveDiscordTargets({
      gatewayTarget: 'discord:fallback',
      env: {
        GANA_DISCORD_COUNCIL_TARGET: 'discord:council',
        GANA_DISCORD_FEEDBACK_TARGET: 'discord:feedback',
      },
    });

    assert.equal(targets.recommendations, 'discord:fallback');
    assert.equal(targets.council, 'discord:council');
    assert.equal(targets.validation, 'discord:fallback');
    assert.equal(targets.feedback, 'discord:feedback');
    assert.equal(targets.strategy, 'discord:fallback');
    assert.equal(targets.alerts, 'discord:fallback');
  });
});
