import type {
  JsonValue,
  ParlayInput,
  ParlayLegInput,
  ParlayLegRecord,
  ParlayLegStatus,
  ParlayRecord,
  ParlayStatus,
  PrismaBatchPayload,
  StoragePrismaClient,
} from '../types.js';
import { compactData, redactJson, redactText, takeArg, withTransaction } from './helpers.js';

export interface ParlayQuery {
  runId?: string;
  status?: ParlayStatus | string;
  take?: number;
}

export interface ParlayFixtureDateQuery {
  status?: ParlayStatus | string | Array<ParlayStatus | string>;
  take?: number;
}

export interface ParlayLegQuery {
  parlayId?: string;
  predictionId?: string;
  fixtureId?: string;
  status?: ParlayLegStatus | string;
  take?: number;
}

export interface ParlayWithLegsInput {
  parlay: ParlayInput;
  legs: Array<Omit<ParlayLegInput, 'parlayId' | 'legIndex'> & Partial<Pick<ParlayLegInput, 'legIndex'>>>;
}

export function createParlayRepository(db: Pick<StoragePrismaClient, 'parlay' | 'parlayLeg'>) {
  return {
    create(input: ParlayInput): Promise<ParlayRecord> {
      return db.parlay.create({
        data: compactData({
          status: 'draft',
          generatedAt: input.generatedAt ?? new Date(),
          ...redactParlayInput(input),
        }),
      });
    },

    async createWithLegs(input: ParlayWithLegsInput): Promise<ParlayRecord> {
      return withTransaction(db, async (tx) => {
        const parlay = await tx.parlay.create({
          data: compactData({
            status: 'draft',
            generatedAt: input.parlay.generatedAt ?? new Date(),
            ...redactParlayInput(input.parlay),
          }),
        });

        if (input.legs.length > 0) {
          await tx.parlayLeg.createMany({
            data: input.legs.map((leg, index) => {
              const { legIndex, ...data } = leg;

              return compactData({
                status: 'pending',
                legIndex: legIndex ?? index,
              ...redactParlayLegInput(data),
              parlayId: parlay.id,
            });
            }),
            skipDuplicates: true,
          });
        }

        return parlay;
      });
    },

    findById(id: string): Promise<ParlayRecord | null> {
      return db.parlay.findUnique({ where: { id } });
    },

    list(query: ParlayQuery = {}): Promise<ParlayRecord[]> {
      return db.parlay.findMany({
        where: compactData({
          runId: query.runId,
          status: query.status,
        }),
        orderBy: { generatedAt: 'desc' },
        ...takeArg(query.take),
      });
    },

    listForFixtureDate(date: Date | string, query: ParlayFixtureDateQuery = {}): Promise<ParlayRecord[]> {
      const fixtureDate = dateRange(date);

      return db.parlay.findMany({
        where: compactData({
          status: Array.isArray(query.status) ? { in: query.status } : query.status,
          legs: {
            some: {
              fixture: {
                scheduledAt: {
                  gte: fixtureDate.start,
                  lt: fixtureDate.end,
                },
              },
            },
          },
        }),
        orderBy: { generatedAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

function redactParlayInput(input: ParlayInput): ParlayInput {
  return {
    ...input,
    rationaleRedacted: redactText(input.rationaleRedacted) ?? '',
    warnings: redactJson(input.warnings as JsonValue | null | undefined),
    metadata: redactJson(input.metadata as JsonValue | null | undefined),
  };
}

function redactParlayLegInput(input: Omit<ParlayLegInput, 'parlayId' | 'legIndex'>): Omit<ParlayLegInput, 'parlayId' | 'legIndex'> {
  return {
    ...input,
    inclusionReason: redactText(input.inclusionReason),
    metadata: redactJson(input.metadata as JsonValue | null | undefined),
  };
}

export function createParlayLegRepository(db: Pick<StoragePrismaClient, 'parlayLeg'>) {
  return {
    create(input: ParlayLegInput): Promise<ParlayLegRecord> {
      return db.parlayLeg.create({
        data: compactData({
          status: 'pending',
          ...input,
        }),
      });
    },

    createMany(inputs: ParlayLegInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.parlayLeg.createMany({
        data: inputs.map((input) =>
          compactData({
            status: 'pending',
            ...input,
          }),
        ),
        skipDuplicates,
      });
    },

    findById(id: string): Promise<ParlayLegRecord | null> {
      return db.parlayLeg.findUnique({ where: { id } });
    },

    updateStatus(id: string, status: ParlayLegStatus | string): Promise<ParlayLegRecord> {
      return db.parlayLeg.update({
        where: { id },
        data: { status },
      });
    },

    list(query: ParlayLegQuery = {}): Promise<ParlayLegRecord[]> {
      return db.parlayLeg.findMany({
        where: compactData({
          parlayId: query.parlayId,
          predictionId: query.predictionId,
          fixtureId: query.fixtureId,
          status: query.status,
        }),
        orderBy: { legIndex: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

function dateRange(date: Date | string): { start: Date; end: Date } {
  const value = coerceDate(date);
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { start, end };
}

function coerceDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date(date);
}

export function createParlayRepositories(db: Pick<StoragePrismaClient, 'parlay' | 'parlayLeg'>) {
  return {
    parlays: createParlayRepository(db),
    parlayLegs: createParlayLegRepository(db),
  };
}
