import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  detectMonetaryAction,
  NO_MONETARY_ACTIONS_PROMPT,
} from './no-monetary-actions.js';

describe('no monetary actions guard', () => {
  it('blocks real-money betting requests', () => {
    assert.equal(detectMonetaryAction('place bet $50 on the home team').blocked, true);
    assert.equal(detectMonetaryAction('bet 25 on Madrid').blocked, true);
  });

  it('blocks payments, fund movement, and trading requests', () => {
    assert.equal(detectMonetaryAction('transfer $100 from my bank account').blocked, true);
    assert.equal(detectMonetaryAction('buy BTC with USD now').blocked, true);
  });

  it('allows analytical betting-domain artifacts', () => {
    assert.equal(detectMonetaryAction('build an analytical parlay candidate from stored odds').blocked, false);
    assert.equal(detectMonetaryAction(NO_MONETARY_ACTIONS_PROMPT).blocked, false);
  });

  it('does not block non-financial card UI wording', () => {
    assert.equal(detectMonetaryAction('refactor the prediction card component').blocked, false);
  });
});
