import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregatePredictionGate, evaluatePredictionGates } from './gates.js';

const fixture = {
  id: 'fixture-1',
  providerFixtureId: '1001',
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  status: 'scheduled',
  scheduledAt: '2026-04-26T18:00:00.000Z',
};

const oddsQuotes = [{
  id: 'odds-quote-1',
  fixtureId: 'fixture-1',
  market: 'h2h',
  selection: 'home',
  price: 2.1,
  impliedProbability: 0.4761904762,
}];

const researchBundle = {
  id: 'research-bundle-1',
  fixtureId: 'fixture-1',
  providerFixtureId: '1001',
  evidenceItems: [{ id: 'evidence-1', confidence: 0.8 }, { id: 'evidence-2', confidence: 0.7 }],
  claims: [{ id: 'claim-1', evidenceIds: ['evidence-1', 'evidence-2'], conflictStatus: 'none' }],
  gateResult: {
    verdict: 'promotable',
    reasons: ['research complete'],
    warnings: [],
  },
};

describe('prediction gates', () => {
  it('allows prediction when fixture, persisted odds, evidence, and promotable research exist', () => {
    const result = evaluatePredictionGates({ fixture, oddsQuotes, researchBundle });

    assert.deepEqual(result, {
      verdict: 'promotable',
      reasons: ['prediction gates passed'],
      warnings: [],
    });
  });

  it('allows live-web predictions when promotable research includes web evidence', () => {
    const result = evaluatePredictionGates({
      fixture,
      oddsQuotes,
      researchBundle,
      webResearchRequired: true,
      hasWebResearch: true,
    });

    assert.equal(result.verdict, 'promotable');
    assert.deepEqual(result.warnings, []);
  });

  it('keeps otherwise sufficient predictions promotable when only soft research-quality warnings are present', () => {
    const result = evaluatePredictionGates({
      fixture,
      oddsQuotes,
      researchBundle,
      qualityWarnings: ['low-liquidity', 'corners context is thin'],
    });

    assert.equal(result.verdict, 'promotable');
    assert.deepEqual(result.reasons, ['prediction gates passed']);
    assert.deepEqual(result.warnings, ['low-liquidity', 'corners context is thin']);
  });

  it('blocks when fixture context is missing', () => {
    const result = evaluatePredictionGates({ fixture: undefined, oddsQuotes, researchBundle });

    assert.equal(result.verdict, 'blocked');
    assert.match(result.reasons.join('\n'), /missing fixture/i);
  });

  it('blocks when persisted odds are missing', () => {
    const result = evaluatePredictionGates({ fixture, oddsQuotes: [], researchBundle });

    assert.equal(result.verdict, 'blocked');
    assert.match(result.reasons.join('\n'), /missing persisted odds/i);
  });

  it('requires review when linked evidence is insufficient', () => {
    const result = evaluatePredictionGates({
      fixture,
      oddsQuotes,
      researchBundle: { ...researchBundle, evidenceItems: [], claims: [] },
    });

    assert.equal(result.verdict, 'review-required');
    assert.match(result.reasons.join('\n'), /insufficient evidence/i);
  });

  it('requires review until research is promotable', () => {
    const result = evaluatePredictionGates({
      fixture,
      oddsQuotes,
      researchBundle: {
        ...researchBundle,
        gateResult: {
          verdict: 'review-required',
          reasons: ['manual review required'],
          warnings: [],
        },
      },
    });

    assert.equal(result.verdict, 'review-required');
    assert.match(result.warnings.join('\n'), /research.*not promotable/i);
  });

  it('keeps aggregate prediction gate promotable when every leg only has soft warnings', () => {
    const result = aggregatePredictionGate([{
      verdict: 'promotable',
      reasons: ['prediction gates passed'],
      warnings: ['corners context is thin'],
    }, {
      verdict: 'promotable',
      reasons: ['prediction gates passed'],
      warnings: ['low-liquidity'],
    }]);

    assert.equal(result.verdict, 'promotable');
    assert.deepEqual(result.warnings, ['corners context is thin', 'low-liquidity']);
  });
});
