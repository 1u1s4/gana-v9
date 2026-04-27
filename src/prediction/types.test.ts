import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  predictionCandidateSchema,
  predictionRecordSchema,
  predictionRunResultSchema,
} from './types.js';

const createdAt = '2026-04-25T12:00:00.000Z';

function predictionCandidate(overrides: Record<string, unknown> = {}) {
  return {
    fixtureId: 'fixture-1',
    providerFixtureId: '1001',
    market: 'h2h',
    selection: 'home',
    probability: 0.58,
    odds: 2.1,
    impliedProbability: 0.4761904762,
    edge: 0.1038095238,
    oddsSnapshotId: 'odds-snapshot-1',
    oddsQuoteId: 'odds-quote-1',
    evidenceIds: ['evidence-1'],
    claimIds: ['claim-1'],
    rationale: 'Home side has stronger recent evidence and market edge.',
    ...overrides,
  };
}

describe('prediction schemas', () => {
  it('accepts a linked prediction candidate with odds and evidence references', () => {
    const result = predictionCandidateSchema.safeParse(predictionCandidate());

    assert.equal(result.success, true);
  });

  it('rejects candidates without persisted odds linkage', () => {
    const result = predictionCandidateSchema.safeParse(predictionCandidate({ oddsQuoteId: undefined }));

    assert.equal(result.success, false);
  });

  it('rejects candidates without evidence references', () => {
    const result = predictionCandidateSchema.safeParse(predictionCandidate({ evidenceIds: [] }));

    assert.equal(result.success, false);
  });

  it('accepts persisted prediction records with fixture, odds, evidence, and scoring fields', () => {
    const result = predictionRecordSchema.safeParse({
      id: 'prediction-1',
      runId: 'prediction-run-1',
      fixtureId: 'fixture-1',
      providerFixtureId: '1001',
      market: 'h2h',
      selection: 'home',
      probability: 0.58,
      odds: 2.1,
      impliedProbability: 0.4761904762,
      edge: 0.1038095238,
      oddsSnapshotId: 'odds-snapshot-1',
      oddsQuoteId: 'odds-quote-1',
      evidenceIds: ['evidence-1'],
      claimIds: ['claim-1'],
      rationale: 'Home side has stronger recent evidence and market edge.',
      status: 'promotable',
      createdAt,
    });

    assert.equal(result.success, true);
  });

  it('accepts blocked prediction run results with explicit gate reasons', () => {
    const result = predictionRunResultSchema.safeParse({
      ok: false,
      runId: 'prediction-run-1',
      fixtureId: 'fixture-1',
      providerFixtureId: '1001',
      gateResult: {
        verdict: 'blocked',
        reasons: ['missing persisted odds'],
        warnings: [],
      },
      predictions: [],
      artifactPath: '/tmp/prediction-run-1.json',
    });

    assert.equal(result.success, true);
  });
});
