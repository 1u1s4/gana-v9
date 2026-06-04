import type {
  AgentProvider,
  AgentProviderCompat,
  AgentProviderState,
  NativeWebSearchRequirement,
} from './types.js';

export interface AgentConfigLike {
  provider: AgentProviderCompat;
  model: string;
  apiKey?: string;
  nativeWebSearch?: boolean;
  nativeWebSearchMode?: 'cached' | 'live';
  codexHome?: string;
  codexThreadId?: string;
  geminiHome?: string;
  geminiSessionId?: string;
}

export interface AgentProviderStateOptions {
  codexAuthPath?: string;
  codexAuthConfigured?: boolean;
  geminiAuthPath?: string;
  geminiAuthConfigured?: boolean;
  openrouterConfigured?: boolean;
}

export const AGENT_PROVIDER_LABELS: Record<AgentProviderCompat, string> = {
  codex: 'Codex',
  gemini: 'Gemini CLI',
  openrouter: 'OpenRouter',
};

export const AGENT_PROVIDER_DEFAULT_MODELS: Record<AgentProviderCompat, readonly string[]> = {
  codex: ['gpt-5.5', 'gpt-5.4', 'gpt-5.2'],
  gemini: ['gemini-3.1-pro', 'gemini-3-pro', 'gemini-2.5-pro'],
  openrouter: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-haiku-4.5'],
};

const NATIVE_WEB_TOOL_NAMES: Record<AgentProvider, string> = {
  codex: 'web_search',
  gemini: 'google_web_search',
};

const NATIVE_WEB_DISPLAY_TOOL_NAMES: Record<AgentProvider, string> = {
  codex: 'Codex web_search',
  gemini: 'Gemini google_web_search',
};

export function providerLabel(provider: AgentProviderCompat): string {
  return AGENT_PROVIDER_LABELS[provider];
}

export function isNativeAgentProvider(provider: AgentProviderCompat): provider is AgentProvider {
  return provider === 'codex' || provider === 'gemini';
}

export function expectedNativeWebToolName(provider: AgentProviderCompat): string | undefined {
  return isNativeAgentProvider(provider) ? NATIVE_WEB_TOOL_NAMES[provider] : undefined;
}

export function displayNativeWebToolName(provider: AgentProviderCompat): string | undefined {
  return isNativeAgentProvider(provider) ? NATIVE_WEB_DISPLAY_TOOL_NAMES[provider] : undefined;
}

export function redactProviderSessionId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (id.length <= 8) return '*'.repeat(id.length);
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

export function deriveNativeWebSearchRequirement(config: Pick<
  AgentConfigLike,
  'provider' | 'nativeWebSearch' | 'nativeWebSearchMode'
>, options: { required?: boolean; reason?: string } = {}): NativeWebSearchRequirement {
  const supported = isNativeAgentProvider(config.provider);
  const required = Boolean(options.required && config.nativeWebSearch && supported);

  return {
    provider: config.provider,
    required,
    enforce: required,
    supported,
    expectedToolName: supported ? expectedNativeWebToolName(config.provider) : undefined,
    displayToolName: supported ? displayNativeWebToolName(config.provider) : undefined,
    mode: config.nativeWebSearchMode,
    reason: options.reason,
  };
}

export function formatNativeWebSearchEnforcementError(
  requirement: NativeWebSearchRequirement,
): string {
  if (!requirement.required || !requirement.displayToolName) {
    return 'Native web search was not required for this provider.';
  }

  const mode = requirement.mode ? ` mode=${requirement.mode}` : '';
  const reason = requirement.reason ? ` Reason: ${requirement.reason}.` : '';
  return `Native ${requirement.displayToolName} was required but was not used for provider ${requirement.provider}${mode}.${reason} Action: retry with /web live for research/current-info work, or use /web off for local-only work.`;
}

export function createNativeWebSearchEnforcementError(
  requirement: NativeWebSearchRequirement,
): Error | undefined {
  if (!requirement.required) return undefined;
  return new Error(formatNativeWebSearchEnforcementError(requirement));
}

export function selectDefaultModelForProvider(
  provider: AgentProviderCompat,
  availableModels: readonly string[] = [],
): string {
  const preferred = AGENT_PROVIDER_DEFAULT_MODELS[provider];
  return preferred.find((model) => availableModels.includes(model))
    ?? availableModels.find((model) => !isFastModelId(model))
    ?? preferred[0];
}

export function isFastModelId(model: string): boolean {
  return /(^|[-_/])fast($|[-_/])/.test(model.toLowerCase());
}

export function buildAgentProviderState(
  config: AgentConfigLike,
  options: AgentProviderStateOptions = {},
): AgentProviderState {
  const auth = providerAuthState(config, options);
  const session = providerSessionState(config);

  return {
    provider: config.provider,
    label: providerLabel(config.provider),
    model: config.model,
    configured: auth.configured,
    ready: auth.configured,
    auth,
    session,
    nativeWebSearch: deriveNativeWebSearchRequirement(config),
  };
}

function providerAuthState(
  config: AgentConfigLike,
  options: AgentProviderStateOptions,
): AgentProviderState['auth'] {
  if (config.provider === 'codex') {
    return {
      label: 'local codex auth',
      configured: options.codexAuthConfigured ?? false,
      path: options.codexAuthPath,
    };
  }

  if (config.provider === 'gemini') {
    return {
      label: 'local gemini auth',
      configured: options.geminiAuthConfigured ?? false,
      path: options.geminiAuthPath,
    };
  }

  return {
    label: 'openrouter',
    configured: options.openrouterConfigured ?? Boolean(config.apiKey),
  };
}

function providerSessionState(config: AgentConfigLike): AgentProviderState['session'] {
  if (config.provider === 'codex' && config.codexThreadId) {
    return {
      label: 'thread',
      redactedId: redactProviderSessionId(config.codexThreadId) ?? '',
    };
  }

  if (config.provider === 'gemini' && config.geminiSessionId) {
    return {
      label: 'session',
      redactedId: redactProviderSessionId(config.geminiSessionId) ?? '',
    };
  }

  return undefined;
}
