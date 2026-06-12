import type { DailyE2ERunResult } from '../daily/e2e.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsQuote } from '../domain/odds.js';
import type { FixtureResearchResult } from '../evidence/research.js';
import type { LowOddsScanView } from '../filters/types.js';
import type { FiltersStatus, ServiceStatusReport } from '../filters/status.js';
import type { DailyMetricsRunResult } from '../metrics/daily.js';
import type { ParlayAnalysisRunResult } from '../parlay/analysis.js';
import type { ParlayBuildRunResult } from '../parlay/service.js';
import { redactSecrets } from '../permissions/redaction.js';
import type { FixtureScoringResult } from '../prediction/service.js';
import type { StrategyReviewResult } from '../strategy-review/daily.js';
import type { CertificationResult } from '../evals/runner.js';
import type { ValidationRunResult } from '../validation/service.js';
import type { RunExportResult, RunPipelineResult } from './runners.js';

export const DIM = '\x1b[2m';
export const RESET = '\x1b[0m';
export const CYAN = '\x1b[36m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';

export type ArtifactListResult = {
  artifactRoot: string;
  runId?: string;
  path: string;
  files: string[];
};

function statusMarker(status: string): string {
  if (status === 'missing' || status === 'warning' || status === 'disconnected' || status === 'degraded') return `${YELLOW}!${RESET}`;
  return `${GREEN}✓${RESET}`;
}

export function printKeyValue(key: string, value: unknown): void {
  const safe = redactSecrets(value);
  console.log(`  ${DIM}${key}:${RESET} ${CYAN}${String(safe)}${RESET}`);
}

export function printServiceStatus(report: ServiceStatusReport): void {
  console.log(`  ${statusMarker(report.status)} ${CYAN}${report.service}${RESET} ${DIM}${report.status}${RESET}`);
  console.log(`  ${DIM}${report.message}${RESET}`);
  if (report.missing.length) {
    console.log(`  ${DIM}missing:${RESET} ${YELLOW}${report.missing.join(', ')}${RESET}`);
  }
  if (report.config && Object.keys(report.config).length) {
    for (const [key, value] of Object.entries(report.config)) {
      if (value !== null) printKeyValue(key, value);
    }
  }
}

export function printFiltersStatus(status: FiltersStatus): void {
  console.log(`  ${statusMarker(status.status)} ${CYAN}${status.service}${RESET} ${DIM}${status.status}${RESET}`);
  console.log(`  ${DIM}${status.summary}${RESET}`);
  for (const warning of status.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
  printKeyValue('season', status.filters.defaultSeason);
  printKeyValue('markets', status.filters.defaultMarkets.join(', '));
  printKeyValue('leaguePresetsPath', status.filters.leaguePresetsPath);
  printKeyValue('legacyConfigLeagues', status.filters.defaultLeagues.length ? status.filters.defaultLeagues.length : 'none');
  printKeyValue('legacyConfigTeams', status.filters.defaultTeams.length ? status.filters.defaultTeams.length : 'none');
  printKeyValue('lowOddsThreshold', status.filters.lowOddsThreshold);
  printKeyValue('kickoffWindowHours', status.filters.kickoffWindowHours);
  printKeyValue('includeLiveFixtures', status.filters.includeLiveFixtures);
  printKeyValue('includeCompletedFixtures', status.filters.includeCompletedFixtures);
  printKeyValue('maxFixturesPerRun', status.filters.maxFixturesPerRun);
}

export function printLongRunningLowOddsNotice(date: string): void {
  console.log(`  ${YELLOW}!${RESET} ${DIM}low-odds scan for ${date} can take several minutes on full slates; quiet output is normal. Wait and verify child processes/artifacts before killing it.${RESET}`);
}

export function printFixtures(fixtures: Fixture[]): void {
  if (!fixtures.length) {
    console.log(`  ${DIM}No fixtures found.${RESET}`);
    return;
  }

  console.log(`  ${CYAN}fixtures${RESET} ${DIM}${fixtures.length}${RESET}`);
  for (const fixture of fixtures) {
    const kickoff = fixture.scheduledAt.replace('T', ' ').replace('.000Z', 'Z');
    const score = fixture.scoreHome !== undefined && fixture.scoreAway !== undefined
      ? ` ${fixture.scoreHome}-${fixture.scoreAway}`
      : '';
    console.log(
      `  ${GREEN}•${RESET} ${CYAN}${fixture.providerFixtureId}${RESET} ${DIM}${kickoff}${RESET} ${fixture.status}${score}`,
    );
  }
}

export function printOdds(quotes: OddsQuote[], details?: { oddsSnapshotId?: string; providerSnapshotId?: string }): void {
  console.log(`  ${CYAN}odds${RESET} ${DIM}${quotes.length}${RESET}`);
  if (details?.providerSnapshotId) printKeyValue('providerSnapshotId', details.providerSnapshotId);
  if (details?.oddsSnapshotId) printKeyValue('oddsSnapshotId', details.oddsSnapshotId);
  for (const quote of quotes) {
    const line = quote.line === undefined ? '' : ` ${quote.line}`;
    const bookmaker = quote.bookmaker ? ` ${DIM}${quote.bookmaker}${RESET}` : '';
    console.log(
      `  ${GREEN}•${RESET} ${CYAN}${quote.market}${RESET} ${quote.selection}${line} ${quote.price.toFixed(3)} p=${quote.impliedProbability.toFixed(3)}${bookmaker}`,
    );
  }
}

export function printLowOddsScan(scan: LowOddsScanView): void {
  console.log(`  ${CYAN}low-odds${RESET} ${DIM}scan=${scan.scanId ?? 'none'} fixtures=${scan.fixtureCount} hits=${scan.hitCount} threshold=${scan.threshold}${RESET}`);
  if (scan.selectorMarketScope?.length) {
    console.log(`  ${DIM}selector=${scan.selectorMarketScope.join(',')} home/away H2H low-odds indicator${RESET}`);
  }
  for (const hit of scan.hits) {
    const line = hit.line === undefined ? '' : ` ${hit.line}`;
    const bookmaker = hit.bookmaker ? ` ${DIM}${hit.bookmaker}${RESET}` : '';
    console.log(
      `  ${GREEN}•${RESET} ${CYAN}${hit.providerFixtureId}${RESET} ${hit.market} ${hit.selection}${line} ${hit.odds.toFixed(3)} p=${hit.impliedProbability.toFixed(3)}${bookmaker}`,
    );
  }
}

export function printResearchResult(result: FixtureResearchResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}research${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  if (result.bundle) {
    printKeyValue('researchBundleId', result.bundle.id);
    printKeyValue('fixtureId', result.bundle.fixtureId);
    printKeyValue('providerFixtureId', result.bundle.providerFixtureId);
    printKeyValue('sources', result.bundle.sources.length);
    printKeyValue('evidenceItems', result.bundle.evidenceItems.length);
    printKeyValue('claims', result.bundle.claims.length);
  }
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

export function printScoringResult(result: FixtureScoringResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}score${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.fixtureId) printKeyValue('fixtureId', result.fixtureId);
  if (result.providerFixtureId) printKeyValue('providerFixtureId', result.providerFixtureId);
  printKeyValue('predictions', result.predictions.length);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

export function printParlayResult(result: ParlayBuildRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}${result.portfolio ? 'parlay portfolio' : 'parlay'}${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  printKeyValue('runId', result.runId);
  printKeyValue('date', result.date);
  if (result.portfolio) {
    printKeyValue('portfolioId', result.portfolio.id);
    printKeyValue('sourceRunId', result.portfolio.sourceRunId);
    printKeyValue('parlays', result.portfolio.parlays.length);
    if (result.persistedParlayIds?.length) printKeyValue('persistedParlayIds', result.persistedParlayIds.join(', '));
    for (const profile of result.portfolio.profiles) {
      printKeyValue(`profile.${profile.profile}`, `${profile.included}/${profile.requested} included, ${profile.rejected} rejected`);
    }
    if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
    for (const reason of result.gateResult.reasons) {
      console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
    }
    for (const warning of result.gateResult.warnings) {
      console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
    }
    return;
  }
  printKeyValue('parlayId', result.build.parlay.id);
  if (result.persistedParlayId) printKeyValue('persistedParlayId', result.persistedParlayId);
  printKeyValue('legs', result.build.parlay.legs.length);
  if (result.build.parlay.combinedOdds !== undefined) printKeyValue('combinedOdds', result.build.parlay.combinedOdds);
  printKeyValue('aggregateConfidence', result.build.parlay.aggregateConfidence);
  printKeyValue('aggregateQuality', result.build.parlay.aggregateQuality);
  printKeyValue('artifactType', 'analytical only; not executable');
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

export function printParlayAnalysisResult(result: ParlayAnalysisRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}parlay analysis${RESET} ${DIM}${result.ok ? 'completed' : 'blocked'}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.date) printKeyValue('date', result.date);
  if (result.sourceRunId) printKeyValue('sourceRunId', result.sourceRunId);
  printKeyValue('analyzed', result.analyzed);
  printKeyValue('top', result.top.length);
  printKeyValue('artifactType', 'analytical only; not executable');
  printKeyValue('profileScope', result.diagnostics.profileScope);
  if (result.diagnostics.rawAnalyzed !== result.analyzed) printKeyValue('rawAnalyzed', result.diagnostics.rawAnalyzed);
  if (result.diagnostics.profileScopedAnalyzed !== result.analyzed) printKeyValue('profileScopedAnalyzed', result.diagnostics.profileScopedAnalyzed);
  if (result.diagnostics.cohortSourceRunId) printKeyValue('cohortSourceRunId', result.diagnostics.cohortSourceRunId);
  printKeyValue('exposurePolicy', `${result.diagnostics.exposurePolicy.analyticalUnits} analytical units, max portfolio exposure ${(result.diagnostics.exposurePolicy.maxPortfolioExposure * 100).toFixed(2)}%`);
  printKeyValue('universeHitRate', result.diagnostics.universe.hitRate === null ? 'n/a' : `${(result.diagnostics.universe.hitRate * 100).toFixed(1)}%`);
  printKeyValue('selectedHitRate', result.diagnostics.selected.hitRate === null ? 'n/a' : `${(result.diagnostics.selected.hitRate * 100).toFixed(1)}%`);
  printKeyValue('selectedExposureUnits', result.diagnostics.selected.totalExposureUnits);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.error) console.log(`  ${DIM}reason:${RESET} ${CYAN}${result.error}${RESET}`);
  for (const recommendation of result.top) {
    const banker = recommendation.bankerLegs.length ? ` bankerLegs:${recommendation.bankerLegs.length}` : '';
    console.log(`  ${CYAN}#${recommendation.rank}${RESET} ${recommendation.parlayId} ${DIM}${recommendation.profile} ${recommendation.validationStatus}${RESET} odds:${recommendation.combinedOdds} exposure:${recommendation.exposure.units}${banker}`);
  }
}

export function printValidationResult(result: ValidationRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}validate${RESET} ${DIM}${result.gateResult.verdict}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.target.date) printKeyValue('date', result.target.date);
  if (result.target.predictionId) printKeyValue('predictionId', result.target.predictionId);
  if (result.target.parlayId) printKeyValue('parlayId', result.target.parlayId);
  printKeyValue('validations', result.validations.length);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const reason of result.gateResult.reasons) {
    console.log(`  ${DIM}reason:${RESET} ${CYAN}${reason}${RESET}`);
  }
  for (const warning of result.gateResult.warnings) {
    console.log(`  ${YELLOW}!${RESET} ${DIM}${warning}${RESET}`);
  }
}

export function printDailyMetricsResult(result: DailyMetricsRunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}daily metrics${RESET} ${DIM}${result.ok ? 'ready' : 'failed'}${RESET}`);
  printKeyValue('runId', result.runId);
  printKeyValue('date', result.date);
  printKeyValue('days', result.days);
  printKeyValue('snapshots', result.metrics.length);
  printKeyValue('persisted', result.persisted);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  for (const snapshot of result.metrics) {
    const predictions = snapshot.predictionMetrics;
    const parlays = snapshot.parlayMetrics;
    console.log(`  ${GREEN}•${RESET} ${CYAN}${snapshot.metricDate}${RESET} ${DIM}pred=${predictions.won}-${predictions.lost} hit=${formatNullablePercent(predictions.hitRate)} parlay=${parlays.won}-${parlays.lost} hit=${formatNullablePercent(parlays.hitRate)}${RESET}`);
  }
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

export function printStrategyReviewResult(result: StrategyReviewResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}strategy review${RESET} ${DIM}${result.ok ? 'ready' : 'failed'}${RESET}`);
  printKeyValue('runId', result.runId);
  printKeyValue('scope', result.scope);
  printKeyValue('dates', result.dates.join(',') || 'none');
  printKeyValue('model', result.model);
  printKeyValue('reasoning', result.reasoningEffort);
  printKeyValue('agentStatus', result.agentReview.status);
  printKeyValue('predictionHitRate', result.historySummary.predictions.hitRate === null ? 'n/a' : formatNullablePercent(result.historySummary.predictions.hitRate * 100));
  printKeyValue('parlayHitRate', result.historySummary.parlays.hitRate === null ? 'n/a' : formatNullablePercent(result.historySummary.parlays.hitRate * 100));
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.reportPath) printKeyValue('report', result.reportPath);
  if (result.docPath) printKeyValue('doc', result.docPath);
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

export function printRunResult(result: RunPipelineResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}run${RESET} ${DIM}${result.verdict ?? (result.ok ? 'succeeded' : 'failed')}${RESET}`);
  if (result.runId) printKeyValue('runId', result.runId);
  if (result.date) printKeyValue('date', result.date);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.handoffPath) printKeyValue('handoff', result.handoffPath);
  if (result.evidencePackPath) printKeyValue('evidencePack', result.evidencePackPath);
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

export function printDailyE2EResult(result: DailyE2ERunResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}daily-e2e${RESET} ${DIM}${result.ok ? 'succeeded' : 'review-required'}${RESET}`);
  printKeyValue('dailyBatchId', result.dailyBatchId);
  printKeyValue('date', result.date);
  printKeyValue('artifact', result.artifactDir);
  printKeyValue('summary', result.summaryPath);
  printKeyValue('report', result.reportPath);
  for (const provider of result.providers) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${provider.provider}${RESET} ${DIM}${provider.model} run=${provider.runId ?? 'none'} verdict=${provider.verdict ?? 'n/a'}${RESET}`);
  }
  for (const family of result.parlays) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${family.family}${RESET} ${DIM}run=${family.runId ?? 'none'} sourceRuns=${family.sourceRunIds.join(',') || 'none'} verdict=${family.verdict ?? 'n/a'}${RESET}`);
  }
  if (result.providerComparison) {
    const summary = result.providerComparison.summary;
    printKeyValue('llmDiscrepancies', summary.materialDisagreements ?? summary.sameMarketDifferentSelection);
    printKeyValue('llmAgreementRate', summary.agreementRate === null ? 'n/a' : formatNullablePercent(summary.agreementRate * 100));
  }
  printKeyValue('recommendations', result.recommendations.total);
  printKeyValue('parlayRecommendations', result.recommendations.parlays);
  printKeyValue('atomicRecommendations', result.recommendations.atomic);
  if (result.requiredLeagueRecommendations) {
    printKeyValue('requiredLeagueGoal', result.requiredLeagueRecommendations.status);
    printKeyValue('requiredLeagueMissingFixtures', result.requiredLeagueRecommendations.missingPredictionFixtures);
    printKeyValue('requiredLeagueArtifact', result.requiredLeagueRecommendations.artifactPath);
  }
  if (result.metrics) printKeyValue('metricsPersisted', result.metrics.persisted);
  printKeyValue('artifactType', 'analytical only; not executable');
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

export function printExportResult(result: RunExportResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}export${RESET} ${DIM}${result.ok ? 'ready' : 'failed'}${RESET}`);
  printKeyValue('runId', result.runId);
  if (result.artifactPath) printKeyValue('artifact', result.artifactPath);
  if (result.handoffPath) printKeyValue('handoff', result.handoffPath);
  if (result.evidencePackPath) printKeyValue('evidencePack', result.evidencePackPath);
  for (const file of result.files ?? []) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${file}${RESET}`);
  }
  if (result.error) console.log(`  ${YELLOW}!${RESET} ${DIM}${result.error}${RESET}`);
}

export function printCertificationResult(result: CertificationResult): void {
  const marker = result.ok ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`;
  console.log(`  ${marker} ${CYAN}certify${RESET} ${DIM}${result.profile}${RESET}`);
  printKeyValue('manifest', result.manifestPath);
  printKeyValue('hash', result.hash);
  for (const check of result.checks) {
    console.log(`  ${check.ok ? GREEN + '✓' + RESET : YELLOW + '!' + RESET} ${DIM}${check.name}${RESET}`);
  }
}

export function printArtifacts(result: ArtifactListResult): void {
  console.log(`  ${CYAN}artifacts${RESET} ${DIM}${result.path}${RESET}`);
  printKeyValue('artifactRoot', result.artifactRoot);
  if (result.runId) printKeyValue('runId', result.runId);
  if (!result.files.length) {
    console.log(`  ${DIM}No artifacts found.${RESET}`);
    return;
  }
  for (const file of result.files) {
    console.log(`  ${GREEN}•${RESET} ${CYAN}${file}${RESET}`);
  }
}

export function printLeaderboardRows(rows: any[], by: string): void {
  printKeyValue('rows', rows.length);
  printKeyValue('by', by);
  if (!rows.length) {
    printKeyValue('status', 'no leaderboard rows found');
    return;
  }
  for (const row of rows.slice(0, 20)) {
    const label = [
      row.promptVersion ?? 'unknown-prompt',
      row.modelId ?? 'unknown-model',
      row.market ?? 'unknown-market',
      row.league ?? 'unknown-league',
    ].join(' | ');
    console.log(`  ${GREEN}•${RESET} ${CYAN}${label}${RESET} ${DIM}n=${row.n} brier=${formatMetric(row.brier)} logloss=${formatMetric(row.logloss)} hitrate=${formatMetric(row.hitrate)} lowSample=${Boolean(row.lowSample)}${RESET}`);
  }
}

function formatMetric(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(4) : 'n/a';
}

function formatNullablePercent(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'n/a';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : 'n/a';
}
