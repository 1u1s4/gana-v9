import { appendFileSync } from 'fs';
import { basename, extname, join } from 'path';
import type { AgentConfig } from '../config.js';
import { createRunArtifactDir, ensureArtifactRoot, stableStringify } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import type { JsonValue } from '../storage/types.js';
import { redactSecrets } from './redaction.js';

export interface AuditEvent {
  timestamp?: string;
  type: string;
  actor?: string;
  severity?: string;
  actionId?: string;
  correlationId?: string | null;
  traceId?: string | null;
  payload: unknown;
}

export function appendAuditEvent(context: RuntimeContext, event: AuditEvent): string {
  const runId = context.runId ?? sessionRunId(context.sessionPath);
  const config = { artifactRoot: context.artifactRoot } as Pick<AgentConfig, 'artifactRoot'>;
  ensureArtifactRoot(config);
  const dir = createRunArtifactDir(config, runId);
  const path = join(dir, 'audit-log.jsonl');
  const entry = {
    timestamp: event.timestamp ?? new Date().toISOString(),
    type: event.type,
    actionId: event.actionId ?? extractActionId(event.payload),
    actor: event.actor ?? 'harness',
    severity: event.severity ?? 'info',
    correlationId: event.correlationId ?? null,
    traceId: event.traceId ?? null,
    context: {
      runId,
      taskId: context.taskId,
      sessionPath: context.sessionPath,
      profile: context.profile,
      approvalMode: context.approvalMode,
      providerAgentic: context.providerAgentic,
      providerSports: context.providerSports,
      model: context.model,
    },
    payload: redactSecrets(event.payload),
  };
  appendFileSync(path, `${stableStringify(entry)}\n`);
  void persistAuditEvent(context, runId, entry).catch((err) => {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      type: 'audit.persist_failed',
      actor: 'harness',
      severity: 'warning',
      context: entry.context,
      payload: redactSecrets({ error: err instanceof Error ? err.message : err, eventType: event.type }),
    };
    appendFileSync(path, `${stableStringify(errorEntry)}\n`);
  });
  return path;
}

export function appendAutoApproval(context: RuntimeContext, action: string): string {
  return appendAuditEvent(context, {
    type: 'approval.auto_granted',
    payload: { action, approvalMode: context.approvalMode, profile: context.profile },
  });
}

export function appendConfigStatusEvent(context: RuntimeContext, status: unknown): string {
  return appendAuditEvent(context, {
    type: 'config.status',
    payload: status,
  });
}

function sessionRunId(sessionPath: string): string {
  const name = basename(sessionPath, extname(sessionPath)) || 'session';
  return `session-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

function extractActionId(payload: unknown): string | undefined {
  return payload && typeof payload === 'object' && 'actionId' in payload
    ? String((payload as { actionId?: unknown }).actionId ?? '') || undefined
    : undefined;
}

async function persistAuditEvent(context: RuntimeContext, runId: string, entry: Record<string, unknown>): Promise<void> {
  if (!context.databaseUrl) return;
  const [{ getPrismaClient }, { createStorageRepositories }] = await Promise.all([
    import('../storage/db.js'),
    import('../storage/repositories/index.js'),
  ]);
  const repositories = createStorageRepositories(getPrismaClient() as never);
  await repositories.auditLogs.record({
    runId,
    taskId: context.taskId ?? null,
    eventType: String(entry.type),
    actor: String(entry.actor ?? 'harness'),
    severity: String(entry.severity ?? 'info'),
    correlationId: typeof entry.correlationId === 'string' ? entry.correlationId : null,
    traceId: typeof entry.traceId === 'string' ? entry.traceId : null,
    payloadRedacted: toJsonValue(entry),
  });
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(stableStringify(redactSecrets(value))) as JsonValue;
}
