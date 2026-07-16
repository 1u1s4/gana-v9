import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../config.js';
import {
  applyDailyRuntimeDefaults,
  DEFAULT_DAILY_CODEX_MODEL,
  resolveDailyRuntimeDefaults,
} from './runtime-defaults.js';

describe('Daily E2E command runtime defaults', () => {
  it('defaults direct runs to Terra high without fast or fallbacks', () => {
    assert.deepEqual(resolveDailyRuntimeDefaults({}), {
      codexModel: DEFAULT_DAILY_CODEX_MODEL,
      reasoningEffort: 'high',
      fastMode: false,
      codexFallbackModels: [],
    });
  });

  it('overrides generic agent settings only for the daily runtime', () => {
    const generic = loadConfig({
      model: 'gpt-5.5',
      reasoningEffort: 'ultra',
      fastMode: true,
      codexFallbackModels: ['gpt-5.6-luna'],
    }, { skipApiKey: true });
    const defaults = resolveDailyRuntimeDefaults({
      AGENT_MODEL: 'gpt-5.5',
      AGENT_REASONING_EFFORT: 'ultra',
      AGENT_FAST_MODE: 'true',
      AGENT_CODEX_FALLBACK_MODELS: 'gpt-5.6-luna',
    });

    const daily = applyDailyRuntimeDefaults(generic, defaults);

    assert.equal(defaults.codexModel, 'gpt-5.6-terra');
    assert.equal(daily.reasoningEffort, 'high');
    assert.equal(daily.fastMode, false);
    assert.deepEqual(daily.codexFallbackModels, []);
    assert.equal(generic.fastMode, true);
  });

  it('accepts explicit daily overrides and rejects invalid booleans', () => {
    assert.deepEqual(resolveDailyRuntimeDefaults({
      GANA_DAILY_CODEX_MODEL: 'gpt-5.6-sol',
      GANA_DAILY_REASONING_EFFORT: 'ultra',
      GANA_DAILY_FAST_MODE: 'true',
      GANA_DAILY_CODEX_FALLBACK_MODELS: 'gpt-5.6-luna',
    }), {
      codexModel: 'gpt-5.6-sol',
      reasoningEffort: 'ultra',
      fastMode: true,
      codexFallbackModels: ['gpt-5.6-luna'],
    });
    assert.throws(
      () => resolveDailyRuntimeDefaults({ GANA_DAILY_FAST_MODE: 'yes' }),
      /GANA_DAILY_FAST_MODE/,
    );
  });
});
