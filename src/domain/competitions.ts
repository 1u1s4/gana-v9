import type { CompetitionId, SportsProvider } from './ids.js';

export interface Competition {
  id: CompetitionId;
  provider: SportsProvider;
  providerCompetitionId: string;
  leagueId?: number;
  name?: string;
  country?: string;
  season?: number;
  createdAt: string;
  updatedAt: string;
}
