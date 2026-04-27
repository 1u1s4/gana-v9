import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateClaim, validateResearchBundle } from './claims.js';
import type { ResearchBundle } from './types.js';

const createdAt = '2026-04-25T12:00:00.000Z';

function bundle(overrides: Partial<ResearchBundle> = {}): ResearchBundle {
  return {
    id: 'research-bundle-1',
    runId: 'run-1',
    fixtureId: 'fixture-1',
    providerFixtureId: '1001',
    providerAgentic: 'codex',
    model: 'gpt-5.5',
    promptVersion: 'research-fixture-v1',
    createdAt,
    sources: [{
      id: 'source-1',
      type: 'web-search',
      url: 'https://example.com/report',
      capturedAt: createdAt,
    }],
    evidenceItems: [{
      id: 'evidence-1',
      sourceId: 'source-1',
      claimIds: ['claim-1'],
      summary: 'Home team injury report is current.',
      confidence: 0.8,
    }],
    claims: [{
      id: 'claim-1',
      statement: 'Home team has two unavailable starters.',
      subject: { type: 'fixture', id: 'fixture-1' },
      supportLevel: 'supported',
      evidenceIds: ['evidence-1'],
      conflictStatus: 'none',
    }],
    gateResult: {
      verdict: 'review-required',
      reasons: ['research generated'],
      warnings: [],
    },
    warnings: [],
    ...overrides,
  };
}

describe('research claims validation', () => {
  it('accepts a valid linked research bundle', () => {
    const result = validateResearchBundle(bundle());

    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  });

  it('rejects evidence that references an unknown source', () => {
    const result = validateResearchBundle(bundle({
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'missing-source',
        claimIds: ['claim-1'],
        summary: 'summary',
        confidence: 0.5,
      }],
    }));

    assert.equal(result.ok, false);
    assert.match(result.issues[0]?.message ?? '', /unknown source/);
  });

  it('rejects claims that reference unknown evidence', () => {
    const result = validateResearchBundle(bundle({
      claims: [{
        id: 'claim-1',
        statement: 'Market claim.',
        subject: { type: 'fixture', id: 'fixture-1' },
        supportLevel: 'supported',
        evidenceIds: ['missing-evidence'],
        conflictStatus: 'none',
      }],
    }));

    assert.equal(result.ok, false);
    assert.match(JSON.stringify(result.issues), /unknown evidence/);
  });

  it('validates market claim subjects against canonical market keys', () => {
    const valid = validateClaim({
      id: 'claim-1',
      statement: 'BTTS is supported by current team context.',
      subject: { type: 'market', market: 'btts' },
      supportLevel: 'partial',
      evidenceIds: ['evidence-1'],
      conflictStatus: 'none',
    });
    const invalid = validateClaim({
      id: 'claim-2',
      statement: 'Unsupported market.',
      subject: { type: 'market', market: 'asian_handicap' },
      supportLevel: 'weak',
      evidenceIds: ['evidence-1'],
      conflictStatus: 'none',
    });

    assert.equal(valid.ok, true);
    assert.equal(invalid.ok, false);
    assert.match(invalid.issues[0]?.message ?? '', /canonical market key/);
  });
});
