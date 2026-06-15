import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  countPublishableSelections,
  readCurrentRecommendationArtifact,
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
});
