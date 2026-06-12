import { randomUUID } from 'crypto';
import { join } from 'path';
import type { AgentConfig } from '../config.js';
import { runAgentWithRetry } from '../agent.js';
import { isMarketKey, normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import { runFixtureResearch } from '../evidence/research.js';
import { createApiFootballPersistence, createApiFootballProvider } from '../providers/sports/api-football.js';
import { API_FOOTBALL_PROVIDER, type FixtureStatistics } from '../providers/sports/types.js';
import { movedAgainstPick } from '../markets/line-movement.js';
import { lineupGate } from '../markets/lineup-gate.js';
import { evaluateFreshness } from '../retrieval/freshness.js';
import { claimsHaveProvenance } from '../retrieval/provenance.js';
import { isotonicCalibrate, type CalibrationPoint } from '../scoring/calibration.js';
import { detectDisagreement } from '../scoring/disagreement.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type {
  ArtifactRecord,
  ClaimRecord,
  EvidenceItemRecord,
  FixtureRecord,
  JsonValue,
  OddsQuoteRecord,
  OddsSnapshotRecord,
  PredictionInput,
  PredictionRecord,
  ResearchBundleRecord,
  SourceRecordRecord,
  StoragePrismaClient,
} from '../storage/types.js';
import type { ResearchBundle } from '../evidence/types.js';
import { aggregatePredictionGate, evaluateEvidenceGate, evaluatePredictionGates } from './gates.js';
import { buildAtomicPrediction, qualityFromConfidence, scorePredictionCandidate } from './scoring.js';
import { SCORE_PREDICTION_PROMPT_VERSION, buildScorePredictionPrompt, type ResearchWebMode } from './prompts.js';
import { SCORING_RULE_VERSION, type PredictionRecordView } from './types.js';

const SCORING_AGENT_TIMEOUT_MS = positiveIntegerFromEnv('GANA_SCORING_AGENT_TIMEOUT_MS', positiveIntegerFromEnv('GANA_AGENT_TIMEOUT_MS', 300_000));
const SCORING_AGENT_JSON_ATTEMPTS = positiveIntegerFromEnv('GANA_SCORING_AGENT_JSON_ATTEMPTS', 2);
const SCORING_OUTPUT_SCHEMA_PATH = join(process.cwd(), 'skills/score-prediction-v2/output.schema.json');
const MAX_ALLOWED_QUOTES_IN_SCORE_PROMPT = 80;
const WEB_RESEARCH_MAX_AGE_MS = positiveIntegerFromEnv('GANA_WEB_RESEARCH_MAX_AGE_HOURS', 12) * 60 * 60 * 1000;
const CALIBRATION_MIN_SAMPLE = positiveIntegerFromEnv('GANA_CALIBRATION_MIN_SAMPLE', 50);
const MIN_EDGE = numberFromEnv('GANA_MIN_EDGE', 0);
const MIN_CONFIDENCE = numberFromEnv('GANA_MIN_CONFIDENCE', 0.5);
const PROMOTABLE_CONFIDENCE_FLOOR = numberFromEnv('GANA_PROMOTABLE_CONFIDENCE_FLOOR', 0.65);
const REVIEW_ONLY_MODELS = new Set(['gpt-5.4-mini']);
const MIN_EVIDENCE_ITEMS = positiveIntegerFromEnv('GANA_MIN_EVIDENCE_ITEMS', 1);
const MIN_DISTINCT_SOURCES = positiveIntegerFromEnv('GANA_MIN_DISTINCT_SOURCES', 1);
const MIN_MARKET_EFFICIENCY = numberFromEnv('GANA_MIN_MARKET_EFFICIENCY', 0);

export interface RunFixtureScoringInput {
  fixtureId: string;
  web?: ResearchWebMode;
  markets?: MarketKey[];
  researchBundle?: ResearchBundle;
  signal?: AbortSignal;
}

export interface ScoringMarketCoverage {
  requestedMarkets: MarketKey[];
  quotedMarkets: MarketKey[];
  predictedMarkets: MarketKey[];
  skippedMarkets: Array<{ market: MarketKey; reason: string }>;
}

export interface ScoringCalibrationSummary {
  applied: number;
  degraded: number;
  unavailable: number;
  minSample: number;
  warnings: string[];
}

export interface FixtureScoringResult {
  ok: boolean;
  runId: string;
  fixtureId?: string;
  providerFixtureId?: string;
  gateResult: ReturnType<typeof aggregatePredictionGate>;
  predictions: PredictionRecordView[];
  retrievalWarnings?: string[];
  marketCoverage?: ScoringMarketCoverage;
  calibrationSummary?: ScoringCalibrationSummary;
  artifactPath?: string;
  error?: string;
}

export interface FixtureScoringDependencies {
  now?: () => Date;
  repositories?: PredictionServiceRepositories;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  persistArtifact?: (input: {
    runId: string;
    path: string;
    payload: unknown;
    fixtureId?: string;
  }) => Promise<Pick<ArtifactRecord, 'id'> | null>;
  persistPredictions?: (predictions: PredictionInput[]) => Promise<PredictionRecord[]>;
  agentRunner?: typeof runAgentWithRetry;
  researchFixture?: typeof runFixtureResearch;
  calibrationHistory?: {
    getCalibrationPoints(input: {
      market: string;
      model: string;
      promptVersion: string;
      fixtureId: string;
    }): Promise<CalibrationPoint[]>;
  };
  fetchFixtureStatistics?: (providerFixtureId: string) => Promise<FixtureStatistics | undefined>;
}

export interface PredictionServiceRepositories {
  sportsProviders: {
    findByCode(code: string): Promise<{ id: string } | null>;
  };
  fixtures: {
    findById(id: string): Promise<FixtureRecord | null>;
    findByProviderKey(providerId: string, providerFixtureId: string): Promise<FixtureRecord | null>;
  };
  oddsSnapshots: {
    listLatestByFixture(fixtureId: string, take?: number): Promise<OddsSnapshotRecord[]>;
  };
  oddsQuotes: {
    listLatest(query: { fixtureId: string; snapshotId?: string; take?: number }): Promise<OddsQuoteRecord[]>;
  };
  researchBundles: {
    list(query: { fixtureId?: string; status?: string; take?: number }): Promise<ResearchBundleRecord[]>;
  };
  sourceRecords?: {
    list(query: { bundleId?: string; fixtureId?: string; sourceType?: string; take?: number }): Promise<SourceRecordRecord[]>;
  };
  evidenceItems: {
    list(query: { bundleId?: string; fixtureId?: string; take?: number }): Promise<EvidenceItemRecord[]>;
  };
  claims: {
    list(query: { bundleId?: string; fixtureId?: string; take?: number }): Promise<ClaimRecord[]>;
  };
  harnessRuns?: {
    upsertForRun?(input: {
      id: string;
      runtime: string;
      profile: string;
      providerSports: string;
      providerAgentic?: string | null;
      model?: string | null;
      status?: string;
      verdict?: string | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
      metadata?: JsonValue | null;
    }): Promise<unknown>;
  };
  artifacts?: {
    create(input: {
      name: string;
      kind: string;
      path: string;
      runId?: string | null;
      sha256?: string | null;
      metadata?: JsonValue | null;
    }): Promise<ArtifactRecord>;
  };
  predictions?: {
    create(input: PredictionInput): Promise<PredictionRecord>;
  };
}

interface ParsedTopPick {
  oddsQuoteId: string;
  market: string;
  selection: string;
  line?: number;
  odds: number;
  probability?: number;
  modelProbability?: number;
  marketFairProbability?: number;
  edge?: number;
  confidenceBand?: 'low' | 'medium' | 'high';
  blockers: string[];
  promotable?: boolean;
  confidence: number;
  evidenceIds: string[];
  claimIds: string[];
  rationale: string;
  warnings: string[];
}

export async function runFixtureScoring(
  config: AgentConfig,
  input: RunFixtureScoringInput,
  runtime: RuntimeContext,
  deps: FixtureScoringDependencies = {},
): Promise<FixtureScoringResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));
  const marketScope = normalizeMarketScope(input.markets, config.apiFootball.defaultMarkets);

  if (!deps.repositories && !config.databaseUrl) {
    return blockedResult(runId, artifactWriter, {
      error: 'DATABASE_URL is required to score persisted predictions.',
      reasons: ['database write unavailable'],
      fixtureId: input.fixtureId,
    });
  }

  const repositories = deps.repositories ?? defaultRepositories();
  const fixture = await resolveFixture(repositories, input.fixtureId);
  if (!fixture) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Fixture "${input.fixtureId}" was not found in persisted normalized fixtures.`,
      reasons: ['missing fixture'],
      fixtureId: input.fixtureId,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const oddsSnapshot = (await repositories.oddsSnapshots.listLatestByFixture(fixture.id, 1))[0];
  if (!oddsSnapshot) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Fixture "${fixture.providerFixtureId}" has no persisted odds snapshot.`,
      reasons: ['missing persisted odds snapshot'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const allOddsQuotes = await repositories.oddsQuotes.listLatest({
    fixtureId: fixture.id,
    snapshotId: oddsSnapshot.id,
    take: 500,
  });
  const oddsQuotes = allOddsQuotes.filter((quote) => marketScope.includes(quote.marketKey as MarketKey));
  if (!oddsQuotes.length) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Odds snapshot "${oddsSnapshot.id}" has no persisted quotes for requested markets: ${marketScope.join(', ')}.`,
      reasons: ['missing persisted odds quote for requested markets'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
      marketScope,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const web = input.web ?? 'off';
  let research = researchGraphFromBundle(input.researchBundle, fixture) ?? await latestResearchGraph(repositories, fixture.id);
  let webSearchCoverage = buildScoringWebSearchCoverage(research.sources, web, now(), config.provider);
  if (web === 'live' && !webSearchCoverage.ok) {
    if (deps.researchFixture) {
      const refreshed = await deps.researchFixture(config, {
        fixtureId: fixture.providerFixtureId,
        web: 'live',
        markets: marketScope,
        signal: input.signal,
      }, runtime);
      research = researchGraphFromBundle(refreshed.bundle, fixture) ?? await latestResearchGraph(repositories, fixture.id);
      webSearchCoverage = buildScoringWebSearchCoverage(research.sources, web, now(), config.provider);
    }
    if (!webSearchCoverage.ok) {
      const result = blockedResult(runId, artifactWriter, {
        error: [
          `score --web live requires a fresh research bundle with real web-search evidence for fixture "${fixture.providerFixtureId}".`,
          `Current coverage: ${webSearchCoverage.reason}.`,
          `Action: run pnpm gana research --fixture-id ${fixture.providerFixtureId} --web live --markets ${marketScope.join(',')} and retry scoring, or use --web off for local-only scoring.`,
        ].join(' '),
        reasons: ['fresh live web research missing'],
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        oddsSnapshotId: oddsSnapshot.id,
        marketScope,
      });
      await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
      return result;
    }
  }
  const evidenceGate = evaluateEvidenceGate(research);
  const includedByFilters = stringArray(fixture.includedByFilters);
  const providerContextWarnings: string[] = [];
  const fixtureStatistics = await fetchScoringFixtureStatistics(config, runtime, deps, fixture.providerFixtureId, providerContextWarnings);
  const promptOddsQuotes = selectScoringPromptQuotes(oddsQuotes);
  const allowedQuotes = promptOddsQuotes.map(toAllowedQuote);
  const quoteTrimWarnings = promptOddsQuotes.length < oddsQuotes.length
    ? [`scoring prompt allowedQuotes trimmed from ${oddsQuotes.length} to ${promptOddsQuotes.length} representative quotes`]
    : [];
  const retrievalWarnings = evaluateRetrievalQuality({
    sources: research.sources,
    claims: research.claims,
    fixtureStatus: fixture.status,
    now: now(),
  });
  const prompt = buildScorePredictionPrompt({
    runId,
    createdAt: generatedAt,
    web,
    requiredMarkets: marketScope,
    marketFocus: marketScope,
    fixture: fixturePromptView(fixture),
    fixtureStatistics: fixtureStatistics ?? null,
    oddsSnapshot: oddsSnapshotPromptView(oddsSnapshot),
    researchBundle: researchBundlePromptView(research.researchBundle),
    sources: research.sources.map(sourcePromptView),
    evidenceItems: research.evidenceItems.map(evidencePromptView),
    claims: research.claims.map(claimPromptView),
    allowedQuotes,
      providerContextWarnings: [
      ...providerContextWarnings,
      ...quoteTrimWarnings,
      ...retrievalWarnings,
      ...webSearchCoverage.warnings,
      ...(web !== 'off' && !hasRealWebResearchSource(research.sources)
        ? [`web ${web} requested but no real persisted web-search source is linked to the latest research bundle`]
        : []),
    ],
  });

  const quoteById = new Map(oddsQuotes.map((quote) => [quote.id, quote]));
  let llmOutput: ParsedTopPick[] | undefined;
  let rawOutput = '';
  let scoringError = '';
  for (let attempt = 1; attempt <= SCORING_AGENT_JSON_ATTEMPTS; attempt += 1) {
    try {
      const result = await runScoringAgent(deps.agentRunner ?? runAgentWithRetry, config, scoringPromptForAttempt(prompt, attempt), {
        runtime,
        signal: input.signal,
      });
      rawOutput = result.text;
      const repairedOutput = completeGateEvidence(repairTopPickReferences(
        parseTopPickOutput(rawOutput),
        evidenceGate,
        research.claims,
        research.evidenceItems,
        research.sources,
      ), evidenceGate, research.evidenceItems);
      const canonicalOutput = canonicalizePicksFromOddsQuotes(repairedOutput, quoteById);
      const topPickIssues = validateTopPicks(canonicalOutput, quoteById, evidenceGate, research.claims, promptOddsQuotes, research.evidenceItems);
      if (topPickIssues.length) {
        scoringError = `Prediction LLM output failed validation: ${topPickIssues.join('; ')}`;
        if (attempt < SCORING_AGENT_JSON_ATTEMPTS && isRetryableTopPickValidationIssue(topPickIssues)) {
          rawOutput = '';
          continue;
        }
        const blocked = blockedResult(runId, artifactWriter, {
          error: scoringError,
          reasons: ['invalid prediction LLM output'],
          fixtureId: fixture.id,
          providerFixtureId: fixture.providerFixtureId,
          oddsSnapshotId: oddsSnapshot.id,
        });
        await upsertRun(config, runtime, repositories, runId, blocked.gateResult.verdict, 'failed', now());
        return blocked;
      }
      llmOutput = canonicalOutput;
      break;
    } catch (err: any) {
      scoringError = err?.message ?? String(err);
      if (attempt < SCORING_AGENT_JSON_ATTEMPTS && isRetryableScoringAgentError(scoringError)) {
        rawOutput = '';
        continue;
      }
      const result = blockedResult(runId, artifactWriter, {
        error: scoringError,
        reasons: ['prediction LLM scoring failed'],
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        oddsSnapshotId: oddsSnapshot.id,
      });
      await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
      return result;
    }
  }

  if (!llmOutput) {
    const result = blockedResult(runId, artifactWriter, {
      error: scoringError || 'Prediction LLM scoring failed without output.',
      reasons: ['prediction LLM scoring failed'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const calibrationEvents: Array<NonNullable<PredictionRecordView['calibration']>> = [];
  const predictions = await Promise.all(llmOutput.map(async (pick) => {
    const quote = quoteById.get(pick.oddsQuoteId);
    const candidateScore = validateTopPick({
      pick,
      quote,
      evidenceGate,
      claims: research.claims,
    });
    const gate = evaluatePredictionGates({
      fixture,
      hasOddsSnapshot: true,
      hasOddsQuote: Boolean(quote),
      marketValid: candidateScore.valid,
      researchBundle: research.researchBundle,
      evidenceItems: research.evidenceItems,
      claims: research.claims,
      webResearchRequired: web !== 'off',
      hasWebResearch: hasRealWebResearchSource(research.sources),
      qualityWarnings: retrievalWarnings,
    });
    const selectedEvidenceIds = pick.evidenceIds.length >= 2
      ? pick.evidenceIds
      : uniqueStrings([...pick.evidenceIds, ...allowedScoringEvidenceIds(evidenceGate, research.evidenceItems)]);
    const selectedClaimIds = pick.claimIds.length ? pick.claimIds : evidenceGate.claimIds;

    const rawModelProbability = pick.modelProbability ?? pick.probability;
    const calibration = await calibrateModelProbability(rawModelProbability, {
      market: pick.market,
      model: config.model,
      promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
      fixtureId: fixture.id,
    }, deps);
    calibrationEvents.push(calibration);
    const marketSpecificEvidence = evaluateMarketSpecificEvidence({
      pick,
      selectedEvidenceIds,
      selectedClaimIds,
      claims: research.claims,
      evidenceItems: research.evidenceItems,
    });
    const marketSpecificEvidenceMissing = marketSpecificEvidence.warnings.some((warning) => warning.startsWith('market-specific evidence missing'));
    const fairProbability = fairProbabilityForQuote(quote, pick);
    const baseWarnings = [
      ...gate.warnings,
      ...retrievalWarnings,
      ...candidateScore.reasons,
      ...pick.warnings,
      ...pick.blockers,
      ...calibration.warnings,
      ...marketSpecificEvidence.warnings,
      ...fairProbabilityWarnings(quote, pick, fairProbability),
    ];
    const riskControls = evaluatePostScoringRiskControls({
      pick,
      quote,
      warnings: baseWarnings,
      confidence: calibration.confidence ?? pick.confidence,
      calibrationApplied: calibration.applied,
      model: config.model,
    });
    const configurableGateWarnings = evaluateConfigurablePredictionWarnings({
      pick,
      quote,
      confidence: riskControls.confidence,
      evidenceIds: selectedEvidenceIds,
      evidenceItems: research.evidenceItems,
      edge: calibration.probability !== undefined && fairProbability !== null
        ? calibration.probability - fairProbability
        : undefined,
    });
    const warnings = [
      ...baseWarnings,
      ...riskControls.warnings,
      ...configurableGateWarnings,
    ];

    const prediction = buildAtomicPrediction({
      runId,
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
      oddsQuoteId: pick.oddsQuoteId,
      market: pick.market,
      selection: pick.selection,
      line: pick.line,
      odds: pick.odds,
      marketImpliedProbability: numberOrNull(quote?.marketImpliedProbability),
      marketFairProbability: fairProbability,
      lowLiquidity: metadataBool(quote?.metadata, 'lowLiquidity'),
      stalePick: stalePickFromQuote(quote, pick.odds),
      lineupPending: lineupPendingForFixture(fixture, pick.market, quote, now()),
      modelDisagreement: modelDisagreementFromMetadata(quote?.metadata),
      minEdge: MIN_EDGE,
      estimatedProbability: calibration.probability ?? rawModelProbability,
      evidenceIds: selectedEvidenceIds,
      claimIds: selectedClaimIds,
      status: gate.verdict,
      confidence: riskControls.confidence,
      quality: riskControls.confidenceBand ?? pick.confidenceBand,
      rationale: pick.rationale,
      warnings,
      parlayEligible: isParlayEligibleResearch(research.researchBundle ?? undefined, warnings) && !riskControls.parlayIneligible,
      providerAgentic: config.provider,
      model: config.model,
      researchBundleId: research.researchBundle?.id,
      generatedAt,
    });
    return {
      ...prediction,
      calibration,
      blockers: uniqueStrings([...prediction.blockers, ...pick.blockers]),
      promotable: prediction.promotable && pick.promotable !== false && !marketSpecificEvidenceMissing && !riskControls.forceReview,
      status: prediction.status === 'promotable' && (pick.promotable === false || marketSpecificEvidenceMissing || riskControls.forceReview) ? 'review-required' : prediction.status,
      warnings: uniqueStrings([
        ...prediction.warnings,
        ...(pick.edge !== undefined && prediction.edge !== undefined && Math.abs(pick.edge - prediction.edge) > 0.02
          ? ['model-reported edge differed from service fair-price edge']
          : []),
      ]),
    };
  }));

  const aggregate = aggregatePredictionGate(predictions.map((prediction) => ({
    verdict: prediction.status === 'candidate' || prediction.status === 'draft'
      ? 'review-required'
      : prediction.status,
    reasons: prediction.status === 'promotable' ? ['prediction gates passed'] : prediction.warnings,
    warnings: prediction.warnings,
  })));
  const marketCoverage = buildScoringMarketCoverage(marketScope, oddsQuotes, predictions);
  const calibrationSummary = summarizeCalibration(calibrationEvents);
  const artifactPayload = {
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    oddsSnapshotId: oddsSnapshot.id,
    researchBundleId: research.researchBundle?.id ?? null,
    marketScope,
    marketCoverage,
    webSearchCoverage,
    calibrationSummary,
    promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
    scoringRuleVersion: SCORING_RULE_VERSION,
    gateResult: aggregate,
    retrievalWarnings,
    prompt,
    rawOutput,
    predictions,
  };
  const artifactPath = artifactWriter(runId, 'predictions.json', artifactPayload);

  try {
    await upsertRun(config, runtime, repositories, runId, aggregate.verdict, 'succeeded', now());
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      fixtureId: fixture.id,
    });
    const persisted = await (deps.persistPredictions ?? defaultPersistPredictions(repositories))(
      predictions.map((prediction) => toPredictionInput(prediction, fixture, oddsSnapshot, artifact?.id ?? null, includedByFilters)),
    );

    return {
      ok: aggregate.verdict !== 'blocked',
      runId,
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      gateResult: aggregate,
      predictions: persisted.length ? predictions : [],
      retrievalWarnings,
      marketCoverage,
      calibrationSummary,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const errorResult = blockedResult(runId, artifactWriter, {
      error,
      reasons: ['prediction persistence failed'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
    });
    await upsertRun(config, runtime, repositories, runId, errorResult.gateResult.verdict, 'failed', now()).catch(() => undefined);
    return errorResult;
  }
}

export async function runFixturePrediction(
  config: AgentConfig,
  input: RunFixtureScoringInput,
  runtime: RuntimeContext,
  deps: FixtureScoringDependencies = {},
): Promise<FixtureScoringResult> {
  return runFixtureScoring(config, input, runtime, deps);
}

function defaultRepositories(): PredictionServiceRepositories {
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

async function resolveFixture(repositories: PredictionServiceRepositories, fixtureId: string): Promise<FixtureRecord | null> {
  const byId = await repositories.fixtures.findById(fixtureId);
  if (byId) return byId;
  const provider = await repositories.sportsProviders.findByCode(API_FOOTBALL_PROVIDER);
  if (!provider) return null;
  return repositories.fixtures.findByProviderKey(provider.id, fixtureId);
}

async function fetchScoringFixtureStatistics(
  config: AgentConfig,
  runtime: RuntimeContext,
  deps: FixtureScoringDependencies,
  providerFixtureId: string,
  warnings: string[],
): Promise<FixtureStatistics | undefined> {
  if (deps.fetchFixtureStatistics) return deps.fetchFixtureStatistics(providerFixtureId);
  if (deps.repositories) return undefined;
  if (!config.apiFootballKey) return undefined;
  try {
    const persistence = await createApiFootballPersistence(config, runtime);
    const provider = createApiFootballProvider(config, persistence);
    return await provider.getFixtureStatistics({ providerFixtureId });
  } catch (err: any) {
    warnings.push(`API-Football fixture statistics unavailable for scoring: ${err?.message ?? String(err)}`);
    return undefined;
  }
}

async function latestResearchGraph(repositories: PredictionServiceRepositories, fixtureId: string) {
  const researchBundle = (await repositories.researchBundles.list({ fixtureId, take: 1 }))[0] ?? null;
  if (!researchBundle) {
    return {
      researchBundle: null,
      sources: [] as SourceRecordRecord[],
      evidenceItems: [] as EvidenceItemRecord[],
      claims: [] as ClaimRecord[],
    };
  }
  const [sources, evidenceItems, claims] = await Promise.all([
    repositories.sourceRecords?.list({ bundleId: researchBundle.id, take: 500 }) ?? Promise.resolve([]),
    repositories.evidenceItems.list({ bundleId: researchBundle.id, take: 500 }),
    repositories.claims.list({ bundleId: researchBundle.id, take: 500 }),
  ]);
  return { researchBundle, sources, evidenceItems, claims };
}

function researchGraphFromBundle(bundle: ResearchBundle | undefined, fixture: FixtureRecord): Awaited<ReturnType<typeof latestResearchGraph>> | null {
  if (!bundle) return null;
  if (bundle.fixtureId !== fixture.id || bundle.providerFixtureId !== fixture.providerFixtureId) return null;

  const createdAt = dateValue(bundle.createdAt) ?? new Date();
  const updatedAt = createdAt;
  const bundleRecord: ResearchBundleRecord = {
    id: bundle.id,
    runId: bundle.runId,
    fixtureId: bundle.fixtureId,
    providerFixtureId: bundle.providerFixtureId,
    artifactId: null,
    status: bundle.gateResult.verdict,
    gateResult: bundle.gateResult as JsonValue,
    providerAgentic: bundle.providerAgentic,
    model: bundle.model,
    promptVersion: bundle.promptVersion,
    warnings: bundle.warnings as JsonValue,
    metadata: (bundle.metadata ?? null) as JsonValue | null,
    createdAt,
    updatedAt,
  };

  const sourceIdMap = new Map<string, string>();
  const sources: SourceRecordRecord[] = bundle.sources.map((source) => {
    const localId = String(source.id);
    const id = scopedResearchId(bundle.id, localId);
    sourceIdMap.set(localId, id);
    return {
      id,
      bundleId: bundle.id,
      runId: bundle.runId,
      fixtureId: bundle.fixtureId,
      artifactId: null,
      providerSnapshotId: source.snapshotId ?? null,
      sourceType: source.type,
      url: source.url ?? null,
      title: source.title ?? null,
      externalId: source.externalId ?? source.snapshotId ?? source.artifactPath ?? null,
      hash: source.hash ?? null,
      capturedAt: dateValue(source.capturedAt) ?? createdAt,
      warnings: null,
      metadata: compactJson({
        ...(source.metadata ?? {}),
        artifactPath: source.artifactPath,
        snapshotId: source.snapshotId,
      }),
      createdAt,
    };
  });

  const evidenceSourceIds = new Map<string, string>();
  const evidenceItems: EvidenceItemRecord[] = bundle.evidenceItems.map((evidence) => {
    const localId = String(evidence.id);
    const id = scopedResearchId(bundle.id, localId);
    const sourceId = sourceIdMap.get(String(evidence.sourceId)) ?? String(evidence.sourceId);
    evidenceSourceIds.set(localId, sourceId);
    evidenceSourceIds.set(id, sourceId);
    return {
      id,
      bundleId: bundle.id,
      sourceId,
      fixtureId: bundle.fixtureId,
      artifactId: null,
      kind: null,
      snippetRedacted: evidence.snippet ?? null,
      summaryRedacted: evidence.summary,
      confidence: evidence.confidence,
      claimIds: evidence.claimIds.map((claimId) => scopedResearchId(bundle.id, String(claimId))) as JsonValue,
      warnings: null,
      metadata: (evidence.metadata ?? null) as JsonValue | null,
      createdAt,
      updatedAt,
    };
  });

  const claims: ClaimRecord[] = bundle.claims.map((claim) => {
    const evidenceIds = claim.evidenceIds.map((evidenceId) => scopedResearchId(bundle.id, String(evidenceId)));
    const marketKey = claim.subject.type === 'market' && typeof claim.subject.market === 'string'
      ? claim.subject.market
      : null;
    return {
      id: scopedResearchId(bundle.id, String(claim.id)),
      bundleId: bundle.id,
      fixtureId: bundle.fixtureId,
      sourceId: firstEvidenceSourceId(evidenceIds, evidenceSourceIds),
      statement: claim.statement,
      subjectType: claim.subject.type,
      subjectKey: claim.subject.id ?? claim.subject.market ?? null,
      marketKey,
      selectionKey: null,
      line: null,
      supportLevel: claim.supportLevel,
      confidence: null,
      evidenceIds: evidenceIds as JsonValue,
      conflictStatus: claim.conflictStatus,
      critical: false,
      warnings: null,
      metadata: (claim.metadata ?? null) as JsonValue | null,
      createdAt,
      updatedAt,
    };
  });

  return { researchBundle: bundleRecord, sources, evidenceItems, claims };
}

function scopedResearchId(bundleId: string, localId: string): string {
  const scoped = `${bundleId}:${localId}`;
  return scoped.length <= 120 ? scoped : scoped.slice(0, 120);
}

function firstEvidenceSourceId(evidenceIds: string[], evidenceSourceIds: Map<string, string>): string | null {
  for (const evidenceId of evidenceIds) {
    const sourceId = evidenceSourceIds.get(evidenceId);
    if (sourceId) return sourceId;
  }
  return null;
}

function buildScoringWebSearchCoverage(
  sources: SourceRecordRecord[],
  web: ResearchWebMode,
  now: Date,
  provider: AgentConfig['provider'],
): {
  ok: boolean;
  mode: ResearchWebMode;
  provider: AgentConfig['provider'];
  realWebSearchSourceCount: number;
  syntheticWebSearchSourceCount: number;
  freshWebSearchSourceCount: number;
  newestWebSearchAt?: string;
  reason: string;
  warnings: string[];
} {
  const realSources = sources.filter(isRealWebSourceRecord);
  const syntheticSources = sources.filter((source) => source.sourceType === 'web-search' && !isRealWebSourceRecord(source));
  const freshSources = realSources.filter((source) => {
    const capturedAt = dateValue(source.capturedAt);
    return capturedAt !== undefined && now.getTime() - capturedAt.getTime() <= WEB_RESEARCH_MAX_AGE_MS;
  });
  const newestWebSearchAt = realSources
    .map((source) => dateValue(source.capturedAt)?.toISOString())
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const required = web === 'live';
  const ok = !required || freshSources.length > 0;
  const reason = ok
    ? 'fresh real web-search evidence is available'
    : realSources.length
      ? `latest real web-search evidence is stale; newest=${newestWebSearchAt ?? 'unknown'}`
      : syntheticSources.length
        ? 'only synthetic/repaired web-search sources are linked'
        : 'no real web-search source is linked';
  const warnings = ok
    ? []
    : [`web ${web} scoring requires fresh real web-search evidence: ${reason}`];
  if (web === 'live' && provider === 'openrouter' && !realSources.length) {
    warnings.push('OpenRouter has no native web-search enforcement in this harness; use the browser fallback or run research with a native provider before scoring live.');
  }
  return {
    ok,
    mode: web,
    provider,
    realWebSearchSourceCount: realSources.length,
    syntheticWebSearchSourceCount: syntheticSources.length,
    freshWebSearchSourceCount: freshSources.length,
    newestWebSearchAt,
    reason,
    warnings,
  };
}

function isRealWebSourceRecord(source: SourceRecordRecord): boolean {
  if (source.sourceType !== 'web-search') return false;
  const metadata = objectMetadata(source.metadata);
  if (metadata.synthesized === true || metadata.repaired === true) return false;
  return Boolean(source.url || source.externalId);
}

async function runScoringAgent(
  runner: typeof runAgentWithRetry,
  config: AgentConfig,
  prompt: string,
  options: Parameters<typeof runAgentWithRetry>[2],
): Promise<Awaited<ReturnType<typeof runAgentWithRetry>>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options?.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), SCORING_AGENT_TIMEOUT_MS);
  try {
    return await runner(config, prompt, {
      ...options,
      signal: controller.signal,
      outputSchemaPath: SCORING_OUTPUT_SCHEMA_PATH,
      useStdinPrompt: true,
    });
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`prediction scoring agent timed out after ${Math.round(SCORING_AGENT_TIMEOUT_MS / 1000)}s`);
    }
    throw err;
  } finally {
    options?.signal?.removeEventListener('abort', abort);
    clearTimeout(timeout);
  }
}

function parseTopPickOutput(rawOutput: string): ParsedTopPick[] {
  const parsed = parseJsonObject(rawOutput);
  const predictions: unknown[] | undefined = Array.isArray(parsed.predictions) ? parsed.predictions : undefined;
  if (!predictions) throw new Error('Prediction output must include predictions array.');
  return predictions.map((item, index) => parseTopPick(item, index));
}

function scoringPromptForAttempt(prompt: string, attempt: number): string {
  if (attempt <= 1) return prompt;
  return [
    prompt,
    '',
    'Retry instruction: the previous scoring response failed, timed out, or was not valid JSON. Use minimal-scoring-retry mode:',
    '- return strict JSON only, starting with "{" as the first character',
    '- do not include status/progress prose such as "Estoy verificando"',
    '- include at least one persisted evidenceId from Input.evidenceItems for every prediction',
    '- cover every market represented in Input.allowedQuotes; if a market is available, include one grounded pick for it',
    '- keep rationales concise and ground every pick in persisted oddsQuoteId plus persisted evidenceIds',
  ].join('\n');
}

function isRetryableScoringAgentError(error: string): boolean {
  return /timed out|timeout|aborted|strict JSON|Unexpected token|unterminated|not valid JSON|must include predictions array/i.test(error);
}

function isRetryableTopPickValidationIssue(issues: string[]): boolean {
  return issues.some((issue) => /requires at least one evidenceId|omitted required market|references unknown oddsQuoteId/i.test(issue));
}

function parseJsonObject(rawOutput: string): any {
  const trimmed = rawOutput.trim();
  try {
    return JSON.parse(trimmed);
  } catch (err: any) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Use the strict parse error below.
      }
    }
    throw new Error(`Prediction output must be strict JSON: ${err?.message ?? err}`);
  }
}

function parseTopPick(value: unknown, index: number): ParsedTopPick {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`predictions[${index}] must be an object.`);
  }
  const item = value as Record<string, unknown>;
  const oddsQuoteId = stringField(item, 'oddsQuoteId', index);
  const market = stringField(item, 'market', index);
  const selection = stringField(item, 'selection', index);
  const line = nullableNumberField(item, 'line', index);
  const odds = numberField(item, 'odds', index);
  const probability = optionalNumberField(item, 'probability', index);
  const modelProbability = optionalNumberField(item, 'modelProbability', index);
  const marketFairProbability = optionalNumberField(item, 'marketFairProbability', index);
  const edge = optionalNumberField(item, 'edge', index);
  const confidence = numberField(item, 'confidence', index);
  const confidenceBand = optionalConfidenceBandField(item, 'confidenceBand', index);
  const blockers = stringArrayField(item, 'blockers', index, true);
  const promotable = optionalBooleanField(item, 'promotable', index);
  const evidenceIds = stringArrayField(item, 'evidenceIds', index);
  const claimIds = stringArrayField(item, 'claimIds', index, true);
  const rationale = stringField(item, 'rationale', index);
  const warnings = stringArrayField(item, 'warnings', index, true);

  return {
    oddsQuoteId,
    market,
    selection,
    ...(line !== undefined && { line }),
    odds,
    ...(probability !== undefined && { probability }),
    ...(modelProbability !== undefined && { modelProbability }),
    ...(marketFairProbability !== undefined && { marketFairProbability }),
    ...(edge !== undefined && { edge }),
    ...(confidenceBand !== undefined && { confidenceBand }),
    blockers,
    ...(promotable !== undefined && { promotable }),
    confidence,
    evidenceIds,
    claimIds,
    rationale,
    warnings,
  };
}

function repairTopPickReferences(
  picks: ParsedTopPick[],
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>,
  claims: ClaimRecord[],
  evidenceItems: EvidenceItemRecord[] = [],
  sources: SourceRecordRecord[] = [],
): ParsedTopPick[] {
  const evidenceIds = new Set(evidenceGate.evidenceIds);
  const claimIds = new Set(claims.map((claim) => claim.id));
  const evidenceBySuffix = suffixMap(evidenceGate.evidenceIds);
  const claimBySuffix = suffixMap([...claimIds]);
  const evidenceBySourceRef = evidenceSourceReferenceMap(evidenceItems, sources, evidenceIds);
  return picks.map((pick) => ({
    ...pick,
    evidenceIds: uniqueStrings(pick.evidenceIds.flatMap((id) => {
      if (evidenceIds.has(id)) return [id];
      const bySource = evidenceBySourceRef.get(id);
      if (bySource?.length) return bySource;
      return [evidenceBySuffix.get(id) ?? evidenceBySuffix.get(idSuffix(id)) ?? id];
    })),
    claimIds: uniqueStrings(pick.claimIds.map((id) => claimIds.has(id) ? id : claimBySuffix.get(id) ?? claimBySuffix.get(idSuffix(id)) ?? id)),
  }));
}

function evidenceSourceReferenceMap(
  evidenceItems: EvidenceItemRecord[],
  sources: SourceRecordRecord[],
  allowedEvidenceIds: Set<string>,
): Map<string, string[]> {
  const evidenceIdsBySource = new Map<string, string[]>();
  for (const item of evidenceItems) {
    if (!allowedEvidenceIds.has(item.id)) continue;
    const current = evidenceIdsBySource.get(item.sourceId) ?? [];
    current.push(item.id);
    evidenceIdsBySource.set(item.sourceId, current);
  }

  const map = new Map<string, string[]>();
  for (const source of sources) {
    const ids = evidenceIdsBySource.get(source.id);
    if (!ids?.length) continue;
    for (const ref of uniqueStrings([
      source.id,
      source.url ?? '',
      source.externalId ?? '',
      source.providerSnapshotId ?? '',
    ].filter(Boolean))) {
      map.set(ref, ids);
    }
  }
  return map;
}

function suffixMap(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const id of ids) {
    const suffix = idSuffix(id);
    if (!suffix) continue;
    if (map.has(suffix)) ambiguous.add(suffix);
    else map.set(suffix, id);
  }
  for (const suffix of ambiguous) map.delete(suffix);
  return map;
}

function completeGateEvidence(
  picks: ParsedTopPick[],
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>,
  evidenceItems: EvidenceItemRecord[] = [],
): ParsedTopPick[] {
  const allowedEvidenceIds = allowedScoringEvidenceIds(evidenceGate, evidenceItems);
  const allowed = new Set(allowedEvidenceIds);
  return picks.map((pick) => {
    const validEvidenceIds = uniqueStrings(pick.evidenceIds.filter((id) => allowed.has(id)));
    return {
      ...pick,
      evidenceIds: validEvidenceIds.length
        ? validEvidenceIds
        : allowedEvidenceIds.slice(0, Math.min(2, allowedEvidenceIds.length)),
    };
  });
}

function allowedScoringEvidenceIds(
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>,
  evidenceItems: EvidenceItemRecord[] = [],
): string[] {
  if (evidenceGate.evidenceIds.length) return evidenceGate.evidenceIds;
  return uniqueStrings(evidenceItems.map((item) => item.id).filter(Boolean));
}

function idSuffix(id: string): string {
  return id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function canonicalizePicksFromOddsQuotes(
  picks: ParsedTopPick[],
  quoteById: Map<string, OddsQuoteRecord>,
): ParsedTopPick[] {
  return picks.map((pick) => {
    const quote = quoteById.get(pick.oddsQuoteId);
    if (!quote) return pick;
    const canonicalLine = numberOrUndefined(quote.line);
    const canonicalOdds = numberValue(quote.price);
    const changes: string[] = [];
    if (pick.market !== quote.marketKey) changes.push(`market ${pick.market}->${quote.marketKey}`);
    if (pick.selection !== quote.selectionKey) changes.push(`selection ${pick.selection}->${quote.selectionKey}`);
    if (!sameOptionalNumber(pick.line, canonicalLine)) changes.push(`line ${pick.line ?? 'null'}->${canonicalLine ?? 'null'}`);
    if (!sameNumber(pick.odds, canonicalOdds)) changes.push(`odds ${pick.odds}->${canonicalOdds}`);
    if (!changes.length) return pick;
    return {
      ...pick,
      market: quote.marketKey,
      selection: quote.selectionKey,
      line: canonicalLine,
      odds: canonicalOdds,
      warnings: uniqueStrings([
        ...pick.warnings,
        `canonicalized from persisted odds quote (${changes.join(', ')})`,
      ]),
    };
  });
}

function validateTopPicks(
  picks: ParsedTopPick[],
  quoteById: Map<string, OddsQuoteRecord>,
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>,
  claims: ClaimRecord[],
  requiredCoverageQuotes: OddsQuoteRecord[] = [],
  evidenceItems: EvidenceItemRecord[] = [],
): string[] {
  const issues: string[] = [];
  const allowedEvidenceIds = new Set(allowedScoringEvidenceIds(evidenceGate, evidenceItems));
  const claimIds = new Set(claims.map((claim) => claim.id));
  const seenQuoteIds = new Set<string>();
  const coveredMarkets = new Set(picks.map((pick) => pick.market));
  const requiredMarkets = new Set(requiredCoverageQuotes.map((quote) => quote.marketKey));
  for (const market of requiredMarkets) {
    if (!coveredMarkets.has(market)) issues.push(`LLM output omitted required market "${market}" despite available allowedQuotes`);
  }

  for (const [index, pick] of picks.entries()) {
    const quote = quoteById.get(pick.oddsQuoteId);
    if (seenQuoteIds.has(pick.oddsQuoteId)) issues.push(`predictions[${index}] duplicates oddsQuoteId "${pick.oddsQuoteId}"`);
    seenQuoteIds.add(pick.oddsQuoteId);
    if (!quote) {
      issues.push(`predictions[${index}] references unknown oddsQuoteId "${pick.oddsQuoteId}"`);
      continue;
    }
    if (pick.market !== quote.marketKey) issues.push(`predictions[${index}] market does not match odds quote`);
    if (pick.selection !== quote.selectionKey) issues.push(`predictions[${index}] selection does not match odds quote`);
    if (!sameOptionalNumber(pick.line, numberOrUndefined(quote.line))) issues.push(`predictions[${index}] line does not match odds quote`);
    if (!sameNumber(pick.odds, numberValue(quote.price))) issues.push(`predictions[${index}] odds does not match odds quote`);
    if (pick.probability !== undefined && (pick.probability < 0 || pick.probability > 1)) issues.push(`predictions[${index}] probability must be between 0 and 1`);
    if (pick.modelProbability !== undefined && (pick.modelProbability < 0 || pick.modelProbability > 1)) issues.push(`predictions[${index}] modelProbability must be between 0 and 1`);
    if (pick.marketFairProbability !== undefined && (pick.marketFairProbability < 0 || pick.marketFairProbability > 1)) issues.push(`predictions[${index}] marketFairProbability must be between 0 and 1`);
    if (pick.confidence < 0 || pick.confidence > 1) issues.push(`predictions[${index}] confidence must be between 0 and 1`);
    for (const evidenceId of pick.evidenceIds) {
      if (!allowedEvidenceIds.has(evidenceId)) issues.push(`predictions[${index}] references unknown evidenceId "${evidenceId}"`);
    }
    for (const claimId of pick.claimIds) {
      if (!claimIds.has(claimId)) issues.push(`predictions[${index}] references unknown claimId "${claimId}"`);
    }
  }

  return issues;
}

function validateTopPick(input: {
  pick: ParsedTopPick;
  quote?: OddsQuoteRecord;
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>;
  claims: ClaimRecord[];
}) {
  return scorePredictionCandidate({
    fixtureId: input.quote?.fixtureId ?? 'unknown-fixture',
    market: input.pick.market,
    selection: input.pick.selection,
    line: input.pick.line,
    probability: input.pick.modelProbability ?? input.pick.probability,
    odds: input.pick.odds,
    marketFairProbability: numberOrNull(input.quote?.marketFairProbability) ?? input.pick.marketFairProbability,
    oddsQuoteId: input.pick.oddsQuoteId,
    evidenceIds: input.pick.evidenceIds,
    claimIds: input.pick.claimIds,
    rationale: input.pick.rationale,
    warnings: input.pick.warnings,
  });
}

async function calibrateModelProbability(
  probability: number | undefined,
  context: { market: string; model: string; promptVersion: string; fixtureId: string },
  deps: FixtureScoringDependencies,
): Promise<NonNullable<PredictionRecordView['calibration']> & { probability?: number; confidence?: number }> {
  if (probability === undefined) {
    return {
      applied: false,
      sampleSize: 0,
      minSample: CALIBRATION_MIN_SAMPLE,
      method: 'none',
      warnings: ['calibration skipped: missing modelProbability'],
    };
  }
  if (!deps.calibrationHistory) {
    return {
      applied: false,
      sampleSize: 0,
      minSample: CALIBRATION_MIN_SAMPLE,
      method: 'unavailable',
      rawProbability: probability,
      calibratedProbability: probability,
      warnings: [],
      probability,
    };
  }
  const points = await deps.calibrationHistory.getCalibrationPoints(context);
  if (points.length < CALIBRATION_MIN_SAMPLE) {
    return {
      applied: false,
      sampleSize: points.length,
      minSample: CALIBRATION_MIN_SAMPLE,
      method: 'isotonic',
      rawProbability: probability,
      calibratedProbability: probability,
      warnings: [`calibration degraded: sample ${points.length}/${CALIBRATION_MIN_SAMPLE} for ${context.market}/${context.model}/${context.promptVersion}`],
      probability,
      confidence: 0.49,
    };
  }
  const calibrate = isotonicCalibrate(points);
  const calibratedProbability = calibrate(probability);
  return {
    applied: true,
    sampleSize: points.length,
    minSample: CALIBRATION_MIN_SAMPLE,
    method: 'isotonic',
    rawProbability: probability,
    calibratedProbability,
    warnings: [],
    probability: calibratedProbability,
  };
}

function evaluateMarketSpecificEvidence(input: {
  pick: ParsedTopPick;
  selectedEvidenceIds: string[];
  selectedClaimIds: string[];
  claims: ClaimRecord[];
  evidenceItems: EvidenceItemRecord[];
}): { warnings: string[] } {
  const selectedEvidence = new Set(input.selectedEvidenceIds);
  const selectedClaims = input.claims.filter((claim) => input.selectedClaimIds.includes(claim.id));
  const marketSpecificClaims = selectedClaims.filter((claim) => {
    if (claim.marketKey !== input.pick.market) return false;
    if (claim.selectionKey && claim.selectionKey !== input.pick.selection) return false;
    const claimLine = numberOrUndefined(claim.line);
    if (claimLine !== undefined && !sameOptionalNumber(claimLine, input.pick.line)) return false;
    return jsonStringArray(claim.evidenceIds).some((id) => selectedEvidence.has(id));
  });
  if (marketSpecificClaims.length) return { warnings: [] };
  const fallbackText = `${input.pick.rationale} ${input.pick.warnings.join(' ')}`.toLowerCase();
  if (/fallback|fixture-level|market evidence unavailable|market-specific evidence unavailable/.test(fallbackText)) {
    return { warnings: [`market-specific evidence fallback declared for ${input.pick.market}:${input.pick.selection}`] };
  }
  const evidenceMarkets = new Set(input.evidenceItems
    .filter((item) => selectedEvidence.has(item.id))
    .flatMap((item) => {
      const metadata = objectMetadata(item.metadata);
      return typeof metadata.market === 'string' ? [metadata.market] : [];
    }));
  if (evidenceMarkets.has(input.pick.market)) return { warnings: [] };
  return { warnings: [`market-specific evidence missing for ${input.pick.market}:${input.pick.selection}${input.pick.line !== undefined ? `:${input.pick.line}` : ''}`] };
}

function evaluateConfigurablePredictionWarnings(input: {
  pick: ParsedTopPick;
  quote?: OddsQuoteRecord;
  confidence: number;
  evidenceIds: string[];
  evidenceItems: EvidenceItemRecord[];
  edge?: number;
}): string[] {
  const warnings: string[] = [];
  if (input.edge !== undefined && input.edge < MIN_EDGE) warnings.push(`edge below configured minimum ${MIN_EDGE}`);
  if (input.confidence < MIN_CONFIDENCE) warnings.push(`confidence below configured minimum ${MIN_CONFIDENCE}`);
  if (input.evidenceIds.length < MIN_EVIDENCE_ITEMS) warnings.push(`evidence items below configured minimum ${MIN_EVIDENCE_ITEMS}`);
  const sourceIds = new Set(input.evidenceItems.filter((item) => input.evidenceIds.includes(item.id)).map((item) => item.sourceId));
  if (sourceIds.size < MIN_DISTINCT_SOURCES) warnings.push(`distinct source count below configured minimum ${MIN_DISTINCT_SOURCES}`);
  const marketEfficiency = numberOrUndefined(input.quote?.marketEfficiencyScore);
  if (marketEfficiency !== undefined && marketEfficiency < MIN_MARKET_EFFICIENCY) {
    warnings.push(`market efficiency below configured minimum ${MIN_MARKET_EFFICIENCY}`);
  }
  return warnings;
}

function fairProbabilityForQuote(quote: OddsQuoteRecord | undefined, pick: ParsedTopPick): number | null {
  const rawFairProbability = numberOrNull(quote?.marketFairProbability)
    ?? numberOrNull(pick.marketFairProbability)
    ?? numberOrNull(quote?.marketImpliedProbability)
    ?? (Number.isFinite(pick.odds) ? 1 / pick.odds : null);
  const impliedProbability = numberOrNull(quote?.impliedProbability)
    ?? (Number.isFinite(pick.odds) ? 1 / pick.odds : null);
  if (
    pick.market === 'double_chance'
    && rawFairProbability !== null
    && impliedProbability !== null
    && impliedProbability >= 0.75
    && rawFairProbability < impliedProbability - 0.2
  ) {
    return impliedProbability;
  }
  return rawFairProbability;
}

function fairProbabilityWarnings(quote: OddsQuoteRecord | undefined, pick: ParsedTopPick, fairProbability: number | null): string[] {
  const rawFairProbability = numberOrNull(quote?.marketFairProbability) ?? numberOrNull(pick.marketFairProbability);
  const impliedProbability = numberOrNull(quote?.impliedProbability)
    ?? (Number.isFinite(pick.odds) ? 1 / pick.odds : null);
  if (
    pick.market === 'double_chance'
    && rawFairProbability !== null
    && impliedProbability !== null
    && fairProbability !== rawFairProbability
  ) {
    return [`double_chance fair probability ${round(rawFairProbability)} was inconsistent with low-price implied probability ${round(impliedProbability)}; edge capped to implied probability`];
  }
  return [];
}

function evaluatePostScoringRiskControls(input: {
  pick: ParsedTopPick;
  quote?: OddsQuoteRecord;
  warnings: string[];
  confidence: number;
  calibrationApplied?: boolean;
  model?: string;
}): {
  confidence: number;
  confidenceBand?: 'low' | 'medium' | 'high';
  warnings: string[];
  forceReview: boolean;
  parlayIneligible: boolean;
} {
  const warnings: string[] = [];
  let confidence = input.confidence;
  let confidenceChanged = false;
  let forceReview = false;
  let parlayIneligible = false;
  const warningText = input.warnings.join('\n');
  const lowLiquidity = metadataBool(input.quote?.metadata, 'lowLiquidity') || /low[-_ ]liquidity|low liquidity/i.test(warningText);
  const staleOdds = /stale (?:news|source|odds) source|stale odds/i.test(warningText);

  if (staleOdds && lowLiquidity) {
    const nextConfidence = Math.min(confidence, 0.49);
    confidenceChanged = confidenceChanged || nextConfidence !== confidence;
    confidence = nextConfidence;
    forceReview = true;
    parlayIneligible = true;
    warnings.push('stale low-liquidity prediction requires review and is excluded from parlays');
  }
  if (confidence < PROMOTABLE_CONFIDENCE_FLOOR) {
    forceReview = true;
    parlayIneligible = true;
    warnings.push(`confidence ${round(confidence)} below promotion floor ${PROMOTABLE_CONFIDENCE_FLOOR}`);
  }
  if (confidence >= 0.8 && confidence < 0.9 && !input.calibrationApplied) {
    const nextConfidence = Math.min(confidence, 0.74);
    confidenceChanged = confidenceChanged || nextConfidence !== confidence;
    confidence = nextConfidence;
    warnings.push('uncalibrated high-confidence band 0.80-0.90 capped after validation overconfidence');
  }
  if (input.model && REVIEW_ONLY_MODELS.has(input.model)) {
    forceReview = true;
    parlayIneligible = true;
    warnings.push(`${input.model} output is review-only until calibration sample is sufficient`);
  }

  return {
    confidence,
    confidenceBand: confidenceChanged ? qualityFromConfidence(confidence) : undefined,
    warnings,
    forceReview,
    parlayIneligible,
  };
}

function buildScoringMarketCoverage(
  requestedMarkets: readonly MarketKey[],
  quotes: OddsQuoteRecord[],
  predictions: PredictionRecordView[],
): ScoringMarketCoverage {
  const quotedMarkets = [...new Set(quotes.map((quote) => quote.marketKey).filter(isMarketKey))].sort();
  const predictedMarkets = [...new Set(predictions.map((prediction) => prediction.market).filter(isMarketKey))].sort();
  const skippedMarkets = requestedMarkets.flatMap((market) => {
    if (!quotedMarkets.includes(market)) return [{ market, reason: 'missing odds quotes for requested market' }];
    if (!predictedMarkets.includes(market)) return [{ market, reason: 'missing scored prediction for requested market' }];
    if (predictions.some((prediction) => prediction.market === market && prediction.status !== 'promotable')) {
      return [{ market, reason: 'market prediction requires review or is blocked' }];
    }
    return [];
  });
  return {
    requestedMarkets: [...requestedMarkets],
    quotedMarkets,
    predictedMarkets,
    skippedMarkets,
  };
}

function summarizeCalibration(events: Array<NonNullable<PredictionRecordView['calibration']>>): ScoringCalibrationSummary {
  const warnings = uniqueStrings(events.flatMap((event) => event.warnings ?? []));
  return {
    applied: events.filter((event) => event.applied).length,
    degraded: events.filter((event) => !event.applied && (event.sampleSize ?? 0) > 0 && event.sampleSize < event.minSample).length,
    unavailable: events.filter((event) => event.method === 'unavailable').length,
    minSample: CALIBRATION_MIN_SAMPLE,
    warnings,
  };
}

function toAllowedQuote(quote: OddsQuoteRecord) {
  return {
    oddsQuoteId: quote.id,
    market: quote.marketKey,
    selection: quote.selectionKey,
    line: numberOrNull(quote.line),
    odds: numberValue(quote.price),
    impliedProbability: numberOrNull(quote.impliedProbability),
    marketImpliedProbability: numberOrNull(quote.marketImpliedProbability),
    marketFairProbability: numberOrNull(quote.marketFairProbability),
    consensusFairOdds: numberOrNull(quote.consensusFairOdds),
    overround: numberOrNull(quote.overround),
    marketEfficiencyScore: numberOrNull(quote.marketEfficiencyScore),
    lowLiquidity: metadataBool(quote.metadata, 'lowLiquidity'),
    bookmaker: quote.bookmaker,
    capturedAt: quote.capturedAt instanceof Date ? quote.capturedAt.toISOString() : String(quote.capturedAt),
  };
}

function selectScoringPromptQuotes(quotes: OddsQuoteRecord[]): OddsQuoteRecord[] {
  const grouped = new Map<string, OddsQuoteRecord>();
  for (const quote of quotes) {
    const key = [
      quote.marketKey,
      quote.selectionKey,
      numberOrNull(quote.line) ?? 'null',
    ].join(':');
    const current = grouped.get(key);
    if (!current || numberValue(quote.price) > numberValue(current.price)) {
      grouped.set(key, quote);
    }
  }

  return [...grouped.values()]
    .sort(comparePromptQuotes)
    .slice(0, MAX_ALLOWED_QUOTES_IN_SCORE_PROMPT);
}

function comparePromptQuotes(a: OddsQuoteRecord, b: OddsQuoteRecord): number {
  return marketPriority(a.marketKey) - marketPriority(b.marketKey)
    || linePriority(a) - linePriority(b)
    || String(a.selectionKey).localeCompare(String(b.selectionKey))
    || numberValue(b.price) - numberValue(a.price)
    || String(a.bookmaker ?? '').localeCompare(String(b.bookmaker ?? ''));
}

function marketPriority(market: string | null | undefined): number {
  switch (market) {
    case 'h2h': return 0;
    case 'double_chance': return 1;
    case 'goals_over_under': return 2;
    case 'btts': return 3;
    case 'corners_over_under': return 4;
    default: return 10;
  }
}

function linePriority(quote: OddsQuoteRecord): number {
  const line = numberOrNull(quote.line);
  if (line === null) return 0;
  const preferred = quote.marketKey === 'corners_over_under'
    ? [8.5, 9.5, 10.5, 7.5, 11.5, 8, 9, 10, 11]
    : [1.5, 2.5, 3.5, 0.5, 4.5, 5.5, 2.25, 2.75, 3.25, 3.75];
  const exact = preferred.indexOf(line);
  if (exact >= 0) return exact;
  const nearest = Math.min(...preferred.map((candidate) => Math.abs(candidate - line)));
  return preferred.length + nearest;
}

function fixturePromptView(fixture: FixtureRecord) {
  const metadata = fixture.metadata && typeof fixture.metadata === 'object' && !Array.isArray(fixture.metadata)
    ? fixture.metadata as Record<string, any>
    : {};
  const raw = metadata.raw && typeof metadata.raw === 'object' ? metadata.raw as Record<string, any> : {};
  return {
    id: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    competitionId: fixture.competitionId,
    season: fixture.season,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    scheduledAt: fixture.scheduledAt instanceof Date ? fixture.scheduledAt.toISOString() : fixture.scheduledAt,
    status: fixture.status,
    scoreHome: fixture.scoreHome,
    scoreAway: fixture.scoreAway,
    includedByFilters: fixture.includedByFilters,
    metadata: compactJson({
      league: raw.league
        ? {
          id: raw.league.id,
          name: raw.league.name,
          country: raw.league.country,
          season: raw.league.season,
          round: raw.league.round,
        }
        : undefined,
      teams: raw.teams
        ? {
          home: raw.teams.home ? { id: raw.teams.home.id, name: raw.teams.home.name } : undefined,
          away: raw.teams.away ? { id: raw.teams.away.id, name: raw.teams.away.name } : undefined,
        }
        : undefined,
      venue: metadata.venue,
      round: metadata.round,
      timezone: metadata.timezone,
      apiFootballStatusShort: metadata.apiFootballStatusShort,
      apiFootballStatusLong: metadata.apiFootballStatusLong,
    }),
  };
}

function oddsSnapshotPromptView(snapshot: OddsSnapshotRecord) {
  return {
    id: snapshot.id,
    fixtureId: snapshot.fixtureId,
    providerFixtureId: snapshot.providerFixtureId,
    providerSnapshotId: snapshot.providerSnapshotId,
    bookmakerCount: snapshot.bookmakerCount,
    capturedAt: snapshot.capturedAt instanceof Date ? snapshot.capturedAt.toISOString() : String(snapshot.capturedAt),
    payloadHash: snapshot.payloadHash,
  };
}

function researchBundlePromptView(bundle: ResearchBundleRecord | null) {
  if (!bundle) return null;
  return {
    id: bundle.id,
    runId: bundle.runId,
    status: bundle.status,
    gateResult: bundle.gateResult,
    providerAgentic: bundle.providerAgentic,
    model: bundle.model,
    promptVersion: bundle.promptVersion,
    warnings: bundle.warnings,
    metadata: bundle.metadata,
  };
}

function sourcePromptView(source: SourceRecordRecord) {
  return {
    id: source.id,
    type: source.sourceType,
    url: source.url,
    title: source.title,
    externalId: source.externalId,
    providerSnapshotId: source.providerSnapshotId,
    capturedAt: source.capturedAt instanceof Date ? source.capturedAt.toISOString() : String(source.capturedAt),
    metadata: source.metadata,
  };
}

function evidencePromptView(evidence: EvidenceItemRecord) {
  return {
    id: evidence.id,
    sourceId: evidence.sourceId,
    summary: evidence.summaryRedacted,
    confidence: numberOrNull(evidence.confidence),
    claimIds: evidence.claimIds,
    metadata: evidence.metadata,
  };
}

function claimPromptView(claim: ClaimRecord) {
  return {
    id: claim.id,
    statement: claim.statement,
    marketKey: claim.marketKey,
    selectionKey: claim.selectionKey,
    line: numberOrNull(claim.line),
    supportLevel: claim.supportLevel,
    confidence: numberOrNull(claim.confidence),
    evidenceIds: claim.evidenceIds,
    conflictStatus: claim.conflictStatus,
  };
}

function hasRealWebResearchSource(sources: SourceRecordRecord[]): boolean {
  return sources.some(isRealWebSourceRecord);
}

function defaultPersistArtifact(repositories: PredictionServiceRepositories) {
  return async (input: { runId: string; path: string; payload: unknown; fixtureId?: string }) => {
    if (!repositories.artifacts) return null;
    return repositories.artifacts.create({
      name: basename(input.path),
      kind: 'predictions',
      path: input.path,
      runId: input.runId,
      sha256: hashPayload(input.payload),
      metadata: compactJson({
        fixtureId: input.fixtureId,
        promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
        scoringRuleVersion: SCORING_RULE_VERSION,
      }),
    });
  };
}

function defaultPersistPredictions(repositories: PredictionServiceRepositories) {
  return async (inputs: PredictionInput[]) => {
    if (!repositories.predictions) throw new Error('Prediction repository is unavailable.');
    const records: PredictionRecord[] = [];
    for (const input of inputs) {
      records.push(await repositories.predictions.create(input));
    }
    return records;
  };
}

function toPredictionInput(
  prediction: PredictionRecordView,
  fixture: FixtureRecord,
  oddsSnapshot: OddsSnapshotRecord,
  artifactId: string | null,
  includedByFilters: string[],
): PredictionInput {
  return {
    id: prediction.id,
    runId: prediction.runId,
    fixtureId: fixture.id,
    oddsSnapshotId: oddsSnapshot.id,
    oddsQuoteId: prediction.oddsQuoteId,
    researchBundleId: prediction.researchBundleId ?? null,
    artifactId,
    marketKey: prediction.market,
    selectionKey: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    impliedProbability: prediction.impliedProbability,
    estimatedProbability: prediction.probability ?? null,
    edge: prediction.edge ?? null,
    confidence: prediction.confidence,
    quality: prediction.quality,
    rationaleRedacted: prediction.rationale ?? '',
    warnings: prediction.warnings,
    evidenceIds: prediction.evidenceIds,
    includedByFilters,
    providerAgentic: prediction.providerAgentic ?? null,
    model: prediction.model ?? null,
    promptVersion: prediction.promptVersion,
    scoringRuleVersion: prediction.scoringRuleVersion,
    status: prediction.status,
    generatedAt: prediction.generatedAt ? new Date(prediction.generatedAt) : new Date(),
    metadata: compactJson({
      providerFixtureId: fixture.providerFixtureId,
      claimIds: prediction.claimIds,
      modelProbability: prediction.modelProbability ?? prediction.probability ?? null,
      marketFairProbability: prediction.marketFairProbability ?? null,
      confidenceBand: prediction.confidenceBand ?? prediction.quality,
      blockers: prediction.blockers,
      promotable: prediction.promotable ?? prediction.status === 'promotable',
      parlayEligible: prediction.parlayEligible,
      calibration: prediction.calibration,
    }),
  };
}

async function upsertRun(
  config: AgentConfig,
  runtime: RuntimeContext,
  repositories: PredictionServiceRepositories,
  runId: string,
  verdict: string,
  status: string,
  completedAt: Date,
): Promise<void> {
  await repositories.harnessRuns?.upsertForRun?.({
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports,
    providerAgentic: config.provider,
    model: config.model,
    status,
    verdict,
    startedAt: completedAt,
    completedAt,
  });
}

function blockedResult(
  runId: string,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  input: {
    error?: string;
    reasons: string[];
    fixtureId?: string;
    providerFixtureId?: string;
    oddsSnapshotId?: string;
    marketScope?: readonly MarketKey[];
  },
): FixtureScoringResult {
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: input.reasons,
    warnings: input.error ? [input.error] : [],
  };
  const artifactPath = artifactWriter(runId, 'predictions-blocked.json', {
    runId,
    fixtureId: input.fixtureId,
    providerFixtureId: input.providerFixtureId,
    oddsSnapshotId: input.oddsSnapshotId,
    marketScope: input.marketScope,
    gateResult,
    error: input.error,
  });

  return {
    ok: false,
    runId,
    fixtureId: input.fixtureId,
    providerFixtureId: input.providerFixtureId,
    gateResult,
    predictions: [],
    artifactPath,
    error: input.error,
  };
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return NaN;
}

function numberOrNull(value: unknown): number | null {
  const parsed = numberOrUndefined(value);
  return parsed ?? null;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metadataBool(metadata: unknown, key: string): boolean | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function objectMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function dateValue(value: unknown): Date | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : undefined;
  }
  return undefined;
}

function isParlayEligibleResearch(researchBundle: ResearchBundleRecord | undefined, warnings: string[]): boolean {
  return !!researchBundle
    && researchBundleVerdict(researchBundle) !== 'blocked'
    && !warnings.some((warning) =>
      /fallback research|stale (news|source|odds) source|timed out|insufficient evidence/i.test(warning),
    );
}

function researchBundleVerdict(researchBundle: ResearchBundleRecord | undefined): string | undefined {
  if (!researchBundle) return undefined;
  if (typeof researchBundle.status === 'string') return researchBundle.status;
  const gate = researchBundle.gateResult;
  if (gate && typeof gate === 'object' && !Array.isArray(gate)) {
    const verdict = (gate as { verdict?: unknown }).verdict;
    if (typeof verdict === 'string') return verdict;
  }
  return undefined;
}

function metadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  return numberOrUndefined((metadata as Record<string, unknown>)[key]);
}

function stalePickFromQuote(quote: OddsQuoteRecord | undefined, selectedOdds: number): boolean {
  const metadata = quote?.metadata;
  if (metadataBool(metadata, 'lineMovementAgainstPick')) return true;
  const openingOdds = metadataNumber(metadata, 'openingOdds') ?? metadataNumber(metadata, 'openingPrice');
  const currentOdds = numberOrUndefined(quote?.price) ?? selectedOdds;
  if (openingOdds === undefined || !Number.isFinite(currentOdds)) return false;
  return movedAgainstPick('back', openingOdds, currentOdds);
}

function lineupPendingForFixture(
  fixture: FixtureRecord,
  market: string,
  quote: OddsQuoteRecord | undefined,
  now: Date,
): boolean {
  if (metadataBool(quote?.metadata, 'lineupPending')) return true;
  const lineupConfirmed = metadataBool(quote?.metadata, 'lineupConfirmed')
    ?? metadataBool(fixture.metadata, 'lineupConfirmed')
    ?? false;
  const scheduledAt = fixture.scheduledAt instanceof Date
    ? fixture.scheduledAt.toISOString()
    : String(fixture.scheduledAt ?? '');
  return lineupGate({ market, kickoffAt: scheduledAt, lineupConfirmed, now }).includes('lineup-pending');
}

function modelDisagreementFromMetadata(metadata: unknown): boolean {
  if (metadataBool(metadata, 'modelDisagreement')) return true;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const raw = (metadata as Record<string, unknown>).providerPredictions;
  if (!Array.isArray(raw)) return false;
  const predictions = raw.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const selection = (item as Record<string, unknown>).selection;
    const probability = numberOrUndefined((item as Record<string, unknown>).probability);
    return typeof selection === 'string' && probability !== undefined ? [{ selection, probability }] : [];
  });
  return detectDisagreement(predictions).includes('model-disagreement');
}

function evaluateRetrievalQuality(input: {
  sources: SourceRecordRecord[];
  claims: ClaimRecord[];
  fixtureStatus?: string | null;
  now: Date;
}): string[] {
  const warnings: string[] = [];
  const provenance = claimsHaveProvenance(input.claims.map((claim) => ({
    id: claim.id,
    sourceIds: claim.sourceId ? [claim.sourceId] : [],
    evidenceIds: jsonStringArray(claim.evidenceIds),
  })));
  if (!provenance.ok) warnings.push(`claims missing provenance: ${provenance.missing.join(', ')}`);

  for (const source of input.sources) {
    const freshness = evaluateFreshness({
      sourceType: freshnessSourceType(source.sourceType),
      availableAt: source.capturedAt instanceof Date ? source.capturedAt.toISOString() : String(source.capturedAt ?? ''),
      fixtureStatus: input.fixtureStatus ?? undefined,
      now: input.now,
    });
    if (!freshness.fresh) warnings.push(freshness.reason ?? `stale source ${source.id}`);
  }
  return [...new Set(warnings)];
}

function freshnessSourceType(sourceType: string): string {
  if (sourceType === 'provider-snapshot' || sourceType === 'api-football') return 'odds';
  if (sourceType === 'web-search') return 'news';
  return sourceType;
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringField(item: Record<string, unknown>, key: string, index: number): string {
  const value = item[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`predictions[${index}].${key} must be a non-empty string.`);
  }
  return value.trim();
}

function numberField(item: Record<string, unknown>, key: string, index: number): number {
  const value = numberValue(item[key]);
  if (!Number.isFinite(value)) throw new Error(`predictions[${index}].${key} must be a number.`);
  return value;
}

function optionalNumberField(item: Record<string, unknown>, key: string, index: number): number | undefined {
  if (item[key] === undefined || item[key] === null) return undefined;
  return numberField(item, key, index);
}

function nullableNumberField(item: Record<string, unknown>, key: string, index: number): number | undefined {
  if (item[key] === undefined || item[key] === null) return undefined;
  return numberField(item, key, index);
}

function optionalBooleanField(item: Record<string, unknown>, key: string, index: number): boolean | undefined {
  if (item[key] === undefined || item[key] === null) return undefined;
  if (typeof item[key] !== 'boolean') throw new Error(`predictions[${index}].${key} must be a boolean.`);
  return item[key];
}

function optionalConfidenceBandField(
  item: Record<string, unknown>,
  key: string,
  index: number,
): 'low' | 'medium' | 'high' | undefined {
  if (item[key] === undefined || item[key] === null) return undefined;
  if (item[key] === 'low' || item[key] === 'medium' || item[key] === 'high') return item[key];
  throw new Error(`predictions[${index}].${key} must be low, medium, or high.`);
}

function stringArrayField(item: Record<string, unknown>, key: string, index: number, optional = false): string[] {
  const value = item[key];
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new Error(`predictions[${index}].${key} must be an array of strings.`);
  return value.map((entry, entryIndex) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new Error(`predictions[${index}].${key}[${entryIndex}] must be a non-empty string.`);
    }
    return entry.trim();
  });
}

function sameOptionalNumber(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return sameNumber(left, right);
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? 'predictions.json';
}
