import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { buildDailyModelEvidence } from './model-evidence.js';

it('resolves scoped evidence IDs within their own bundle and preserves model abstention', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gana-model-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = join(root, 'runs', 'run-1'); mkdirSync(run, { recursive: true });
  writeFileSync(join(run, 'research-results.json'), JSON.stringify({ results: [{ bundle: {
    id: 'bundle-1', gateResult: { verdict: 'review-required', reasons: ['Small sample'] },
    claims: [{ id: 'claim-1', statement: 'Dated records', evidenceIds: ['evidence-1'] }],
    evidenceItems: [{ id: 'evidence-1', sourceId: 'source-1', summary: 'Actual sample' }],
    sources: [{ id: 'source-1', url: 'https://example.com/report' }],
  } }] }));
  writeFileSync(join(run, 'scoring-results.json'), JSON.stringify({ results: [{ predictions: [{
    id: 'p1', researchBundleId: 'bundle-1', claimIds: ['bundle-1:claim-1'], evidenceIds: ['bundle-1:evidence-1'],
    status: 'review-required', modelProbability: null, rationale: 'Cannot estimate',
  }] }] }));
  const report = buildDailyModelEvidence(root, '2026-10-06', ['run-1', 'run-1']);
  assert.equal(report.predictions.length, 1);
  assert.equal(report.predictions[0].traceComplete, true);
  assert.equal(report.predictions[0].status, 'review-required');
  assert.equal(report.predictions[0].modelProbability, null);
  assert.equal((report.predictions[0].sources as any[])[0].url, 'https://example.com/report');
});
