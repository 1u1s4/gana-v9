import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Fixture } from '../domain/fixtures.js';
import type { FixtureStatistics, SportsDataProvider } from '../providers/sports/types.js';
import type { buildTeamPerformanceContext } from './team-performance.js';

/** A full-time statistics response may include extra time. Only FT is comparable. */
export async function fetchCornerHistory(provider: Partial<Pick<SportsDataProvider, 'getFixtureStatistics'>>, fixture: Fixture,
  histories: ReturnType<typeof buildTeamPerformanceContext>[], now: Date, cacheDir?: string, budget?: { remaining: number; perFixture: number }) {
  const cutoff = Math.min(now.getTime(), Date.parse(fixture.scheduledAt));
  const eligible = histories.map(team => team.recentMatches.filter(match => match.providerStatus === 'FT'
    && Date.parse(match.scheduledAt) + 3 * 60 * 60_000 < cutoff && match.providerFixtureId !== fixture.providerFixtureId).slice(0, 10));
  const matches = new Map<string, typeof eligible[number][number]>();
  for (let index = 0; index < 10; index++) for (const team of eligible) {
    const match = team[index]; if (match) matches.set(match.providerFixtureId, match);
  }
  let newRequests = 0;
  const records: Array<FixtureStatistics & { sourceId: string; scheduledAt: string }> = [];
  const missing: Array<{ providerFixtureId: string; reason: string }> = [];
  for (const [id, match] of matches) {
    try {
      if (!provider.getFixtureStatistics) throw new Error('statistics endpoint unavailable');
      const path = cacheDir && /^[1-9]\d*$/.test(id) ? join(cacheDir, `${id}.json`) : undefined;
      let statistics: FixtureStatistics | undefined;
      if (path && existsSync(path)) {
        try { const stored = JSON.parse(readFileSync(path, 'utf8')); const age = now.getTime() - Date.parse(stored.capturedAt);
          if (age >= 0 && age < 24 * 60 * 60_000) statistics = stored; } catch { /* Refetch corrupt cache. */ }
      }
      if (!statistics) {
        if (budget && (budget.remaining <= 0 || newRequests >= budget.perFixture)) throw new Error('historical statistics request budget reserved for remaining stages');
        if (budget) budget.remaining -= 1;
        newRequests += 1;
        statistics = await provider.getFixtureStatistics({ providerFixtureId: id });
      }
      if (statistics.providerFixtureId !== id || !Number.isFinite(Date.parse(statistics.capturedAt))
        || Date.parse(statistics.capturedAt) > Date.now() + 60_000
        || !Number.isInteger(statistics.cornersHome) || Number(statistics.cornersHome) < 0
        || !Number.isInteger(statistics.cornersAway) || Number(statistics.cornersAway) < 0
        || statistics.totalCorners !== Number(statistics.cornersHome) + Number(statistics.cornersAway)) {
        throw new Error('missing or inconsistent full-time corner counts');
      }
      if (path) { mkdirSync(cacheDir!, { recursive: true }); const tmp = `${path}.${randomUUID()}.tmp`;
        writeFileSync(tmp, JSON.stringify(statistics)); renameSync(tmp, path); }
      records.push({ ...statistics, sourceId: `source_api_football_corners_${id}`, scheduledAt: match.scheduledAt });
    } catch (error) { missing.push({ providerFixtureId: id, reason: error instanceof Error ? error.message : 'statistics unavailable' }); }
  }
  const byId = new Map(records.map(record => [record.providerFixtureId, record]));
  const teams = histories.map(team => {
    const rows = team.recentMatches.filter(match => byId.has(match.providerFixtureId)).map(match => {
      const stats = byId.get(match.providerFixtureId)!;
      return { providerFixtureId: match.providerFixtureId, sourceId: stats.sourceId, scheduledAt: match.scheduledAt,
        leagueId: match.leagueId, season: match.season, contextFlags: match.contextFlags, venue: match.venue,
        cornersFor: match.venue === 'home' ? stats.cornersHome! : stats.cornersAway!,
        cornersAgainst: match.venue === 'home' ? stats.cornersAway! : stats.cornersHome!, totalCorners: stats.totalCorners! };
    });
    return { teamId: team.teamId, requested: team.recentMatches.filter(match => matches.has(match.providerFixtureId)).length,
      available: rows.length, matches: rows };
  });
  return { cutoffExclusive: new Date(cutoff).toISOString(), newRequests, records, teams, missing,
    interpretation: 'Dated FT-only corner counts, at most 10 previous matches per team. Excludes extra time, current fixture and future matches. Keep competition, venue and context flags separate; shared fixtures count once. Missing values are unknown, never zero. Counts are descriptive evidence, not a forecast or approval.' };
}
