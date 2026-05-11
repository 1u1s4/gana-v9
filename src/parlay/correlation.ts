import type { MarketKey } from '../domain/markets.js';

const DEFAULT_CORRELATION: Record<string, number> = {
  'h2h:goals_over_under': 0.18,
  'double_chance:goals_over_under': 0.15,
  'btts:goals_over_under': 0.28,
};

export function marketCorrelation(a: MarketKey | string, b: MarketKey | string): number {
  if (a === b) return 0.35;
  return DEFAULT_CORRELATION[`${a}:${b}`] ?? DEFAULT_CORRELATION[`${b}:${a}`] ?? 0;
}

export function correlationPenalty(legs: Array<{ fixtureId: string; market: MarketKey | string }>): number {
  let penalty = 0;
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (legs[i].fixtureId === legs[j].fixtureId) penalty += marketCorrelation(legs[i].market, legs[j].market);
    }
  }
  return Math.min(0.75, penalty);
}

export function correlationBlockers(legs: Array<{
  fixtureId: string;
  market: MarketKey | string;
  selection?: string;
  line?: number;
}>): string[] {
  const blockers: string[] = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const left = legs[i];
      const right = legs[j];
      if (left.fixtureId !== right.fixtureId) continue;
      const pair = [left.market, right.market].sort().join(':');
      if (left.market === right.market) blockers.push(`same-fixture duplicate market: ${left.fixtureId}:${left.market}`);
      if (pair === 'btts:goals_over_under') blockers.push(`same-fixture btts/totals correlation: ${left.fixtureId}`);
      if (pair === 'goals_over_under:h2h') blockers.push(`same-fixture h2h/totals correlation: ${left.fixtureId}`);
      if (pair === 'double_chance:goals_over_under') blockers.push(`same-fixture double_chance/totals correlation: ${left.fixtureId}`);
    }
  }
  return [...new Set(blockers)];
}
