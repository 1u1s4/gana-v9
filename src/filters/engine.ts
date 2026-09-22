import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { listApiFootballFixtures } from '../providers/sports/api-football.js';
import { isApiFootballProviderError } from '../providers/sports/api-football-errors.js';
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
  discoveredRequiredFixtures?: Fixture[];
  requiredLeagueCoverage?: Array<{
    providerCompetitionId: string;
    season?: number | null;
    fixtureCount: number;
    eligibleFixtureCount: number;
    source: 'provider-date-fixtures';
  }>;
}

export interface FixtureDiscoveryDeps {
  listFixtures?: typeof listApiFootballFixtures;
}

interface FixtureDiscoveryRequest {
  league?: number;
  team?: number;
  season?: number;
  reason: FilterReason;
}

const FIXTURE_DISCOVERY_CONCURRENCY = 6;
const DATE_ONLY_DISCOVERY_MAX_FIXTURES = Number.MAX_SAFE_INTEGER;

export async function discoverFixtures(
  config: AgentConfig,
  query: FixtureFilterQuery,
  runtime?: RuntimeContext,
  deps: FixtureDiscoveryDeps = {},
): Promise<FixtureDiscoveryResult> {
  const filters = resolveFilterConfig(config, query);
  const listFixtures = deps.listFixtures ?? listApiFootballFixtures;
  const leaguePresets = filters.useDefaultLeagues ? sortLeaguePresetsForDiscovery(await listLeaguePresets(config)) : [];
  const requiredLeagues = query.requiredLeagues ?? [];
  for (const league of requiredLeagues) {
    if (!/^\d+$/.test(league.providerCompetitionId) || !Number.isSafeInteger(Number(league.providerCompetitionId)) || Number(league.providerCompetitionId) <= 0
      || (league.season !== null && league.season !== undefined && (!Number.isInteger(league.season) || league.season < 1900))) {
      throw new Error('Required fixture discovery leagues need positive provider IDs and valid seasons.');
    }
  }
  const requiredPriorities = new Map(requiredLeagues.map((league, index) => [league.providerCompetitionId, index]));
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
  let dateOnlyLeagueDiscoverySucceeded = false;
  if (
    requiredLeagues.length > 0 || (filters.fullDay
    && filters.combineMode === 'OR'
    && leaguePresets.length > 0
    && teamPresets.length === 0)
  ) {
    try {
      const presetLeagueIds = new Set(leaguePresets.map((league) => league.providerCompetitionId));
      const dateFixtures = await listFixtures(config, {
        date: filters.date,
        timezone: filters.timezone,
        // This query contains every league for the day. Apply the configured
        // selection cap only after combining presets with required leagues.
        maxFixtures: DATE_ONLY_DISCOVERY_MAX_FIXTURES,
      }, runtime);
      for (const fixture of dateFixtures) {
        const entry = byProviderFixtureId.get(fixture.providerFixtureId) ?? { fixture, reasons: new Set<FilterReason>() };
        if (fixture.leagueId !== undefined && presetLeagueIds.has(String(fixture.leagueId))) {
          entry.reasons.add('included-by-default-league');
        }
        if (requiredLeagues.some((league) => matchesRequiredLeague(fixture, league))) {
          entry.reasons.add('included-by-required-league');
        }
        const teamIds = [fixture.providerHomeTeamId ?? fixture.homeTeamId, fixture.providerAwayTeamId ?? fixture.awayTeamId];
        if (teamPresets.some((team) => teamIds.includes(team.providerTeamId))) {
          entry.reasons.add('included-by-default-team');
        }
        if (!entry.reasons.size) continue;
        byProviderFixtureId.set(fixture.providerFixtureId, entry);
      }
      dateOnlyLeagueDiscoverySucceeded = true;
    } catch (err) {
      // A failed global query cannot prove that a required league has no games.
      // Avoid a league-by-league fanout that would exhaust the run budget.
      if (requiredLeagues.length) throw err;
      if (!isRecoverableSeasonAccessDiscoveryError(err)) throw err;
    }
  }

  if (!dateOnlyLeagueDiscoverySucceeded) {
    const recoverablePresetErrors: unknown[] = [];
    for (const batch of chunks(validRequests, FIXTURE_DISCOVERY_CONCURRENCY)) {
      const results = await Promise.all(batch.map(async (request) => ({
        request,
        fixtures: await listFixturesForDiscovery(listFixtures, config, filters, request, runtime, recoverablePresetErrors),
      })));
      for (const result of results) {
        for (const fixture of result.fixtures) {
          const entry = byProviderFixtureId.get(fixture.providerFixtureId) ?? { fixture, reasons: new Set<FilterReason>() };
          entry.reasons.add(result.request.reason);
          byProviderFixtureId.set(fixture.providerFixtureId, entry);
        }
      }
      if (!byProviderFixtureId.size && recoverablePresetErrors.length) break;
    }
    if (!byProviderFixtureId.size && recoverablePresetErrors.length && validRequests.some((request) => request.reason !== 'included-by-manual-query')) {
      const fallbackFixtures = await listFixtures(config, {
        date: filters.date,
        timezone: filters.timezone,
        maxFixtures: filters.maxFixturesPerRun,
      }, runtime);
      for (const fixture of fallbackFixtures) {
        const entry = byProviderFixtureId.get(fixture.providerFixtureId) ?? { fixture, reasons: new Set<FilterReason>() };
        entry.reasons.add('included-by-manual-query');
        byProviderFixtureId.set(fixture.providerFixtureId, entry);
      }
    }
  }

  const evaluations: FixtureFilterEvaluation[] = [];
  const fixtures: Fixture[] = [];
  const discoveredRequiredFixtures: Fixture[] = [];
  for (const { fixture, reasons } of sortFixtureEntriesForSelection([...byProviderFixtureId.values()], leaguePriorities, requiredPriorities)) {
    const includedReasons = [...reasons];
    if (
      filters.combineMode === 'AND'
      && filters.useDefaultLeagues
      && filters.useDefaultTeams
      && !reasons.has('included-by-required-league')
      && (!reasons.has('included-by-default-league') || !reasons.has('included-by-default-team'))
    ) {
      continue;
    }

    const excludedReasons = evaluateExclusions(fixture, config, {
      date: filters.date,
      timezone: filters.timezone,
      fullDay: filters.fullDay,
    });
    if (!excludedReasons.length && reasons.has('included-by-required-league')) discoveredRequiredFixtures.push(fixture);
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
    ...(requiredLeagues.length ? { discoveredRequiredFixtures } : {}),
    requestedLeagues: [...new Map<string, RequestedLeaguePresetView>([
      ...leaguePresets.map((league): RequestedLeaguePresetView => ({
        providerCompetitionId: league.providerCompetitionId,
        name: league.name,
        country: league.country,
        season: league.season,
        priority: league.priority,
      })),
      ...requiredLeagues.map((league): RequestedLeaguePresetView => ({
        providerCompetitionId: league.providerCompetitionId,
        name: league.name ?? undefined,
        season: league.season,
      })),
    ].map((league) => [`${league.providerCompetitionId}:${league.season ?? ''}`, league])).values()],
    requestedTeams: teamPresets.map((team) => ({
      providerTeamId: team.providerTeamId,
      name: team.name,
      country: team.country,
      providerLeagueId: team.providerLeagueId,
    })),
    ...(requiredLeagues.length ? { requiredLeagueCoverage: requiredLeagues.map((league) => ({
      providerCompetitionId: league.providerCompetitionId,
      season: league.season,
      fixtureCount: [...byProviderFixtureId.values()].filter(({ fixture }) => matchesRequiredLeague(fixture, league)).length,
      eligibleFixtureCount: fixtures.filter((fixture) => matchesRequiredLeague(fixture, league)).length,
      source: 'provider-date-fixtures' as const,
    })) } : {}),
  };
}

async function listFixturesForDiscovery(
  listFixtures: typeof listApiFootballFixtures,
  config: AgentConfig,
  filters: ReturnType<typeof resolveFilterConfig>,
  request: FixtureDiscoveryRequest,
  runtime: RuntimeContext | undefined,
  recoverablePresetErrors: unknown[],
): Promise<Fixture[]> {
  try {
    return await listFixtures(config, {
      date: filters.date,
      timezone: filters.timezone,
      ...(request.season !== undefined ? { season: request.season } : {}),
      league: request.league,
      team: request.team,
      maxFixtures: filters.maxFixturesPerRun,
    }, runtime);
  } catch (err) {
    if (!isRecoverableSeasonAccessDiscoveryError(err)) throw err;
    recoverablePresetErrors.push(err);
    return [];
  }
}

export function isRecoverableSeasonAccessDiscoveryError(error: unknown): boolean {
  if (!isApiFootballProviderError(error) || error.endpointName !== 'fixtures') return false;
  if (error.code === 'quota_exceeded' || error.code === 'rate_limited') return false;
  const text = [
    error.message,
    typeof error.received === 'string' ? error.received : JSON.stringify(error.received),
  ].filter(Boolean).join(' ');
  return /free plans? do not have access to this season/i.test(text)
    || /do not have access to this season/i.test(text)
    || /try from 20\d{2} to 20\d{2}/i.test(text);
}

function sortLeaguePresetsForDiscovery<T extends { providerCompetitionId: string; name?: string | null; priority?: number | null }>(presets: T[]): T[] {
  const priorities = leaguePriorityMap(presets);
  return [...presets].sort((a, b) => {
    const priority = leaguePriority(Number(a.providerCompetitionId), priorities) - leaguePriority(Number(b.providerCompetitionId), priorities);
    if (priority !== 0) return priority;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

function matchesRequiredLeague(fixture: Fixture, league: { providerCompetitionId: string; season?: number | null }): boolean {
  return String(fixture.leagueId ?? '') === league.providerCompetitionId
    && (league.season === null || league.season === undefined || fixture.season === league.season);
}

function sortFixtureEntriesForSelection<T extends { fixture: Fixture; reasons: Set<FilterReason> }>(entries: T[], priorities: Map<string, number>, requiredPriorities: Map<string, number>): T[] {
  const requiredRank = (entry: T) => entry.reasons.has('included-by-required-league')
    ? requiredPriorities.get(String(entry.fixture.leagueId)) ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER;
  return [...entries].sort((a, b) => {
    const required = requiredRank(a) - requiredRank(b);
    if (required !== 0) return required;
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
      ...(league.season !== null && league.season !== undefined ? { season: league.season } : {}),
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
  options: { date?: string; timezone?: string; now?: Date; fullDay?: boolean; requireFutureKickoff?: boolean } = {},
): FilterReason[] {
  const reasons: FilterReason[] = [];
  if (fixture.status === 'cancelled' || fixture.status === 'unknown') {
    reasons.push('excluded-outside-window');
  }
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
    } else if (options.requireFutureKickoff && !(Date.parse(fixture.scheduledAt) > (options.now ?? new Date()).getTime())) {
      reasons.push('excluded-outside-window');
    } else if (!options.fullDay && !withinKickoffWindow(fixture.scheduledAt, config.apiFootball.kickoffWindowHours, options.now)) {
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
