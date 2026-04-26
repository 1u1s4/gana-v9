import type { AgentConfig, ApiFootballFilterConfig } from '../config.js';
import type { MarketKey } from '../domain/markets.js';
import type { FilterCombineMode, FixtureFilterQuery } from './types.js';

export interface ResolvedFilterConfig extends ApiFootballFilterConfig {
  date: string;
  threshold: number;
  markets: MarketKey[];
  combineMode: FilterCombineMode;
  useDefaultLeagues: boolean;
  useDefaultTeams: boolean;
}

export function resolveFilterConfig(
  config: Pick<AgentConfig, 'apiFootball'>,
  input: FixtureFilterQuery & {
    threshold?: number;
    markets?: MarketKey[];
  },
): ResolvedFilterConfig {
  return {
    ...config.apiFootball,
    date: input.date,
    threshold: input.threshold ?? config.apiFootball.lowOddsThreshold,
    markets: input.markets ?? config.apiFootball.defaultMarkets,
    combineMode: input.combineMode ?? 'OR',
    useDefaultLeagues: input.leaguesDefault === true,
    useDefaultTeams: input.teamsDefault === true,
  };
}

export function requireDatabaseUrl(config: Pick<AgentConfig, 'databaseUrl'>): void {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for persisted presets and low-odds scans.');
  }
}
