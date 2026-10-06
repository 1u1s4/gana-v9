import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Fixture } from '../domain/fixtures.js';
import type { MarketKey } from '../domain/markets.js';
import { researchBundleSchema } from '../evidence/types.js';
import type { FixtureResearchResult } from '../evidence/research.js';
import { hashPayload } from './artifacts.js';

/** Explicit recovery only: reuse factual research, never previous predictions/prices. */
export function reusableResearch(artifactRoot: string, sourceRunId: string | undefined, fixtures: Fixture[],
  now: Date, model: string, markets: MarketKey[]) {
  const results = new Map<string, FixtureResearchResult>();
  const proof: Array<{ providerFixtureId: string; bundleId: string; sourceRunId: string; bundleSha256: string }> = [];
  if (!sourceRunId) return { results, proof };
  if (!/^[A-Za-z0-9_-]+$/.test(sourceRunId)) throw new Error('Unsafe research reuse source run ID');
  const payload = JSON.parse(readFileSync(join(artifactRoot, 'runs', sourceRunId, 'research-results.json'), 'utf8'));
  for (const result of payload.results ?? []) {
    if (!result.ok || result.error) continue;
    const parsed = researchBundleSchema.safeParse(result.bundle);
    if (!parsed.success) continue;
    const bundle = parsed.data;
    const fixture = fixtures.find(item => item.id === bundle.fixtureId && item.providerFixtureId === bundle.providerFixtureId);
    const age = now.getTime() - Date.parse(bundle.createdAt);
    if (!fixture || fixture.status !== 'scheduled' || Date.parse(fixture.scheduledAt) - now.getTime() <= 120 * 60_000
      || !Number.isFinite(age) || age < 0 || age > 12 * 60 * 60_000 || bundle.model !== model
      || bundle.promptVersion !== 'research-fixture-v2' || bundle.gateResult.verdict === 'blocked'
      || !markets.every(market => bundle.gateResult.markets?.some(gate => gate.market === market))
      || !bundle.sources.some(source => source.type === 'web-search' && /^https?:\/\//.test(source.url ?? ''))) continue;
    results.set(fixture.providerFixtureId, result);
    proof.push({ providerFixtureId: fixture.providerFixtureId, bundleId: bundle.id, sourceRunId, bundleSha256: hashPayload(bundle) });
  }
  return { results, proof };
}
