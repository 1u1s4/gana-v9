import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jointModelProbability, modelProbabilityFor } from './probability.js';
import { generateParlayCandidates } from './candidate-generator.js';

test('canonical model probability accepts persisted decimals and never substitutes evidence or market prices', () => {
  assert.equal(modelProbabilityFor({ probability: { valueOf: () => '0.72' }, modelProbability: 0.99 }), 0.72);
  assert.equal(modelProbabilityFor({ modelProbability: 0.72 }), 0.72);
  assert.equal(modelProbabilityFor({ probability: Number.NaN, modelProbability: 0.99 }), null);
  assert.equal(modelProbabilityFor({}), null);
  assert.equal(jointModelProbability([{ probability: 0.72 }, { probability: 0.72 }]), 0.5184);
  assert.equal(jointModelProbability([{ probability: 0 }, { probability: 0.99 }]), 0);
  assert.equal(jointModelProbability([{ probability: 0.99 }, {}]), null);
});

test('candidate EV uses model estimates and missing estimates cannot inherit confidence', () => {
  const picks = ['a', 'b'].map((id) => ({
    id, fixtureId: id, market: 'h2h', selection: 'home', odds: 1.4,
    estimatedProbability: 0.72, confidence: 0.95, status: 'promotable', edge: 0.02, blockers: [],
  }));
  const [candidate] = generateParlayCandidates(picks as any, 2);
  assert.equal(candidate.combinedFairProbability, 0.5184);
  assert.ok(Math.abs(candidate.expectedEdge - 0.016064) < 1e-10);
  const [missing] = generateParlayCandidates(picks.map((pick) => ({ ...pick, estimatedProbability: undefined })) as any, 2);
  assert.ok(missing.blockers.includes('missing-model-probability'));
  assert.equal(missing.expectedEdge, -1);
});
