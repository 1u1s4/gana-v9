import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildDailyReviewCandidatePayloads,
  buildDailyReviewCandidates,
  publishDailyReviewCandidates,
} from '../lib/daily-review-candidates.mjs';

describe('daily review candidates', () => {
  it('never retries an uncertain delivery, even when the displayed cohort changes', async () => {
    const fixture = makeFixture();
    try {
      writeFileSync(join(fixture.input.recommendationsPath, '..', 'daily-review-candidates.json'), JSON.stringify({
        status: 'publishing', discord: { messageIds: [] },
      }));
      const result = await publishDailyReviewCandidates({ ...fixture.input, maxSelections: 1 }, {
        sendDiscordNativePayload: async () => { throw new Error('must not send'); },
      });
      assert.equal(result.status, 'publication-uncertain');
      assert.equal(result.reason, 'previous-review-delivery-requires-reconciliation');
    } finally { fixture.cleanup(); }
  });
  it('keeps only positive-edge review candidates with a model probability and fresh odds', () => {
    const fixture = makeFixture();
    try {
      const artifact = buildDailyReviewCandidates(fixture.input);
      assert.equal(artifact.counts.evaluated, 6);
      assert.equal(artifact.counts.candidates, 1);
      assert.equal(artifact.candidates[0].predictionId, 'candidate');
      assert.equal(artifact.candidates[0].fixture, 'Local FC vs Visita FC');
    } finally {
      fixture.cleanup();
    }
  });

  it('paginates review candidates without presenting them as approved recommendations', () => {
    const candidates = Array.from({ length: 9 }, (_, index) => ({
      predictionId: `candidate-${index}`,
      fixture: `Local ${index} vs Visita ${index}`,
      market: 'h2h', selection: 'home', line: null, odds: 2,
      modelProbability: 0.55, edge: 0.05, confidence: 0.6,
      blockers: ['Falta calibración suficiente'], warnings: [],
    }));
    const payloads = buildDailyReviewCandidatePayloads({
      date: '2026-10-01', counts: { displayed: 9, candidates: 9 }, candidates,
      displayedPredictionIds: candidates.map((candidate) => candidate.predictionId),
    });
    assert.equal(payloads.length, 2);
    assert.match(payloads[0].embeds[0].description, /No son picks aprobados/);
    assert.ok(payloads.every((payload) => payload.embeds.length <= 9));
  });

  it('persists Discord ids and avoids duplicate sends for the same candidate fingerprint', async () => {
    const fixture = makeFixture();
    try {
      let sends = 0;
      const dependencies = {
        sendDiscordNativePayload: async () => ({ message_id: `message-${++sends}` }),
      };
      const first = await publishDailyReviewCandidates({ ...fixture.input, discordTarget: 'discord:test' }, dependencies);
      const second = await publishDailyReviewCandidates({ ...fixture.input, discordTarget: 'discord:test' }, dependencies);
      assert.equal(first.status, 'published');
      assert.equal(second.status, 'already-published');
      assert.equal(sends, 1);
      assert.deepEqual(first.messageIds, ['message-1']);
    } finally {
      fixture.cleanup();
    }
  });
});

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'gana-review-candidates-'));
  const batchDir = join(root, 'runs', 'daily-2026-10-01-full');
  const runDir = join(root, 'runs', 'provider-run');
  mkdirSync(batchDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'fixtures.json'), JSON.stringify({ fixtures: [{
    id: 'fixture-1', providerFixtureId: 'provider-1', homeTeamName: 'Local FC', awayTeamName: 'Visita FC',
    competitionName: 'Liga', scheduledAt: '2026-10-01T18:00:00Z',
  }] }));
  writeFileSync(join(runDir, 'scoring-results.json'), JSON.stringify({ results: [{ predictions: [
    prediction('candidate'),
    prediction('blocked', { status: 'blocked' }),
    prediction('missing-probability', { modelProbability: null }),
    prediction('negative-edge', { edge: -0.01 }),
    prediction('stale', { warnings: ['stale odds snapshot'] }),
    prediction('untraceable', { evidenceIds: [] }),
  ] }] }));
  const recommendationsPath = join(batchDir, 'daily-parlay-recommendations.json');
  writeFileSync(recommendationsPath, '{}');
  return {
    input: {
      recommendationArtifact: { sourceRunIds: ['provider-run'] },
      recommendationsPath,
      date: '2026-10-01',
      dailyBatchId: 'daily-2026-10-01-full',
      maxSelections: 25,
      generatedAt: '2026-09-30T19:00:00Z',
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function prediction(id, overrides = {}) {
  return {
    id, fixtureId: 'fixture-1', providerFixtureId: 'provider-1', status: 'review-required',
    market: 'h2h', selection: 'home', odds: 2, modelProbability: 0.55,
    edge: 0.05, confidence: 0.6, blockers: ['Falta calibración'], warnings: [],
    researchBundleId: 'bundle-1', evidenceIds: ['evidence-1'], claimIds: ['claim-1'], rationale: 'Supported factual estimate',
    ...overrides,
  };
}
