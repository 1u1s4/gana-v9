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
import { compactData, takeArg } from './helpers.js';

export interface LatestProviderSnapshotQuery {
  providerId: string;
  endpointName?: string;
  take?: number;
}

export interface LatestOddsQuoteQuery {
  fixtureId: string;
  marketKey?: string;
  selectionKey?: string;
  line?: number | null;
  take?: number;
}

export function createProviderSnapshotRepository(db: Pick<StoragePrismaClient, 'providerSnapshot'>) {
  return {
    create(input: ProviderSnapshotInput): Promise<ProviderSnapshotRecord> {
      return db.providerSnapshot.create({
        data: compactData({
          ...input,
          capturedAt: input.capturedAt ?? new Date(),
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

export function createOddsSnapshotRepository(db: Pick<StoragePrismaClient, 'oddsSnapshot'>) {
  return {
    create(input: OddsSnapshotInput): Promise<OddsSnapshotRecord> {
      return db.oddsSnapshot.create({
        data: compactData({
          ...input,
          capturedAt: input.capturedAt ?? new Date(),
        }),
      });
    },

    findById(id: string): Promise<OddsSnapshotRecord | null> {
      return db.oddsSnapshot.findUnique({ where: { id } });
    },

    listLatestByFixture(fixtureId: string, take?: number): Promise<OddsSnapshotRecord[]> {
      return db.oddsSnapshot.findMany({
        where: { fixtureId },
        orderBy: { capturedAt: 'desc' },
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
          capturedAt: input.capturedAt ?? new Date(),
        }),
      });
    },

    createMany(inputs: OddsQuoteInput[], skipDuplicates = true): Promise<PrismaBatchPayload> {
      return db.oddsQuote.createMany({
        data: inputs.map((input) =>
          compactData({
            ...input,
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

export function createSnapshotRepositories(
  db: Pick<StoragePrismaClient, 'providerSnapshot' | 'oddsSnapshot' | 'oddsQuote'>,
) {
  return {
    providerSnapshots: createProviderSnapshotRepository(db),
    oddsSnapshots: createOddsSnapshotRepository(db),
    oddsQuotes: createOddsQuoteRepository(db),
  };
}
