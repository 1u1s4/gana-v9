import type { AgentConfig, ApprovalMode, GanaProfile } from '../config.js';

export interface RuntimeContext {
  runId?: string;
  taskId?: string;
  traceId?: string;
  sessionPath: string;
  artifactRoot: string;
  profile: GanaProfile;
  approvalMode: ApprovalMode;
  providerAgentic: AgentConfig['provider'];
  providerSports: 'api-football';
  model: string;
  databaseUrl?: string;
  providerRequestCount?: number;
  providerRequestLimit?: number;
  agenticResearchCallCount?: number;
  agenticResearchCallLimit?: number;
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
    providerRequestCount: 0,
    providerRequestLimit: config.apiFootball.maxProviderRequestsPerRun,
    agenticResearchCallCount: 0,
    agenticResearchCallLimit: config.apiFootball.maxAgenticResearchCallsPerRun,
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
    providerRequestCount: context.providerRequestCount ?? 0,
    providerRequestLimit: config.apiFootball.maxProviderRequestsPerRun,
    agenticResearchCallCount: context.agenticResearchCallCount ?? 0,
    agenticResearchCallLimit: config.apiFootball.maxAgenticResearchCallsPerRun,
    ...patch,
  });
  return context;
}
