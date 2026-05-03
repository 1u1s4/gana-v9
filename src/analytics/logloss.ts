export function logLoss(items: Array<{ probability: number; outcome: 0 | 1 }>): number {
  if (!items.length) return 0;
  return items.reduce((sum, item) => {
    const p = Math.max(1e-15, Math.min(1 - 1e-15, item.probability));
    return sum - (item.outcome ? Math.log(p) : Math.log(1 - p));
  }, 0) / items.length;
}
