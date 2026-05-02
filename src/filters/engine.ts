import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { listApiFootballFixtures } from '../providers/sports/api-football.js';
import type { RuntimeContext } from '../runtime/context.js';
import type {
  FilterReason,
  FixtureFilterEvaluation,
  FixtureFilterQuery,
  RequestedLeaguePresetView,
  RequestedTeamPresetView,
} from './types.js';
import { resolveFilterConfig } from './config.js';
import { listLeaguePresets, listTeamPresets } from './presets.js';

export interface FixtureDiscoveryResult {
  fixtures: Fixture[];
  evaluations: FixtureFilterEvaluation[];
  requestedLeagues: RequestedLeaguePresetView[];
  requestedTeams: RequestedTeamPresetView[];
}

interface FixtureDiscoveryRequest {
  league?: number;
  team?: number;
  season?: number;
  reason: FilterReason;
}

const FIXTURE_DISCOVERY_CONCURRENCY = 6;

export async function discoverFixtures(
  config: AgentConfig,
  query: FixtureFilterQuery,
  runtime?: RuntimeContext,
): Promise<FixtureDiscoveryResult> {
  const filters = resolveFilterConfig(config, query);
  const leaguePresets = filters.useDefaultLeagues ? await listLeaguePresets(config) : [];
  const teamPresets = filters.useDefaultTeams ? await listTeamPresets(config) : [];
  const requests = buildFixtureDiscoveryRequests(leaguePresets, teamPresets);
  const validRequests = requests.filter((request) => {
    return (request.league === undefined || Number.isFinite(request.league))
      && (request.team === undefined || Number.isFinite(request.team))
      && (request.season === undefined || Number.isFinite(request.season));
  });
  if (!validRequests.length) {
    validRequests.push({ reason: 'included-by-manual-query' });
  }

  const byProviderFixtureId = new Map<string, { fixture: Fixture; reasons: Set<FilterReason> }>();
  for (const batch of chunks(validRequests, FIXTURE_DISCOVERY_CONCURRENCY)) {
    const results = await Promise.all(batch.map(async (request) => ({
      request,
      fixtures: await listApiFootballFixtures(config, {
        date: filters.date,
        season: request.season ?? config.apiFootball.defaultSeason,
        league: request.league,
        team: request.team,
        maxFixtures: filters.maxFixturesPerRun,
      }, runtime),
    })));
    for (const result of results) {
      for (const fixture of result.fixtures) {
        const entry = byProviderFixtureId.get(fixture.providerFixtureId) ?? { fixture, reasons: new Set<FilterReason>() };
        entry.reasons.add(result.request.reason);
        byProviderFixtureId.set(fixture.providerFixtureId, entry);
      }
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
    requestedLeagues: leaguePresets.map((league) => ({
      providerCompetitionId: league.providerCompetitionId,
      name: league.name,
      country: league.country,
      season: league.season,
    })),
    requestedTeams: teamPresets.map((team) => ({
      providerTeamId: team.providerTeamId,
      name: team.name,
      country: team.country,
      providerLeagueId: team.providerLeagueId,
    })),
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

export function buildFixtureDiscoveryRequests(
  leaguePresets: Array<{ providerCompetitionId: string; season?: number | null }>,
  teamPresets: Array<{ providerTeamId: string }>,
): FixtureDiscoveryRequest[] {
  const requests: FixtureDiscoveryRequest[] = [];
  for (const league of leaguePresets) {
    requests.push({
      league: Number(league.providerCompetitionId),
      season: league.season ?? undefined,
      reason: 'included-by-default-league',
    });
  }
  for (const team of teamPresets) {
    requests.push({
      team: Number(team.providerTeamId),
      reason: 'included-by-default-team',
    });
  }
  return requests;
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
