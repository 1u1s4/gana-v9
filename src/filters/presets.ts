import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type { AgentConfig } from '../config.js';
import { API_FOOTBALL_PROVIDER } from '../providers/sports/types.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type { JsonValue, LeaguePresetRecord, StoragePrismaClient, TeamPresetRecord } from '../storage/types.js';
import { requireDatabaseUrl } from './config.js';

export interface FileLeaguePresetRecord {
  id: string;
  presetKey: string;
  providerId: string;
  providerCompetitionId: string;
  competitionId: string | null;
  name: string;
  country: string | null;
  season: number | null;
  enabled: boolean;
  priority: number | null;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LeaguePresetFile {
  presetKey?: string;
  leagues?: FileLeaguePresetEntry[];
}

interface FileLeaguePresetEntry {
  id?: unknown;
  providerCompetitionId?: unknown;
  name?: unknown;
  country?: unknown;
  season?: unknown;
  priority?: unknown;
  enabled?: unknown;
}

const DEFAULT_PRESET_KEY = 'default';
const FILE_PROVIDER_ID = 'api-football:file';

export async function listLeaguePresets(config: Pick<AgentConfig, 'apiFootball'>): Promise<FileLeaguePresetRecord[]> {
  return readLeaguePresetRecords(config).filter((preset) => preset.enabled);
}

export async function addLeaguePreset(
  config: Pick<AgentConfig, 'apiFootball'>,
  input: { id: string; name: string; country?: string; season?: number; priority?: number; presetKey?: string },
): Promise<FileLeaguePresetRecord> {
  const file = readLeaguePresetFile(config);
  const presetKey = input.presetKey ?? file.presetKey ?? DEFAULT_PRESET_KEY;
  const leagues = Array.isArray(file.leagues) ? [...file.leagues] : [];
  const existingIndex = leagues.findIndex((preset) => String(preset.id ?? preset.providerCompetitionId) === input.id);
  const nextEntry = {
    id: input.id,
    name: input.name,
    country: input.country,
    season: input.season ?? config.apiFootball.defaultSeason,
    priority: input.priority ?? nextLeaguePriority(leagues),
    enabled: true,
  };

  if (existingIndex >= 0) {
    leagues[existingIndex] = {
      ...leagues[existingIndex],
      ...nextEntry,
      priority: input.priority ?? numericOrNull(leagues[existingIndex].priority) ?? nextEntry.priority,
    };
  } else {
    leagues.push(nextEntry);
  }

  writeLeaguePresetFile(config, { presetKey, leagues: sortFileLeagueEntries(leagues) });
  const updated = readLeaguePresetRecords(config).find((preset) => preset.providerCompetitionId === input.id && preset.presetKey === presetKey);
  if (!updated) throw new Error(`League preset ${input.id} could not be written.`);
  return updated;
}

export async function removeLeaguePreset(
  config: Pick<AgentConfig, 'apiFootball'>,
  providerCompetitionId: string,
): Promise<FileLeaguePresetRecord> {
  const file = readLeaguePresetFile(config);
  const presetKey = file.presetKey ?? DEFAULT_PRESET_KEY;
  const leagues = Array.isArray(file.leagues) ? [...file.leagues] : [];
  const existingIndex = leagues.findIndex((preset) => String(preset.id ?? preset.providerCompetitionId) === providerCompetitionId);
  if (existingIndex < 0 || leagues[existingIndex].enabled === false) {
    throw new Error(`League preset ${providerCompetitionId} was not found.`);
  }

  leagues[existingIndex] = { ...leagues[existingIndex], enabled: false };
  writeLeaguePresetFile(config, { presetKey, leagues: sortFileLeagueEntries(leagues) });
  const removed = readLeaguePresetRecords(config, { includeDisabled: true })
    .find((preset) => preset.providerCompetitionId === providerCompetitionId && preset.presetKey === presetKey);
  if (!removed) throw new Error(`League preset ${providerCompetitionId} could not be removed.`);
  return removed;
}

export async function addLeaguePresetToDatabase(
  config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl' | 'apiFootball'>,
  input: { id: string; name: string; country?: string; season?: number; presetKey?: string },
): Promise<LeaguePresetRecord> {
  const { repositories, providerId } = await presetContext(config);
  const existing = (await repositories.leaguePresets.list({ providerId }))
    .find((preset) => preset.providerCompetitionId === input.id && preset.presetKey === (input.presetKey ?? DEFAULT_PRESET_KEY));
  if (existing) {
    return repositories.leaguePresets.update(existing.id, {
      name: input.name,
      country: input.country,
      season: input.season ?? config.apiFootball.defaultSeason,
      enabled: true,
    });
  }
  return repositories.leaguePresets.create({
    providerId,
    providerCompetitionId: input.id,
    name: input.name,
    country: input.country,
    season: input.season ?? config.apiFootball.defaultSeason,
    presetKey: input.presetKey ?? DEFAULT_PRESET_KEY,
    enabled: true,
  });
}

export async function removeLeaguePresetFromDatabase(
  config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>,
  providerCompetitionId: string,
): Promise<LeaguePresetRecord> {
  const { repositories, providerId } = await presetContext(config);
  const existing = (await repositories.leaguePresets.list({ providerId }))
    .find((preset) => preset.providerCompetitionId === providerCompetitionId && preset.enabled);
  if (!existing) throw new Error(`League preset ${providerCompetitionId} was not found.`);
  return repositories.leaguePresets.update(existing.id, { enabled: false });
}

export async function listTeamPresets(config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>): Promise<TeamPresetRecord[]> {
  const { repositories, providerId } = await presetContext(config);
  return (await repositories.teamPresets.list({ providerId })).filter((preset) => preset.enabled);
}

export async function addTeamPreset(
  config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>,
  input: { id: string; name: string; country?: string; league?: string; presetKey?: string },
): Promise<TeamPresetRecord> {
  const { repositories, providerId } = await presetContext(config);
  const existing = (await repositories.teamPresets.list({ providerId }))
    .find((preset) => preset.providerTeamId === input.id && preset.presetKey === (input.presetKey ?? 'default'));
  if (existing) {
    return repositories.teamPresets.update(existing.id, {
      name: input.name,
      country: input.country,
      providerLeagueId: input.league,
      enabled: true,
    });
  }
  return repositories.teamPresets.create({
    providerId,
    providerTeamId: input.id,
    name: input.name,
    country: input.country,
    providerLeagueId: input.league,
    presetKey: input.presetKey ?? 'default',
    enabled: true,
  });
}

export async function removeTeamPreset(
  config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>,
  providerTeamId: string,
): Promise<TeamPresetRecord> {
  const { repositories, providerId } = await presetContext(config);
  const existing = (await repositories.teamPresets.list({ providerId }))
    .find((preset) => preset.providerTeamId === providerTeamId && preset.enabled);
  if (!existing) throw new Error(`Team preset ${providerTeamId} was not found.`);
  return repositories.teamPresets.update(existing.id, { enabled: false });
}

async function presetContext(config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>) {
  requireDatabaseUrl(config);
  const db = getPrismaClient() as unknown as StoragePrismaClient;
  const repositories = createStorageRepositories(db);
  const provider = await repositories.sportsProviders.upsertByCode({
    code: API_FOOTBALL_PROVIDER,
    name: 'API-Football',
    baseUrl: config.apiFootballBaseUrl,
  });
  return { repositories, providerId: provider.id };
}

function readLeaguePresetRecords(
  config: Pick<AgentConfig, 'apiFootball'>,
  options: { includeDisabled?: boolean } = {},
): FileLeaguePresetRecord[] {
  const file = readLeaguePresetFile(config);
  const presetKey = file.presetKey ?? DEFAULT_PRESET_KEY;
  const leagues = Array.isArray(file.leagues) ? file.leagues : [];
  const now = new Date(0);

  return sortFileLeagueEntries(leagues)
    .map((entry): FileLeaguePresetRecord | null => {
      const id = stringOrUndefined(entry.id ?? entry.providerCompetitionId);
      const name = stringOrUndefined(entry.name);
      if (!id || !name) return null;
      const enabled = entry.enabled !== false;
      if (!options.includeDisabled && !enabled) return null;
      return {
        id: `league:${id}`,
        presetKey,
        providerId: FILE_PROVIDER_ID,
        providerCompetitionId: id,
        competitionId: null,
        name,
        country: stringOrUndefined(entry.country) ?? null,
        season: integerOrNull(entry.season),
        enabled,
        priority: numericOrNull(entry.priority),
        metadata: null,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter((entry): entry is FileLeaguePresetRecord => entry !== null);
}

function readLeaguePresetFile(config: Pick<AgentConfig, 'apiFootball'>): LeaguePresetFile {
  const path = leaguePresetPath(config);
  if (!existsSync(path)) return { presetKey: DEFAULT_PRESET_KEY, leagues: [] };
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error(`League preset file ${path} must contain a JSON object.`);
  const file = parsed as LeaguePresetFile;
  return {
    presetKey: stringOrUndefined(file.presetKey) ?? DEFAULT_PRESET_KEY,
    leagues: Array.isArray(file.leagues) ? file.leagues : [],
  };
}

function writeLeaguePresetFile(config: Pick<AgentConfig, 'apiFootball'>, file: LeaguePresetFile): void {
  const path = leaguePresetPath(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

function leaguePresetPath(config: Pick<AgentConfig, 'apiFootball'>): string {
  return resolve(config.apiFootball.leaguePresetsPath);
}

function sortFileLeagueEntries(entries: FileLeaguePresetEntry[]): FileLeaguePresetEntry[] {
  return [...entries].sort((a, b) => {
    const priority = (numericOrNull(a.priority) ?? 10_000) - (numericOrNull(b.priority) ?? 10_000);
    if (priority !== 0) return priority;
    return (stringOrUndefined(a.name) ?? '').localeCompare(stringOrUndefined(b.name) ?? '');
  });
}

function nextLeaguePriority(entries: FileLeaguePresetEntry[]): number {
  const priorities = entries.map((entry) => numericOrNull(entry.priority)).filter((value): value is number => value !== null);
  return priorities.length ? Math.max(...priorities) + 10 : 10;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numericOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: unknown): number | null {
  const parsed = numericOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}
