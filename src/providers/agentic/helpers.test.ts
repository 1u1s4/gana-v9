import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGENT_PROVIDER_DEFAULT_MODELS,
  buildAgentProviderState,
  createNativeWebSearchEnforcementError,
  deriveNativeWebSearchRequirement,
  expectedNativeWebToolName,
  formatNativeWebSearchEnforcementError,
  isFastModelId,
  providerLabel,
  redactProviderSessionId,
  selectDefaultModelForProvider,
} from './helpers.js';

describe('agentic provider helpers', () => {
  it('labels providers and exposes expected native web tool names', () => {
    assert.equal(providerLabel('codex'), 'Codex');
    assert.equal(providerLabel('gemini'), 'Gemini CLI');
    assert.equal(providerLabel('openrouter'), 'OpenRouter');

    assert.equal(expectedNativeWebToolName('codex'), 'web_search');
    assert.equal(expectedNativeWebToolName('gemini'), 'google_web_search');
    assert.equal(expectedNativeWebToolName('openrouter'), undefined);
  });

  it('builds provider state from injected readiness signals', () => {
    const state = buildAgentProviderState(
      {
        provider: 'codex',
        model: 'gpt-5.5',
        nativeWebSearch: true,
        nativeWebSearchMode: 'live',
        codexThreadId: 'thread_1234567890abcdef',
      },
      {
        codexAuthConfigured: true,
        codexAuthPath: '/tmp/codex/auth.json',
      },
    );

    assert.equal(state.provider, 'codex');
    assert.equal(state.label, 'Codex');
    assert.equal(state.configured, true);
    assert.equal(state.ready, true);
    assert.deepEqual(state.auth, {
      label: 'local codex auth',
      configured: true,
      path: '/tmp/codex/auth.json',
    });
    assert.deepEqual(state.session, {
      label: 'thread',
      redactedId: 'thre...cdef',
    });
    assert.deepEqual(state.nativeWebSearch, {
      provider: 'codex',
      required: false,
      enforce: false,
      supported: true,
      expectedToolName: 'web_search',
      displayToolName: 'Codex web_search',
      mode: 'live',
      reason: undefined,
    });
  });

  it('treats OpenRouter readiness as API-key based and does not require native web enforcement', () => {
    const state = buildAgentProviderState({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      apiKey: 'sk-test',
      nativeWebSearch: true,
      nativeWebSearchMode: 'cached',
    });

    assert.equal(state.configured, true);
    assert.equal(state.ready, true);
    assert.deepEqual(state.auth, {
      label: 'openrouter',
      configured: true,
    });
    assert.equal(state.nativeWebSearch.supported, false);
    assert.equal(state.nativeWebSearch.required, false);
    assert.equal(state.nativeWebSearch.enforce, false);
    assert.equal(state.nativeWebSearch.expectedToolName, undefined);
  });

  it('redacts provider thread and session IDs without leaking middle content', () => {
    assert.equal(redactProviderSessionId(undefined), undefined);
    assert.equal(redactProviderSessionId('abc123'), '******');
    assert.equal(redactProviderSessionId('12345678'), '********');
    assert.equal(redactProviderSessionId('session_abcdef0123456789'), 'sess...6789');

    const state = buildAgentProviderState(
      {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        geminiSessionId: 'gemini-session-abcdef',
      },
      {
        geminiAuthConfigured: true,
      },
    );

    assert.equal(state.session?.redactedId, 'gemi...cdef');
  });

  it('derives native web-search requirements only for native providers', () => {
    assert.deepEqual(deriveNativeWebSearchRequirement({
      provider: 'gemini',
      nativeWebSearch: true,
      nativeWebSearchMode: 'cached',
    }, { required: true, reason: 'research' }), {
      provider: 'gemini',
      required: true,
      enforce: true,
      supported: true,
      expectedToolName: 'google_web_search',
      displayToolName: 'Gemini google_web_search',
      mode: 'cached',
      reason: 'research',
    });

    assert.deepEqual(deriveNativeWebSearchRequirement({
      provider: 'gemini',
      nativeWebSearch: true,
      nativeWebSearchMode: 'cached',
    }), {
      provider: 'gemini',
      required: false,
      enforce: false,
      supported: true,
      expectedToolName: 'google_web_search',
      displayToolName: 'Gemini google_web_search',
      mode: 'cached',
      reason: undefined,
    });

    assert.deepEqual(deriveNativeWebSearchRequirement({
      provider: 'openrouter',
      nativeWebSearch: true,
      nativeWebSearchMode: 'live',
    }, { required: true }), {
      provider: 'openrouter',
      required: false,
      enforce: false,
      supported: false,
      expectedToolName: undefined,
      displayToolName: undefined,
      mode: 'live',
      reason: undefined,
    });

    assert.deepEqual(deriveNativeWebSearchRequirement({
      provider: 'openrouter',
      nativeWebSearch: true,
      nativeWebSearchMode: 'live',
    }), {
      provider: 'openrouter',
      required: false,
      enforce: false,
      supported: false,
      expectedToolName: undefined,
      displayToolName: undefined,
      mode: 'live',
      reason: undefined,
    });
  });

  it('formats enforcement errors with provider-specific tool names', () => {
    const codex = deriveNativeWebSearchRequirement({
      provider: 'codex',
      nativeWebSearch: true,
      nativeWebSearchMode: 'live',
    }, { required: true, reason: 'research' });
    const gemini = deriveNativeWebSearchRequirement({
      provider: 'gemini',
      nativeWebSearch: true,
    }, { required: true });
    const openrouter = deriveNativeWebSearchRequirement({
      provider: 'openrouter',
      nativeWebSearch: true,
    }, { required: true });

    assert.match(formatNativeWebSearchEnforcementError(codex), /Codex web_search/);
    assert.match(formatNativeWebSearchEnforcementError(codex), /provider codex mode=live/);
    assert.match(formatNativeWebSearchEnforcementError(codex), /Reason: research/);
    assert.match(formatNativeWebSearchEnforcementError(gemini), /Gemini google_web_search/);
    assert.match(createNativeWebSearchEnforcementError(gemini)?.message ?? '', /Action: retry with \/web live/);
    assert.equal(createNativeWebSearchEnforcementError(openrouter), undefined);
    assert.equal(
      formatNativeWebSearchEnforcementError(openrouter),
      'Native web search was not required for this provider.',
    );
  });

  it('does not prefer fast model defaults', () => {
    for (const defaults of Object.values(AGENT_PROVIDER_DEFAULT_MODELS)) {
      assert.equal(defaults.some(isFastModelId), false);
    }
  });

  it('defaults Gemini to the newest Pro models before older fallbacks', () => {
    assert.deepEqual(
      AGENT_PROVIDER_DEFAULT_MODELS.gemini.slice(0, 3),
      ['gemini-3.1-pro', 'gemini-3-pro', 'gemini-2.5-pro'],
    );
    assert.equal(selectDefaultModelForProvider('gemini'), 'gemini-3.1-pro');
  });
});
