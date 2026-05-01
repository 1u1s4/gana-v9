export interface ApiFootballLeagueRef {
  providerLeagueId: string;
  name?: string;
  country?: string;
}

export interface ApiFootballTeamRef {
  providerTeamId: string;
  name?: string;
  leagueId?: string;
  country?: string;
}

export type FilterCombineMode = 'OR' | 'AND';

export type FilterReason =
  | 'included-by-default-league'
  | 'included-by-default-team'
  | 'included-by-low-odds-threshold'
  | 'included-by-manual-query'
  | 'excluded-missing-odds'
  | 'excluded-market-not-available'
  | 'excluded-above-threshold'
  | 'excluded-outside-window'
  | 'excluded-provider-rate-limit'
  | 'excluded-max-fixtures-reached';

export interface FixtureFilterQuery {
  date: string;
  leaguesDefault?: boolean;
  teamsDefault?: boolean;
  combineMode?: FilterCombineMode;
}

export interface FixtureFilterEvaluation {
  fixtureId: string;
  providerFixtureId: string;
  includedReasons: FilterReason[];
  excludedReasons: FilterReason[];
  eligible: boolean;
}

export interface RequestedLeaguePresetView {
  providerCompetitionId: string;
  name?: string;
  country?: string | null;
  season?: number | null;
}

export interface RequestedTeamPresetView {
  providerTeamId: string;
  name?: string;
  country?: string | null;
  providerLeagueId?: string | null;
}

export interface LowOddsHitView {
  fixtureId: string;
  providerFixtureId: string;
  market: string;
  selection: string;
  line?: number;
  odds: number;
  impliedProbability: number;
  bookmaker?: string;
  oddsQuoteId?: string;
  includedReasons: FilterReason[];
  excludedReasons: FilterReason[];
}

export interface LowOddsScanView {
  scanId?: string;
  date: string;
  threshold: number;
  fixtureCount: number;
  hitCount: number;
  hits: LowOddsHitView[];
  fixtureEvaluations: FixtureFilterEvaluation[];
  requestedLeagues?: RequestedLeaguePresetView[];
  requestedTeams?: RequestedTeamPresetView[];
}
