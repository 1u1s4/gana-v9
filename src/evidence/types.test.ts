import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evidenceItemSchema,
  researchBundleSchema,
  sourceRecordSchema,
} from './types.js';

describe('research evidence schemas', () => {
  it('accepts source records with one durable locator', () => {
    assert.equal(sourceRecordSchema.safeParse({
      id: 'source-1',
      type: 'provider-snapshot',
      snapshotId: 'snapshot-1',
      capturedAt: '2026-04-25T12:00:00.000Z',
    }).success, true);
  });

  it('rejects source records without url, snapshot, artifact, or external id', () => {
    const result = sourceRecordSchema.safeParse({
      id: 'source-1',
      type: 'web-search',
      capturedAt: '2026-04-25T12:00:00.000Z',
    });

    assert.equal(result.success, false);
  });

  it('rejects evidence confidence outside the canonical range', () => {
    const result = evidenceItemSchema.safeParse({
      id: 'evidence-1',
      sourceId: 'source-1',
      summary: 'summary',
      confidence: 1.2,
    });

    assert.equal(result.success, false);
  });

  it('accepts the minimum research bundle shape', () => {
    const result = researchBundleSchema.safeParse({
      id: 'research-bundle-1',
      runId: 'run-1',
      fixtureId: 'fixture-1',
      providerFixtureId: '1001',
      providerAgentic: 'codex',
      model: 'gpt-5.5',
      promptVersion: 'research-fixture-v1',
      createdAt: '2026-04-25T12:00:00.000Z',
      sources: [{
        id: 'source-1',
        type: 'api-football',
        externalId: '1001',
        capturedAt: '2026-04-25T12:00:00.000Z',
      }],
      evidenceItems: [],
      claims: [],
      gateResult: {
        verdict: 'blocked',
        reasons: ['no evidence'],
        warnings: [],
      },
      warnings: [],
    });

    assert.equal(result.success, true);
  });
});
