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

  it('allows explicit denials of a guarantee in factual research', () => {
    for (const text of [
      'These facts support comparative assessment, not a guaranteed home win.',
      'Análisis sin garantía de resultado.',
      'We cannot guarantee a profit.',
      'There is no guaranteed win.',
    ]) assert.equal(detectMonetaryAction(text).blocked, false, text);
  });

  it('still blocks affirmative promises and execution commands alongside disclaimers', () => {
    assert.equal(detectMonetaryAction(['no', 'guaranteed home win']).blocked, true);
    assert.equal(detectMonetaryAction({ no: 'guaranteed home win' }).blocked, true);
    for (const text of [
      'A guaranteed home win.',
      'Not a guaranteed home win, but I guarantee a profit.',
      'No guaranteed win. Place bet $50 on the home team.',
      'Sin garantía de resultado: transferir dinero ahora.',
      'Do not guarantee results; transfer $100 from my bank account.',
      'It is not not guaranteed to win.',
    ]) assert.equal(detectMonetaryAction(text).blocked, true, text);
  });
});
