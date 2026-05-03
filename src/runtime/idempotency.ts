import { createHash } from 'crypto';

export function buildIdempotencyKey(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(sortValue(parts))).digest('hex');
}

export class IdempotencySet {
  private readonly keys = new Set<string>();

  reserve(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortValue(v)]));
}
