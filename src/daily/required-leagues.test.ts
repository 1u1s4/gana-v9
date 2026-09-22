import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRequiredLeagueRecommendations, type DailyRequiredLeagueDefinition } from './required-leagues.js';

function build(predictions: any[], fixtures = ['a', 'b'], steps: any[] = [], options: {
  fixtureOverrides?: Record<string, Record<string, unknown>>;
  requiredLeagues?: DailyRequiredLeagueDefinition[];
} = {}) {
  const displayed = fixtures.map((id) => ({
    id, providerFixtureId: id, leagueId: '39', competitionId: '39', competitionName: 'Premier League', season: 2026,
    homeTeamName: `Home ${id}`, awayTeamName: `Away ${id}`, scheduledAt: '2026-09-23T18:00:00.000Z',
    ...options.fixtureOverrides?.[id],
  }));
  return buildRequiredLeagueRecommendations({
    dailyBatchId: 'test-daily', date: '2026-09-23', generatedAt: '2026-09-23T04:00:00.000Z',
    providers: ['codex'], resolveModel: () => 'gpt-6-astra',
    requiredLeagues: options.requiredLeagues ?? [{ providerCompetitionId: '39', name: 'Premier League', season: 2026 }],
    providerPipelineResults: { codex: {
      ok: true, runId: 'run', fixtures: displayed, steps,
      scoring: fixtures.map((fixtureId) => ({ runId: 'run', fixtureId, providerFixtureId: fixtureId,
        predictions: predictions.filter((prediction) => prediction.fixtureId === fixtureId),
        gateResult: { verdict: 'promotable', reasons: [], warnings: [] },
      })),
    } as any },
  });
}
const prediction = (fixtureId: string, overrides: any = {}) => ({
  id: `p-${fixtureId}`, fixtureId, providerFixtureId: fixtureId, runId: 'run', market: 'double_chance', selection: 'home_or_draw',
  odds: 1.1, confidence: 0.96, modelProbability: 0.97, probability: 0.97, impliedProbability: 1 / 1.1,
  edge: 0.05, status: 'promotable', parlayEligible: true, warnings: [], blockers: [], ...overrides,
});

describe('required league projection integrity', () => {
  it('does not count Algerian Ligue 1 fixtures as uncovered French Ligue 1 fixtures', () => {
    const result = build([prediction('france')], ['france', '1611380', '1611385'], [], {
      requiredLeagues: [{ providerCompetitionId: '61', name: 'Ligue 1', country: 'France', season: 2026 }],
      fixtureOverrides: {
        france: { leagueId: 61, competitionName: 'Ligue 1', competitionId: 'local-france-id' },
        '1611380': { leagueId: 186, competitionName: 'Ligue 1', competitionId: '896e644c-aeff-4eb8-a14c-05f6c00503d1' },
        '1611385': { leagueId: 186, competitionName: 'Ligue 1', competitionId: '896e644c-aeff-4eb8-a14c-05f6c00503d1' },
      },
    });
    assert.deepEqual(result.coverage.fixtures.map((fixture) => fixture.fixtureId), ['france']);
    assert.equal(result.coverage.missingPredictionFixtures, 0);
    assert.equal(result.coverage.status, 'complete');
    assert.equal(result.coverage.fixtures[0].league.country, 'France');
  });
  it('matches the provider ID independently of its label while retaining the season constraint', () => {
    const result = build([prediction('a'), prediction('b')], ['a', 'b'], [], {
      requiredLeagues: [{ providerCompetitionId: '61', name: 'Ligue 1', season: 2026 }],
      fixtureOverrides: {
        a: { leagueId: 61, competitionName: 'Ligue 1 McDonalds', competitionId: '186' },
        b: { leagueId: 61, competitionName: 'Ligue 1', season: 2025 },
      },
    });
    assert.deepEqual(result.coverage.fixtures.map((fixture) => fixture.fixtureId), ['a']);
  });
  it('uses a numeric legacy competition ID before names and allows names only without a provider ID', () => {
    const result = build(['legacy-france', 'legacy-algeria', 'name-only'].map((id) => prediction(id)),
      ['legacy-france', 'legacy-algeria', 'name-only'], [], {
        requiredLeagues: [{ providerCompetitionId: '61', name: 'Ligue 1', season: 2026 }],
        fixtureOverrides: {
          'legacy-france': { leagueId: undefined, competitionId: '61', competitionName: 'Different label' },
          'legacy-algeria': { leagueId: undefined, competitionId: '186', competitionName: 'Ligue 1' },
          'name-only': { leagueId: undefined, competitionId: 'local-uuid', competitionName: ' ligue 1 ' },
        },
      });
    assert.deepEqual(result.coverage.fixtures.map((fixture) => fixture.fixtureId), ['legacy-france', 'name-only']);
  });
  it('uses model probability for EV independently of evidence confidence', () => {
    const result = build(['a', 'b'].map((id) => prediction(id, { odds: 1.4, confidence: 0.95, probability: 0.72, modelProbability: 0.99 })));
    const selected = result.parlayProjections.filter((pick) => pick.status === 'selected');
    assert.ok(selected.length > 0);
    assert.equal(selected[0].aggregateConfidence, 0.9025);
    assert.equal(selected[0].adjustedProbability, 0.5184);
    assert.equal(selected[0].expectedEdge, 0.016064);
    assert.equal(result.atomicProjections[0].expectedEdge, 0.008);
    assert.equal(selected[0].legs.every((leg) => leg.probability === 0.72), true);
  });
  it('does not replace missing model probabilities with high evidence confidence', () => {
    const result = build(['a', 'b'].map((id) => prediction(id, { probability: undefined, modelProbability: undefined, confidence: 0.99 })));
    assert.equal(result.coverage.status, 'complete');
    assert.deepEqual(result.atomicProjections, []);
    assert.equal(result.parlayProjections.every((pick) => pick.status === 'blocked'), true);
  });
  it('keeps failed fixture discovery explicit instead of claiming that no games are scheduled', () => {
    const result = build([], [], [{ name: 'fetch fixtures', ok: false, verdict: 'blocked' }]);
    assert.equal(result.coverage.status, 'review-required');
    assert.equal(result.goalCheck.status, 'review-required');
    assert.match(result.goalCheck.checks[0].reasons.join(' '), /schedule is unknown/);
  });
  it('records that blocked fixtures were analyzed without forcing publication or implied-confidence override', () => {
    const result = build(['a', 'b'].map((id) => prediction(id, { status: 'blocked', confidence: 0.55, edge: -0.02, blockers: ['no-edge'] })));
    assert.equal(result.coverage.status, 'complete');
    assert.equal(result.goalCheck.status, 'passed');
    assert.equal(result.coverage.fixtures[0].blockedCount, 1);
    assert.equal(result.atomicProjections.length, 0);
    assert.equal(result.parlayProjections.every((pick) => pick.status === 'blocked'), true);
  });
  it('publishes actual evidence confidence and keeps parlay-ineligible atomics out of combined picks', () => {
    const result = build(['a', 'b'].map((id) => prediction(id, { confidence: 0.72, modelProbability: 0.97, parlayEligible: false })));
    assert.equal(result.atomicProjections.length, 2);
    assert.equal(result.atomicProjections.every((pick) => pick.confidence === 0.72 && !pick.safetyOverride), true);
    assert.equal(result.parlayProjections.every((pick) => pick.status === 'blocked'), true);
  });
  it('deduplicates compositions across six labels and respects diamante bounds', () => {
    const result = build(['a', 'b'].map((id) => prediction(id)));
    const selected = result.parlayProjections.filter((pick) => pick.status === 'selected');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].combinedOdds, 1.21);
    assert.equal(selected[0].aggregateConfidence, 0.9216);
    assert.equal(selected[0].legs.every((leg) => leg.confidence === 0.96), true);
    const outOfWindow = build(['a', 'b'].map((id) => prediction(id, { market: 'h2h', selection: 'home', odds: 1.6, confidence: 0.8 })));
    assert.equal(outOfWindow.parlayProjections.find((pick) => pick.profile === 'parlay-diamante')?.status, 'blocked');
  });
  it('retains a genuine coverage failure when a scheduled fixture was never scored', () => {
    const result = build([prediction('a')]);
    assert.equal(result.coverage.missingPredictionFixtures, 1);
    assert.equal(result.goalCheck.status, 'review-required');
  });
});
