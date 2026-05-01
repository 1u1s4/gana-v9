import type {
  StoragePrismaClient,
  ValidationArtifactInput,
  ValidationArtifactRecord,
  ValidationArtifactStatus,
} from '../types.js';
import { compactData, redactJson, redactText, takeArg } from './helpers.js';

export interface ValidationArtifactQuery {
  runId?: string;
  predictionId?: string;
  parlayId?: string;
  fixtureId?: string;
  status?: ValidationArtifactStatus | string;
  take?: number;
}

export function createValidationArtifactRepository(db: Pick<StoragePrismaClient, 'validationArtifact'>) {
  return {
    create(input: ValidationArtifactInput): Promise<ValidationArtifactRecord> {
      return db.validationArtifact.create({
        data: compactData({
          evaluatedAt: input.evaluatedAt ?? new Date(),
          ...redactValidationInput(input),
        }),
      });
    },

    findById(id: string): Promise<ValidationArtifactRecord | null> {
      return db.validationArtifact.findUnique({ where: { id } });
    },

    list(query: ValidationArtifactQuery = {}): Promise<ValidationArtifactRecord[]> {
      return db.validationArtifact.findMany({
        where: compactData({
          runId: query.runId,
          predictionId: query.predictionId,
          parlayId: query.parlayId,
          fixtureId: query.fixtureId,
          status: query.status,
        }),
        orderBy: { evaluatedAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

function redactValidationInput(input: ValidationArtifactInput): ValidationArtifactInput {
  return {
    ...input,
    reason: redactText(input.reason),
    resultInput: redactJson(input.resultInput),
    outcome: redactJson(input.outcome),
    evidenceIds: redactJson(input.evidenceIds),
    metadata: redactJson(input.metadata),
  };
}

export function createValidationRepositories(db: Pick<StoragePrismaClient, 'validationArtifact'>) {
  return {
    validationArtifacts: createValidationArtifactRepository(db),
  };
}
