import { randomUUID } from 'crypto';
import { basename, join } from 'path';
import { runAgentWithRetry } from '../agent.js';
import type { AgentConfig } from '../config.js';
import type { MarketKey } from '../domain/markets.js';
import type { PredictionQuality, PredictionStatus } from '../prediction/types.js';
import { API_FOOTBALL_PROVIDER } from '../providers/sports/types.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type {
  ArtifactRecord,
  JsonValue,
  ParlayInput,
  ParlayLegInput,
  ParlayRecord,
  PredictionRecord,
  StoragePrismaClient,
} from '../storage/types.js';
import { buildParlay } from './builder.js';
import {
  calculateAggregateConfidence,
  calculateAggregateQuality,
  calculateCombinedOdds,
  PARLAY_BUILDER_RULE_VERSION,
} from './rules.js';
import type {
  BuildParlayResult,
  Parlay,
  ParlayConfig,
  ParlayLeg,
  ParlayPredictionEvaluation,
  ParlayRiskTag,
  ParlaySourcePrediction,
  ResolvedParlayConfig,
} from './types.js';

const MAIN_PARLAY_PREDICTION_STATUSES: PredictionStatus[] = ['candidate', 'promotable'];
const PORTFOLIO_PREDICTION_STATUSES: PredictionStatus[] = ['candidate', 'review-required', 'promotable'];
const PARLAY_PORTFOLIO_PROMPT_VERSION = 'parlay-portfolio-v3';
const PARLAY_PORTFOLIO_SCHEMA_PATH = join(process.cwd(), 'skills/parlay-portfolio-v1/output.schema.json');
const PARLAY_PORTFOLIO_AGENT_TIMEOUT_MS = 120_000;
const PORTFOLIO_MIN_CONFIDENCE = 0.72;
const PORTFOLIO_REVIEW_MIN_CONFIDENCE = 0.7;
const CONSERVATIVE_MIN_AGGREGATE_CONFIDENCE = 0.62;
const BALANCED_MIN_AGGREGATE_CONFIDENCE = 0.55;
const PORTFOLIO_PROFILES = [
  { key: 'conservative', label: 'Conservador', minLegs: 2, maxLegs: 3, minOdds: 1.8, maxOdds: 2.3, targetParlays: 3, minConfidence: PORTFOLIO_MIN_CONFIDENCE, maxReviewOrWarningLegs: 1, allowDrawExposure: false, reviewOnly: false },
  { key: 'balanced', label: 'Balanceado', minLegs: 3, maxLegs: 3, minOdds: 2.3, maxOdds: 3.5, targetParlays: 1, minConfidence: PORTFOLIO_MIN_CONFIDENCE, maxReviewOrWarningLegs: 1, allowDrawExposure: false, reviewOnly: false },
  { key: 'review', label: 'Revision', minLegs: 2, maxLegs: 3, minOdds: 1.6, maxOdds: 3.2, targetParlays: 3, minConfidence: PORTFOLIO_REVIEW_MIN_CONFIDENCE, maxReviewOrWarningLegs: 99, allowDrawExposure: true, reviewOnly: true },
] as const;

type ParlayPortfolioProfile = typeof PORTFOLIO_PROFILES[number]['key'];
type ParlayPortfolioProfileSpec = typeof PORTFOLIO_PROFILES[number];

interface ParsedPortfolioParlay {
  title?: string;
  predictionIds: string[];
  rationale: string;
  riskNotes?: string[];
  duplicateFixtureJustification?: string;
}

interface ParsedPortfolioOutput {
  parlays: ParsedPortfolioParlay[];
  noParlayReason?: string;
}

interface PortfolioBuild {
  profile: ParlayPortfolioProfile;
  build: BuildParlayResult;
}

type PortfolioValidationResult =
  | { ok: true; profile: ParlayPortfolioProfile; build: BuildParlayResult; signature: string }
  | { ok: false; reasons: string[] };

export interface RunParlayBuildInput {
  date: string;
  sourceRunId?: string;
  portfolio?: 'llm';
  configOverrides?: ParlayConfig;
}

export interface ParlayGateResult {
  verdict: PredictionStatus;
  reasons: string[];
  warnings: string[];
}

export interface ParlayBuildRunResult {
  ok: boolean;
  runId: string;
  date: string;
  gateResult: ParlayGateResult;
  build: BuildParlayResult;
  portfolio?: ParlayPortfolio;
  persistedParlayId?: string;
  persistedParlayIds?: string[];
  artifactPath?: string;
  error?: string;
}

export interface ParlayBuildDependencies {
  now?: () => Date;
  repositories?: ParlayServiceRepositories;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  persistArtifact?: (input: {
    runId: string;
    path: string;
    payload: unknown;
    date: string;
  }) => Promise<Pick<ArtifactRecord, 'id'> | null>;
  persistParlay?: (input: {
    parlay: ParlayInput;
    legs: Array<Omit<ParlayLegInput, 'parlayId'>>;
  }) => Promise<Pick<ParlayRecord, 'id'> | null>;
  agentRunner?: typeof runAgentWithRetry;
}

export interface ParlayPortfolio {
  id: string;
  sourceRunId: string;
  promptVersion: string;
  profiles: Array<{
    profile: ParlayPortfolioProfile;
    promptVersion: string;
    requested: number;
    included: number;
    rejected: number;
    warnings: string[];
  }>;
  parlays: PortfolioBuild[];
  rejected: Array<{
    profile: ParlayPortfolioProfile;
    index: number;
    reasons: string[];
  }>;
  diagnostics?: {
    sourcePredictions: number;
    pool: Array<{
      profile: ParlayPortfolioProfile;
      eligible: number;
      excluded: number;
      excludedReasons: Array<{ predictionId: string; reasons: string[] }>;
    }>;
    agentOutputs?: Array<{
      profile: ParlayPortfolioProfile;
      rawOutput: string;
      noParlayReason?: string;
      warnings: string[];
    }>;
  };
}

export interface ParlayServiceRepositories {
  predictions: {
    list(query: {
      runId?: string;
      fixtureId?: string;
      status?: PredictionStatus | string | Array<PredictionStatus | string>;
      take?: number;
    }): Promise<PredictionRecord[]>;
    listForFixtureDate(date: Date | string, query: {
      status?: PredictionStatus | string | Array<PredictionStatus | string>;
      take?: number;
    }): Promise<PredictionRecord[]>;
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
  parlays?: {
    createWithLegs(input: {
      parlay: ParlayInput;
      legs: Array<Omit<ParlayLegInput, 'parlayId'>>;
    }): Promise<ParlayRecord>;
  };
}

export async function runParlayBuild(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  deps: ParlayBuildDependencies = {},
): Promise<ParlayBuildRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));

  if (!deps.repositories && !config.databaseUrl) {
    return blockedResult(runId, input, artifactWriter, generatedAt, {
      error: 'DATABASE_URL is required to build parlays from persisted predictions.',
      reasons: ['database read unavailable'],
    });
  }

  const repositories = deps.repositories ?? defaultRepositories();
  if (input.portfolio === 'llm') {
    return runParlayPortfolio(config, input, runtime, repositories, artifactWriter, deps, now);
  }

  const predictionQuery = {
    status: MAIN_PARLAY_PREDICTION_STATUSES,
    take: 500,
  };
  const predictionSourceRunId = input.sourceRunId;
  const predictions = predictionSourceRunId
    ? await repositories.predictions.list({ ...predictionQuery, runId: predictionSourceRunId })
    : await repositories.predictions.listForFixtureDate(input.date, predictionQuery);
  const build = buildParlay({
    id: randomUUID(),
    sourceRunId: predictionSourceRunId ?? runId,
    generatedAt,
    predictions: predictions.map(toSourcePrediction),
    config: input.configOverrides,
  });
  const gateResult = gateFromBuild(build);
  const artifactPayload = artifactPayloadFor(runId, input.date, generatedAt, build, gateResult);
  const artifactPath = artifactWriter(
    runId,
    build.parlay.status === 'blocked' ? 'parlays-blocked.json' : 'parlays.json',
    artifactPayload,
  );

  try {
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, 'succeeded', now(), input.date);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      date: input.date,
    });
    const persisted = await (deps.persistParlay ?? defaultPersistParlay(repositories))({
      parlay: toParlayInput(build, runId, artifact?.id ?? null, input.date),
      legs: build.parlay.legs.map(toParlayLegInput),
    });

    return {
      ok: gateResult.verdict !== 'blocked',
      runId,
      date: input.date,
      gateResult,
      build,
      persistedParlayId: persisted?.id,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const result = blockedResult(runId, input, artifactWriter, generatedAt, {
      error,
      reasons: ['parlay persistence failed'],
    });
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), input.date).catch(() => undefined);
    return result;
  }
}

function defaultRepositories(): ParlayServiceRepositories {
  return createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
}

function defaultPersistArtifact(repositories: ParlayServiceRepositories) {
  return async (input: { runId: string; path: string; payload: unknown; date: string }) => {
    if (!repositories.artifacts) return null;
    return repositories.artifacts.create({
      name: basename(input.path),
      kind: 'parlays',
      path: input.path,
      runId: input.runId,
      sha256: hashPayload(input.payload),
      metadata: compactJson({
        date: input.date,
        parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
        analyticalArtifactOnly: true,
        qualityVerdict: payloadVerdict(input.payload),
        executionCapability: 'none',
      }),
    });
  };
}

function payloadVerdict(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const gateResult = (payload as { gateResult?: unknown }).gateResult;
  if (!gateResult || typeof gateResult !== 'object' || Array.isArray(gateResult)) return undefined;
  const verdict = (gateResult as { verdict?: unknown }).verdict;
  return typeof verdict === 'string' ? verdict : undefined;
}

async function runParlayPortfolio(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  repositories: ParlayServiceRepositories,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  deps: ParlayBuildDependencies,
  now: () => Date,
): Promise<ParlayBuildRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const sourceRunId = input.sourceRunId;
  const generatedAt = now().toISOString();
  const date = input.date;
  if (!sourceRunId) {
    return blockedResult(runId, input, artifactWriter, generatedAt, {
      error: '--run-id is required when --portfolio llm is used.',
      reasons: ['missing source run id'],
    });
  }

  const records = await repositories.predictions.list({
    runId: sourceRunId,
    status: PORTFOLIO_PREDICTION_STATUSES,
    take: 500,
  });
  const sourcePredictions = records.map(toSourcePrediction);
  const decoratedPredictions = sourcePredictions.map(decoratePortfolioPrediction);
  const portfolioId = randomUUID();
  const poolDiagnostics = PORTFOLIO_PROFILES.map((profile) => {
    const excludedReasons = decoratedPredictions
      .map((prediction) => ({ predictionId: prediction.id, reasons: portfolioPoolExclusionReasons(prediction, profile) }))
      .filter((item) => item.reasons.length > 0);
    return {
      profile: profile.key,
      eligible: decoratedPredictions.length - excludedReasons.length,
      excluded: excludedReasons.length,
      excludedReasons,
    };
  });
  const profileOutputs = await Promise.all(PORTFOLIO_PROFILES.map(async (profile) => {
    const pool = decoratedPredictions.filter((prediction) => isPortfolioPoolEligible(prediction, profile));
    if (!pool.length) {
      return {
        profile: profile.key,
        rawOutput: '',
        output: { parlays: [] as ParsedPortfolioParlay[], noParlayReason: `${profile.key} pool is empty after portfolio filters` },
        warnings: [`empty-pool: ${profile.key} pool is empty after portfolio filters`],
        pool,
      };
    }
    let rawOutput = '';
    try {
      const prompt = buildPortfolioProfilePrompt({
        portfolioId,
        sourceRunId,
        date,
        generatedAt,
        profile,
        predictions: pool,
      });
      const result = await runParlayPortfolioAgent(deps.agentRunner ?? runAgentWithRetry, config, prompt, { runtime });
      rawOutput = result.text;
      const output = parsePortfolioAgentOutput(rawOutput);
      const warnings = output.noParlayReason ? [`no-parlay-reason: ${output.noParlayReason}`] : [];
      return {
        profile: profile.key,
        rawOutput,
        output,
        warnings,
        pool,
      };
    } catch (err: any) {
      return {
        profile: profile.key,
        rawOutput,
        output: { parlays: [] as ParsedPortfolioParlay[] },
        warnings: [`${profile.key} parlay prompt failed: ${err?.message ?? String(err)}`],
        pool,
      };
    }
  }));

  const usedSignatures = new Set<string>();
  const builds: PortfolioBuild[] = [];
  const rejected: ParlayPortfolio['rejected'] = [];
  const profileSummaries: ParlayPortfolio['profiles'] = [];
  for (const profileSpec of PORTFOLIO_PROFILES) {
    const output = profileOutputs.find((item) => item.profile === profileSpec.key);
    const poolById = new Map((output?.pool ?? []).map((prediction) => [prediction.id, prediction]));
    const parsedParlays = output?.output.parlays.slice(0, profileSpec.targetParlays) ?? [];
    let included = 0;
    let rejectedCount = 0;
    for (const [index, parsed] of parsedParlays.entries()) {
      const validation = validateParsedPortfolioParlay(parsed, profileSpec, poolById, usedSignatures, generatedAt, sourceRunId);
      if (!validation.ok) {
        rejected.push({ profile: profileSpec.key, index, reasons: validation.reasons });
        rejectedCount++;
        continue;
      }
      usedSignatures.add(validation.signature);
      builds.push({ profile: validation.profile, build: validation.build });
      included++;
    }
    profileSummaries.push({
      profile: profileSpec.key,
      promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
      requested: profileSpec.targetParlays,
      included,
      rejected: rejectedCount,
      warnings: output?.warnings ?? [],
    });
  }

  const portfolio: ParlayPortfolio = {
    id: portfolioId,
    sourceRunId,
    promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
    profiles: profileSummaries,
    parlays: builds,
    rejected,
    diagnostics: {
      sourcePredictions: sourcePredictions.length,
      pool: poolDiagnostics,
      agentOutputs: profileOutputs.map((output) => ({
        profile: output.profile,
        rawOutput: output.rawOutput,
        noParlayReason: output.output.noParlayReason,
        warnings: output.warnings,
      })),
    },
  };
  const gateResult = gateFromPortfolio(portfolio);
  const representativeBuild = builds[0]?.build ?? buildParlay({
    id: randomUUID(),
    sourceRunId,
    generatedAt,
    predictions: [],
    config: { minLegs: 2, maxLegs: 3, minPredictionConfidence: PORTFOLIO_MIN_CONFIDENCE },
  });
  const artifactPayload = portfolioArtifactPayloadFor(runId, date, generatedAt, portfolio, gateResult);
  const artifactPath = artifactWriter(
    runId,
    builds.length ? 'parlay-portfolio.json' : 'parlay-portfolio-blocked.json',
    artifactPayload,
  );
  if (builds.length) {
    artifactWriter(
      runId,
      'parlays.json',
      artifactPayloadFor(runId, date, generatedAt, representativeBuild, gateFromBuild(representativeBuild)),
    );
  }

  try {
    await upsertRun(config, runtime, repositories, runId, gateResult.verdict, gateResult.verdict === 'blocked' ? 'failed' : 'succeeded', now(), date);
    const artifact = await (deps.persistArtifact ?? defaultPersistArtifact(repositories))({
      runId,
      path: artifactPath,
      payload: artifactPayload,
      date,
    });
    const persistedParlayIds: string[] = [];
    for (const entry of builds) {
      const persisted = await (deps.persistParlay ?? defaultPersistParlay(repositories))({
        parlay: toParlayInput(entry.build, runId, artifact?.id ?? null, date, {
          portfolioId,
          portfolioProfile: entry.profile,
          sourceRunId,
          promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
        }),
        legs: entry.build.parlay.legs.map(toParlayLegInput),
      });
      if (persisted?.id) persistedParlayIds.push(persisted.id);
    }

    return {
      ok: gateResult.verdict !== 'blocked',
      runId,
      date,
      gateResult,
      build: representativeBuild,
      portfolio,
      persistedParlayId: persistedParlayIds[0],
      persistedParlayIds,
      artifactPath,
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    const result = blockedResult(runId, input, artifactWriter, generatedAt, {
      error,
      reasons: ['parlay portfolio persistence failed'],
    });
    await upsertRun(config, runtime, repositories, runId, 'blocked', 'failed', now(), date).catch(() => undefined);
    return { ...result, portfolio, error };
  }
}

function defaultPersistParlay(repositories: ParlayServiceRepositories) {
  return async (input: { parlay: ParlayInput; legs: Array<Omit<ParlayLegInput, 'parlayId'>> }) => {
    if (!repositories.parlays) throw new Error('Parlay repository is unavailable.');
    return repositories.parlays.createWithLegs(input);
  };
}

function buildPortfolioProfilePrompt(input: {
  portfolioId: string;
  sourceRunId: string;
  date: string;
  generatedAt: string;
  profile: ParlayPortfolioProfileSpec;
  predictions: ParlaySourcePrediction[];
}): string {
  const compactPredictions = input.predictions.map((prediction) => ({
    id: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line ?? null,
    odds: prediction.odds,
    impliedProbability: prediction.impliedProbability ?? null,
    estimatedProbability: prediction.estimatedProbability ?? null,
    edge: prediction.edge ?? null,
    confidence: prediction.confidence,
    quality: prediction.quality,
    status: prediction.status,
    warnings: prediction.warnings ?? [],
    riskTags: prediction.riskTags ?? [],
    riskScore: prediction.riskScore ?? 0,
    rationale: prediction.rationale ? truncateText(prediction.rationale, 220) : undefined,
  }));

  return [
    `System prompt - ${input.profile.label} (${input.profile.key})`,
    'You create analytical soccer parlay portfolios from already-scored atomic predictions.',
    'Precision mode: generate fewer, cleaner parlays instead of forcing volume.',
    'Return JSON only. Do not include Markdown or commentary outside JSON.',
    'Use only prediction ids from the provided pool.',
    `Create up to ${input.profile.targetParlays} parlays for this profile.`,
    `Each parlay must contain ${input.profile.minLegs}-${input.profile.maxLegs} legs.`,
    `Target combined decimal odds: ${input.profile.minOdds}-${input.profile.maxOdds}. Parlays outside this range will be rejected.`,
    `Minimum leg confidence for this profile: ${input.profile.minConfidence}.`,
    input.profile.reviewOnly
      ? 'Review profile: weaker legs are allowed only as review-required analytical output.'
      : 'Strict profile: preserve promotable/candidate status only when validation allows it.',
    input.profile.allowDrawExposure
      ? 'Draw exposure is allowed only with a specific risk note explaining why it remains review-required.'
      : 'Do not use legs tagged negative_edge or draw_exposure.',
    input.profile.allowDrawExposure ? 'Do not use legs tagged negative_edge.' : undefined,
    'Do not use fragile_low_total_over when it is also low_edge.',
    'Do not use fragile_low_price_dc when it is also low_edge.',
    `Use at most ${input.profile.maxReviewOrWarningLegs} leg(s) tagged review_required or research_warning per parlay.`,
    'Prefer 2-3 independent conservative legs over higher combined odds.',
    'Each rationale must explain why every selected leg survives its main risk tag.',
    'Prefer diversity across fixtures, leagues and market types when quality is similar.',
    'Use predictionIds only. Do not use fixtureId, team id, odds quote id, or any other id in predictionIds.',
    'A fixture may appear more than once in the same parlay only when duplicateFixtureJustification is specific and non-empty.',
    'The artifact is analytical only and has no monetary action capability.',
    '',
    'JSON schema:',
    JSON.stringify({
      parlays: [
        {
          title: 'short descriptive title',
          predictionIds: ['prediction-id-1', 'prediction-id-2'],
          rationale: 'why these legs work together',
          riskNotes: ['short risk note'],
          duplicateFixtureJustification: 'required only when one fixture appears more than once',
        },
      ],
      noParlayReason: 'optional short reason when no parlay should be generated',
    }),
    '',
    'Context:',
    JSON.stringify({
      portfolioId: input.portfolioId,
      sourceRunId: input.sourceRunId,
      date: input.date,
      generatedAt: input.generatedAt,
      promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
      minConfidence: input.profile.minConfidence,
      profile: input.profile,
      predictionPool: compactPredictions,
    }),
  ].filter((line): line is string => typeof line === 'string').join('\n');
}

async function runParlayPortfolioAgent(
  agentRunner: typeof runAgentWithRetry,
  config: AgentConfig,
  prompt: string,
  options: { runtime: RuntimeContext },
): Promise<{ text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARLAY_PORTFOLIO_AGENT_TIMEOUT_MS);
  try {
    return await agentRunner(config, prompt, {
      runtime: options.runtime,
      signal: controller.signal,
      maxRetries: 1,
      outputSchemaPath: PARLAY_PORTFOLIO_SCHEMA_PATH,
      useStdinPrompt: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parsePortfolioAgentOutput(text: string): ParsedPortfolioOutput {
  const parsed = parseJsonObject(text);
  const parlays = Array.isArray(parsed?.parlays) ? parsed.parlays : [];
  return {
    noParlayReason: typeof parsed?.noParlayReason === 'string' ? parsed.noParlayReason : undefined,
    parlays: parlays.map((item: any) => ({
      title: typeof item?.title === 'string' ? item.title : undefined,
      predictionIds: Array.isArray(item?.predictionIds) ? item.predictionIds.map(String).filter(Boolean) : [],
      rationale: typeof item?.rationale === 'string' ? item.rationale : '',
      riskNotes: Array.isArray(item?.riskNotes) ? item.riskNotes.map(String).filter(Boolean) : undefined,
      duplicateFixtureJustification: typeof item?.duplicateFixtureJustification === 'string'
        ? item.duplicateFixtureJustification
        : undefined,
    })),
  };
}

function parseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try { return JSON.parse(fenced); } catch { /* fall through */ }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
  }
  throw new Error(`invalid-json: portfolio agent output was not valid JSON (${truncateText(text, 160) || 'empty output'})`);
}

function validateParsedPortfolioParlay(
  parsed: ParsedPortfolioParlay,
  profile: ParlayPortfolioProfileSpec,
  poolById: Map<string, ParlaySourcePrediction>,
  usedSignatures: Set<string>,
  generatedAt: string,
  sourceRunId: string,
): PortfolioValidationResult {
  const reasons: string[] = [];
  const uniquePredictionIds = [...new Set(parsed.predictionIds)];
  if (uniquePredictionIds.length !== parsed.predictionIds.length) {
    reasons.push('duplicate prediction id in same parlay');
  }
  if (uniquePredictionIds.length < profile.minLegs || uniquePredictionIds.length > profile.maxLegs) {
    reasons.push(`selected ${uniquePredictionIds.length} legs, expected ${profile.minLegs}-${profile.maxLegs}`);
  }

  const predictions = uniquePredictionIds.map((id) => poolById.get(id));
  for (const [index, prediction] of predictions.entries()) {
    if (!prediction) reasons.push(`unknown prediction id: ${uniquePredictionIds[index]}`);
    else if (prediction.confidence < profile.minConfidence) reasons.push(`prediction below ${profile.label} confidence floor: ${prediction.id}`);
  }
  if (!parsed.rationale.trim()) reasons.push('missing rationale');

  const signature = uniquePredictionIds.slice().sort().join('|');
  if (usedSignatures.has(signature)) reasons.push('duplicate parlay composition');
  if (reasons.length) return { ok: false, reasons };

  const selected = predictions.filter((prediction): prediction is ParlaySourcePrediction => Boolean(prediction));
  const riskRejections = validatePortfolioRisk(selected, profile);
  reasons.push(...riskRejections);
  if (reasons.length) return { ok: false, reasons };

  const fixtureCounts = new Map<string, number>();
  for (const prediction of selected) fixtureCounts.set(prediction.fixtureId, (fixtureCounts.get(prediction.fixtureId) ?? 0) + 1);
  const duplicateFixtures = [...fixtureCounts.entries()].filter(([, count]) => count > 1).map(([fixtureId]) => fixtureId);
  const duplicateJustification = parsed.duplicateFixtureJustification?.trim();
  if (duplicateFixtures.length && !duplicateJustification) {
    return { ok: false, reasons: [`duplicate fixture without justification: ${duplicateFixtures.join(', ')}`] };
  }

  const parlayId = randomUUID();
  const legs: ParlayLeg[] = selected.map((prediction, index) => ({
    parlayId,
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    selection: prediction.selection,
    line: prediction.line,
    odds: prediction.odds,
    status: prediction.status,
    index,
    inclusionReason: duplicateFixtures.includes(prediction.fixtureId)
      ? 'included-with-duplicate-fixture-override'
      : 'included-eligible-prediction',
  }));
  const combinedOdds = calculateCombinedOdds(legs);
  const aggregateConfidence = calculateAggregateConfidence(selected);
  if (combinedOdds !== undefined && (combinedOdds < profile.minOdds || combinedOdds > profile.maxOdds)) {
    return {
      ok: false,
      reasons: [`combined odds ${round(combinedOdds)} outside ${profile.label} target ${profile.minOdds}-${profile.maxOdds}`],
    };
  }
  const minAggregateConfidence = profile.key === 'conservative'
    ? CONSERVATIVE_MIN_AGGREGATE_CONFIDENCE
    : profile.key === 'balanced'
      ? BALANCED_MIN_AGGREGATE_CONFIDENCE
      : 0;
  if (aggregateConfidence < minAggregateConfidence) {
    return {
      ok: false,
      reasons: [`aggregate confidence ${round(aggregateConfidence)} below ${profile.label} floor ${minAggregateConfidence}`],
    };
  }
  const constraintWarnings = [
    ...(duplicateFixtures.length ? [`duplicate fixture override: ${duplicateJustification}`] : []),
  ].filter(Boolean);
  const warnings = [
    ...constraintWarnings,
    ...(parsed.riskNotes ?? []),
  ].filter(Boolean);
  const status: PredictionStatus = constraintWarnings.length || profile.reviewOnly || selected.some((prediction) => prediction.status === 'review-required')
    ? 'review-required'
    : selected.some((prediction) => prediction.status === 'candidate')
      ? 'candidate'
      : 'promotable';
  const evaluations: ParlayPredictionEvaluation[] = selected.map((prediction) => ({
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    includedReasons: [
      duplicateFixtures.includes(prediction.fixtureId)
        ? 'included-with-duplicate-fixture-override'
        : 'included-eligible-prediction',
    ],
    excludedReasons: [],
    eligible: true,
  }));
  const config: ResolvedParlayConfig = {
    minLegs: profile.minLegs,
    maxLegs: profile.maxLegs,
    allowMultipleLegsPerFixture: Boolean(duplicateFixtures.length),
    minPredictionConfidence: profile.minConfidence,
    maxCombinedOdds: profile.maxOdds,
  };
  const rationaleParts = [
    parsed.title ? `${parsed.title}: ${parsed.rationale.trim()}` : parsed.rationale.trim(),
    `Profile ${profile.label}; target odds ${profile.minOdds}-${profile.maxOdds}.`,
  ];
  const parlay: Parlay = {
    id: parlayId,
    sourceRunId,
    legs,
    combinedOdds: combinedOdds === undefined ? undefined : round(combinedOdds),
    aggregateConfidence: round(aggregateConfidence),
    aggregateQuality: round(calculateAggregateQuality(selected)),
    rationale: rationaleParts.join(' '),
    warnings,
    status,
    generatedAt,
  };

  return {
    ok: true,
    profile: profile.key,
    signature,
    build: {
      parlay,
      evaluations,
      config,
    },
  };
}

function validatePortfolioRisk(
  selected: readonly ParlaySourcePrediction[],
  profile: ParlayPortfolioProfileSpec,
): string[] {
  const reasons: string[] = [];
  const reviewOrWarningCount = selected.filter((prediction) =>
    hasRiskTag(prediction, 'review_required') || hasRiskTag(prediction, 'research_warning'),
  ).length;

  for (const prediction of selected) {
    if (hasRiskTag(prediction, 'negative_edge')) {
      reasons.push(`prediction has negative edge: ${prediction.id}`);
    }
    if (hasRiskTag(prediction, 'draw_exposure') && !profile.allowDrawExposure) {
      reasons.push(`prediction has draw exposure: ${prediction.id}`);
    }
    if (hasRiskTag(prediction, 'fragile_low_total_over') && hasRiskTag(prediction, 'low_edge')) {
      reasons.push(`fragile low total over with low edge: ${prediction.id}`);
    }
    if (hasRiskTag(prediction, 'fragile_low_price_dc') && hasRiskTag(prediction, 'low_edge')) {
      reasons.push(`fragile low-price double chance with low edge: ${prediction.id}`);
    }
  }

  if (reviewOrWarningCount > profile.maxReviewOrWarningLegs) {
    reasons.push(`too many review-required or warning legs for ${profile.label}: ${reviewOrWarningCount}`);
  }

  return [...new Set(reasons)];
}

function gateFromPortfolio(portfolio: ParlayPortfolio): ParlayGateResult {
  if (!portfolio.parlays.length) {
    const diagnostics = [...new Set([
      ...portfolio.profiles.flatMap((profile) => profile.warnings),
      ...portfolio.rejected.flatMap((rejection) => rejection.reasons.map((reason) => `${rejection.profile}[${rejection.index}]: ${reason}`)),
    ])];
    return {
      verdict: 'blocked',
      reasons: diagnostics.length
        ? ['no valid analytical parlays generated', ...diagnostics]
        : ['no valid analytical parlays generated'],
      warnings: diagnostics,
    };
  }
  const warnings = [...new Set([
    ...portfolio.profiles.flatMap((profile) => profile.warnings),
    ...portfolio.parlays.flatMap((entry) => entry.build.parlay.warnings),
    ...portfolio.rejected.flatMap((rejection) => rejection.reasons.map((reason) => `${rejection.profile}[${rejection.index}]: ${reason}`)),
  ])];
  const verdict: PredictionStatus = portfolio.parlays.some((entry) => entry.build.parlay.status === 'review-required') || portfolio.rejected.length
    ? 'review-required'
    : portfolio.parlays.some((entry) => entry.build.parlay.status === 'candidate')
      ? 'candidate'
      : 'promotable';

  return {
    verdict,
    reasons: [`generated ${portfolio.parlays.length} analytical parlays across ${portfolio.profiles.length} profile(s)`],
    warnings,
  };
}

function portfolioArtifactPayloadFor(
  runId: string,
  date: string,
  generatedAt: string,
  portfolio: ParlayPortfolio,
  gateResult: ParlayGateResult,
): Record<string, unknown> {
  return {
    runId,
    date,
    generatedAt,
    parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
    analyticalArtifactOnly: true,
    qualityVerdict: gateResult.verdict,
    executionCapability: 'none',
    notice: 'This portfolio is an analytical artifact only; it has no monetary action capability.',
    gateResult,
    portfolio: {
      ...portfolio,
      parlays: portfolio.parlays.map((entry) => ({
        profile: entry.profile,
        ...entry.build,
      })),
    },
  };
}

function toSourcePrediction(prediction: PredictionRecord): ParlaySourcePrediction {
  return {
    id: prediction.id,
    runId: prediction.runId ?? 'unavailable-run',
    fixtureId: prediction.fixtureId,
    market: prediction.marketKey as MarketKey,
    selection: prediction.selectionKey,
    line: numberOrUndefined(prediction.line),
    odds: numberValue(prediction.odds),
    impliedProbability: numberOrUndefined(prediction.impliedProbability),
    estimatedProbability: numberOrUndefined(prediction.estimatedProbability),
    edge: numberOrUndefined(prediction.edge),
    blockers: metadataStringArray(prediction.metadata, 'blockers'),
    marketFairProbability: metadataNumber(prediction.metadata, 'marketFairProbability'),
    parlayEligible: metadataBool(prediction.metadata, 'parlayEligible'),
    confidence: numberValue(prediction.confidence),
    quality: qualityValue(prediction.quality),
    status: prediction.status as PredictionStatus,
    rationale: prediction.rationaleRedacted,
    warnings: jsonStringArray(prediction.warnings),
  };
}

function metadataStringArray(metadata: unknown, key: string): string[] | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function metadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;
}

function metadataBool(metadata: unknown, key: string): boolean | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function decoratePortfolioPrediction(prediction: ParlaySourcePrediction): ParlaySourcePrediction {
  const riskTags = portfolioRiskTags(prediction);
  return {
    ...prediction,
    riskTags,
    riskScore: riskTags.length,
  };
}

function isPortfolioPoolEligible(
  prediction: ParlaySourcePrediction,
  profile: ParlayPortfolioProfileSpec,
): boolean {
  return portfolioPoolExclusionReasons(prediction, profile).length === 0;
}

function portfolioPoolExclusionReasons(
  prediction: ParlaySourcePrediction,
  profile: ParlayPortfolioProfileSpec,
): string[] {
  const reasons: string[] = [];
  if (!profile.reviewOnly && prediction.parlayEligible === false) reasons.push('not parlay eligible');
  if (!profile.reviewOnly && hasHardResearchWarning(prediction)) reasons.push('hard research warning');
  if (prediction.confidence < profile.minConfidence) reasons.push(`below ${profile.label} confidence floor`);
  if (hasRiskTag(prediction, 'negative_edge')) reasons.push('negative edge');
  if (hasRiskTag(prediction, 'draw_exposure') && !profile.allowDrawExposure) reasons.push('draw exposure');
  if (hasRiskTag(prediction, 'fragile_low_total_over') && hasRiskTag(prediction, 'low_edge')) {
    reasons.push('fragile low total over with low edge');
  }
  if (hasRiskTag(prediction, 'fragile_low_price_dc') && hasRiskTag(prediction, 'low_edge')) {
    reasons.push('fragile low-price double chance with low edge');
  }
  return reasons;
}

function hasHardResearchWarning(prediction: ParlaySourcePrediction): boolean {
  return (prediction.warnings ?? []).some((warning) =>
    /research is not promotable|fallback research|stale (news|source|odds) source|timed out|insufficient evidence/i.test(warning),
  );
}

function portfolioRiskTags(prediction: ParlaySourcePrediction): ParlayRiskTag[] {
  const tags: ParlayRiskTag[] = [];
  const edge = prediction.edge;

  if (edge === undefined || edge < 0.02) tags.push('low_edge');
  if (edge !== undefined && edge < 0) tags.push('negative_edge');
  if (prediction.confidence < 0.75) tags.push('low_confidence');
  if (prediction.status === 'review-required') tags.push('review_required');
  if ((prediction.warnings?.length ?? 0) > 0) tags.push('research_warning');
  if (prediction.market === 'goals_over_under' && prediction.selection === 'over' && (prediction.line ?? 0) <= 1.5 && prediction.odds <= 1.4) {
    tags.push('fragile_low_total_over');
  }
  if (prediction.market === 'double_chance' && prediction.odds <= 1.25) {
    tags.push('fragile_low_price_dc');
  }
  if (prediction.market === 'double_chance' && prediction.selection === 'home_or_away') {
    tags.push('draw_exposure');
  }

  return [...new Set(tags)];
}

function hasRiskTag(prediction: ParlaySourcePrediction, tag: ParlayRiskTag): boolean {
  return prediction.riskTags?.includes(tag) ?? false;
}

function toParlayInput(
  build: BuildParlayResult,
  runId: string,
  artifactId: string | null,
  date: string,
  metadataExtra: Record<string, unknown> = {},
): ParlayInput {
  return {
    id: build.parlay.id,
    runId,
    artifactId,
    combinedOdds: build.parlay.combinedOdds ?? null,
    aggregateConfidence: build.parlay.aggregateConfidence,
    aggregateQuality: build.parlay.aggregateQuality,
    rationaleRedacted: build.parlay.rationale,
    warnings: build.parlay.warnings,
    status: build.parlay.status,
    generatedAt: new Date(build.parlay.generatedAt),
    metadata: compactJson({
      date,
      sourceRunId: build.parlay.sourceRunId,
      parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
      config: build.config,
      evaluations: build.evaluations,
      analyticalArtifactOnly: true,
      qualityVerdict: build.parlay.status,
      executionCapability: 'none',
      ...metadataExtra,
    }),
  };
}

function toParlayLegInput(leg: BuildParlayResult['parlay']['legs'][number]): Omit<ParlayLegInput, 'parlayId'> {
  return {
    predictionId: leg.predictionId,
    fixtureId: leg.fixtureId,
    marketKey: leg.market,
    selectionKey: leg.selection,
    line: leg.line ?? null,
    odds: leg.odds,
    status: leg.status,
    legIndex: leg.index,
    inclusionReason: leg.inclusionReason,
  };
}

async function upsertRun(
  config: AgentConfig,
  runtime: RuntimeContext,
  repositories: ParlayServiceRepositories,
  runId: string,
  verdict: string,
  status: string,
  completedAt: Date,
  date: string,
): Promise<void> {
  await repositories.harnessRuns?.upsertForRun?.({
    id: runId,
    runtime: config.runtime,
    profile: config.profile,
    providerSports: runtime.providerSports ?? API_FOOTBALL_PROVIDER,
    providerAgentic: config.provider,
    model: config.model,
    status,
    verdict,
    startedAt: completedAt,
    completedAt,
    metadata: compactJson({
      date,
      parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    }),
  });
}

function blockedResult(
  runId: string,
  input: RunParlayBuildInput,
  artifactWriter: (runId: string, name: string, payload: unknown) => string,
  generatedAt: string,
  options: { error?: string; reasons: string[] },
): ParlayBuildRunResult {
  const build = buildParlay({
    id: randomUUID(),
    sourceRunId: runId,
    generatedAt,
    predictions: [],
    config: input.configOverrides,
  });
  const gateResult = {
    verdict: 'blocked' as const,
    reasons: options.reasons,
    warnings: options.error ? [options.error] : [],
  };
  const artifactPath = artifactWriter(runId, 'parlays-blocked.json', {
    ...artifactPayloadFor(runId, input.date, generatedAt, build, gateResult),
    error: options.error,
  });

  return {
    ok: false,
    runId,
    date: input.date,
    gateResult,
    build,
    artifactPath,
    error: options.error,
  };
}

function gateFromBuild(build: BuildParlayResult): ParlayGateResult {
  const excludedReasons = build.evaluations.flatMap((evaluation) => evaluation.excludedReasons);
  const reasons = build.parlay.status === 'blocked'
    ? [
        `selected ${build.parlay.legs.length} leg(s), minimum ${build.config.minLegs} required`,
        ...new Set(excludedReasons),
      ]
    : [`selected ${build.parlay.legs.length} analytical leg(s)`];

  return {
    verdict: build.parlay.status,
    reasons: build.parlay.status === 'blocked' ? ['handoff.parlay = no-parlay-today', ...reasons] : reasons,
    warnings: build.parlay.warnings,
  };
}

function artifactPayloadFor(
  runId: string,
  date: string,
  generatedAt: string,
  build: BuildParlayResult,
  gateResult: ParlayGateResult,
): Record<string, unknown> {
  const parlay = {
    ...build.parlay,
    warnings: [...build.parlay.warnings],
    legs: build.parlay.legs.map((leg) => ({ ...leg })),
  };
  return {
    runId,
    date,
    generatedAt,
    parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    analyticalArtifactOnly: true,
    qualityVerdict: gateResult.verdict,
    executionCapability: 'none',
    handoff: {
      parlay: build.parlay.status === 'blocked' ? 'no-parlay-today' : 'analytical-candidate',
      disclaimer: 'uso analitico, no constituye recomendacion de apuesta, no garantiza resultado',
    },
    notice: 'This parlay candidate is an analytical artifact only; it cannot execute wagers or monetary actions.',
    config: build.config,
    gateResult: {
      ...gateResult,
      reasons: [...gateResult.reasons],
      warnings: [...gateResult.warnings],
    },
    parlay,
    included: build.evaluations
      .filter((evaluation) => evaluation.eligible)
      .map((evaluation) => ({
        predictionId: evaluation.predictionId,
        fixtureId: evaluation.fixtureId,
        reasons: evaluation.includedReasons,
      })),
    excluded: build.evaluations
      .filter((evaluation) => !evaluation.eligible)
      .map((evaluation) => ({
        predictionId: evaluation.predictionId,
        fixtureId: evaluation.fixtureId,
        reasons: evaluation.excludedReasons,
      })),
  };
}

function qualityValue(value: string): PredictionQuality {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return NaN;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function jsonStringArray(value: JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}
