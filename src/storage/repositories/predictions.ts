import type {
  PredictionInput,
  PredictionRecord,
  PredictionStatus,
  PrismaBatchPayload,
  StoragePrismaClient,
} from '../types.js';
import { compactData, fixtureDateRange, paginationArgs, redactJson, redactText, takeArg } from './helpers.js';

export interface PredictionQuery {
  runId?: string;
  runIds?: string[];
  fixtureId?: string;
  status?: PredictionStatus | string | Array<PredictionStatus | string>;
  take?: number;
}

export interface PredictionFixtureDateQuery {
  runId?: string;
  runIds?: string[];
  fixtureId?: string;
  status?: PredictionStatus | string | Array<PredictionStatus | string>;
  take?: number;
  skip?: number;
  timezone?: string;
}

export function createPredictionRepository(db: Pick<StoragePrismaClient, 'prediction'>) {
  return {
    create(input: PredictionInput): Promise<PredictionRecord> {
      return db.prediction.create({
        data: compactData({
          status: 'draft',
          quality: 'low',
          generatedAt: input.generatedAt ?? new Date(),
          ...redactPredictionInput(input),
        }),
      });
    },

    createMany(inputs: PredictionInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.prediction.createMany({
        data: inputs.map((input) => compactData({
          status: 'draft',
          quality: 'low',
          generatedAt: input.generatedAt ?? new Date(),
          ...redactPredictionInput(input),
        })),
        skipDuplicates,
      });
    },

    findById(id: string): Promise<PredictionRecord | null> {
      return db.prediction.findUnique({ where: { id } });
    },

    list(query: PredictionQuery = {}): Promise<PredictionRecord[]> {
      return db.prediction.findMany({
        where: compactData({
          runId: query.runIds?.length ? { in: query.runIds } : query.runId,
          fixtureId: query.fixtureId,
          status: Array.isArray(query.status) ? { in: query.status } : query.status,
        }),
        orderBy: { generatedAt: 'desc' },
        ...takeArg(query.take),
      });
    },

    listForFixtureDate(date: Date | string, query: PredictionFixtureDateQuery = {}): Promise<PredictionRecord[]> {
      const fixtureDate = fixtureDateRange(date, query.timezone);

      return db.prediction.findMany({
        where: compactData({
          runId: query.runIds?.length ? { in: query.runIds } : query.runId,
          fixtureId: query.fixtureId,
          status: Array.isArray(query.status) ? { in: query.status } : query.status,
          fixture: {
            scheduledAt: {
              gte: fixtureDate.start,
              lt: fixtureDate.end,
            },
          },
        }),
        orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
        ...paginationArgs(query),
      });
    },
  };
}

function redactPredictionInput(input: PredictionInput): PredictionInput {
  return {
    ...input,
    rationaleRedacted: redactText(input.rationaleRedacted) ?? '',
    warnings: redactJson(input.warnings),
    evidenceIds: redactJson(input.evidenceIds),
    includedByFilters: redactJson(input.includedByFilters),
    metadata: redactJson(input.metadata),
  };
}

export function createPredictionRepositories(db: Pick<StoragePrismaClient, 'prediction'>) {
  return {
    predictions: createPredictionRepository(db),
  };
}
