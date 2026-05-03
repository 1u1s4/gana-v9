import { randomUUID } from 'crypto';
import type { RuntimeContext } from '../runtime/context.js';
import { appendAuditEvent } from './audit.js';
import { persistApprovalDecision, persistApprovalRequest } from './approval-db.js';
import { createFileApprovalStore, type ApprovalRequest } from './approval-store.js';
import { redactSecrets } from './redaction.js';

export interface CreateApprovalInput {
  toolCallId: string;
  toolName: string;
  args: unknown;
  risk: ApprovalRequest['risk'];
  reason: string;
  ttlMs?: number;
}

export function requestApproval(runtime: RuntimeContext, input: CreateApprovalInput): ApprovalRequest {
  const now = new Date();
  const request: ApprovalRequest = {
    approvalId: `apr_${randomUUID()}`,
    runId: runtime.runId ?? `session-${runtime.sessionPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'session'}`,
    taskId: runtime.taskId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    argsRedacted: redactSecrets(input.args),
    args: redactSecrets(input.args),
    risk: input.risk,
    reason: input.reason,
    status: 'pending',
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (input.ttlMs ?? 30 * 60_000)).toISOString(),
  };
  createFileApprovalStore(runtime).upsert(request);
  persistApprovalRequest(runtime, request);
  appendAuditEvent(runtime, {
    type: 'approval.requested',
    payload: request,
  });
  return request;
}

export function decideApproval(
  runtime: RuntimeContext,
  approvalId: string,
  status: 'approved' | 'denied',
  decidedBy = 'local-user',
): ApprovalRequest {
  const store = createFileApprovalStore(runtime);
  const request = store.get(approvalId);
  if (!request) throw new Error(`Approval "${approvalId}" was not found.`);
  if (request.status !== 'pending') throw new Error(`Approval "${approvalId}" is ${request.status}, not pending.`);
  const next = store.update(approvalId, {
    status,
    decidedAt: new Date().toISOString(),
    decidedBy,
  });
  persistApprovalDecision(runtime, next);
  appendAuditEvent(runtime, {
    type: status === 'approved' ? 'approval.approved' : 'approval.denied',
    payload: next,
  });
  return next;
}

export function listApprovals(runtime: RuntimeContext, status?: ApprovalRequest['status']): ApprovalRequest[] {
  return createFileApprovalStore(runtime).list(status);
}
