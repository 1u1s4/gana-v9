import type {
  JsonValue,
  LowOddsHitInput,
  LowOddsHitRecord,
  LowOddsScanInput,
  LowOddsScanRecord,
  LowOddsScanStatus,
  PrismaBatchPayload,
  StoragePrismaClient,
} from '../types.js';
import { compactData, takeArg } from './helpers.js';

export interface LowOddsScanStatusUpdate {
  status: LowOddsScanStatus | string;
  completedAt?: Date | null;
  fixtureCount?: number;
  hitCount?: number;
  errorRedacted?: string | null;
}

export interface LowOddsHitQuery {
  scanId: string;
  eligible?: boolean;
  take?: number;
}

export function createLowOddsScanRepository(db: Pick<StoragePrismaClient, 'lowOddsScan'>) {
  return {
    create(input: LowOddsScanInput): Promise<LowOddsScanRecord> {
      return db.lowOddsScan.create({ data: compactData(input) });
    },

    findById(id: string): Promise<LowOddsScanRecord | null> {
      return db.lowOddsScan.findUnique({ where: { id } });
    },

    updateStatus(id: string, update: LowOddsScanStatusUpdate): Promise<LowOddsScanRecord> {
      return db.lowOddsScan.update({
        where: { id },
        data: compactData(update),
      });
    },

    listRecent(take?: number): Promise<LowOddsScanRecord[]> {
      return db.lowOddsScan.findMany({
        orderBy: [{ createdAt: 'desc' }],
        ...takeArg(take),
      });
    },
  };
}

export function createLowOddsHitRepository(db: Pick<StoragePrismaClient, 'lowOddsHit'>) {
  return {
    create(input: LowOddsHitInput): Promise<LowOddsHitRecord> {
      return db.lowOddsHit.create({
        data: compactData({
          eligible: true,
          ...input,
        }),
      });
    },

    createMany(inputs: LowOddsHitInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.lowOddsHit.createMany({
        data: inputs.map((input) =>
          compactData({
            eligible: true,
            ...input,
          }),
        ),
        skipDuplicates,
      });
    },

    listByScan(query: LowOddsHitQuery): Promise<LowOddsHitRecord[]> {
      return db.lowOddsHit.findMany({
        where: compactData({
          scanId: query.scanId,
          eligible: query.eligible,
        }),
        orderBy: { odds: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createLowOddsRepositories(db: Pick<StoragePrismaClient, 'lowOddsScan' | 'lowOddsHit'>) {
  return {
    lowOddsScans: createLowOddsScanRepository(db),
    lowOddsHits: createLowOddsHitRepository(db),
  };
}
