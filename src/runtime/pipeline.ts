import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsQuote } from '../domain/odds.js';
import { discoverFixtures, type FixtureDiscoveryResult } from '../filters/engine.js';
import { persistLowOddsScanResult, type LowOddsPersistenceRepositories } from '../filters/low-odds.js';
import type { LowOddsHitView, LowOddsScanView } from '../filters/types.js';
import { runFixtureResearch, type FixtureResearchResult } from '../evidence/research.js';
import { runFixtureScoring, type FixtureScoringResult } from '../prediction/service.js';
import type { ResearchWebMode } from '../prediction/prompts.js';
import { getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { oddsQuoteDedupeKey } from '../providers/sports/api-football-mappers.js';
import { runParlayBuild, type ParlayBuildRunResult } from '../parlay/service.js';
import { runValidation, type ValidationRunResult } from '../validation/service.js';
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

export type PipelineVerdict = 'promotable' | 'review-required' | 'blocked';
export type PipelineStatus = 'succeeded' | 'failed';
export type PipelineValidationMode = 'auto' | 'force' | false;

export interface RunPipelineInput {
  date: string;
  runId?: string;
  web?: ResearchWebMode;
  validate?: PipelineValidationMode;
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
  lowOddsScans?: LowOddsPersistenceRepositories['lowOddsScans'];
  lowOddsHits?: LowOddsPersistenceRepositories['lowOddsHits'];
}

export interface RunPipelineDependencies {
  now?: () => Date;
  createRunId?: () => string;
  repositories?: PipelineRepositories;
  discoverFixtures?: typeof discoverFixtures;
  fetchOddsSnapshot?: typeof getApiFootballOddsSnapshot;
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

export async function executeRunPipeline(
  config: AgentConfig,
  input: RunPipelineInput,
  runtime: RuntimeContext,
  deps: RunPipelineDependencies = {},
): Promise<RunPipelineResult> {
  const now = deps.now ?? (() => new Date());
  const runId = input.runId ?? runtime.runId ?? deps.createRunId?.() ?? randomUUID();
  runtime.runId = runId;
  const artifactDir = createRunArtifactDir(config, runId);
  const repositories = deps.repositories ?? defaultRepositories(config);
  const writeJsonArtifact = deps.writeArtifact ?? writeArtifact;
  const writeRun = deps.writeRunJson ?? writeRunJson;
  const startedAt = now();
  const steps: PipelineStepResult[] = [];

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
    metadata: toJsonValue({ date: input.date, validate: input.validate ?? 'auto' }),
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
    startedAt: startedAt.toISOString(),
    artifactDir,
  });
  writeJsonArtifact(config, runId, 'input.json', {
    date: input.date,
    web: input.web ?? defaultWebMode(config),
    validate: input.validate ?? 'auto',
  });

  const filtersPayload = {
    date: input.date,
    season: config.apiFootball.defaultSeason,
    markets: config.apiFootball.defaultMarkets,
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

  let fixtureDiscovery: FixtureDiscoveryResult;
  try {
    fixtureDiscovery = await (deps.discoverFixtures ?? discoverFixtures)(config, {
      date: input.date,
      leaguesDefault: true,
      teamsDefault: true,
      combineMode: 'OR',
    }, runtime);
    writeJsonArtifact(config, runId, 'fixtures.json', fixtureDiscovery);
    steps.push({
      name: 'fetch fixtures',
      ok: fixtureDiscovery.fixtures.length > 0,
      verdict: fixtureDiscovery.fixtures.length > 0 ? 'promotable' : 'blocked',
      warnings: fixtureDiscovery.fixtures.length > 0 ? [] : ['no eligible fixtures found'],
    });
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const lowOddsScan = emptyLowOddsScan(input.date, config.apiFootball.lowOddsThreshold);
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

  const oddsSnapshots: OddsSnapshotView[] = [];
  for (const fixture of fixtureDiscovery.fixtures) {
    try {
      const snapshot = await retryStorageConnection(() => (
        deps.fetchOddsSnapshot ?? getApiFootballOddsSnapshot
      )(config, fixture.providerFixtureId, runtime));
      oddsSnapshots.push({
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        oddsSnapshotId: snapshot.oddsSnapshotId,
        providerSnapshotId: snapshot.providerSnapshotId,
        quoteRecordIds: snapshot.quoteRecordIds,
        quotes: snapshot.quotes,
      });
    } catch (err: any) {
      oddsSnapshots.push({
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        quotes: [],
        error: err?.message ?? String(err),
      });
    }
  }
  writeJsonArtifact(config, runId, 'odds-snapshots.json', { runId, snapshots: oddsSnapshots });
  const oddsErrors = oddsSnapshots.flatMap((snapshot) => snapshot.error ? [snapshot.error] : []);
  const quoteCount = oddsSnapshots.reduce((sum, snapshot) => sum + snapshot.quotes.length, 0);
  steps.push({
    name: 'fetch odds',
    ok: quoteCount > 0,
    verdict: quoteCount > 0 ? (oddsErrors.length ? 'review-required' : 'promotable') : 'blocked',
    warnings: oddsErrors,
  });

  const lowOddsScan = buildLowOddsScan(input.date, config, fixtureDiscovery, oddsSnapshots);
  if (repositories.lowOddsScans && repositories.lowOddsHits) {
    try {
      lowOddsScan.scanId = await persistLowOddsScanResult(repositories as LowOddsPersistenceRepositories, {
        runId,
        date: input.date,
        threshold: config.apiFootball.lowOddsThreshold,
        markets: config.apiFootball.defaultMarkets,
        bookmakerAllowlist: config.apiFootball.bookmakerAllowlist,
        fixtureCount: fixtureDiscovery.fixtures.length,
        hits: lowOddsScan.hits,
        fixtureEvaluations: lowOddsScan.fixtureEvaluations,
        requestedLeagues: fixtureDiscovery.requestedLeagues,
        requestedTeams: fixtureDiscovery.requestedTeams,
      });
    } catch (err) {
      if (config.databaseUrl) throw err;
    }
  }
  writeJsonArtifact(config, runId, 'low-odds-scan.json', lowOddsScan);
  steps.push({
    name: 'scan low odds',
    ok: lowOddsScan.hitCount > 0,
    verdict: lowOddsScan.hitCount > 0 ? 'promotable' : 'review-required',
    warnings: lowOddsScan.hitCount > 0
      ? []
      : ['no low-odds hits found; falling back to full eligible fixture slate for review-required scoring'],
  });

  const selectedFixtureIds = new Set(lowOddsScan.hits.map((hit) => hit.fixtureId));
  const selectedFixtures = selectedFixtureIds.size
    ? fixtureDiscovery.fixtures.filter((fixture) => selectedFixtureIds.has(fixture.id))
    : fixtureDiscovery.fixtures;

  const research: FixtureResearchResult[] = [];
  for (const fixture of selectedFixtures) {
    try {
      research.push(await retryStorageConnection(() => (deps.researchFixture ?? runFixtureResearch)(config, {
        fixtureId: fixture.providerFixtureId,
        web: input.web ?? defaultWebMode(config),
      }, runtime)));
    } catch (err: any) {
      research.push(blockedResearchResult(config, runId, fixture, err));
    }
  }
  steps.push(summarizeResultStep('research', research.map((result) => ({
    ok: result.ok,
    verdict: result.gateResult.verdict,
    warnings: [...result.gateResult.warnings, ...(result.error ? [result.error] : [])],
    artifactPath: result.artifactPath,
  })), selectedFixtures.length));

  const scoring: FixtureScoringResult[] = [];
  for (const fixture of selectedFixtures) {
    try {
      scoring.push(await retryStorageConnection(() => (deps.scoreFixture ?? runFixtureScoring)(config, {
        fixtureId: fixture.providerFixtureId,
        web: input.web ?? defaultWebMode(config),
      }, runtime)));
    } catch (err: any) {
      scoring.push(blockedScoringResult(config, runId, fixture, err));
    }
  }
  const lowOddsPredictionCoverage = buildLowOddsPredictionCoverage(lowOddsScan, scoring);
  const scoreStep = summarizeResultStep('score', scoring.map((result) => ({
    ok: result.ok,
    verdict: result.gateResult.verdict,
    warnings: [...result.gateResult.warnings, ...(result.error ? [result.error] : [])],
    artifactPath: result.artifactPath,
  })), selectedFixtures.length);
  if (!lowOddsPredictionCoverage.complete) {
    scoreStep.verdict = scoreStep.verdict === 'blocked' ? 'blocked' : 'review-required';
    scoreStep.warnings.push(
      `missing predictions for ${lowOddsPredictionCoverage.missingPredictionHits} low-odds hits and ${lowOddsPredictionCoverage.unlinkedHits} unlinked low-odds hits`,
    );
  }
  steps.push(scoreStep);

  let parlay: ParlayBuildRunResult;
  try {
    parlay = await retryStorageConnection(() => (deps.buildParlay ?? runParlayBuild)(config, { date: input.date }, runtime));
  } catch (err: any) {
    parlay = blockedParlayResult(config, runId, input.date, err);
  }
  steps.push({
    name: 'build parlay',
    ok: parlay.ok || selectedFixtures.length < 2,
    verdict: selectedFixtures.length < 2 && parlay.gateResult.verdict === 'blocked'
      ? 'review-required'
      : parlay.gateResult.verdict,
    warnings: [...parlay.gateResult.warnings, ...(parlay.error ? [parlay.error] : [])],
    artifactPath: parlay.artifactPath,
  });

  const validateMode = input.validate ?? 'auto';
  const validationSkipReason = getValidationSkipReason(validateMode, input.date, startedAt);
  const shouldValidate = !validationSkipReason;
  let validation: ValidationRunResult | undefined;
  if (shouldValidate) {
    try {
      validation = await (deps.validateRun ?? runValidation)(config, { date: input.date }, runtime);
    } catch (err: any) {
      validation = blockedValidationResult(config, runId, input.date, err);
    }
  }
  if (validation) {
    steps.push({
      name: 'validate',
      ok: validation.ok,
      verdict: validation.gateResult.verdict,
      warnings: [
        ...validation.gateResult.warnings,
        ...validation.validations
          .filter((item) => item.status === 'pending' || item.status === 'voided')
          .map((item) => `${item.status}:${item.predictionId ?? item.parlayId ?? item.fixtureId ?? 'validation'}`),
        ...(validation.error ? [validation.error] : []),
      ],
      artifactPath: validation.artifactPath,
    });
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
      oddsQuotes: quoteCount,
      lowOddsHits: lowOddsScan.hitCount,
      research: research.length,
      predictions: scoring.reduce((sum, item) => sum + item.predictions.length, 0),
      parlayLegs: parlay.build.parlay.legs.length,
      validations: validation?.validations.length ?? 0,
    },
    lowOddsPredictionCoverage,
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

  const exported = await exportRunArtifacts(config, { runId }, runtime, { ...deps, repositories });
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
  const manifestBase = {
    manifestVersion: 1,
    runId: input.runId,
    exportedAt: (deps.now?.() ?? new Date()).toISOString(),
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    run: run ?? readJsonIfExists(join(artifactDir, 'run.json')),
    evaluation: readJsonIfExists(join(artifactDir, 'evaluation.json')),
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
    metadata: toJsonValue({ exportedAt: manifest.exportedAt }),
  }).catch(() => undefined);
  await repositories.artifacts?.create?.({
    name: basename(mirrorHandoffPath),
    kind: 'handoff',
    path: mirrorHandoffPath,
    runId: input.runId,
    sha256: hashPayload(handoff),
    metadata: toJsonValue({ exportedAt: manifest.exportedAt }),
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

function buildLowOddsScan(
  date: string,
  config: AgentConfig,
  discovery: FixtureDiscoveryResult,
  snapshots: OddsSnapshotView[],
): LowOddsScanView {
  const hits: LowOddsHitView[] = [];
  const fixturesByProviderId = new Map(discovery.fixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
  for (const snapshot of snapshots) {
    const fixture = fixturesByProviderId.get(snapshot.providerFixtureId);
    if (!fixture) continue;
    for (const quote of snapshot.quotes) {
      if (!isLowOddsFixtureSelectorQuote(quote)) continue;
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
    fixtureCount: discovery.fixtures.length,
    hitCount: hits.length,
    hits,
    fixtureEvaluations: discovery.evaluations,
    requestedLeagues: discovery.requestedLeagues,
    requestedTeams: discovery.requestedTeams,
  };
}

function isLowOddsFixtureSelectorQuote(quote: { market: string; selection: string }): boolean {
  return quote.market === 'h2h' && (quote.selection === 'home' || quote.selection === 'away');
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
): LowOddsPredictionCoverage {
  const hitQuoteIds = scan.hits
    .map((hit) => hit.oddsQuoteId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const uniqueHitQuoteIds = [...new Set(hitQuoteIds)];
  const predictedQuoteIds = new Set(
    scoring.flatMap((result) => result.predictions.map((prediction) => prediction.oddsQuoteId)),
  );
  const missingOddsQuoteIds = uniqueHitQuoteIds.filter((id) => !predictedQuoteIds.has(id));
  const unlinkedHits = scan.hits.length - hitQuoteIds.length;
  return {
    threshold: scan.threshold,
    hits: scan.hitCount,
    hitsWithOddsQuoteId: hitQuoteIds.length,
    uniqueHitOddsQuoteIds: uniqueHitQuoteIds.length,
    predictedHitOddsQuoteIds: uniqueHitQuoteIds.length - missingOddsQuoteIds.length,
    missingPredictionHits: missingOddsQuoteIds.length,
    unlinkedHits,
    complete: missingOddsQuoteIds.length === 0 && unlinkedHits === 0,
    missingOddsQuoteIds,
  };
}

function emptyLowOddsScan(date: string, threshold: number): LowOddsScanView {
  return {
    ...EMPTY_LOW_ODDS_SCAN,
    date,
    threshold,
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
  const lowOddsPredicted = typeof lowOddsCoverage.predictedHitOddsQuoteIds === 'number' && typeof lowOddsCoverage.uniqueHitOddsQuoteIds === 'number'
    ? `${lowOddsCoverage.predictedHitOddsQuoteIds}/${lowOddsCoverage.uniqueHitOddsQuoteIds}`
    : 'unknown';
  const risks = steps.flatMap((step: any) => Array.isArray(step.warnings) ? step.warnings : []);
  const verdict = evaluation.verdict ?? runVerdict ?? 'unknown';
  const status = evaluation.status ?? runStatus ?? 'unknown';
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
    `- validationStatus: ${validationStatus}${validationReason}`,
    `- validationMode: ${validationMode}`,
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
