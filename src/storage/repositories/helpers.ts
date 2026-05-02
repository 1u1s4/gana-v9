import { redactSecrets } from '../../permissions/redaction.js';
import type { JsonValue, StoragePrismaClient } from '../types.js';

export function compactData<T extends object>(data: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, value]) => value !== undefined));
}

export function takeArg(take?: number): Record<string, number> {
  return take === undefined ? {} : { take };
}

export function withTransaction<T, TClient extends Partial<StoragePrismaClient>>(
  db: TClient,
  fn: (tx: TClient) => Promise<T>,
): Promise<T> {
  return typeof db.$transaction === 'function'
    ? db.$transaction((tx) => fn(tx as TClient), { maxWait: 10_000, timeout: 60_000 })
    : fn(db);
}

export function redactText(value: string | null | undefined): string | null | undefined {
  return typeof value === 'string' ? String(redactSecrets(value)) : value;
}

export function redactJson<T extends JsonValue | null | undefined>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(redactSecrets(value))) as T;
}
