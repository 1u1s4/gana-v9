import type {
  PredictionInput,
  PredictionRecord,
  PredictionStatus,
  PrismaBatchPayload,
  StoragePrismaClient,
} from '../types.js';
import { compactData, redactJson, redactText, takeArg } from './helpers.js';

export interface PredictionQuery {
  runId?: string;
  fixtureId?: string;
  status?: PredictionStatus | string | Array<PredictionStatus | string>;
  take?: number;
}

export interface PredictionFixtureDateQuery {
  status?: PredictionStatus | string | Array<PredictionStatus | string>;
  take?: number;
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
          runId: query.runId,
          fixtureId: query.fixtureId,
          status: Array.isArray(query.status) ? { in: query.status } : query.status,
        }),
        orderBy: { generatedAt: 'desc' },
        ...takeArg(query.take),
      });
    },

    listForFixtureDate(date: Date | string, query: PredictionFixtureDateQuery = {}): Promise<PredictionRecord[]> {
      const fixtureDate = dateRange(date);

      return db.prediction.findMany({
        where: compactData({
          status: Array.isArray(query.status) ? { in: query.status } : query.status,
          fixture: {
            scheduledAt: {
              gte: fixtureDate.start,
              lt: fixtureDate.end,
            },
          },
        }),
        orderBy: { generatedAt: 'desc' },
        ...takeArg(query.take),
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
