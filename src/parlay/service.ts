import { randomUUID } from 'crypto';
import { basename } from 'path';
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
  ParlaySourcePrediction,
  ResolvedParlayConfig,
} from './types.js';

const ELIGIBLE_PREDICTION_STATUSES: PredictionStatus[] = ['candidate', 'review-required', 'promotable'];
const PARLAY_PORTFOLIO_PROMPT_VERSION = 'parlay-portfolio-v1';
const PARLAY_PORTFOLIO_AGENT_TIMEOUT_MS = 120_000;
const PORTFOLIO_MIN_CONFIDENCE = 0.6;
const PORTFOLIO_PROFILES = [
  { key: 'conservative', label: 'Conservador', minLegs: 2, maxLegs: 3, minOdds: 1.8, maxOdds: 3.0, targetParlays: 2 },
  { key: 'balanced', label: 'Balanceado', minLegs: 3, maxLegs: 4, minOdds: 3.0, maxOdds: 6.0, targetParlays: 3 },
  { key: 'aggressive', label: 'Agresivo', minLegs: 4, maxLegs: 6, minOdds: 6.0, maxOdds: 15.0, targetParlays: 3 },
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
    status: ELIGIBLE_PREDICTION_STATUSES,
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
      }),
    });
  };
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
    status: ELIGIBLE_PREDICTION_STATUSES,
    take: 500,
  });
  const pool = records
    .map(toSourcePrediction)
    .filter((prediction) => prediction.confidence >= PORTFOLIO_MIN_CONFIDENCE);
  const poolById = new Map(pool.map((prediction) => [prediction.id, prediction]));
  const portfolioId = randomUUID();
  const profileOutputs = await Promise.all(PORTFOLIO_PROFILES.map(async (profile) => {
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
      return {
        profile: profile.key,
        rawOutput: result.text,
        output: parsePortfolioAgentOutput(result.text),
        warnings: [] as string[],
      };
    } catch (err: any) {
      return {
        profile: profile.key,
        rawOutput: '',
        output: { parlays: [] as ParsedPortfolioParlay[] },
        warnings: [`${profile.key} parlay prompt failed: ${err?.message ?? String(err)}`],
      };
    }
  }));

  const usedSignatures = new Set<string>();
  const builds: PortfolioBuild[] = [];
  const rejected: ParlayPortfolio['rejected'] = [];
  const profileSummaries: ParlayPortfolio['profiles'] = [];
  for (const profileSpec of PORTFOLIO_PROFILES) {
    const output = profileOutputs.find((item) => item.profile === profileSpec.key);
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
  };
  const gateResult = gateFromPortfolio(portfolio);
  const fallbackBuild = builds[0]?.build ?? buildParlay({
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
      artifactPayloadFor(runId, date, generatedAt, fallbackBuild, gateFromBuild(fallbackBuild)),
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
      build: fallbackBuild,
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
    confidence: prediction.confidence,
    quality: prediction.quality,
    status: prediction.status,
  }));

  return [
    `System prompt - ${input.profile.label} (${input.profile.key})`,
    'You create analytical soccer parlay portfolios from already-scored atomic predictions.',
    'Return JSON only. Do not include Markdown or commentary outside JSON.',
    'Use only prediction ids from the provided pool.',
    `Create up to ${input.profile.targetParlays} parlays for this profile.`,
    `Each parlay must contain ${input.profile.minLegs}-${input.profile.maxLegs} legs.`,
    `Target combined decimal odds: ${input.profile.minOdds}-${input.profile.maxOdds}. If an otherwise strong parlay is outside that range, explain the risk note.`,
    'Prefer diversity across fixtures, leagues and market types when quality is similar.',
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
    }),
    '',
    'Context:',
    JSON.stringify({
      portfolioId: input.portfolioId,
      sourceRunId: input.sourceRunId,
      date: input.date,
      generatedAt: input.generatedAt,
      promptVersion: PARLAY_PORTFOLIO_PROMPT_VERSION,
      minConfidence: PORTFOLIO_MIN_CONFIDENCE,
      profile: input.profile,
      predictionPool: compactPredictions,
    }),
  ].join('\n');
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
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parsePortfolioAgentOutput(text: string): ParsedPortfolioOutput {
  const parsed = parseJsonObject(text);
  const parlays = Array.isArray(parsed?.parlays) ? parsed.parlays : [];
  return {
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
  return {};
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
    else if (prediction.confidence < PORTFOLIO_MIN_CONFIDENCE) reasons.push(`prediction below confidence floor: ${prediction.id}`);
  }
  if (!parsed.rationale.trim()) reasons.push('missing rationale');

  const signature = uniquePredictionIds.slice().sort().join('|');
  if (usedSignatures.has(signature)) reasons.push('duplicate parlay composition');
  if (reasons.length) return { ok: false, reasons };

  const selected = predictions.filter((prediction): prediction is ParlaySourcePrediction => Boolean(prediction));
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
  const warnings = [
    ...((combinedOdds !== undefined && (combinedOdds < profile.minOdds || combinedOdds > profile.maxOdds))
      ? [`combined odds ${round(combinedOdds)} outside ${profile.label} target ${profile.minOdds}-${profile.maxOdds}`]
      : []),
    ...(duplicateFixtures.length ? [`duplicate fixture override: ${duplicateJustification}`] : []),
    ...(parsed.riskNotes ?? []),
  ].filter(Boolean);
  const status: PredictionStatus = warnings.length || selected.some((prediction) => prediction.status === 'review-required')
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
    minPredictionConfidence: PORTFOLIO_MIN_CONFIDENCE,
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
    aggregateConfidence: round(calculateAggregateConfidence(selected)),
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

function gateFromPortfolio(portfolio: ParlayPortfolio): ParlayGateResult {
  if (!portfolio.parlays.length) {
    return {
      verdict: 'blocked',
      reasons: ['no valid analytical parlays generated'],
      warnings: [
        ...portfolio.profiles.flatMap((profile) => profile.warnings),
        ...portfolio.rejected.flatMap((rejection) => rejection.reasons.map((reason) => `${rejection.profile}[${rejection.index}]: ${reason}`)),
      ],
    };
  }
  const warnings = [
    ...portfolio.profiles.flatMap((profile) => profile.warnings),
    ...portfolio.parlays.flatMap((entry) => entry.build.parlay.warnings),
    ...portfolio.rejected.flatMap((rejection) => rejection.reasons.map((reason) => `${rejection.profile}[${rejection.index}]: ${reason}`)),
  ];
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
    confidence: numberValue(prediction.confidence),
    quality: qualityValue(prediction.quality),
    status: prediction.status as PredictionStatus,
  };
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
    reasons,
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
  return {
    runId,
    date,
    generatedAt,
    parlayBuilderRuleVersion: PARLAY_BUILDER_RULE_VERSION,
    analyticalArtifactOnly: true,
    notice: 'This parlay candidate is an analytical artifact only; it cannot execute wagers or monetary actions.',
    config: build.config,
    gateResult,
    parlay: build.parlay,
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

function round(value: number): number {
  return Number(value.toFixed(4));
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}
