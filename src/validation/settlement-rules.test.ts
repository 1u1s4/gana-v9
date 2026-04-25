import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fixture } from '../domain/fixtures.js';
import type { MarketSelection } from '../domain/markets.js';
import {
  SETTLEMENT_RULE_VERSION,
  settleMarket,
  validateMarketSelection,
  validateOddsQuote,
} from './settlement-rules.js';

const evaluatedAt = '2026-04-25T00:00:00.000Z';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-1',
    provider: 'api-football',
    providerFixtureId: '1001',
    competitionId: 'competition-1',
    leagueId: 39,
    season: 2026,
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    scheduledAt: '2026-04-25T18:00:00.000Z',
    status: 'completed',
    scoreHome: 2,
    scoreAway: 1,
    includedByFilters: [],
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  };
}

function selection(overrides: Partial<MarketSelection> = {}): MarketSelection {
  return {
    market: 'h2h',
    selection: 'home',
    odds: 2,
    impliedProbability: 0.5,
    sourceSnapshotId: 'snapshot-1',
    ...overrides,
  };
}

describe('settlement rules', () => {
  it('exports settlement-v1', () => {
    assert.equal(SETTLEMENT_RULE_VERSION, 'settlement-v1');
  });

  it('validates selection, line, odds, and implied probability rules', () => {
    assert.deepEqual(validateMarketSelection(selection()), { valid: true, reasons: [] });
    assert.deepEqual(validateMarketSelection(selection({ selection: 'yes' })), {
      valid: false,
      reasons: ['invalid-selection'],
    });
    assert.deepEqual(validateMarketSelection(selection({ market: 'goals_over_under', selection: 'over' })), {
      valid: false,
      reasons: ['line-required'],
    });
    assert.deepEqual(validateMarketSelection(selection({ line: 2.5 })), {
      valid: false,
      reasons: ['line-forbidden'],
    });
    assert.deepEqual(validateMarketSelection(selection({ odds: 1 })), {
      valid: false,
      reasons: ['invalid-odds'],
    });
    assert.deepEqual(validateMarketSelection(selection({ impliedProbability: 0 })), {
      valid: false,
      reasons: ['invalid-implied-probability'],
    });
  });

  it('validates canonical odds quotes through settlement rules', () => {
    assert.deepEqual(validateOddsQuote({
      fixtureId: 'fixture-1',
      market: 'btts',
      selection: 'yes',
      price: 1.8,
      impliedProbability: 0.55,
      capturedAt: evaluatedAt,
      sourceSnapshotId: 'snapshot-1',
    }), { valid: true, reasons: [] });
  });

  it('settles h2h for home, draw, and away results', () => {
    assert.equal(settleMarket({ fixture: fixture({ scoreHome: 3, scoreAway: 1 }), selection: selection({ selection: 'home' }), evaluatedAt }).status, 'won');
    assert.equal(settleMarket({ fixture: fixture({ scoreHome: 1, scoreAway: 1 }), selection: selection({ selection: 'draw' }), evaluatedAt }).status, 'won');
    assert.equal(settleMarket({ fixture: fixture({ scoreHome: 0, scoreAway: 2 }), selection: selection({ selection: 'away' }), evaluatedAt }).status, 'won');
    assert.equal(settleMarket({ fixture: fixture({ scoreHome: 0, scoreAway: 2 }), selection: selection({ selection: 'home' }), evaluatedAt }).status, 'lost');
  });

  it('settles double chance selections', () => {
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 1, scoreAway: 1 }),
      selection: selection({ market: 'double_chance', selection: 'home_or_draw' }),
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 2, scoreAway: 0 }),
      selection: selection({ market: 'double_chance', selection: 'home_or_away' }),
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 0, scoreAway: 1 }),
      selection: selection({ market: 'double_chance', selection: 'draw_or_away' }),
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 2, scoreAway: 0 }),
      selection: selection({ market: 'double_chance', selection: 'draw_or_away' }),
      evaluatedAt,
    }).status, 'lost');
  });

  it('settles goals over-under with win, loss, and push', () => {
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 2, scoreAway: 1 }),
      selection: selection({ market: 'goals_over_under', selection: 'over', line: 2.5 }),
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 1, scoreAway: 0 }),
      selection: selection({ market: 'goals_over_under', selection: 'under', line: 2.5 }),
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 3, scoreAway: 1 }),
      selection: selection({ market: 'goals_over_under', selection: 'under', line: 2.5 }),
      evaluatedAt,
    }).status, 'lost');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 1, scoreAway: 1 }),
      selection: selection({ market: 'goals_over_under', selection: 'over', line: 2 }),
      evaluatedAt,
    }).status, 'push');
  });

  it('settles corners over-under and blocks missing statistics', () => {
    assert.equal(settleMarket({
      fixture: fixture(),
      selection: selection({ market: 'corners_over_under', selection: 'over', line: 8.5 }),
      statistics: { fixtureId: 'fixture-1', cornersHome: 5, cornersAway: 4 },
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture(),
      selection: selection({ market: 'corners_over_under', selection: 'under', line: 9 }),
      statistics: { fixtureId: 'fixture-1', cornersHome: 5, cornersAway: 4 },
      evaluatedAt,
    }).status, 'push');

    const blocked = settleMarket({
      fixture: fixture(),
      selection: selection({ market: 'corners_over_under', selection: 'under', line: 9.5 }),
      evaluatedAt,
    });

    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'corners-statistics-unavailable');
  });

  it('settles btts yes and no', () => {
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 2, scoreAway: 1 }),
      selection: selection({ market: 'btts', selection: 'yes' }),
      evaluatedAt,
    }).status, 'won');
    assert.equal(settleMarket({
      fixture: fixture({ scoreHome: 2, scoreAway: 0 }),
      selection: selection({ market: 'btts', selection: 'no' }),
      evaluatedAt,
    }).status, 'won');
  });

  it('returns pending, voided, blocked status reasons for fixture states', () => {
    assert.deepEqual(settleMarket({
      fixture: fixture({ status: 'scheduled', scoreHome: undefined, scoreAway: undefined }),
      selection: selection(),
      evaluatedAt,
    }), {
      status: 'pending',
      settlementRuleVersion: 'settlement-v1',
      evaluatedAt,
      reason: 'fixture-not-completed',
    });

    assert.deepEqual(settleMarket({
      fixture: fixture({ status: 'cancelled', scoreHome: undefined, scoreAway: undefined }),
      selection: selection(),
      evaluatedAt,
    }), {
      status: 'voided',
      settlementRuleVersion: 'settlement-v1',
      evaluatedAt,
      reason: 'fixture-cancelled',
    });

    assert.deepEqual(settleMarket({
      fixture: fixture({ status: 'unknown', scoreHome: undefined, scoreAway: undefined }),
      selection: selection(),
      evaluatedAt,
    }), {
      status: 'blocked',
      settlementRuleVersion: 'settlement-v1',
      evaluatedAt,
      reason: 'fixture-status-unknown',
    });

    assert.deepEqual(settleMarket({
      fixture: fixture({ scoreHome: undefined, scoreAway: undefined }),
      selection: selection(),
      evaluatedAt,
    }), {
      status: 'blocked',
      settlementRuleVersion: 'settlement-v1',
      evaluatedAt,
      reason: 'final-score-unavailable',
    });
  });
});
