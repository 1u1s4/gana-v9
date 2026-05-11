export const MARKET_KEYS = [
  'h2h',
  'double_chance',
  'goals_over_under',
  'corners_over_under',
  'btts',
] as const;

export type MarketKey = typeof MARKET_KEYS[number];

export type H2HSelection = 'home' | 'draw' | 'away';
export type DoubleChanceSelection = 'home_or_draw' | 'home_or_away' | 'draw_or_away';
export type OverUnderSelection = 'over' | 'under';
export type BttsSelection = 'yes' | 'no';

export type MarketSelectionValue =
  | H2HSelection
  | DoubleChanceSelection
  | OverUnderSelection
  | BttsSelection;

export interface MarketSelection {
  market: MarketKey;
  selection: string;
  line?: number;
  odds: number;
  impliedProbability: number;
  sourceSnapshotId: string;
}

export const DEFAULT_MARKETS: MarketKey[] = [...MARKET_KEYS];

export const MARKET_SELECTIONS = {
  h2h: ['home', 'draw', 'away'],
  double_chance: ['home_or_draw', 'home_or_away', 'draw_or_away'],
  goals_over_under: ['over', 'under'],
  corners_over_under: ['over', 'under'],
  btts: ['yes', 'no'],
} as const satisfies Record<MarketKey, readonly string[]>;

export function isMarketKey(value: unknown): value is MarketKey {
  return typeof value === 'string' && MARKET_KEYS.includes(value as MarketKey);
}

export function normalizeMarketScope(markets: readonly unknown[] | undefined, fallback: readonly MarketKey[] = DEFAULT_MARKETS): MarketKey[] {
  const values = (markets ?? []).filter(isMarketKey);
  const unique = [...new Set(values)];
  return unique.length ? unique : [...fallback];
}

export function getMarketSelections(market: MarketKey): readonly string[] {
  return MARKET_SELECTIONS[market];
}

export function isValidMarketSelection(market: MarketKey, selection: string): boolean {
  return getMarketSelections(market).includes(selection);
}

export function isOverUnderMarket(market: MarketKey): boolean {
  return market === 'goals_over_under' || market === 'corners_over_under';
}

export function marketRequiresLine(market: MarketKey): boolean {
  return isOverUnderMarket(market);
}

export function marketFamily(market: MarketKey | string): 'winner' | 'totals' | 'team-scoring' | 'unknown' {
  if (market === 'h2h' || market === 'double_chance') return 'winner';
  if (market === 'goals_over_under' || market === 'corners_over_under') return 'totals';
  if (market === 'btts') return 'team-scoring';
  return 'unknown';
}
