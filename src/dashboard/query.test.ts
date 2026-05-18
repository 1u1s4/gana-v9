import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMetadata, parseOverviewQuery } from './query.js';

function parse(params: string, options = {}) {
  return parseOverviewQuery(new URLSearchParams(params), {
    defaultTab: 'predictions',
    defaultSortBy: 'generatedAt',
    defaultDirection: 'desc',
    ...options,
  });
}

describe('parseOverviewQuery', () => {
  it('applies defaults for empty query', () => {
    const query = parse('');
    assert.equal(query.tab, 'predictions');
    assert.equal(query.page, 1);
    assert.equal(query.take, 50);
    assert.equal(query.sort, 'generatedAt');
    assert.equal(query.direction, 'desc');
    assert.equal(query.statuses.length, 0);
    assert.equal(query.market, undefined);
    assert.equal(query.qualities.length, 0);
  });

  it('normalizes pagination, sort and direction', () => {
    const query = parse('tab=predictions&page=5&take=999&sort=confidence&direction=asc');
    assert.equal(query.page, 5);
    assert.equal(query.take, 200);
    assert.equal(query.tab, 'predictions');
    assert.equal(query.sort, 'confidence');
    assert.equal(query.direction, 'asc');
  });

  it('falls back to the active tab default sort for cross-tab sort params', () => {
    const query = parse('tab=runs&sort=evaluatedAt');

    assert.equal(query.tab, 'runs');
    assert.equal(query.sort, 'createdAt');
  });

  it('normalizes page/take lower bounds', () => {
    const query = parse('page=0&take=0&sort=not-valid&direction=up');
    assert.equal(query.page, 1);
    assert.equal(query.take, 1);
    assert.equal(query.sort, 'generatedAt');
    assert.equal(query.direction, 'desc');
  });

  it('normalizes date fields with fallback and validation', () => {
    const withDate = parse('date=2026-05-01');
    assert.equal(withDate.date, '2026-05-01');
    assert.equal(withDate.dateFrom, '2026-05-01');
    assert.equal(withDate.dateTo, '2026-05-01');

    const withRange = parse('dateFrom=2026-05-01&dateTo=2026-05-03');
    assert.equal(withRange.dateFrom, '2026-05-01');
    assert.equal(withRange.dateTo, '2026-05-03');

    const invalidDate = parse('date=not-a-date');
    assert.equal(invalidDate.date, undefined);
    assert.equal(invalidDate.dateFrom, undefined);
    assert.equal(invalidDate.dateTo, undefined);
  });

  it('parses validationTarget with valid values and defaults to all', () => {
    const withPrediction = parse('validationTarget=prediction&targetId=prediction-1');
    assert.equal(withPrediction.validationTarget, 'prediction');
    assert.equal(withPrediction.targetId, 'prediction-1');
    const withParlay = parse('validationTarget=parlay');
    assert.equal(withParlay.validationTarget, 'parlay');
    const withInvalid = parse('validationTarget=invalid');
    assert.equal(withInvalid.validationTarget, 'all');
    const without = parse('');
    assert.equal(without.validationTarget, 'all');
  });

  it('normalizes status and quality multi values', () => {
    const query = parse('status=won&status=lost,pending&quality=HIGH,low&runId=run-1&minConfidence=0.6&maxConfidence=0.9');
    assert.deepEqual(query.statuses, ['won', 'lost', 'pending']);
    assert.deepEqual(query.qualities, ['high', 'low']);
    assert.equal(query.minConfidence, 0.6);
    assert.equal(query.maxConfidence, 0.9);
    assert.equal(query.runId, 'run-1');
  });

  it('parses daily overview filters', () => {
    const query = parse('tab=daily&dailyBatchId=daily-2026-05-01&provider=codex&model=gpt-5.5&family=consensus-mixed&recommendationTier=promotable&sort=verdict');
    assert.equal(query.tab, 'daily');
    assert.equal(query.dailyBatchId, 'daily-2026-05-01');
    assert.equal(query.provider, 'codex');
    assert.equal(query.model, 'gpt-5.5');
    assert.equal(query.family, 'consensus-mixed');
    assert.equal(query.recommendationTier, 'promotable');
    assert.equal(query.sort, 'verdict');
  });

  it('loads metadata contract from query module', () => {
    const metadata = createMetadata();
    assert.equal(metadata.tabs.includes('predictions'), true);
    assert.equal(metadata.tabs.includes('runs'), true);
    assert.equal(metadata.tabs.includes('daily'), true);
    assert.equal(metadata.validationTargets.includes('all'), true);
    assert.equal(metadata.validationTargets.includes('prediction'), true);
    assert.equal(metadata.validationTargets.includes('parlay'), true);
    assert.equal(metadata.takeOptions[0], 25);
    assert.equal(metadata.takeOptions.includes(200), true);
    assert.equal(metadata.sortOptions.predictions.includes('selectionKey'), true);
    assert.equal(metadata.sortOptions.daily.includes('verdict'), true);
    assert.equal(metadata.sortOptions.predictions.includes('non-valid'), false);
    assert.equal(metadata.directions.includes('asc'), true);
  });
});
