import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { listApiFootballFixtures } from '../providers/sports/api-football.js';
import type { RuntimeContext } from '../runtime/context.js';
import type { FilterReason, FixtureFilterEvaluation, FixtureFilterQuery } from './types.js';
import { resolveFilterConfig } from './config.js';
import { listLeaguePresets, listTeamPresets } from './presets.js';

export interface FixtureDiscoveryResult {
  fixtures: Fixture[];
  evaluations: FixtureFilterEvaluation[];
}

export async function discoverFixtures(
  config: AgentConfig,
  query: FixtureFilterQuery,
  runtime?: RuntimeContext,
): Promise<FixtureDiscoveryResult> {
  const filters = resolveFilterConfig(config, query);
  const leaguePresets = filters.useDefaultLeagues ? await listLeaguePresets(config) : [];
  const teamPresets = filters.useDefaultTeams ? await listTeamPresets(config) : [];
  const requests: Array<{ league?: number; team?: number; reason: FilterReason }> = [];

  for (const league of leaguePresets) {
    requests.push({
      league: Number(league.providerCompetitionId),
      reason: 'included-by-default-league',
    });
  }
  for (const team of teamPresets) {
    requests.push({
      team: Number(team.providerTeamId),
      reason: 'included-by-default-team',
    });
  }
  if (!requests.length) {
    requests.push({ reason: 'included-by-manual-query' });
  }

  const byProviderFixtureId = new Map<string, { fixture: Fixture; reasons: Set<FilterReason> }>();
  for (const request of requests) {
    if ((request.league !== undefined && !Number.isFinite(request.league)) || (request.team !== undefined && !Number.isFinite(request.team))) {
      continue;
    }
    const fixtures = await listApiFootballFixtures(config, {
      date: filters.date,
      season: config.apiFootball.defaultSeason,
      league: request.league,
      team: request.team,
      maxFixtures: filters.maxFixturesPerRun,
    }, runtime);
    for (const fixture of fixtures) {
      const entry = byProviderFixtureId.get(fixture.providerFixtureId) ?? { fixture, reasons: new Set<FilterReason>() };
      entry.reasons.add(request.reason);
      byProviderFixtureId.set(fixture.providerFixtureId, entry);
    }
  }

  const evaluations: FixtureFilterEvaluation[] = [];
  const fixtures: Fixture[] = [];
  for (const { fixture, reasons } of byProviderFixtureId.values()) {
    const includedReasons = [...reasons];
    if (
      filters.combineMode === 'AND'
      && filters.useDefaultLeagues
      && filters.useDefaultTeams
      && (!reasons.has('included-by-default-league') || !reasons.has('included-by-default-team'))
    ) {
      continue;
    }

    const excludedReasons = evaluateExclusions(fixture, config);
    const maxReached = excludedReasons.length === 0 && fixtures.length >= filters.maxFixturesPerRun;
    const eligible = excludedReasons.length === 0 && !maxReached;
    const finalExcludedReasons = maxReached
      ? [...new Set([...excludedReasons, 'excluded-max-fixtures-reached' as const])]
      : excludedReasons;
    evaluations.push({
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      includedReasons,
      excludedReasons: finalExcludedReasons,
      eligible,
    });
    if (eligible) fixtures.push(fixture);
  }

  return {
    fixtures,
    evaluations,
  };
}

export function evaluateExclusions(fixture: Fixture, config: Pick<AgentConfig, 'apiFootball'>): FilterReason[] {
  const reasons: FilterReason[] = [];
  if (fixture.status === 'completed' && !config.apiFootball.includeCompletedFixtures) {
    reasons.push('excluded-outside-window');
  }
  if (fixture.status === 'live' && !config.apiFootball.includeLiveFixtures) {
    reasons.push('excluded-outside-window');
  }
  if (fixture.status === 'scheduled' && !withinKickoffWindow(fixture.scheduledAt, config.apiFootball.kickoffWindowHours)) {
    reasons.push('excluded-outside-window');
  }
  return reasons;
}

function withinKickoffWindow(scheduledAt: string, hours: number): boolean {
  const kickoff = new Date(scheduledAt).getTime();
  if (!Number.isFinite(kickoff)) return false;
  const now = Date.now();
  return kickoff >= now && kickoff <= now + hours * 60 * 60 * 1000;
}
