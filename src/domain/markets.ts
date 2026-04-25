export type MarketKey =
  | 'h2h'
  | 'double_chance'
  | 'goals_over_under'
  | 'corners_over_under'
  | 'btts';

export const DEFAULT_MARKETS: MarketKey[] = [
  'h2h',
  'double_chance',
  'goals_over_under',
  'corners_over_under',
  'btts',
];
