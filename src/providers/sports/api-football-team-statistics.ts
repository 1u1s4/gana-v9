import { z } from 'zod';
import { ApiFootballProviderError } from './api-football-errors.js';
import type { TeamStatistics, TeamStatisticsQuery } from './types.js';

const splitCounts = z.object({ home: z.number().int().nonnegative().nullable(), away: z.number().int().nonnegative().nullable(), total: z.number().int().nonnegative().nullable() });
const average = z.preprocess((value) => typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value, z.number().nonnegative().nullable());
const splitAverages = z.object({ home: average, away: average, total: average });
const goalStatistics = z.object({ total: splitCounts, average: splitAverages });
const statisticsPayload = z.object({ response: z.object({
  team: z.object({ id: z.number().int().positive() }),
  league: z.object({ id: z.number().int().positive(), season: z.number().int().positive() }),
  form: z.string().regex(/^[WDL]*$/).nullable(),
  fixtures: z.object({ played: splitCounts, wins: splitCounts, draws: splitCounts, loses: splitCounts }),
  goals: z.object({ for: goalStatistics, against: goalStatistics }),
  clean_sheet: splitCounts,
  failed_to_score: splitCounts,
}) });

export function validateTeamStatisticsQuery(input: TeamStatisticsQuery): TeamStatisticsQuery {
  const validIds = [input.team, input.league, input.season].every((value) => Number.isSafeInteger(value) && value > 0);
  const parsedDate = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? new Date(`${input.date}T00:00:00.000Z`) : new Date(NaN);
  if (!validIds || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date) {
    throw new ApiFootballProviderError({ code: 'mapping_error', endpointName: 'team_statistics',
      message: 'Team statistics require positive numeric team/league/season IDs and an exact YYYY-MM-DD cutoff.' });
  }
  return { team: input.team, league: input.league, season: input.season, date: input.date };
}

export function mapApiFootballTeamStatistics(
  payload: unknown,
  query: TeamStatisticsQuery,
  capturedAt: Date,
  providerSnapshotId?: string,
): TeamStatistics {
  const result = statisticsPayload.safeParse(payload);
  if (!result.success) {
    throw new ApiFootballProviderError({ code: 'incomplete_statistics', endpointName: 'team_statistics',
      message: 'API-Football returned missing or invalid team statistics.',
      received: { fields: result.error.issues.map((issue) => issue.path.join('.')) },
    });
  }
  const data = result.data.response;
  if (data.team.id !== query.team || data.league.id !== query.league || data.league.season !== query.season) {
    throw new ApiFootballProviderError({ code: 'invalid_provider_response', endpointName: 'team_statistics',
      message: 'API-Football team statistics do not match the requested team, league, and season.',
      received: { teamId: data.team.id, leagueId: data.league.id, season: data.league.season },
    });
  }
  return {
    teamId: query.team, leagueId: query.league, season: query.season, date: query.date,
    capturedAt: capturedAt.toISOString(), ...(providerSnapshotId && { providerSnapshotId }),
    form: data.form, fixtures: data.fixtures, goals: data.goals,
    cleanSheet: data.clean_sheet, failedToScore: data.failed_to_score,
  };
}
