import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { AgentConfig } from '../config.js';
import type { DailyMetricSnapshot, DailyMetricsRunResult } from '../metrics/daily.js';

// The validation owner is the previous-day workflow. Never measure settlement
// coverage on today's/future predictions, or pool unpublished candidates into it.
export function readPublishedValidationMetrics(
  config: Pick<AgentConfig, 'artifactRoot'>,
  predictionDate: string,
  now = new Date(),
): DailyMetricsRunResult | undefined {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const cutoff = predictionDate < today ? predictionDate : today;
  // A replay without an explicit intraday as-of conservatively uses the start
  // of its Guatemala day. A validation performed later cannot inform that run.
  const decisionCutoff = predictionDate < today ? Date.parse(`${predictionDate}T06:00:00Z`) : now.getTime();
  const root = resolve(config.artifactRoot);
  for (let age = 1; age <= 14; age++) {
    const instant = new Date(`${cutoff}T12:00:00Z`);
    instant.setUTCDate(instant.getUTCDate() - age);
    const date = instant.toISOString().slice(0, 10);
    const daily = readJson(resolve(root, 'cron', 'locks', `daily-e2e-${date}.lock`));
    if (daily?.status !== 'published' || daily.date !== date || typeof daily.dailyBatchId !== 'string') continue;
    const lock = readJson(resolve(root, 'cron', 'locks', `validation-${date}.lock`));
    // Pick the latest published date with its exact completed validation. An
    // unvalidated publication must stay visible, rather than cherry-picking an
    // older, better cohort until a freshness gate passes.
    if (!lock || lock.status !== 'published' || lock.date !== date
      || lock.source?.dailyBatchId !== daily.dailyBatchId || lock.validationExit !== 0 || lock.metricsExit !== 0) return undefined;
    const canonical = resolve(root, 'runs', daily.dailyBatchId, 'daily-parlay-recommendations.json');
    if (!canonical.startsWith(`${root}${sep}runs${sep}`)
      || resolve(lock.source?.recommendationArtifact ?? '') !== canonical
      || resolve(lock.artifacts?.recommendation ?? '') !== canonical) return undefined;
    const metricsPath = resolve(lock.artifacts?.metrics ?? '');
    if (!metricsPath.startsWith(`${root}${sep}runs${sep}`)) return undefined;
    const artifact = readJson(canonical);
    const metrics = readJson(metricsPath);
    if (artifact?.date !== date || artifact.dailyBatchId !== daily.dailyBatchId
      || metrics?.date !== date || resolve(metrics.recommendationArtifact ?? '') !== canonical
      || !Array.isArray(metrics.metrics)) return undefined;
    const snapshot = metrics.metrics.find((item: DailyMetricSnapshot) => item.metricDate === date);
    if (!validSnapshot(snapshot)) return undefined;
    const completed = Date.parse(lock.completedAt ?? '');
    if (!Number.isFinite(completed) || completed > decisionCutoff) return undefined;
    return {
      ok: true, date, days: 1, scope: metrics.scope, runId: metrics.runId,
      persisted: Number(metrics.persisted) || 0, artifactPath: metricsPath, metrics: [snapshot],
    };
  }
  return undefined;
}

export function buildPublishedFeedbackPromptContext(config: Pick<AgentConfig, 'artifactRoot'>, predictionDate: string, now = new Date()) {
  const result = readPublishedValidationMetrics(config, predictionDate, now);
  const snapshot = result?.metrics[0];
  if (!snapshot) return { status: 'unavailable', warning: 'No exact published, validated cohort before the prediction cutoff; do not infer historical performance.' };
  const view = (metrics: Pick<DailyMetricSnapshot['predictionMetrics'], 'total' | 'settled' | 'won' | 'lost' | 'pending' | 'unvalidated' | 'voided'>) => ({
    total: metrics.total, settled: metrics.settled, won: metrics.won, lost: metrics.lost,
    pending: metrics.pending, unvalidated: metrics.unvalidated, voided: metrics.voided,
  });
  return {
    status: 'available', date: snapshot.metricDate, source: result?.artifactPath,
    predictions: view(snapshot.predictionMetrics), parlays: view(snapshot.parlayMetrics),
    byMarket: snapshot.predictionMetrics.byMarket?.map((bucket) => ({ market: bucket.label, ...view(bucket) })) ?? [],
    warning: 'Descriptive feedback from exact prior publications, not proof of a calibrated probability or a causal backtest. Report sample sizes. Do not tune thresholds from a small cohort or use later match outcomes as pre-match evidence.',
  };
}

function validSnapshot(value: DailyMetricSnapshot | undefined): value is DailyMetricSnapshot {
  return Boolean(value && [value.predictionMetrics, value.parlayMetrics].every((metrics) =>
    metrics && ['total', 'settled', 'won', 'lost', 'voided', 'blocked', 'pending', 'unvalidated'].every((field) => {
      const number = (metrics as unknown as Record<string, unknown>)[field];
      return typeof number === 'number' && Number.isInteger(number) && number >= 0;
    }) && metrics.settled === metrics.won + metrics.lost
      && metrics.total === metrics.won + metrics.lost + metrics.voided + metrics.blocked + metrics.pending + metrics.unvalidated,
  ));
}
function readJson(path: string): any {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined; } catch { return undefined; }
}
