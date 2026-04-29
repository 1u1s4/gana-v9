import type { RuntimeContext } from '../runtime/context.js';
import { appendAuditEvent } from './audit.js';
import type { AuditedAction, PermissionEvaluation } from './types.js';

export function auditPermissionEvaluation(
  runtime: RuntimeContext | undefined,
  action: string,
  args: unknown,
  evaluation: PermissionEvaluation,
): void {
  if (!runtime) return;
  if (evaluation.decision === 'require_approval') {
    appendAuditEvent(runtime, {
      type: 'approval.requested',
      payload: auditPayload(action, args, evaluation),
    });
    return;
  }
  if (evaluation.approvalKind === 'auto') {
    appendAuditEvent(runtime, {
      type: 'approval.auto_granted',
      payload: auditPayload(action, args, evaluation),
    });
  }
}

export function auditActionResult(runtime: RuntimeContext | undefined, action: AuditedAction): void {
  if (!runtime) return;
  appendAuditEvent(runtime, {
    type: action.decision === 'block' ? 'action.blocked' : action.error ? 'action.failed' : 'action.completed',
    payload: {
      actionId: action.actionId,
      action: action.action,
      args: action.args,
      result: action.result,
      error: action.error,
      decision: action.decision,
      approvalKind: action.approvalKind,
      reason: action.reason,
    },
  });
}

function auditPayload(action: string, args: unknown, evaluation: PermissionEvaluation): Record<string, unknown> {
  return {
    actionId: evaluation.actionId,
    action,
    tool: evaluation.metadata.name,
    args,
    decision: evaluation.decision,
    approvalKind: evaluation.approvalKind,
    reason: evaluation.reason,
    metadata: evaluation.metadata,
  };
}
