import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Fixture } from '../domain/fixtures.js';
import { reusableResearch } from './research-reuse.js';

const now = new Date('2026-10-06T18:00:00.000Z');
const fixture: Fixture = { id: 'fixture-1', provider: 'api-football', providerFixtureId: '123', homeTeamId: 'home', awayTeamId: 'away', scheduledAt: '2026-10-07T18:00:00.000Z', status: 'scheduled', includedByFilters: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
const bundle = { id: 'bundle-1', runId: 'source', fixtureId: fixture.id, providerFixtureId: '123', sources: [{ id: 'web-1', type: 'web-search', url: 'https://example.com/news', capturedAt: now.toISOString() }], claims: [], evidenceItems: [], gateResult: { verdict: 'review-required', markets: [{ market: 'h2h', verdict: 'promotable', reasons: ['Documented sample'] }] }, providerAgentic: 'codex', model: 'gpt-5.6-sol', promptVersion: 'research-fixture-v2', createdAt: now.toISOString() };

test('recovery reuses only explicit recent compatible research and records its hash', () => {
  const root = mkdtempSync(join(tmpdir(), 'research-reuse-'));
  try {
    mkdirSync(join(root, 'runs', 'source'), { recursive: true });
    const save = (result: unknown) => writeFileSync(join(root, 'runs', 'source', 'research-results.json'), JSON.stringify({ results: [result] }));
    save({ ok: true, bundle });
    const reuse = (fixtures = [fixture]) => reusableResearch(root, 'source', fixtures, now, 'gpt-5.6-sol', ['h2h']);
    assert.equal(reusableResearch(root, undefined, [fixture], now, 'gpt-5.6-sol', ['h2h']).results.size, 0);
    assert.equal(reuse().results.size, 1);
    assert.match(reuse().proof[0]!.bundleSha256, /^[a-f0-9]{64}$/);
    assert.equal(reuse().proof[0]!.sourceRunId, 'source');
    for (const change of [{ createdAt: '2026-10-06T05:00:00.000Z' }, { createdAt: '2026-10-06T19:00:00.000Z' }, { fixtureId: 'other' }, { providerFixtureId: 'other' }, { model: 'other' }, { promptVersion: 'old' }, { sources: [] }, { gateResult: { verdict: 'blocked' } }, { gateResult: { verdict: 'review-required', markets: [] } }]) {
      save({ ok: true, bundle: { ...bundle, ...change } });
      assert.equal(reuse().results.size, 0, JSON.stringify(change));
    }
    save({ ok: true, bundle, error: 'Persistence failed' });
    assert.equal(reuse().results.size, 0);
    save({ ok: false, bundle });
    assert.equal(reuse().results.size, 0);
    save({ ok: true, bundle });
    assert.equal(reuse([{ ...fixture, status: 'completed' }]).results.size, 0);
    assert.equal(reuse([{ ...fixture, scheduledAt: '2026-10-06T20:00:00.000Z' }]).results.size, 0);
    assert.throws(() => reusableResearch(root, '../source', [fixture], now, 'gpt-5.6-sol', ['h2h']), /Unsafe/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
