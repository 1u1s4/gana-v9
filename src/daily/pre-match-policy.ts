import type { AgentConfig } from '../config.js';

export const PRE_MATCH_REVIEW_POLICY = Object.freeze({
  version: 'astra-prematch-v1',
  enabled: true,
  provider: 'codex' as const,
  model: 'gpt-6-astra',
  reasoningEffort: 'medium' as const,
  web: 'live' as const,
  windowMinutes: 120,
  minimumLeadMinutes: 20,
  pollMinutes: 15,
  maxAttemptsPerFixture: 2,
  maxFixturesPerPass: 4,
  trigger: 'window-entry-or-new-confirmed-lineups',
  publication: 'separate-revision-with-existing-evidence-and-publication-gates',
});

/** Independent of the initial Daily model, inherited effort, fast mode or fallback. */
export function preMatchConfig(config: AgentConfig): AgentConfig {
  return { ...config, provider: 'codex', model: PRE_MATCH_REVIEW_POLICY.model,
    reasoningEffort: 'medium', fastMode: false, codexFallbackModels: [], codexThreadId: undefined,
    nativeWebSearch: true, nativeWebSearchMode: 'live' };
}
