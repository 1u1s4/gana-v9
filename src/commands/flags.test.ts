import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  optionalMarketsFlag,
  optionalRunValidationMode,
  parseFlags,
  parseLowOddsSlashFlags,
  requiredValidationTarget,
} from './flags.js';

describe('command flag parsing', () => {
  it('parses boolean and valued headless flags', () => {
    assert.deepEqual(parseFlags(['--date', '2026-06-12', '--force']), {
      date: '2026-06-12',
      force: true,
    });
  });

  it('expands low-odds slash shorthand into canonical flags', () => {
    assert.deepEqual(parseLowOddsSlashFlags('2026-06-12 threshold:1.20 markets:h2h,btts'), {
      date: '2026-06-12',
      threshold: '1.20',
      markets: 'h2h,btts',
    });
  });

  it('validates market and validation mode contracts', () => {
    assert.deepEqual(optionalMarketsFlag({ markets: 'h2h,btts,h2h' }), ['h2h', 'btts']);
    assert.equal(optionalRunValidationMode({ validate: true }), 'force');
    assert.equal(optionalRunValidationMode({ validate: 'off' }), false);
    assert.throws(() => optionalMarketsFlag({ markets: 'unsupported' }), /unsupported market/);
  });

  it('requires exactly one validation target', () => {
    assert.deepEqual(requiredValidationTarget({ date: '2026-06-12' }), { date: '2026-06-12' });
    assert.throws(
      () => requiredValidationTarget({ date: '2026-06-12', 'prediction-id': 'prediction-1' }),
      /exactly one/,
    );
  });
});
