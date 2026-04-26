import type { FixtureStatus } from '../../domain/fixtures.js';
import {
  isValidMarketSelection,
  marketRequiresLine,
  type MarketKey,
} from '../../domain/markets.js';
import {
  calculateImpliedProbability,
  isValidDecimalOdds,
  validateOddsQuote,
  type OddsQuote,
} from '../../domain/odds.js';
import type { JsonValue } from '../../storage/types.js';
import { ApiFootballProviderError } from './api-football-errors.js';
import type { NormalizedFixture } from './types.js';

const SCHEDULED_STATUS = new Set(['NS', 'TBD']);
const LIVE_STATUS = new Set(['1H', 'HT', '2H', 'ET', 'P', 'BT', 'SUSP', 'INT', 'LIVE']);
const COMPLETED_STATUS = new Set(['FT', 'AET', 'PEN']);
const CANCELLED_STATUS = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|auth|bearer|cookie|password|secret|token)/i;

export interface ApiFootballFixturePayload {
  fixture?: {
    id?: unknown;
    referee?: unknown;
    timezone?: unknown;
    date?: unknown;
    timestamp?: unknown;
    venue?: {
      name?: unknown;
      city?: unknown;
      [key: string]: unknown;
    };
    status?: {
      long?: unknown;
      short?: unknown;
      elapsed?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  league?: {
    id?: unknown;
    name?: unknown;
    country?: unknown;
    season?: unknown;
    round?: unknown;
    type?: unknown;
    [key: string]: unknown;
  };
  teams?: {
    home?: ApiFootballFixtureTeamPayload;
    away?: ApiFootballFixtureTeamPayload;
    [key: string]: unknown;
  };
  goals?: {
    home?: unknown;
    away?: unknown;
    [key: string]: unknown;
  };
  score?: {
    fulltime?: {
      home?: unknown;
      away?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ApiFootballFixtureTeamPayload {
  id?: unknown;
  name?: unknown;
  country?: unknown;
  [key: string]: unknown;
}

export interface ApiFootballFixtureMapperOptions {
  capturedAt?: Date;
  includedByFilters?: string[];
}

export interface ApiFootballOddsMapperOptions {
  fixtureId: string;
  providerSnapshotId: string;
  capturedAt: Date;
}

export type ApiFootballFixtureMapperErrorCode =
  | 'invalid-provider-response'
  | 'invalid-fixture-id'
  | 'invalid-league-id'
  | 'invalid-home-team-id'
  | 'invalid-away-team-id'
  | 'invalid-scheduled-at';

export class ApiFootballFixtureMapperError extends Error {
  constructor(
    public readonly code: ApiFootballFixtureMapperErrorCode,
    public readonly expected: string,
    public readonly received: string,
  ) {
    super(`API-Football fixture mapping failed. Expected ${expected}; received ${received}.`);
    this.name = 'ApiFootballFixtureMapperError';
  }
}

export function mapApiFootballStatus(status: unknown): FixtureStatus {
  const short = typeof status === 'string'
    ? status
    : typeof (status as { short?: unknown } | null)?.short === 'string'
      ? (status as { short: string }).short
      : undefined;

  if (!short) return 'unknown';

  const normalized = short.trim().toUpperCase();
  if (SCHEDULED_STATUS.has(normalized)) return 'scheduled';
  if (LIVE_STATUS.has(normalized)) return 'live';
  if (COMPLETED_STATUS.has(normalized)) return 'completed';
  if (CANCELLED_STATUS.has(normalized)) return 'cancelled';
  return 'unknown';
}

export const mapApiFootballFixtureStatus = mapApiFootballStatus;

export function mapApiFootballFixture(
  raw: unknown,
  optionsOrCapturedAt: ApiFootballFixtureMapperOptions | Date = new Date(),
): NormalizedFixture {
  const options = normalizeMapperOptions(optionsOrCapturedAt);

  if (!raw || typeof raw !== 'object') {
    throw new ApiFootballFixtureMapperError(
      'invalid-provider-response',
      'Fixture response object.',
      describeReceived(raw),
    );
  }

  const item = raw as ApiFootballFixturePayload;
  const fixtureId = parseRequiredProviderId(item.fixture?.id, 'fixture.id', 'invalid-fixture-id');
  const leagueId = parseRequiredProviderId(item.league?.id, 'league.id', 'invalid-league-id');
  const homeTeamId = parseRequiredProviderId(item.teams?.home?.id, 'teams.home.id', 'invalid-home-team-id');
  const awayTeamId = parseRequiredProviderId(item.teams?.away?.id, 'teams.away.id', 'invalid-away-team-id');
  const scheduledAt = parseRequiredFixtureDate(item.fixture);
  const rawStatus = item.fixture?.status;

  return {
    provider: 'api-football',
    providerFixtureId: fixtureId,
    competition: {
      providerCompetitionId: leagueId,
      name: stringOrFallback(item.league?.name, `league-${leagueId}`),
      country: optionalString(item.league?.country),
      type: optionalString(item.league?.type),
    },
    season: optionalInteger(item.league?.season),
    homeTeam: {
      providerTeamId: homeTeamId,
      name: stringOrFallback(item.teams?.home?.name, `team-${homeTeamId}`),
      country: optionalString(item.teams?.home?.country) ?? optionalString(item.league?.country),
    },
    awayTeam: {
      providerTeamId: awayTeamId,
      name: stringOrFallback(item.teams?.away?.name, `team-${awayTeamId}`),
      country: optionalString(item.teams?.away?.country) ?? optionalString(item.league?.country),
    },
    scheduledAt,
    status: mapApiFootballStatus(rawStatus),
    scoreHome: optionalInteger(item.goals?.home) ?? optionalInteger(item.score?.fulltime?.home),
    scoreAway: optionalInteger(item.goals?.away) ?? optionalInteger(item.score?.fulltime?.away),
    includedByFilters: options.includedByFilters ?? [],
    metadata: stripUndefined({
      capturedAt: options.capturedAt.toISOString(),
      apiFootballStatusShort: optionalString(rawStatus?.short),
      apiFootballStatusLong: optionalString(rawStatus?.long),
      elapsed: optionalInteger(rawStatus?.elapsed),
      venue: optionalString(item.fixture?.venue?.name),
      city: optionalString(item.fixture?.venue?.city),
      referee: optionalString(item.fixture?.referee),
      timezone: optionalString(item.fixture?.timezone),
      timestamp: optionalInteger(item.fixture?.timestamp),
      round: optionalString(item.league?.round),
      raw: toSanitizedJsonValue(item),
    }),
  };
}

export function mapApiFootballFixtures(raw: unknown, capturedAt: Date = new Date()): NormalizedFixture[] {
  const response = extractApiFootballResponseArray(raw, 'fixtures');
  return response.map((item) => mapApiFootballFixture(item, capturedAt));
}

export function mapApiFootballOdds(raw: unknown, options: ApiFootballOddsMapperOptions): OddsQuote[] {
  const response = extractApiFootballResponseArray(raw, 'odds');
  const quotes: OddsQuote[] = [];

  for (const fixtureOdds of response) {
    if (!fixtureOdds || typeof fixtureOdds !== 'object') continue;
    const bookmakers = (fixtureOdds as any).bookmakers;
    if (!Array.isArray(bookmakers)) continue;

    for (const bookmaker of bookmakers) {
      const bookmakerName = optionalString(bookmaker?.name) ?? 'unknown';
      const bets = Array.isArray(bookmaker?.bets) ? bookmaker.bets : [];
      for (const bet of bets) {
        const market = mapApiFootballBetToMarket(bet);
        if (!market) continue;
        const values = Array.isArray(bet?.values) ? bet.values : [];
        for (const value of values) {
          const quote = mapApiFootballOddsValue(value, {
            ...options,
            bookmaker: bookmakerName,
            bookmakerKey: stringifyProviderValue(bookmaker?.id),
            market,
            betName: optionalString(bet?.name) ?? String(bet?.id ?? 'unknown'),
          });
          if (quote) quotes.push(quote);
        }
      }
    }
  }

  return dedupeOddsQuotes(quotes);
}

export function extractApiFootballResponseArray(raw: unknown, endpointName: 'status' | 'fixtures' | 'odds'): unknown[] {
  if (!raw || typeof raw !== 'object') {
    throw new ApiFootballFixtureMapperError(
      'invalid-provider-response',
      `API-Football ${endpointName} response wrapper with response array.`,
      describeReceived(raw),
    );
  }

  const body = raw as { errors?: unknown; response?: unknown };
  if (hasProviderErrors(body.errors)) {
    throw new ApiFootballFixtureMapperError(
      'invalid-provider-response',
      `API-Football ${endpointName} response with empty errors object or array.`,
      describeReceived(body.errors),
    );
  }

  if (!Array.isArray(body.response)) {
    throw new ApiFootballFixtureMapperError(
      'invalid-provider-response',
      `API-Football ${endpointName} response array.`,
      describeReceived(body),
    );
  }

  return body.response;
}

function mapApiFootballBetToMarket(bet: any): MarketKey | undefined {
  const id = optionalInteger(bet?.id);
  const name = normalizeMarketText(bet?.name);

  if (id === 1 || name === 'match winner' || name === 'fulltime result') return 'h2h';
  if (id === 12 || name === 'double chance') return 'double_chance';
  if (
    id === 5 ||
    name === 'goals over under' ||
    name === 'over under' ||
    name === 'over under goals' ||
    name === 'total goals'
  ) {
    return 'goals_over_under';
  }
  if (
    name === 'corners over under' ||
    name === 'over under corners' ||
    name === 'total corners'
  ) {
    return 'corners_over_under';
  }
  if (
    id === 8 ||
    name === 'both teams score' ||
    name === 'both teams to score' ||
    name === 'btts'
  ) {
    return 'btts';
  }

  return undefined;
}

function mapApiFootballOddsValue(
  value: any,
  context: ApiFootballOddsMapperOptions & {
    bookmaker: string;
    bookmakerKey?: string;
    market: MarketKey;
    betName: string;
  },
): OddsQuote | undefined {
  const rawValue = optionalString(value?.value);
  const price = parseDecimalOdds(value?.odd);
  if (!rawValue || price === undefined) {
    throw new ApiFootballProviderError({
      code: 'mapping_error',
      operation: 'map odds value',
      endpointName: 'odds',
      market: context.betName,
      expected: 'odds value with decimal odd.',
      received: describeReceived(value),
      nextAction: 'Inspect API-Football odds payload and update mapper if the provider shape changed.',
    });
  }
  if (!isValidDecimalOdds(price)) return undefined;

  const selection = mapSelection(context.market, rawValue);
  const line = parseLine(context.market, rawValue);
  const quote: OddsQuote = {
    fixtureId: context.fixtureId,
    market: context.market,
    selection,
    ...(line !== undefined && { line }),
    price,
    impliedProbability: calculateImpliedProbability(price),
    bookmaker: context.bookmaker,
    capturedAt: context.capturedAt.toISOString(),
    sourceSnapshotId: context.providerSnapshotId,
  };

  const validationErrors = validateOddsQuote(quote);
  if (
    validationErrors.length ||
    !isValidMarketSelection(context.market, selection) ||
    (marketRequiresLine(context.market) && line === undefined)
  ) {
    throw new ApiFootballProviderError({
      code: 'mapping_error',
      operation: 'validate odds quote',
      endpointName: 'odds',
      market: context.market,
      expected: 'canonical market selection, line and decimal odds.',
      received: { value, validationErrors },
      nextAction: 'Do not persist this quote until the mapper can safely normalize it.',
    });
  }

  return quote;
}

function mapSelection(market: MarketKey, value: string): string {
  const normalized = normalizeMarketText(value);
  if (market === 'h2h') {
    if (normalized === 'home' || normalized === '1') return 'home';
    if (normalized === 'draw' || normalized === 'x') return 'draw';
    if (normalized === 'away' || normalized === '2') return 'away';
  }
  if (market === 'double_chance') {
    if (['home draw', 'home or draw', 'home/draw', '1x'].includes(normalized)) return 'home_or_draw';
    if (['home away', 'home or away', 'home/away', '12'].includes(normalized)) return 'home_or_away';
    if (['draw away', 'draw or away', 'draw/away', 'x2'].includes(normalized)) return 'draw_or_away';
  }
  if (market === 'goals_over_under' || market === 'corners_over_under') {
    if (normalized.startsWith('over')) return 'over';
    if (normalized.startsWith('under')) return 'under';
  }
  if (market === 'btts') {
    if (normalized === 'yes') return 'yes';
    if (normalized === 'no') return 'no';
  }

  throw new ApiFootballProviderError({
    code: 'mapping_error',
    operation: 'map odds selection',
    endpointName: 'odds',
    market,
    expected: `canonical selection for ${market}.`,
    received: value,
    nextAction: 'Update the odds mapper only if this provider value has a safe canonical mapping.',
  });
}

function parseLine(market: MarketKey, value: string): number | undefined {
  if (!marketRequiresLine(market)) return undefined;
  const match = value.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDecimalOdds(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function oddsQuoteDedupeKey(quote: OddsQuote): string {
  return [
    quote.bookmaker ?? '',
    quote.market,
    quote.selection,
    quote.line ?? '',
  ].join('|');
}

function dedupeOddsQuotes(quotes: OddsQuote[]): OddsQuote[] {
  const byKey = new Map<string, OddsQuote>();
  for (const quote of quotes) byKey.set(oddsQuoteDedupeKey(quote), quote);
  return [...byKey.values()];
}

function normalizeMarketText(value: unknown): string {
  return optionalString(value)
    ?.toLowerCase()
    .replace(/&/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[^a-z0-9./+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? '';
}

function stringifyProviderValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function normalizeMapperOptions(optionsOrCapturedAt: ApiFootballFixtureMapperOptions | Date): Required<ApiFootballFixtureMapperOptions> {
  if (optionsOrCapturedAt instanceof Date) {
    return {
      capturedAt: optionsOrCapturedAt,
      includedByFilters: [],
    };
  }

  return {
    capturedAt: optionsOrCapturedAt.capturedAt ?? new Date(),
    includedByFilters: optionsOrCapturedAt.includedByFilters ?? [],
  };
}

function hasProviderErrors(errors: unknown): boolean {
  if (Array.isArray(errors)) return errors.length > 0;
  if (!errors || typeof errors !== 'object') return false;
  return Object.keys(errors).length > 0;
}

function parseRequiredProviderId(
  value: unknown,
  fieldName: string,
  code: ApiFootballFixtureMapperErrorCode,
): string {
  const parsed = optionalInteger(value);

  if (parsed === undefined || parsed <= 0) {
    throw new ApiFootballFixtureMapperError(
      code,
      `${fieldName} as a positive integer.`,
      describeReceived(value),
    );
  }

  return String(parsed);
}

function parseRequiredFixtureDate(fixture: ApiFootballFixturePayload['fixture']): Date {
  const date = optionalString(fixture?.date);
  if (date) {
    const parsedDate = new Date(date);
    if (!Number.isNaN(parsedDate.getTime())) return parsedDate;

    throw new ApiFootballFixtureMapperError(
      'invalid-scheduled-at',
      'fixture.date as a valid ISO date string.',
      date,
    );
  }

  const timestamp = optionalInteger(fixture?.timestamp);
  if (timestamp !== undefined) {
    const parsedDate = new Date(timestamp * 1000);
    if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
  }

  throw new ApiFootballFixtureMapperError(
    'invalid-scheduled-at',
    'fixture.date or fixture.timestamp as a valid scheduled time.',
    describeReceived(fixture),
  );
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isSafeInteger(parsed) ? parsed : undefined;
    }
  }

  return undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

function stripUndefined(input: Record<string, JsonValue | undefined>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  );
}

function toSanitizedJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitizedItem = toSanitizedJsonValue(item, seen);
      return sanitizedItem === undefined ? [] : [sanitizedItem];
    });
  }

  const output: Record<string, JsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;

    const sanitizedItem = toSanitizedJsonValue(item, seen);
    if (sanitizedItem !== undefined) output[key] = sanitizedItem;
  }

  return output;
}

function describeReceived(value: unknown): string {
  const sanitizedValue = toSanitizedJsonValue(value);

  if (typeof sanitizedValue === 'string') return sanitizedValue;
  if (sanitizedValue === undefined) return String(value);

  try {
    return JSON.stringify(sanitizedValue);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
