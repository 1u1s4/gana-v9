import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRecommendationArtifactTargets } from '../recommendations/artifact.js';
import type { StoragePrismaClient } from '../storage/types.js';
import {
  PUBLIC_RECOMMENDATIONS_CONTRACT_VERSION,
  type PublicAtomicPredictionRecommendation,
  type PublicFixtureSummary,
  type PublicParlayRecommendation,
  type PublicRecommendationLeg,
  type PublicRecommendationsDailySummary,
  type PublicRecommendationsOptions,
  type PublicRecommendationsRequest,
  type PublicRecommendationsResponse,
  type PublicRecommendationsSource,
  type PublicRequiredLeagueGeneralPrediction,
  type PublicRequiredLeagueParlayApproach,
  type PublicRequiredLeagueProjection,
  type PublicRequiredLeagueSummary,
  type PublicStakeRecommendation,
} from './types.js';

export type PublicRecommendationsDb = Pick<
  StoragePrismaClient,
  'harnessRun' | 'prediction' | 'parlay' | 'publicRecommendationPublication'
>;

type JsonRecord = Record<string, unknown>;

const DISCLAIMER = '+18 only. No guaranteed profit. Bet responsibly.';
const RECOMMENDATIONS_ARTIFACT = 'daily-parlay-recommendations.json';
const REQUIRED_LEAGUE_ARTIFACT = 'daily-required-league-recommendations.json';
const DAILY_BATCH_WHERE = {
  OR: [
    { id: { startsWith: 'daily-' } },
    { metadata: { path: '$.dailyRole', equals: 'batch' } },
  ],
};

export async function readPublicRecommendations(
  db: PublicRecommendationsDb,
  request: PublicRecommendationsRequest = {},
  options: PublicRecommendationsOptions,
): Promise<PublicRecommendationsResponse> {
  const generatedAt = (request.now ?? new Date()).toISOString();
  const warnings: string[] = [];
  const timezone = normalizeTimezone(request.timezone, options.defaultTimezone, warnings);
  const date = normalizeDate(request.date, timezone, request.now ?? new Date());

  const dailyRun = await findDailyRunForDate(db, date);
  const latestRun = dailyRun ? dailyRun : await findLatestDailyRun(db);
  const latestMetadata = toRecord(toRecord(latestRun).metadata);
  const exactMetadata = toRecord(toRecord(dailyRun).metadata);
  const artifactPath = dailyRun ? recommendationArtifactPath(dailyRun, exactMetadata) : null;
  const artifactPayload = artifactPath ? readJsonArtifact(artifactPath, warnings) : null;
  const artifactRecord = toRecord(artifactPayload);
  const recommendations = publicRecommendationsFromSources(exactMetadata, artifactRecord);
  const requiredLeagueArtifactPath = dailyRun ? requiredLeagueArtifactPathFor(dailyRun, exactMetadata) : null;
  const requiredLeagueArtifactPayload = requiredLeagueArtifactPath ? readJsonArtifact(requiredLeagueArtifactPath, warnings) : null;
  const requiredLeagueArtifactRecord = toRecord(requiredLeagueArtifactPayload);
  const requiredLeagueTargets = artifactPath ? readRequiredLeagueTargets(artifactPath, warnings) : [];
  const ids = collectRecommendationIds(recommendations);
  const [predictionRows, parlayRows, publicationRows] = await Promise.all([
    ids.predictionIds.length ? db.prediction.findMany(predictionsQuery(ids.predictionIds)) : Promise.resolve([]),
    ids.parlayIds.length ? db.parlay.findMany(parlaysQuery(ids.parlayIds)) : Promise.resolve([]),
    dailyRun
      ? db.publicRecommendationPublication.findMany(publicationRowsQuery(toNullableString(toRecord(dailyRun).id)))
      : Promise.resolve([]),
  ]);
  const predictionById = new Map(predictionRows.map((row) => [toStringValue(toRecord(row).id), row]));
  const parlayById = new Map(parlayRows.map((row) => [toStringValue(toRecord(row).id), row]));

  const parlays = recommendations
    .filter((recommendation) => stringValue(toRecord(recommendation).kind) === 'parlay')
    .map((recommendation, index) => mapParlayRecommendation(recommendation, index, dailyRun, parlayById, predictionById, warnings))
    .filter((recommendation): recommendation is PublicParlayRecommendation => Boolean(recommendation));
  const atomicPredictions = recommendations
    .filter((recommendation) => stringValue(toRecord(recommendation).kind) === 'atomic-prediction')
    .map((recommendation, index) => mapAtomicPredictionRecommendation(recommendation, index, dailyRun, predictionById, warnings))
    .filter((recommendation): recommendation is PublicAtomicPredictionRecommendation => Boolean(recommendation));
  const requiredLeagueGeneralPredictions = requiredLeagueTargets.map((selection) =>
    mapRequiredLeagueGeneralPrediction(selection, dailyRun, predictionById),
  );
  const requiredLeague = mapRequiredLeagueSummary(exactMetadata, artifactRecord, requiredLeagueArtifactRecord, predictionById);

  const staleReasons = staleReasonsFor(date, dailyRun, recommendations, parlays, atomicPredictions, requiredLeagueGeneralPredictions);
  const source = mapSource({
    dailyRun,
    dailyMetadata: exactMetadata,
    latestMetadata,
    artifactPath,
    requiredLeagueArtifactPath,
    recommendations,
    publicationRows,
  });
  const dailySummary = mapDailySummary({
    stale: staleReasons.length > 0,
    metadata: exactMetadata,
    parlays,
    atomicPredictions,
    requiredLeagueGeneralPredictions,
  });

  return {
    contractVersion: PUBLIC_RECOMMENDATIONS_CONTRACT_VERSION,
    generatedAt,
    date,
    timezone,
    stale: staleReasons.length > 0,
    staleReasons,
    disclaimer: {
      age: '+18',
      noGuaranteedProfit: true,
      message: DISCLAIMER,
    },
    source,
    dailySummary,
    parlays,
    atomicPredictions,
    requiredLeagueGeneralPredictions,
    requiredLeague,
    warnings,
  };
}

function findDailyRunForDate(db: PublicRecommendationsDb, date: string): Promise<unknown | null> {
  return db.harnessRun.findFirst({
    where: {
      AND: [
        DAILY_BATCH_WHERE,
        { metadata: { path: '$.date', equals: date } },
      ],
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

function findLatestDailyRun(db: PublicRecommendationsDb): Promise<unknown | null> {
  return db.harnessRun.findFirst({
    where: DAILY_BATCH_WHERE,
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

function predictionsQuery(ids: string[]) {
  return {
    where: { id: { in: ids } },
    include: {
      fixture: {
        include: {
          competition: true,
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
  };
}

function parlaysQuery(ids: string[]) {
  return {
    where: { id: { in: ids } },
    include: {
      legs: {
        orderBy: { legIndex: 'asc' },
        include: {
          fixture: {
            include: {
              competition: true,
              homeTeam: true,
              awayTeam: true,
            },
          },
          prediction: true,
        },
      },
    },
  };
}

function publicationRowsQuery(dailyBatchId: string | null) {
  return {
    where: {
      dailyBatchId: dailyBatchId ?? '',
      channel: 'discord',
      target: 'recommendations',
      status: 'published',
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
  };
}

function publicRecommendationsFromSources(metadata: JsonRecord, artifact: JsonRecord): unknown[] {
  const artifactRecommendations = toArray(artifact.recommendations);
  if (artifactRecommendations.length) return artifactRecommendations;
  const metadataRecommendations = toArray(metadata.recommendations);
  if (metadataRecommendations.length) return metadataRecommendations;
  return toArray(toRecord(metadata.parlayAnalysis).top)
    .map((recommendation) => ({
      kind: 'parlay',
      ...toRecord(recommendation),
    }));
}

function collectRecommendationIds(recommendations: unknown[]): { predictionIds: string[]; parlayIds: string[] } {
  const predictionIds = new Set<string>();
  const parlayIds = new Set<string>();

  for (const value of recommendations) {
    const recommendation = toRecord(value);
    const kind = stringValue(recommendation.kind);
    const parlayId = stringValue(recommendation.parlayId);
    if (kind === 'parlay' && parlayId && !isSyntheticRecommendationId(parlayId)) parlayIds.add(parlayId);
    for (const id of stringArray(recommendation.predictionIds)) predictionIds.add(id);
    const predictionId = stringValue(recommendation.predictionId);
    if (predictionId && !isSyntheticRecommendationId(predictionId)) predictionIds.add(predictionId);
    for (const leg of toArray(recommendation.legs)) {
      const legPredictionId = stringValue(toRecord(leg).predictionId);
      if (legPredictionId && !isSyntheticRecommendationId(legPredictionId)) predictionIds.add(legPredictionId);
    }
  }

  return {
    predictionIds: [...predictionIds],
    parlayIds: [...parlayIds],
  };
}

function mapParlayRecommendation(
  value: unknown,
  index: number,
  dailyRun: unknown | null,
  parlayById: Map<string, unknown>,
  predictionById: Map<string, unknown>,
  warnings: string[],
): PublicParlayRecommendation | null {
  const recommendation = toRecord(value);
  const parlayId = stringValue(recommendation.parlayId);
  if (!parlayId) return null;

  const parlay = parlayById.get(parlayId);
  const persisted = Boolean(parlay);
  const dbStatus = toNullableString(toRecord(parlay).status);
  const recommendationLegs = toArray(recommendation.legs);
  const rowLegs = toArray(toRecord(parlay).legs);
  const legs = (rowLegs.length ? rowLegs : recommendationLegs)
    .map((leg) => mapLeg(leg, predictionById))
    .filter((leg): leg is PublicRecommendationLeg => Boolean(leg));

  if (!persisted && !legs.length) {
    warnings.push(`Skipped parlay recommendation ${parlayId}: no persisted parlay row or persisted prediction legs were found.`);
    return null;
  }
  if (!persisted) {
    warnings.push(`Parlay recommendation ${parlayId} is artifact-only; every public leg is still hydrated from persisted predictions when available.`);
  }

  return {
    kind: 'parlay',
    parlayId,
    rank: integerValue(recommendation.rank) ?? index + 1,
    profile: toNullableString(recommendation.profile),
    status: toNullableString(recommendation.harnessStatus)
      ?? toNullableString(recommendation.validationStatus)
      ?? dbStatus
      ?? 'review-required',
    dbStatus,
    odds: firstNumber([recommendation.combinedOdds, toRecord(parlay).combinedOdds]),
    confidence: firstNumber([recommendation.aggregateConfidence, toRecord(parlay).aggregateConfidence]),
    edge: numberOrNull(recommendation.expectedEdge),
    stake: mapStake(recommendation),
    generatedAt: toDateString(toRecord(parlay).generatedAt) ?? toDateString(toRecord(dailyRun).completedAt),
    source: {
      kind: persisted ? 'db+artifact' : 'artifact',
      persisted,
      dailyBatchId: toNullableString(toRecord(dailyRun).id),
      sourceRunIds: sourceRunIds(recommendation, parlay),
    },
    legs,
    riskFlags: stringArray(recommendation.riskFlags),
  };
}

function mapAtomicPredictionRecommendation(
  value: unknown,
  index: number,
  dailyRun: unknown | null,
  predictionById: Map<string, unknown>,
  warnings: string[],
): PublicAtomicPredictionRecommendation | null {
  const recommendation = toRecord(value);
  const predictionId = stringValue(recommendation.predictionId)
    ?? stringValue(toRecord(toArray(recommendation.legs)[0]).predictionId);
  if (!predictionId) return null;
  const prediction = predictionById.get(predictionId);
  if (!prediction) {
    warnings.push(`Skipped atomic recommendation ${predictionId}: no persisted prediction row was found.`);
    return null;
  }

  const leg = toRecord(toArray(recommendation.legs)[0]);
  const row = toRecord(prediction);
  const fixture = mapFixture(row.fixture, toRecord(leg.display), leg.fixture);
  return {
    kind: 'atomic-prediction',
    predictionId,
    rank: integerValue(recommendation.rank) ?? index + 1,
    profile: toNullableString(recommendation.profile),
    status: toNullableString(recommendation.harnessStatus)
      ?? toNullableString(recommendation.validationStatus)
      ?? toStringValue(row.status)
      ?? 'review-required',
    dbStatus: toNullableString(row.status),
    odds: firstNumber([row.odds, recommendation.combinedOdds, leg.odds]),
    confidence: firstNumber([recommendation.displayConfidence, row.confidence, recommendation.aggregateConfidence]),
    edge: firstNumber([row.edge, recommendation.expectedEdge]),
    stake: mapStake(recommendation),
    generatedAt: toDateString(row.generatedAt) ?? toDateString(toRecord(dailyRun).completedAt),
    source: {
      kind: 'db+artifact',
      persisted: true,
      dailyBatchId: toNullableString(toRecord(dailyRun).id),
      sourceRunIds: uniqueStrings([
        ...stringArray(recommendation.sourceRunIds),
        ...[toNullableString(recommendation.sourceRunId), toNullableString(row.runId)].filter((item): item is string => Boolean(item)),
      ]),
    },
    fixture,
    market: toStringValue(row.marketKey) || toStringValue(leg.market),
    selection: toStringValue(row.selectionKey) || toStringValue(leg.selection),
    line: firstNumber([row.line, leg.line]),
  };
}

function mapLeg(value: unknown, predictionById: Map<string, unknown>): PublicRecommendationLeg | null {
  const leg = toRecord(value);
  const predictionId = stringValue(leg.predictionId);
  const prediction = predictionId ? predictionById.get(predictionId) : null;
  const predictionRow = Object.keys(toRecord(prediction)).length ? toRecord(prediction) : toRecord(leg.prediction);
  const fixtureRaw = leg.fixture && typeof leg.fixture === 'object' ? leg.fixture : predictionRow.fixture ?? leg.fixture;
  const fixture = mapFixture(fixtureRaw, toRecord(leg.display), leg.fixture);
  const market = toStringValue(predictionRow.marketKey) || toStringValue(leg.market) || toStringValue(leg.marketKey);
  const selection = toStringValue(predictionRow.selectionKey) || toStringValue(leg.selection) || toStringValue(leg.selectionKey);
  if (!predictionId && !market && !selection) return null;

  return {
    predictionId: predictionId ?? null,
    fixture,
    market,
    selection,
    line: firstNumber([predictionRow.line, leg.line]),
    odds: firstNumber([predictionRow.odds, leg.odds]),
    confidence: firstNumber([leg.confidence, predictionRow.confidence]),
    edge: numberOrNull(predictionRow.edge),
    status: toNullableString(predictionRow.status) ?? toNullableString(leg.validationStatus) ?? toNullableString(leg.status),
    banker: Boolean(leg.banker),
  };
}

function mapRequiredLeagueGeneralPrediction(
  selection: {
    artifactSelectionId: string;
    source: string;
    fixtureId: string;
    providerFixtureId?: string;
    fixture?: string;
    display?: Record<string, unknown>;
    market: string;
    selection: string;
    line?: number | null;
    odds?: number | null;
    confidence?: number | null;
    expectedEdge?: number | null;
    status?: string;
  },
  dailyRun: unknown | null,
  predictionById: Map<string, unknown>,
): PublicRequiredLeagueGeneralPrediction {
  const prediction = predictionById.get(selection.fixtureId);
  return {
    kind: 'required-league-general',
    id: selection.artifactSelectionId,
    source: selection.source,
    fixture: mapFixture(toRecord(prediction).fixture, selection.display, selection.fixture ?? selection.providerFixtureId ?? selection.fixtureId, {
      id: selection.fixtureId,
      providerFixtureId: selection.providerFixtureId ?? null,
    }),
    market: selection.market,
    selection: selection.selection,
    line: selection.line ?? null,
    odds: selection.odds ?? null,
    confidence: selection.confidence ?? null,
    edge: selection.expectedEdge ?? null,
    status: selection.status ?? 'review-required',
    generatedAt: toDateString(toRecord(dailyRun).completedAt),
  };
}

function mapRequiredLeagueSummary(
  metadata: JsonRecord,
  artifact: JsonRecord,
  requiredLeagueArtifact: JsonRecord,
  predictionById: Map<string, unknown>,
): PublicRequiredLeagueSummary {
  const coverage = toRecord(metadata.requiredLeagueCoverage ?? artifact.requiredLeagueCoverage ?? requiredLeagueArtifact.coverage);
  const goalCheck = toRecord(metadata.requiredLeagueGoalCheck ?? artifact.requiredLeagueGoalCheck ?? requiredLeagueArtifact.goalCheck);
  const requiredLeague = toRecord(artifact.requiredLeagueRecommendations);
  const atomicProjections = toArray(
    requiredLeague.atomicProjections
      ?? requiredLeagueArtifact.atomicProjections
      ?? artifact.requiredLeagueAtomicProjections
      ?? metadata.requiredLeagueAtomicProjections,
  ).map((projection, index) => mapRequiredLeagueProjection(projection, index, predictionById));
  const selectedParlayApproaches = toArray(
    requiredLeague.parlayProjections
      ?? requiredLeagueArtifact.parlayProjections
      ?? artifact.requiredLeagueParlayProjections
      ?? metadata.requiredLeagueParlayProjections,
  )
    .filter((approach) => toNullableString(toRecord(approach).status) === 'selected')
    .map((approach, index) => mapRequiredLeagueParlayApproach(approach, index, predictionById));

  return {
    goalStatus: toNullableString(goalCheck.status),
    fixtureCount: integerValue(coverage.fixtureCount),
    missingPredictionFixtures: integerValue(coverage.missingPredictionFixtures),
    atomicProjections,
    selectedParlayApproaches,
  };
}

function mapRequiredLeagueProjection(
  value: unknown,
  index: number,
  predictionById: Map<string, unknown>,
): PublicRequiredLeagueProjection {
  const projection = toRecord(value);
  const predictionId = stringValue(projection.predictionId);
  const prediction = predictionId ? predictionById.get(predictionId) : null;
  const leg = toRecord(toArray(projection.legs)[0]);
  return {
    id: predictionId ?? stringValue(projection.id) ?? `required-league-atomic-${index + 1}`,
    fixture: mapFixture(toRecord(prediction).fixture, toRecord(projection.display), projection.fixture ?? leg.fixture),
    market: toStringValue(projection.market) || toStringValue(leg.market),
    selection: toStringValue(projection.selection) || toStringValue(leg.selection),
    line: firstNumber([projection.line, leg.line]),
    odds: firstNumber([projection.odds, leg.odds]),
    confidence: firstNumber([projection.confidence, projection.displayConfidence, leg.confidence]),
    edge: numberOrNull(projection.expectedEdge),
    status: toNullableString(projection.status) ?? 'review-required',
  };
}

function mapRequiredLeagueParlayApproach(
  value: unknown,
  index: number,
  predictionById: Map<string, unknown>,
): PublicRequiredLeagueParlayApproach {
  const approach = toRecord(value);
  const legs = toArray(approach.legs)
    .map((leg) => mapLeg(leg, predictionById))
    .filter((leg): leg is PublicRecommendationLeg => Boolean(leg));
  return {
    id: stringValue(approach.parlayId) ?? stringValue(approach.id) ?? `required-league-parlay-${index + 1}`,
    status: toNullableString(approach.status) ?? 'selected',
    profile: toNullableString(approach.profile),
    odds: numberOrNull(approach.combinedOdds),
    confidence: numberOrNull(approach.aggregateConfidence),
    edge: numberOrNull(approach.expectedEdge),
    legs,
  };
}

function mapFixture(
  raw: unknown,
  display: Record<string, unknown> = {},
  fallbackLabel?: unknown,
  fallbackIds: { id?: string | null; providerFixtureId?: string | null } = {},
): PublicFixtureSummary {
  const fixture = toRecord(raw);
  const competition = toRecord(fixture.competition);
  const homeTeam = toRecord(fixture.homeTeam);
  const awayTeam = toRecord(fixture.awayTeam);
  const home = toNullableString(homeTeam.name) ?? toNullableString(display.homeTeamName);
  const away = toNullableString(awayTeam.name) ?? toNullableString(display.awayTeamName);
  const label = toNullableString(display.fixtureLabel)
    ?? (home && away ? `${home} vs ${away}` : null)
    ?? toNullableString(fallbackLabel);

  return {
    id: toNullableString(fixture.id) ?? fallbackIds.id ?? null,
    providerFixtureId: toNullableString(fixture.providerFixtureId) ?? fallbackIds.providerFixtureId ?? null,
    label,
    league: toNullableString(competition.name) ?? toNullableString(display.leagueName),
    homeTeam: home,
    awayTeam: away,
    kickoff: toDateString(fixture.scheduledAt),
    kickoffLocal: toNullableString(display.kickoffLocal),
    status: toNullableString(fixture.status),
  };
}

function mapStake(recommendation: JsonRecord): PublicStakeRecommendation | null {
  const stakeRecommendation = toRecord(recommendation.stakeRecommendation);
  if (Object.keys(stakeRecommendation).length > 0) {
    return {
      units: numberOrNull(stakeRecommendation.stake),
      percentOfBankroll: numberOrNull(stakeRecommendation.percentOfBankroll),
      label: toNullableString(stakeRecommendation.unitLabel) ?? 'percent-of-bankroll',
      policy: toNullableString(stakeRecommendation.policy),
    };
  }

  const exposure = toRecord(recommendation.exposure);
  if (Object.keys(exposure).length > 0) {
    return {
      units: numberOrNull(exposure.units),
      percentOfBankroll: numberOrNull(exposure.percentOfAnalyticalBankroll),
      label: 'analytical-units',
      policy: toNullableString(exposure.policy),
    };
  }

  const legacyStake = toRecord(recommendation.stake);
  if (Object.keys(legacyStake).length > 0) {
    return {
      units: numberOrNull(legacyStake.units),
      percentOfBankroll: numberOrNull(legacyStake.percentOfBankroll),
      label: 'analytical-units',
      policy: toNullableString(legacyStake.policy),
    };
  }

  return null;
}

function mapSource(input: {
  dailyRun: unknown | null;
  dailyMetadata: JsonRecord;
  latestMetadata: JsonRecord;
  artifactPath: string | null;
  requiredLeagueArtifactPath: string | null;
  recommendations: unknown[];
  publicationRows: unknown[];
}): PublicRecommendationsSource {
  const run = toRecord(input.dailyRun);
  const analyticalArtifactOnly = booleanValue(input.dailyMetadata.analyticalArtifactOnly) ?? false;
  return {
    dailyBatchId: toNullableString(run.id),
    runId: toNullableString(run.id),
    sourceRunIds: uniqueStrings(input.recommendations.flatMap((recommendation) => {
      const item = toRecord(recommendation);
      return [...stringArray(item.sourceRunIds), toNullableString(item.sourceRunId)].filter((id): id is string => Boolean(id));
    })),
    status: toNullableString(run.status),
    verdict: toNullableString(run.verdict),
    generatedAt: toDateString(run.completedAt) ?? toDateString(run.createdAt),
    artifactPath: input.artifactPath,
    requiredLeagueArtifactPath: input.requiredLeagueArtifactPath,
    latestAvailableDate: toNullableString(input.latestMetadata.date),
    analyticalArtifactOnly,
    publicationLedger: mapPublicationLedger(input.publicationRows, {
      analyticalArtifactOnly,
      hasDailyRun: Boolean(input.dailyRun),
    }),
  };
}

function mapPublicationLedger(
  rows: unknown[],
  context: { analyticalArtifactOnly: boolean; hasDailyRun: boolean },
): PublicRecommendationsSource['publicationLedger'] {
  const proposedTable = 'public_recommendation_publications';
  if (rows.length > 0) {
    const latest = rows.map(toRecord).sort((a, b) => {
      const bTime = Date.parse(toDateString(b.publishedAt) ?? '') || 0;
      const aTime = Date.parse(toDateString(a.publishedAt) ?? '') || 0;
      return bTime - aTime;
    })[0];

    return {
      status: 'persisted',
      migrationRequired: false,
      proposedTable,
      publicationCount: rows.length,
      publishedAt: toDateString(latest.publishedAt),
      channel: toNullableString(latest.channel),
      discordTarget: toNullableString(latest.discordTarget),
      discordMessageIds: publicationMessageIds(rows),
      payloadPath: toNullableString(latest.payloadPath),
      payloadSha256: toNullableString(latest.payloadSha256),
      predictionIds: uniqueStrings(rows.map((row) => toNullableString(toRecord(row).predictionId)).filter((id): id is string => Boolean(id))),
      parlayIds: uniqueStrings(rows.map((row) => toNullableString(toRecord(row).parlayId)).filter((id): id is string => Boolean(id))),
      note: 'Discord publication targets are persisted in the public recommendation publication ledger.',
    };
  }

  return {
    status: context.analyticalArtifactOnly ? 'artifact-only' : context.hasDailyRun ? 'missing' : 'missing',
    migrationRequired: true,
    proposedTable,
    publicationCount: 0,
    publishedAt: null,
    channel: null,
    discordTarget: null,
    discordMessageIds: [],
    payloadPath: null,
    payloadSha256: null,
    predictionIds: [],
    parlayIds: [],
    note: 'Current daily Discord/publication flow writes recommendation artifacts but has no persisted public publication ledger rows for this batch.',
  };
}

function publicationMessageIds(rows: unknown[]): string[] {
  return uniqueStrings(rows.flatMap((row) => {
    const item = toRecord(row);
    return [
      toNullableString(item.discordMessageId),
      ...toArray(item.discordMessageIds).map((value) => toNullableString(value)),
    ].filter((id): id is string => Boolean(id));
  }));
}

function mapDailySummary(input: {
  stale: boolean;
  metadata: JsonRecord;
  parlays: PublicParlayRecommendation[];
  atomicPredictions: PublicAtomicPredictionRecommendation[];
  requiredLeagueGeneralPredictions: PublicRequiredLeagueGeneralPrediction[];
}): PublicRecommendationsDailySummary {
  const counts = toRecord(input.metadata.counts);
  const requiredLeagueCoverage = toRecord(input.metadata.requiredLeagueCoverage);
  const total = input.parlays.length + input.atomicPredictions.length + input.requiredLeagueGeneralPredictions.length;
  return {
    status: input.stale ? 'stale' : total > 0 ? 'available' : 'empty',
    total,
    parlays: input.parlays.length,
    atomicPredictions: input.atomicPredictions.length,
    requiredLeagueGeneralPredictions: input.requiredLeagueGeneralPredictions.length,
    requiredLeagueFixtures: integerValue(counts.requiredLeagueFixtures) ?? integerValue(requiredLeagueCoverage.fixtureCount),
    requiredLeagueMissingPredictionFixtures: integerValue(counts.requiredLeagueMissingPredictionFixtures)
      ?? integerValue(requiredLeagueCoverage.missingPredictionFixtures),
    providers: providersFromMetadata(input.metadata),
    models: modelsFromMetadata(input.metadata),
  };
}

function staleReasonsFor(
  date: string,
  dailyRun: unknown | null,
  recommendations: unknown[],
  parlays: PublicParlayRecommendation[],
  atomicPredictions: PublicAtomicPredictionRecommendation[],
  requiredLeagueGeneralPredictions: PublicRequiredLeagueGeneralPrediction[],
): string[] {
  const reasons: string[] = [];
  const metadata = toRecord(toRecord(dailyRun).metadata);
  if (!dailyRun) return ['no_daily_batch_for_date'];
  if (toNullableString(metadata.date) !== date) reasons.push('daily_batch_date_mismatch');
  const status = toNullableString(toRecord(dailyRun).status);
  if (status && status !== 'succeeded') reasons.push(`daily_batch_status_${status}`);
  if (recommendations.length === 0) reasons.push('empty_recommendation_artifact');
  if (parlays.length + atomicPredictions.length + requiredLeagueGeneralPredictions.length === 0) reasons.push('empty_public_recommendations');
  return reasons;
}

function recommendationArtifactPath(run: unknown, metadata: JsonRecord): string | null {
  const explicit = stringValue(metadata.recommendationsPath);
  if (explicit) return explicit;
  const artifactDir = stringValue(toRecord(run).artifactDir);
  return artifactDir ? join(artifactDir, RECOMMENDATIONS_ARTIFACT) : null;
}

function requiredLeagueArtifactPathFor(run: unknown, metadata: JsonRecord): string | null {
  const explicit = stringValue(metadata.requiredLeagueRecommendationsPath);
  if (explicit) return explicit;
  const artifactDir = stringValue(toRecord(run).artifactDir);
  return artifactDir ? join(artifactDir, REQUIRED_LEAGUE_ARTIFACT) : null;
}

function readJsonArtifact(path: string, warnings: string[]): unknown | null {
  if (!existsSync(path)) {
    warnings.push(`Recommendation artifact not found at ${path}. Falling back to persisted daily batch metadata.`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    warnings.push(`Recommendation artifact at ${path} could not be parsed: ${err instanceof Error ? err.message : String(err)}.`);
    return null;
  }
}

function readRequiredLeagueTargets(path: string, warnings: string[]) {
  if (!existsSync(path)) return [];
  try {
    return readRecommendationArtifactTargets(path).artifactSelections;
  } catch (err) {
    warnings.push(`Required league recommendations could not be extracted from ${path}: ${err instanceof Error ? err.message : String(err)}.`);
    return [];
  }
}

function sourceRunIds(recommendation: JsonRecord, parlay: unknown): string[] {
  return uniqueStrings([
    ...stringArray(recommendation.sourceRunIds),
    ...[
      toNullableString(recommendation.sourceRunId),
      toNullableString(toRecord(parlay).runId),
    ].filter((id): id is string => Boolean(id)),
  ]);
}

function providersFromMetadata(metadata: JsonRecord): string[] {
  const providers = toArray(metadata.providers).map((item) => toNullableString(toRecord(item).provider)).filter((item): item is string => Boolean(item));
  const sharedProviders = toArray(toRecord(metadata.sharedInputs).pairedProviders).map(String);
  return uniqueStrings([...providers, ...sharedProviders]);
}

function modelsFromMetadata(metadata: JsonRecord): string[] {
  const models = toArray(metadata.providers).map((item) => toNullableString(toRecord(item).model)).filter((item): item is string => Boolean(item));
  const providerModels = Object.values(toRecord(toRecord(metadata.sharedInputs).providerModels)).map(String);
  return uniqueStrings([...models, ...providerModels]);
}

function normalizeDate(date: string | undefined, timezone: string, now: Date): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (date) throw new Error('date must use YYYY-MM-DD');
  return dateInTimezone(now, timezone);
}

function normalizeTimezone(timezone: string | undefined, fallback: string, warnings: string[]): string {
  const candidate = timezone?.trim() || fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    warnings.push(`Invalid timezone "${candidate}", using ${fallback}.`);
    return fallback;
  }
}

function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
}

function isSyntheticRecommendationId(value: string): boolean {
  return value.startsWith('atomic-') || value.startsWith('analytical-fallback-') || value.startsWith('council-composed-');
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function integerValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const parsed = Number.parseFloat(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function toDateString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
