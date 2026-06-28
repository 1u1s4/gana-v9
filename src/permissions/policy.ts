import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { detectMonetaryAction } from '../security/no-monetary-actions.js';
import { evaluateFilesystemWrite } from './filesystem-policy.js';
import { getToolMetadata } from './tool-metadata.js';
import type { PermissionContext, PermissionEvaluation, ToolMetadata } from './types.js';

const SENSITIVE_PATH_PATTERNS = [
  /(^|[/\\\s"'`=;:|&()<>])\.env($|[./\\\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])\.envrc($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])auth\.json($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])oauth_creds\.json($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])cli-config\.json($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])\.codex([/\\\s"'`;:|&()<>]|$)/i,
  /(^|[/\\\s"'`=;:|&()<>])\.cursor([/\\\s"'`;:|&()<>]|$)/i,
  /(^|[/\\\s"'`=;:|&()<>])\.aws[/\\]credentials($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])\.docker[/\\]config\.json($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])\.kube[/\\]config($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])\.(npmrc|pypirc|netrc)($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])id_(rsa|dsa|ecdsa|ed25519)($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])known_hosts($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])(?:credentials?|secrets?|tokens?|api[-_]?keys?|private[-_]?key|service[-_]?account)\.(?:json|ya?ml|toml|ini|env|txt|pem|key)($|[\s"'`;:|&()<>])/i,
  /(^|[/\\\s"'`=;:|&()<>])credentials($|[\s"'`;:|&()<>])/i,
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

const SENSITIVE_COMMAND_PATTERNS = [
  /[a-z][a-z0-9+.-]*:\/\/[^:@\s/]+(?::[^@\s/]*)?@/i,
  /\b[\w.-]*(?:api[-_]?key|apikey|key|token|secret|password|authorization|database_url|database-url)[\w.-]*\s*=\s*[^"'`\s;&|)]+/i,
  /\b(?:Authorization|Cookie)\s*[:=]\s*\S+/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/,
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

  const fsWrite = filesystemWriteReason(name, args, context);
  if (fsWrite) {
    return {
      decision: 'require_approval',
      approvalKind: 'manual',
      reason: fsWrite,
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

function filesystemWriteReason(name: string, args: unknown, context: PermissionContext): string | undefined {
  if (name !== 'file_write' && name !== 'file_edit') return undefined;
  if (!args || typeof args !== 'object' || !('path' in args)) return undefined;
  const result = evaluateFilesystemWrite({
    path: String((args as { path?: unknown }).path ?? ''),
    cwd: context.cwd ?? process.cwd(),
    artifactRoot: context.runtime?.artifactRoot,
    requireArtifactWrite: true,
    approved: context.config.profile === 'full-permissions' && context.config.approvalMode === 'auto-grant',
  });
  if (result.allowed) return undefined;
  return result.reason;
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

  const shellCommand = extractShellCommand(args);
  if (shellCommand) {
    if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(shellCommand))) {
      return 'Shell commands that read secret-bearing local config or auth files are blocked by PR-13 policy.';
    }
    if (SENSITIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(shellCommand))) {
      return 'Shell commands containing credentials, auth headers, cookies, JWTs, or token patterns are blocked by PR-13 policy.';
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

function extractShellCommand(args: unknown): string | undefined {
  if (typeof args === 'object' && args !== null && 'command' in args) {
    return String((args as { command?: unknown }).command ?? '');
  }
  return undefined;
}
