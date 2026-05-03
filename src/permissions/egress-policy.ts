import type { AgentConfig } from '../config.js';

export type EgressMode = 'off' | 'live-readonly';

export interface EgressPolicyInput {
  url: string | URL;
  mode?: EgressMode;
  allowlist?: string[];
  config?: Pick<AgentConfig, 'apiFootballBaseUrl'> & Partial<Pick<AgentConfig, 'provider'>>;
}

export interface EgressPolicyResult {
  allowed: boolean;
  host?: string;
  reason?: string;
}

const PROVIDER_HOSTS: Record<string, string[]> = {
  codex: ['chatgpt.com', 'api.openai.com'],
  gemini: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'],
  cursor: ['api2.cursor.sh', 'cursor.com'],
  openrouter: ['openrouter.ai'],
};

export function defaultEgressAllowlist(config?: EgressPolicyInput['config']): string[] {
  const hosts = new Set<string>();
  if (config?.apiFootballBaseUrl) {
    try {
      hosts.add(new URL(config.apiFootballBaseUrl).host);
    } catch {
      // Invalid config is handled by callers that perform the request.
    }
  }
  for (const host of PROVIDER_HOSTS[config?.provider ?? ''] ?? []) hosts.add(host);
  return [...hosts].sort();
}

export function evaluateEgress(input: EgressPolicyInput): EgressPolicyResult {
  const mode = input.mode ?? 'live-readonly';
  let host: string;
  try {
    host = new URL(input.url).host;
  } catch {
    return { allowed: false, reason: 'invalid egress URL' };
  }

  if (mode === 'off') {
    return { allowed: false, host, reason: 'network egress is disabled for this profile' };
  }

  const allowlist = new Set([...(input.allowlist ?? []), ...defaultEgressAllowlist(input.config)]);
  if (!allowlist.has(host)) {
    return { allowed: false, host, reason: `host "${host}" is outside the egress allowlist` };
  }
  return { allowed: true, host };
}
