import type { AgentConfig, ApprovalMode, GanaProfile } from '../config.js';

export interface RuntimeContext {
  runId?: string;
  taskId?: string;
  sessionPath: string;
  artifactRoot: string;
  profile: GanaProfile;
  approvalMode: ApprovalMode;
  providerAgentic: AgentConfig['provider'];
  providerSports: 'api-football';
  model: string;
  databaseUrl?: string;
}

export function createRuntimeContext(config: AgentConfig, sessionPath: string): RuntimeContext {
  return {
    sessionPath,
    artifactRoot: config.artifactRoot,
    profile: config.profile,
    approvalMode: config.approvalMode,
    providerAgentic: config.provider,
    providerSports: 'api-football',
    model: config.model,
    databaseUrl: config.databaseUrl,
  };
}

export function updateRuntimeContext(
  context: RuntimeContext,
  config: AgentConfig,
  patch: Partial<RuntimeContext> = {},
): RuntimeContext {
  Object.assign(context, {
    sessionPath: context.sessionPath,
    artifactRoot: config.artifactRoot,
    profile: config.profile,
    approvalMode: config.approvalMode,
    providerAgentic: config.provider,
    providerSports: 'api-football' as const,
    model: config.model,
    databaseUrl: config.databaseUrl,
    ...patch,
  });
  return context;
}
