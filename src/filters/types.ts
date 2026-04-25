export interface ApiFootballLeagueRef {
  providerLeagueId: string;
  name?: string;
  country?: string;
}

export interface ApiFootballTeamRef {
  providerTeamId: string;
  name?: string;
  leagueId?: string;
  country?: string;
}
