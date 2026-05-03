import type { LeaderboardEntryInput, LeaderboardEntryRecord, PrismaBatchPayload, StoragePrismaClient } from '../types.js';
import { compactData } from './helpers.js';

export function createLeaderboardEntryRepository(db: Pick<StoragePrismaClient, 'leaderboardEntry'>) {
  return {
    create(input: LeaderboardEntryInput): Promise<LeaderboardEntryRecord> {
      return db.leaderboardEntry.create({
        data: compactData({
          ...input,
          generatedAt: input.generatedAt ?? new Date(),
        }),
      });
    },

    createMany(inputs: LeaderboardEntryInput[]): Promise<PrismaBatchPayload> {
      return db.leaderboardEntry.createMany({
        data: inputs.map((input) => compactData({
          ...input,
          generatedAt: input.generatedAt ?? new Date(),
        })),
      });
    },
  };
}

export function createAnalyticsRepositories(db: Pick<StoragePrismaClient, 'leaderboardEntry'>) {
  return {
    leaderboardEntries: createLeaderboardEntryRepository(db),
  };
}
