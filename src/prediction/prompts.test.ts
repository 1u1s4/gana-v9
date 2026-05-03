import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildResearchFixturePrompt, buildScorePredictionPrompt, RESEARCH_FIXTURE_PROMPT_VERSION } from './prompts.js';
import type { Fixture } from '../domain/fixtures.js';

const fixture: Fixture = {
  id: 'fixture-1',
  provider: 'api-football',
  providerFixtureId: '1001',
  homeTeamId: 'home-1',
  awayTeamId: 'away-1',
  scheduledAt: '2026-04-26T18:00:00.000Z',
  status: 'scheduled',
  includedByFilters: ['manual-include'],
  createdAt: '2026-04-25T12:00:00.000Z',
  updatedAt: '2026-04-25T12:00:00.000Z',
};

describe('research prompts', () => {
  it('exports the research fixture prompt version', () => {
    assert.equal(RESEARCH_FIXTURE_PROMPT_VERSION, 'research-fixture-v2');
  });

  it('requires JSON-only structured research with evidence references', () => {
    const prompt = buildResearchFixturePrompt({
      fixture,
      web: 'live',
      runId: 'run-1',
      createdAt: '2026-04-25T12:00:00.000Z',
    });

    assert.match(prompt, /Return only valid JSON starting with "\{"/);
    assert.match(prompt, /sources/);
    assert.match(prompt, /evidenceItems/);
    assert.match(prompt, /claims/);
    assert.match(prompt, /Every EvidenceItem\.sourceId/);
    assert.match(prompt, /Every Claim\.evidenceIds/);
    assert.match(prompt, /include at least one source with type "web-search" in the returned JSON/);
    assert.match(prompt, /research-fixture-v2/);
    assert.match(prompt, /fixtureStatistics/);
    assert.match(prompt, /Use API-Football fixture, statistics, and odds context/);
    assert.match(prompt, /gateResult\.verdict to "promotable"/);
    assert.match(prompt, /gateResult\.verdict to "review-required"/);
    assert.match(prompt, /gateResult\.verdict to "blocked"/);
    assert.match(prompt, /structured research generated with sufficient evidence/);
    assert.match(prompt, /Monetary safety/);
    assert.match(prompt, /analytical artifacts only/);
  });

  it('keeps score prompts analytical-only for monetary safety', () => {
    const prompt = buildScorePredictionPrompt();

    assert.match(prompt, /Monetary safety/);
    assert.match(prompt, /analytical artifacts only/);
  });
});
