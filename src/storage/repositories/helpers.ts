import { redactSecrets } from '../../permissions/redaction.js';
import type { JsonValue, StoragePrismaClient } from '../types.js';

export function compactData<T extends object>(data: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, value]) => value !== undefined));
}

export function takeArg(take?: number): Record<string, number> {
  return take === undefined ? {} : { take };
}

export function paginationArgs(input: { take?: number; skip?: number } = {}): Record<string, number> {
  return compactData({
    take: input.take,
    skip: input.skip,
  }) as Record<string, number>;
}

export function fixtureDateRange(date: Date | string, timezone?: string): { start: Date; end: Date } {
  if (!timezone) {
    const value = coerceDate(date);
    const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);
    return { start, end };
  }

  const value = coerceDate(date);
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  const start = zonedTimeToUtc({ year, month, day, hour: 0 }, timezone);
  const end = zonedTimeToUtc({ year, month, day: day + 1, hour: 0 }, timezone);
  return { start, end };
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

function coerceDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date(date);
}

function zonedTimeToUtc(input: { year: number; month: number; day: number; hour: number }, timezone: string): Date {
  const utcGuess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour));
  const first = new Date(utcGuess.getTime() - timeZoneOffsetMs(utcGuess, timezone));
  const secondOffset = timeZoneOffsetMs(first, timezone);
  return new Date(utcGuess.getTime() - secondOffset);
}

function timeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(byType.get('year')),
    Number(byType.get('month')) - 1,
    Number(byType.get('day')),
    Number(byType.get('hour')),
    Number(byType.get('minute')),
    Number(byType.get('second')),
  );
  return asUtc - date.getTime();
}
