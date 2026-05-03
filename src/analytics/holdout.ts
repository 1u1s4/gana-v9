export function splitHoldout<T>(items: T[], holdoutRatio = 0.2): { train: T[]; holdout: T[] } {
  const boundary = Math.max(0, Math.floor(items.length * (1 - holdoutRatio)));
  return { train: items.slice(0, boundary), holdout: items.slice(boundary) };
}
