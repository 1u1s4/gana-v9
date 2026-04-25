import type {
  LeaguePresetInput,
  LeaguePresetRecord,
  SearchFilterPresetInput,
  SearchFilterPresetRecord,
  StoragePrismaClient,
  TeamPresetInput,
  TeamPresetRecord,
} from '../types.js';
import { compactData, takeArg } from './helpers.js';

export interface PresetListQuery {
  providerId?: string;
  take?: number;
}

export function createLeaguePresetRepository(db: Pick<StoragePrismaClient, 'leaguePreset'>) {
  return {
    create(input: LeaguePresetInput): Promise<LeaguePresetRecord> {
      return db.leaguePreset.create({ data: compactData(input) });
    },

    update(id: string, input: Partial<LeaguePresetInput>): Promise<LeaguePresetRecord> {
      return db.leaguePreset.update({
        where: { id },
        data: compactData(input),
      });
    },

    findById(id: string): Promise<LeaguePresetRecord | null> {
      return db.leaguePreset.findUnique({ where: { id } });
    },

    list(query: PresetListQuery = {}): Promise<LeaguePresetRecord[]> {
      return db.leaguePreset.findMany({
        where: compactData({ providerId: query.providerId }),
        orderBy: { name: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createTeamPresetRepository(db: Pick<StoragePrismaClient, 'teamPreset'>) {
  return {
    create(input: TeamPresetInput): Promise<TeamPresetRecord> {
      return db.teamPreset.create({ data: compactData(input) });
    },

    update(id: string, input: Partial<TeamPresetInput>): Promise<TeamPresetRecord> {
      return db.teamPreset.update({
        where: { id },
        data: compactData(input),
      });
    },

    findById(id: string): Promise<TeamPresetRecord | null> {
      return db.teamPreset.findUnique({ where: { id } });
    },

    list(query: PresetListQuery = {}): Promise<TeamPresetRecord[]> {
      return db.teamPreset.findMany({
        where: compactData({ providerId: query.providerId }),
        orderBy: { name: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createSearchFilterPresetRepository(db: Pick<StoragePrismaClient, 'searchFilterPreset'>) {
  return {
    create(input: SearchFilterPresetInput): Promise<SearchFilterPresetRecord> {
      return db.searchFilterPreset.create({
        data: compactData({
          includeLiveFixtures: false,
          includeCompletedFixtures: false,
          ...input,
        }),
      });
    },

    update(id: string, input: Partial<SearchFilterPresetInput>): Promise<SearchFilterPresetRecord> {
      return db.searchFilterPreset.update({
        where: { id },
        data: compactData(input),
      });
    },

    findById(id: string): Promise<SearchFilterPresetRecord | null> {
      return db.searchFilterPreset.findUnique({ where: { id } });
    },

    list(take?: number): Promise<SearchFilterPresetRecord[]> {
      return db.searchFilterPreset.findMany({
        orderBy: { name: 'asc' },
        ...takeArg(take),
      });
    },
  };
}

export function createPresetRepositories(
  db: Pick<StoragePrismaClient, 'leaguePreset' | 'teamPreset' | 'searchFilterPreset'>,
) {
  return {
    leaguePresets: createLeaguePresetRepository(db),
    teamPresets: createTeamPresetRepository(db),
    searchFilterPresets: createSearchFilterPresetRepository(db),
  };
}
