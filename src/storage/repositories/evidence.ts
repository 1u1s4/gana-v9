import type {
  ClaimInput,
  ClaimRecord,
  EvidenceItemInput,
  EvidenceItemRecord,
  JsonValue,
  PrismaBatchPayload,
  ResearchBundleInput,
  ResearchBundleRecord,
  ResearchBundleStatus,
  SourceRecordInput,
  SourceRecordRecord,
  StoragePrismaClient,
} from '../types.js';
import { compactData, redactJson, redactText, takeArg, withTransaction } from './helpers.js';

export interface ResearchBundleQuery {
  runId?: string;
  fixtureId?: string;
  status?: ResearchBundleStatus | string;
  take?: number;
}

export interface SourceRecordQuery {
  bundleId?: string;
  runId?: string;
  fixtureId?: string;
  sourceType?: string;
  take?: number;
}

export interface EvidenceItemQuery {
  bundleId?: string;
  sourceId?: string;
  fixtureId?: string;
  take?: number;
}

export interface ClaimQuery {
  bundleId?: string;
  fixtureId?: string;
  sourceId?: string;
  supportLevel?: string;
  conflictStatus?: string;
  critical?: boolean;
  take?: number;
}

export interface ResearchBundleGraphSource {
  id?: string;
  type?: string;
  sourceType?: string;
  url?: string;
  snapshotId?: string;
  artifactPath?: string;
  externalId?: string;
  title?: string;
  capturedAt?: string | Date;
  hash?: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchBundleGraphEvidenceItem {
  id?: string;
  sourceId: string;
  claimIds?: string[];
  snippet?: string;
  summary?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ResearchBundleGraphClaim {
  id?: string;
  statement: string;
  subject?: {
    type?: string;
    id?: string;
    market?: string | null;
  };
  supportLevel?: string;
  evidenceIds?: string[];
  conflictStatus?: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchBundleGraphInput {
  bundle: {
    id?: string;
    runId: string;
    fixtureId: string;
    providerFixtureId?: string;
    sources?: ResearchBundleGraphSource[];
    evidenceItems?: ResearchBundleGraphEvidenceItem[];
    claims?: ResearchBundleGraphClaim[];
    gateResult?: Record<string, unknown> | JsonValue;
    providerAgentic?: string;
    model?: string;
    promptVersion?: string;
    createdAt?: string | Date;
    warnings?: string[] | JsonValue;
    metadata?: Record<string, unknown> | JsonValue;
  };
  artifactPath?: string;
  artifactHash?: string;
}

export function createResearchBundleRepository(
  db: Pick<StoragePrismaClient, 'researchBundle' | 'sourceRecord' | 'evidenceItem' | 'claim' | 'artifact'>,
) {
  return {
    create(input: ResearchBundleInput): Promise<ResearchBundleRecord> {
      return db.researchBundle.create({
        data: compactData({
          status: 'created',
          ...input,
        }),
      });
    },

    findById(id: string): Promise<ResearchBundleRecord | null> {
      return db.researchBundle.findUnique({ where: { id } });
    },

    async createWithItems(input: ResearchBundleGraphInput): Promise<ResearchBundleRecord> {
      return withTransaction(db, async (tx) => {
        const artifact = input.artifactPath
          ? await tx.artifact.create({
            data: compactData({
              name: basename(input.artifactPath),
              kind: 'research-bundle',
              path: input.artifactPath,
              sha256: input.artifactHash,
              runId: input.bundle.runId,
              metadata: compactData({
                bundleId: input.bundle.id,
                promptVersion: input.bundle.promptVersion,
              }) as JsonValue,
            }),
          })
          : null;
        const createdAt = coerceDate(input.bundle.createdAt);
        const bundle = await tx.researchBundle.create({
          data: compactData({
            runId: input.bundle.runId,
            id: input.bundle.id,
            fixtureId: input.bundle.fixtureId,
            providerFixtureId: input.bundle.providerFixtureId,
            artifactId: artifact?.id,
            status: researchStatusFromGate(input.bundle.gateResult),
            gateResult: redactJson(input.bundle.gateResult as JsonValue | null | undefined),
            providerAgentic: input.bundle.providerAgentic,
            model: input.bundle.model,
            promptVersion: input.bundle.promptVersion,
            warnings: redactJson(input.bundle.warnings as JsonValue | null | undefined),
            metadata: redactJson(input.bundle.metadata as JsonValue | null | undefined),
            createdAt,
          }),
        });

        const evidenceSourceIds = new Map<string, string>();
        const sourceIds = new Map<string, string>();
        for (const source of input.bundle.sources ?? []) {
          const localSourceId = String(source.id);
          const sourceId = scopedResearchId(bundle.id, localSourceId);
          sourceIds.set(localSourceId, sourceId);
          await tx.sourceRecord.create({
            data: compactData({
              id: sourceId,
              bundleId: bundle.id,
              runId: input.bundle.runId,
              fixtureId: input.bundle.fixtureId,
              providerSnapshotId: providerSnapshotId(source.snapshotId, source.sourceType ?? source.type),
              sourceType: source.sourceType ?? source.type,
              url: redactText(source.url),
              title: redactText(source.title),
              externalId: redactText(source.externalId ?? source.snapshotId),
              hash: normalizeSourceHash(source.hash),
              capturedAt: coerceDate(source.capturedAt) ?? new Date(),
              metadata: redactJson(compactData({
                ...(source.metadata ?? {}),
                artifactPath: source.artifactPath,
                snapshotId: source.snapshotId,
              }) as JsonValue),
            }),
          });
        }

        for (const evidence of input.bundle.evidenceItems ?? []) {
          const localEvidenceId = String(evidence.id);
          const evidenceId = scopedResearchId(bundle.id, localEvidenceId);
          const record = await tx.evidenceItem.create({
            data: compactData({
              id: evidenceId,
              bundleId: bundle.id,
              sourceId: sourceIds.get(String(evidence.sourceId)) ?? evidence.sourceId,
              fixtureId: input.bundle.fixtureId,
              snippetRedacted: redactText(evidence.snippet),
              summaryRedacted: redactText(evidence.summary),
              confidence: evidence.confidence,
              claimIds: evidence.claimIds?.map((id) => scopedResearchId(bundle.id, String(id))),
              metadata: redactJson(evidence.metadata as JsonValue | null | undefined),
            }),
          });
          evidenceSourceIds.set(localEvidenceId, record.sourceId);
          evidenceSourceIds.set(record.id, record.sourceId);
        }

        for (const claim of input.bundle.claims ?? []) {
          await tx.claim.create({
            data: compactData({
              id: scopedResearchId(bundle.id, String(claim.id)),
              bundleId: bundle.id,
              fixtureId: input.bundle.fixtureId,
              sourceId: firstEvidenceSourceId(claim.evidenceIds, evidenceSourceIds),
              statement: redactText(claim.statement),
              subjectType: claim.subject?.type,
              subjectKey: claim.subject?.id ?? claim.subject?.market,
              marketKey: claim.subject?.market,
              supportLevel: claim.supportLevel ?? 'unknown',
              evidenceIds: claim.evidenceIds?.map((id) => scopedResearchId(bundle.id, String(id))),
              conflictStatus: claim.conflictStatus ?? 'unknown',
              critical: false,
              metadata: redactJson(claim.metadata as JsonValue | null | undefined),
            }),
          });
        }

        return bundle;
      });
    },

    list(query: ResearchBundleQuery = {}): Promise<ResearchBundleRecord[]> {
      return db.researchBundle.findMany({
        where: compactData({
          runId: query.runId,
          fixtureId: query.fixtureId,
          status: query.status,
        }),
        orderBy: { createdAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createSourceRecordRepository(db: Pick<StoragePrismaClient, 'sourceRecord'>) {
  return {
    create(input: SourceRecordInput): Promise<SourceRecordRecord> {
      return db.sourceRecord.create({
        data: compactData({
          ...input,
          capturedAt: input.capturedAt ?? new Date(),
        }),
      });
    },

    createMany(inputs: SourceRecordInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.sourceRecord.createMany({
        data: inputs.map((input) =>
          compactData({
            ...input,
            capturedAt: input.capturedAt ?? new Date(),
          }),
        ),
        skipDuplicates,
      });
    },

    findById(id: string): Promise<SourceRecordRecord | null> {
      return db.sourceRecord.findUnique({ where: { id } });
    },

    list(query: SourceRecordQuery): Promise<SourceRecordRecord[]> {
      return db.sourceRecord.findMany({
        where: compactData({
          bundleId: query.bundleId,
          runId: query.runId,
          fixtureId: query.fixtureId,
          sourceType: query.sourceType,
        }),
        orderBy: { capturedAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createEvidenceItemRepository(db: Pick<StoragePrismaClient, 'evidenceItem'>) {
  return {
    create(input: EvidenceItemInput): Promise<EvidenceItemRecord> {
      return db.evidenceItem.create({ data: compactData(input) });
    },

    createMany(inputs: EvidenceItemInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.evidenceItem.createMany({
        data: inputs.map((input) => compactData(input)),
        skipDuplicates,
      });
    },

    findById(id: string): Promise<EvidenceItemRecord | null> {
      return db.evidenceItem.findUnique({ where: { id } });
    },

    list(query: EvidenceItemQuery): Promise<EvidenceItemRecord[]> {
      return db.evidenceItem.findMany({
        where: compactData({
          bundleId: query.bundleId,
          sourceId: query.sourceId,
          fixtureId: query.fixtureId,
        }),
        orderBy: { createdAt: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createClaimRepository(db: Pick<StoragePrismaClient, 'claim'>) {
  return {
    create(input: ClaimInput): Promise<ClaimRecord> {
      return db.claim.create({
        data: compactData({
          supportLevel: 'unknown',
          conflictStatus: 'unknown',
          critical: false,
          ...input,
        }),
      });
    },

    createMany(inputs: ClaimInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.claim.createMany({
        data: inputs.map((input) =>
          compactData({
            supportLevel: 'unknown',
            conflictStatus: 'unknown',
            critical: false,
            ...input,
          }),
        ),
        skipDuplicates,
      });
    },

    findById(id: string): Promise<ClaimRecord | null> {
      return db.claim.findUnique({ where: { id } });
    },

    list(query: ClaimQuery): Promise<ClaimRecord[]> {
      return db.claim.findMany({
        where: compactData({
          bundleId: query.bundleId,
          fixtureId: query.fixtureId,
          sourceId: query.sourceId,
          supportLevel: query.supportLevel,
          conflictStatus: query.conflictStatus,
          critical: query.critical,
        }),
        orderBy: { createdAt: 'asc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createEvidenceRepositories(
  db: Pick<StoragePrismaClient, 'researchBundle' | 'sourceRecord' | 'evidenceItem' | 'claim' | 'artifact'>,
) {
  return {
    researchBundles: createResearchBundleRepository(db),
    sourceRecords: createSourceRecordRepository(db),
    evidenceItems: createEvidenceItemRepository(db),
    claims: createClaimRepository(db),
  };
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? 'research-bundle.json';
}

function coerceDate(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function researchStatusFromGate(gateResult?: unknown): ResearchBundleStatus | string {
  if (!gateResult || typeof gateResult !== 'object' || Array.isArray(gateResult)) return 'created';
  const verdict = (gateResult as { verdict?: unknown }).verdict;
  return typeof verdict === 'string' ? verdict : 'created';
}

function firstEvidenceSourceId(evidenceIds: string[] | undefined, evidenceSourceIds: Map<string, string>): string | undefined {
  for (const evidenceId of evidenceIds ?? []) {
    const sourceId = evidenceSourceIds.get(evidenceId);
    if (sourceId) return sourceId;
  }
  return undefined;
}

function scopedResearchId(bundleId: string, localId: string): string {
  const scoped = `${bundleId}:${localId}`;
  return scoped.length <= 120 ? scoped : scoped.slice(0, 120);
}

function normalizeSourceHash(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.length <= 64 ? value : value.slice(0, 64);
}

function providerSnapshotId(value: unknown, sourceType: unknown): string | undefined {
  if (sourceType !== 'provider-snapshot' && sourceType !== 'api-football') return undefined;
  if (typeof value !== 'string') return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}
