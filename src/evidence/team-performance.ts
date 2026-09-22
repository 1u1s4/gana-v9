import type { Fixture } from '../domain/fixtures.js';
import type { CompletedTeamFixtures, SportsDataProvider } from '../providers/sports/types.js';

/** Team identity is the provider ID. Other competitions supplement, not replace,
 * the separate target-league history used for opponent comparisons. */
export async function fetchRecentTeamPerformance(
  provider: Pick<SportsDataProvider, 'getCompletedTeamFixtures'>,
  fixture: Fixture,
  now: Date,
  warnings: string[],
) {
  const results: ReturnType<typeof buildTeamPerformanceContext>[] = [];
  if (!provider.getCompletedTeamFixtures) return results;
  const cutoff = Math.min(Date.parse(fixture.scheduledAt), now.getTime());
  if (!Number.isFinite(cutoff)) {
    warnings.push('Recent team history unavailable: invalid kickoff or observation time.');
    return results;
  }
  // The API accepts days, not instants: omit the entire cutoff day.
  const endExclusive = new Date(new Date(cutoff).toISOString().slice(0, 10));
  const to = new Date(endExclusive.getTime() - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(endExclusive.getTime() - 180 * 86_400_000).toISOString().slice(0, 10);
  const year = Number(to.slice(0, 4));
  const seasons = [year - 1, year];
  if (Number(fixture.season) === year + 1) seasons.push(year + 1);

  for (const rawId of [...new Set([fixture.providerHomeTeamId, fixture.providerAwayTeamId])]) {
    if (!rawId || !/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
      warnings.push('Recent team history unavailable: missing exact provider team ID.');
      continue;
    }
    const team = Number(rawId);
    try {
      const history = await provider.getCompletedTeamFixtures({ team, seasons, from, to });
      const fetched = history.coverage.fetchedSeasons;
      if (history.teamId !== team || history.from !== from || history.to !== to
        || JSON.stringify(history.seasons) !== JSON.stringify(seasons)
        || !history.coverage.complete || JSON.stringify(fetched) !== JSON.stringify(seasons)
        || history.snapshots.length !== seasons.length
        || seasons.some((season) => history.snapshots.filter((snapshot) => snapshot.season === season).length !== 1)) {
        warnings.push(`Recent team history unavailable for team ${team}: identity, range or complete season coverage mismatch.`);
        continue;
      }
      const context = buildTeamPerformanceContext(history, fixture);
      if (context.recentMatches.length < 10) {
        warnings.push(`Recent team history for team ${team}: ${context.recentMatches.length}/10 dated matches with known 90-minute scores in the requested 180-day window; keep competition and venue samples separate.`);
      }
      if (context.coverage.excludedContextRows > 0) {
        warnings.push(`Recent team history for team ${team} excludes ${context.coverage.excludedContextRows} duplicate, off-scope or unknown-90-minute rows.`);
      }
      results.push(context);
    } catch {
      warnings.push(`Recent team history unavailable for team ${team} through ${to}; do not invent recent results.`);
    }
  }
  return results;
}

export function buildTeamPerformanceContext(history: CompletedTeamFixtures, fixture: Fixture) {
  const teamId = String(history.teamId);
  const from = Date.parse(`${history.from}T00:00:00Z`);
  const endExclusive = Date.parse(`${history.to}T00:00:00Z`) + 86_400_000;
  const kickoff = Date.parse(fixture.scheduledAt);
  const sources = history.snapshots.map((snapshot) => ({
    ...snapshot,
    sourceId: `source_api_football_team_history_${teamId}_${snapshot.season}_${history.from}_${history.to}`,
  }));
  const seen = new Set<string>();
  let excludedContextRows = 0;
  const matches = history.fixtures.filter((match) => {
    const at = Date.parse(match.scheduledAt);
    const valid = match.providerFixtureId !== fixture.providerFixtureId && !seen.has(match.providerFixtureId)
      && [match.providerHomeTeamId, match.providerAwayTeamId].includes(teamId)
      && history.seasons.includes(match.season) && sources.some((source) => source.season === match.season)
      && Number.isSafeInteger(match.leagueId) && match.leagueId > 0
      && Number.isFinite(at) && at >= from && at < endExclusive && at < kickoff
      && ['FT', 'AET', 'PEN'].includes(match.providerStatus)
      && Number.isInteger(match.scoreHome90) && Number(match.scoreHome90) >= 0
      && Number.isInteger(match.scoreAway90) && Number(match.scoreAway90) >= 0;
    if (!valid) { excludedContextRows += 1; return false; }
    seen.add(match.providerFixtureId);
    return true;
  }).sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt) || a.providerFixtureId.localeCompare(b.providerFixtureId));
  const recentMatches = matches.slice(0, 10).map((match) => {
    const home = match.providerHomeTeamId === teamId;
    const opponentName = home ? match.awayTeamName : match.homeTeamName;
    const goalsFor90 = Number(home ? match.scoreHome90 : match.scoreAway90);
    const goalsAgainst90 = Number(home ? match.scoreAway90 : match.scoreHome90);
    const contextFlags: string[] = [];
    if (/friendl|amistos/i.test(match.leagueName ?? '')) contextFlags.push('competition-name-indicates-friendly');
    if (/\b(?:u(?:1\d|2[0-3])|under[ -]?(?:1\d|2[0-3])|reserves?|ii|b team)\b/i.test(opponentName)) {
      contextFlags.push('opponent-name-indicates-youth-or-reserve');
    }
    return {
      providerFixtureId: match.providerFixtureId,
      sourceId: sources.find((source) => source.season === match.season)!.sourceId,
      scheduledAt: match.scheduledAt,
      leagueId: match.leagueId, leagueName: match.leagueName, leagueType: match.leagueType,
      season: match.season,
      targetCompetitionAndSeason: match.leagueId === Number(fixture.leagueId) && match.season === Number(fixture.season),
      venue: home ? 'home' as const : 'away' as const,
      venueName: match.venue, round: match.round,
      opponentId: home ? match.providerAwayTeamId : match.providerHomeTeamId,
      opponentName, providerStatus: match.providerStatus,
      goalsFor90, goalsAgainst90,
      result90: goalsFor90 > goalsAgainst90 ? 'W' : goalsFor90 === goalsAgainst90 ? 'D' : 'L',
      contextFlags,
    };
  });
  const record = (rows: typeof recentMatches) => ({
    played: rows.length,
    won: rows.filter((row) => row.result90 === 'W').length,
    drawn: rows.filter((row) => row.result90 === 'D').length,
    lost: rows.filter((row) => row.result90 === 'L').length,
    goalsFor90: rows.reduce((sum, row) => sum + row.goalsFor90, 0),
    goalsAgainst90: rows.reduce((sum, row) => sum + row.goalsAgainst90, 0),
  });
  const groupKey = (match: typeof recentMatches[number]) => `${match.leagueId}:${match.season}:${match.contextFlags.join(',')}`;
  const groups = [...new Set(recentMatches.map(groupKey))].map((key) => {
    const rows = recentMatches.filter((match) => groupKey(match) === key);
    const first = rows[0];
    return {
      leagueId: first.leagueId, leagueName: first.leagueName, leagueType: first.leagueType,
      season: first.season, contextFlags: first.contextFlags,
      targetCompetitionAndSeason: first.targetCompetitionAndSeason,
      sample: { all: record(rows), home: record(rows.filter((row) => row.venue === 'home')), away: record(rows.filter((row) => row.venue === 'away')) },
    };
  });
  return {
    teamId,
    teamName: fixture.providerHomeTeamId === teamId ? fixture.homeTeamName : fixture.awayTeamName,
    targetVenue: fixture.providerHomeTeamId === teamId ? 'home' : 'away',
    from: history.from, cutoffDate: history.to, seasons: history.seasons,
    capturedAt: history.capturedAt, payloadHash: history.payloadHash,
    providerSnapshotIds: history.providerSnapshotIds, sources,
    coverage: { ...history.coverage, known90mMatchesInWindow: matches.length, excludedContextRows, recentMatches: recentMatches.length },
    recentMatches, groups,
    interpretation: 'Last 10 available dated matches of this exact provider team across the requested seasons and 180-day window, with known regulation-time scores. Each competition, season, venue and context-flag group remains separate; there is no pooled strength estimate, global points-per-match or opponent rating. Friendly/development flags describe source labels, not verified squad composition; unflagged does not prove senior competitive comparability. Do not double-count a fixture also present in league history. Missing samples, lineup status, corner evidence and opponent strength remain unknown.',
  };
}
