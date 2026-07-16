import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';

import { runAgent } from '../agent.js';
import {
  REASONING_EFFORTS,
  loadConfig,
  type AgentConfig,
  type ReasoningEffort,
} from '../config.js';
import { normalizeUuid } from '../domain/ids.js';
import {
  runFixtureScoring,
  type FixtureScoringDependencies,
  type PredictionServiceRepositories,
} from '../prediction/service.js';
import type { FixtureStatistics } from '../providers/sports/types.js';
import type { AgentEvent, AgentUsage } from '../providers/agentic/types.js';
import { createRuntimeContext } from '../runtime/context.js';
import { disconnectDb, getPrismaClient } from '../storage/db.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import type {
  ClaimRecord,
  EvidenceItemRecord,
  FixtureRecord,
  OddsQuoteRecord,
  OddsSnapshotRecord,
  PredictionInput,
  PredictionRecord,
  ResearchBundleRecord,
  SourceRecordRecord,
  StoragePrismaClient,
} from '../storage/types.js';

const TARGET_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] as const;
const DEFAULT_FIXTURE_ID = '79bd2512-508c-4126-be75-8ee98d1813c0';
const DEFAULT_SNAPSHOT_ID = 'c583bb25-9314-47f2-870a-8692597a7671';
const DEFAULT_BUNDLE_ID = 'e364bab0-5fc7-4825-829f-54520b7d283a';
const DEFAULT_FROZEN_AT = '2026-07-09T18:00:00.000Z';
const MODEL_VISIBLE_RUN_ID = 'atomic-model-matrix-cell';
const ISOLATION_GUARD = [
  'Controlled harness experiment:',
  '- Use only the supplied Input payload.',
  '- Do not call tools, browse, inspect files, or seek information outside the payload.',
  '- Return only the JSON required by the scoring prompt and output schema.',
  '',
].join('\n');

interface Args {
  experimentId: string;
  outputRoot: string;
  fixtureId: string;
  snapshotId: string;
  bundleId: string;
  frozenAt: string;
  only: Set<string> | null;
  dryRun: boolean;
  force: boolean;
}

interface CatalogModel {
  id: string;
  supportedReasoning?: string[];
}

interface RequestedCell {
  blindLabel: string;
  cellId: string;
  model: typeof TARGET_MODELS[number];
  effort: ReasoningEffort;
  supported: boolean;
}

interface FrozenInput {
  fixture: FixtureRecord;
  snapshot: OddsSnapshotRecord;
  bundle: ResearchBundleRecord;
  quotes: OddsQuoteRecord[];
  sources: SourceRecordRecord[];
  evidenceItems: EvidenceItemRecord[];
  claims: ClaimRecord[];
  repositories: PredictionServiceRepositories;
  statistics?: FixtureStatistics;
}

interface AttemptMetric {
  attempt: number;
  promptHash: string;
  elapsedMs: number;
  usage?: AgentUsage;
  toolCalls: string[];
  reasoningSummaryAvailable: boolean;
  reasoningSummaryCharacters: number;
  error?: string;
}

interface CellSummary {
  blindLabel: string;
  cellId: string;
  intendedModel: string;
  actualModel?: string;
  effort: string;
  supported: boolean;
  status: 'completed' | 'failed' | 'unsupported';
  runId?: string;
  inputHash?: string;
  execution?: {
    ok: boolean;
    elapsedMs: number;
    attempts: AttemptMetric[];
    totalUsage: AgentUsage;
    error?: string;
  };
  raw?: {
    outputHash?: string;
    schemaValid: boolean;
    pick?: Record<string, unknown>;
  };
  harness?: {
    gateVerdict?: string;
    marketCoverage?: unknown;
    calibrationSummary?: unknown;
    pick?: Record<string, unknown>;
  };
  diagnostics?: {
    quoteExact: boolean;
    evidenceIdsValid: boolean;
    claimIdsValid: boolean;
    marketSpecificClaim: boolean;
    edgeAbsError: number | null;
    repairFields: string[];
    repairCount: number;
    objectiveScore: number;
  };
  artifactPath?: string;
  error?: string;
}

interface ArtifactPayload {
  rawOutput?: string;
  gateResult?: { verdict?: string };
  marketCoverage?: unknown;
  calibrationSummary?: unknown;
  predictions?: Array<Record<string, unknown>>;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2), repoRoot);
  const outputRoot = resolve(args.outputRoot);
  const cellsDir = join(outputRoot, 'cells');
  const workspace = join(outputRoot, 'isolated-workspace');
  mkdirSync(cellsDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  if (!existsSync(join(workspace, '.git'))) {
    execFileSync('git', ['init', '--quiet', workspace]);
  }

  const baseConfig = loadConfig({}, { skipApiKey: true });
  const catalogPath = resolve(repoRoot, baseConfig.codexModelListPath);
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { models?: CatalogModel[] };
  const requestedCells = buildRequestedCells(catalog.models ?? [], args.only);
  const frozen = await loadFrozenInput(args);
  validateFrozenInput(frozen, args);

  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const diffHash = sha256(execFileSync('git', ['diff', '--binary', '--no-ext-diff'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }));
  const inputIdentity = {
    fixtureId: frozen.fixture.id,
    providerFixtureId: frozen.fixture.providerFixtureId,
    fixture: fixtureLabel(frozen.fixture),
    scheduledAt: frozen.fixture.scheduledAt?.toISOString() ?? null,
    oddsSnapshotId: frozen.snapshot.id,
    oddsCapturedAt: frozen.snapshot.capturedAt.toISOString(),
    researchBundleId: frozen.bundle.id,
    researchCreatedAt: frozen.bundle.createdAt.toISOString(),
    market: 'h2h',
    quoteCount: frozen.quotes.filter((quote) => quote.marketKey === 'h2h').length,
    sourceCount: frozen.sources.length,
    evidenceCount: frozen.evidenceItems.length,
    claimCount: frozen.claims.length,
    frozenAt: args.frozenAt,
  };

  const completed = new Map<string, CellSummary>();
  for (const cell of requestedCells) {
    const summaryPath = join(cellsDir, cell.cellId, 'cell.json');
    if (!args.force && existsSync(summaryPath)) {
      completed.set(cell.cellId, JSON.parse(readFileSync(summaryPath, 'utf8')) as CellSummary);
    }
  }

  writeExperimentState(outputRoot, {
    experimentId: args.experimentId,
    status: args.dryRun ? 'dry-run' : 'running',
    gitHead,
    diffHash,
    inputIdentity,
    requestedCells,
    cells: [...completed.values()],
    limitations: limitations(),
  });

  if (args.dryRun) {
    console.log(`Dry run ready: ${outputRoot}`);
    await disconnectDb();
    return;
  }

  const originalCwd = process.cwd();
  process.chdir(workspace);
  try {
    let position = 0;
    for (const cell of requestedCells) {
      position += 1;
      const cellRoot = join(cellsDir, cell.cellId);
      const summaryPath = join(cellRoot, 'cell.json');
      if (!args.force && completed.has(cell.cellId)) {
        console.log(`[${position}/${requestedCells.length}] ${cell.cellId}: resume skip`);
        continue;
      }
      if (args.force) rmSync(cellRoot, { recursive: true, force: true });
      mkdirSync(cellRoot, { recursive: true });

      if (!cell.supported) {
        const summary: CellSummary = {
          blindLabel: cell.blindLabel,
          cellId: cell.cellId,
          intendedModel: cell.model,
          effort: cell.effort,
          supported: false,
          status: 'unsupported',
          error: `${cell.model} does not advertise reasoning effort ${cell.effort}`,
        };
        writeJson(summaryPath, summary);
        completed.set(cell.cellId, summary);
        console.log(`[${position}/${requestedCells.length}] ${cell.cellId}: unsupported`);
        continue;
      }

      console.log(`[${position}/${requestedCells.length}] ${cell.cellId}: running`);
      const summary = await runCell(baseConfig, cell, cellRoot, frozen, new Date(args.frozenAt));
      writeJson(summaryPath, summary);
      completed.set(cell.cellId, summary);
      console.log(`[${position}/${requestedCells.length}] ${cell.cellId}: ${summary.status}`);
      writeExperimentState(outputRoot, {
        experimentId: args.experimentId,
        status: 'running',
        gitHead,
        diffHash,
        inputIdentity,
        requestedCells,
        cells: requestedCells.map((item) => completed.get(item.cellId)).filter(Boolean),
        limitations: limitations(),
      });
    }
  } finally {
    process.chdir(originalCwd);
    await disconnectDb();
  }

  const cells = requestedCells.map((cell) => completed.get(cell.cellId)).filter((cell): cell is CellSummary => Boolean(cell));
  const validInputHashes = new Set(cells.filter((cell) => cell.supported).map((cell) => cell.inputHash).filter(Boolean));
  const allSupportedCompleted = cells.filter((cell) => cell.supported).every((cell) => cell.status === 'completed');
  const comparison = {
    experimentId: args.experimentId,
    status: allSupportedCompleted && validInputHashes.size === 1 ? 'completed' : 'incomplete',
    gitHead,
    diffHash,
    inputIdentity: {
      ...inputIdentity,
      modelVisibleInputHash: validInputHashes.size === 1 ? [...validInputHashes][0] : null,
      distinctModelVisibleInputHashes: [...validInputHashes],
    },
    cells,
    agreement: buildAgreement(cells),
    objectiveRanking: cells
      .filter((cell) => cell.status === 'completed')
      .sort(compareCells)
      .map((cell, index) => ({
        rank: index + 1,
        cellId: cell.cellId,
        objectiveScore: cell.diagnostics?.objectiveScore ?? 0,
        repairCount: cell.diagnostics?.repairCount ?? 0,
        elapsedMs: cell.execution?.elapsedMs ?? null,
      })),
    limitations: limitations(),
  };
  writeJson(join(outputRoot, 'atomic-model-comparison.json'), comparison);
  writeFileSync(join(outputRoot, 'atomic-model-comparison.md'), renderMarkdown(comparison));
  writeFileSync(join(outputRoot, 'atomic-model-blind-review.md'), renderBlindReviewMarkdown(comparison));
  writeExperimentState(outputRoot, comparison);
  console.log(`Comparison: ${join(outputRoot, 'atomic-model-comparison.json')}`);
  console.log(`Report: ${join(outputRoot, 'atomic-model-comparison.md')}`);
  console.log(`Blind review: ${join(outputRoot, 'atomic-model-blind-review.md')}`);

  if (comparison.status !== 'completed') process.exitCode = 1;
}

async function loadFrozenInput(args: Args): Promise<FrozenInput> {
  const fixtureId = normalizeUuid(args.fixtureId);
  const snapshotId = normalizeUuid(args.snapshotId);
  const bundleId = normalizeUuid(args.bundleId);
  if (!fixtureId) throw new Error(`--fixture-id must be a valid UUID: ${args.fixtureId}`);
  if (!snapshotId) throw new Error(`--snapshot-id must be a valid UUID: ${args.snapshotId}`);
  if (!bundleId) throw new Error(`--bundle-id must be a valid UUID: ${args.bundleId}`);
  const repositories = createStorageRepositories(getPrismaClient() as unknown as StoragePrismaClient);
  const [fixture, snapshot, bundle] = await Promise.all([
    repositories.fixtures.findById(fixtureId),
    repositories.oddsSnapshots.findById(snapshotId),
    repositories.researchBundles.findById(bundleId),
  ]);
  if (!fixture) throw new Error(`Fixture not found: ${args.fixtureId}`);
  if (!snapshot) throw new Error(`Odds snapshot not found: ${args.snapshotId}`);
  if (!bundle) throw new Error(`Research bundle not found: ${args.bundleId}`);

  const [quotes, sources, evidenceItems, claims] = await Promise.all([
    repositories.oddsQuotes.listLatest({ fixtureId: fixture.id, snapshotId: snapshot.id, take: 500 }),
    repositories.sourceRecords.list({ bundleId: bundle.id, take: 500 }),
    repositories.evidenceItems.list({ bundleId: bundle.id, take: 500 }),
    repositories.claims.list({ bundleId: bundle.id, take: 500 }),
  ]);

  const frozenRepositories: PredictionServiceRepositories = {
    sportsProviders: repositories.sportsProviders,
    fixtures: {
      findById: async (id) => id === fixture.id ? fixture : null,
      findByProviderKey: async (_providerId, providerFixtureId) => providerFixtureId === fixture.providerFixtureId ? fixture : null,
    },
    oddsSnapshots: {
      listLatestByFixture: async (fixtureId) => fixtureId === fixture.id ? [snapshot] : [],
    },
    oddsQuotes: {
      listLatest: async (query) => query.fixtureId === fixture.id && (!query.snapshotId || query.snapshotId === snapshot.id)
        ? quotes.slice(0, query.take ?? quotes.length)
        : [],
    },
    researchBundles: {
      list: async (query) => !query.fixtureId || query.fixtureId === fixture.id ? [bundle] : [],
    },
    sourceRecords: {
      list: async (query) => !query.bundleId || query.bundleId === bundle.id ? sources.slice(0, query.take ?? sources.length) : [],
    },
    evidenceItems: {
      list: async (query) => !query.bundleId || query.bundleId === bundle.id ? evidenceItems.slice(0, query.take ?? evidenceItems.length) : [],
    },
    claims: {
      list: async (query) => !query.bundleId || query.bundleId === bundle.id ? claims.slice(0, query.take ?? claims.length) : [],
    },
  };

  return {
    fixture,
    snapshot,
    bundle,
    quotes,
    sources,
    evidenceItems,
    claims,
    repositories: frozenRepositories,
  };
}

async function runCell(
  baseConfig: AgentConfig,
  cell: RequestedCell,
  cellRoot: string,
  frozen: FrozenInput,
  frozenAt: Date,
): Promise<CellSummary> {
  const artifactRoot = join(cellRoot, 'harness-artifacts');
  const config: AgentConfig = {
    ...baseConfig,
    apiFootball: { ...baseConfig.apiFootball },
    browserUse: { ...baseConfig.browserUse, enabled: false },
    display: { ...baseConfig.display },
    provider: 'codex',
    model: cell.model,
    reasoningEffort: cell.effort,
    fastMode: false,
    nativeWebSearch: false,
    codexFallbackModels: [],
    codexSandbox: 'read-only',
    codexThreadId: undefined,
    artifactRoot,
    profile: 'standard',
    approvalMode: 'manual',
  };
  const runtime = createRuntimeContext(config, join(cellRoot, 'session.jsonl'));
  runtime.runId = MODEL_VISIBLE_RUN_ID;
  const attempts: AttemptMetric[] = [];

  const agentRunner: NonNullable<FixtureScoringDependencies['agentRunner']> = async (runnerConfig, input, options) => {
    const prompt = typeof input === 'string' ? input : JSON.stringify(input);
    const modelPrompt = `${ISOLATION_GUARD}${prompt}`;
    const toolCalls: string[] = [];
    let reasoningSummaryCharacters = 0;
    const started = performance.now();
    try {
      const result = await runAgent(runnerConfig, modelPrompt, {
        ...options,
        onEvent: (event: AgentEvent) => {
          options?.onEvent?.(event);
          if (event.type === 'tool_call') toolCalls.push(event.name);
          if (event.type === 'reasoning') reasoningSummaryCharacters += event.delta.length;
        },
      });
      attempts.push({
        attempt: attempts.length + 1,
        promptHash: sha256(modelPrompt),
        elapsedMs: round(performance.now() - started, 3),
        usage: normalizeUsage(result.usage),
        toolCalls,
        reasoningSummaryAvailable: reasoningSummaryCharacters > 0,
        reasoningSummaryCharacters,
      });
      return result;
    } catch (error) {
      attempts.push({
        attempt: attempts.length + 1,
        promptHash: sha256(modelPrompt),
        elapsedMs: round(performance.now() - started, 3),
        toolCalls,
        reasoningSummaryAvailable: reasoningSummaryCharacters > 0,
        reasoningSummaryCharacters,
        error: errorMessage(error),
      });
      throw error;
    }
  };

  const started = performance.now();
  try {
    const result = await runFixtureScoring(config, {
      fixtureId: frozen.fixture.id,
      web: 'off',
      markets: ['h2h'],
    }, runtime, {
      now: () => new Date(frozenAt),
      repositories: frozen.repositories,
      fetchFixtureStatistics: async () => frozen.statistics,
      agentRunner,
      persistArtifact: async () => null,
      persistPredictions: async (predictions: PredictionInput[]) => predictions as unknown as PredictionRecord[],
    });
    const elapsedMs = round(performance.now() - started, 3);
    const artifact = result.artifactPath && existsSync(result.artifactPath)
      ? JSON.parse(readFileSync(result.artifactPath, 'utf8')) as ArtifactPayload
      : {};
    return summarizeCell(cell, config, result, artifact, frozen, attempts, elapsedMs);
  } catch (error) {
    return {
      blindLabel: cell.blindLabel,
      cellId: cell.cellId,
      intendedModel: cell.model,
      actualModel: config.model,
      effort: cell.effort,
      supported: true,
      status: 'failed',
      inputHash: attempts[0]?.promptHash,
      execution: {
        ok: false,
        elapsedMs: round(performance.now() - started, 3),
        attempts,
        totalUsage: sumUsage(attempts),
        error: errorMessage(error),
      },
      error: errorMessage(error),
    };
  }
}

function summarizeCell(
  cell: RequestedCell,
  config: AgentConfig,
  result: Awaited<ReturnType<typeof runFixtureScoring>>,
  artifact: ArtifactPayload,
  frozen: FrozenInput,
  attempts: AttemptMetric[],
  elapsedMs: number,
): CellSummary {
  let raw: Record<string, unknown> | undefined;
  try {
    raw = artifact.rawOutput ? JSON.parse(artifact.rawOutput) as Record<string, unknown> : undefined;
  } catch {
    raw = undefined;
  }
  const rawPicks = Array.isArray(raw?.predictions) ? raw.predictions as Array<Record<string, unknown>> : [];
  const rawPick = rawPicks.find((pick) => pick.market === 'h2h') ?? rawPicks[0];
  const harnessPick = artifact.predictions?.find((pick) => pick.market === 'h2h') ?? artifact.predictions?.[0];
  const quote = frozen.quotes.find((item) => item.id === rawPick?.oddsQuoteId);
  const evidenceIds = stringArray(rawPick?.evidenceIds);
  const claimIds = stringArray(rawPick?.claimIds);
  const evidenceSet = new Set(frozen.evidenceItems.map((item) => item.id));
  const claimSet = new Set(frozen.claims.map((item) => item.id));
  const evidenceIdsValid = evidenceIds.length > 0 && evidenceIds.every((id) => evidenceSet.has(id));
  const claimIdsValid = claimIds.length > 0 && claimIds.every((id) => claimSet.has(id));
  const marketSpecificClaim = claimIds.some((id) => frozen.claims.some((claim) => claim.id === id && claim.marketKey === 'h2h'));
  const quoteExact = Boolean(quote)
    && rawPick?.market === quote?.marketKey
    && rawPick?.selection === quote?.selectionKey
    && nullableNumber(rawPick?.line) === nullableNumber(quote?.line)
    && near(numberValue(rawPick?.odds), numberValue(quote?.price), 1e-9);
  const canonicalFair = nullableNumber(quote?.marketFairProbability);
  const probability = nullableNumber(rawPick?.modelProbability ?? rawPick?.probability);
  const reportedEdge = nullableNumber(rawPick?.edge);
  const recomputedEdge = probability !== null && canonicalFair !== null ? probability - canonicalFair : null;
  const edgeAbsError = reportedEdge !== null && recomputedEdge !== null ? Math.abs(reportedEdge - recomputedEdge) : null;
  const repairFields = compareRepairFields(rawPick, harnessPick);
  const toolFree = attempts.every((attempt) => attempt.toolCalls.length === 0);
  const schemaValid = rawPicks.length > 0;
  const objectiveScore = [
    [schemaValid, 20],
    [quoteExact, 15],
    [evidenceIdsValid, 15],
    [claimIdsValid, 10],
    [marketSpecificClaim, 10],
    [edgeAbsError !== null && edgeAbsError <= 0.01, 15],
    [toolFree, 10],
    [attempts.length === 1, 5],
  ].reduce((score, [ok, points]) => score + (ok ? Number(points) : 0), 0);

  return {
    blindLabel: cell.blindLabel,
    cellId: cell.cellId,
    intendedModel: cell.model,
    actualModel: config.model,
    effort: cell.effort,
    supported: true,
    status: result.artifactPath && rawPick ? 'completed' : 'failed',
    runId: result.runId,
    inputHash: attempts[0]?.promptHash,
    execution: {
      ok: result.ok,
      elapsedMs,
      attempts,
      totalUsage: sumUsage(attempts),
      error: result.error,
    },
    raw: {
      outputHash: artifact.rawOutput ? sha256(artifact.rawOutput) : undefined,
      schemaValid,
      pick: rawPick,
    },
    harness: {
      gateVerdict: artifact.gateResult?.verdict,
      marketCoverage: artifact.marketCoverage,
      calibrationSummary: artifact.calibrationSummary,
      pick: harnessPick,
    },
    diagnostics: {
      quoteExact,
      evidenceIdsValid,
      claimIdsValid,
      marketSpecificClaim,
      edgeAbsError: edgeAbsError === null ? null : round(edgeAbsError, 6),
      repairFields,
      repairCount: repairFields.length,
      objectiveScore,
    },
    artifactPath: result.artifactPath,
    error: result.error,
  };
}

function buildRequestedCells(models: CatalogModel[], only: Set<string> | null): RequestedCell[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  const cells: RequestedCell[] = [];
  let index = 0;
  for (const effort of REASONING_EFFORTS) {
    for (const model of TARGET_MODELS) {
      const cellId = `${model}-${effort}`;
      if (only && !only.has(cellId) && !only.has(`${model}:${effort}`)) continue;
      index += 1;
      const supported = byId.get(model)?.supportedReasoning?.includes(effort) ?? false;
      cells.push({
        blindLabel: `C${String(index).padStart(2, '0')}`,
        cellId,
        model,
        effort,
        supported,
      });
    }
  }
  return cells;
}

function validateFrozenInput(frozen: FrozenInput, args: Args): void {
  if (frozen.snapshot.fixtureId !== frozen.fixture.id) throw new Error('Frozen odds snapshot belongs to a different fixture.');
  if (frozen.bundle.fixtureId !== frozen.fixture.id) throw new Error('Frozen research bundle belongs to a different fixture.');
  if (frozen.fixture.status !== 'scheduled') throw new Error(`Fixture must be scheduled; received ${frozen.fixture.status}.`);
  if (new Date(args.frozenAt) >= (frozen.fixture.scheduledAt ?? new Date(0))) throw new Error('frozenAt must be before fixture kickoff.');
  if (!frozen.quotes.some((quote) => quote.marketKey === 'h2h')) throw new Error('Frozen snapshot has no h2h quotes.');
  if (!frozen.claims.some((claim) => claim.marketKey === 'h2h')) throw new Error('Frozen bundle has no h2h claim.');
}

function compareRepairFields(rawPick?: Record<string, unknown>, harnessPick?: Record<string, unknown>): string[] {
  if (!rawPick || !harnessPick) return rawPick === harnessPick ? [] : ['prediction'];
  const fields = ['oddsQuoteId', 'market', 'selection', 'line', 'odds', 'evidenceIds', 'claimIds', 'rationale'];
  return fields.filter((field) => JSON.stringify(rawPick[field] ?? null) !== JSON.stringify(harnessPick[field] ?? null));
}

function buildAgreement(cells: CellSummary[]): Record<string, unknown> {
  const completed = cells.filter((cell) => cell.status === 'completed');
  const selections = new Map<string, number>();
  const probabilities = new Map<string, number[]>();
  for (const cell of completed) {
    const selection = String(cell.raw?.pick?.selection ?? 'unknown');
    selections.set(selection, (selections.get(selection) ?? 0) + 1);
    const probability = nullableNumber(cell.raw?.pick?.modelProbability ?? cell.raw?.pick?.probability);
    if (probability !== null) probabilities.set(selection, [...(probabilities.get(selection) ?? []), probability]);
  }
  return {
    completedCells: completed.length,
    selectionCounts: Object.fromEntries(selections),
    probabilityBySelection: Object.fromEntries([...probabilities].map(([selection, values]) => [selection, {
      min: round(Math.min(...values), 6),
      max: round(Math.max(...values), 6),
      mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 6),
    }])),
  };
}

function renderMarkdown(comparison: any): string {
  const lines = [
    '# Atomic model matrix: Spain vs Belgium',
    '',
    `- Experiment: \`${comparison.experimentId}\``,
    `- Fixture: ${comparison.inputIdentity.fixture} (provider ${comparison.inputIdentity.providerFixtureId})`,
    `- Market: \`${comparison.inputIdentity.market}\``,
    `- Frozen at: ${comparison.inputIdentity.frozenAt}`,
    `- Input hash: \`${comparison.inputIdentity.modelVisibleInputHash ?? 'mismatch'}\``,
    '',
    'The report shows final redacted rationales and harness evidence links. It does not expose private chain-of-thought.',
    '',
    '| Cell | Model | Effort | Status | Pick | P(model) | Confidence | Edge | Gate | Attempts | Repairs | Time | Tokens | Reasoning tokens |',
    '|---|---|---:|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|',
  ];
  for (const cell of comparison.cells as CellSummary[]) {
    const raw = cell.raw?.pick;
    const harness = cell.harness?.pick;
    const usage = cell.execution?.totalUsage;
    lines.push(`| ${[
      cell.blindLabel,
      cell.intendedModel,
      cell.effort,
      cell.status,
      raw ? String(raw.selection ?? '') : '',
      formatNumber(raw?.modelProbability ?? raw?.probability),
      formatNumber(harness?.confidence ?? raw?.confidence),
      formatNumber(harness?.edge ?? raw?.edge),
      cell.harness?.gateVerdict ?? '',
      cell.execution?.attempts.length ?? 0,
      cell.diagnostics?.repairCount ?? 0,
      cell.execution ? `${Math.round(cell.execution.elapsedMs)}ms` : '',
      usage ? usageTotal(usage) : '',
      usage?.reasoningOutputTokens ?? '',
    ].join(' | ')} |`);
  }
  lines.push('', '## Rationales', '');
  for (const cell of comparison.cells as CellSummary[]) {
    lines.push(`### ${cell.blindLabel}: ${cell.intendedModel} / ${cell.effort}`, '');
    if (cell.status === 'unsupported') {
      lines.push(`Unsupported: ${cell.error}`, '');
      continue;
    }
    const raw = cell.raw?.pick;
    lines.push(
      `- Pick: ${String(raw?.selection ?? 'n/a')} at ${formatNumber(raw?.odds)}`,
      `- Model probability: ${formatNumber(raw?.modelProbability ?? raw?.probability)}`,
      `- Evidence IDs: ${stringArray(raw?.evidenceIds).map((id) => `\`${id}\``).join(', ') || 'none'}`,
      `- Claim IDs: ${stringArray(raw?.claimIds).map((id) => `\`${id}\``).join(', ') || 'none'}`,
      `- Warnings: ${stringArray(raw?.warnings).join('; ') || 'none'}`,
      `- Blockers: ${stringArray(raw?.blockers).join('; ') || 'none'}`,
      '',
      `> ${String(raw?.rationale ?? cell.error ?? 'No rationale')}`,
      '',
    );
  }
  lines.push('## Limitations', '', ...comparison.limitations.map((item: string) => `- ${item}`), '');
  return `${lines.join('\n')}\n`;
}

function renderBlindReviewMarkdown(comparison: any): string {
  const lines = [
    '# Blind rationale review: Spain vs Belgium',
    '',
    'Judge only the supplied decision summaries, grounding, uncertainty treatment, and numerical restraint.',
    'Model, effort, latency, token use, and operational gate are intentionally hidden.',
    'These are redacted rationales, not private chain-of-thought.',
    '',
  ];
  const candidates = (comparison.cells as CellSummary[])
    .filter((item) => item.status === 'completed')
    .sort((left, right) => String(left.raw?.outputHash).localeCompare(String(right.raw?.outputHash)));
  for (const [index, cell] of candidates.entries()) {
    const raw = cell.raw?.pick;
    lines.push(
      `## B${String(index + 1).padStart(2, '0')}`,
      '',
      `- Pick: ${String(raw?.selection ?? 'n/a')} at ${formatNumber(raw?.odds)}`,
      `- Model probability: ${formatNumber(raw?.modelProbability ?? raw?.probability)}`,
      `- Market fair probability: ${formatNumber(raw?.marketFairProbability)}`,
      `- Edge: ${formatNumber(raw?.edge)}`,
      `- Confidence: ${formatNumber(raw?.confidence)}`,
      `- Evidence IDs: ${stringArray(raw?.evidenceIds).map((id) => `\`${id}\``).join(', ') || 'none'}`,
      `- Claim IDs: ${stringArray(raw?.claimIds).map((id) => `\`${id}\``).join(', ') || 'none'}`,
      `- Warnings: ${stringArray(raw?.warnings).join('; ') || 'none'}`,
      `- Blockers: ${stringArray(raw?.blockers).join('; ') || 'none'}`,
      '',
      `> ${String(raw?.rationale ?? 'No rationale')}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function limitations(): string[] {
  return [
    'One execution per cell measures observed output, not reproducibility or predictive superiority.',
    'The fixture is unsettled; this experiment can compare reasoning quality and harness compliance, not final accuracy yet.',
    'Luna is review-only in the operational harness, so its gate/status is not an intrinsic quality score.',
    'Codex does not expose private chain-of-thought here; rationale, evidence links, warnings, blockers, latency, and token counts are compared instead.',
    'Model and effort are verified at the harness configuration/CLI boundary; provider events do not independently attest internal routing.',
    'All completed cells earned the same 100-point structural compliance score, so its latency tie-break is not a reasoning-quality ranking.',
    'Luna/ultra is recorded as unsupported and is not sent to the provider.',
  ];
}

function parseArgs(argv: string[], repoRoot: string): Args {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const experimentId = value('--experiment-id') ?? 'atomic-5-6-h2h-spain-belgium-20260709';
  const onlyValue = value('--only');
  return {
    experimentId,
    outputRoot: value('--output-root') ?? join(repoRoot, '.artifacts', 'gana-v9', 'experiments', experimentId),
    fixtureId: value('--fixture-id') ?? DEFAULT_FIXTURE_ID,
    snapshotId: value('--snapshot-id') ?? DEFAULT_SNAPSHOT_ID,
    bundleId: value('--bundle-id') ?? DEFAULT_BUNDLE_ID,
    frozenAt: value('--frozen-at') ?? DEFAULT_FROZEN_AT,
    only: onlyValue ? new Set(onlyValue.split(',').map((item) => item.trim()).filter(Boolean)) : null,
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

function writeExperimentState(outputRoot: string, value: unknown): void {
  writeJson(join(outputRoot, 'experiment.json'), value);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeUsage(usage: unknown): AgentUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const value = usage as Record<string, unknown>;
  const normalized: AgentUsage = {
    inputTokens: nullableNumber(value.inputTokens ?? value.input_tokens) ?? undefined,
    outputTokens: nullableNumber(value.outputTokens ?? value.output_tokens) ?? undefined,
    cachedInputTokens: nullableNumber(value.cachedInputTokens ?? value.cached_input_tokens) ?? undefined,
    reasoningOutputTokens: nullableNumber(value.reasoningOutputTokens ?? value.reasoning_output_tokens) ?? undefined,
    cacheWriteTokens: nullableNumber(value.cacheWriteTokens ?? value.cache_write_tokens) ?? undefined,
  };
  normalized.totalTokens = nullableNumber(value.totalTokens ?? value.total_tokens) ?? usageTotal(normalized);
  return normalized;
}

function sumUsage(attempts: AttemptMetric[]): AgentUsage {
  const sum = (key: keyof AgentUsage) => attempts.reduce((total, attempt) => total + Number(attempt.usage?.[key] ?? 0), 0);
  const usage: AgentUsage = {
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    cachedInputTokens: sum('cachedInputTokens'),
    reasoningOutputTokens: sum('reasoningOutputTokens'),
  };
  usage.totalTokens = usageTotal(usage);
  return usage;
}

function usageTotal(usage: AgentUsage): number {
  return Number(usage.inputTokens ?? 0) + Number(usage.outputTokens ?? 0);
}

function compareCells(left: CellSummary, right: CellSummary): number {
  return (right.diagnostics?.objectiveScore ?? 0) - (left.diagnostics?.objectiveScore ?? 0)
    || (left.diagnostics?.repairCount ?? 0) - (right.diagnostics?.repairCount ?? 0)
    || (left.execution?.elapsedMs ?? Infinity) - (right.execution?.elapsedMs ?? Infinity);
}

function fixtureLabel(fixture: FixtureRecord): string {
  const metadata = fixture.metadata as Record<string, any> | null;
  return `${metadata?.raw?.teams?.home?.name ?? metadata?.teams?.home?.name ?? 'Home'} vs ${metadata?.raw?.teams?.away?.name ?? metadata?.teams?.away?.name ?? 'Away'}`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = numberValue(value);
  return Number.isFinite(number) ? number : null;
}

function near(left: number, right: number, epsilon: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= epsilon;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: unknown): string {
  const number = nullableNumber(value);
  return number === null ? '' : String(round(number, 6));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main().catch(async (error) => {
  console.error(errorMessage(error));
  await disconnectDb().catch(() => undefined);
  process.exitCode = 1;
});
