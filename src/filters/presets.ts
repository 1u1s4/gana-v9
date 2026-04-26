import type { AgentConfig } from '../config.js';
import { API_FOOTBALL_PROVIDER } from '../providers/sports/types.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type { LeaguePresetRecord, StoragePrismaClient, TeamPresetRecord } from '../storage/types.js';
import { requireDatabaseUrl } from './config.js';

export async function listLeaguePresets(config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl'>): Promise<LeaguePresetRecord[]> {
  const { repositories, providerId } = await presetContext(config);
  return (await repositories.leaguePresets.list({ providerId })).filter((preset) => preset.enabled);
}

export async function addLeaguePreset(
  config: Pick<AgentConfig, 'databaseUrl' | 'apiFootballBaseUrl' | 'apiFootball'>,
  input: { id: string; name: string; country?: string; season?: number; presetKey?: string },
): Promise<LeaguePresetRecord> {
  const { repositories, providerId } = await presetContext(config);
  const existing = (await repositories.leaguePresets.list({ providerId }))
    .find((preset) => preset.providerCompetitionId === input.id && preset.presetKey === (input.presetKey ?? 'default'));
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
    presetKey: input.presetKey ?? 'default',
    enabled: true,
  });
}

export async function removeLeaguePreset(
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
