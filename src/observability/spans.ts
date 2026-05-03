import { createHash, randomUUID } from 'crypto';

export type HarnessSpanKind = 'llm' | 'tool' | 'provider' | 'db' | 'retrieval' | 'policy' | 'gate';
export type HarnessSpanStatus = 'ok' | 'error' | 'blocked' | 'pending_approval';

export interface HarnessSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  runId: string;
  taskId?: string;
  name: string;
  kind: HarnessSpanKind;
  startedAt: string;
  endedAt?: string;
  status: HarnessSpanStatus;
  inputHash?: string;
  outputHash?: string;
  cost?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    estimatedUsd?: number;
  };
  metadataRedacted: unknown;
}

export function startSpan(input: Omit<HarnessSpan, 'spanId' | 'startedAt' | 'status'> & { status?: HarnessSpanStatus }): HarnessSpan {
  return {
    ...input,
    spanId: `span_${randomUUID()}`,
    startedAt: new Date().toISOString(),
    status: input.status ?? 'ok',
  };
}

export function finishSpan(span: HarnessSpan, status: HarnessSpanStatus, output?: unknown): HarnessSpan {
  return {
    ...span,
    status,
    endedAt: new Date().toISOString(),
    ...(output !== undefined && { outputHash: hashUnknown(output) }),
  };
}

export function hashUnknown(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex');
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => [key, sortValue(val)]));
}
