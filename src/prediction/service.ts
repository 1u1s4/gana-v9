import { randomUUID } from 'crypto';
import { join } from 'path';
import type { AgentConfig } from '../config.js';
import { runAgentWithRetry } from '../agent.js';
import { createApiFootballPersistence, createApiFootballProvider } from '../providers/sports/api-football.js';
import { API_FOOTBALL_PROVIDER, type FixtureStatistics } from '../providers/sports/types.js';
import { movedAgainstPick } from '../markets/line-movement.js';
import { lineupGate } from '../markets/lineup-gate.js';
import { evaluateFreshness } from '../retrieval/freshness.js';
import { claimsHaveProvenance } from '../retrieval/provenance.js';
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
import { aggregatePredictionGate, evaluateEvidenceGate, evaluatePredictionGates } from './gates.js';
import { buildAtomicPrediction, scorePredictionCandidate } from './scoring.js';
import { SCORE_PREDICTION_PROMPT_VERSION, buildScorePredictionPrompt, type ResearchWebMode } from './prompts.js';
import { SCORING_RULE_VERSION, type PredictionRecordView } from './types.js';

const SCORING_AGENT_TIMEOUT_MS = 300_000;
const SCORING_OUTPUT_SCHEMA_PATH = join(process.cwd(), 'skills/score-prediction-v1/output.schema.json');
const MAX_ALLOWED_QUOTES_IN_SCORE_PROMPT = 80;

export interface RunFixtureScoringInput {
  fixtureId: string;
  web?: ResearchWebMode;
  signal?: AbortSignal;
}

export interface FixtureScoringResult {
  ok: boolean;
  runId: string;
  fixtureId?: string;
  providerFixtureId?: string;
  gateResult: ReturnType<typeof aggregatePredictionGate>;
  predictions: PredictionRecordView[];
  retrievalWarnings?: string[];
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

  const oddsQuotes = await repositories.oddsQuotes.listLatest({
    fixtureId: fixture.id,
    snapshotId: oddsSnapshot.id,
    take: 500,
  });
  if (!oddsQuotes.length) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Odds snapshot "${oddsSnapshot.id}" has no persisted quotes.`,
      reasons: ['missing persisted odds quote'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }

  const web = input.web ?? 'off';
  const research = await latestResearchGraph(repositories, fixture.id);
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
      ...(web !== 'off' && !hasWebResearchSource(research.sources)
        ? [`web ${web} requested but no persisted web-search source is linked to the latest research bundle`]
        : []),
    ],
  });

  let llmOutput: ParsedTopPick[];
  let rawOutput = '';
  try {
    const result = await runScoringAgent(deps.agentRunner ?? runAgentWithRetry, config, prompt, {
      runtime,
      signal: input.signal,
    });
    rawOutput = result.text;
    llmOutput = parseTopPickOutput(rawOutput);
  } catch (err: any) {
    const error = err?.message ?? String(err);
    llmOutput = buildFallbackTopPicks({
      oddsQuotes: promptOddsQuotes,
      evidenceGate,
      claimIds: research.claims.map((claim) => claim.id),
      warning: `prediction LLM scoring failed; generated deterministic API-Football fallback picks: ${error}`,
    });
    rawOutput = JSON.stringify({
      fallback: true,
      error,
      predictions: llmOutput,
    }, null, 2);
    if (!llmOutput.length) {
      const result = blockedResult(runId, artifactWriter, {
        error,
        reasons: ['prediction LLM scoring failed', 'fallback scoring unavailable'],
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        oddsSnapshotId: oddsSnapshot.id,
      });
      await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
      return result;
    }
  }

  const quoteById = new Map(oddsQuotes.map((quote) => [quote.id, quote]));
  const topPickIssues = validateTopPicks(llmOutput, quoteById, evidenceGate, research.claims);
  if (topPickIssues.length) {
    const result = blockedResult(runId, artifactWriter, {
      error: `Prediction LLM output failed validation: ${topPickIssues.join('; ')}`,
      reasons: ['invalid prediction LLM output'],
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: oddsSnapshot.id,
    });
    await upsertRun(config, runtime, repositories, runId, result.gateResult.verdict, 'failed', now());
    return result;
  }
  const predictions = llmOutput.map((pick) => {
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
      hasWebResearch: hasWebResearchSource(research.sources),
      qualityWarnings: retrievalWarnings,
    });
    const selectedEvidenceIds = pick.evidenceIds.length ? pick.evidenceIds : evidenceGate.evidenceIds;
    const selectedClaimIds = pick.claimIds.length ? pick.claimIds : evidenceGate.claimIds;

    return buildAtomicPrediction({
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
      marketFairProbability: numberOrNull(quote?.marketFairProbability),
      lowLiquidity: metadataBool(quote?.metadata, 'lowLiquidity'),
      stalePick: stalePickFromQuote(quote, pick.odds),
      lineupPending: lineupPendingForFixture(fixture, pick.market, quote, now()),
      modelDisagreement: modelDisagreementFromMetadata(quote?.metadata),
      estimatedProbability: pick.probability,
      evidenceIds: selectedEvidenceIds,
      claimIds: selectedClaimIds,
      status: gate.verdict,
      confidence: pick.confidence,
      rationale: pick.rationale,
      warnings: [...gate.warnings, ...retrievalWarnings, ...candidateScore.reasons, ...pick.warnings],
      providerAgentic: config.provider,
      model: config.model,
      researchBundleId: research.researchBundle?.id,
      generatedAt,
    });
  });

  const aggregate = aggregatePredictionGate(predictions.map((prediction) => ({
    verdict: prediction.status === 'candidate' || prediction.status === 'draft'
      ? 'review-required'
      : prediction.status,
    reasons: prediction.status === 'promotable' ? ['prediction gates passed'] : prediction.warnings,
    warnings: prediction.warnings,
  })));
  const artifactPayload = {
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    oddsSnapshotId: oddsSnapshot.id,
    researchBundleId: research.researchBundle?.id ?? null,
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
  const confidence = numberField(item, 'confidence', index);
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
    confidence,
    evidenceIds,
    claimIds,
    rationale,
    warnings,
  };
}

function validateTopPicks(
  picks: ParsedTopPick[],
  quoteById: Map<string, OddsQuoteRecord>,
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>,
  claims: ClaimRecord[],
): string[] {
  const issues: string[] = [];
  const evidenceIds = new Set(evidenceGate.evidenceIds);
  const claimIds = new Set(claims.map((claim) => claim.id));
  const seenQuoteIds = new Set<string>();

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
    if (pick.confidence < 0 || pick.confidence > 1) issues.push(`predictions[${index}] confidence must be between 0 and 1`);
    if (!pick.evidenceIds.length) issues.push(`predictions[${index}] requires at least one evidenceId`);
    for (const evidenceId of pick.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) issues.push(`predictions[${index}] references unknown or insufficient evidenceId "${evidenceId}"`);
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
    probability: input.pick.probability,
    odds: input.pick.odds,
    oddsQuoteId: input.pick.oddsQuoteId,
    evidenceIds: input.pick.evidenceIds,
    claimIds: input.pick.claimIds,
    rationale: input.pick.rationale,
    warnings: input.pick.warnings,
  });
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

function buildFallbackTopPicks(input: {
  oddsQuotes: OddsQuoteRecord[];
  evidenceGate: ReturnType<typeof evaluateEvidenceGate>;
  claimIds: string[];
  warning: string;
}): ParsedTopPick[] {
  if (!input.evidenceGate.evidenceIds.length) return [];
  const selected: OddsQuoteRecord[] = [];
  const seenMarkets = new Set<string>();
  for (const quote of [...input.oddsQuotes].sort(compareFallbackQuotes)) {
    if (seenMarkets.has(quote.marketKey)) continue;
    selected.push(quote);
    seenMarkets.add(quote.marketKey);
    if (selected.length >= 3) break;
  }

  return selected.map((quote) => {
    const odds = numberValue(quote.price);
    const implied = numberOrUndefined(quote.impliedProbability) ?? (Number.isFinite(odds) && odds > 1 ? 1 / odds : 0.5);
    const probability = Math.min(0.88, Math.max(0.05, implied + 0.025));
    return {
      oddsQuoteId: quote.id,
      market: quote.marketKey,
      selection: quote.selectionKey,
      ...(numberOrUndefined(quote.line) !== undefined && { line: numberOrUndefined(quote.line) }),
      odds,
      probability,
      confidence: Math.min(0.7, Math.max(0.52, probability - 0.05)),
      evidenceIds: input.evidenceGate.evidenceIds.slice(0, 5),
      claimIds: input.claimIds.slice(0, 5),
      rationale: 'Fallback analytical pick generated from persisted API-Football odds, fixture context, and the latest evidence bundle because agentic scoring did not return valid JSON.',
      warnings: [input.warning],
    };
  });
}

function compareFallbackQuotes(a: OddsQuoteRecord, b: OddsQuoteRecord): number {
  return marketPriority(a.marketKey) - marketPriority(b.marketKey)
    || fallbackOddsBandPenalty(a) - fallbackOddsBandPenalty(b)
    || linePriority(a) - linePriority(b)
    || numberValue(a.price) - numberValue(b.price);
}

function fallbackOddsBandPenalty(quote: OddsQuoteRecord): number {
  const odds = numberValue(quote.price);
  if (!Number.isFinite(odds)) return 10_000;
  if (odds >= 1.2 && odds <= 1.95) return 0;
  if (odds > 1.05 && odds < 1.2) return 1;
  if (odds > 1.95 && odds <= 2.4) return 2;
  return Math.abs(odds - 1.6) + 10;
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

function hasWebResearchSource(sources: SourceRecordRecord[]): boolean {
  return sources.some((source) => source.sourceType === 'web-search');
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

function basename(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? 'predictions.json';
}
