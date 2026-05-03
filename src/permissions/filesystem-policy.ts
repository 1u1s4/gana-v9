import { isAbsolute, normalize, resolve, sep } from 'path';

export interface FilesystemPolicyInput {
  path: string;
  cwd?: string;
  artifactRoot?: string;
  requireArtifactWrite?: boolean;
  approved?: boolean;
}

export interface FilesystemPolicyResult {
  allowed: boolean;
  reason?: string;
  normalizedPath?: string;
  absolutePath?: string;
}

const SENSITIVE_PREFIXES = ['.git', 'node_modules'];
const SENSITIVE_FILES = new Set(['.env', '.envrc']);

export function validateRepoRelativePath(path: string): FilesystemPolicyResult {
  if (!path || typeof path !== 'string') {
    return { allowed: false, reason: 'path is required' };
  }
  if (isAbsolute(path)) {
    return { allowed: false, reason: 'absolute paths are blocked; use a repo-relative path' };
  }

  const normalized = normalize(path).replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    return { allowed: false, reason: 'parent-directory traversal is blocked' };
  }
  if (normalized.startsWith('/')) {
    return { allowed: false, reason: 'absolute paths are blocked; use a repo-relative path' };
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => SENSITIVE_FILES.has(part))) {
    return { allowed: false, reason: 'secret-bearing env files are blocked' };
  }
  if (parts.some((part) => SENSITIVE_PREFIXES.includes(part))) {
    return { allowed: false, reason: 'sensitive workspace paths are blocked' };
  }

  return { allowed: true, normalizedPath: normalized };
}

export function evaluateFilesystemWrite(input: FilesystemPolicyInput): FilesystemPolicyResult {
  const relative = validateRepoRelativePath(input.path);
  if (!relative.allowed || !relative.normalizedPath) return relative;

  const cwd = resolve(input.cwd ?? process.cwd());
  const absolutePath = resolve(cwd, relative.normalizedPath);
  if (!isInside(cwd, absolutePath)) {
    return { allowed: false, reason: 'path resolves outside the workspace', normalizedPath: relative.normalizedPath, absolutePath };
  }

  if (input.requireArtifactWrite && !input.approved) {
    const artifactRoot = resolve(cwd, input.artifactRoot ?? '.artifacts');
    if (!isInside(artifactRoot, absolutePath) && absolutePath !== artifactRoot) {
      return {
        allowed: false,
        reason: 'writes outside the artifact root require explicit approval',
        normalizedPath: relative.normalizedPath,
        absolutePath,
      };
    }
  }

  return { allowed: true, normalizedPath: relative.normalizedPath, absolutePath };
}

function isInside(parent: string, child: string): boolean {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(normalizedParent);
}
