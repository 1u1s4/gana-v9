export const DEFAULT_DAILY_CODEX_MODEL = 'gpt-5.6-terra';
export const DEFAULT_DAILY_REASONING_EFFORT = 'high';
export const DEFAULT_DAILY_FAST_MODE = false;
export const DEFAULT_DAILY_CODEX_FALLBACK_MODELS = [];

const SUPPORTED_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

export function resolveDailyRuntime({ env = process.env, codexModel } = {}) {
  const reasoningEffort = env.GANA_DAILY_REASONING_EFFORT ?? DEFAULT_DAILY_REASONING_EFFORT;
  if (!SUPPORTED_REASONING_EFFORTS.has(reasoningEffort)) {
    throw new Error(`GANA_DAILY_REASONING_EFFORT must be one of ${[...SUPPORTED_REASONING_EFFORTS].join(', ')}.`);
  }

  return {
    codexModel: codexModel?.trim() || env.GANA_DAILY_CODEX_MODEL?.trim() || DEFAULT_DAILY_CODEX_MODEL,
    reasoningEffort,
    fastMode: parseBoolean(env.GANA_DAILY_FAST_MODE, DEFAULT_DAILY_FAST_MODE),
    codexFallbackModels: parseModelList(env.GANA_DAILY_CODEX_FALLBACK_MODELS),
  };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('GANA_DAILY_FAST_MODE must be true or false.');
}

function parseModelList(value) {
  if (value === undefined || value === '') return [...DEFAULT_DAILY_CODEX_FALLBACK_MODELS];
  return value.split(',').map((model) => model.trim()).filter(Boolean);
}
