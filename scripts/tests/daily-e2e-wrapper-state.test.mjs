import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildDbPublicationLedgerPlan,
  countPublishableSelections,
  readExistingRecommendationArtifact,
  readCurrentRecommendationArtifact,
  resolveApiFootballLimitRetry,
  validatePublicationTargetIds,
  validateRetryablePublishLock,
  validatePublicationLedgerAlignment,
} from '../lib/daily-e2e-wrapper-state.mjs';

describe('daily E2E wrapper state helpers', () => {
  it('uses a short retry window for API-Football per-minute limits', () => {
    const retry = resolveApiFootballLimitRetry({
      runDiagnostics: {
        reasons: ['API-Football rate_limited: Too many requests; exceeded limit per minute.'],
      },
    }, {
      now: new Date('2026-07-15T22:00:00.000Z'),
    });

    assert.deepEqual(retry, {
      kind: 'minute',
      retryAfter: '2026-07-15T22:02:00.000Z',
      reason: 'API-Football per-minute request limit reached; Daily E2E produced no Discord recommendations',
    });
  });

  it('keeps the UTC reset window for API-Football daily limits', () => {
    const retry = resolveApiFootballLimitRetry({
      runDiagnostics: {
        reasons: ['API-Football quota_exceeded: request limit for the day reached.'],
      },
    }, {
      now: new Date('2026-07-15T22:00:00.000Z'),
    });

    assert.deepEqual(retry, {
      kind: 'daily',
      retryAfter: '2026-07-16T00:05:00.000Z',
      reason: 'API-Football daily request limit reached; Daily E2E produced no Discord recommendations',
    });
  });

  it('does not misclassify generic plan or access failures as a daily quota reset', () => {
    const retry = resolveApiFootballLimitRetry({
      runDiagnostics: {
        reasons: ['API-Football quota_exceeded: HTTP 403; verify credentials or endpoint access.'],
      },
    }, {
      now: new Date('2026-07-15T22:00:00.000Z'),
    });

    assert.equal(retry, undefined);
  });

  it('rejects stale artifacts from before the current wrapper run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gana-daily-e2e-state-'));
    try {
      const path = join(dir, 'daily-parlay-recommendations.json');
      writeFileSync(path, JSON.stringify({ date: '2026-06-16', dailyBatchId: 'daily-2026-06-16-full', recommendations: [{}] }));

      const result = readCurrentRecommendationArtifact(path, {
        date: '2026-06-16',
        dailyBatchId: 'daily-2026-06-16-full',
        startedAt: new Date(Date.now() + 10_000),
        staleToleranceMs: 0,
      });

      assert.equal(result.ok, false);
      assert.equal(result.reason, 'stale-artifact');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts required-only addendum selections as publishable', () => {
    const counts = countPublishableSelections({
      recommendations: [],
      requiredLeagueRecommendations: {
        atomicProjections: [{ id: 'atomic-1' }, { id: 'atomic-2' }],
        parlayProjections: [
          { status: 'selected' },
          { status: 'blocked' },
          { status: 'selected' },
        ],
      },
    });

    assert.deepEqual(counts, {
      total: 4,
      recommendations: 0,
      requiredAtomic: 2,
      requiredSelectedParlays: 2,
    });
  });

  it('rejects artifacts for a different date or batch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gana-daily-e2e-state-'));
    try {
      const path = join(dir, 'daily-parlay-recommendations.json');
      writeFileSync(path, JSON.stringify({ date: '2026-06-17', dailyBatchId: 'daily-other', recommendations: [{}] }));

      const result = readCurrentRecommendationArtifact(path, {
        date: '2026-06-16',
        dailyBatchId: 'daily-2026-06-16-full',
        startedAt: new Date(Date.now() - 10_000),
      });

      assert.equal(result.ok, false);
      assert.equal(result.reason, 'batch-mismatch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a fresh completed artifact only when its summary matches the slate and batch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gana-daily-e2e-state-'));
    try {
      const artifactPath = join(dir, 'daily-parlay-recommendations.json');
      const summaryPath = join(dir, 'daily-e2e-summary.json');
      const completedAt = new Date('2026-07-14T16:36:20.000Z');
      writeFileSync(artifactPath, JSON.stringify({
        date: '2026-07-15',
        dailyBatchId: 'daily-2026-07-15-full',
        recommendations: [{ kind: 'atomic-prediction' }],
      }));
      utimesSync(artifactPath, completedAt, completedAt);
      writeFileSync(summaryPath, JSON.stringify({
        date: '2026-07-15',
        dailyBatchId: 'daily-2026-07-15-full',
        status: 'succeeded',
        startedAt: '2026-07-14T16:15:00.000Z',
        completedAt: completedAt.toISOString(),
        counts: { recommendations: 1 },
      }));

      const result = readExistingRecommendationArtifact(artifactPath, {
        date: '2026-07-15',
        dailyBatchId: 'daily-2026-07-15-full',
        now: new Date('2026-07-14T19:00:00.000Z'),
      });

      assert.equal(result.ok, true);
      assert.equal(result.reason, 'existing-artifact-verified');
      assert.equal(result.summary.status, 'succeeded');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects missing, stale, future, and summary-mismatched existing artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gana-daily-e2e-state-'));
    try {
      const artifactPath = join(dir, 'daily-parlay-recommendations.json');
      const summaryPath = join(dir, 'daily-e2e-summary.json');
      writeFileSync(artifactPath, JSON.stringify({
        date: '2026-07-15',
        dailyBatchId: 'daily-2026-07-15-full',
        recommendations: [],
      }));
      writeFileSync(summaryPath, JSON.stringify({
        date: '2026-07-15',
        dailyBatchId: 'daily-wrong',
        status: 'succeeded',
        startedAt: '2026-07-14T16:00:00.000Z',
        completedAt: '2026-07-14T16:10:00.000Z',
        counts: { recommendations: 0 },
      }));
      utimesSync(artifactPath, new Date('2026-07-14T16:10:00.000Z'), new Date('2026-07-14T16:10:00.000Z'));

      assert.equal(readExistingRecommendationArtifact(join(dir, 'missing.json'), {
        date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T17:00:00.000Z'),
      }).reason, 'missing-artifact');
      assert.equal(readExistingRecommendationArtifact(artifactPath, {
        date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T17:00:00.000Z'),
      }).reason, 'summary-batch-mismatch');

      const matchingSummary = {
        date: '2026-07-15',
        dailyBatchId: 'daily-2026-07-15-full',
        status: 'succeeded',
        startedAt: '2026-07-14T16:00:00.000Z',
        completedAt: '2026-07-14T16:10:00.000Z',
        counts: { recommendations: 0 },
      };
      writeFileSync(summaryPath, JSON.stringify(matchingSummary));
      assert.equal(readExistingRecommendationArtifact(artifactPath, {
        date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-16T12:00:00.000Z'), maxAgeMs: 60_000,
      }).reason, 'stale-artifact');
      assert.equal(readExistingRecommendationArtifact(artifactPath, {
        date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T15:00:00.000Z'),
      }).reason, 'future-artifact');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('only accepts an expired retryable lock for the exact slate and batch', () => {
    const lock = {
      status: 'retryable',
      date: '2026-07-15',
      dailyBatchId: 'daily-2026-07-15-full',
      retryAfter: '2026-07-14T18:00:00.000Z',
    };
    assert.equal(validateRetryablePublishLock(lock, {
      date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T19:00:00.000Z'),
    }).ok, true);
    assert.equal(validateRetryablePublishLock({ ...lock, status: 'published' }, {
      date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T19:00:00.000Z'),
    }).reason, 'incompatible-lock-status:published');
    assert.equal(validateRetryablePublishLock({ ...lock, dailyBatchId: 'daily-other' }, {
      date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T19:00:00.000Z'),
    }).reason, 'lock-batch-mismatch');
    assert.equal(validateRetryablePublishLock(lock, {
      date: '2026-07-15', dailyBatchId: 'daily-2026-07-15-full', now: new Date('2026-07-14T17:00:00.000Z'),
    }).reason, 'retry-pending');
  });

  it('accepts render selections that are present in the DB publication ledger targets', () => {
    const result = validatePublicationLedgerAlignment({
      persistencePolicy: { finalOperationalStore: 'database-ledger' },
      publishedTargets: {
        parlayIds: ['11111111-1111-5111-8111-111111111111'],
        predictionIds: ['prediction-1', 'prediction-2'],
      },
      recommendations: [{
        kind: 'atomic-prediction',
        predictionId: 'prediction-1',
      }],
      requiredLeagueRecommendations: {
        atomicProjections: [{ predictionId: 'prediction-2' }],
        parlayProjections: [{
          status: 'selected',
          profile: 'parlay-diamante',
          parlayId: '11111111-1111-5111-8111-111111111111',
        }],
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ledger-aligned');
  });

  it('accepts a backed daily-focus parlay when the ledger persists only its prediction legs', () => {
    const predictionIds = [
      '11111111-1111-5111-8111-111111111111',
      '22222222-2222-5222-8222-222222222222',
    ];
    const parlayId = 'daily-focus-parlay-diamante-deadbeef';
    const result = validatePublicationLedgerAlignment({
      persistencePolicy: { finalOperationalStore: 'database-ledger' },
      publishedTargets: { parlayIds: [], predictionIds },
      recommendations: [{
        kind: 'parlay',
        parlayId,
        selectionMode: 'analytical-fallback',
        harnessStatus: 'review-required',
        riskFlags: ['daily-focus-fallback', 'review-required'],
        legs: predictionIds.map((predictionId) => ({ predictionId })),
      }],
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ledger-aligned');
  });

  it('rejects selected required parlays that only have synthetic render ids', () => {
    const result = validatePublicationLedgerAlignment({
      persistencePolicy: { finalOperationalStore: 'database-ledger' },
      publishedTargets: {
        parlayIds: [],
        predictionIds: ['prediction-1'],
      },
      recommendations: [],
      requiredLeagueRecommendations: {
        atomicProjections: [{ predictionId: 'prediction-1' }],
        parlayProjections: [{
          status: 'selected',
          profile: 'parlay-diamante',
          parlayId: 'required-parlay-diamante-deadbeef',
        }],
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /rendered-selection-missing-from-ledger/);
  });

  it('plans a backed daily-focus parlay as artifact-only while verifying its persisted prediction legs', () => {
    const predictionIds = [
      '11111111-1111-5111-8111-111111111111',
      '22222222-2222-5222-8222-222222222222',
    ];
    const parlayId = 'daily-focus-parlay-diamante-deadbeef';
    const plan = buildDbPublicationLedgerPlan({
      publishedTargets: { parlayIds: [parlayId], predictionIds },
      recommendations: [{
        kind: 'parlay',
        parlayId,
        selectionMode: 'analytical-fallback',
        harnessStatus: 'review-required',
        riskFlags: ['daily-focus-fallback', 'review-required'],
        legs: predictionIds.map((predictionId) => ({ predictionId })),
      }],
    });

    assert.deepEqual(plan, {
      persistedParlayIds: [],
      artifactOnlyParlayIds: [parlayId],
      invalidParlayIds: [],
      predictionIds,
    });
  });

  it('rejects an unbacked daily-focus parlay and unknown non-UUID parlay targets', () => {
    const persistedPredictionId = '11111111-1111-5111-8111-111111111111';
    const missingPredictionId = '22222222-2222-5222-8222-222222222222';
    const parlayId = 'daily-focus-parlay-refinado-deadbeef';
    const unknownId = 'typo-or-truncated-real-parlay';
    const plan = buildDbPublicationLedgerPlan({
      publishedTargets: {
        parlayIds: [parlayId, unknownId],
        predictionIds: [persistedPredictionId],
      },
      recommendations: [{
        kind: 'parlay',
        parlayId,
        selectionMode: 'analytical-fallback',
        harnessStatus: 'review-required',
        riskFlags: ['daily-focus-fallback'],
        legs: [
          { predictionId: persistedPredictionId },
          { predictionId: missingPredictionId },
        ],
      }],
    });

    assert.deepEqual(plan.artifactOnlyParlayIds, []);
    assert.deepEqual(plan.invalidParlayIds, [parlayId, unknownId]);
  });

  it('rejects non-UUID prediction publication targets before touching Prisma', () => {
    const result = validatePublicationTargetIds({
      publishedTargets: { parlayIds: [], predictionIds: ['not-a-uuid'] },
      recommendations: [{ kind: 'atomic-prediction', predictionId: 'not-a-uuid' }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid-publication-target-ids:p=0,pred=1');
  });
});
