export function lineMovementVelocity(open: number, now: number): number {
  if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(now)) return 0;
  return (now - open) / open;
}

export function movedAgainstPick(selection: 'back' | 'lay' | string, open: number, now: number, threshold = 0.08): boolean {
  const velocity = lineMovementVelocity(open, now);
  return selection === 'back' ? velocity < -threshold : Math.abs(velocity) > threshold;
}
