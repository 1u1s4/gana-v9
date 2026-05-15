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
    assert.match(html, /data-quick-tab="metrics"/);
    assert.match(html, /data-quick-tab="daily"/);
    assert.match(html, /data-quick-view="top-edge"/);
    assert.match(html, /id="exploration-strip"/);
  });

  it('renders entity-detail affordances for warnings, outcome and scoped exploration', () => {
    const html = dashboardHtml();

    assert.match(html, /function renderEntityActions/);
    assert.match(html, /function renderWarningsCard/);
    assert.match(html, /function renderOutcomeCard/);
    assert.match(html, /data-scope-filter="run"/);
    assert.match(html, /data-open-validations-target/);
    assert.match(html, /targetId/);
    assert.match(html, /Historial de validación/);
  });

  it('renders daily metrics tab and chart helpers', () => {
    const html = dashboardHtml();

    assert.match(html, /data-tab="metrics"/);
    assert.match(html, /function renderMetricRows/);
    assert.match(html, /function renderMetricCharts/);
    assert.match(html, /function renderBarChart/);
    assert.match(html, /Parlay perfil/);
    assert.match(html, /Pred\. mercado/);
  });

  it('renders daily overview and recommendation card helpers', () => {
    const html = dashboardHtml();

    assert.match(html, /data-tab="daily"/);
    assert.match(html, /function renderDailyRows/);
    assert.match(html, /recommendation-card/);
    assert.match(html, /Artifact analítico\. No ejecuta apuestas/);
  });

  it('does not schedule automatic overview refreshes', () => {
    const html = dashboardHtml();

    assert.doesNotMatch(html, /setInterval/);
    assert.doesNotMatch(html, /30000/);
  });
});
