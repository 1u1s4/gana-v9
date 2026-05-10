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
import { compactData, fixtureDateRange, paginationArgs, redactJson, redactText, takeArg, withTransaction } from './helpers.js';

export interface ParlayQuery {
  runId?: string;
  status?: ParlayStatus | string;
  take?: number;
}

export interface ParlayFixtureDateQuery {
  status?: ParlayStatus | string | Array<ParlayStatus | string>;
  take?: number;
  skip?: number;
  timezone?: string;
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
      const fixtureDate = fixtureDateRange(date, query.timezone);

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
        orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
        ...paginationArgs(query),
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
      const { parlayId, legIndex, ...data } = input;
      return db.parlayLeg.create({
        data: compactData({
          status: 'pending',
          ...redactParlayLegInput(data),
          parlayId,
          legIndex,
        }),
      });
    },

    createMany(inputs: ParlayLegInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.parlayLeg.createMany({
        data: inputs.map((input) => {
          const { parlayId, legIndex, ...data } = input;
          return compactData({
            status: 'pending',
            ...redactParlayLegInput(data),
            parlayId,
            legIndex,
          });
        }),
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

export function createParlayRepositories(db: Pick<StoragePrismaClient, 'parlay' | 'parlayLeg'>) {
  return {
    parlays: createParlayRepository(db),
    parlayLegs: createParlayLegRepository(db),
  };
}
