export type AgentProvider = 'codex';

export type AgentProviderCompat = AgentProvider | 'openrouter';

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; callId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; callId: string; output: string }
  | { type: 'reasoning'; delta: string };

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
}

export interface NativeWebSearchRequirement {
  provider: AgentProviderCompat;
  required: boolean;
  enforce: boolean;
  supported: boolean;
  expectedToolName?: string;
  displayToolName?: string;
  mode?: 'cached' | 'live';
  reason?: string;
}

export interface AgentProviderState {
  provider: AgentProviderCompat;
  label: string;
  model: string;
  configured: boolean;
  ready: boolean;
  auth: {
    label: string;
    configured: boolean;
    path?: string;
  };
  session?: {
    label: 'thread' | 'session';
    redactedId: string;
  };
  nativeWebSearch: NativeWebSearchRequirement;
}
