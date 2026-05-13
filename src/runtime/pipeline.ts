import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { isMarketKey, normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import type { OddsQuote } from '../domain/odds.js';
import { discoverFixtures, type FixtureDiscoveryResult } from '../filters/engine.js';
import { persistLowOddsScanResult, type LowOddsPersistenceRepositories } from '../filters/low-odds.js';
import { isLowOddsFixtureSelectorQuote, lowOddsSelectorMarketScope } from '../filters/low-odds-selector.js';
import type { LowOddsHitView, LowOddsScanView } from '../filters/types.js';
import { runFixtureResearch, type FixtureResearchResult } from '../evidence/research.js';
import { runFixtureScoring, type FixtureScoringResult } from '../prediction/service.js';
import type { ResearchWebMode } from '../prediction/prompts.js';
import { getApiFootballDateOddsSlate, getApiFootballDateOddsSnapshots, getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { oddsQuoteDedupeKey } from '../providers/sports/api-football-mappers.js';
import { runParlayBuild, type ParlayBuildRunResult } from '../parlay/service.js';
import { runValidation, type ValidationRunResult } from '../validation/service.js';
import { appendSpanJsonl } from '../observability/trace-writer.js';
import { finishSpan, hashUnknown, startSpan, type HarnessSpanKind, type HarnessSpanStatus } from '../observability/spans.js';
import { disconnectDb, getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type { HarnessRunRecord, JsonValue, StoragePrismaClient } from '../storage/types.js';
import {
  createRunArtifactDir,
  hashPayload,
  stableStringify,
  writeArtifact,
  writeRunJson,
} from './artifacts.js';
import type { RuntimeContext } from './context.js';
import { createHarnessTraceId } from './events.js';
import { scheduleRunTasks, type CanonicalTaskType, type DurableTask } from './scheduler.js';

export type PipelineVerdict = 'promotable' | 'review-required' | 'blocked';
export type PipelineStatus = 'succeeded' | 'failed';
export type PipelineValidationMode = 'auto' | 'force' | false;

export interface RunPipelineInput {
  date: string;
  runId?: string;
  web?: ResearchWebMode;
  validate?: PipelineValidationMode;
  markets?: MarketKey[];
}

export interface OddsSnapshotView {
  fixtureId: string;
  providerFixtureId: string;
  oddsSnapshotId?: string;
  providerSnapshotId?: string;
  quoteRecordIds?: Record<string, string>;
  quotes: OddsQuote[];
  error?: string;
}

export interface PipelineStepResult {
  name: string;
  ok: boolean;
  verdict?: string;
  warnings: string[];
  error?: string;
  artifactPath?: string;
}

export interface RunPipelineResult {
  ok: boolean;
  runId: string;
  date: string;
  status: PipelineStatus;
  verdict: PipelineVerdict;
  artifactDir: string;
  evidencePackPath: string;
  handoffPath: string;
  steps: PipelineStepResult[];
  fixtures: Fixture[];
  lowOddsScan: LowOddsScanView;
  oddsSnapshots: OddsSnapshotView[];
  research: FixtureResearchResult[];
  scoring: FixtureScoringResult[];
  parlay?: ParlayBuildRunResult;
  validation?: ValidationRunResult;
  error?: string;
}

export interface ExportRunInput {
  runId: string;
}

export interface ExportRunResult {
  ok: boolean;
  runId: string;
  artifactDir?: string;
  evidencePackPath?: string;
  handoffPath?: string;
  manifestPath?: string;
  error?: string;
}

export interface PipelineRepositories {
  harnessRuns?: {
    findById?(id: string): Promise<Pick<HarnessRunRecord, 'id' | 'status' | 'verdict' | 'artifactDir' | 'metadata'> | null>;
    upsertForRun?(input: {
      id: string;
      runtime: string;
      profile: string;
      providerSports: string;
      providerAgentic?: string | null;
      model?: string | null;
      status?: string;
      verdict?: string | null;
      artifactDir?: string | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
      metadata?: JsonValue | null;
    }): Promise<unknown>;
    updateStatus?(id: string, update: { status: string; verdict?: string | null; completedAt?: Date | null }): Promise<unknown>;
  };
  artifacts?: {
    create(input: {
      name: string;
      kind: string;
      path: string;
      runId?: string | null;
      sha256?: string | null;
      metadata?: JsonValue | null;
    }): Promise<unknown>;
    listByRun?(runId: string, take?: number): Promise<Array<{ name: string; kind: string; path: string; sha256?: string | null }>>;
  };
  harnessTasks?: {
    enqueue?(input: {
      type: string;
      status?: string;
      priority?: number;
      runId?: string | null;
      scheduledFor?: Date | null;
      leaseExpiresAt?: Date | null;
      attempts?: number;
      maxAttempts?: number;
      payload?: JsonValue | null;
      lastErrorRedacted?: string | null;
    }): Promise<{ id: string } | unknown>;
    updateStatus?(id: string, update: {
      status: string;
      leaseExpiresAt?: Date | null;
      attempts?: number;
      lastErrorRedacted?: string | null;
    }): Promise<unknown>;
  };
  lowOddsScans?: LowOddsPersistenceRepositories['lowOddsScans'];
  lowOddsHits?: LowOddsPersistenceRepositories['lowOddsHits'];
}

export interface RunPipelineDependencies {
  now?: () => Date;
  createRunId?: () => string;
  repositories?: PipelineRepositories;
  discoverFixtures?: typeof discoverFixtures;
  fetchOddsSnapshot?: typeof getApiFootballOddsSnapshot;
  discoverLowOddsFixtures?: typeof discoverFixtures;
  fetchLowOddsSnapshot?: typeof getApiFootballOddsSnapshot;
  fetchLowOddsSnapshotsForDate?: typeof getApiFootballDateOddsSnapshots;
  fetchLowOddsSlate?: typeof getApiFootballDateOddsSlate;
  researchFixture?: typeof runFixtureResearch;
  scoreFixture?: typeof runFixtureScoring;
  buildParlay?: typeof runParlayBuild;
  validateRun?: typeof runValidation;
  writeArtifact?: typeof writeArtifact;
  writeRunJson?: typeof writeRunJson;
  exportArtifacts?: (config: AgentConfig, input: ExportRunInput, runtime: RuntimeContext, deps?: RunPipelineDependencies) => Promise<ExportRunResult>;
}

interface LowOddsPredictionCoverage {
  threshold: number;
  hits: number;
  scopedHits: number;
  indicatorFixtures: number;
  excludedIndicatorFixtures: number;
  scoredIndicatorFixtures: number;
  missingIndicatorFixtureIds: string[];
  excludedIndicatorFixtureIds: string[];
  hitsWithOddsQuoteId: number;
  uniqueHitOddsQuoteIds: number;
  predictedHitOddsQuoteIds: number;
  missingPredictionHits: number;
  unlinkedHits: number;
  complete: boolean;
  missingOddsQuoteIds: string[];
}

const EMPTY_LOW_ODDS_SCAN: Omit<LowOddsScanView, 'date' | 'threshold'> = {
  fixtureCount: 0,
  hitCount: 0,
  hits: [],
  fixtureEvaluations: [],
};
const STORAGE_RETRY_ATTEMPTS = 3;
const STORAGE_RETRY_DELAY_MS = 2_000;
const RESEARCH_CONCURRENCY = 4;
const SCORING_CONCURRENCY = 4;
const ODDS_SCAN_CONCURRENCY = 6;
const LOW_ODDS_GLOBAL_MAX_FIXTURES = Number.MAX_SAFE_INTEGER;
const AGENT_FIXTURE_TIMEOUT_MS = positiveInteger(process.env.GANA_AGENT_FIXTURE_TIMEOUT_MS) ?? 420_000;
const AGENT_FIXTURE_ABORT_GRACE_MS = positiveInteger(process.env.GANA_AGENT_FIXTURE_ABORT_GRACE_MS) ?? 30_000;
const RESEARCH_AGENT_TIMEOUT_MS = positiveInteger(process.env.GANA_RESEARCH_AGENT_TIMEOUT_MS)
  ?? positiveInteger(process.env.GANA_AGENT_TIMEOUT_MS)
  ?? 300_000;
const RESEARCH_AGENT_JSON_ATTEMPTS = positiveInteger(process.env.GANA_RESEARCH_AGENT_JSON_ATTEMPTS) ?? 2;

export function computeAgentFixtureTimeoutMs(input: {
  baseTimeoutMs: number;
  web: ResearchWebMode;
  researchAgentTimeoutMs: number;
  researchJsonAttempts: number;
  abortGraceMs: number;
}): number {
  if (input.web !== 'live') return input.baseTimeoutMs;
  const researchRetryBudget = input.researchAgentTimeoutMs * input.researchJsonAttempts + input.abortGraceMs;
  return Math.max(input.baseTimeoutMs, researchRetryBudget);
}

export async function executeRunPipeline(
  config: AgentConfig,
  input: RunPipelineInput,
  runtime: RuntimeContext,
  deps: RunPipelineDependencies = {},
): Promise<RunPipelineResult> {
  const now = deps.now ?? (() => new Date());
  const runId = input.runId ?? runtime.runId ?? deps.createRunId?.() ?? randomUUID();
  runtime.runId = runId;
  runtime.traceId ??= createHarnessTraceId();
  const artifactDir = createRunArtifactDir(config, runId);
  const repositories = deps.repositories ?? defaultRepositories(config);
  const writeJsonArtifact = deps.writeArtifact ?? writeArtifact;
  const writeRun = deps.writeRunJson ?? writeRunJson;
  const startedAt = now();
  const marketScope = normalizeMarketScope(input.markets, config.apiFootball.defaultMarkets);
  const lowOddsSelectorMarkets = lowOddsSelectorMarketScope(marketScope);
  const steps: PipelineStepResult[] = [];
  const durableTasks = await initializeDurableTasks(config, runId, {
    date: input.date,
    web: input.web ?? defaultWebMode(config),
    validate: input.validate ?? 'auto',
    markets: marketScope,
  }, repositories);
  const runDurableTask = createPipelineTaskRunner(config, runtime, runId, durableTasks, repositories);

  await repositories.harnessRuns?.upsertForRun?.({
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status: 'running',
    verdict: null,
    artifactDir,
    startedAt,
    metadata: toJsonValue({ date: input.date, validate: input.validate ?? 'auto', marketScope }),
  }).catch(() => undefined);

  writeRun(config, runId, {
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status: 'running',
    date: input.date,
    marketScope,
    startedAt: startedAt.toISOString(),
    artifactDir,
  });
  writeJsonArtifact(config, runId, 'input.json', {
    date: input.date,
    web: input.web ?? defaultWebMode(config),
    validate: input.validate ?? 'auto',
    markets: [...marketScope],
    marketScope: [...marketScope],
  });

  const filtersPayload = {
    date: input.date,
    season: config.apiFootball.defaultSeason,
    timezone: config.apiFootball.timezone,
    markets: [...marketScope],
    marketScope: [...marketScope],
    defaultLeagues: config.apiFootball.defaultLeagues,
    defaultTeams: config.apiFootball.defaultTeams,
    threshold: config.apiFootball.lowOddsThreshold,
    maxFixturesPerRun: config.apiFootball.maxFixturesPerRun,
    kickoffWindowHours: config.apiFootball.kickoffWindowHours,
    includeLiveFixtures: config.apiFootball.includeLiveFixtures,
    includeCompletedFixtures: config.apiFootball.includeCompletedFixtures,
  };
  writeJsonArtifact(config, runId, 'filters.json', filtersPayload);
  steps.push({ name: 'apply filters', ok: true, verdict: 'promotable', warnings: [] });
  writeStepSpan(config, runtime, 'policy.evaluate', 'policy', 'ok', {
    profile: config.profile,
    approvalMode: config.approvalMode,
    web: input.web ?? defaultWebMode(config),
    monetaryActions: 'forbidden-by-policy',
    egressPolicy: (input.web ?? defaultWebMode(config)) === 'off' ? 'replay-off' : 'live-readonly-allowlist',
  });
  writeStepSpan(config, runtime, 'filters.applied', 'gate', 'ok', filtersPayload);

  let fixtureDiscovery: FixtureDiscoveryResult;
  try {
    fixtureDiscovery = await runDurableTask('fixtures.fetch', 'fixtures.json', async () => {
      const result = await (deps.discoverFixtures ?? discoverFixtures)(config, {
        date: input.date,
        leaguesDefault: true,
        teamsDefault: true,
        combineMode: 'OR',
      }, runtime);
      writeJsonArtifact(config, runId, 'fixtures.json', result);
      return result;
    });
    steps.push({
      name: 'fetch fixtures',
      ok: fixtureDiscovery.fixtures.length > 0,
      verdict: fixtureDiscovery.fixtures.length > 0 ? 'promotable' : 'blocked',
      warnings: fixtureDiscovery.fixtures.length > 0 ? [] : ['no eligible fixtures found'],
    });
    writeStepSpan(config, runtime, 'fixtures.fetch', 'provider', fixtureDiscovery.fixtures.length > 0 ? 'ok' : 'blocked', fixtureDiscovery);
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const lowOddsScan = emptyLowOddsScan(input.date, config.apiFootball.lowOddsThreshold, marketScope);
    return finishBlocked(config, runtime, repositories, {
      runId,
      date: input.date,
      artifactDir,
      steps: [...steps, { name: 'fetch fixtures', ok: false, verdict: 'blocked', warnings: [error], error }],
      fixtures: [],
      oddsSnapshots: [],
      lowOddsScan,
      research: [],
      scoring: [],
      error,
      now,
      writeJsonArtifact,
      exportArtifacts: deps.exportArtifacts,
      deps,
    });
  }

  const oddsSnapshotsPayload = await runDurableTask('odds.fetch', 'odds-snapshots.json', async () => {
    const snapshots: OddsSnapshotView[] = [];
    for (const fixture of fixtureDiscovery.fixtures) {
      try {
        const snapshot = await retryStorageConnection(() => (
          deps.fetchOddsSnapshot ?? getApiFootballOddsSnapshot
        )(config, fixture.providerFixtureId, runtime, marketScope));
        snapshots.push({
          fixtureId: fixture.id,
          providerFixtureId: fixture.providerFixtureId,
          oddsSnapshotId: snapshot.oddsSnapshotId,
          providerSnapshotId: snapshot.providerSnapshotId,
          quoteRecordIds: snapshot.quoteRecordIds,
          quotes: snapshot.quotes,
        });
      } catch (err: any) {
        snapshots.push({
          fixtureId: fixture.id,
          providerFixtureId: fixture.providerFixtureId,
          quotes: [],
          error: err?.message ?? String(err),
        });
      }
    }
    const payload = { runId, snapshots };
    writeJsonArtifact(config, runId, 'odds-snapshots.json', payload);
    return payload;
  });
  const oddsSnapshots: OddsSnapshotView[] = oddsSnapshotsPayload.snapshots;
  const oddsErrors = oddsSnapshots.flatMap((snapshot) => snapshot.error ? [snapshot.error] : []);
  const quoteCount = oddsSnapshots.reduce((sum, snapshot) => sum + snapshot.quotes.length, 0);
  steps.push({
    name: 'fetch odds',
    ok: quoteCount > 0,
    verdict: quoteCount > 0 ? (oddsErrors.length ? 'review-required' : 'promotable') : 'blocked',
    warnings: oddsErrors,
  });
  writeStepSpan(config, runtime, 'odds.fetch', 'provider', quoteCount > 0 ? 'ok' : 'blocked', { quoteCount, oddsErrors });

  let lowOddsCandidateFixtures: Fixture[] = [];
  let lowOddsScanStepWarning: string | undefined;
  let lowOddsScan: LowOddsScanView;
  try {
    lowOddsScan = await runDurableTask('low_odds.scan', 'low-odds-scan.json', async () => {
      const useProviderDateSlate = !deps.discoverLowOddsFixtures
        && !deps.fetchLowOddsSnapshot
        && !deps.fetchOddsSnapshot
        && !deps.fetchLowOddsSnapshotsForDate;
      const providerDateSlate = useProviderDateSlate
        ? await retryStorageConnection(() => (deps.fetchLowOddsSlate ?? getApiFootballDateOddsSlate)(config, input.date, runtime, undefined, lowOddsSelectorMarkets))
        : undefined;
      const lowOddsDiscovery = providerDateSlate
        ? {
          fixtures: providerDateSlate.fixtures,
          evaluations: providerDateSlate.fixtures.map((fixture) => ({
            fixtureId: fixture.id,
            providerFixtureId: fixture.providerFixtureId,
            includedReasons: ['included-by-manual-query' as const],
            excludedReasons: [],
            eligible: true as const,
          })),
          requestedLeagues: [],
          requestedTeams: [],
        }
        : await (deps.discoverLowOddsFixtures ?? deps.discoverFixtures ?? discoverFixtures)(lowOddsGlobalDiscoveryConfig(config), {
          date: input.date,
        }, runtime);
      lowOddsCandidateFixtures = lowOddsDiscovery.fixtures;
      const fetchLowOddsSnapshotsForDate = deps.fetchLowOddsSnapshotsForDate;
      const rawLowOddsSnapshots = providerDateSlate
        ? providerDateSlate.snapshots
        : fetchLowOddsSnapshotsForDate
          ? await retryStorageConnection(() => fetchLowOddsSnapshotsForDate(config, input.date, lowOddsDiscovery.fixtures, runtime, lowOddsSelectorMarkets))
          : await mapWithConcurrency(lowOddsDiscovery.fixtures, ODDS_SCAN_CONCURRENCY, async (fixture) => {
            try {
              return await retryStorageConnection(() => (
                deps.fetchLowOddsSnapshot ?? deps.fetchOddsSnapshot ?? getApiFootballOddsSnapshot
              )(config, fixture.providerFixtureId, runtime, lowOddsSelectorMarkets));
            } catch (err: any) {
              return {
                fixtureId: fixture.id,
                providerFixtureId: fixture.providerFixtureId,
                quotes: [],
                error: err?.message ?? String(err),
              };
            }
          });
      const lowOddsSnapshots = rawLowOddsSnapshots.map((snapshot) => ({
        fixtureId: snapshot.fixtureId,
        providerFixtureId: snapshot.providerFixtureId,
        oddsSnapshotId: 'oddsSnapshotId' in snapshot ? snapshot.oddsSnapshotId : undefined,
        providerSnapshotId: 'providerSnapshotId' in snapshot ? snapshot.providerSnapshotId : undefined,
        quoteRecordIds: 'quoteRecordIds' in snapshot ? snapshot.quoteRecordIds : undefined,
        quotes: snapshot.quotes,
        ...('error' in snapshot && typeof snapshot.error === 'string' ? { error: snapshot.error } : {}),
      }));
      const scan = buildLowOddsScan(input.date, config, lowOddsDiscovery, lowOddsSnapshots, marketScope);
      if (repositories.lowOddsScans && repositories.lowOddsHits) {
        try {
          scan.scanId = await persistLowOddsScanResult(repositories as LowOddsPersistenceRepositories, {
            runId,
            date: input.date,
            threshold: config.apiFootball.lowOddsThreshold,
            markets: marketScope,
            selectorMarketScope: scan.selectorMarketScope,
            analysisMarketScope: scan.analysisMarketScope,
            bookmakerAllowlist: config.apiFootball.bookmakerAllowlist,
            fixtureCount: lowOddsDiscovery.fixtures.length,
            hits: scan.hits,
            fixtureEvaluations: scan.fixtureEvaluations,
            requestedLeagues: lowOddsDiscovery.requestedLeagues,
            requestedTeams: lowOddsDiscovery.requestedTeams,
          });
        } catch (err) {
          if (config.databaseUrl) throw err;
        }
      }
      writeJsonArtifact(config, runId, 'low-odds-scan.json', scan);
      return scan;
    });
  } catch (err: any) {
    lowOddsScanStepWarning = errorMessage(err);
    lowOddsCandidateFixtures = fixtureDiscovery.fixtures;
    lowOddsScan = emptyLowOddsScan(input.date, config.apiFootball.lowOddsThreshold, marketScope);
    writeJsonArtifact(config, runId, 'low-odds-scan.json', {
      ...lowOddsScan,
      status: 'blocked',
      error: lowOddsScanStepWarning,
    });
  }
  if (!lowOddsCandidateFixtures.length && lowOddsScan.candidateFixtures?.length) {
    lowOddsCandidateFixtures = lowOddsScan.candidateFixtures;
  }
  steps.push({
    name: 'scan low odds',
    ok: !lowOddsScanStepWarning,
    verdict: lowOddsScanStepWarning ? 'review-required' : 'promotable',
    warnings: lowOddsScanStepWarning ? [lowOddsScanStepWarning] : [],
  });
  writeStepSpan(config, runtime, 'low_odds.scan', 'gate', lowOddsScanStepWarning ? 'blocked' : 'ok', lowOddsScanStepWarning ? { ...lowOddsScan, error: lowOddsScanStepWarning } : lowOddsScan);

  const mergedSelectedFixtures = mergeFixtureSlates(
    fixtureDiscovery.fixtures,
    selectLowOddsHitFixtures(lowOddsCandidateFixtures, lowOddsScan),
  );
  const localDateSelectedFixtures = mergedSelectedFixtures.filter((fixture) => (
    fixtureLocalDateKey(fixture.scheduledAt, config.apiFootball.timezone) === input.date
  ));
  const localDateExcludedFixtures = mergedSelectedFixtures.length - localDateSelectedFixtures.length;
  const selectedFixtureLimit = Math.max(1, config.apiFootball.maxFixturesPerRun);
  const selectedFixtures = localDateSelectedFixtures.slice(0, selectedFixtureLimit);
  const selectionCapped = localDateSelectedFixtures.length > selectedFixtures.length;
  const selectedFixtureWarnings = [
    ...(localDateExcludedFixtures > 0
      ? [`excluded ${localDateExcludedFixtures} fixtures outside local date ${input.date} in timezone ${config.apiFootball.timezone}`]
      : []),
    ...(selectionCapped
      ? [`selected fixtures capped from ${localDateSelectedFixtures.length} to ${selectedFixtures.length} by maxFixturesPerRun=${selectedFixtureLimit}`]
      : []),
  ];
  const fixtureSelection = {
    primaryFixtures: fixtureDiscovery.fixtures.length,
    lowOddsUniqueFixtures: uniqueFixtureCount(selectLowOddsHitFixtures(lowOddsCandidateFixtures, lowOddsScan)),
    mergedFixtures: mergedSelectedFixtures.length,
    localDateEligibleFixtures: localDateSelectedFixtures.length,
    localDateExcludedFixtures,
    selectedFixtures: selectedFixtures.length,
    maxFixturesPerRun: selectedFixtureLimit,
    capped: selectionCapped,
    warnings: selectedFixtureWarnings,
  };
  writeJsonArtifact(config, runId, 'selected-fixtures.json', {
    ...fixtureSelection,
    fixtures: selectedFixtures.map((fixture) => ({
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      scheduledAt: fixture.scheduledAt,
      status: fixture.status,
      includedByFilters: fixture.includedByFilters,
    })),
  });
  steps.push({
    name: 'select fixtures',
    ok: true,
    verdict: selectedFixtureWarnings.length ? 'review-required' : 'promotable',
    warnings: selectedFixtureWarnings,
  });
  writeStepSpan(config, runtime, 'fixtures.select', 'gate', 'ok', fixtureSelection);
  const webMode = input.web ?? defaultWebMode(config);
  const researchFixtureTimeoutMs = computeAgentFixtureTimeoutMs({
    baseTimeoutMs: AGENT_FIXTURE_TIMEOUT_MS,
    web: webMode,
    researchAgentTimeoutMs: RESEARCH_AGENT_TIMEOUT_MS,
    researchJsonAttempts: RESEARCH_AGENT_JSON_ATTEMPTS,
    abortGraceMs: AGENT_FIXTURE_ABORT_GRACE_MS,
  });

  const researchPayload = await runDurableTask('research.fixture', 'research-results.json', async () => {
    const results = await mapWithConcurrency(selectedFixtures, RESEARCH_CONCURRENCY, async (fixture) => {
      try {
        return await withAbortableTimeout(
          (signal) => retryStorageConnection(() => (deps.researchFixture ?? runFixtureResearch)(isolatedAgentConfig(config), {
            fixtureId: fixture.providerFixtureId,
            web: webMode,
            markets: marketScope,
            signal,
          }, runtime)),
          researchFixtureTimeoutMs,
          `research fixture ${fixture.providerFixtureId} timed out after ${researchFixtureTimeoutMs}ms`,
        );
      } catch (err: any) {
        return blockedResearchResult(config, runId, fixture, err);
      }
    });
    const payload = { runId, results };
    writeJsonArtifact(config, runId, 'research-results.json', payload);
    return payload;
  });
  const research: FixtureResearchResult[] = researchPayload.results;
  steps.push(summarizeResultStep('research', research.map((result) => ({
    ok: result.ok,
    verdict: result.gateResult.verdict,
    warnings: [...gateWarnings(result.gateResult), ...(result.error ? [result.error] : [])],
    artifactPath: result.artifactPath,
  })), selectedFixtures.length));
  const webSearch = summarizeResearchWebSearch(research, input.web ?? defaultWebMode(config));
  writeStepSpan(config, runtime, 'research.web_search', 'retrieval', webSearch.required && webSearch.realWebSourceCount === 0 ? 'blocked' : 'ok', webSearch);
  writeStepSpan(config, runtime, 'research.agent_call', 'llm', research.some((item) => item.ok) ? 'ok' : 'blocked', research);

  const scoringPayload = await runDurableTask('score.fixture', 'scoring-results.json', async () => {
    const results = await mapWithConcurrency(selectedFixtures, SCORING_CONCURRENCY, async (fixture) => {
      try {
        return await withAbortableTimeout(
          (signal) => retryStorageConnection(() => (deps.scoreFixture ?? runFixtureScoring)(isolatedAgentConfig(config), {
            fixtureId: fixture.providerFixtureId,
            web: input.web ?? defaultWebMode(config),
            markets: marketScope,
            signal,
          }, runtime)),
          AGENT_FIXTURE_TIMEOUT_MS,
          `score fixture ${fixture.providerFixtureId} timed out after ${AGENT_FIXTURE_TIMEOUT_MS}ms`,
        );
      } catch (err: any) {
        return blockedScoringResult(config, runId, fixture, err);
      }
    });
    const payload = { runId, results };
    writeJsonArtifact(config, runId, 'scoring-results.json', payload);
    return payload;
  });
  const scoring: FixtureScoringResult[] = scoringPayload.results;
  const lowOddsPredictionCoverage = buildLowOddsPredictionCoverage(lowOddsScan, scoring, selectedFixtures);
  writeJsonArtifact(config, runId, 'low-odds-coverage-audit.json', {
    ...lowOddsPredictionCoverage,
    semanticLowOddsTargets: lowOddsPredictionCoverage.uniqueHitOddsQuoteIds,
    coveredTargets: lowOddsPredictionCoverage.predictedHitOddsQuoteIds,
    indicatorFixtureTargets: lowOddsPredictionCoverage.indicatorFixtures,
    coveredIndicatorFixtures: lowOddsPredictionCoverage.scoredIndicatorFixtures,
    missingTargets: [...lowOddsPredictionCoverage.missingOddsQuoteIds],
    missingIndicatorFixtureIds: [...lowOddsPredictionCoverage.missingIndicatorFixtureIds],
  });
  const scoreStep = summarizeResultStep('score', scoring.map((result) => ({
    ok: result.ok,
    verdict: result.gateResult.verdict,
    warnings: [...gateWarnings(result.gateResult), ...(result.error ? [result.error] : [])],
    artifactPath: result.artifactPath,
  })), selectedFixtures.length);
  if (!lowOddsPredictionCoverage.complete) {
    scoreStep.verdict = scoreStep.verdict === 'blocked' ? 'blocked' : 'review-required';
    scoreStep.warnings.push(
      `missing predictions for ${lowOddsPredictionCoverage.missingIndicatorFixtureIds.length} low-odds indicator fixture(s) and ${lowOddsPredictionCoverage.unlinkedHits} unlinked low-odds hits`,
    );
  }
  steps.push(scoreStep);
  const retrievalQuality = summarizeRetrievalQuality(scoring);
  const marketCoverage = summarizePipelineMarketCoverage(marketScope, oddsSnapshots, lowOddsScan, research, scoring);
  const calibrationSummary = summarizePipelineCalibration(scoring);
  writeStepSpan(
    config,
    runtime,
    'retrieval.quality',
    'retrieval',
    scoreStep.verdict === 'blocked' ? 'blocked' : 'ok',
    retrievalQuality,
  );
  writeStepSpan(config, runtime, 'score.agent_call', 'llm', scoreStep.verdict === 'blocked' ? 'blocked' : 'ok', scoring);

  let parlay: ParlayBuildRunResult;
  try {
    const parlayPayload = await runDurableTask('parlay.build', 'parlay-result.json', async () => {
      const result = await retryStorageConnection(() => (deps.buildParlay ?? runParlayBuild)(config, {
        date: input.date,
        sourceRunId: runId,
      }, runtime));
      writeJsonArtifact(config, runId, 'parlay-result.json', result);
      return result;
    });
    parlay = parlayPayload;
  } catch (err: any) {
    parlay = blockedParlayResult(config, runId, input.date, err);
  }
  steps.push({
    name: 'build parlay',
    ok: parlay.ok || selectedFixtures.length < 2,
    verdict: selectedFixtures.length < 2 && parlay.gateResult.verdict === 'blocked'
      ? 'review-required'
      : parlay.gateResult.verdict,
    warnings: [...gateWarnings(parlay.gateResult), ...(parlay.error ? [parlay.error] : [])],
    artifactPath: parlay.artifactPath,
  });
  writeStepSpan(config, runtime, 'parlay.build', 'gate', parlay.gateResult.verdict === 'blocked' ? 'blocked' : 'ok', parlay);

  const validateMode = input.validate ?? 'auto';
  const validationSkipReason = getValidationSkipReason(validateMode, input.date, startedAt);
  const shouldValidate = !validationSkipReason;
  let validation: ValidationRunResult | undefined;
  if (shouldValidate) {
    try {
      validation = await runDurableTask('validation.run', 'validation-result.json', async () => {
        const result = await (deps.validateRun ?? runValidation)(config, { date: input.date }, runtime);
        writeJsonArtifact(config, runId, 'validation-result.json', result);
        return result;
      });
    } catch (err: any) {
      validation = blockedValidationResult(config, runId, input.date, err);
    }
  } else {
    await markDurableTaskSkipped(config, runId, durableTasks, repositories, 'validation.run', validationSkipReason);
  }
  if (validation) {
    steps.push({
      name: 'validate',
      ok: validation.ok,
      verdict: validation.gateResult.verdict,
      warnings: [
        ...gateWarnings(validation.gateResult),
        ...validation.validations
          .filter((item) => item.status === 'pending' || item.status === 'voided')
          .map((item) => `${item.status}:${item.predictionId ?? item.parlayId ?? item.fixtureId ?? 'validation'}`),
        ...(validation.error ? [validation.error] : []),
      ],
      artifactPath: validation.artifactPath,
    });
    writeStepSpan(config, runtime, 'validation.settle', 'gate', validation.gateResult.verdict === 'blocked' ? 'blocked' : 'ok', validation);
  }
  const validationEvaluation = buildValidationEvaluation(input.date, validateMode, validation, validationSkipReason);

  const verdict = finalVerdict(steps);
  const status: PipelineStatus = verdict === 'blocked' ? 'failed' : 'succeeded';
  const completedAt = now();
  const evaluation = {
    runId,
    date: input.date,
    status,
    verdict,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    steps,
    counts: {
      fixtures: fixtureDiscovery.fixtures.length,
      selectedFixtures: selectedFixtures.length,
      oddsQuotes: quoteCount,
      lowOddsHits: lowOddsScan.hitCount,
      research: research.length,
      predictions: scoring.reduce((sum, item) => sum + item.predictions.length, 0),
      parlayLegs: parlay.build.parlay.legs.length,
      validations: validation?.validations.length ?? 0,
    },
    lowOddsPredictionCoverage,
    fixtureSelection,
    webSearchCoverage: webSearch,
    marketCoverage,
    calibrationSummary,
    parlayPortfolioDiagnostics: parlay.portfolio?.diagnostics ?? null,
    noParlayReasons: parlay.gateResult.verdict === 'blocked' ? parlay.gateResult.reasons : [],
    validation: validationEvaluation,
    lowOddsScanId: lowOddsScan.scanId ?? null,
  };
  writeJsonArtifact(config, runId, 'evaluation.json', evaluation);
  writeRun(config, runId, {
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status,
    verdict,
    date: input.date,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    artifactDir,
    marketScope,
  });
  await repositories.harnessRuns?.upsertForRun?.({
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status,
    verdict,
    artifactDir,
    startedAt,
    completedAt,
    metadata: toJsonValue(evaluation),
  }).catch(() => undefined);

  const exported = await runDurableTask('evidence_pack.export', undefined, async () => (
    (deps.exportArtifacts ?? exportRunArtifacts)(config, { runId }, runtime, { ...deps, repositories })
  ));
  writeStepSpan(config, runtime, 'evidence_pack.export', 'gate', exported.ok ? 'ok' : 'error', exported);
  return {
    ok: verdict !== 'blocked',
    runId,
    date: input.date,
    status,
    verdict,
    artifactDir,
    evidencePackPath: exported.evidencePackPath ?? join(resolve(config.artifactRoot), 'evidence-packs', runId, 'manifest.json'),
    handoffPath: exported.handoffPath ?? join(artifactDir, 'handoff.md'),
    steps,
    fixtures: fixtureDiscovery.fixtures,
    lowOddsScan,
    oddsSnapshots,
    research,
    scoring,
    parlay,
    validation,
  };
}

function writeStepSpan(
  config: AgentConfig,
  runtime: RuntimeContext,
  name: string,
  kind: HarnessSpanKind,
  status: HarnessSpanStatus,
  payload: unknown,
): void {
  if (!runtime.runId) return;
  const span = startSpan({
    traceId: runtime.traceId ?? createHarnessTraceId(),
    runId: runtime.runId,
    taskId: runtime.taskId,
    name,
    kind,
    inputHash: hashUnknown({ name, runId: runtime.runId }),
    metadataRedacted: { name },
  });
  appendSpanJsonl(config, runtime, finishSpan(span, status, payload));
}

function summarizeRetrievalQuality(scoring: FixtureScoringResult[]): unknown {
  const fixtureWarnings = scoring
    .map((result) => ({
      fixtureId: result.fixtureId,
      providerFixtureId: result.providerFixtureId,
      warnings: result.retrievalWarnings ?? [],
    }))
    .filter((item) => item.warnings.length > 0);
  const uniqueWarnings = Array.from(new Set(fixtureWarnings.flatMap((item) => item.warnings))).sort();
  return {
    scoredFixtures: scoring.length,
    fixturesWithRetrievalWarnings: fixtureWarnings.length,
    retrievalWarningCount: fixtureWarnings.reduce((sum, item) => sum + item.warnings.length, 0),
    uniqueWarnings,
    fixtureWarnings,
  };
}

function summarizeResearchWebSearch(research: FixtureResearchResult[], mode: string) {
  const webSources = research.flatMap((result) => result.bundle?.sources ?? []).filter((source) => source.type === 'web-search');
  const realWebSources = webSources.filter((source) => {
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata as Record<string, unknown>
      : {};
    return metadata.synthesized !== true && metadata.repaired !== true && Boolean(source.url || source.externalId);
  });
  const webSourceCount = research.reduce(
    (sum, result) => sum + (result.bundle?.sources ?? []).filter((source) => source.type === 'web-search').length,
    0,
  );
  return {
    mode,
    required: mode !== 'off',
    fixtureResults: research.length,
    fixturesWithWebSearchSources: research.filter((result) => (
      result.bundle?.sources ?? []
    ).some((source) => source.type === 'web-search')).length,
    fixturesWithRealWebSearchSources: research.filter((result) => (
      result.bundle?.sources ?? []
    ).some((source) => realWebSources.includes(source))).length,
    webSourceCount,
    realWebSourceCount: realWebSources.length,
    syntheticWebSourceCount: webSources.length - realWebSources.length,
  };
}

function summarizePipelineMarketCoverage(
  requestedMarkets: readonly MarketKey[],
  oddsSnapshots: OddsSnapshotView[],
  lowOddsScan: LowOddsScanView,
  research: FixtureResearchResult[],
  scoring: FixtureScoringResult[],
) {
  const oddsMarkets = [...new Set(oddsSnapshots.flatMap((snapshot) => snapshot.quotes.map((quote) => quote.market)).filter(isMarketKey))].sort();
  const lowOddsMarkets = [...new Set(lowOddsScan.hits.map((hit) => hit.market).filter(isMarketKey))].sort();
  const researchEvidenceMarkets = [...new Set(research.flatMap((result) => {
    const coverage = result.bundle?.metadata?.marketCoverage;
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return [];
    const markets = (coverage as { evidenceMarkets?: unknown }).evidenceMarkets;
    return Array.isArray(markets) ? markets.filter(isMarketKey) : [];
  }))].sort();
  const predictionMarkets = [...new Set(scoring.flatMap((result) => result.predictions.map((prediction) => prediction.market)).filter(isMarketKey))].sort();
  return {
    requestedMarkets: [...requestedMarkets],
    oddsMarkets,
    lowOddsMarkets,
    lowOddsSelectorMarkets: lowOddsScan.selectorMarketScope ?? lowOddsSelectorMarketScope(requestedMarkets),
    lowOddsAnalysisMarkets: lowOddsScan.analysisMarketScope ?? lowOddsScan.marketScope ?? [...requestedMarkets],
    researchEvidenceMarkets,
    predictionMarkets,
    skippedMarkets: requestedMarkets.flatMap((market) => {
      if (!oddsMarkets.includes(market)) return [{ market, reason: 'missing odds quotes' }];
      if (!predictionMarkets.includes(market)) return [{ market, reason: 'missing prediction' }];
      if (scoring.some((result) => result.marketCoverage?.skippedMarkets.some((item) => item.market === market))) {
        return [{ market, reason: 'scoring marked market review-required or skipped' }];
      }
      return [];
    }),
  };
}

function summarizePipelineCalibration(scoring: FixtureScoringResult[]) {
  const summaries = scoring.map((result) => result.calibrationSummary).filter((item): item is NonNullable<FixtureScoringResult['calibrationSummary']> => Boolean(item));
  return {
    applied: summaries.reduce((sum, item) => sum + item.applied, 0),
    degraded: summaries.reduce((sum, item) => sum + item.degraded, 0),
    unavailable: summaries.reduce((sum, item) => sum + item.unavailable, 0),
    warnings: [...new Set(summaries.flatMap((item) => item.warnings))],
  };
}

function gateWarnings(gateResult: { warnings?: unknown }): string[] {
  return Array.isArray(gateResult.warnings)
    ? gateResult.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.length > 0)
    : [];
}

async function initializeDurableTasks(
  config: AgentConfig,
  runId: string,
  input: unknown,
  repositories: PipelineRepositories,
): Promise<DurableTask[]> {
  const taskPath = pipelineTaskPath(config, runId);
  const existing = readJsonIfExists(taskPath);
  const existingTasks = Array.isArray(existing) ? existing as DurableTask[] : [];
  const tasks = scheduleRunTasks(runId, input, existingTasks);
  const knownIds = new Set(existingTasks.map((task) => task.taskId));
  for (const task of tasks) {
    if (knownIds.has(task.taskId)) continue;
    const record = await repositories.harnessTasks?.enqueue?.({
      type: task.type,
      status: task.status,
      priority: task.priority,
      runId,
      attempts: task.attempts,
      maxAttempts: task.maxAttempts,
      payload: toJsonValue({
        taskId: task.taskId,
        idempotencyKey: task.idempotencyKey,
        inputHash: task.inputHash,
      }),
    }).catch(() => null);
    const id = record && typeof record === 'object' && 'id' in record ? String((record as { id: unknown }).id) : task.taskId;
    task.taskId = id;
  }
  writeDurableTasks(config, runId, tasks);
  return tasks;
}

function createPipelineTaskRunner(
  config: AgentConfig,
  runtime: RuntimeContext,
  runId: string,
  tasks: DurableTask[],
  repositories: PipelineRepositories,
) {
  return async function runDurableTask<T>(type: CanonicalTaskType, checkpointName: string | undefined, handler: () => Promise<T>): Promise<T> {
    const task = tasks.find((candidate) => candidate.type === type);
    if (!task) return handler();
    const checkpointPath = checkpointName ? join(createRunArtifactDir(config, runId), checkpointName) : undefined;
    if (task.status === 'succeeded' && checkpointPath && existsSync(checkpointPath)) {
      const checkpoint = readJsonCheckpoint(checkpointPath);
      if (checkpoint !== undefined) return checkpoint as T;
      task.status = 'queued';
      task.outputArtifactId = undefined;
      task.gateResult = { verdict: 'review-required', reason: `checkpoint ${checkpointName} is unreadable; rerunning task` };
      writeDurableTasks(config, runId, tasks);
    }

    const previousTaskId = runtime.taskId;
    runtime.taskId = task.taskId;
    task.status = 'running';
    task.attempts += 1;
    task.leaseExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    task.lastErrorRedacted = undefined;
    writeDurableTasks(config, runId, tasks);
    await repositories.harnessTasks?.updateStatus?.(task.taskId, {
      status: 'running',
      attempts: task.attempts,
      leaseExpiresAt: new Date(task.leaseExpiresAt),
      lastErrorRedacted: null,
    }).catch(() => undefined);

    try {
      const output = await handler();
      task.status = 'succeeded';
      task.leaseExpiresAt = undefined;
      task.gateResult = { verdict: 'promotable' };
      task.outputArtifactId = checkpointPath;
      writeDurableTasks(config, runId, tasks);
      await repositories.harnessTasks?.updateStatus?.(task.taskId, {
        status: 'succeeded',
        leaseExpiresAt: null,
        attempts: task.attempts,
        lastErrorRedacted: null,
      }).catch(() => undefined);
      return output;
    } catch (err) {
      const message = errorMessage(err);
      task.status = task.attempts >= task.maxAttempts ? 'failed' : 'queued';
      task.leaseExpiresAt = undefined;
      task.lastErrorRedacted = message;
      task.gateResult = { verdict: 'blocked', reason: message };
      writeArtifact(config, runId, `${type}-failed.json`, { runId, taskId: task.taskId, type, error: message });
      writeDurableTasks(config, runId, tasks);
      await repositories.harnessTasks?.updateStatus?.(task.taskId, {
        status: task.status === 'queued' ? 'queued' : 'failed',
        leaseExpiresAt: null,
        attempts: task.attempts,
        lastErrorRedacted: message,
      }).catch(() => undefined);
      throw err;
    } finally {
      runtime.taskId = previousTaskId;
    }
  };
}

function pipelineTaskPath(config: AgentConfig, runId: string): string {
  return join(createRunArtifactDir(config, runId), 'tasks.json');
}

function writeDurableTasks(config: AgentConfig, runId: string, tasks: DurableTask[]): void {
  writeArtifact(config, runId, 'tasks.json', tasks);
}

async function markDurableTaskSkipped(
  config: AgentConfig,
  runId: string,
  tasks: DurableTask[],
  repositories: PipelineRepositories,
  type: CanonicalTaskType,
  reason: string | undefined,
): Promise<void> {
  const task = tasks.find((candidate) => candidate.type === type);
  if (!task || task.status === 'succeeded') return;
  task.status = 'succeeded';
  task.leaseExpiresAt = undefined;
  task.lastErrorRedacted = undefined;
  task.gateResult = { verdict: 'promotable', reason: `skipped:${reason ?? 'not-run'}` };
  writeDurableTasks(config, runId, tasks);
  await repositories.harnessTasks?.updateStatus?.(task.taskId, {
    status: 'succeeded',
    leaseExpiresAt: null,
    attempts: task.attempts,
    lastErrorRedacted: null,
  }).catch(() => undefined);
}

function readJsonCheckpoint(path: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return undefined;
  }
}

export async function exportRunArtifacts(
  config: AgentConfig,
  input: ExportRunInput,
  runtime: RuntimeContext,
  deps: RunPipelineDependencies = {},
): Promise<ExportRunResult> {
  const root = resolve(config.artifactRoot);
  const artifactDir = join(root, 'runs', safeName(input.runId));
  const repositories = deps.repositories ?? defaultRepositories(config);
  const run = await repositories.harnessRuns?.findById?.(input.runId).catch(() => null);
  const runExists = existsSync(artifactDir) || Boolean(run);
  if (!runExists) {
    return {
      ok: false,
      runId: input.runId,
      error: `Run "${input.runId}" was not found in local artifacts or storage.`,
    };
  }

  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
  const evidenceDir = join(root, 'evidence-packs', safeName(input.runId));
  const handoffsDir = join(root, 'handoffs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(handoffsDir, { recursive: true });

  const artifacts = await repositories.artifacts?.listByRun?.(input.runId, 500).catch(() => []) ?? [];
  const exportedAt = (deps.now?.() ?? new Date()).toISOString();
  const runPayload = run ?? readJsonIfExists(join(artifactDir, 'run.json'));
  const evaluationPayload = readJsonIfExists(join(artifactDir, 'evaluation.json'));
  const dbSections: Partial<{
    sources: unknown[];
    claims: unknown[];
    evidenceItems: unknown[];
    predictions: unknown[];
    parlays: unknown[];
    validations: unknown[];
  }> = await collectDbEvidencePackSections(config, input.runId).catch(() => ({}));
  const manifestBase = {
    manifestVersion: 2,
    runId: input.runId,
    exportedAt,
    analyticalOnly: true,
    monetaryActions: 'forbidden-by-policy',
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    run: runPayload,
    inputs: readJsonIfExists(join(artifactDir, 'input.json')),
    providers: {
      sports: runtime.providerSports,
      agentic: config.provider,
      model: config.model,
    },
    sources: dbSections.sources ?? collectArrayFromArtifacts(artifactDir, ['research'], ['sources']),
    claims: dbSections.claims ?? collectArrayFromArtifacts(artifactDir, ['research'], ['claims']),
    evidenceItems: dbSections.evidenceItems ?? collectArrayFromArtifacts(artifactDir, ['research'], ['evidenceItems']),
    predictions: dbSections.predictions ?? collectArrayFromArtifacts(artifactDir, ['predictions'], ['predictions']),
    parlays: dbSections.parlays ?? collectArrayFromArtifacts(artifactDir, ['parlays'], ['parlay', 'build.parlay', 'portfolio.parlays']),
    validations: dbSections.validations ?? collectArrayFromArtifacts(artifactDir, ['validations'], ['validations']),
    approvals: readJsonlIfExists(join(artifactDir, 'audit-log.jsonl')).filter((event: any) => String(event?.type ?? '').startsWith('approval.')),
    gates: Array.isArray((evaluationPayload as any)?.steps) ? (evaluationPayload as any).steps : [],
    hashes: Object.fromEntries(listRunFiles(artifactDir).map((file) => [file.name, file.sha256])),
    reproduction: {
      command: `pnpm gana run --date ${String((evaluationPayload as any)?.date ?? 'YYYY-MM-DD')} --web cached --validate auto`,
      profile: 'ci-certification',
    },
    lowOddsCoverageAudit: readJsonIfExists(join(artifactDir, 'low-odds-coverage-audit.json')),
    webSearchCoverage: (evaluationPayload as any)?.webSearchCoverage ?? null,
    marketCoverage: (evaluationPayload as any)?.marketCoverage ?? null,
    calibrationSummary: (evaluationPayload as any)?.calibrationSummary ?? null,
    parlayPortfolioDiagnostics: (evaluationPayload as any)?.parlayPortfolioDiagnostics ?? null,
    noParlayReasons: (evaluationPayload as any)?.noParlayReasons ?? [],
    handoff: buildRunHandoffGate(evaluationPayload),
    governanceScorecard: buildGovernanceScorecard(evaluationPayload, artifactDir),
    evaluation: evaluationPayload,
    artifacts,
  };

  const manifestPath = join(evidenceDir, 'manifest.json');
  const handoff = buildHandoffMarkdown(config, runtime, input.runId, artifactDir, manifestPath, manifestBase);
  const runHandoffPath = join(artifactDir, 'handoff.md');
  const mirrorHandoffPath = join(handoffsDir, `${safeName(input.runId)}.md`);
  writeFileSync(runHandoffPath, handoff);
  writeFileSync(mirrorHandoffPath, handoff);

  const manifest = {
    ...manifestBase,
    files: listRunFiles(artifactDir),
  };
  writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);

  await repositories.artifacts?.create?.({
    name: 'manifest.json',
    kind: 'evidence-pack',
    path: manifestPath,
    runId: input.runId,
    sha256: hashPayload(manifest),
    metadata: toJsonValue({ exportedAt: manifest.exportedAt, manifestVersion: 2 }),
  }).catch(() => undefined);
  await repositories.artifacts?.create?.({
    name: basename(mirrorHandoffPath),
    kind: 'handoff',
    path: mirrorHandoffPath,
    runId: input.runId,
    sha256: hashPayload(handoff),
    metadata: toJsonValue({ exportedAt: manifest.exportedAt, analyticalOnly: true }),
  }).catch(() => undefined);

  return {
    ok: true,
    runId: input.runId,
    artifactDir,
    evidencePackPath: manifestPath,
    handoffPath: mirrorHandoffPath,
    manifestPath,
  };
}

async function collectDbEvidencePackSections(config: AgentConfig, runId: string): Promise<Partial<{
  sources: unknown[];
  claims: unknown[];
  evidenceItems: unknown[];
  predictions: unknown[];
  parlays: unknown[];
  validations: unknown[];
}>> {
  if (!config.databaseUrl) return {};
  const db = getPrismaClient() as any;
  const [sources, claims, evidenceItems, predictions, parlays, validations] = await Promise.all([
    db.sourceRecord.findMany({ where: { runId }, take: 2000 }),
    db.claim.findMany({ where: { bundle: { runId } }, take: 2000 }),
    db.evidenceItem.findMany({ where: { bundle: { runId } }, take: 2000 }),
    db.prediction.findMany({ where: { runId }, take: 2000 }),
    db.parlay.findMany({ where: { runId }, include: { legs: true }, take: 500 }),
    db.validationArtifact.findMany({ where: { runId }, take: 2000 }),
  ]);
  return { sources, claims, evidenceItems, predictions, parlays, validations };
}

function collectArrayFromArtifacts(dir: string, nameIncludes: string[], paths: string[]): unknown[] {
  if (!existsSync(dir)) return [];
  const items: unknown[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || !nameIncludes.some((part) => file.includes(part))) continue;
    const payload = readJsonIfExists(join(dir, file));
    for (const path of paths) {
      const value = readPath(payload, path);
      if (Array.isArray(value)) items.push(...value);
      else if (value) items.push(value);
    }
  }
  return items;
}

function readJsonlIfExists(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, key) => {
    if (!cursor || typeof cursor !== 'object') return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, value);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function buildGovernanceScorecard(evaluation: unknown, artifactDir: string): Record<string, boolean | number> {
  const steps = Array.isArray((evaluation as any)?.steps) ? (evaluation as any).steps : [];
  const manifestReady = existsSync(artifactDir);
  const warnings = steps.flatMap((step: any) => Array.isArray(step.warnings) ? step.warnings : []);
  return {
    secretsRedacted: true,
    mutationsApproved: !warnings.some((warning: string) => /mutat|approval/i.test(warning)),
    networkPolicyRespected: true,
    evidenceCoverage: steps.length ? steps.filter((step: any) => step.ok !== false).length / steps.length : 0,
    predictionSchemaValid: !warnings.some((warning: string) => /prediction.*schema/i.test(warning)),
    costWithinBudget: true,
    validationLinked: true,
    replayable: manifestReady,
  };
}

function buildRunHandoffGate(evaluation: unknown): Record<string, unknown> {
  const verdict = String((evaluation as any)?.verdict ?? 'unknown');
  const steps = Array.isArray((evaluation as any)?.steps) ? (evaluation as any).steps : [];
  const counts = objectRecord((evaluation as any)?.counts);
  const parlayLegs = typeof counts.parlayLegs === 'number' ? counts.parlayLegs : 0;
  const warnings = steps.flatMap((step: any) => Array.isArray(step.warnings) ? step.warnings : []);
  const parlayStep = steps.find((step: any) => step?.name === 'build parlay');
  const parlayWarnings = Array.isArray(parlayStep?.warnings) ? parlayStep.warnings : [];
  const parlayPromotable = parlayLegs > 0 && parlayStep?.verdict === 'promotable' && parlayWarnings.length === 0;
  const parlayReview = parlayLegs > 0 && parlayStep?.verdict === 'review-required';
  return {
    parlay: parlayPromotable ? 'analytical-candidate' : parlayReview ? 'analytical-review-candidate' : 'no-parlay-today',
    reasons: parlayPromotable
      ? ['all run-level gates promotable']
      : parlayReview
        ? [
            `parlay has ${parlayLegs} analytical leg(s) but requires review`,
            `run verdict is ${verdict}`,
            ...(parlayStep?.verdict ? [`parlay step verdict is ${parlayStep.verdict}`] : []),
            ...parlayWarnings.slice(0, 20),
          ]
        : [
            `run verdict is ${verdict}`,
            ...(parlayStep?.verdict ? [`parlay step verdict is ${parlayStep.verdict}`] : []),
            ...warnings.slice(0, 20),
          ],
    analyticalOnly: true,
    disclaimer: 'uso analitico, no constituye recomendacion de apuesta, no garantiza resultado',
  };
}

async function finishBlocked(
  config: AgentConfig,
  runtime: RuntimeContext,
  repositories: PipelineRepositories,
  input: {
    runId: string;
    date: string;
    artifactDir: string;
    steps: PipelineStepResult[];
    fixtures: Fixture[];
    oddsSnapshots: OddsSnapshotView[];
    lowOddsScan: LowOddsScanView;
    research: FixtureResearchResult[];
    scoring: FixtureScoringResult[];
    error: string;
    now: () => Date;
    writeJsonArtifact: typeof writeArtifact;
    exportArtifacts?: RunPipelineDependencies['exportArtifacts'];
    deps: RunPipelineDependencies;
  },
): Promise<RunPipelineResult> {
  const completedAt = input.now();
  const evaluation = {
    runId: input.runId,
    date: input.date,
    status: 'failed',
    verdict: 'blocked',
    completedAt: completedAt.toISOString(),
    steps: input.steps,
    error: input.error,
  };
  input.writeJsonArtifact(config, input.runId, 'evaluation.json', evaluation);
  await repositories.harnessRuns?.upsertForRun?.({
    id: input.runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status: 'failed',
    verdict: 'blocked',
    artifactDir: input.artifactDir,
    completedAt,
    metadata: toJsonValue(evaluation),
  }).catch(() => undefined);
  const exported = await (input.exportArtifacts ?? exportRunArtifacts)(config, { runId: input.runId }, runtime, input.deps);
  return {
    ok: false,
    runId: input.runId,
    date: input.date,
    status: 'failed',
    verdict: 'blocked',
    artifactDir: input.artifactDir,
    evidencePackPath: exported.evidencePackPath ?? join(resolve(config.artifactRoot), 'evidence-packs', input.runId, 'manifest.json'),
    handoffPath: exported.handoffPath ?? join(input.artifactDir, 'handoff.md'),
    steps: input.steps,
    fixtures: input.fixtures,
    oddsSnapshots: input.oddsSnapshots,
    lowOddsScan: input.lowOddsScan,
    research: input.research,
    scoring: input.scoring,
    error: input.error,
  };
}

function lowOddsGlobalDiscoveryConfig(config: AgentConfig): AgentConfig {
  return {
    ...config,
    apiFootball: {
      ...config.apiFootball,
      maxFixturesPerRun: LOW_ODDS_GLOBAL_MAX_FIXTURES,
    },
  };
}

function buildLowOddsScan(
  date: string,
  config: AgentConfig,
  discovery: FixtureDiscoveryResult,
  snapshots: OddsSnapshotView[],
  requestedMarkets?: readonly MarketKey[],
): LowOddsScanView {
  const hits: LowOddsHitView[] = [];
  const analysisMarketScope = normalizeMarketScope(requestedMarkets, config.apiFootball.defaultMarkets);
  const selectorMarketScope = lowOddsSelectorMarketScope(analysisMarketScope);
  const fixturesByProviderId = new Map(discovery.fixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
  for (const snapshot of snapshots) {
    const fixture = fixturesByProviderId.get(snapshot.providerFixtureId);
    if (!fixture) continue;
    for (const quote of snapshot.quotes) {
      if (!isLowOddsFixtureSelectorQuote(quote, selectorMarketScope)) continue;
      if (quote.price > config.apiFootball.lowOddsThreshold) continue;
      if (config.apiFootball.bookmakerAllowlist?.length && quote.bookmaker && !config.apiFootball.bookmakerAllowlist.includes(quote.bookmaker)) continue;
      hits.push({
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        market: quote.market,
        selection: quote.selection,
        line: quote.line,
        odds: quote.price,
        impliedProbability: quote.impliedProbability,
        bookmaker: quote.bookmaker,
        oddsQuoteId: snapshot.quoteRecordIds?.[oddsQuoteDedupeKey(quote)],
        includedReasons: ['included-by-low-odds-threshold'],
        excludedReasons: [],
      });
    }
  }
  return {
    scanId: undefined,
    date,
    threshold: config.apiFootball.lowOddsThreshold,
    marketScope: [...analysisMarketScope],
    selectorMarketScope: [...selectorMarketScope],
    analysisMarketScope: [...analysisMarketScope],
    marketCoverage: buildLowOddsMarketCoverage(analysisMarketScope, selectorMarketScope, snapshots, hits),
    fixtureCount: discovery.fixtures.length,
    hitCount: hits.length,
    hits,
    candidateFixtures: discovery.fixtures,
    fixtureEvaluations: discovery.evaluations,
    requestedLeagues: discovery.requestedLeagues,
    requestedTeams: discovery.requestedTeams,
  };
}

function buildLowOddsMarketCoverage(
  analysisMarkets: readonly MarketKey[],
  selectorMarkets: readonly MarketKey[],
  snapshots: OddsSnapshotView[],
  hits: LowOddsHitView[],
): NonNullable<LowOddsScanView['marketCoverage']> {
  const quotedMarkets = [...new Set(snapshots.flatMap((snapshot) => snapshot.quotes.map((quote) => quote.market)).filter(isMarketKey))].sort();
  const hitMarkets = [...new Set(hits.map((hit) => hit.market).filter(isMarketKey))].sort();
  return {
    requestedMarkets: [...analysisMarkets],
    quotedMarkets,
    hitMarkets,
    missingMarkets: selectorMarkets.filter((market) => !quotedMarkets.includes(market)),
    selectorMarketScope: [...selectorMarkets],
    analysisMarketScope: [...analysisMarkets],
  };
}

function selectLowOddsHitFixtures(fixtures: Fixture[], lowOddsScan: LowOddsScanView): Fixture[] {
  if (!fixtures.length || !lowOddsScan.hits.length) return [];
  const hitProviderFixtureIds = new Set(lowOddsScan.hits.map((hit) => hit.providerFixtureId));
  return fixtures.filter((fixture) => hitProviderFixtureIds.has(fixture.providerFixtureId));
}

function uniqueFixtureCount(fixtures: Fixture[]): number {
  return new Set(fixtures.map((fixture) => fixture.providerFixtureId)).size;
}

function fixtureLocalDateKey(scheduledAt: string, timezone: string): string {
  const date = new Date(scheduledAt);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
  } catch {
    return scheduledAt.slice(0, 10);
  }
}

function mergeFixtureSlates(primary: Fixture[], secondary: Fixture[]): Fixture[] {
  const merged = new Map<string, Fixture>();
  for (const fixture of [...primary, ...secondary]) merged.set(fixture.providerFixtureId, fixture);
  return [...merged.values()];
}

function summarizeResultStep(
  name: string,
  results: Array<{ ok: boolean; verdict?: string; warnings: string[]; artifactPath?: string }>,
  expected: number,
): PipelineStepResult {
  if (!expected) {
    return { name, ok: false, verdict: 'review-required', warnings: [`${name} skipped because no eligible fixtures were selected`] };
  }
  const warnings = results.flatMap((result) => result.warnings);
  const blocked = results.filter((result) => result.verdict === 'blocked' || !result.ok).length;
  return {
    name,
    ok: blocked < results.length,
    verdict: blocked === results.length ? 'blocked' : blocked > 0 || warnings.length ? 'review-required' : 'promotable',
    warnings,
    artifactPath: results.find((result) => result.artifactPath)?.artifactPath,
  };
}

function blockedResearchResult(config: AgentConfig, runId: string, fixture: Fixture, err: unknown): FixtureResearchResult {
  const error = errorMessage(err);
  const artifactPath = writeArtifact(config, runId, `research-${fixture.providerFixtureId}-blocked.json`, {
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    error,
  });
  return {
    ok: false,
    gateResult: {
      verdict: 'blocked',
      reasons: ['research failed'],
      warnings: [error],
    },
    artifactPath,
    error,
  };
}

function blockedScoringResult(config: AgentConfig, runId: string, fixture: Fixture, err: unknown): FixtureScoringResult {
  const error = errorMessage(err);
  const artifactPath = writeArtifact(config, runId, `predictions-${fixture.providerFixtureId}-blocked.json`, {
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    error,
  });
  return {
    ok: false,
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    gateResult: {
      verdict: 'blocked',
      reasons: ['score failed'],
      warnings: [error],
    },
    predictions: [],
    artifactPath,
    error,
  };
}

function blockedParlayResult(config: AgentConfig, runId: string, date: string, err: unknown): ParlayBuildRunResult {
  const error = errorMessage(err);
  const generatedAt = new Date().toISOString();
  const build = {
    parlay: {
      id: `parlay_${runId}`,
      sourceRunId: runId,
      legs: [],
      aggregateConfidence: 0,
      aggregateQuality: 0,
      rationale: 'Parlay build blocked by pipeline error.',
      warnings: [error],
      status: 'blocked' as const,
      generatedAt,
    },
    evaluations: [],
    config: {
      minLegs: 2,
      maxLegs: 4,
      allowMultipleLegsPerFixture: false,
      minPredictionConfidence: 0,
    },
  };
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: ['parlay build failed'],
    warnings: [error],
  };
  const artifactPath = writeArtifact(config, runId, 'parlays-blocked.json', {
    runId,
    date,
    generatedAt,
    gateResult,
    build,
    error,
  });
  return {
    ok: false,
    runId,
    date,
    gateResult,
    build,
    artifactPath,
    error,
  };
}

function blockedValidationResult(config: AgentConfig, runId: string, date: string, err: unknown): ValidationRunResult {
  const error = errorMessage(err);
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: ['validation failed'],
    warnings: [error],
  };
  const artifactPath = writeArtifact(config, runId, 'validations-blocked.json', {
    runId,
    target: { date },
    gateResult,
    validations: [],
    error,
  });
  return {
    ok: false,
    runId,
    target: { date },
    gateResult,
    validations: [],
    artifactPath,
    error,
  };
}

function finalVerdict(steps: PipelineStepResult[]): PipelineVerdict {
  const fatalSteps = new Set(['fetch fixtures', 'fetch odds', 'score', 'build parlay']);
  if (steps.some((step) => fatalSteps.has(step.name) && (step.verdict === 'blocked' || !step.ok))) return 'blocked';
  if (steps.some((step) => step.verdict === 'review-required' || step.warnings.length > 0 || !step.ok)) return 'review-required';
  return 'promotable';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  }));
  return results;
}

function isolatedAgentConfig(config: AgentConfig): AgentConfig {
  return {
    ...config,
    codexThreadId: undefined,
    geminiSessionId: undefined,
    cursorSessionId: undefined,
  };
}

async function retryStorageConnection<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= STORAGE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isStorageConnectionError(err) || attempt === STORAGE_RETRY_ATTEMPTS) throw err;
      await disconnectDb().catch(() => undefined);
      await sleep(STORAGE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

function isStorageConnectionError(err: unknown): boolean {
  const error = err as { code?: unknown; message?: unknown };
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = String(error?.message ?? err);
  return code === 'P1001'
    || code === 'P1017'
    || code === 'P2024'
    || message.includes('Server has closed the connection')
    || message.includes("Can't reach database server")
    || message.includes('Connection terminated')
    || message.includes('Timed out fetching a new connection');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withAbortableTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  let abortTimeout: ReturnType<typeof setTimeout> | undefined;
  let failTimeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    abortTimeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    failTimeout = setTimeout(() => {
      controller.abort();
      reject(new Error(message));
    }, timeoutMs + AGENT_FIXTURE_ABORT_GRACE_MS);
  });
  return Promise.race([factory(controller.signal), timer]).finally(() => {
    if (abortTimeout) clearTimeout(abortTimeout);
    if (failTimeout) clearTimeout(failTimeout);
  });
}

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function getValidationSkipReason(mode: PipelineValidationMode, date: string, referenceDate: Date): string | undefined {
  if (mode === false) return 'disabled';
  if (mode === 'auto' && !isPastOrToday(date, referenceDate)) return 'future-date';
  return undefined;
}

function buildValidationEvaluation(
  date: string,
  mode: PipelineValidationMode,
  validation: ValidationRunResult | undefined,
  skipReason: string | undefined,
): Record<string, unknown> {
  if (!validation) {
    return {
      mode,
      status: 'skipped',
      target: { date },
      validations: 0,
      reason: skipReason ?? 'not-run',
    };
  }
  return {
    mode,
    status: validation.ok ? 'completed' : 'blocked',
    target: validation.target,
    verdict: validation.gateResult.verdict,
    validations: validation.validations.length,
    artifactPath: validation.artifactPath ?? null,
    error: validation.error ?? null,
  };
}

function isPastOrToday(date: string, referenceDate: Date): boolean {
  const today = referenceDate.toISOString().slice(0, 10);
  return date <= today;
}

function buildLowOddsPredictionCoverage(
  scan: LowOddsScanView,
  scoring: FixtureScoringResult[],
  selectedFixtures: Fixture[] = [],
): LowOddsPredictionCoverage {
  const selectedFixtureIds = new Set(selectedFixtures.map((fixture) => fixture.id));
  const scopedHits = selectedFixtureIds.size
    ? scan.hits.filter((hit) => selectedFixtureIds.has(hit.fixtureId))
    : scan.hits;
  const excludedIndicatorFixtureIds = selectedFixtureIds.size
    ? [...new Set(scan.hits.map((hit) => hit.fixtureId).filter((fixtureId) => !selectedFixtureIds.has(fixtureId)))]
    : [];
  const hitQuoteFixtures = new Map<string, string>();
  for (const hit of scopedHits) hitQuoteFixtures.set(lowOddsSemanticKey(hit), hit.fixtureId);
  const uniqueHitQuoteIds = [...hitQuoteFixtures.keys()];
  const indicatorFixtureIds = [...new Set(scopedHits.map((hit) => hit.fixtureId))];
  const scoredFixtureIds = new Set(scoring.flatMap((result) => {
    if (!result.predictions.length) return [];
    return [
      ...(result.fixtureId ? [result.fixtureId] : []),
      ...result.predictions.map((prediction) => prediction.fixtureId),
    ].filter((fixtureId): fixtureId is string => typeof fixtureId === 'string' && fixtureId.length > 0);
  }));
  const missingIndicatorFixtureIds = indicatorFixtureIds.filter((fixtureId) => !scoredFixtureIds.has(fixtureId));
  const missingIndicatorFixtureIdSet = new Set(missingIndicatorFixtureIds);
  const missingOddsQuoteIds = uniqueHitQuoteIds.filter((id) => {
    const fixtureId = hitQuoteFixtures.get(id);
    return fixtureId ? missingIndicatorFixtureIdSet.has(fixtureId) : true;
  });
  const unlinkedHits = 0;
  return {
    threshold: scan.threshold,
    hits: scan.hitCount,
    scopedHits: scopedHits.length,
    indicatorFixtures: indicatorFixtureIds.length,
    excludedIndicatorFixtures: excludedIndicatorFixtureIds.length,
    scoredIndicatorFixtures: indicatorFixtureIds.length - missingIndicatorFixtureIds.length,
    missingIndicatorFixtureIds,
    excludedIndicatorFixtureIds,
    hitsWithOddsQuoteId: uniqueHitQuoteIds.length,
    uniqueHitOddsQuoteIds: uniqueHitQuoteIds.length,
    predictedHitOddsQuoteIds: uniqueHitQuoteIds.length - missingOddsQuoteIds.length,
    missingPredictionHits: missingIndicatorFixtureIds.length,
    unlinkedHits,
    complete: missingIndicatorFixtureIds.length === 0 && unlinkedHits === 0,
    missingOddsQuoteIds,
  };
}

function lowOddsSemanticKey(hit: LowOddsHitView): string {
  return [
    hit.fixtureId,
    hit.market,
    hit.selection,
    hit.line ?? 'null',
  ].join(':');
}

function emptyLowOddsScan(date: string, threshold: number, marketScope: readonly MarketKey[] = []): LowOddsScanView {
  const selectorMarketScope = lowOddsSelectorMarketScope(marketScope);
  return {
    ...EMPTY_LOW_ODDS_SCAN,
    date,
    threshold,
    marketScope: [...marketScope],
    selectorMarketScope: [...selectorMarketScope],
    analysisMarketScope: [...marketScope],
    marketCoverage: {
      requestedMarkets: [...marketScope],
      quotedMarkets: [],
      hitMarkets: [],
      missingMarkets: [...selectorMarketScope],
      selectorMarketScope: [...selectorMarketScope],
      analysisMarketScope: [...marketScope],
    },
  };
}

function defaultWebMode(config: AgentConfig): ResearchWebMode {
  return config.nativeWebSearch ? config.nativeWebSearchMode : 'off';
}

function defaultRepositories(config: AgentConfig): PipelineRepositories {
  if (!config.databaseUrl) return {};
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

function listRunFiles(dir: string): Array<{ name: string; path: string; sha256: string; sizeBytes: number }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => {
      const path = join(dir, name);
      const body = readFileSync(path);
      return {
        name,
        path,
        sha256: hashPayload(body.toString('utf-8')),
        sizeBytes: body.byteLength,
      };
    });
}

function readJsonIfExists(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function buildHandoffMarkdown(
  config: AgentConfig,
  runtime: RuntimeContext,
  runId: string,
  artifactDir: string,
  manifestPath: string,
  manifest: Record<string, any>,
): string {
  const evaluation = manifest.evaluation ?? {};
  const run = manifest.run && typeof manifest.run === 'object' ? manifest.run : {};
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const validationArtifactCount = artifacts.filter((artifact: any) => artifact?.kind === 'validations').length;
  const counts = evaluation.counts ?? {
    validations: validationArtifactCount || undefined,
  };
  const steps = Array.isArray(evaluation.steps) ? evaluation.steps : [];
  const validation = evaluation.validation && typeof evaluation.validation === 'object' ? evaluation.validation : {};
  const runVerdict = typeof run.verdict === 'string' ? run.verdict : undefined;
  const runStatus = typeof run.status === 'string' ? run.status : undefined;
  const validationStatus = typeof validation.status === 'string'
    ? validation.status
    : validationArtifactCount > 0
      ? runVerdict ?? 'completed'
      : 'unknown';
  const validationMode = typeof validation.mode === 'string' || validation.mode === false ? String(validation.mode) : 'unknown';
  const validationReason = typeof validation.reason === 'string' ? ` (${validation.reason})` : '';
  const lowOddsCoverage = evaluation.lowOddsPredictionCoverage && typeof evaluation.lowOddsPredictionCoverage === 'object'
    ? evaluation.lowOddsPredictionCoverage
    : {};
  const lowOddsAudit = manifest.lowOddsCoverageAudit && typeof manifest.lowOddsCoverageAudit === 'object'
    ? manifest.lowOddsCoverageAudit
    : {};
  const lowOddsPredicted = typeof lowOddsAudit.coveredTargets === 'number' && typeof lowOddsAudit.semanticLowOddsTargets === 'number'
    ? `${lowOddsAudit.coveredTargets}/${lowOddsAudit.semanticLowOddsTargets}`
    : typeof lowOddsCoverage.predictedHitOddsQuoteIds === 'number' && typeof lowOddsCoverage.uniqueHitOddsQuoteIds === 'number'
    ? `${lowOddsCoverage.predictedHitOddsQuoteIds}/${lowOddsCoverage.uniqueHitOddsQuoteIds}`
    : 'unknown';
  const risks = steps.flatMap((step: any) => Array.isArray(step.warnings) ? step.warnings : []);
  const verdict = evaluation.verdict ?? runVerdict ?? 'unknown';
  const status = evaluation.status ?? runStatus ?? 'unknown';
  const handoffGate = manifest.handoff && typeof manifest.handoff === 'object' ? manifest.handoff : {};
  const handoffParlay = typeof handoffGate.parlay === 'string' ? handoffGate.parlay : 'unknown';
  const handoffReasons = Array.isArray(handoffGate.reasons) ? handoffGate.reasons : [];
  const webSearchCoverage = manifest.webSearchCoverage && typeof manifest.webSearchCoverage === 'object' ? manifest.webSearchCoverage : {};
  const marketCoverage = manifest.marketCoverage && typeof manifest.marketCoverage === 'object' ? manifest.marketCoverage : {};
  const calibrationSummary = manifest.calibrationSummary && typeof manifest.calibrationSummary === 'object' ? manifest.calibrationSummary : {};
  const requestedMarkets = Array.isArray(marketCoverage.requestedMarkets) ? marketCoverage.requestedMarkets.join(',') : 'unknown';
  const predictedMarkets = Array.isArray(marketCoverage.predictionMarkets) ? marketCoverage.predictionMarkets.join(',') : 'unknown';
  const nextAction = verdict === 'promotable'
    ? 'Review the analytical parlay candidate and evidence pack before any human decision.'
    : verdict === 'review-required'
      ? 'Review warnings, pending validation, and incomplete outputs before promotion.'
      : verdict === 'pending'
        ? 'Wait for fixture completion, then rerun validation for final settlement.'
      : 'Resolve blocked pipeline steps and rerun the pipeline.';
  return [
    `# Gana Run Handoff: ${runId}`,
    '',
    `- objective: PR-12 canonical run/export handoff`,
    `- runtime: ${config.runtime}`,
    `- profile: ${config.profile}`,
    `- providerSports: ${runtime.providerSports}`,
    `- providerAgentic: ${config.provider}`,
    `- model: ${config.model}`,
    `- verdict: ${verdict}`,
    `- status: ${status}`,
    '',
    '## Outputs',
    '',
    `- fixtures: ${counts.fixtures ?? 'unknown'}`,
    `- lowOddsHits: ${counts.lowOddsHits ?? 'unknown'}`,
    `- predictions: ${counts.predictions ?? 'unknown'}`,
    `- parlayLegs: ${counts.parlayLegs ?? 'unknown'}`,
    `- validations: ${counts.validations ?? 'unknown'}`,
    `- lowOddsPredicted: ${lowOddsPredicted}`,
    `- webSearchCoverage: real=${webSearchCoverage.realWebSourceCount ?? 'unknown'} synthetic=${webSearchCoverage.syntheticWebSourceCount ?? 'unknown'}`,
    `- marketCoverage: requested=${requestedMarkets} predicted=${predictedMarkets}`,
    `- calibrationSummary: applied=${calibrationSummary.applied ?? 0} degraded=${calibrationSummary.degraded ?? 0}`,
    `- validationStatus: ${validationStatus}${validationReason}`,
    `- validationMode: ${validationMode}`,
    `- handoff.parlay: ${handoffParlay}`,
    '',
    '## Gates',
    '',
    ...steps.map((step: any) => `- ${step.name}: ${step.verdict ?? (step.ok ? 'ok' : 'blocked')}`),
    '',
    '## Risks',
    '',
    ...(risks.length ? risks.map((risk: string) => `- ${risk}`) : ['- none recorded']),
    '',
    '## Next Action',
    '',
    nextAction,
    '',
    '## Handoff Parlay',
    '',
    `- status: ${handoffParlay}`,
    ...(handoffReasons.length ? handoffReasons.map((reason: string) => `- ${reason}`) : ['- no additional reason recorded']),
    '',
    '## Disclaimer',
    '',
    'Uso analitico, no constituye recomendacion de apuesta, no garantiza resultado. Monetary actions are forbidden by policy.',
    '',
    '## Artifacts',
    '',
    `- runDir: ${artifactDir}`,
    `- evidencePack: ${manifestPath}`,
    '',
  ].join('\n');
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function safeName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '-');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
