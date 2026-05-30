import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCorpusFromEvidencePack } from './corpus.js';

describe('retrieval corpus', () => {
  it('builds documents from linked claims and evidence', () => {
    const corpus = buildCorpusFromEvidencePack({
      sources: [{ id: 'source-1', type: 'news', availableAt: '2026-05-29T10:00:00.000Z' }],
      claims: [{
        id: 'claim-1',
        statement: 'Team A rested starters in the cup match.',
        sourceIds: ['source-1'],
        fixtureId: 'fixture-1',
        market: 'h2h',
        availableAt: '2026-05-29T11:00:00.000Z',
      }],
      evidenceItems: [{
        id: 'evidence-1',
        sourceId: 'source-1',
        summary: 'Coach confirmed rotation in a press conference.',
        fixtureId: 'fixture-1',
        market: 'h2h',
      }],
    });

    assert.deepEqual(corpus.map((doc) => ({ id: doc.id, type: doc.type, sourceId: doc.sourceId })), [
      { id: 'claim-1', type: 'claim', sourceId: 'source-1' },
      { id: 'evidence-1', type: 'news', sourceId: 'source-1' },
    ]);
    assert.equal(corpus[1].availableAt, '2026-05-29T10:00:00.000Z');
  });

  it('ignores malformed pack sections instead of creating undefined-id documents', () => {
    const corpus = buildCorpusFromEvidencePack({
      sources: 'not-an-array',
      claims: [{ statement: 'missing id' }, null, 'bad claim'],
      evidenceItems: [{ id: 'evidence-1' }, { id: 'evidence-2', text: 'usable fallback text' }],
    });

    assert.deepEqual(corpus.map((doc) => doc.id), ['evidence-2']);
    assert.equal(buildCorpusFromEvidencePack(null).length, 0);
  });
});
