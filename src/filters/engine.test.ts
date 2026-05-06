import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgentConfig } from '../config.js';
import { DEFAULT_MARKETS } from '../domain/markets.js';
import type { Fixture } from '../domain/fixtures.js';
import { buildFixtureDiscoveryRequests, evaluateExclusions } from './engine.js';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'fixture-1',
    provider: 'api-football',
    providerFixtureId: '100',
    homeTeamId: 'home-1',
    awayTeamId: 'away-1',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    includedByFilters: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

const config: Pick<AgentConfig, 'apiFootball'> = {
  apiFootball: {
    defaultSeason: 2026,
    defaultSeasonInferred: false,
    timezone: 'America/Guatemala',
    leaguePresetsPath: 'config/league-presets.test.json',
    bookmakerPresetsPath: 'config/bookmaker-presets.test.json',
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

describe('filter engine', () => {
  it('uses league preset seasons when building default league requests', () => {
    const requests = buildFixtureDiscoveryRequests([
      { providerCompetitionId: '135', season: 2025 },
      { providerCompetitionId: '253', season: 2026 },
    ], []);

    assert.deepEqual(requests, [
      { league: 135, season: 2025, reason: 'included-by-default-league' },
      { league: 253, season: 2026, reason: 'included-by-default-league' },
    ]);
  });

  it('keeps scheduled fixtures inside the kickoff window', () => {
    assert.deepEqual(evaluateExclusions(fixture(), config), []);
  });

  it('excludes scheduled fixtures outside the kickoff window', () => {
    const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    assert.deepEqual(evaluateExclusions(fixture({ scheduledAt }), config), ['excluded-outside-window']);
  });

  it('keeps UTC next-day fixtures when they belong to the configured local date', () => {
    const scheduledAt = '2026-05-03T00:00:00.000Z';

    assert.deepEqual(evaluateExclusions(fixture({ scheduledAt }), config, {
      date: '2026-05-02',
      timezone: 'America/Guatemala',
      now: new Date('2026-05-02T05:00:00.000Z'),
    }), []);
  });

  it('excludes fixtures outside the configured local date', () => {
    const scheduledAt = '2026-05-03T07:00:00.000Z';

    assert.deepEqual(evaluateExclusions(fixture({ scheduledAt }), config, {
      date: '2026-05-02',
      timezone: 'America/Guatemala',
      now: new Date('2026-05-02T05:00:00.000Z'),
    }), ['excluded-outside-window']);
  });

  it('excludes live and completed fixtures unless config allows them', () => {
    assert.deepEqual(evaluateExclusions(fixture({ status: 'live' }), config), ['excluded-outside-window']);
    assert.deepEqual(evaluateExclusions(fixture({ status: 'completed' }), config), ['excluded-outside-window']);
  });
});
