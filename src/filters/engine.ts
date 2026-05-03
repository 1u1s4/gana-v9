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
  const leaguePresets = filters.useDefaultLeagues ? sortLeaguePresetsForDiscovery(await listLeaguePresets(config)) : [];
  const leaguePriorities = leaguePriorityMap(leaguePresets);
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
        timezone: filters.timezone,
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
  for (const { fixture, reasons } of sortFixtureEntriesForSelection([...byProviderFixtureId.values()], leaguePriorities)) {
    const includedReasons = [...reasons];
    if (
      filters.combineMode === 'AND'
      && filters.useDefaultLeagues
      && filters.useDefaultTeams
      && (!reasons.has('included-by-default-league') || !reasons.has('included-by-default-team'))
    ) {
      continue;
    }

    const excludedReasons = evaluateExclusions(fixture, config, {
      date: filters.date,
      timezone: filters.timezone,
    });
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
      priority: league.priority,
    })),
    requestedTeams: teamPresets.map((team) => ({
      providerTeamId: team.providerTeamId,
      name: team.name,
      country: team.country,
      providerLeagueId: team.providerLeagueId,
    })),
  };
}

function sortLeaguePresetsForDiscovery<T extends { providerCompetitionId: string; name?: string | null; priority?: number | null }>(presets: T[]): T[] {
  const priorities = leaguePriorityMap(presets);
  return [...presets].sort((a, b) => {
    const priority = leaguePriority(Number(a.providerCompetitionId), priorities) - leaguePriority(Number(b.providerCompetitionId), priorities);
    if (priority !== 0) return priority;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

function sortFixtureEntriesForSelection<T extends { fixture: Fixture }>(entries: T[], priorities: Map<string, number>): T[] {
  return [...entries].sort((a, b) => {
    const priority = leaguePriority(a.fixture.leagueId, priorities) - leaguePriority(b.fixture.leagueId, priorities);
    if (priority !== 0) return priority;
    return Date.parse(a.fixture.scheduledAt) - Date.parse(b.fixture.scheduledAt);
  });
}

function leaguePriority(leagueId: number | undefined, priorities: Map<string, number>): number {
  if (leagueId === undefined || !Number.isFinite(leagueId)) return Number.MAX_SAFE_INTEGER;
  return priorities.get(String(leagueId)) ?? 10_000;
}

function leaguePriorityMap<T extends { providerCompetitionId: string; priority?: number | null }>(presets: T[]): Map<string, number> {
  return new Map(presets.map((preset, index) => [
    preset.providerCompetitionId,
    preset.priority ?? 10_000 + index,
  ]));
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

export function evaluateExclusions(
  fixture: Fixture,
  config: Pick<AgentConfig, 'apiFootball'>,
  options: { date?: string; timezone?: string; now?: Date } = {},
): FilterReason[] {
  const reasons: FilterReason[] = [];
  if (fixture.status === 'completed' && !config.apiFootball.includeCompletedFixtures) {
    reasons.push('excluded-outside-window');
  }
  if (fixture.status === 'live' && !config.apiFootball.includeLiveFixtures) {
    reasons.push('excluded-outside-window');
  }
  if (fixture.status === 'scheduled') {
    const timezone = options.timezone ?? config.apiFootball.timezone;
    if (options.date && localDateKey(fixture.scheduledAt, timezone) !== options.date) {
      reasons.push('excluded-outside-window');
    } else if (!withinKickoffWindow(fixture.scheduledAt, config.apiFootball.kickoffWindowHours, options.now)) {
      reasons.push('excluded-outside-window');
    }
  }
  return reasons;
}

function withinKickoffWindow(scheduledAt: string, hours: number, nowDate = new Date()): boolean {
  const kickoff = new Date(scheduledAt).getTime();
  if (!Number.isFinite(kickoff)) return false;
  const now = nowDate.getTime();
  return kickoff >= now && kickoff <= now + hours * 60 * 60 * 1000;
}

function localDateKey(scheduledAt: string, timezone: string): string {
  const date = new Date(scheduledAt);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
}
