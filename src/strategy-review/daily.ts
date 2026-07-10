import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isReasoningEffort, type AgentConfig, type ReasoningEffort } from '../config.js';
import { runAgent } from '../agent.js';
import { writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';
import { getPrismaClient } from '../storage/db.js';

export interface RunStrategyReviewInput {
  date?: string;
  from?: string;
  through?: string;
  all?: boolean;
  scope?: string;
  agent?: boolean;
  docPath?: string;
}

export interface StrategyReviewResult {
  ok: boolean;
  runId: string;
  dates: string[];
  scope: string;
  artifactPath?: string;
  reportPath?: string;
  docPath?: string;
  model: string;
  reasoningEffort: string;
  dailyReviews: DailyStrategyReview[];
  historySummary: StrategyHistorySummary;
  diagnostics: StrategyReviewDiagnostics;
  agentReview: StrategyAgentReview;
  error?: string;
}

export interface DailyStrategyReview {
  date: string;
  sourceWindowStart: string;
  sourceWindowEnd: string;
  predictions: TargetReviewSummary;
  parlays: TargetReviewSummary;
  topFailures: ReviewItem[];
  topEffective: ReviewItem[];
  recommendationArtifact?: RecommendationArtifactAudit;
  diagnostics: DailyStrategyDiagnostics;
}

export interface TargetReviewSummary {
  total: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  blocked: number;
  unvalidated: number;
  settled: number;
  hitRate: number | null;
  byMarket: ReviewBucket[];
  byModel: ReviewBucket[];
  byProvider: ReviewBucket[];
  byProfile: ReviewBucket[];
  byOddsBucket: ReviewBucket[];
  byConfidenceBucket: ReviewBucket[];
}

export interface ReviewBucket {
  bucket: string;
  total: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  blocked: number;
  unvalidated: number;
  settled: number;
  hitRate: number | null;
  avgOdds: number | null;
  avgConfidence: number | null;
  avgEdge: number | null;
}

export interface ReviewItem {
  kind: 'prediction' | 'parlay';
  id: string;
  date: string;
  status: string;
  fixture: string;
  market?: string;
  selection?: string;
  line?: number | null;
  odds: number | null;
  confidence: number | null;
  edge?: number | null;
  provider?: string | null;
  model?: string | null;
  profile?: string | null;
  rationale?: string | null;
}

export interface RecommendationArtifactAudit {
  path: string;
  total: number;
  parlays: number;
  atomicPredictions: number;
  duplicateParlays: number;
  duplicateSignatures: string[];
}

export interface StrategyHistorySummary {
  datesAnalyzed: number;
  startDate?: string;
  endDate?: string;
  predictions: TargetReviewSummary;
  parlays: TargetReviewSummary;
  weakestBuckets: ReviewBucket[];
  strongestBuckets: ReviewBucket[];
  recurringIssues: string[];
}

export interface DailyStrategyDiagnostics {
  emptyReview: boolean;
  reasons: string[];
  recommendationArtifactPresent: boolean;
  recommendationArtifactRecommendations: number;
}

export interface StrategyReviewDiagnostics {
  emptyReview: boolean;
  reasons: string[];
  datesWithoutPredictions: string[];
  datesWithoutParlays: string[];
  datesWithoutRecommendationArtifact: string[];
  recommendationArtifacts: {
    totalRecommendations: number;
    parlays: number;
    atomicPredictions: number;
    duplicateParlays: number;
  };
}

export interface StrategyAgentReview {
  status: 'skipped' | 'ok' | 'blocked';
  provider: 'codex';
  model: string;
  reasoningEffort: string;
  generatedAt: string;
  summary?: string;
  effectivePatterns?: string[];
  failurePatterns?: string[];
  proposedHarnessChanges?: ProposedHarnessChange[];
  rawText?: string;
  error?: string;
}

export interface ProposedHarnessChange {
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'proposed' | 'ready-for-implementation' | 'needs-more-data';
  targetFiles: string[];
  rationale: string;
  expectedImpact: string;
  verification: string;
}

export interface StrategyReviewDependencies {
  db?: StrategyReviewDb;
  now?: () => Date;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
  runAgent?: typeof runAgent;
  readFile?: (path: string) => string;
  writeFile?: (path: string, text: string) => void;
  listRecommendationArtifacts?: (artifactRoot: string, date: string) => string[];
}

interface StrategyReviewDb {
  fixture: {
    findFirst(args: unknown): Promise<any | null>;
  };
  prediction: {
    findMany(args: unknown): Promise<any[]>;
  };
  parlay: {
    findMany(args: unknown): Promise<any[]>;
  };
}

interface ReviewRow {
  kind: 'prediction' | 'parlay';
  id: string;
  date: string;
  status: string;
  fixture: string;
  market?: string;
  selection?: string;
  line?: number | null;
  odds: number | null;
  confidence: number | null;
  edge: number | null;
  provider?: string | null;
  model?: string | null;
  profile?: string | null;
  rationale?: string | null;
}

const DEFAULT_DOC_PATH = 'docs/harness-strategy-review-log.md';
const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_REASONING = 'xhigh';
const STATUSES = ['won', 'lost', 'voided', 'pending', 'blocked', 'unvalidated'] as const;

export async function runStrategyReview(
  config: AgentConfig,
  input: RunStrategyReviewInput,
  runtime: RuntimeContext,
  deps: StrategyReviewDependencies = {},
): Promise<StrategyReviewResult> {
  const runId = runtime.runId ?? strategyRunId(input);
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now();
  const scope = input.scope ?? (input.all ? 'historical-backfill' : `strategy-${input.date ?? input.through ?? 'range'}`);
  const model = process.env.GANA_STRATEGY_REVIEW_MODEL || process.env.AGENT_STRATEGY_REVIEW_MODEL || DEFAULT_MODEL;
  const reasoningEffort = normalizeReasoning(process.env.GANA_STRATEGY_REVIEW_REASONING_EFFORT || process.env.AGENT_STRATEGY_REVIEW_REASONING_EFFORT || DEFAULT_REASONING);
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));
  const writeFile = deps.writeFile ?? ((path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  });

  if (!deps.db && !config.databaseUrl) {
    return blockedResult(runId, input, scope, model, reasoningEffort, 'DATABASE_URL is required to run strategy review.');
  }

  const db = deps.db ?? getPrismaClient() as unknown as StrategyReviewDb;
  const dates = await resolveReviewDates(db, config.apiFootball.timezone, input, now);
  if (!dates.length) {
    return blockedResult(runId, input, scope, model, reasoningEffort, 'No review dates resolved. Use --date, --from/--through, or --all after predictions exist.');
  }

  const dailyReviews: DailyStrategyReview[] = [];
  const allPredictionRows: ReviewRow[] = [];
  const allParlayRows: ReviewRow[] = [];

  for (const date of dates) {
    const window = fixtureDateRange(date, config.apiFootball.timezone);
    const [predictionRows, parlayRows] = await Promise.all([
      loadPredictionRows(db, date, window),
      loadParlayRows(db, date, window),
    ]);
    allPredictionRows.push(...predictionRows);
    allParlayRows.push(...parlayRows);
    const recommendationArtifact = auditRecommendationArtifacts(config, date, deps);
    dailyReviews.push({
      date,
      sourceWindowStart: window.start.toISOString(),
      sourceWindowEnd: window.end.toISOString(),
      predictions: summarizeRows(predictionRows),
      parlays: summarizeRows(parlayRows),
      topFailures: topRows([...predictionRows, ...parlayRows], 'lost'),
      topEffective: topRows([...predictionRows, ...parlayRows], 'won'),
      recommendationArtifact,
      diagnostics: dailyStrategyDiagnostics(predictionRows, parlayRows, recommendationArtifact),
    });
  }

  const historySummary = buildHistorySummary(dates, allPredictionRows, allParlayRows);
  const diagnostics = strategyReviewDiagnostics(dailyReviews);
  const agentReview = await buildAgentReview(config, {
    runId,
    scope,
    generatedAt,
    model,
    reasoningEffort,
    dates,
    dailyReviews,
    historySummary,
    diagnostics,
    enabled: input.agent !== false,
    deps,
  });

  const payload = {
    analyticalArtifactOnly: true,
    executionCapability: 'none',
    runId,
    scope,
    generatedAt: generatedAt.toISOString(),
    timezone: config.apiFootball.timezone,
    model,
    reasoningEffort,
    dates,
    dailyReviews,
    historySummary,
    diagnostics,
    agentReview,
  };
  const artifactPath = artifactWriter(runId, 'strategy-review.json', payload);
  const report = renderStrategyReviewMarkdown(payload);
  const reportPath = artifactWriter(runId, 'strategy-review.md', report);
  const docPath = resolve(input.docPath ?? process.env.GANA_STRATEGY_REVIEW_DOC_PATH ?? DEFAULT_DOC_PATH);
  writeFile(docPath, updateCentralDoc(readExistingDoc(docPath, deps), payload, artifactPath, reportPath));

  return {
    ok: true,
    runId,
    dates,
    scope,
    artifactPath,
    reportPath,
    docPath,
    model,
    reasoningEffort,
    dailyReviews,
    historySummary,
    diagnostics,
    agentReview,
  };
}

function blockedResult(
  runId: string,
  input: RunStrategyReviewInput,
  scope: string,
  model: string,
  reasoningEffort: string,
  error: string,
): StrategyReviewResult {
  return {
    ok: false,
    runId,
    dates: [input.date, input.from, input.through].filter(Boolean) as string[],
    scope,
    model,
    reasoningEffort,
    dailyReviews: [],
    historySummary: {
      datesAnalyzed: 0,
      predictions: summarizeRows([]),
      parlays: summarizeRows([]),
      weakestBuckets: [],
      strongestBuckets: [],
      recurringIssues: [],
    },
    diagnostics: {
      emptyReview: true,
      reasons: [error],
      datesWithoutPredictions: [],
      datesWithoutParlays: [],
      datesWithoutRecommendationArtifact: [],
      recommendationArtifacts: {
        totalRecommendations: 0,
        parlays: 0,
        atomicPredictions: 0,
        duplicateParlays: 0,
      },
    },
    agentReview: {
      status: 'blocked',
      provider: 'codex',
      model,
      reasoningEffort,
      generatedAt: new Date().toISOString(),
      error,
    },
    error,
  };
}

async function resolveReviewDates(
  db: StrategyReviewDb,
  timezone: string,
  input: RunStrategyReviewInput,
  now: () => Date,
): Promise<string[]> {
  if (input.date) return [assertIsoDate(input.date, '--date')];
  const through = input.through ? assertIsoDate(input.through, '--through') : localDate(addDays(now(), -1), timezone);
  let from = input.from ? assertIsoDate(input.from, '--from') : undefined;
  if (input.all && !from) from = await earliestPredictionDate(db, timezone);
  if (!from) return [];
  return dateRange(from, through);
}

async function earliestPredictionDate(db: StrategyReviewDb, timezone: string): Promise<string | undefined> {
  const fixture = await db.fixture.findFirst({
    where: {
      scheduledAt: { not: null },
      OR: [
        { predictions: { some: {} } },
        { parlayLegs: { some: {} } },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    select: { scheduledAt: true },
  });
  return fixture?.scheduledAt ? localDate(new Date(fixture.scheduledAt), timezone) : undefined;
}

async function loadPredictionRows(
  db: StrategyReviewDb,
  date: string,
  window: { start: Date; end: Date },
): Promise<ReviewRow[]> {
  const rows = await db.prediction.findMany({
    where: {
      fixture: { scheduledAt: { gte: window.start, lt: window.end } },
    },
    include: {
      validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      fixture: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          competition: { select: { name: true, country: true } },
        },
      },
      run: { select: { providerAgentic: true, model: true } },
    },
  });
  return rows.map((row) => ({
    kind: 'prediction',
    id: row.id,
    date,
    status: statusOf(row),
    fixture: fixtureLabel(row.fixture),
    market: row.marketKey,
    selection: row.selectionKey,
    line: numberOrNull(row.line),
    odds: numberOrNull(row.odds),
    confidence: numberOrNull(row.confidence),
    edge: numberOrNull(row.edge),
    provider: row.providerAgentic ?? row.run?.providerAgentic ?? null,
    model: row.model ?? row.run?.model ?? null,
    rationale: row.rationaleRedacted ?? null,
  }));
}

async function loadParlayRows(
  db: StrategyReviewDb,
  date: string,
  window: { start: Date; end: Date },
): Promise<ReviewRow[]> {
  const rows = await db.parlay.findMany({
    where: {
      legs: { some: { fixture: { scheduledAt: { gte: window.start, lt: window.end } } } },
    },
    include: {
      validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      run: { select: { providerAgentic: true, model: true } },
      legs: {
        orderBy: { legIndex: 'asc' },
        include: {
          fixture: {
            include: {
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
              competition: { select: { name: true, country: true } },
            },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    kind: 'parlay',
    id: row.id,
    date,
    status: statusOf(row),
    fixture: row.legs?.map((leg: any) => fixtureLabel(leg.fixture)).filter(Boolean).join(' + ') || 'Parlay without fixture labels',
    odds: numberOrNull(row.combinedOdds),
    confidence: numberOrNull(row.aggregateConfidence),
    edge: null,
    provider: row.run?.providerAgentic ?? null,
    model: row.run?.model ?? null,
    profile: profileOf(row),
    rationale: row.rationaleRedacted ?? null,
  }));
}

function summarizeRows(rows: ReviewRow[]): TargetReviewSummary {
  const counts = statusCounts(rows);
  return {
    ...counts,
    hitRate: hitRate(counts),
    byMarket: bucketRows(rows, (row) => row.market ?? 'mixed'),
    byModel: bucketRows(rows, (row) => row.model ?? 'unknown'),
    byProvider: bucketRows(rows, (row) => row.provider ?? 'unknown'),
    byProfile: bucketRows(rows, (row) => row.profile ?? 'none'),
    byOddsBucket: bucketRows(rows, (row) => oddsBucket(row.odds)),
    byConfidenceBucket: bucketRows(rows, (row) => confidenceBucket(row.confidence)),
  };
}

function bucketRows(rows: ReviewRow[], keyFn: (row: ReviewRow) => string): ReviewBucket[] {
  const groups = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const counts = statusCounts(group);
      return {
        bucket: key,
        ...counts,
        hitRate: hitRate(counts),
        avgOdds: average(group.map((row) => row.odds)),
        avgConfidence: average(group.map((row) => row.confidence)),
        avgEdge: average(group.map((row) => row.edge)),
      };
    })
    .sort((a, b) => b.total - a.total || (a.hitRate ?? -1) - (b.hitRate ?? -1));
}

function statusCounts(rows: ReviewRow[]): Omit<TargetReviewSummary, 'hitRate' | 'byMarket' | 'byModel' | 'byProvider' | 'byProfile' | 'byOddsBucket' | 'byConfidenceBucket'> {
  const counts: Record<typeof STATUSES[number], number> = {
    won: 0,
    lost: 0,
    voided: 0,
    pending: 0,
    blocked: 0,
    unvalidated: 0,
  };
  for (const row of rows) {
    const status = normalizeStatus(row.status);
    counts[status] += 1;
  }
  const settled = counts.won + counts.lost;
  return {
    total: rows.length,
    ...counts,
    settled,
  };
}

function buildHistorySummary(
  dates: string[],
  predictionRows: ReviewRow[],
  parlayRows: ReviewRow[],
): StrategyHistorySummary {
  const predictionSummary = summarizeRows(predictionRows);
  const parlaySummary = summarizeRows(parlayRows);
  const allBuckets = [
    ...predictionSummary.byMarket.map((bucket) => ({ ...bucket, bucket: `prediction.market:${bucket.bucket}` })),
    ...predictionSummary.byModel.map((bucket) => ({ ...bucket, bucket: `prediction.model:${bucket.bucket}` })),
    ...parlaySummary.byProfile.map((bucket) => ({ ...bucket, bucket: `parlay.profile:${bucket.bucket}` })),
    ...parlaySummary.byModel.map((bucket) => ({ ...bucket, bucket: `parlay.model:${bucket.bucket}` })),
  ].filter((bucket) => bucket.settled >= 3);
  const weakestBuckets = [...allBuckets]
    .sort((a, b) => (a.hitRate ?? 1) - (b.hitRate ?? 1) || b.settled - a.settled)
    .slice(0, 8);
  const strongestBuckets = [...allBuckets]
    .sort((a, b) => (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.settled - a.settled)
    .slice(0, 8);
  return {
    datesAnalyzed: dates.length,
    startDate: dates[0],
    endDate: dates.at(-1),
    predictions: predictionSummary,
    parlays: parlaySummary,
    weakestBuckets,
    strongestBuckets,
    recurringIssues: recurringIssues(predictionSummary, parlaySummary, weakestBuckets),
  };
}

function dailyStrategyDiagnostics(
  predictionRows: readonly ReviewRow[],
  parlayRows: readonly ReviewRow[],
  recommendationArtifact: RecommendationArtifactAudit | undefined,
): DailyStrategyDiagnostics {
  const reasons: string[] = [];
  if (!predictionRows.length) reasons.push('no persisted predictions found for the review date');
  if (!parlayRows.length) reasons.push('no persisted parlays found for the review date');
  if (!recommendationArtifact) reasons.push('no daily recommendation artifact found for the review date');
  else if (recommendationArtifact.total === 0) reasons.push('daily recommendation artifact contains zero recommendations');
  return {
    emptyReview: predictionRows.length === 0 && parlayRows.length === 0 && (!recommendationArtifact || recommendationArtifact.total === 0),
    reasons,
    recommendationArtifactPresent: Boolean(recommendationArtifact),
    recommendationArtifactRecommendations: recommendationArtifact?.total ?? 0,
  };
}

function strategyReviewDiagnostics(dailyReviews: readonly DailyStrategyReview[]): StrategyReviewDiagnostics {
  const datesWithoutPredictions = dailyReviews
    .filter((day) => day.predictions.total === 0)
    .map((day) => day.date);
  const datesWithoutParlays = dailyReviews
    .filter((day) => day.parlays.total === 0)
    .map((day) => day.date);
  const datesWithoutRecommendationArtifact = dailyReviews
    .filter((day) => !day.recommendationArtifact)
    .map((day) => day.date);
  const recommendationArtifacts = dailyReviews.reduce((summary, day) => ({
    totalRecommendations: summary.totalRecommendations + (day.recommendationArtifact?.total ?? 0),
    parlays: summary.parlays + (day.recommendationArtifact?.parlays ?? 0),
    atomicPredictions: summary.atomicPredictions + (day.recommendationArtifact?.atomicPredictions ?? 0),
    duplicateParlays: summary.duplicateParlays + (day.recommendationArtifact?.duplicateParlays ?? 0),
  }), {
    totalRecommendations: 0,
    parlays: 0,
    atomicPredictions: 0,
    duplicateParlays: 0,
  });
  const reasons: string[] = [];
  if (datesWithoutPredictions.length) reasons.push(`${datesWithoutPredictions.length} reviewed date(s) had zero persisted predictions`);
  if (datesWithoutParlays.length) reasons.push(`${datesWithoutParlays.length} reviewed date(s) had zero persisted parlays`);
  if (datesWithoutRecommendationArtifact.length) reasons.push(`${datesWithoutRecommendationArtifact.length} reviewed date(s) had no recommendation artifact`);
  if (!recommendationArtifacts.totalRecommendations) reasons.push('recommendation artifacts contributed zero published recommendations');
  return {
    emptyReview: dailyReviews.length === 0 || dailyReviews.every((day) => day.diagnostics.emptyReview),
    reasons,
    datesWithoutPredictions,
    datesWithoutParlays,
    datesWithoutRecommendationArtifact,
    recommendationArtifacts,
  };
}

async function buildAgentReview(
  config: AgentConfig,
  input: {
    runId: string;
    scope: string;
    generatedAt: Date;
    model: string;
    reasoningEffort: string;
    dates: string[];
    dailyReviews: DailyStrategyReview[];
    historySummary: StrategyHistorySummary;
    diagnostics: StrategyReviewDiagnostics;
    enabled: boolean;
    deps: StrategyReviewDependencies;
  },
): Promise<StrategyAgentReview> {
  if (!input.enabled) {
    return {
      status: 'skipped',
      provider: 'codex',
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      generatedAt: input.generatedAt.toISOString(),
    };
  }
  const agent = input.deps.runAgent ?? runAgent;
  const agentConfig: AgentConfig = {
    ...config,
    provider: 'codex',
    model: input.model,
    reasoningEffort: input.reasoningEffort as AgentConfig['reasoningEffort'],
    codexSandbox: process.env.GANA_STRATEGY_REVIEW_CODEX_SANDBOX === 'danger-full-access' ? 'danger-full-access' : 'read-only',
    nativeWebSearch: false,
    maxSteps: Number(process.env.GANA_STRATEGY_REVIEW_MAX_STEPS ?? 20),
  };
  const prompt = monetarySafeAgentPrompt(strategyReviewPrompt(input));
  try {
    const result = await agent(agentConfig, prompt, { runtime: { ...configRuntime(input.runId) } });
    const text = String(result.text ?? '').trim();
    const parsed = parseAgentJson(text);
    return {
      status: 'ok',
      provider: 'codex',
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      generatedAt: input.generatedAt.toISOString(),
      summary: stringValue(parsed.summary),
      effectivePatterns: stringArray(parsed.effectivePatterns),
      failurePatterns: stringArray(parsed.failurePatterns),
      proposedHarnessChanges: proposedChanges(parsed.proposedHarnessChanges),
      rawText: text,
    };
  } catch (err: any) {
    return {
      status: 'blocked',
      provider: 'codex',
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      generatedAt: input.generatedAt.toISOString(),
      error: err?.message ?? String(err),
    };
  }
}

function strategyReviewPrompt(input: {
  scope: string;
  dates: string[];
  dailyReviews: DailyStrategyReview[];
  historySummary: StrategyHistorySummary;
  diagnostics?: StrategyReviewDiagnostics;
}): string {
  const compact = {
    scope: input.scope,
    dates: input.dates,
    historySummary: input.historySummary,
    diagnostics: input.diagnostics,
    dailyReviews: input.dailyReviews.map((day) => ({
      date: day.date,
      predictions: day.predictions,
      parlays: day.parlays,
      diagnostics: day.diagnostics,
      topFailures: day.topFailures.slice(0, 8).map(agentSafeReviewItem),
      topEffective: day.topEffective.slice(0, 8).map(agentSafeReviewItem),
      recommendationArtifact: day.recommendationArtifact,
    })),
    strategyFilesToInspect: [
      'src/prediction/gates.ts',
      'src/scoring/edge-gate.ts',
      'src/parlay/rules.ts',
      'src/parlay/ranker.ts',
      'src/parlay/eligibility.ts',
      'src/filters/low-odds-selector.ts',
      'src/daily/e2e.ts',
      'skills/research-fixture-v2/prompt.md',
      'skills/score-prediction-v2/prompt.md',
    ],
  };
  return [
    'Analyze Gana v9 harness prediction and parlay validation history.',
    'Use only local repository context and the JSON payload below. Do not browse the web.',
    'Inspect the strategy files listed in the payload if needed.',
    'Return only valid JSON. Do not modify files. Do not include markdown.',
    'Focus on concrete harness strategy improvements: gates, thresholds, portfolio profiles, duplicate filtering, market coverage, prompts, or validation feedback loops.',
    'Schema:',
    JSON.stringify({
      summary: 'short executive summary',
      effectivePatterns: ['pattern that should be preserved'],
      failurePatterns: ['pattern that caused misses or review-required outcomes'],
      proposedHarnessChanges: [{
        title: 'change title',
        priority: 'low|medium|high',
        status: 'proposed|ready-for-implementation|needs-more-data',
        targetFiles: ['repo/path.ts'],
        rationale: 'why this change follows from the data',
        expectedImpact: 'expected measurable impact',
        verification: 'test or command that should prove the change',
      }],
    }),
    'Payload:',
    JSON.stringify(compact),
  ].join('\n\n');
}

function monetarySafeAgentPrompt(prompt: string): string {
  return prompt
    .replace(/\bwagers\b/gi, 'analytical outcomes')
    .replace(/\bwager\b/gi, 'analytical outcome')
    .replace(/\bbets\b/gi, 'analytical selections')
    .replace(/\bbet\b/gi, 'analytical selection')
    .replace(/\bstakes\b/gi, 'analytical allocation units')
    .replace(/\bstake\b/gi, 'analytical allocation unit')
    .replace(/\bbookmaker\b/gi, 'odds source')
    .replace(/\bBet365\b/g, 'odds-source-365')
    .replace(/\bguarantee(d)?\b/gi, 'assure$1')
    .replace(/\bexecute\b/gi, 'evaluate')
    .replace(/\bsubmit\b/gi, 'record')
    .replace(/\bplace\b/gi, 'rank');
}

function agentSafeReviewItem(item: ReviewItem): Omit<ReviewItem, 'rationale'> {
  const { rationale: _rationale, ...safe } = item;
  return safe;
}

function renderStrategyReviewMarkdown(payload: any): string {
  const agent = payload.agentReview as StrategyAgentReview;
  const lines = [
    `# Gana v9 Strategy Review`,
    '',
    `- Run: ${payload.runId}`,
    `- Scope: ${payload.scope}`,
    `- Generated: ${payload.generatedAt}`,
    `- Dates: ${payload.dates.join(', ')}`,
    `- Codex model: ${payload.model}`,
    `- Reasoning: ${payload.reasoningEffort}`,
    '',
    `## Historical Summary`,
    '',
    metricLine('Predictions', payload.historySummary.predictions),
    metricLine('Parlays', payload.historySummary.parlays),
    '',
    `## Recurring Issues`,
    '',
    ...listOrNone(payload.historySummary.recurringIssues),
    '',
    `## Diagnostics`,
    '',
    ...listOrNone(payload.diagnostics?.reasons ?? []),
    '',
    `## Weakest Buckets`,
    '',
    ...bucketLines(payload.historySummary.weakestBuckets),
    '',
    `## Strongest Buckets`,
    '',
    ...bucketLines(payload.historySummary.strongestBuckets),
    '',
    `## Codex Review`,
    '',
    `Status: ${agent.status}`,
  ];
  if (agent.summary) lines.push('', agent.summary);
  if (agent.failurePatterns?.length) lines.push('', '### Failure Patterns', '', ...listOrNone(agent.failurePatterns));
  if (agent.effectivePatterns?.length) lines.push('', '### Effective Patterns', '', ...listOrNone(agent.effectivePatterns));
  if (agent.proposedHarnessChanges?.length) {
    lines.push('', '### Proposed Harness Changes', '');
    for (const change of agent.proposedHarnessChanges) {
      lines.push(
        `- [${change.priority}] ${change.title} (${change.status})`,
        `  - Files: ${change.targetFiles.join(', ') || 'n/a'}`,
        `  - Rationale: ${change.rationale}`,
        `  - Expected impact: ${change.expectedImpact}`,
        `  - Verification: ${change.verification}`,
      );
    }
  }
  if (agent.error) lines.push('', `Error: ${agent.error}`);
  lines.push('', `## Daily Reviews`, '');
  for (const day of payload.dailyReviews as DailyStrategyReview[]) {
    lines.push(`### ${day.date}`, '', metricLine('Predictions', day.predictions), metricLine('Parlays', day.parlays));
    if (day.recommendationArtifact) {
      lines.push(`Recommendation artifact: ${day.recommendationArtifact.path}`);
      if (day.recommendationArtifact.duplicateParlays) {
        lines.push(`Duplicate parlays: ${day.recommendationArtifact.duplicateParlays}`);
      }
    }
    if (day.diagnostics?.reasons?.length) lines.push(...day.diagnostics.reasons.map((reason) => `Diagnostic: ${reason}`));
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function updateCentralDoc(existing: string, payload: any, artifactPath: string, reportPath: string): string {
  const base = existing.trim()
    ? existing.trimEnd()
    : [
      '# Gana v9 Harness Strategy Review Log',
      '',
      'Central tracking document for daily and historical validation-driven harness improvement proposals.',
      '',
      'Automated reviews are analytical only. They create a proposed change backlog; source-code changes still require normal implementation and verification.',
    ].join('\n');
  const agent = payload.agentReview as StrategyAgentReview;
  const entry = [
    '',
    `## ${payload.generatedAt.slice(0, 10)} · ${payload.scope}`,
    '',
    `- Run: ${payload.runId}`,
    `- Dates: ${payload.dates.join(', ')}`,
    `- Artifact: ${artifactPath}`,
    `- Report: ${reportPath}`,
    `- Model: ${payload.model}`,
    `- Reasoning: ${payload.reasoningEffort}`,
    `- Agent status: ${agent.status}`,
    `- Predictions: ${summaryShort(payload.historySummary.predictions)}`,
    `- Parlays: ${summaryShort(payload.historySummary.parlays)}`,
    ...(payload.diagnostics?.reasons?.length ? [`- Diagnostics: ${payload.diagnostics.reasons.join('; ')}`] : []),
    '',
    '### Proposed Modifications',
    '',
    ...(agent.proposedHarnessChanges?.length
      ? agent.proposedHarnessChanges.map((change) => `- [${change.priority}] ${change.title} (${change.status}) — ${change.targetFiles.join(', ') || 'n/a'}`)
      : ['- None generated.']),
  ].join('\n');
  return `${base}\n${entry}\n`;
}

function auditRecommendationArtifacts(
  config: AgentConfig,
  date: string,
  deps: StrategyReviewDependencies,
): RecommendationArtifactAudit | undefined {
  const paths = deps.listRecommendationArtifacts
    ? deps.listRecommendationArtifacts(config.artifactRoot, date)
    : findRecommendationArtifacts(config.artifactRoot, date);
  const path = paths[0];
  if (!path) return undefined;
  try {
    const artifact = JSON.parse(readFileSync(path, 'utf8'));
    const recommendations = Array.isArray(artifact.recommendations) ? artifact.recommendations : [];
    const signatures = recommendations
      .filter((item: any) => item?.kind === 'parlay' || (Array.isArray(item?.legs) && item.legs.length > 1))
      .map((item: any) => (item.legs ?? [])
        .map((leg: any) => `${leg.fixtureId ?? leg.fixture}:${leg.market}:${leg.selection}:${leg.line ?? ''}`)
        .sort()
        .join('|'));
    const duplicateSignatures: string[] = signatures.filter((signature: string, index: number) => signature && signatures.indexOf(signature) !== index);
    return {
      path,
      total: recommendations.length,
      parlays: recommendations.filter((item: any) => item?.kind === 'parlay' || Array.isArray(item?.legs) && item.legs.length > 1).length,
      atomicPredictions: recommendations.filter((item: any) => item?.kind === 'atomic-prediction').length,
      duplicateParlays: new Set(duplicateSignatures).size,
      duplicateSignatures: [...new Set(duplicateSignatures)].slice(0, 10),
    };
  } catch {
    return undefined;
  }
}

function findRecommendationArtifacts(artifactRoot: string, date: string): string[] {
  const runs = resolve(artifactRoot, 'runs');
  const matches: Array<{ path: string; mtime: number }> = [];
  const visit = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name === 'daily-parlay-recommendations.json') {
        try {
          const text = readFileSync(path, 'utf8');
          if (text.includes(`"date":"${date}"`) || text.includes(`"date": "${date}"`) || path.includes(date)) {
            matches.push({ path, mtime: entryMtime(path) });
          }
        } catch {
          // Ignore unreadable artifacts.
        }
      }
    }
  };
  visit(runs);
  return matches.sort((a, b) => b.mtime - a.mtime).map((match) => match.path);
}

function entryMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function topRows(rows: ReviewRow[], status: 'won' | 'lost'): ReviewItem[] {
  return rows
    .filter((row) => normalizeStatus(row.status) === status)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || (b.edge ?? 0) - (a.edge ?? 0) || (b.odds ?? 0) - (a.odds ?? 0))
    .slice(0, 10)
    .map((row) => ({ ...row }));
}

function recurringIssues(predictions: TargetReviewSummary, parlays: TargetReviewSummary, weakest: ReviewBucket[]): string[] {
  const issues: string[] = [];
  if (predictions.unvalidated > 0) issues.push(`${predictions.unvalidated} predictions remain unvalidated; daily review should run after fixture settlement is complete.`);
  if (parlays.unvalidated > 0) issues.push(`${parlays.unvalidated} parlays remain unvalidated; parlay settlement coverage is incomplete.`);
  for (const bucket of weakest.slice(0, 4)) {
    issues.push(`${bucket.bucket} underperformed: ${bucket.won}-${bucket.lost} settled, hit ${formatPercent(bucket.hitRate)}.`);
  }
  return issues;
}

function statusOf(row: any): string {
  return row.validationArtifacts?.[0]?.status ?? 'unvalidated';
}

function profileOf(row: any): string | null {
  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object') {
    return String(metadata.portfolioProfile ?? metadata.profile ?? metadata.parlayProfile ?? metadata.family ?? 'unknown');
  }
  return null;
}

function normalizeStatus(status: string): typeof STATUSES[number] {
  return STATUSES.includes(status as typeof STATUSES[number]) ? status as typeof STATUSES[number] : 'unvalidated';
}

function hitRate(counts: { won: number; lost: number }): number | null {
  const settled = counts.won + counts.lost;
  return settled ? round(counts.won / settled) : null;
}

function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return nums.length ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length) : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fixtureLabel(fixture: any): string {
  const home = fixture?.homeTeam?.name ?? fixture?.metadata?.teams?.home?.name ?? 'Home';
  const away = fixture?.awayTeam?.name ?? fixture?.metadata?.teams?.away?.name ?? 'Away';
  return `${home} vs ${away}`;
}

function oddsBucket(odds: number | null): string {
  if (odds === null) return 'unknown';
  if (odds < 1.2) return '<1.20';
  if (odds < 1.5) return '1.20-1.49';
  if (odds < 2) return '1.50-1.99';
  if (odds < 3) return '2.00-2.99';
  return '3.00+';
}

function confidenceBucket(confidence: number | null): string {
  if (confidence === null) return 'unknown';
  if (confidence >= 0.9) return '90%+';
  if (confidence >= 0.8) return '80-89%';
  if (confidence >= 0.7) return '70-79%';
  return '<70%';
}

function parseAgentJson(text: string): any {
  const direct = tryParseJson(text);
  if (direct) return direct;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = tryParseJson(match[0]);
    if (parsed) return parsed;
  }
  throw new Error('Codex strategy review did not return parseable JSON.');
}

function tryParseJson(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function proposedChanges(value: unknown): ProposedHarnessChange[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    title: stringValue(item?.title) ?? 'Untitled harness change',
    priority: ['low', 'medium', 'high'].includes(item?.priority) ? item.priority : 'medium',
    status: ['proposed', 'ready-for-implementation', 'needs-more-data'].includes(item?.status) ? item.status : 'proposed',
    targetFiles: stringArray(item?.targetFiles),
    rationale: stringValue(item?.rationale) ?? '',
    expectedImpact: stringValue(item?.expectedImpact) ?? '',
    verification: stringValue(item?.verification) ?? '',
  }));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function dateRange(from: string, through: string): string[] {
  const dates: string[] = [];
  let cursor = parseIsoDate(from);
  const end = parseIsoDate(through);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function assertIsoDate(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${flag} requires YYYY-MM-DD.`);
  return value;
}

function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizeReasoning(value: string): ReasoningEffort {
  return isReasoningEffort(value) ? value : DEFAULT_REASONING;
}

function strategyRunId(input: RunStrategyReviewInput): string {
  if (input.all) return `strategy-review-backfill-${Date.now().toString(36)}`;
  const date = input.date ?? input.through ?? new Date().toISOString().slice(0, 10);
  return `strategy-review-${date}-${randomUUID().slice(0, 8)}`;
}

function readExistingDoc(path: string, deps: StrategyReviewDependencies): string {
  try {
    if (deps.readFile) return deps.readFile(path);
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  } catch {
    return '';
  }
}

function configRuntime(runId: string): RuntimeContext {
  return { runId } as RuntimeContext;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function metricLine(label: string, summary: TargetReviewSummary): string {
  return `- ${label}: total ${summary.total}, won ${summary.won}, lost ${summary.lost}, pending ${summary.pending}, unvalidated ${summary.unvalidated}, hit ${formatPercent(summary.hitRate)}`;
}

function summaryShort(summary: TargetReviewSummary): string {
  return `${summary.won}-${summary.lost} hit ${formatPercent(summary.hitRate)} (${summary.total} total)`;
}

function bucketLines(buckets: ReviewBucket[]): string[] {
  return buckets.length
    ? buckets.map((bucket) => `- ${bucket.bucket}: ${bucket.won}-${bucket.lost}, hit ${formatPercent(bucket.hitRate)}, total ${bucket.total}`)
    : ['- None.'];
}

function listOrNone(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ['- None.'];
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}
