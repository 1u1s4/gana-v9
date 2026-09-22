#!/usr/bin/env node
// Run with: node --import tsx scripts/retro-published-result-audit.mjs
// Read-only provider requests; never writes historical validation or DB rows.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../src/config.ts';
import { createRuntimeContext } from '../src/runtime/context.ts';
import { createApiFootballProvider } from '../src/providers/sports/api-football.ts';
import { settleMarket } from '../src/validation/settlement-rules.ts';
import { buildPublishedPortfolioReport } from './retro-published-portfolio.mjs';

const requestedIds = ['1554377', '1586077', '1591866', '1519407', '1550967'];
const requestBudget = 5;
const hashFile = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = buildPublishedPortfolioReport({ root: process.cwd(), from: '2026-07-06', to: '2026-09-21' });
const selections = new Map(requestedIds.map((id) => [id, []]));
const seen = new Set();
for (const row of source.rows) {
  if (!row.lineage.endsWith('source-sha256') || !row.validationPath) continue;
  const validation = JSON.parse(fs.readFileSync(row.validationPath, 'utf8'));
  for (const leg of row.legs) {
    const archived = validation.validations.find((entry) => entry.predictionId === leg.predictionId);
    const id = String(archived?.metadata?.providerFixtureId ?? '');
    if (!selections.has(id) || !['won', 'lost', 'voided'].includes(archived?.status) || seen.has(leg.predictionId)) continue;
    seen.add(leg.predictionId);
    selections.get(id).push({
      publicationDate: row.date, batchId: row.batchId, publishedRecommendationId: row.id,
      predictionId: leg.predictionId, fixtureId: leg.fixtureId, fixture: leg.fixture,
      market: leg.market, selection: leg.selection, line: leg.line, odds: leg.odds,
      publicationLineage: row.lineage,
      messageIds: source.days.find((day) => day.date === row.date)?.messageIds,
      recommendationArtifact: row.artifactPath, recommendationSha256: hashFile(row.artifactPath),
      validationArtifact: row.validationPath, validationSha256: hashFile(row.validationPath),
      archived: { status: archived.status, evaluatedAt: archived.evaluatedAt, score: archived.actual?.fixture ?? null, settlementRuleVersion: archived.outcome?.settlementRuleVersion },
    });
  }
}
if ([...selections.values()].some((items) => !items.length)) throw new Error('Every audited fixture must have a settled, hash-verified published selection.');

const config = loadConfig({ databaseUrl: '', apiFootball: { maxProviderRequestsPerRun: requestBudget } }, { skipApiKey: true });
const runtime = createRuntimeContext(config, 'read-only-published-result-audit');
runtime.providerRequestLimit = requestBudget;
const observed = new Map();
// This callback captures normalization in memory only; no DB persistence is configured.
const provider = createApiFootballProvider(config, {
  upsertFixtures: async (fixtures) => { fixtures.forEach((fixture) => observed.set(fixture.providerFixtureId, fixture)); return []; },
}, runtime);
const audit = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), requestBudget, requestsUsed: 0,
  method: {
    sampling: 'Purposive integrity sample of five distinct published fixtures, mixing archived wins/losses and World Cup knockout matches; not a random performance sample.',
    outcomeWindow: 'Regulation time (90 minutes plus stoppage time); AET/PEN uses score.fulltime and never goals/extra time/penalties as a substitute.',
    mutations: 'Audit artifact only. No DB, validation, publication lock, or notification writes.',
    inference: 'Current provider recheck of archived settlement, not ex-ante information, calibration, or performance tuning.',
  }, fixtures: [],
};
for (const providerFixtureId of requestedIds) {
  const checkedAt = new Date().toISOString();
  try {
    const fixture = await provider.getFixture({ providerFixtureId });
    const raw = observed.get(providerFixtureId)?.metadata?.raw;
    const observations = selections.get(providerFixtureId).map((selection) => {
      const recomputed = settleMarket({ fixture, selection: {
        market: selection.market, selection: selection.selection,
        ...(selection.line !== null && selection.line !== undefined ? { line: selection.line } : {}),
        odds: selection.odds, impliedProbability: 1 / selection.odds,
      }, evaluatedAt: checkedAt });
      return { ...selection, currentSettlement: recomputed.status,
        outcomeMatches: selection.archived.status === recomputed.status,
        scoreMatches: selection.archived.score?.scoreHome === fixture.scoreHome && selection.archived.score?.scoreAway === fixture.scoreAway };
    });
    audit.fixtures.push({ providerFixtureId, checkedAt, sourceUrl: `${config.apiFootballBaseUrl}/fixtures?id=${providerFixtureId}`,
      providerStatus: raw?.fixture?.status?.short ?? null, kickoff: fixture.scheduledAt,
      regulationScore: { home: fixture.scoreHome ?? null, away: fixture.scoreAway ?? null },
      providerScores: { fulltime: raw?.score?.fulltime, extratime: raw?.score?.extratime, penalty: raw?.score?.penalty, goals: raw?.goals },
      providerFixtureSha256: createHash('sha256').update(JSON.stringify(raw ?? fixture)).digest('hex'), selections: observations,
    });
  } catch (error) {
    audit.fixtures.push({ providerFixtureId, checkedAt, error: error instanceof Error ? error.message : 'Provider request failed', selections: selections.get(providerFixtureId) });
  }
}
audit.requestsUsed = runtime.providerRequestCount;
audit.summary = {
  fixturesChecked: audit.fixtures.length,
  providerErrors: audit.fixtures.filter((fixture) => fixture.error).length,
  selectionsCompared: audit.fixtures.reduce((sum, fixture) => sum + fixture.selections.filter((pick) => 'outcomeMatches' in pick).length, 0),
  settlementMismatches: audit.fixtures.flatMap((fixture) => fixture.selections).filter((pick) => pick.outcomeMatches === false).length,
  scoreMismatches: audit.fixtures.flatMap((fixture) => fixture.selections).filter((pick) => pick.scoreMatches === false).length,
  extraTimeOrPenalties: audit.fixtures.filter((fixture) => ['AET', 'PEN'].includes(fixture.providerStatus)).length,
};
const output = path.resolve('.artifacts/gana-v9/audits', `published-result-api-${audit.generatedAt.slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ output, requestsUsed: audit.requestsUsed, summary: audit.summary, fixtures: audit.fixtures.map((fixture) => ({ providerFixtureId: fixture.providerFixtureId, status: fixture.providerStatus, score: fixture.regulationScore, error: fixture.error })) }, null, 2));
