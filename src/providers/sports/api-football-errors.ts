import type { ApiFootballEndpointName } from './types.js';

export type ApiFootballErrorCode =
  | 'provider_unavailable'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'fixture_not_found'
  | 'market_not_available'
  | 'stale_odds'
  | 'incomplete_statistics'
  | 'invalid_provider_response'
  | 'mapping_error';

export interface ApiFootballErrorInput {
  code: ApiFootballErrorCode;
  operation?: string;
  endpointName?: ApiFootballEndpointName;
  expected?: string;
  received?: unknown;
  fixtureId?: string;
  market?: string;
  providerRequestId?: string;
  nextAction?: string;
  message?: string;
  statusCode?: number;
  cause?: unknown;
}

export interface ApiFootballErrorJson {
  name: 'ApiFootballProviderError';
  provider: 'api-football';
  code: ApiFootballErrorCode;
  message: string;
  operation: string;
  endpointName?: ApiFootballEndpointName;
  expected: string;
  received: unknown;
  fixtureId?: string;
  market?: string;
  providerRequestId?: string;
  nextAction: string;
}

const DEFAULT_NEXT_ACTIONS: Record<ApiFootballErrorCode, string> = {
  provider_unavailable:
    'Check API-Football connectivity, base URL, credentials, and retry after the provider is reachable.',
  quota_exceeded:
    'Stop provider calls for this quota window and retry after the API-Football plan quota resets.',
  rate_limited:
    'Back off provider calls and retry after the rate-limit window resets.',
  fixture_not_found:
    'Verify the provider fixture ID and refresh fixtures before requesting dependent data.',
  market_not_available:
    'Skip this market for the fixture or refresh odds later; do not synthesize missing market data.',
  stale_odds:
    'Refresh odds before using this fixture for filtering, scoring, or prediction.',
  incomplete_statistics:
    'Wait for final statistics or mark the validation as unavailable for the missing statistic.',
  invalid_provider_response:
    'Capture the redacted payload, keep the request out of downstream normalization, and inspect the provider response shape.',
  mapping_error:
    'Update the API-Football mapper only if the provider value has a safe canonical mapping.',
};

export class ApiFootballProviderError extends Error {
  readonly provider = 'api-football';
  readonly code: ApiFootballErrorCode;
  readonly operation: string;
  readonly endpointName?: ApiFootballEndpointName;
  readonly expected: string;
  readonly received: unknown;
  readonly fixtureId?: string;
  readonly market?: string;
  readonly providerRequestId?: string;
  readonly nextAction: string;
  readonly statusCode?: number;

  constructor(input: ApiFootballErrorInput) {
    super(input.message ?? buildApiFootballErrorMessage(input), { cause: input.cause });
    this.name = 'ApiFootballProviderError';
    this.code = input.code;
    this.operation = input.operation ?? 'provider request';
    this.endpointName = input.endpointName;
    this.expected = input.expected ?? 'valid API-Football provider response';
    this.received = input.received;
    this.fixtureId = input.fixtureId;
    this.market = input.market;
    this.providerRequestId = input.providerRequestId;
    this.nextAction = input.nextAction ?? DEFAULT_NEXT_ACTIONS[input.code];
    this.statusCode = input.statusCode;
  }

  toJSON(): ApiFootballErrorJson {
    return {
      name: 'ApiFootballProviderError',
      provider: this.provider,
      code: this.code,
      message: this.message,
      operation: this.operation,
      endpointName: this.endpointName,
      expected: this.expected,
      received: this.received,
      fixtureId: this.fixtureId,
      market: this.market,
      providerRequestId: this.providerRequestId,
      nextAction: this.nextAction,
    };
  }
}

export function createApiFootballError(input: ApiFootballErrorInput): ApiFootballProviderError {
  return new ApiFootballProviderError(input);
}

export function isApiFootballProviderError(error: unknown): error is ApiFootballProviderError {
  return error instanceof ApiFootballProviderError;
}

export function actionableProviderErrorMessage(error: unknown): string {
  if (!isApiFootballProviderError(error)) {
    return String(redactUnknown(error instanceof Error ? error.message : error));
  }

  const details = [
    error.endpointName ? `endpoint=${error.endpointName}` : undefined,
    error.fixtureId ? `fixture=${error.fixtureId}` : undefined,
    error.market ? `market=${error.market}` : undefined,
    error.statusCode ? `http=${error.statusCode}` : undefined,
    `next=${error.nextAction}`,
  ].filter(Boolean);

  return `${error.code}: ${error.message}${details.length ? ` | ${details.join(' | ')}` : ''}`;
}

export function mapHttpStatusToProviderError(
  statusCode: number,
  endpointName: ApiFootballEndpointName,
  received: unknown,
): ApiFootballProviderError {
  if (statusCode === 429) {
    return createRateLimitedError({
      operation: 'provider request',
      endpointName,
      expected: 'request accepted within API-Football rate limits',
      received,
      statusCode,
    });
  }

  if (statusCode === 402 || statusCode === 403) {
    return createQuotaExceededError({
      operation: 'provider request',
      endpointName,
      expected: 'valid API-Football key with quota and endpoint access',
      received,
      statusCode,
    });
  }

  return createProviderUnavailableError({
    operation: 'provider request',
    endpointName,
    expected: 'successful HTTP response from API-Football',
    received,
    statusCode,
  });
}

export function buildApiFootballErrorMessage(input: ApiFootballErrorInput): string {
  const scope = [
    input.endpointName ? `endpoint=${input.endpointName}` : undefined,
    input.fixtureId ? `fixture=${input.fixtureId}` : undefined,
    input.market ? `market=${input.market}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const suffix = scope ? ` (${scope})` : '';
  return `API-Football ${input.code}: ${input.operation ?? 'provider request'} failed${suffix}. Expected ${input.expected ?? 'valid API-Football provider response'}; received ${formatReceivedCondition(input.received)}.`;
}

export function createInvalidProviderResponseError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'invalid_provider_response' });
}

export function createMappingError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'mapping_error' });
}

export function createFixtureNotFoundError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'fixture_not_found' });
}

export function createMarketNotAvailableError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'market_not_available' });
}

export function createIncompleteStatisticsError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'incomplete_statistics' });
}

export function createStaleOddsError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'stale_odds' });
}

export function createProviderUnavailableError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'provider_unavailable' });
}

export function createRateLimitedError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'rate_limited' });
}

export function createQuotaExceededError(input: Omit<ApiFootballErrorInput, 'code'>): ApiFootballProviderError {
  return createApiFootballError({ ...input, code: 'quota_exceeded' });
}

function formatReceivedCondition(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function redactUnknown(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/(x-apisports-key\s*[:=]\s*)\S+/gi, '$1[REDACTED]');
}
