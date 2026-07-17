import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  DEFAULT_DAILY_CODEX_MODEL,
  DEFAULT_DAILY_CODEX_FALLBACK_MODELS,
  DEFAULT_DAILY_FAST_MODE,
  DEFAULT_DAILY_REASONING_EFFORT,
  resolveDailyRuntime,
} from '../lib/daily-e2e-runtime.mjs';

describe('daily E2E runtime defaults', () => {
  it('prefers the user-updatable Codex CLI over an older Homebrew install', () => {
    const repoRoot = resolve(new URL('../..', import.meta.url).pathname);
    const shell = readFileSync(resolve(repoRoot, 'scripts/gana-daily-e2e-notify.sh'), 'utf8');

    assert.match(shell, /GANA_CODEX_BIN_DIR/);
    assert.match(shell, /\$HOME\/\.local\/bin/);
    assert.match(shell, /CODEX_USER_BIN:\+\$CODEX_USER_BIN:/);
  });

  it('defaults to Terra high without fast tier', () => {
    assert.deepEqual(resolveDailyRuntime({ env: {} }), {
      codexModel: DEFAULT_DAILY_CODEX_MODEL,
      reasoningEffort: DEFAULT_DAILY_REASONING_EFFORT,
      fastMode: DEFAULT_DAILY_FAST_MODE,
      codexFallbackModels: DEFAULT_DAILY_CODEX_FALLBACK_MODELS,
    });
    assert.equal(DEFAULT_DAILY_CODEX_MODEL, 'gpt-5.6-terra');
    assert.equal(DEFAULT_DAILY_REASONING_EFFORT, 'high');
    assert.equal(DEFAULT_DAILY_FAST_MODE, false);
    assert.deepEqual(DEFAULT_DAILY_CODEX_FALLBACK_MODELS, []);
  });

  it('allows explicit daily overrides', () => {
    assert.deepEqual(resolveDailyRuntime({
      env: {
        GANA_DAILY_CODEX_MODEL: 'gpt-5.6-sol',
        GANA_DAILY_REASONING_EFFORT: 'ultra',
        GANA_DAILY_FAST_MODE: 'true',
        GANA_DAILY_CODEX_FALLBACK_MODELS: 'gpt-5.6-luna,gpt-5.5',
      },
    }), {
      codexModel: 'gpt-5.6-sol',
      reasoningEffort: 'ultra',
      fastMode: true,
      codexFallbackModels: ['gpt-5.6-luna', 'gpt-5.5'],
    });
  });

  it('rejects invalid daily reasoning and fast settings', () => {
    assert.throws(
      () => resolveDailyRuntime({ env: { GANA_DAILY_REASONING_EFFORT: 'extreme' } }),
      /GANA_DAILY_REASONING_EFFORT/,
    );
    assert.throws(
      () => resolveDailyRuntime({ env: { GANA_DAILY_FAST_MODE: 'yes' } }),
      /GANA_DAILY_FAST_MODE/,
    );
  });
});
