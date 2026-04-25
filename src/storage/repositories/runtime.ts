import type {
  ArtifactInput,
  ArtifactRecord,
  AuditLogInput,
  AuditLogRecord,
  HarnessRunInput,
  HarnessRunRecord,
  HarnessStatus,
  HarnessTaskInput,
  HarnessTaskRecord,
  HarnessTaskStatus,
  JsonValue,
  ProviderQuotaSampleInput,
  ProviderQuotaSampleRecord,
  StoragePrismaClient,
} from '../types.js';
import { compactData, takeArg } from './helpers.js';

export interface HarnessRunStatusUpdate {
  status: HarnessStatus | string;
  verdict?: string | null;
  completedAt?: Date | null;
}

export interface HarnessTaskStatusUpdate {
  status: HarnessTaskStatus | string;
  leaseExpiresAt?: Date | null;
  attempts?: number;
  lastErrorRedacted?: string | null;
}

export interface RunnableTaskQuery {
  now?: Date;
  take?: number;
}

export function createHarnessRunRepository(db: Pick<StoragePrismaClient, 'harnessRun'>) {
  return {
    create(input: HarnessRunInput): Promise<HarnessRunRecord> {
      return db.harnessRun.create({ data: compactData(input) });
    },

    findById(id: string): Promise<HarnessRunRecord | null> {
      return db.harnessRun.findUnique({ where: { id } });
    },

    updateStatus(id: string, update: HarnessRunStatusUpdate): Promise<HarnessRunRecord> {
      return db.harnessRun.update({
        where: { id },
        data: compactData(update),
      });
    },
  };
}

export function createHarnessTaskRepository(db: Pick<StoragePrismaClient, 'harnessTask'>) {
  return {
    enqueue(input: HarnessTaskInput): Promise<HarnessTaskRecord> {
      return db.harnessTask.create({
        data: compactData({
          status: 'queued',
          priority: 0,
          attempts: 0,
          ...input,
        }),
      });
    },

    findById(id: string): Promise<HarnessTaskRecord | null> {
      return db.harnessTask.findUnique({ where: { id } });
    },

    listRunnable(query: RunnableTaskQuery = {}): Promise<HarnessTaskRecord[]> {
      const now = query.now ?? new Date();

      return db.harnessTask.findMany({
        where: {
          status: 'queued',
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        ...takeArg(query.take),
      });
    },

    updateStatus(id: string, update: HarnessTaskStatusUpdate): Promise<HarnessTaskRecord> {
      return db.harnessTask.update({
        where: { id },
        data: compactData(update),
      });
    },
  };
}

export function createArtifactRepository(db: Pick<StoragePrismaClient, 'artifact'>) {
  return {
    create(input: ArtifactInput): Promise<ArtifactRecord> {
      return db.artifact.create({ data: compactData(input) });
    },

    listByRun(runId: string, take?: number): Promise<ArtifactRecord[]> {
      return db.artifact.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
        ...takeArg(take),
      });
    },
  };
}

export function createAuditLogRepository(db: Pick<StoragePrismaClient, 'auditLog'>) {
  return {
    record(input: AuditLogInput): Promise<AuditLogRecord> {
      return db.auditLog.create({ data: compactData(input) });
    },

    listByRun(runId: string, take?: number): Promise<AuditLogRecord[]> {
      return db.auditLog.findMany({
        where: { runId },
        orderBy: { createdAt: 'desc' },
        ...takeArg(take),
      });
    },
  };
}

export function createProviderQuotaSampleRepository(db: Pick<StoragePrismaClient, 'providerQuotaSample'>) {
  return {
    record(input: ProviderQuotaSampleInput): Promise<ProviderQuotaSampleRecord> {
      return db.providerQuotaSample.create({
        data: compactData({
          ...input,
          sampledAt: input.sampledAt ?? new Date(),
        }),
      });
    },

    listRecent(providerId: string, take?: number): Promise<ProviderQuotaSampleRecord[]> {
      return db.providerQuotaSample.findMany({
        where: { providerId },
        orderBy: { sampledAt: 'desc' },
        ...takeArg(take),
      });
    },
  };
}

export function createRuntimeRepositories(
  db: Pick<StoragePrismaClient, 'harnessRun' | 'harnessTask' | 'artifact' | 'auditLog' | 'providerQuotaSample'>,
) {
  return {
    harnessRuns: createHarnessRunRepository(db),
    harnessTasks: createHarnessTaskRepository(db),
    artifacts: createArtifactRepository(db),
    auditLogs: createAuditLogRepository(db),
    providerQuotaSamples: createProviderQuotaSampleRepository(db),
  };
}
