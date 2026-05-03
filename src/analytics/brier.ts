export function brierScore(items: Array<{ probability: number; outcome: 0 | 1 }>): number {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + (item.probability - item.outcome) ** 2, 0) / items.length;
}
