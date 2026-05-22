import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDiscordPayload, buildGatewayMessage } from '../scripts/notify-discord-strategy-review.mjs';

describe('discord strategy review notifier', () => {
  it('builds a technical native Discord payload for Harness changes', () => {
    const payload = buildDiscordPayload(sampleStrategyReview(), { username: 'Hermes Test' });

    assert.equal(payload.username, 'Hermes Test');
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.equal(payload.embeds[0].title, '🧠 Gana v9 · Strategy Review Harness');
    assert.match(payload.embeds[0].description, /gpt-5.5 · reasoning xhigh/);
    assert.match(payload.embeds[0].description, /Predicciones 10 · Hit 60.0%/);
    assert.match(payload.embeds[1].description, /Patrones efectivos/);
    assert.match(payload.embeds[2].title, /Cambios Harness propuestos/);
    assert.match(payload.embeds[2].description, /Filter duplicate parlays/);
    assert.match(payload.embeds[2].description, /src\/daily\/e2e.ts/);
    assert.match(payload.embeds[2].description, /Test:/);
    assert.match(payload.embeds.at(-1).description, /Artifact analítico/);
    assert.doesNotMatch(JSON.stringify(payload), /@everyone|@here/);
  });

  it('builds a compact gateway fallback message', () => {
    const message = buildGatewayMessage(sampleStrategyReview());

    assert.match(message, /Strategy Review Harness/);
    assert.match(message, /Cambios propuestos/);
    assert.match(message, /Filter duplicate parlays/);
    assert.match(message, /Weak buckets:/);
  });
});

function sampleStrategyReview() {
  return {
    runId: 'strategy-review-test',
    scope: 'historical-backfill',
    dates: ['2026-05-01', '2026-05-23'],
    model: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    historySummary: {
      predictions: { total: 10, won: 6, lost: 4, pending: 1, unvalidated: 2, hitRate: 0.6 },
      parlays: { total: 5, won: 2, lost: 3, pending: 0, unvalidated: 1, hitRate: 0.4 },
      weakestBuckets: [{ bucket: 'parlay.model:test', hitRate: 0.12 }],
      recurringIssues: ['high odds underperformed'],
    },
    agentReview: {
      status: 'ok',
      model: 'gpt-5.5',
      reasoningEffort: 'xhigh',
      summary: 'Historical validation supports a more conservative harness.',
      effectivePatterns: ['double_chance should stay core'],
      failurePatterns: ['high odds underperformed'],
      proposedHarnessChanges: [{
        title: 'Filter duplicate parlays by logical leg signature',
        priority: 'high',
        status: 'ready-for-implementation',
        targetFiles: ['src/daily/e2e.ts', 'src/parlay/analysis.ts'],
        rationale: 'Duplicate structures escaped final filtering.',
        expectedImpact: 'No duplicate logical parlays in recommendation artifacts.',
        verification: 'pnpm test -- src/daily/e2e.test.ts',
      }],
    },
  };
}
