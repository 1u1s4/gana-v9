import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AgentConfig } from '../config.js';
import { evaluateEgress } from '../permissions/egress-policy.js';
import type { RuntimeContext } from '../runtime/context.js';
import type { DailyRequiredLeagueInput } from './required-leagues.js';

const WEEK_MS = 7 * 86_400_000;
// Top divisions, major international competitions and domestic cups. Names come
// from the provider, rather than guessing season-specific IDs or league years.
const IMPORTANT_NAMES: Record<string, readonly string[]> = {
  World: ['World Cup', 'Euro Championship', 'UEFA Champions League', 'UEFA Champions League Women', 'UEFA Europa League', 'UEFA Europa Conference League', 'UEFA Conference League', 'UEFA Nations League', 'CONMEBOL Libertadores', 'CONMEBOL Sudamericana', 'Copa America', 'CONCACAF Champions League', 'CONCACAF Champions Cup', 'CONCACAF Nations League', 'CONCACAF Gold Cup', 'FIFA Club World Cup', 'Africa Cup of Nations', 'Asian Cup'],
  England: ['Premier League', 'FA Cup', 'League Cup', "Women's Super League"],
  Spain: ['La Liga', 'Copa del Rey', 'Primera División Femenina'],
  Germany: ['Bundesliga', 'DFB Pokal', 'Frauen Bundesliga'],
  France: ['Ligue 1', 'Coupe de France', 'Feminine Division 1'],
  Italy: ['Serie A', 'Coppa Italia', 'Serie A Women'],
  Portugal: ['Primeira Liga', 'Taça de Portugal'],
  Netherlands: ['Eredivisie', 'KNVB Beker'],
  Belgium: ['Jupiler Pro League'], Scotland: ['Premiership'], Turkey: ['Süper Lig'],
  Brazil: ['Serie A', 'Copa Do Brasil', 'Brasileiro Women'],
  Argentina: ['Liga Profesional Argentina', 'Copa Argentina'],
  Mexico: ['Liga MX', 'Liga MX Femenil'], USA: ['Major League Soccer', 'NWSL Women'],
  Guatemala: ['Liga Nacional'], Ecuador: ['Liga Pro'], Colombia: ['Primera A'],
  Chile: ['Primera División'], Uruguay: ['Primera División - Apertura', 'Primera División - Clausura', 'Primera División'],
  Japan: ['J1 League', 'J1 League - Transitional'], 'South-Korea': ['K League 1'],
  Australia: ['A-League'], Norway: ['Eliteserien'], Sweden: ['Allsvenskan'],
  Denmark: ['Superliga'], Switzerland: ['Super League'], 'Saudi-Arabia': ['Pro League'],
};

export interface DiscoveredLeague extends DailyRequiredLeagueInput {
  name: string;
  country: string;
  season: number;
  seasonStart: string;
  seasonEnd: string;
  oddsAvailable: boolean;
  logoUrl?: string;
  flagUrl?: string;
}

export interface WeeklyLeagueDiscovery {
  version: 'weekly-leagues-v1';
  generatedAt: string;
  expiresAt: string;
  status: 'refreshed' | 'cached' | 'stale-cache';
  source: 'api-football/leagues?current=true';
  leagues: DiscoveredLeague[];
  warnings: string[];
}

export function selectImportantActiveLeagues(payload: unknown, date: string): DiscoveredLeague[] {
  const rows = record(payload).response;
  if (!Array.isArray(rows)) throw new Error('League discovery: invalid provider response.');
  const through = new Date(`${date}T12:00:00Z`);
  through.setUTCDate(through.getUTCDate() + 7);
  const horizon = through.toISOString().slice(0, 10);
  const selected = new Map<string, DiscoveredLeague>();
  for (const row of rows) {
    const item = record(row);
    const league = record(item.league);
    const country = record(item.country);
    const name = String(league.name ?? '');
    const nation = String(country.name ?? '');
    const priorityName = IMPORTANT_NAMES[nation]?.some((value) => normalizeName(value) === normalizeName(name));
    const seniorQualifier = nation === 'World' && /^World Cup - Qualification (Africa|Asia|CONCACAF|Europe|Oceania|South America)$/i.test(name);
    if (!priorityName && !seniorQualifier) continue;
    if (!Number.isSafeInteger(league.id) || Number(league.id) <= 0) continue;
    const seasons = Array.isArray(item.seasons) ? item.seasons : [];
    for (const raw of seasons) {
      const season = record(raw);
      // current=true alone is insufficient: API keeps an ended season current
      // until a replacement exists. Use the season's actual dates as well.
      if (season.current !== true || !Number.isInteger(season.year)
        || !isDate(season.start) || !isDate(season.end)
        || season.end < date || season.start > horizon) continue;
      const value: DiscoveredLeague = {
        providerCompetitionId: String(league.id), name, country: nation,
        season: Number(season.year), seasonStart: season.start, seasonEnd: season.end,
        oddsAvailable: record(season.coverage).odds === true,
        ...(safeUrl(league.logo) ? { logoUrl: safeUrl(league.logo) } : {}),
        ...(safeUrl(country.flag) ? { flagUrl: safeUrl(country.flag) } : {}),
      };
      selected.set(`${value.providerCompetitionId}:${value.season}`, value);
    }
  }
  return [...selected.values()].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
}

export async function refreshWeeklyLeagues(config: AgentConfig, date: string, options: {
  now?: Date; fetchImpl?: typeof fetch; runtime?: RuntimeContext; force?: boolean;
} = {}): Promise<WeeklyLeagueDiscovery> {
  if (!isDate(date)) throw new Error('League discovery requires an ISO date.');
  const now = options.now ?? new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (date < today) throw new Error('Automatic league discovery is current-only; historical runs require an explicit --required-leagues list with historical seasons.');
  const path = resolve(config.artifactRoot, 'weekly-leagues.json');
  const previous = readRegistry(path);
  if (!options.force && previous && Date.parse(previous.generatedAt) <= now.getTime()
    && Date.parse(previous.expiresAt) > now.getTime()) return forDate({ ...previous, status: 'cached' }, date);
  try {
    if (!config.apiFootballKey) throw new Error('API-Football credentials unavailable.');
    const url = new URL('/leagues', config.apiFootballBaseUrl);
    url.searchParams.set('current', 'true');
    if (url.protocol !== 'https:' || !evaluateEgress({ url, config }).allowed) throw new Error('League discovery egress blocked.');
    const runtime = options.runtime;
    if (runtime) {
      if ((runtime.providerRequestCount ?? 0) >= (runtime.providerRequestLimit ?? config.apiFootball.maxProviderRequestsPerRun)) {
        throw new Error('League discovery provider request budget exhausted.');
      }
      runtime.providerRequestCount = (runtime.providerRequestCount ?? 0) + 1;
    }
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { 'x-apisports-key': config.apiFootballKey }, signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`League discovery HTTP ${response.status}.`);
    const payload = await response.json() as Record<string, unknown>;
    if (Object.keys(record(payload.errors)).length || (Array.isArray(payload.errors) && payload.errors.length)) {
      throw new Error('League discovery provider returned errors; previous registry preserved.');
    }
    const leagues = selectImportantActiveLeagues(payload, date);
    if (!leagues.length) throw new Error('League discovery returned no eligible active competitions.');
    const next: WeeklyLeagueDiscovery = {
      version: 'weekly-leagues-v1', generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + WEEK_MS).toISOString(),
      status: 'refreshed', source: 'api-football/leagues?current=true', leagues,
      warnings: leagues.filter((league) => !league.oddsAvailable).map((league) => `No declared odds coverage: ${league.name} (${league.country}); consider fixtures, never invent prices.`),
    };
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(temp, path);
    return forDate(next, date);
  } catch (error) {
    if (!previous || now.getTime() - Date.parse(previous.generatedAt) > 2 * WEEK_MS) throw error;
    // Do not persist a failed refresh or extend its expiry. Every following run
    // retries; daily coverage explicitly carries the stale-cache warning.
    return forDate({ ...previous, status: 'stale-cache', warnings: [...previous.warnings, 'Weekly refresh failed; using previous registry (at most 14 days old).'] }, date);
  }
}

function forDate(registry: WeeklyLeagueDiscovery, date: string): WeeklyLeagueDiscovery {
  const horizon = new Date(`${date}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 7);
  return { ...registry, leagues: registry.leagues.filter((league) => league.seasonEnd >= date && league.seasonStart <= horizon.toISOString().slice(0, 10)) };
}
function readRegistry(path: string): WeeklyLeagueDiscovery | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as WeeklyLeagueDiscovery;
    if (value.version !== 'weekly-leagues-v1' || !Number.isFinite(Date.parse(value.generatedAt))
      || !Number.isFinite(Date.parse(value.expiresAt)) || !Array.isArray(value.warnings)
      || !Array.isArray(value.leagues) || !value.leagues.length
      || value.leagues.some((league) => !/^\d+$/.test(league.providerCompetitionId) || !Number.isInteger(league.season) || !isDate(league.seasonStart) || !isDate(league.seasonEnd))) return undefined;
    return value;
  } catch { return undefined; }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isDate(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)); }
function normalizeName(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function safeUrl(value: unknown): string | undefined { try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; } }
