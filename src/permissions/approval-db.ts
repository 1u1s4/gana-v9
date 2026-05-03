import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import type { ApprovalRequest } from './approval-store.js';
import { redactSecrets } from './redaction.js';

export function persistApprovalRequest(runtime: RuntimeContext, request: ApprovalRequest): void {
  if (!runtime.databaseUrl) return;
  void upsertApproval(runtime, request).catch(() => undefined);
}

export function persistApprovalDecision(runtime: RuntimeContext, request: ApprovalRequest): void {
  if (!runtime.databaseUrl) return;
  void updateApproval(runtime, request).catch(() => undefined);
}

async function upsertApproval(runtime: RuntimeContext, request: ApprovalRequest): Promise<void> {
  const db = getPrismaClient() as any;
  if (!db.approvalRequest?.upsert) return;
  await db.approvalRequest.upsert({
    where: { id: request.approvalId },
    create: toDbCreate(runtime, request),
    update: toDbUpdate(request),
  });
}

async function updateApproval(runtime: RuntimeContext, request: ApprovalRequest): Promise<void> {
  const db = getPrismaClient() as any;
  if (!db.approvalRequest?.update) return;
  await db.approvalRequest.update({
    where: { id: request.approvalId },
    data: toDbUpdate(request),
  });
}

function toDbCreate(runtime: RuntimeContext, request: ApprovalRequest): Record<string, unknown> {
  return {
    id: request.approvalId,
    runId: request.runId?.startsWith('session-') ? null : request.runId,
    taskId: request.taskId ?? null,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    argsRedacted: redactSecrets(request.argsRedacted),
    risk: request.risk,
    reason: request.reason,
    status: request.status,
    requestedAt: new Date(request.requestedAt),
    expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
    decidedAt: request.decidedAt ? new Date(request.decidedAt) : null,
    decidedBy: request.decidedBy ?? null,
    metadata: {
      profile: runtime.profile,
      approvalMode: runtime.approvalMode,
      providerAgentic: runtime.providerAgentic,
      providerSports: runtime.providerSports,
    },
  };
}

function toDbUpdate(request: ApprovalRequest): Record<string, unknown> {
  return {
    taskId: request.taskId ?? null,
    argsRedacted: redactSecrets(request.argsRedacted),
    risk: request.risk,
    reason: request.reason,
    status: request.status,
    expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
    decidedAt: request.decidedAt ? new Date(request.decidedAt) : null,
    decidedBy: request.decidedBy ?? null,
  };
}
