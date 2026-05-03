export function requiresLineupConfirmation(market: string): boolean {
  return ['goals_over_under', 'btts', 'player_prop', 'ratings'].includes(market);
}

export function lineupGate(input: { market: string; kickoffAt: string; lineupConfirmed: boolean; now?: Date }): string[] {
  const blockers: string[] = [];
  if (!requiresLineupConfirmation(input.market) || input.lineupConfirmed) return blockers;
  const minutesToKickoff = (Date.parse(input.kickoffAt) - (input.now ?? new Date()).getTime()) / 60_000;
  if (minutesToKickoff < 90) blockers.push('lineup-pending');
  return blockers;
}
