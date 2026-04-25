import type { SportsProvider, TeamId } from './ids.js';

export interface Team {
  id: TeamId;
  provider: SportsProvider;
  providerTeamId: string;
  name?: string;
  country?: string;
  createdAt: string;
  updatedAt: string;
}
