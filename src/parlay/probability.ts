/** Prefer the calibrated model estimate; raw model output is a legacy fallback.
 * Evidence confidence and bookmaker fair probability are never substitutes. */
export function modelProbabilityFor(input: { probability?: unknown; modelProbability?: unknown }): number | null {
  const value = input.probability ?? input.modelProbability;
  if (value === undefined || value === null || typeof value === 'boolean' || value === '') return null;
  try {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Independent-leg baseline; callers may apply only downward dependence adjustments. */
export function jointModelProbability(legs: readonly { probability?: unknown }[]): number | null {
  if (!legs.length) return null;
  let joint = 1;
  for (const leg of legs) {
    const probability = modelProbabilityFor(leg);
    if (probability === null) return null;
    joint *= probability;
  }
  return joint;
}
