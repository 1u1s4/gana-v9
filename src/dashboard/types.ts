import type { FixtureStatus } from '../storage/types.js';

export interface DashboardStatusOptions {
  fixtures: string[];
  predictions: string[];
  parlays: string[];
  validations: string[];
  runs: string[];
}

export type FixtureFilterDateWindow = {
  start: Date;
  end: Date;
};

export interface DashboardOverviewMetadata {
  entity: string;
  title: string;
  value?: string | number;
}

export interface DashboardRowMeta {
  id: string;
  kind: 'fixture' | 'prediction' | 'parlay' | 'validation' | 'run';
}

export interface DashboardCounts {
  fixtures: number;
  predictions: number;
  parlays: number;
  validations: number;
  runs: number;
}

export interface DashboardPagination {
  page: number;
  take: number;
  total: number;
  totalPages: number;
}

export interface DashboardSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DashboardOverviewRow {
  id: string;
}

export interface DashboardPredictionRow extends DashboardOverviewRow {
  id: string;
  runId: string | null;
  fixture: DashboardFixtureRow | null;
  marketKey: string;
  selectionKey: string;
  line: string | number | null;
  odds: string | number;
  impliedProbability: string | number;
  estimatedProbability: string | number | null;
  edge: string | number | null;
  confidence: string | number;
  quality: string;
  status: string;
  rationale: string;
  warnings: unknown;
  generatedAt: string;
  latestValidation: DashboardValidationRow | null;
}

export interface DashboardParlayRow extends DashboardOverviewRow {
  id: string;
  runId: string | null;
  combinedOdds: string | number | null;
  aggregateConfidence: string | number;
  aggregateQuality: string | number;
  status: string;
  rationale: string;
  warnings: unknown;
  generatedAt: string;
  latestValidation: DashboardValidationRow | null;
  legs: DashboardParlayLegRow[];
}

export interface DashboardParlayLegRow {
  id: string;
  legIndex: number;
  predictionId: string;
  fixture: DashboardFixtureRow | null;
  marketKey: string;
  selectionKey: string;
  line: string | number | null;
  odds: string | number;
  status: string;
  inclusionReason: string | null;
  predictionStatus: string | null;
  confidence: string | number | null;
  edge: string | number | null;
}

export interface DashboardValidationRow extends DashboardOverviewRow {
  id: string;
  runId: string | null;
  predictionId: string | null;
  parlayId: string | null;
  target: DashboardValidationTargetRow;
  fixture: DashboardFixtureRow | null;
  status: string;
  reason: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  outcome?: unknown;
  settlementRuleVersion: string;
}

export interface DashboardValidationTargetRow {
  kind: 'prediction' | 'parlay' | 'unknown';
  id: string | null;
  label: string;
  summary: string | null;
}

export interface DashboardRunRow extends DashboardOverviewRow {
  id: string;
  runtime: string;
  profile: string;
  providerSports: string;
  providerAgentic: string | null;
  model: string | null;
  status: string;
  verdict: string | null;
  artifactDir: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  taskCount?: number;
  artifactCount?: number;
  predictionCount?: number;
  parlayCount?: number;
  validationCount?: number;
  recentPredictions?: DashboardPredictionRow[];
  recentParlays?: DashboardParlayRow[];
  recentValidations?: DashboardValidationRow[];
}

export interface DashboardFixtureRow {
  id: string;
  providerFixtureId: string;
  season?: number | null;
  scheduledAt: string | null;
  status: FixtureStatus | string;
  scoreHome: number | null;
  scoreAway: number | null;
  competition: {
    id: string;
    name: string;
    country: string | null;
  } | null;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  predictionCount?: number;
  parlayLegCount?: number;
  validationCount?: number;
  latestPrediction?: Pick<
    DashboardPredictionRow,
    'id' | 'runId' | 'marketKey' | 'selectionKey' | 'line' | 'odds' | 'edge' | 'confidence' | 'quality' | 'status' | 'generatedAt'
  > | null;
  latestValidation?: Pick<
    DashboardValidationRow,
    'id' | 'runId' | 'predictionId' | 'parlayId' | 'status' | 'reason' | 'evaluatedAt' | 'createdAt' | 'target'
  > | null;
  recentPredictions?: Array<Pick<
    DashboardPredictionRow,
    'id' | 'runId' | 'marketKey' | 'selectionKey' | 'line' | 'odds' | 'edge' | 'confidence' | 'quality' | 'status' | 'generatedAt'
  >>;
  recentParlayLegs?: DashboardParlayLegRow[];
  recentValidations?: DashboardValidationRow[];
}

export interface DashboardOverviewResponse {
  config?: {
    timezone: string;
    artifactRoot?: string;
    providerSports: string;
    providerAgentic?: string | null;
    model?: string | null;
  };
  generatedAt: string;
  activeTab: string;
  page: number;
  take: number;
  sort: string;
  direction: 'asc' | 'desc';
  filters: {
    validationTarget?: 'all' | 'prediction' | 'parlay';
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    fixtureStatus?: string[];
    runId?: string;
    status: string[];
    market?: string;
    team?: string;
    competition?: string;
    minConfidence?: number;
    maxConfidence?: number;
    minEdge?: number;
    maxEdge?: number;
    quality: string[];
  };
  counts: DashboardCounts;
  pagination: DashboardPagination;
  statusFacets: Record<string, number>;
  fixtures: DashboardFixtureRow[];
  predictions: DashboardPredictionRow[];
  parlays: DashboardParlayRow[];
  validations: DashboardValidationRow[];
  runs: DashboardRunRow[];
}
