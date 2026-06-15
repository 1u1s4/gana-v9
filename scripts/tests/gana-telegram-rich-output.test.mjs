import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCronOutcome,
  durationBetween,
  redactSensitiveText,
  renderCronRichSummary,
} from '../gana-telegram-rich-output.mjs';

describe('gana telegram rich output', () => {
  it('renders telegram-html without markdown tables and escapes values', () => {
    const text = renderCronRichSummary({
      format: 'telegram-html',
      title: 'Gana <Daily>',
      status: 'ok',
      date: '2026-06-16',
      rows: [['Batch', 'daily-1'], ['Risk', '<token>&value']],
      artifacts: [{ label: 'recommendations', path: '.artifacts/gana-v9/runs/daily-1/daily-parlay-recommendations.json' }],
      footer: 'Review <manual>',
    });

    assert.match(text, /^<b>✅ Gana &lt;Daily&gt;<\/b>/);
    assert.match(text, /Risk: <code>&lt;token&gt;&amp;value<\/code>/);
    assert.match(text, /recommendations: <code>\.artifacts\/gana-v9/);
    assert.doesNotMatch(text, /\| Métrica \| Valor \|/);
  });

  it('redacts common token shapes before rendering', () => {
    const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
    const text = renderCronRichSummary({
      format: 'telegram-html',
      title: 'Secrets',
      rows: [['Webhook', `https://example.test/hook?token=${token}`]],
    });

    assert.doesNotMatch(text, new RegExp(token));
    assert.match(text, /token=\[redacted\]/);
    assert.equal(redactSensitiveText(`bot ${token}`), 'bot [redacted-token]');
  });

  it('builds a compact cron outcome with duration', () => {
    const outcome = buildCronOutcome({
      flow: 'daily-e2e',
      status: 'published',
      date: '2026-06-16',
      batchId: 'daily-2026-06-16-full',
      startedAt: '2026-06-15T10:00:00.000Z',
      completedAt: '2026-06-15T10:01:05.000Z',
      command: ['gana', 'daily-e2e'],
      exitStatus: 0,
      artifacts: ['/.artifacts/gana-v9/runs/x/daily-parlay-recommendations.json'],
    });

    assert.equal(durationBetween('2026-06-15T10:00:00.000Z', '2026-06-15T10:01:05.000Z'), '1m 05s');
    assert.equal(outcome.duration, '1m 05s');
    assert.deepEqual(outcome.exit, { status: 0, signal: null });
    assert.deepEqual(outcome.command, ['gana', 'daily-e2e']);
  });
});
