import type { CompetitionId, FixtureId, SportsProvider, TeamId } from './ids.js';

export type FixtureStatus = 'scheduled' | 'live' | 'completed' | 'cancelled' | 'unknown';

export interface Fixture {
  id: FixtureId;
  provider: SportsProvider;
  providerFixtureId: string;
  competitionId?: CompetitionId;
  leagueId?: number;
  season?: number;
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  homeTeamName?: string;
  awayTeamName?: string;
  scheduledAt: string;
  status: FixtureStatus;
  scoreHome?: number;
  scoreAway?: number;
  includedByFilters: string[];
  providerSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export type FixtureWithFinalScore = Fixture & {
  scoreHome: number;
  scoreAway: number;
};

export function isCompletedFixture(fixture: Fixture): boolean {
  return fixture.status === 'completed';
}

export function isPendingFixtureStatus(status: FixtureStatus): boolean {
  return status === 'scheduled' || status === 'live';
}

export function hasFinalScore(fixture: Fixture): fixture is FixtureWithFinalScore {
  return Number.isFinite(fixture.scoreHome) && Number.isFinite(fixture.scoreAway);
}

export function getTotalGoals(fixture: FixtureWithFinalScore): number {
  return fixture.scoreHome + fixture.scoreAway;
}
