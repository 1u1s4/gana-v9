import type { ZodType } from 'zod';
import type { ToolMetadata } from '../permissions/types.js';
import { getToolMetadata } from '../permissions/tool-metadata.js';
import type { ToolPolicyContext } from './index.js';

export type ToolOrigin = 'native-provider' | 'local';
export type ToolRisk = 'low' | 'medium' | 'high';
export type ToolExecutor = (args: unknown, context?: unknown) => unknown | Promise<unknown>;
export type PolicyHook = (toolName: string, args: unknown, context: ToolPolicyContext) => unknown;
export type RedactionHook = (value: unknown) => unknown;
export type AuditHook = (event: unknown) => void;

export interface RegisteredTool {
  name: string;
  origin: ToolOrigin;
  schema: ZodType;
  metadata: ToolMetadata;
  policy: PolicyHook;
  redaction: RedactionHook;
  audit: AuditHook;
  timeoutMs: number;
  risk: ToolRisk;
  executor: ToolExecutor;
  agentTool?: unknown;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  registerTool(tool: RegisteredTool): void {
    const missing = requiredAttributes(tool);
    if (missing.length) {
      throw new Error(`Tool "${tool.name}" is missing required registry attributes: ${missing.join(', ')}`);
    }
    if (this.tools.has(tool.name)) throw new Error(`Tool "${tool.name}" is already registered.`);
    this.tools.set(tool.name, tool);
  }

  resolveTool(name: string): RegisteredTool {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" is not registered.`);
    return tool;
  }

  listTools(): RegisteredTool[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function requiredAttributes(tool: Partial<RegisteredTool>): string[] {
  const checks: Array<[keyof RegisteredTool, unknown]> = [
    ['name', tool.name],
    ['origin', tool.origin],
    ['schema', tool.schema],
    ['metadata', tool.metadata],
    ['policy', tool.policy],
    ['redaction', tool.redaction],
    ['audit', tool.audit],
    ['timeoutMs', tool.timeoutMs],
    ['risk', tool.risk],
    ['executor', tool.executor],
  ];
  return checks
    .filter(([, value]) => value === undefined || value === null)
    .map(([key]) => key);
}

export function riskFromMetadata(name: string): ToolRisk {
  const metadata = getToolMetadata(name);
  if (metadata.destructive || metadata.requiresApproval === 'always') return 'high';
  if (metadata.mutatesFilesystem || metadata.runsShell || metadata.network) return 'medium';
  return 'low';
}
