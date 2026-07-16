import { createHash } from 'node:crypto';

import type {
  OddsQuoteInput,
  OddsQuoteRecord,
  OddsSnapshotInput,
  OddsSnapshotRecord,
  PrismaBatchPayload,
  ProviderSnapshotInput,
  ProviderSnapshotRecord,
  StoragePrismaClient,
} from '../types.js';
import { compactData, takeArg, withTransaction } from './helpers.js';

export interface LatestProviderSnapshotQuery {
  providerId: string;
  endpointName?: string;
  take?: number;
}

export interface LatestOddsQuoteQuery {
  fixtureId: string;
  snapshotId?: string;
  marketKey?: string;
  selectionKey?: string;
  line?: number | null;
  take?: number;
}

export interface OddsSnapshotWithQuotesInput {
  snapshot: OddsSnapshotInput;
  quotes: Array<Omit<OddsQuoteInput, 'snapshotId'>>;
  skipDuplicates?: boolean;
}

export function createProviderSnapshotRepository(db: Pick<StoragePrismaClient, 'providerSnapshot'>) {
  return {
    create(input: ProviderSnapshotInput): Promise<ProviderSnapshotRecord> {
      const capturedAt = input.capturedAt ?? new Date();
      const dedupeKey = input.dedupeKey ?? providerSnapshotDedupeKey(input);
      if (dedupeKey) {
        return db.providerSnapshot.upsert({
          where: { dedupeKey },
          create: compactData({
            ...input,
            dedupeKey,
            capturedAt,
            lastSeenAt: input.lastSeenAt ?? capturedAt,
            observationCount: input.observationCount ?? 1,
          }),
          update: compactData({
            lastSeenAt: capturedAt,
            observationCount: { increment: 1 },
            responseHash: input.responseHash,
            quotaMetadata: input.quotaMetadata,
            requestMetadata: input.requestMetadata,
            ...(input.rawPayload == null ? {} : { rawPayload: input.rawPayload }),
          }),
        });
      }
      return db.providerSnapshot.create({
        data: compactData({
          ...input,
          capturedAt,
          lastSeenAt: input.lastSeenAt ?? capturedAt,
          observationCount: input.observationCount ?? 1,
        }),
      });
    },

    findById(id: string): Promise<ProviderSnapshotRecord | null> {
      return db.providerSnapshot.findUnique({ where: { id } });
    },

    listLatest(query: LatestProviderSnapshotQuery): Promise<ProviderSnapshotRecord[]> {
      return db.providerSnapshot.findMany({
        where: compactData({
          providerId: query.providerId,
          endpointName: query.endpointName,
        }),
        orderBy: { capturedAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function createOddsSnapshotRepository(db: Pick<StoragePrismaClient, 'oddsSnapshot' | 'oddsQuote' | '$transaction'>) {
  return {
    create(input: OddsSnapshotInput): Promise<OddsSnapshotRecord> {
      const capturedAt = input.capturedAt ?? new Date();
      return db.oddsSnapshot.create({
        data: compactData({
          ...input,
          capturedAt,
          lastSeenAt: input.lastSeenAt ?? capturedAt,
          observationCount: input.observationCount ?? 1,
        }),
      });
    },

    findById(id: string): Promise<OddsSnapshotRecord | null> {
      return db.oddsSnapshot.findUnique({ where: { id } });
    },

    createWithQuotes(input: OddsSnapshotWithQuotesInput): Promise<OddsSnapshotRecord> {
      return withTransaction(db, async (tx) => {
        const capturedAt = input.snapshot.capturedAt ?? new Date();
        const dedupeKey = input.snapshot.dedupeKey ?? oddsSnapshotDedupeKey(input);
        const snapshotData = compactData({
          ...input.snapshot,
          dedupeKey,
          capturedAt,
          lastSeenAt: input.snapshot.lastSeenAt ?? capturedAt,
          observationCount: input.snapshot.observationCount ?? 1,
        });
        const snapshot = dedupeKey
          ? await tx.oddsSnapshot.upsert({
            where: { dedupeKey },
            create: snapshotData,
            update: {
              lastSeenAt: capturedAt,
              observationCount: { increment: 1 },
            },
          })
          : await tx.oddsSnapshot.create({ data: snapshotData });

        if (input.quotes.length > 0) {
          await tx.oddsQuote.createMany({
            data: input.quotes.map((quote) =>
              compactData({
                ...quote,
                snapshotId: snapshot.id,
                contentHash: quote.contentHash ?? oddsQuoteContentHash(quote),
                capturedAt: quote.capturedAt ?? capturedAt,
              }),
            ),
            skipDuplicates: input.skipDuplicates ?? true,
          });
        }

        return snapshot;
      });
    },

    listLatestByFixture(fixtureId: string, take?: number): Promise<OddsSnapshotRecord[]> {
      return db.oddsSnapshot.findMany({
        where: { fixtureId },
        orderBy: { lastSeenAt: 'desc' },
        ...takeArg(take),
      });
    },
  };
}

export function createOddsQuoteRepository(db: Pick<StoragePrismaClient, 'oddsQuote'>) {
  return {
    create(input: OddsQuoteInput): Promise<OddsQuoteRecord> {
      return db.oddsQuote.create({
        data: compactData({
          ...input,
          contentHash: input.contentHash ?? oddsQuoteContentHash(input),
          capturedAt: input.capturedAt ?? new Date(),
        }),
      });
    },

    createMany(inputs: OddsQuoteInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.oddsQuote.createMany({
        data: inputs.map((input) =>
          compactData({
            ...input,
            contentHash: input.contentHash ?? oddsQuoteContentHash(input),
            capturedAt: input.capturedAt ?? new Date(),
          }),
        ),
        skipDuplicates,
      });
    },

    listLatest(query: LatestOddsQuoteQuery): Promise<OddsQuoteRecord[]> {
      return db.oddsQuote.findMany({
        where: compactData({
          fixtureId: query.fixtureId,
          snapshotId: query.snapshotId,
          marketKey: query.marketKey,
          selectionKey: query.selectionKey,
          line: query.line,
        }),
        orderBy: { capturedAt: 'desc' },
        ...takeArg(query.take),
      });
    },
  };
}

export function providerSnapshotDedupeKey(input: ProviderSnapshotInput): string | undefined {
  if (!input.payloadHash) return undefined;
  return stableContentHash({
    version: 1,
    providerId: input.providerId,
    endpointName: input.endpointName,
    requestHash: input.requestHash,
    payloadHash: input.payloadHash,
    // Provenance-bearing snapshots stay separate. API-Football currently uses
    // nulls here, allowing unchanged payloads to dedupe across daily runs.
    runId: input.runId ?? null,
    taskId: input.taskId ?? null,
    correlationId: input.correlationId ?? null,
    traceId: input.traceId ?? null,
  });
}

export function oddsSnapshotDedupeKey(input: OddsSnapshotWithQuotesInput): string | undefined {
  if (!input.snapshot.payloadHash) return undefined;
  return stableContentHash({
    version: 1,
    fixtureId: input.snapshot.fixtureId,
    providerFixtureId: input.snapshot.providerFixtureId,
    payloadHash: input.snapshot.payloadHash,
    bookmakerCount: input.snapshot.bookmakerCount ?? 0,
    metadata: input.snapshot.metadata ?? null,
    quoteHashes: input.quotes.map((quote) => quote.contentHash ?? oddsQuoteContentHash(quote)).sort(),
  });
}

export function oddsQuoteContentHash(input: Omit<OddsQuoteInput, 'snapshotId'> | OddsQuoteInput): string {
  return stableContentHash({
    version: 1,
    fixtureId: input.fixtureId,
    bookmaker: input.bookmaker,
    bookmakerKey: input.bookmakerKey ?? null,
    marketKey: input.marketKey,
    selectionKey: input.selectionKey,
    line: input.line ?? null,
    price: input.price,
    impliedProbability: input.impliedProbability ?? null,
    marketImpliedProbability: input.marketImpliedProbability ?? null,
    marketFairProbability: input.marketFairProbability ?? null,
    consensusFairOdds: input.consensusFairOdds ?? null,
    overround: input.overround ?? null,
    marketEfficiencyScore: input.marketEfficiencyScore ?? null,
    metadata: contentMetadata(input.metadata),
  });
}

function contentMetadata(metadata: OddsQuoteInput['metadata']): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata ?? null;
  const { sourceSnapshotId: _observationId, ...content } = metadata as Record<string, unknown>;
  return content;
}

function stableContentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortJson(value))).digest('hex');
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, sortJson(nested)]));
}

export function createSnapshotRepositories(
  db: Pick<StoragePrismaClient, 'providerSnapshot' | 'oddsSnapshot' | 'oddsQuote' | '$transaction'>,
) {
  return {
    providerSnapshots: createProviderSnapshotRepository(db),
    oddsSnapshots: createOddsSnapshotRepository(db),
    oddsQuotes: createOddsQuoteRepository(db),
  };
}
