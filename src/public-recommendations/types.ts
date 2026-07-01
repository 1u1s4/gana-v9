export const PUBLIC_RECOMMENDATIONS_CONTRACT_VERSION = 'gana-v9.public-recommendations.v1' as const;

export type PublicRecommendationSourceKind = 'db' | 'artifact' | 'db+artifact';

export interface PublicRecommendationsRequest {
  date?: string;
  timezone?: string;
  now?: Date;
}

export interface PublicRecommendationsOptions {
  defaultTimezone: string;
}

export interface PublicRecommendationsResponse {
  contractVersion: typeof PUBLIC_RECOMMENDATIONS_CONTRACT_VERSION;
  generatedAt: string;
  date: string;
  timezone: string;
  stale: boolean;
  staleReasons: string[];
  disclaimer: {
    age: '+18';
    noGuaranteedProfit: true;
    message: string;
  };
  source: PublicRecommendationsSource;
  dailySummary: PublicRecommendationsDailySummary;
  parlays: PublicParlayRecommendation[];
  atomicPredictions: PublicAtomicPredictionRecommendation[];
  requiredLeagueGeneralPredictions: PublicRequiredLeagueGeneralPrediction[];
  requiredLeague: PublicRequiredLeagueSummary;
  warnings: string[];
}

export interface PublicRecommendationsSource {
  dailyBatchId: string | null;
  runId: string | null;
  sourceRunIds: string[];
  status: string | null;
  verdict: string | null;
  generatedAt: string | null;
  artifactPath: string | null;
  requiredLeagueArtifactPath: string | null;
  latestAvailableDate: string | null;
  analyticalArtifactOnly: boolean;
  publicationLedger: {
    status: 'artifact-only' | 'missing' | 'persisted';
    migrationRequired: boolean;
    proposedTable: string;
    publicationCount: number;
    publishedAt: string | null;
    channel: string | null;
    discordTarget: string | null;
    discordMessageIds: string[];
    payloadPath: string | null;
    payloadSha256: string | null;
    predictionIds: string[];
    parlayIds: string[];
    note: string;
  };
}

export interface PublicRecommendationsDailySummary {
  status: 'available' | 'empty' | 'stale';
  total: number;
  parlays: number;
  atomicPredictions: number;
  requiredLeagueGeneralPredictions: number;
  requiredLeagueFixtures: number | null;
  requiredLeagueMissingPredictionFixtures: number | null;
  providers: string[];
  models: string[];
}

export interface PublicFixtureSummary {
  id: string | null;
  providerFixtureId: string | null;
  label: string | null;
  league: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoff: string | null;
  kickoffLocal: string | null;
  status: string | null;
}

export interface PublicRecommendationLeg {
  predictionId: string | null;
  fixture: PublicFixtureSummary;
  market: string;
  selection: string;
  line: number | null;
  odds: number | null;
  confidence: number | null;
  edge: number | null;
  status: string | null;
  banker: boolean;
}

export interface PublicRecommendationBase {
  rank: number;
  profile: string | null;
  status: string;
  dbStatus: string | null;
  odds: number | null;
  confidence: number | null;
  edge: number | null;
  stake: PublicStakeRecommendation | null;
  generatedAt: string | null;
  source: {
    kind: PublicRecommendationSourceKind;
    persisted: boolean;
    dailyBatchId: string | null;
    sourceRunIds: string[];
  };
}

export interface PublicStakeRecommendation {
  units: number | null;
  percentOfBankroll: number | null;
  label: string;
  policy: string | null;
}

export interface PublicParlayRecommendation extends PublicRecommendationBase {
  kind: 'parlay';
  parlayId: string;
  legs: PublicRecommendationLeg[];
  riskFlags: string[];
}

export interface PublicAtomicPredictionRecommendation extends PublicRecommendationBase {
  kind: 'atomic-prediction';
  predictionId: string;
  fixture: PublicFixtureSummary;
  market: string;
  selection: string;
  line: number | null;
}

export interface PublicRequiredLeagueGeneralPrediction {
  kind: 'required-league-general';
  id: string;
  source: string;
  fixture: PublicFixtureSummary;
  market: string;
  selection: string;
  line: number | null;
  odds: number | null;
  confidence: number | null;
  edge: number | null;
  status: string;
  generatedAt: string | null;
}

export interface PublicRequiredLeagueSummary {
  goalStatus: string | null;
  fixtureCount: number | null;
  missingPredictionFixtures: number | null;
  atomicProjections: PublicRequiredLeagueProjection[];
  selectedParlayApproaches: PublicRequiredLeagueParlayApproach[];
}

export interface PublicRequiredLeagueProjection {
  id: string;
  fixture: PublicFixtureSummary;
  market: string;
  selection: string;
  line: number | null;
  odds: number | null;
  confidence: number | null;
  edge: number | null;
  status: string;
}

export interface PublicRequiredLeagueParlayApproach {
  id: string;
  status: string;
  profile: string | null;
  odds: number | null;
  confidence: number | null;
  edge: number | null;
  legs: PublicRecommendationLeg[];
}
