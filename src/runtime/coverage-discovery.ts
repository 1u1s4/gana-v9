import type { Fixture } from '../domain/fixtures.js';
import type { OddsSnapshotView } from './pipeline.js';

/** Discovery eligibility only. Research and promotion gates still decide every pick. */
export function discoverByMarketCoverage(fixtures: Fixture[], snapshots: OddsSnapshotView[], primaryIds: Set<string>, now: Date, budget = 12) {
  const byId = new Map(snapshots.map(snapshot => [snapshot.providerFixtureId, snapshot]));
  const candidates = fixtures.map(fixture => {
    const snapshot = byId.get(fixture.providerFixtureId);
    const books = new Map<string, Map<string, number>>();
    for (const quote of snapshot?.quotes ?? []) {
      const age = now.getTime() - Date.parse(quote.capturedAt);
      if (quote.market !== 'h2h' || !['home', 'draw', 'away'].includes(quote.selection)
        || !quote.bookmaker || quote.fixtureId !== fixture.id || !Number.isFinite(age) || age < 0 || age > 60 * 60_000
        || !Number.isFinite(quote.price) || quote.price <= 1) continue;
      const selections = books.get(quote.bookmaker) ?? new Map<string, number>();
      // Duplicate records from a book are not additional liquidity.
      selections.set(quote.selection, quote.price);
      books.set(quote.bookmaker, selections);
    }
    const margins = [...books.values()].filter(book => book.size === 3)
      .map(book => [...book.values()].reduce((sum, price) => sum + 1 / price, 0) - 1)
      .filter(margin => margin >= 0 && margin <= 0.15).sort((a, b) => a - b);
    const reasons: string[] = [];
    if (primaryIds.has(fixture.id)) reasons.push('already-selected');
    if (fixture.status !== 'scheduled' || Date.parse(fixture.scheduledAt) <= now.getTime()
      || !Number.isFinite(Date.parse(fixture.scheduledAt))) reasons.push('not-future-scheduled');
    if (!fixture.providerHomeTeamId || !fixture.providerAwayTeamId || !fixture.leagueId || !fixture.season) reasons.push('missing-history-identifiers');
    if (snapshot?.error) reasons.push('odds-fetch-error');
    if (margins.length < 2) reasons.push('fewer-than-two-fresh-complete-books');
    return { fixtureId: fixture.id, providerFixtureId: fixture.providerFixtureId,
      completeBookmakers: margins.length, medianOverround: margins.length ? margins[Math.floor(margins.length / 2)] : null,
      reasons, selected: false };
  });
  const ranked = candidates.filter(candidate => !candidate.reasons.length).sort((a, b) =>
    b.completeBookmakers - a.completeBookmakers || a.medianOverround! - b.medianOverround! || a.providerFixtureId.localeCompare(b.providerFixtureId));
  const limit = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 12;
  ranked.forEach((candidate, index) => { candidate.selected = index < limit; if (!candidate.selected) candidate.reasons.push('discovery-budget'); });
  return { version: 1, observedAt: now.toISOString(), budget: limit, candidates,
    selectedFixtureIds: ranked.filter(candidate => candidate.selected).map(candidate => candidate.fixtureId),
    policy: 'Fresh complete h2h books and exact history identifiers; evidence readiness must be established by research; no odds or probability promotion override' };
}
