import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_MARKETS } from '../domain/markets.js';
import { resolveFilterConfig } from './config.js';

const config = {
  apiFootball: {
    defaultSeason: 2026,
    defaultSeasonInferred: false,
    defaultLeagues: [],
    defaultTeams: [],
    defaultMarkets: DEFAULT_MARKETS,
    lowOddsThreshold: 1.2,
    kickoffWindowHours: 36,
    includeLiveFixtures: false,
    includeCompletedFixtures: false,
    maxFixturesPerRun: 80,
  },
};

describe('filter config', () => {
  it('resolves conservative defaults from API-Football config', () => {
    const resolved = resolveFilterConfig(config, { date: '2026-04-26' });

    assert.equal(resolved.threshold, 1.2);
    assert.equal(resolved.kickoffWindowHours, 36);
    assert.equal(resolved.maxFixturesPerRun, 80);
    assert.equal(resolved.combineMode, 'OR');
    assert.deepEqual(resolved.markets, DEFAULT_MARKETS);
  });

  it('honors query overrides for presets, threshold, markets, and combine mode', () => {
    const resolved = resolveFilterConfig(config, {
      date: '2026-04-26',
      leaguesDefault: true,
      teamsDefault: true,
      combineMode: 'AND',
      threshold: 1.15,
      markets: ['h2h'],
    });

    assert.equal(resolved.useDefaultLeagues, true);
    assert.equal(resolved.useDefaultTeams, true);
    assert.equal(resolved.combineMode, 'AND');
    assert.equal(resolved.threshold, 1.15);
    assert.deepEqual(resolved.markets, ['h2h']);
  });
});
