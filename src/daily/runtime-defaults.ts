import { isReasoningEffort, type AgentConfig, type ReasoningEffort } from '../config.js';

export const DEFAULT_DAILY_CODEX_MODEL = 'gpt-5.6-terra';
export const DEFAULT_DAILY_REASONING_EFFORT: ReasoningEffort = 'high';
export const DEFAULT_DAILY_FAST_MODE = false;
export const DEFAULT_DAILY_CODEX_FALLBACK_MODELS: readonly string[] = [];

export interface DailyRuntimeDefaults {
  codexModel: string;
  reasoningEffort: ReasoningEffort;
  fastMode: boolean;
  codexFallbackModels: string[];
}

export function resolveDailyRuntimeDefaults(env: NodeJS.ProcessEnv = process.env): DailyRuntimeDefaults {
  const reasoningEffort = env.GANA_DAILY_REASONING_EFFORT?.trim() || DEFAULT_DAILY_REASONING_EFFORT;
  if (!isReasoningEffort(reasoningEffort)) {
    throw new Error('GANA_DAILY_REASONING_EFFORT must be one of low, medium, high, xhigh, max, ultra.');
  }

  return {
    codexModel: env.GANA_DAILY_CODEX_MODEL?.trim() || DEFAULT_DAILY_CODEX_MODEL,
    reasoningEffort,
    fastMode: parseDailyBoolean(env.GANA_DAILY_FAST_MODE, DEFAULT_DAILY_FAST_MODE),
    codexFallbackModels: parseModelList(env.GANA_DAILY_CODEX_FALLBACK_MODELS),
  };
}

export function applyDailyRuntimeDefaults(
  config: AgentConfig,
  defaults: DailyRuntimeDefaults,
): AgentConfig {
  return {
    ...config,
    reasoningEffort: defaults.reasoningEffort,
    fastMode: defaults.fastMode,
    codexFallbackModels: [...defaults.codexFallbackModels],
  };
}

function parseDailyBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('GANA_DAILY_FAST_MODE must be true or false.');
}

function parseModelList(value: string | undefined): string[] {
  if (value === undefined || value === '') return [...DEFAULT_DAILY_CODEX_FALLBACK_MODELS];
  return value.split(',').map((model) => model.trim()).filter(Boolean);
}
