import { brierScore } from './brier.js';
import { logLoss } from './logloss.js';

export interface LeaderboardEntry {
  promptVersion: string;
  modelId: string;
  market: string;
  league: string;
  brier: number;
  logloss: number;
  clvPct?: number;
  hitrate: number;
  n: number;
  lowSample: boolean;
}

export function buildLeaderboard(items: Array<{
  promptVersion: string;
  modelId: string;
  market: string;
  league: string;
  probability: number;
  outcome: 0 | 1;
  clvPct?: number;
}>): LeaderboardEntry[] {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = [item.promptVersion, item.modelId, item.market, item.league].join('|');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [promptVersion, modelId, market, league] = key.split('|');
    return {
      promptVersion,
      modelId,
      market,
      league,
      brier: brierScore(rows),
      logloss: logLoss(rows),
      clvPct: average(rows.map((row) => row.clvPct).filter((value): value is number => value !== undefined)),
      hitrate: average(rows.map((row) => row.outcome)),
      n: rows.length,
      lowSample: rows.length < 30,
    };
  });
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
