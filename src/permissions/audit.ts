import { appendFileSync } from 'fs';
import { basename, extname, join } from 'path';
import type { AgentConfig } from '../config.js';
import { createRunArtifactDir, ensureArtifactRoot, stableStringify } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { redactSecrets } from './redaction.js';

export interface AuditEvent {
  timestamp?: string;
  type: string;
  actor?: string;
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
    actor: event.actor ?? 'harness',
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
