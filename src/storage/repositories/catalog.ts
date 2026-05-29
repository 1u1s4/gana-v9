import type {
  CompetitionInput,
  CompetitionRecord,
  FixtureInput,
  FixtureRecord,
  FixtureStatus,
  SportsProviderInput,
  SportsProviderRecord,
  StoragePrismaClient,
  TeamInput,
  TeamRecord,
} from '../types.js';
import { compactData, takeArg } from './helpers.js';

export interface CompetitionListQuery {
  providerId?: string;
  country?: string;
  type?: string;
  take?: number;
}

export interface FixtureWindowQuery {
  providerId?: string;
  competitionId?: string;
  season?: number;
  statuses?: Array<FixtureStatus | string>;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  take?: number;
}

export function createSportsProviderRepository(db: Pick<StoragePrismaClient, 'sportsProvider'>) {
  return {
    upsertByCode(input: SportsProviderInput): Promise<SportsProviderRecord> {
      return db.sportsProvider.upsert({
        where: { code: input.code },
        create: compactData(input),
        update: compactData({ name: input.name, baseUrl: input.baseUrl }),
      });
    },

    findByCode(code: string): Promise<SportsProviderRecord | null> {
      return db.sportsProvider.findUnique({ where: { code } });
    },

    list(): Promise<SportsProviderRecord[]> {
      return db.sportsProvider.findMany({ orderBy: { code: 'asc' } });
    },
  };
}

export function createCompetitionRepository(db: Pick<StoragePrismaClient, 'competition'>) {
  return {
    upsertByProviderKey(input: CompetitionInput): Promise<CompetitionRecord> {
      const where = {
        providerId_providerCompetitionId: {
          providerId: input.providerId,
          providerCompetitionId: input.providerCompetitionId,
        },
      };

      return db.competition.upsert({
        where,
        create: compactData(input),
        update: compactData({
          name: input.name,
          country: input.country,
          type: input.type,
          metadata: input.metadata,
        }),
      });
    },

    findByProviderKey(providerId: string, providerCompetitionId: string): Promise<CompetitionRecord | null> {
      return db.competition.findUnique({
        where: { providerId_providerCompetitionId: { providerId, providerCompetitionId } },
      });
    },

    findById(id: string): Promise<CompetitionRecord | null> {
      return db.competition.findUnique({ where: { id } });
    },

    list(query: CompetitionListQuery = {}): Promise<CompetitionRecord[]> {
      return db.competition.findMany({
        where: compactData({
          providerId: query.providerId,
          country: query.country,
          type: query.type,
        }),
        orderBy: [{ country: 'asc' }, { name: 'asc' }],
        ...takeArg(query.take),
      });
    },
  };
}

export function createTeamRepository(db: Pick<StoragePrismaClient, 'team'>) {
  return {
    upsertByProviderKey(input: TeamInput): Promise<TeamRecord> {
      const where = {
        providerId_providerTeamId: {
          providerId: input.providerId,
          providerTeamId: input.providerTeamId,
        },
      };

      return db.team.upsert({
        where,
        create: compactData(input),
        update: compactData({
          name: input.name,
          country: input.country,
          metadata: input.metadata,
        }),
      });
    },

    findByProviderKey(providerId: string, providerTeamId: string): Promise<TeamRecord | null> {
      return db.team.findUnique({
        where: { providerId_providerTeamId: { providerId, providerTeamId } },
      });
    },

    findById(id: string): Promise<TeamRecord | null> {
      return db.team.findUnique({ where: { id } });
    },

    listByProvider(providerId: string, take?: number): Promise<TeamRecord[]> {
      return db.team.findMany({
        where: { providerId },
        orderBy: { name: 'asc' },
        ...takeArg(take),
      });
    },
  };
}

export function createFixtureRepository(db: Pick<StoragePrismaClient, 'fixture'>) {
  return {
    upsertByProviderKey(input: FixtureInput): Promise<FixtureRecord> {
      const where = {
        providerId_providerFixtureId: {
          providerId: input.providerId,
          providerFixtureId: input.providerFixtureId,
        },
      };

      return db.fixture.upsert({
        where,
        create: compactData(input),
        update: compactData({
          competitionId: input.competitionId,
          season: input.season,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          scheduledAt: input.scheduledAt,
          status: input.status,
          scoreHome: input.scoreHome,
          scoreAway: input.scoreAway,
          includedByFilters: input.includedByFilters,
          metadata: input.metadata,
        }),
      });
    },

    findById(id: string): Promise<FixtureRecord | null> {
      return db.fixture.findUnique({ where: { id } });
    },

    findByProviderKey(providerId: string, providerFixtureId: string): Promise<FixtureRecord | null> {
      return db.fixture.findUnique({
        where: { providerId_providerFixtureId: { providerId, providerFixtureId } },
      });
    },

    listWindow(query: FixtureWindowQuery = {}): Promise<FixtureRecord[]> {
      const scheduledAt =
        query.scheduledFrom === undefined && query.scheduledTo === undefined
          ? undefined
          : compactData({ gte: query.scheduledFrom, lte: query.scheduledTo });

      return db.fixture.findMany({
        where: compactData({
          providerId: query.providerId,
          competitionId: query.competitionId,
          season: query.season,
          status: query.statuses === undefined ? undefined : { in: query.statuses },
          scheduledAt,
        }),
        orderBy: { scheduledAt: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createCatalogRepositories(db: Pick<StoragePrismaClient, 'sportsProvider' | 'competition' | 'team' | 'fixture'>) {
  return {
    sportsProviders: createSportsProviderRepository(db),
    competitions: createCompetitionRepository(db),
    teams: createTeamRepository(db),
    fixtures: createFixtureRepository(db),
  };
}
