import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { MarketKey } from '../domain/markets.js';
import { createApiFootballPersistence, createApiFootballProvider } from '../providers/sports/api-football.js';
import type { SportsDataProvider } from '../providers/sports/types.js';
import type { RuntimeContext } from '../runtime/context.js';
import type { FixtureStatistics } from './types.js';

export interface ValidationResultFetchInput {
  providerFixtureId: string;
  fixtureId: string;
  market: MarketKey;
}

export interface ValidationResultFetchResult {
  fixture: Fixture;
  statistics?: FixtureStatistics;
  providerSnapshotId?: string;
  resultProviderSnapshotId?: string;
  statisticsProviderSnapshotId?: string;
}

export interface ValidationResultFetcher {
  fetch(input: ValidationResultFetchInput): Promise<ValidationResultFetchResult>;
}

export async function createApiFootballValidationResultFetcher(
  config: AgentConfig,
  runtime?: RuntimeContext,
  providerOverride?: SportsDataProvider,
): Promise<ValidationResultFetcher> {
  const provider = providerOverride ?? createApiFootballProvider(
    config,
    await createApiFootballPersistence(config, runtime),
  );

  return {
    fetch: (input) => fetchValidationResult(provider, input),
  };
}

export async function fetchValidationResult(
  provider: Pick<SportsDataProvider, 'getFixture' | 'getFixtureStatistics'>,
  input: ValidationResultFetchInput,
): Promise<ValidationResultFetchResult> {
  const fixture = await provider.getFixture({ providerFixtureId: input.providerFixtureId });
  const resultProviderSnapshotId = fixture.providerSnapshotId;

  if (input.market !== 'corners_over_under') {
    return {
      fixture,
      providerSnapshotId: resultProviderSnapshotId,
      resultProviderSnapshotId,
    };
  }

  const providerStatistics = await provider.getFixtureStatistics({ providerFixtureId: input.providerFixtureId });
  const statistics: FixtureStatistics = {
    fixtureId: input.fixtureId,
    ...(providerStatistics.cornersHome !== undefined && { cornersHome: providerStatistics.cornersHome }),
    ...(providerStatistics.cornersAway !== undefined && { cornersAway: providerStatistics.cornersAway }),
    capturedAt: providerStatistics.capturedAt,
    ...(providerStatistics.providerSnapshotId && { sourceSnapshotId: providerStatistics.providerSnapshotId }),
  };

  return {
    fixture,
    statistics,
    providerSnapshotId: providerStatistics.providerSnapshotId ?? resultProviderSnapshotId,
    resultProviderSnapshotId,
    statisticsProviderSnapshotId: providerStatistics.providerSnapshotId,
  };
}
