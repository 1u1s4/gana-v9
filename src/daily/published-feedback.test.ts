import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { readPublishedValidationMetrics, buildPublishedFeedbackPromptContext } from './published-feedback.js';

function write(path: string, value: unknown) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)); }
function seed(root: string, date: string, overrides: Record<string, unknown> = {}) {
  const dailyBatchId = `daily-${date}-full`;
  const canonical = join(root, 'runs', dailyBatchId, 'daily-parlay-recommendations.json');
  const metrics = join(root, 'runs', `metrics-${date}`, 'daily-metrics.json');
  const counts = { total: 3, settled: 2, won: 1, lost: 1, voided: 1, blocked: 0, pending: 0, unvalidated: 0, byMarket: [] };
  write(canonical, { date, dailyBatchId });
  write(join(root, 'cron', 'locks', `daily-e2e-${date}.lock`), { date, dailyBatchId, status: 'published' });
  write(join(root, 'cron', 'locks', `validation-${date}.lock`), {
    date, status: 'published', validationExit: 0, metricsExit: 0, completedAt: `${date}T23:00:00Z`,
    source: { dailyBatchId, recommendationArtifact: canonical }, artifacts: { recommendation: canonical, metrics }, ...overrides,
  });
  write(metrics, { date, scope: `daily-${date}`, runId: `metrics-${date}`, recommendationArtifact: canonical, metrics: [{ metricDate: date, predictionMetrics: counts, parlayMetrics: counts }] });
}

test('freshness consumes prior exact published cohort and never the future slate itself', () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'gana-feedback-'));
  try {
    seed(artifactRoot, '2026-09-18'); seed(artifactRoot, '2026-09-22'); seed(artifactRoot, '2026-09-23');
    const config = { artifactRoot }; const now = new Date('2026-09-22T07:00:00Z');
    assert.equal(readPublishedValidationMetrics(config, '2026-09-23', now)?.date, '2026-09-18');
    assert.equal(buildPublishedFeedbackPromptContext(config, '2026-09-23', now).status, 'available');
    assert.equal(readPublishedValidationMetrics(config, '2026-09-18', now), undefined);
  } finally { rmSync(artifactRoot, { recursive: true, force: true }); }
});
test('does not skip an unvalidated or source-misaligned latest publication to improve freshness', () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'gana-feedback-'));
  try {
    seed(artifactRoot, '2026-09-18'); seed(artifactRoot, '2026-09-20', { status: 'retryable' });
    const now = new Date('2026-09-22T07:00:00Z');
    assert.equal(readPublishedValidationMetrics({ artifactRoot }, '2026-09-23', now), undefined);
    seed(artifactRoot, '2026-09-20', { source: { dailyBatchId: 'wrong-batch' } });
    assert.equal(readPublishedValidationMetrics({ artifactRoot }, '2026-09-23', now), undefined);
    seed(artifactRoot, '2026-09-20', { completedAt: '2026-09-25T07:00:00Z' });
    assert.equal(readPublishedValidationMetrics({ artifactRoot }, '2026-09-23', now), undefined);
    seed(artifactRoot, '2026-09-20', { completedAt: '2026-09-22T06:30:00Z' });
    assert.equal(readPublishedValidationMetrics({ artifactRoot }, '2026-09-21', now), undefined);
  } finally { rmSync(artifactRoot, { recursive: true, force: true }); }
});
