import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from '../runtime/context.js';
import { createToolRegistry } from '../tools/index.js';
import { appendAuditEvent } from './audit.js';
import { persistApprovalDecision } from './approval-db.js';
import { decideApproval } from './approval-service.js';
import { createFileApprovalStore } from './approval-store.js';
import { redactSecrets } from './redaction.js';

export async function approveAndExecute(
  config: AgentConfig,
  runtime: RuntimeContext,
  approvalId: string,
  decidedBy = 'local-user',
): Promise<unknown> {
  const approval = decideApproval(runtime, approvalId, 'approved', decidedBy);
  const tool = createToolRegistry({
    config: { profile: 'full-permissions', approvalMode: 'auto-grant', artifactRoot: config.artifactRoot },
    runtime,
  }).resolveTool(approval.toolName);
  const result = await tool.executor(approval.args, { toolCallId: approval.toolCallId, approvalId });
  appendAuditEvent(runtime, {
    type: 'approval.executed',
    payload: {
      approvalId,
      toolCallId: approval.toolCallId,
      toolName: approval.toolName,
      result: redactSecrets(result),
      provider: config.provider,
    },
  });
  return result;
}

export function denyApproval(runtime: RuntimeContext, approvalId: string, decidedBy = 'local-user') {
  const approval = decideApproval(runtime, approvalId, 'denied', decidedBy);
  appendAuditEvent(runtime, {
    type: 'approval.denied',
    payload: {
      approvalId,
      toolCallId: approval.toolCallId,
      toolName: approval.toolName,
    },
  });
  return approval;
}

export function expireApprovals(runtime: RuntimeContext): void {
  const store = createFileApprovalStore(runtime);
  for (const item of store.list('expired')) {
    persistApprovalDecision(runtime, item);
    appendAuditEvent(runtime, {
      type: 'approval.expired',
      payload: {
        approvalId: item.approvalId,
        toolCallId: item.toolCallId,
        toolName: item.toolName,
      },
    });
  }
}
