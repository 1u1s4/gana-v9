import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dashboardHtml } from './page.js';

describe('dashboard page UX affordances', () => {
  it('exposes quick date presets and exploration shortcuts', () => {
    const html = dashboardHtml();

    assert.match(html, /data-date-preset="yesterday"/);
    assert.match(html, /id="quick-explore"/);
    assert.match(html, /data-quick-tab="predictions"/);
    assert.match(html, /data-quick-tab="parlays"/);
    assert.match(html, /data-quick-tab="validations"/);
  });

  it('renders entity-detail affordances for warnings, outcome and scoped exploration', () => {
    const html = dashboardHtml();

    assert.match(html, /function renderEntityActions/);
    assert.match(html, /function renderWarningsCard/);
    assert.match(html, /function renderOutcomeCard/);
    assert.match(html, /data-scope-filter="run"/);
    assert.match(html, /data-open-validations-target/);
  });
});
