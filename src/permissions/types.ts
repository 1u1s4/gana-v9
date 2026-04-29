import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from '../runtime/context.js';

export type ApprovalRequirement = 'never' | 'standard' | 'always';
export type PermissionDecision = 'allow' | 'require_approval' | 'block';
export type ApprovalKind = 'none' | 'manual' | 'auto';

export interface ToolMetadata {
  name: string;
  readOnly: boolean;
  mutatesFilesystem: boolean;
  runsShell: boolean;
  network: boolean;
  destructive: boolean;
  requiresApproval: ApprovalRequirement;
}

export interface PermissionContext {
  config: Pick<AgentConfig, 'profile' | 'approvalMode'>;
  runtime?: RuntimeContext;
  cwd?: string;
}

export interface PermissionEvaluation {
  decision: PermissionDecision;
  approvalKind: ApprovalKind;
  reason: string;
  actionId: string;
  metadata: ToolMetadata;
  destructive: boolean;
}

export interface AuditedAction {
  actionId: string;
  action: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  approvalKind: ApprovalKind;
  decision: PermissionDecision;
  reason?: string;
}
