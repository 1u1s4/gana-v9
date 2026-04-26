import { createHash } from 'node:crypto';

import { redactSecrets } from '../../permissions/redaction.js';
import type { JsonValue, ProviderSnapshotInput } from '../../storage/types.js';
import type { ApiFootballEndpointName } from './types.js';

export type ApiFootballHeaderValue = string | number | boolean | null | undefined;
export type ApiFootballHeaderBag =
  | Headers
  | Iterable<[string, string]>
  | Record<string, ApiFootballHeaderValue>;

export interface ApiFootballQuotaWindow {
  limit?: number;
  remaining?: number;
  resetAfterSeconds?: number;
}

export type ApiFootballQuotaStatus =
  | {
      status: 'known';
      lastCheckedAt: string;
      daily?: ApiFootballQuotaWindow;
      minute?: ApiFootballQuotaWindow;
      retryAfterSeconds?: number;
      providerRequestId?: string;
    }
  | {
      status: 'unknown';
      lastCheckedAt: string;
      providerRequestId?: string;
    };

export interface BuildApiFootballSnapshotInput {
  endpointName: ApiFootballEndpointName;
  providerId?: string;
  method?: string;
  url?: string;
  query?: Record<string, unknown>;
  requestHeaders?: ApiFootballHeaderBag;
  requestBody?: unknown;
  responseStatus?: number;
  responseHeaders?: ApiFootballHeaderBag;
  responsePayload?: unknown;
  includeRawPayload?: boolean;
  capturedAt?: Date;
  quotaMetadata?: ApiFootballQuotaStatus | null;
  runId?: string | null;
  taskId?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
}

const REDACTED = '[REDACTED]';
const API_FOOTBALL_KEY_HEADER = 'x-apisports-key';
const PROVIDER_REQUEST_ID_HEADERS = [
  'x-request-id',
  'x-correlation-id',
  'x-rapidapi-request-id',
  'cf-ray',
];

export function createStableHash(value: unknown): string {
  return createHash('sha256').update(stableJsonStringify(value)).digest('hex');
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

export function redactApiFootballHeaders(headers: ApiFootballHeaderBag | undefined): Record<string, string> {
  const normalized = normalizeApiFootballHeaders(headers);
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(normalized)) {
    redacted[key] = isSensitiveHeaderName(key) ? REDACTED : String(redactSecrets(value));
  }

  return redacted;
}

export function normalizeApiFootballHeaders(headers: ApiFootballHeaderBag | undefined): Record<string, string> {
  if (!headers) return {};

  const normalized: Record<string, string> = {};

  if (isHeaders(headers)) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  if (isHeaderIterable(headers)) {
    for (const [key, value] of headers) {
      normalized[key.toLowerCase()] = String(value);
    }
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[key.toLowerCase()] = String(value);
  }

  return normalized;
}

export function parseApiFootballQuotaHeaders(
  headers: ApiFootballHeaderBag | undefined,
  checkedAt: Date = new Date(),
): ApiFootballQuotaStatus {
  const normalized = normalizeApiFootballHeaders(headers);
  const lastCheckedAt = checkedAt.toISOString();
  const providerRequestId = getProviderRequestId(normalized);
  const daily = compactQuotaWindow({
    limit: parseIntegerHeader(normalized['x-ratelimit-requests-limit']),
    remaining: parseIntegerHeader(normalized['x-ratelimit-requests-remaining']),
    resetAfterSeconds: parseIntegerHeader(normalized['x-ratelimit-requests-reset']),
  });
  const minute = compactQuotaWindow({
    limit: parseIntegerHeader(normalized['x-ratelimit-limit']),
    remaining: parseIntegerHeader(normalized['x-ratelimit-remaining']),
    resetAfterSeconds: parseIntegerHeader(normalized['x-ratelimit-reset']),
  });
  const retryAfterSeconds = parseIntegerHeader(normalized['retry-after']);

  if (!daily && !minute && retryAfterSeconds === undefined) {
    return {
      status: 'unknown',
      lastCheckedAt,
      providerRequestId,
    };
  }

  return {
    status: 'known',
    lastCheckedAt,
    daily,
    minute,
    retryAfterSeconds,
    providerRequestId,
  };
}

export function buildApiFootballRequestHash(input: BuildApiFootballSnapshotInput): string {
  return createStableHash({
    endpointName: input.endpointName,
    method: input.method,
    url: input.url,
    query: input.query,
    headers: redactApiFootballHeaders(input.requestHeaders),
    body: redactSecrets(input.requestBody),
  });
}

export function buildApiFootballResponseHash(input: BuildApiFootballSnapshotInput): string | null {
  if (input.responseStatus === undefined && input.responseHeaders === undefined && input.responsePayload === undefined) {
    return null;
  }

  return createStableHash({
    status: input.responseStatus,
    headers: redactApiFootballHeaders(input.responseHeaders),
    payload: redactSecrets(input.responsePayload),
  });
}

export function buildApiFootballProviderSnapshot(input: BuildApiFootballSnapshotInput): ProviderSnapshotInput {
  const quotaMetadata =
    input.quotaMetadata === undefined
      ? parseApiFootballQuotaHeaders(input.responseHeaders, input.capturedAt)
      : input.quotaMetadata;

  return {
    providerId: input.providerId ?? 'api-football',
    endpointName: input.endpointName,
    requestHash: buildApiFootballRequestHash(input),
    responseHash: buildApiFootballResponseHash(input),
    payloadHash: input.responsePayload === undefined ? null : createStableHash(redactSecrets(input.responsePayload)),
    capturedAt: input.capturedAt,
    quotaMetadata: toJsonValue(quotaMetadata),
    requestMetadata: toJsonValue({
      method: input.method,
      url: input.url,
      query: redactSecrets(input.query),
      headers: redactApiFootballHeaders(input.requestHeaders),
      body: redactSecrets(input.requestBody),
      responseStatus: input.responseStatus,
      responseHeaders: redactApiFootballHeaders(input.responseHeaders),
    }),
    rawPayload: input.includeRawPayload ? toJsonValue(redactSecrets(input.responsePayload)) : null,
    runId: input.runId,
    taskId: input.taskId,
    correlationId: input.correlationId,
    traceId: input.traceId,
  };
}

function compactQuotaWindow(window: ApiFootballQuotaWindow): ApiFootballQuotaWindow | undefined {
  const compacted: ApiFootballQuotaWindow = {};
  if (window.limit !== undefined) compacted.limit = window.limit;
  if (window.remaining !== undefined) compacted.remaining = window.remaining;
  if (window.resetAfterSeconds !== undefined) compacted.resetAfterSeconds = window.resetAfterSeconds;
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function parseIntegerHeader(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function getProviderRequestId(headers: Record<string, string>): string | undefined {
  for (const key of PROVIDER_REQUEST_ID_HEADERS) {
    if (headers[key]) return headers[key];
  }
  return undefined;
}

function isSensitiveHeaderName(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === API_FOOTBALL_KEY_HEADER ||
    normalized.includes('authorization') ||
    normalized.includes('api-key') ||
    normalized.includes('apikey') ||
    normalized.includes('rapidapi-key') ||
    normalized.includes('secret') ||
    normalized.includes('token')
  );
}

function isHeaders(value: ApiFootballHeaderBag): value is Headers {
  return typeof Headers !== 'undefined' && value instanceof Headers;
}

function isHeaderIterable(value: ApiFootballHeaderBag): value is Iterable<[string, string]> {
  return typeof (value as Iterable<[string, string]>)[Symbol.iterator] === 'function';
}

function toStableJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return value.toString();
  if (isHeaders(value as ApiFootballHeaderBag)) return normalizeApiFootballHeaders(value as Headers);

  if (Array.isArray(value)) {
    return value.map((item) => toStableJsonValue(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) output[key] = toStableJsonValue(item, seen);
  }
  return output;
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined) return null;
  return toStableJsonValue(value) as JsonValue;
}
