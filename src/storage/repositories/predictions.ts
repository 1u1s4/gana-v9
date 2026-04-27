import type {
  PredictionInput,
  PredictionRecord,
  PredictionStatus,
  PrismaBatchPayload,
  StoragePrismaClient,
} from '../types.js';
import { compactData, takeArg } from './helpers.js';

export interface PredictionQuery {
  runId?: string;
  fixtureId?: string;
  status?: PredictionStatus | string;
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
          ...input,
        }),
      });
    },

    createMany(inputs: PredictionInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.prediction.createMany({
        data: inputs.map((input) => compactData({
          status: 'draft',
          quality: 'low',
          generatedAt: input.generatedAt ?? new Date(),
          ...input,
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
          status: query.status,
        }),
        orderBy: { generatedAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createPredictionRepositories(db: Pick<StoragePrismaClient, 'prediction'>) {
  return {
    predictions: createPredictionRepository(db),
  };
}
