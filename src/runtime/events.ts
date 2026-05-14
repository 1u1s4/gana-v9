import { randomUUID } from 'crypto';

export type HarnessEventType =
  | 'task.started'
  | 'task.progress'
  | 'provider.requested'
  | 'provider.completed'
  | 'provider.rate_limited'
  | 'filters.applied'
  | 'low_odds.scan_started'
  | 'low_odds.hit_found'
  | 'low_odds.scan_completed'
  | 'db.read'
  | 'db.write'
  | 'agent.started'
  | 'agent.delta'
  | 'agent.tool_call'
  | 'agent.tool_result'
  | 'agent.reasoning'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.provider_changed'
  | 'agent.session_reset'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.auto_granted'
  | 'artifact.written'
  | 'gate.passed'
  | 'gate.blocked'
  | 'task.completed'
  | 'task.failed';

export type HarnessEventSeverity = 'debug' | 'info' | 'warn' | 'error';

export type GanaRuntime = 'mvp-productivo-online';

export type GanaProfile = 'standard' | 'full-permissions';

export type ProviderAgentic = 'codex' | 'gemini' | 'openrouter';

export type ProviderSports = 'api-football';

export type HarnessEventPayload = Record<string, unknown>;

export interface HarnessEvent {
  type: HarnessEventType;
  eventId: string;
  runId: string;
  taskId?: string;
  correlationId: string;
  traceId: string;
  timestamp: string;
  runtime: GanaRuntime;
  profile: GanaProfile;
  providerAgentic: ProviderAgentic;
  providerSports: ProviderSports;
  severity: HarnessEventSeverity;
  payload: HarnessEventPayload;
}

export interface HarnessEventContext {
  runId: string;
  taskId?: string;
  correlationId: string;
  traceId: string;
  runtime: GanaRuntime;
  profile: GanaProfile;
  providerAgentic: ProviderAgentic;
  providerSports: ProviderSports;
}

export interface CreateHarnessEventInput extends HarnessEventContext {
  type: HarnessEventType;
  eventId?: string;
  timestamp?: string;
  severity?: HarnessEventSeverity;
  payload?: HarnessEventPayload;
}

export function createHarnessEvent(input: CreateHarnessEventInput): HarnessEvent {
  return {
    type: input.type,
    eventId: input.eventId ?? createHarnessEventId(),
    runId: input.runId,
    taskId: input.taskId,
    correlationId: input.correlationId,
    traceId: input.traceId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    runtime: input.runtime,
    profile: input.profile,
    providerAgentic: input.providerAgentic,
    providerSports: input.providerSports,
    severity: input.severity ?? 'info',
    payload: input.payload ?? {},
  };
}

export function createHarnessEventId(): string {
  return `evt_${randomUUID()}`;
}

export function createHarnessCorrelationId(): string {
  return `corr_${randomUUID()}`;
}

export function createHarnessTraceId(): string {
  return `trace_${randomUUID()}`;
}
