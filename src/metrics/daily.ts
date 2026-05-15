import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '../config.js';
import { writeArtifact } from '../runtime/artifacts.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';
import { getPrismaClient } from '../storage/db.js';

export interface RunDailyMetricsInput {
  date: string;
  days?: number;
  persist?: boolean;
  scope?: string;
}

export interface DailyMetricsRunResult {
  ok: boolean;
  runId: string;
  date: string;
  days: number;
  scope: string;
  metrics: DailyMetricSnapshot[];
  artifactPath?: string;
  persisted: number;
  error?: string;
}

export interface DailyMetricSnapshot {
  metricDate: string;
  timezone: string;
  scope: string;
  sourceWindowStart: string;
  sourceWindowEnd: string;
  predictionMetrics: TargetMetrics;
  parlayMetrics: TargetMetrics;
  chartMetrics: DailyChartMetrics;
  generatedAt: string;
}

export interface TargetMetrics {
  total: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  blocked: number;
  unvalidated: number;
  settled: number;
  hitRate: number | null;
  avgOdds: number | null;
  avgConfidence: number | null;
  avgEdge?: number | null;
  byStatus: MetricBucket[];
  byMarket?: MetricBucket[];
  byProfile?: MetricBucket[];
  byProvider?: MetricBucket[];
  byModel?: MetricBucket[];
  byOddsBucket: MetricBucket[];
  byConfidenceBucket: MetricBucket[];
}

export interface MetricBucket {
  key: string;
  label: string;
  total: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  blocked: number;
  unvalidated: number;
  settled: number;
  hitRate: number | null;
  avgOdds: number | null;
  avgConfidence: number | null;
  avgEdge?: number | null;
}

export interface DailyChartMetrics {
  predictionHitRateByMarket: MetricBucket[];
  predictionHitRateByOddsBucket: MetricBucket[];
  predictionHitRateByConfidenceBucket: MetricBucket[];
  parlayHitRateByProfile: MetricBucket[];
  parlayHitRateByOddsBucket: MetricBucket[];
  parlayHitRateByConfidenceBucket: MetricBucket[];
  predictionHitRateByProvider: MetricBucket[];
  predictionHitRateByModel: MetricBucket[];
  parlayHitRateByProvider: MetricBucket[];
  parlayHitRateByModel: MetricBucket[];
}

export interface DailyMetricsDependencies {
  db?: DailyMetricsDb;
  now?: () => Date;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
}

export interface DailyMetricsDb {
  prediction: {
    findMany(args: unknown): Promise<unknown[]>;
  };
  parlay: {
    findMany(args: unknown): Promise<unknown[]>;
  };
  dailyMetric?: {
    upsert(args: unknown): Promise<unknown>;
    findMany?(args: unknown): Promise<unknown[]>;
  };
}

type SourceRow = {
  status: string;
  odds: number | null;
  confidence: number | null;
  edge?: number | null;
  market?: string;
  profile?: string;
  provider?: string;
  model?: string;
};

const VALIDATION_STATUSES = ['won', 'lost', 'voided', 'pending', 'blocked', 'unvalidated'] as const;

export async function runDailyMetrics(
  config: AgentConfig,
  input: RunDailyMetricsInput,
  runtime: { runId?: string },
  deps: DailyMetricsDependencies = {},
): Promise<DailyMetricsRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const days = clampDays(input.days ?? 1);
  const scope = cleanScope(input.scope);
  const persist = input.persist !== false;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));

  if (!isIsoDate(input.date)) {
    return { ok: false, runId, date: input.date, days, scope, metrics: [], persisted: 0, error: 'metrics daily requires --date YYYY-MM-DD.' };
  }
  if (!deps.db && !config.databaseUrl) {
    return { ok: false, runId, date: input.date, days, scope, metrics: [], persisted: 0, error: 'DATABASE_URL is required to compute daily metrics.' };
  }

  const db = deps.db ?? getPrismaClient() as unknown as DailyMetricsDb;
  const dates = rollingDates(input.date, days);
  const metrics: DailyMetricSnapshot[] = [];
  let persisted = 0;

  for (const date of dates) {
    const snapshot = await computeDailyMetricSnapshot(db, {
      date,
      timezone: config.apiFootball.timezone,
      scope,
      generatedAt,
    });
    metrics.push(snapshot);
    if (persist) {
      if (!db.dailyMetric?.upsert) {
        return { ok: false, runId, date: input.date, days, scope, metrics, persisted, error: 'daily_metrics table is unavailable; run migrations before persisting metrics.' };
      }
      await db.dailyMetric.upsert({
        where: {
          metricDate_timezone_scope: {
            metricDate: metricDateForDb(date),
            timezone: snapshot.timezone,
            scope,
          },
        },
        create: {
          metricDate: metricDateForDb(date),
          timezone: snapshot.timezone,
          scope,
          sourceWindowStart: new Date(snapshot.sourceWindowStart),
          sourceWindowEnd: new Date(snapshot.sourceWindowEnd),
          predictionMetrics: snapshot.predictionMetrics,
          parlayMetrics: snapshot.parlayMetrics,
          chartMetrics: snapshot.chartMetrics,
          generatedAt,
        },
        update: {
          sourceWindowStart: new Date(snapshot.sourceWindowStart),
          sourceWindowEnd: new Date(snapshot.sourceWindowEnd),
          predictionMetrics: snapshot.predictionMetrics,
          parlayMetrics: snapshot.parlayMetrics,
          chartMetrics: snapshot.chartMetrics,
          generatedAt,
        },
      });
      persisted += 1;
    }
  }

  const artifactPath = artifactWriter(runId, 'daily-metrics.json', {
    runId,
    date: input.date,
    days,
    scope,
    generatedAt: generatedAt.toISOString(),
    persisted,
    metrics,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  });

  return { ok: true, runId, date: input.date, days, scope, metrics, artifactPath, persisted };
}

async function computeDailyMetricSnapshot(
  db: DailyMetricsDb,
  input: { date: string; timezone: string; scope: string; generatedAt: Date },
): Promise<DailyMetricSnapshot> {
  const window = fixtureDateRange(input.date, input.timezone);
  const [predictions, parlays] = await Promise.all([
    db.prediction.findMany({
      where: {
        fixture: { scheduledAt: { gte: window.start, lt: window.end } },
      },
      include: {
        validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      },
    }),
    db.parlay.findMany({
      where: {
        legs: { some: { fixture: { scheduledAt: { gte: window.start, lt: window.end } } } },
      },
      include: {
        validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
        legs: { select: { id: true, marketKey: true, fixtureId: true } },
        run: { select: { providerAgentic: true, model: true } },
      },
    }),
  ]);

  const predictionRows = predictions.map(mapPredictionMetricRow);
  const parlayRows = parlays.map(mapParlayMetricRow);
  const predictionMetrics = summarizeTargets(predictionRows, {
    market: true,
    profile: false,
    provider: true,
    model: true,
    edge: true,
  });
  const parlayMetrics = summarizeTargets(parlayRows, {
    market: false,
    profile: true,
    provider: true,
    model: true,
    edge: false,
  });

  return {
    metricDate: input.date,
    timezone: input.timezone,
    scope: input.scope,
    sourceWindowStart: window.start.toISOString(),
    sourceWindowEnd: window.end.toISOString(),
    predictionMetrics,
    parlayMetrics,
    chartMetrics: {
      predictionHitRateByMarket: cloneBuckets(predictionMetrics.byMarket ?? []),
      predictionHitRateByOddsBucket: cloneBuckets(predictionMetrics.byOddsBucket),
      predictionHitRateByConfidenceBucket: cloneBuckets(predictionMetrics.byConfidenceBucket),
      parlayHitRateByProfile: cloneBuckets(parlayMetrics.byProfile ?? []),
      parlayHitRateByOddsBucket: cloneBuckets(parlayMetrics.byOddsBucket),
      parlayHitRateByConfidenceBucket: cloneBuckets(parlayMetrics.byConfidenceBucket),
      predictionHitRateByProvider: cloneBuckets(predictionMetrics.byProvider ?? []),
      predictionHitRateByModel: cloneBuckets(predictionMetrics.byModel ?? []),
      parlayHitRateByProvider: cloneBuckets(parlayMetrics.byProvider ?? []),
      parlayHitRateByModel: cloneBuckets(parlayMetrics.byModel ?? []),
    },
    generatedAt: input.generatedAt.toISOString(),
  };
}

function mapPredictionMetricRow(item: unknown): SourceRow {
  const row = item as any;
  const latest = Array.isArray(row.validationArtifacts) ? row.validationArtifacts[0] : undefined;
  return {
    status: normalizeValidationStatus(latest?.status),
    odds: toNumberOrNull(row.odds),
    confidence: toNumberOrNull(row.confidence),
    edge: toNumberOrNull(row.edge),
    market: typeof row.marketKey === 'string' ? row.marketKey : 'unknown',
    provider: typeof row.providerAgentic === 'string' ? row.providerAgentic : 'unknown',
    model: typeof row.model === 'string' ? row.model : 'unknown',
  };
}

function mapParlayMetricRow(item: unknown): SourceRow {
  const row = item as any;
  const latest = Array.isArray(row.validationArtifacts) ? row.validationArtifacts[0] : undefined;
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    status: normalizeValidationStatus(latest?.status),
    odds: toNumberOrNull(row.combinedOdds),
    confidence: toNumberOrNull(row.aggregateConfidence),
    profile: typeof metadata.portfolioProfile === 'string'
      ? metadata.portfolioProfile
      : typeof metadata.profile === 'string'
        ? metadata.profile
        : 'default',
    provider: typeof row.run?.providerAgentic === 'string'
      ? row.run.providerAgentic
      : typeof metadata.providerAgentic === 'string'
        ? metadata.providerAgentic
        : 'unknown',
    model: typeof row.run?.model === 'string'
      ? row.run.model
      : typeof metadata.model === 'string'
        ? metadata.model
        : 'unknown',
  };
}

function summarizeTargets(rows: SourceRow[], options: { market: boolean; profile: boolean; provider: boolean; model: boolean; edge: boolean }): TargetMetrics {
  const base = summarizeBucket('all', rows, options.edge);
  return {
    total: base.total,
    won: base.won,
    lost: base.lost,
    voided: base.voided,
    pending: base.pending,
    blocked: base.blocked,
    unvalidated: base.unvalidated,
    settled: base.settled,
    hitRate: base.hitRate,
    avgOdds: base.avgOdds,
    avgConfidence: base.avgConfidence,
    ...(options.edge ? { avgEdge: base.avgEdge ?? null } : {}),
    byStatus: groupRows(rows, (row) => row.status, options.edge),
    ...(options.market ? { byMarket: groupRows(rows, (row) => row.market ?? 'unknown', options.edge) } : {}),
    ...(options.profile ? { byProfile: groupRows(rows, (row) => row.profile ?? 'default', options.edge) } : {}),
    ...(options.provider ? { byProvider: groupRows(rows, (row) => row.provider ?? 'unknown', options.edge) } : {}),
    ...(options.model ? { byModel: groupRows(rows, (row) => row.model ?? 'unknown', options.edge) } : {}),
    byOddsBucket: groupRows(rows, (row) => oddsBucket(row.odds), options.edge),
    byConfidenceBucket: groupRows(rows, (row) => confidenceBucket(row.confidence), options.edge),
  };
}

function groupRows(rows: SourceRow[], keyFn: (row: SourceRow) => string, includeEdge: boolean): MetricBucket[] {
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, values]) => summarizeBucket(key, values, includeEdge))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

function summarizeBucket(key: string, rows: SourceRow[], includeEdge: boolean): MetricBucket {
  const counts: Record<string, number> = Object.fromEntries(VALIDATION_STATUSES.map((status) => [status, 0]));
  let oddsSum = 0;
  let oddsCount = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (const row of rows) {
    counts[normalizeValidationStatus(row.status)] += 1;
    if (row.odds !== null) {
      oddsSum += row.odds;
      oddsCount += 1;
    }
    if (row.confidence !== null) {
      confidenceSum += row.confidence;
      confidenceCount += 1;
    }
    if (includeEdge && row.edge !== null && row.edge !== undefined) {
      edgeSum += row.edge;
      edgeCount += 1;
    }
  }

  const settled = counts.won + counts.lost;
  return {
    key,
    label: key,
    total: rows.length,
    won: counts.won,
    lost: counts.lost,
    voided: counts.voided,
    pending: counts.pending,
    blocked: counts.blocked,
    unvalidated: counts.unvalidated,
    settled,
    hitRate: settled ? round((counts.won / settled) * 100, 1) : null,
    avgOdds: oddsCount ? round(oddsSum / oddsCount, 3) : null,
    avgConfidence: confidenceCount ? round(confidenceSum / confidenceCount, 4) : null,
    ...(includeEdge ? { avgEdge: edgeCount ? round(edgeSum / edgeCount, 4) : null } : {}),
  };
}

function cloneBuckets(rows: MetricBucket[]): MetricBucket[] {
  return rows.map((row) => ({ ...row }));
}

function oddsBucket(value: number | null): string {
  if (value === null) return 'unknown';
  if (value < 1.5) return '<1.50';
  if (value < 2) return '1.50-1.99';
  if (value < 3) return '2.00-2.99';
  if (value < 5) return '3.00-4.99';
  return '>=5.00';
}

function confidenceBucket(value: number | null): string {
  if (value === null) return 'unknown';
  if (value < 0.5) return '<0.50';
  if (value < 0.65) return '0.50-0.64';
  if (value < 0.75) return '0.65-0.74';
  if (value < 0.85) return '0.75-0.84';
  return '>=0.85';
}

function normalizeValidationStatus(value: unknown): string {
  const status = typeof value === 'string' ? value : 'unvalidated';
  return (VALIDATION_STATUSES as readonly string[]).includes(status) ? status : status === 'error' ? 'blocked' : 'unvalidated';
}

function rollingDates(date: string, days: number): string[] {
  const end = new Date(`${date}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const next = new Date(end);
    next.setUTCDate(end.getUTCDate() - offset);
    dates.push(next.toISOString().slice(0, 10));
  }
  return dates;
}

function metricDateForDb(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(90, Math.max(1, Math.trunc(value)));
}

function cleanScope(value: string | undefined): string {
  const clean = value?.trim();
  return clean ? clean.slice(0, 80) : 'all';
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
