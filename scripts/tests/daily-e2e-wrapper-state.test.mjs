import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  countPublishableSelections,
  readCurrentRecommendationArtifact,
  validatePublicationLedgerAlignment,
} from '../lib/daily-e2e-wrapper-state.mjs';

describe('daily E2E wrapper state helpers', () => {
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
});
