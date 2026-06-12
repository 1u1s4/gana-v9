import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentConfig } from '../config.js';
import { DEFAULT_MARKETS } from '../domain/markets.js';
import type { Fixture } from '../domain/fixtures.js';
import { ApiFootballProviderError } from '../providers/sports/api-football-errors.js';
import { buildFixtureDiscoveryRequests, discoverFixtures, evaluateExclusions } from './engine.js';

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
    maxProviderRequestsPerRun: 500,
    maxAgenticResearchCallsPerRun: 80,
  },
};

describe('filter engine', () => {
  it('binds default league discovery requests to preset seasons when configured', () => {
    const requests = buildFixtureDiscoveryRequests([
      { providerCompetitionId: '135', season: 2025 },
      { providerCompetitionId: '253', season: null },
    ], []);

    assert.deepEqual(requests, [
      { league: 135, season: 2025, reason: 'included-by-default-league' },
      { league: 253, reason: 'included-by-default-league' },
    ]);
  });

  it('falls back to date-only discovery when default league requests are blocked by provider season access', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gana-fixture-discovery-'));
    const leaguePresetsPath = join(dir, 'league-presets.json');
    writeFileSync(leaguePresetsPath, JSON.stringify({
      presetKey: 'test',
      leagues: [{ id: '253', name: 'Major League Soccer', country: 'USA', enabled: true }],
    }));
    const calls: Array<{ league?: number; team?: number }> = [];
    const fallbackFixture = fixture({
      providerFixtureId: 'fallback-fixture',
      leagueId: 999,
      scheduledAt: '2026-06-07T12:00:00.000Z',
    });

    const result = await discoverFixtures({
      ...config,
      apiFootball: {
        ...config.apiFootball,
        leaguePresetsPath,
      },
    } as AgentConfig, {
      date: '2026-06-07',
      leaguesDefault: true,
      fullDay: true,
    }, undefined, {
      listFixtures: async (_config, query) => {
        calls.push({ league: query.league, team: query.team });
        if (query.league !== undefined) {
          throw new ApiFootballProviderError({
            code: 'provider_unavailable',
            endpointName: 'fixtures',
            expected: 'API-Football response without provider errors.',
            received: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' },
          });
        }
        return [fallbackFixture];
      },
    });

    assert.deepEqual(calls, [{ league: 253, team: undefined }, { league: undefined, team: undefined }]);
    assert.equal(result.fixtures.length, 1);
    assert.equal(result.fixtures[0]?.providerFixtureId, 'fallback-fixture');
    assert.deepEqual(result.evaluations[0]?.includedReasons, ['included-by-manual-query']);
  });

  it('keeps scheduled fixtures inside the kickoff window', () => {
    assert.deepEqual(evaluateExclusions(fixture(), config), []);
  });

  it('excludes scheduled fixtures outside the kickoff window', () => {
    const scheduledAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    assert.deepEqual(evaluateExclusions(fixture({ scheduledAt }), config), ['excluded-outside-window']);
  });

  it('keeps same-date scheduled fixtures outside the kickoff window for full-day scans', () => {
    const scheduledAt = '2026-05-02T23:00:00.000Z';

    assert.deepEqual(evaluateExclusions(fixture({ scheduledAt }), config, {
      date: '2026-05-02',
      timezone: 'America/Guatemala',
      now: new Date('2026-05-01T00:00:00.000Z'),
      fullDay: true,
    }), []);
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
