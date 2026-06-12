import type { ParlayAnalysisRecommendation } from '../parlay/analysis.js';
import type { PredictionRecordView } from '../prediction/types.js';
import type { AgentProvider } from '../providers/agentic/types.js';

export type DailyE2EProvider = Extract<AgentProvider, 'codex' | 'gemini'>;

export type DailyParlayProfile =
  | 'safe-consensus'
  | 'balanced'
  | 'aggressive-analytical'
  | 'low-variance'
  | 'high-conviction'
  | 'market-diverse'
  | 'parlay-oro'
  | 'parlay-diamante'
  | 'parlay-all-in'
  | 'parlay-refinado'
  | 'portfolio-v2';

export type DailyRecommendationSelectionMode = 'promotion-gate' | 'analytical-fallback';

interface DailyRecommendationSelectionMetadata {
  selectionMode?: DailyRecommendationSelectionMode;
  fallbackReasons?: string[];
  sourceRunIds?: string[];
}

export type DailyFinalRecommendation =
  | (ParlayAnalysisRecommendation & DailyRecommendationSelectionMetadata & { kind: 'parlay'; stakeRecommendation?: DailyStakeRecommendation })
  | (AtomicPredictionRecommendation & DailyRecommendationSelectionMetadata);

export interface DailyStakeRecommendation {
  stake: number;
  percentOfBankroll: number;
  unitLabel: 'percent-of-bankroll';
  allowedStakes: readonly number[];
  policy: 'bucketed-bankroll-percentage-confidence-edge-recommendation';
}

export interface AtomicPredictionCandidate {
  provider: DailyE2EProvider;
  model: string;
  runId: string;
  prediction: PredictionRecordView;
  fixture: string;
  display?: RecommendationLegDisplay;
  edge: number;
}

export interface RecommendationLegDisplay {
  fixtureLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName?: string;
  kickoffLocal?: string;
}
