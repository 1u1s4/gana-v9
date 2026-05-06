import type { DashboardStatusOptions } from './types.js';
import { PREDICTION_QUALITIES, PREDICTION_STATUSES } from '../prediction/types.js';
import { MARKET_KEYS } from '../domain/markets.js';

export type DashboardTab = 'fixtures' | 'predictions' | 'parlays' | 'validations' | 'runs';

export type DashboardDirection = 'asc' | 'desc';

export interface ParsedOverviewQuery {
  tab: DashboardTab;
  page: number;
  take: number;
  sort: string;
  direction: DashboardDirection;
  validationTarget: 'all' | 'prediction' | 'parlay';
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: string;
  statuses: string[];
  market?: string;
  team?: string;
  competition?: string;
  minConfidence?: number;
  maxConfidence?: number;
  minEdge?: number;
  maxEdge?: number;
  qualities: string[];
  fixtureStatuses: string[];
}

export interface DashboardQueryOptions {
  defaultTab: DashboardTab;
  defaultSortBy: string;
  defaultDirection: DashboardDirection;
}

export interface DashboardMetadata {
  tabs: DashboardTab[];
  statuses: DashboardStatusOptions;
  validationTargets: readonly ('all' | 'prediction' | 'parlay')[];
  markets: readonly string[];
  qualities: readonly string[];
  teams: ReadonlyArray<DashboardMetadataOption>;
  competitions: ReadonlyArray<DashboardMetadataOption>;
  directions: readonly DashboardDirection[];
  takeOptions: readonly number[];
  sortOptions: {
    fixtures: readonly string[];
    predictions: readonly string[];
    parlays: readonly string[];
    validations: readonly string[];
    runs: readonly string[];
  };
}

export interface DashboardMetadataOption {
  id: string;
  name: string;
}

export const DASHBOARD_TABS: DashboardTab[] = ['fixtures', 'predictions', 'parlays', 'validations', 'runs'];
export const MAX_TAKE = 200;
export const DEFAULT_TAKE = 50;
export const TAKE_OPTIONS = [25, 50, 100, 200] as const;

export const OVERVIEW_SORT_OPTIONS = {
  fixtures: ['scheduledAt', 'status', 'createdAt', 'updatedAt'] as const,
  predictions: ['generatedAt', 'marketKey', 'selectionKey', 'odds', 'impliedProbability', 'edge', 'confidence', 'status'] as const,
  parlays: ['generatedAt', 'combinedOdds', 'aggregateConfidence', 'aggregateQuality', 'status'] as const,
  validations: ['evaluatedAt', 'status', 'createdAt'] as const,
  runs: ['createdAt', 'startedAt', 'completedAt', 'status', 'verdict'] as const,
} as const;

export const DIRECTION_OPTIONS: readonly DashboardDirection[] = ['asc', 'desc'];

const VALID_PREDICTION_STATUSES = [...PREDICTION_STATUSES, ...['promotable', 'blocked', 'review-required', 'candidate', 'draft']];
const VALID_PREDICTION_QUALITIES = [...PREDICTION_QUALITIES, ...['low', 'medium', 'high']];
const VALID_VALIDATION_TARGETS = ['all', 'prediction', 'parlay'] as const;

export function parseOverviewQuery(params: URLSearchParams, options: DashboardQueryOptions): ParsedOverviewQuery {
  const tab = normalizeTab(params.get('tab'), options.defaultTab);
  const validationTarget = normalizeValidationTarget(params.get('validationTarget'));
  const page = normalizePositiveInt(params.get('page'), 1);
  const take = normalizePositiveInt(params.get('take'), DEFAULT_TAKE, 1, MAX_TAKE);

  const sortFromQuery = params.get('sort');
  const defaultSort = options.defaultSortBy;
  const sort = isAllowedSort(tab, sortFromQuery) ? sortFromQuery : defaultSort;
  const direction = normalizeDirection(params.get('direction'), options.defaultDirection);

  const date = cleanDate(cleanText(params.get('date')));
  const dateFrom = cleanDate(cleanText(params.get('dateFrom')));
  const dateTo = cleanDate(cleanText(params.get('dateTo')));

  const normalizedDateFrom = dateFrom ?? date ?? dateTo;
  const normalizedDateTo = dateTo ?? date ?? dateFrom;

  const statuses = normalizeMultiValues(params.getAll('status'));
  const legacyStatus = cleanText(params.get('status'));
  const mergedStatuses = dedupe([...statuses, ...normalizeCommaList(legacyStatus)]);
  const market = cleanText(params.get('market')) ?? undefined;
  const team = cleanText(params.get('team')) ?? undefined;
  const competition = cleanText(params.get('competition')) ?? undefined;

  const minConfidence = normalizeFloat(params.get('minConfidence'));
  const maxConfidence = normalizeFloat(params.get('maxConfidence'));
  const minEdge = normalizeFloat(params.get('minEdge'));
  const maxEdge = normalizeFloat(params.get('maxEdge'));

  const qualities = normalizeCommaList(cleanText(params.get('quality'))).filter((item) => isQuality(item));
  const fixtureStatuses = normalizeCommaList(cleanText(params.get('fixtureStatus'))).filter(Boolean);

  return {
    tab,
    validationTarget,
    page,
    take,
    sort,
    direction,
    date,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    runId: cleanText(params.get('runId')) ?? undefined,
    statuses: mergedStatuses,
    market,
    team,
    competition,
    minConfidence: minConfidence === null ? undefined : minConfidence,
    maxConfidence: maxConfidence === null ? undefined : maxConfidence,
    minEdge: minEdge === null ? undefined : minEdge,
    maxEdge: maxEdge === null ? undefined : maxEdge,
    qualities,
    fixtureStatuses,
  };
}

export function createMetadata(): DashboardMetadata {
  return {
    tabs: DASHBOARD_TABS,
    statuses: {
      fixtures: ['scheduled', 'live', 'completed', 'cancelled', 'unknown'],
      predictions: VALID_PREDICTION_STATUSES,
      parlays: [...new Set(['draft', 'candidate', 'review-required', 'promotable', 'blocked'])],
      validations: ['pending', 'won', 'lost', 'push', 'voided', 'error', 'blocked'],
      runs: ['created', 'queued', 'running', 'succeeded', 'failed', 'cancelled'],
    },
    validationTargets: VALID_VALIDATION_TARGETS,
    markets: MARKET_KEYS,
    qualities: [...new Set(VALID_PREDICTION_QUALITIES)],
    teams: [],
    competitions: [],
    directions: DIRECTION_OPTIONS,
    takeOptions: TAKE_OPTIONS,
    sortOptions: {
      fixtures: OVERVIEW_SORT_OPTIONS.fixtures,
      predictions: OVERVIEW_SORT_OPTIONS.predictions,
      parlays: OVERVIEW_SORT_OPTIONS.parlays,
      validations: OVERVIEW_SORT_OPTIONS.validations,
      runs: OVERVIEW_SORT_OPTIONS.runs,
    },
  };
}

export function normalizeSortAndDirectionForTab(
  tab: DashboardTab,
  sort: string,
  direction: DashboardDirection,
): { sort: string; direction: DashboardDirection } {
  return {
    sort: isAllowedSort(tab, sort) ? sort : OVERVIEW_SORT_OPTIONS[tab][0],
    direction: normalizeDirection(direction, 'desc'),
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeMultiValues(values: readonly string[]): string[] {
  return dedupe(values.flatMap((value) => normalizeCommaList(value)));
}

function isAllowedSort(tab: DashboardTab, sort: string | null): sort is typeof OVERVIEW_SORT_OPTIONS[DashboardTab][number] {
  if (!sort) return false;
  return OVERVIEW_SORT_OPTIONS[tab].includes(sort as never);
}

function normalizeDirection(value: string | null | undefined, fallback: DashboardDirection): DashboardDirection {
  if (value === 'asc' || value === 'desc') return value;
  if (value !== null && (value as string).trim().toLowerCase() === 'asc') return 'asc';
  if (value !== null && (value as string).trim().toLowerCase() === 'desc') return 'desc';
  return fallback;
}

function normalizeTab(value: string | null, fallback: DashboardTab): DashboardTab {
  const trimmed = cleanText(value);
  if (!trimmed) return fallback;
  return DASHBOARD_TABS.includes(trimmed as DashboardTab) ? (trimmed as DashboardTab) : fallback;
}

function normalizePositiveInt(value: string | null, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function normalizeFloat(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCommaList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

function cleanText(value: string | null): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function cleanDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map((part) => Number(part));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      return undefined;
    }
    return trimmed;
  }

  const parsedDate = new Date(trimmed);
  return Number.isNaN(parsedDate.getTime()) ? undefined : trimmed;
}

function normalizeValidationTarget(value: string | null): 'all' | 'prediction' | 'parlay' {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'all';
  return VALID_VALIDATION_TARGETS.includes(normalized as never) ? (normalized as 'all' | 'prediction' | 'parlay') : 'all';
}

function isQuality(value: string): value is string {
  return VALID_PREDICTION_QUALITIES.includes(value);
}
