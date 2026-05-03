import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { RuntimeContext } from '../runtime/context.js';
import { stableStringify } from '../runtime/artifacts.js';
import { redactSecrets } from './redaction.js';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface ApprovalRequest {
  approvalId: string;
  runId: string;
  taskId?: string;
  toolCallId: string;
  toolName: string;
  argsRedacted: unknown;
  args: unknown;
  risk: 'low' | 'medium' | 'high';
  reason: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface ApprovalStore {
  list(status?: ApprovalStatus): ApprovalRequest[];
  get(approvalId: string): ApprovalRequest | undefined;
  upsert(request: ApprovalRequest): ApprovalRequest;
  update(approvalId: string, patch: Partial<ApprovalRequest>): ApprovalRequest;
}

export function createFileApprovalStore(runtime: Pick<RuntimeContext, 'artifactRoot'>): ApprovalStore {
  const root = resolve(runtime.artifactRoot, 'approvals');
  const path = join(root, 'approvals.json');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });

  function read(): ApprovalRequest[] {
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(items: ApprovalRequest[]): void {
    writeFileSync(path, `${stableStringify(redactSecrets(items))}\n`);
  }

  return {
    list(status) {
      const items = expirePending(read());
      write(items);
      return status ? items.filter((item) => item.status === status) : items;
    },
    get(approvalId) {
      const items = expirePending(read());
      write(items);
      return items.find((item) => item.approvalId === approvalId);
    },
    upsert(request) {
      const items = read().filter((item) => item.approvalId !== request.approvalId);
      const next = { ...request, argsRedacted: redactSecrets(request.argsRedacted), args: redactSecrets(request.args) };
      items.push(next);
      write(items);
      return next;
    },
    update(approvalId, patch) {
      const items = read();
      const index = items.findIndex((item) => item.approvalId === approvalId);
      if (index === -1) throw new Error(`Approval "${approvalId}" was not found.`);
      const next = { ...items[index], ...patch } as ApprovalRequest;
      items[index] = next;
      write(items);
      return next;
    },
  };
}

function expirePending(items: ApprovalRequest[]): ApprovalRequest[] {
  const now = Date.now();
  return items.map((item) => {
    if (item.status !== 'pending' || !item.expiresAt) return item;
    return Date.parse(item.expiresAt) <= now
      ? { ...item, status: 'expired' as const, decidedAt: new Date().toISOString(), decidedBy: 'system' }
      : item;
  });
}
