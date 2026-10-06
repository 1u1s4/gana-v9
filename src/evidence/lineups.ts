import type { Fixture } from '../domain/fixtures.js';
import type { FixtureLineups } from '../providers/sports/types.js';

/** A missing or partial response must never imply full team availability. */
export function verifiedLineups(lineups: FixtureLineups | undefined, fixture: Fixture) {
  if (!lineups || lineups.providerFixtureId !== fixture.providerFixtureId || lineups.teams.length !== 2) return undefined;
  const expected = [fixture.providerHomeTeamId, fixture.providerAwayTeamId];
  if (expected.some(id => !id || lineups.teams.filter(team => team.teamId === id).length !== 1)) return undefined;
  if (lineups.teams.some(team => {
    const knownIds = team.starting.map(player => player.id).filter(Boolean);
    const names = team.starting.map(player => player.name.trim().normalize('NFKC').toLocaleLowerCase());
    return team.starting.length !== 11 || new Set(knownIds).size !== knownIds.length
      || new Set(names).size !== 11 || names.some(name => !name)
      || knownIds.some(id => !/^[1-9]\d*$/.test(id));
  })) return undefined;
  const unresolvedPlayerIds = lineups.teams.reduce((count, team) => count + team.starting.filter(player => !player.id).length, 0);
  return { ...lineups, sourceId: `source_api_football_lineups_${fixture.providerFixtureId}`, status: 'provider-starting-XI' as const,
    unresolvedPlayerIds, warnings: unresolvedPlayerIds ? [`${unresolvedPlayerIds} starters lack provider player IDs; names are provider-reported, identity is not fully resolved.`] : [] };

}

export function lineupFingerprint(lineups: FixtureLineups | undefined, fixture: Fixture) {
  const verified = verifiedLineups(lineups, fixture);
  return verified ? verified.teams.map(team => [team.teamId, team.formation ?? null, team.starting.map(player => player.id ? `id:${player.id}` : `name:${player.name.trim().normalize('NFKC').toLocaleLowerCase()}`).sort()]).sort() : 'not-confirmed';
}
