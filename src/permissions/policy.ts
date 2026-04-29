import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { detectMonetaryAction } from '../security/no-monetary-actions.js';
import { getToolMetadata } from './tool-metadata.js';
import type { PermissionContext, PermissionEvaluation, ToolMetadata } from './types.js';

const SENSITIVE_PATH_PATTERNS = [
  /(^|[/\\])\.env($|[./\\])/i,
  /(^|[/\\])auth\.json$/i,
  /(^|[/\\])oauth_creds\.json$/i,
  /(^|[/\\])cli-config\.json$/i,
  /(^|[/\\])\.codex([/\\]|$)/i,
  /(^|[/\\])\.gemini([/\\]|$)/i,
  /(^|[/\\])\.cursor([/\\]|$)/i,
];

const DESTRUCTIVE_SHELL_PATTERNS = [
  /\brm\s+(-[^\s]*[rf][^\s]*|-[^\s]*[fr][^\s]*)\b/i,
  /\bgit\s+(reset\s+--hard|clean\s+-[^\s]*f|checkout\s+--)\b/i,
  /\b(drop|truncate)\s+(database|schema|table)\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bchmod\s+777\b/i,
  /\bdd\s+if=/i,
  /(^|\s)>\s*\/dev\/(disk|rdisk)/i,
];

export function evaluateAction(
  name: string,
  args: unknown,
  context: PermissionContext,
  metadataOverride?: Partial<ToolMetadata>,
): PermissionEvaluation {
  const base = getToolMetadata(name);
  const metadata = { ...base, ...metadataOverride, name };
  const actionId = `act_${randomUUID()}`;
  const monetary = detectMonetaryAction({ action: name, args });
  if (monetary.blocked) {
    return {
      decision: 'block',
      approvalKind: 'none',
      reason: monetary.reason,
      actionId,
      metadata,
      destructive: metadata.destructive,
    };
  }

  const pathReason = sensitivePathReason(args, context.cwd ?? process.cwd());
  if (pathReason) {
    return {
      decision: 'block',
      approvalKind: 'none',
      reason: pathReason,
      actionId,
      metadata,
      destructive: metadata.destructive,
    };
  }

  const destructive = metadata.destructive || (name === 'shell' && isDestructiveShellCommand(args));
  if (destructive) {
    return {
      decision: 'block',
      approvalKind: 'none',
      reason: 'Destructive actions require an explicit allowlist and are blocked by PR-13 policy.',
      actionId,
      metadata: { ...metadata, destructive: true },
      destructive: true,
    };
  }

  if (metadata.requiresApproval === 'never') {
    return {
      decision: 'allow',
      approvalKind: 'none',
      reason: 'Action is read-only or runtime-approved.',
      actionId,
      metadata,
      destructive,
    };
  }

  if (metadata.requiresApproval === 'always') {
    return {
      decision: 'require_approval',
      approvalKind: 'manual',
      reason: 'Action always requires manual approval.',
      actionId,
      metadata,
      destructive,
    };
  }

  if (context.config.profile === 'full-permissions' && context.config.approvalMode === 'auto-grant') {
    return {
      decision: 'allow',
      approvalKind: 'auto',
      reason: 'Auto-granted by full-permissions policy.',
      actionId,
      metadata,
      destructive,
    };
  }

  return {
    decision: 'require_approval',
    approvalKind: 'manual',
    reason: 'Sensitive action requires manual approval in standard profile.',
    actionId,
    metadata,
    destructive,
  };
}

export function isDestructiveShellCommand(args: unknown): boolean {
  const command = typeof args === 'object' && args !== null && 'command' in args
    ? String((args as { command?: unknown }).command ?? '')
    : String(args ?? '');
  return DESTRUCTIVE_SHELL_PATTERNS.some((pattern) => pattern.test(command));
}

function sensitivePathReason(args: unknown, cwd: string): string | undefined {
  const paths = collectPathLikeValues(args);
  for (const path of paths) {
    const absolute = resolve(cwd, path);
    if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(absolute))) {
      return 'Access to secret-bearing local config or auth files is blocked by PR-13 policy.';
    }
  }
  return undefined;
}

function collectPathLikeValues(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const source = value as Record<string, unknown>;
  return Object.entries(source)
    .filter(([key, item]) => /path|file|dir/i.test(key) && typeof item === 'string')
    .map(([, item]) => String(item));
}
