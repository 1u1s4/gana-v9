import { randomUUID } from 'crypto';
import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { runAgentWithRetry } from '../agent.js';
import { redactSecrets } from '../permissions/redaction.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import { getPrismaClient } from '../storage/db.js';
import type { JsonValue, StoragePrismaClient } from '../storage/types.js';
import { deriveNativeWebSearchRequirement } from '../providers/agentic/helpers.js';
import {
  createApiFootballPersistence,
  createApiFootballProvider,
} from '../providers/sports/api-football.js';
import type {
  CanonicalOddsSnapshot,
  FixtureStatistics,
  OddsQuery,
  SportsDataProvider,
} from '../providers/sports/types.js';
import {
  RESEARCH_FIXTURE_PROMPT_VERSION,
  type ResearchWebMode,
  buildResearchFixturePrompt,
} from '../prediction/prompts.js';
import {
  type ResearchBundle,
  type ResearchGateResult,
  type SourceRecord,
} from './types.js';
import { mergeGateWarnings, validateResearchBundle } from './claims.js';

export interface RunFixtureResearchInput {
  fixtureId: string;
  web: ResearchWebMode;
  oddsSnapshot?: CanonicalOddsSnapshot;
}

export interface FixtureResearchResult {
  ok: boolean;
  bundle?: ResearchBundle;
  gateResult: ResearchGateResult;
  artifactPath?: string;
  error?: string;
}

export interface FixtureResearchDependencies {
  agentRunner?: typeof runAgentWithRetry;
  provider?: ResearchSportsProvider;
  now?: () => Date;
  persistBundle?: (bundle: ResearchBundle, artifactPath: string) => Promise<void>;
  createRun?: (input: { runId: string; artifactDir?: string }) => Promise<string>;
}

type ResearchSportsProvider = Pick<SportsDataProvider, 'getFixture'> &
  Partial<Pick<SportsDataProvider, 'getFixtureStatistics'>> & {
    getCanonicalOddsSnapshot?(input: OddsQuery): Promise<CanonicalOddsSnapshot>;
  };

interface ResearchProviderContext {
  fixtureStatistics?: FixtureStatistics;
  oddsSnapshot?: CanonicalOddsSnapshot;
  warnings: string[];
}

const BLOCKED_GATE: ResearchGateResult = {
  verdict: 'blocked',
  reasons: ['research failed'],
  warnings: [],
};
const RESEARCH_AGENT_TIMEOUT_MS = 120_000;

export async function runFixtureResearch(
  config: AgentConfig,
  input: RunFixtureResearchInput,
  runtime: RuntimeContext,
  deps: FixtureResearchDependencies = {},
): Promise<FixtureResearchResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const createdAt = now().toISOString();
  const provider = deps.provider ?? await createDefaultSportsProvider(config, runtime);

  let fixture: Fixture;
  try {
    fixture = await provider.getFixture({ providerFixtureId: input.fixtureId });
  } catch (err: any) {
    return writeBlockedArtifact(config, runId, 'research-fixture-error.json', {
      fixtureId: input.fixtureId,
      error: err?.message ?? String(err),
    });
  }

  const providerContext = await buildResearchProviderContext(provider, fixture, input.oddsSnapshot);
  const prompt = buildResearchFixturePrompt({
    fixture,
    web: input.web,
    oddsSnapshot: providerContext.oddsSnapshot,
    fixtureStatistics: providerContext.fixtureStatistics,
    providerContextWarnings: providerContext.warnings,
    runId,
    createdAt,
  });

  let rawOutput = '';
  try {
    const nativeWebSearchRequirement = deriveNativeWebSearchRequirement(config, {
      required: input.web === 'live',
      reason: 'research fixture',
    });
    const result = await runResearchAgent(deps.agentRunner ?? runAgentWithRetry, config, prompt, {
      nativeWebSearchRequirement,
    });
    rawOutput = result.text;
  } catch (err: any) {
    const error = redactErrorMessage(err?.message ?? String(err));
    return buildAndPersistAgentFailureFallback(config, input, runtime, deps, runId, fixture, createdAt, error, providerContext);
  }

  const parsed = parseResearchJson(rawOutput);
  if (!parsed.ok) {
    return writeBlockedArtifact(config, runId, 'research-raw-output.json', {
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
      error: parsed.error,
      rawOutput,
    });
  }

  const repaired = repairResearchReferences(parsed.value);
  const baseSources = apiFootballSources(fixture, createdAt, providerContext);
  const bundleInput = {
    id: randomUUID(),
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    sources: normalizeSourceRecords(prependMissingSources(repaired.value.sources, baseSources)),
    evidenceItems: repaired.value.evidenceItems,
    claims: repaired.value.claims,
    gateResult: repaired.value.gateResult,
    providerAgentic: config.provider,
    model: config.model,
    promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
    createdAt,
    warnings: uniqueStrings([...(repaired.value.warnings ?? []), ...repaired.warnings, ...providerContext.warnings]),
    metadata: {
      ...(repaired.value.metadata ?? {}),
      providerContextWarnings: providerContext.warnings,
      ...(repaired.warnings.length ? { referenceRepairs: repaired.warnings } : {}),
    },
  };

  const validation = validateResearchBundle(bundleInput);
  if (!validation.ok || !validation.value) {
    return writeBlockedArtifact(config, runId, 'research-validation-error.json', {
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
      issues: validation.issues,
      rawOutput,
    });
  }

  return writeAndPersistResearchBundle(config, runtime, deps, runId, input.web, validation.value);
}

export function parseResearchJson(rawOutput: string): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = rawOutput.trim();
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err: any) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) };
      } catch {
        // Fall through to the original strict JSON error for actionable debugging.
      }
    }
    return { ok: false, error: `Research output must be strict JSON: ${err?.message ?? err}` };
  }
}

async function runResearchAgent(
  runner: typeof runAgentWithRetry,
  config: AgentConfig,
  prompt: string,
  options: Parameters<typeof runAgentWithRetry>[2],
): Promise<Awaited<ReturnType<typeof runAgentWithRetry>>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_AGENT_TIMEOUT_MS);
  try {
    return await runner(config, prompt, {
      ...options,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`research agent timed out after ${Math.round(RESEARCH_AGENT_TIMEOUT_MS / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function repairResearchReferences(value: any): { value: any; warnings: string[] } {
  const warnings: string[] = [];
  const claims = Array.isArray(value?.claims) ? value.claims : [];
  const evidenceItems = Array.isArray(value?.evidenceItems) ? value.evidenceItems : [];
  const claimIds = new Set(claims.map((claim: any) => claim?.id).filter((id: unknown): id is string => typeof id === 'string'));
  const evidenceIds = new Set(evidenceItems.map((evidence: any) => evidence?.id).filter((id: unknown): id is string => typeof id === 'string'));
  const evidenceIdsBySourceId = new Map<string, string[]>();

  for (const evidence of evidenceItems) {
    if (typeof evidence?.sourceId !== 'string' || typeof evidence?.id !== 'string') continue;
    const existing = evidenceIdsBySourceId.get(evidence.sourceId) ?? [];
    existing.push(evidence.id);
    evidenceIdsBySourceId.set(evidence.sourceId, existing);
  }

  const repairedEvidenceItems = evidenceItems.map((evidence: any) => {
    if (!Array.isArray(evidence?.claimIds)) return evidence;
    const claimIdsBefore = evidence.claimIds;
    const filteredClaimIds = uniqueStrings(claimIdsBefore.filter((claimId: unknown) => typeof claimId === 'string' && claimIds.has(claimId)));
    if (filteredClaimIds.length !== claimIdsBefore.length) {
      warnings.push(`removed unknown claim references from evidence item "${evidence.id ?? 'unknown'}"`);
    }
    return { ...evidence, claimIds: filteredClaimIds };
  });

  const repairedClaims = claims.map((claim: any) => {
    if (!Array.isArray(claim?.evidenceIds)) return claim;
    const repairedEvidenceIds: string[] = [];
    for (const evidenceId of claim.evidenceIds) {
      if (typeof evidenceId !== 'string') continue;
      if (evidenceIds.has(evidenceId)) {
        repairedEvidenceIds.push(evidenceId);
        continue;
      }
      const sourceEvidenceIds = evidenceIdsBySourceId.get(evidenceId);
      if (sourceEvidenceIds?.length) {
        repairedEvidenceIds.push(...sourceEvidenceIds);
        warnings.push(`mapped source reference "${evidenceId}" to evidence on claim "${claim.id ?? 'unknown'}"`);
        continue;
      }
      warnings.push(`removed unknown evidence reference "${evidenceId}" from claim "${claim.id ?? 'unknown'}"`);
    }
    return { ...claim, evidenceIds: uniqueStrings(repairedEvidenceIds) };
  });

  return {
    value: {
      ...value,
      evidenceItems: repairedEvidenceItems,
      claims: repairedClaims,
    },
    warnings: uniqueStrings(warnings),
  };
}

async function buildAndPersistAgentFailureFallback(
  config: AgentConfig,
  input: RunFixtureResearchInput,
  runtime: RuntimeContext,
  deps: FixtureResearchDependencies,
  runId: string,
  fixture: Fixture,
  createdAt: string,
  error: string,
  providerContext: ResearchProviderContext,
): Promise<FixtureResearchResult> {
  const bundleInput = buildAgentFailureFallbackBundle(config, input, runId, fixture, createdAt, error, providerContext);
  const validation = validateResearchBundle(bundleInput);
  if (!validation.ok || !validation.value) {
    return writeBlockedArtifact(config, runId, 'research-fallback-validation-error.json', {
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
      issues: validation.issues,
      error,
    });
  }

  return writeAndPersistResearchBundle(config, runtime, deps, runId, input.web, validation.value);
}

function buildAgentFailureFallbackBundle(
  config: AgentConfig,
  input: RunFixtureResearchInput,
  runId: string,
  fixture: Fixture,
  createdAt: string,
  error: string,
  providerContext: ResearchProviderContext = { warnings: [] },
): ResearchBundle {
  const source = apiFootballSource(fixture, createdAt);
  const statisticsSource = providerContext.fixtureStatistics
    ? apiFootballStatisticsSource(providerContext.fixtureStatistics, createdAt)
    : undefined;
  const oddsSource = providerContext.oddsSnapshot
    ? apiFootballOddsSnapshotSource(providerContext.oddsSnapshot, createdAt)
    : undefined;
  const evidenceId = 'evidence_api_football_fixture_metadata';
  const claimId = 'claim_api_football_fixture_metadata';
  const warnings = [
    `agentic research failed before structured JSON was returned: ${error}`,
    'fallback research uses API-Football provider context only',
    'fallback research is not promotable',
    ...providerContext.warnings,
  ];
  const evidenceItems = [{
    id: evidenceId,
    sourceId: source.id,
    claimIds: [claimId],
    summary: fixtureMetadataSummary(fixture),
    confidence: 0.55,
    metadata: {
      fallback: true,
      fields: ['providerFixtureId', 'homeTeamId', 'awayTeamId', 'scheduledAt', 'status'],
    },
  }];
  const claims = [{
    id: claimId,
    statement: fixtureMetadataClaim(fixture),
    subject: { type: 'fixture' as const, id: fixture.id },
    supportLevel: 'supported' as const,
    evidenceIds: [evidenceId],
    conflictStatus: 'none' as const,
    metadata: {
      fallback: true,
      sourceId: source.id,
    },
  }];

  if (providerContext.fixtureStatistics && statisticsSource) {
    const statisticsEvidenceId = 'evidence_api_football_fixture_statistics';
    const statisticsClaimId = 'claim_api_football_fixture_statistics';
    evidenceItems.push({
      id: statisticsEvidenceId,
      sourceId: statisticsSource.id,
      claimIds: [statisticsClaimId],
      summary: fixtureStatisticsSummary(providerContext.fixtureStatistics),
      confidence: 0.55,
      metadata: {
        fallback: true,
        fields: ['cornersHome', 'cornersAway', 'totalCorners'],
      },
    });
    claims.push({
      id: statisticsClaimId,
      statement: fixtureStatisticsClaim(providerContext.fixtureStatistics),
      subject: { type: 'fixture', id: fixture.id },
      supportLevel: 'supported',
      evidenceIds: [statisticsEvidenceId],
      conflictStatus: 'none',
      metadata: {
        fallback: true,
        sourceId: statisticsSource.id,
      },
    });
  }

  return {
    id: randomUUID(),
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    sources: [source, statisticsSource, oddsSource].filter((item): item is SourceRecord => Boolean(item)),
    evidenceItems,
    claims,
    gateResult: {
      verdict: 'review-required',
      reasons: [
        'agentic research failed before structured JSON was returned',
        'fallback contains API-Football provider context only',
        'independent evidence is insufficient for promotion',
      ],
      warnings,
    },
    providerAgentic: config.provider,
    model: config.model,
    promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
    createdAt,
    warnings,
    metadata: {
      fallback: true,
      fallbackReason: 'agent-runner-error',
      webMode: input.web,
      agentError: error,
      providerContextWarnings: providerContext.warnings,
    },
  };
}

async function writeAndPersistResearchBundle(
  config: AgentConfig,
  runtime: RuntimeContext,
  deps: FixtureResearchDependencies,
  runId: string,
  web: ResearchWebMode,
  validatedBundle: ResearchBundle,
): Promise<FixtureResearchResult> {
  const webWarnings = web !== 'off' && !validatedBundle.sources.some((source) => source.type === 'web-search')
    ? [`web ${web} requested but no web-search source was included`]
    : [];
  const bundle = mergeGateWarnings(validatedBundle, webWarnings);
  const artifactPath = writeArtifact(config, runId, 'research-bundle.json', bundle);

  try {
    await deps.createRun?.({ runId });
    await (deps.persistBundle ?? defaultPersistBundle(config, runtime))(bundle, artifactPath);
  } catch (err: any) {
    const errorPath = writeArtifact(config, runId, 'research-persist-error.json', {
      bundle,
      error: err?.message ?? String(err),
    });
    return {
      ok: false,
      gateResult: {
        verdict: 'blocked',
        reasons: ['research persistence failed'],
        warnings: [err?.message ?? String(err)],
      },
      artifactPath: errorPath,
      error: err?.message ?? String(err),
    };
  }

  return {
    ok: bundle.gateResult.verdict !== 'blocked',
    bundle,
    gateResult: bundle.gateResult,
    artifactPath,
  };
}

async function createDefaultSportsProvider(
  config: AgentConfig,
  runtime: RuntimeContext,
): Promise<ResearchSportsProvider> {
  const persistence = await createApiFootballPersistence(config, runtime);
  return createApiFootballProvider(config, persistence);
}

async function buildResearchProviderContext(
  provider: ResearchSportsProvider,
  fixture: Fixture,
  inputOddsSnapshot?: CanonicalOddsSnapshot,
): Promise<ResearchProviderContext> {
  const warnings: string[] = [];
  const fixtureStatistics = await fetchFixtureStatistics(provider, fixture.providerFixtureId, warnings);
  const oddsSnapshot = inputOddsSnapshot
    ?? await fetchCanonicalOddsSnapshot(provider, fixture.providerFixtureId, warnings);

  return {
    ...(fixtureStatistics && { fixtureStatistics }),
    ...(oddsSnapshot && { oddsSnapshot }),
    warnings: uniqueStrings(warnings),
  };
}

async function fetchFixtureStatistics(
  provider: ResearchSportsProvider,
  providerFixtureId: string,
  warnings: string[],
): Promise<FixtureStatistics | undefined> {
  if (!provider.getFixtureStatistics) return undefined;
  try {
    return await provider.getFixtureStatistics({ providerFixtureId });
  } catch (err: any) {
    warnings.push(`API-Football fixture statistics unavailable: ${err?.message ?? String(err)}`);
    return undefined;
  }
}

async function fetchCanonicalOddsSnapshot(
  provider: ResearchSportsProvider,
  providerFixtureId: string,
  warnings: string[],
): Promise<CanonicalOddsSnapshot | undefined> {
  if (!provider.getCanonicalOddsSnapshot) return undefined;
  try {
    return await provider.getCanonicalOddsSnapshot({ fixtureId: providerFixtureId });
  } catch (err: any) {
    warnings.push(`API-Football odds snapshot unavailable: ${err?.message ?? String(err)}`);
    return undefined;
  }
}

function apiFootballSource(fixture: Fixture, capturedAt: string): SourceRecord {
  return {
    id: 'source_api_football_fixture',
    type: 'api-football',
    externalId: fixture.providerFixtureId,
    title: 'API-Football fixture',
    capturedAt,
    hash: hashPayload(fixture),
    metadata: {
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
    },
  };
}

function apiFootballStatisticsSource(statistics: FixtureStatistics, capturedAt: string): SourceRecord {
  return {
    id: 'source_api_football_fixture_statistics',
    type: 'api-football',
    externalId: statistics.providerFixtureId,
    snapshotId: statistics.providerSnapshotId,
    title: 'API-Football fixture statistics',
    capturedAt: statistics.capturedAt ?? capturedAt,
    hash: hashPayload(statistics),
    metadata: {
      providerFixtureId: statistics.providerFixtureId,
      fields: ['cornersHome', 'cornersAway', 'totalCorners'],
    },
  };
}

function apiFootballOddsSnapshotSource(snapshot: CanonicalOddsSnapshot, capturedAt: string): SourceRecord {
  return {
    id: 'source_api_football_odds_snapshot',
    type: 'provider-snapshot',
    externalId: snapshot.providerFixtureId,
    snapshotId: snapshot.providerSnapshotId,
    title: 'API-Football odds snapshot',
    capturedAt: snapshot.capturedAt ?? capturedAt,
    hash: snapshot.payloadHash,
    metadata: {
      fixtureId: snapshot.fixtureId,
      providerFixtureId: snapshot.providerFixtureId,
      oddsSnapshotId: snapshot.oddsSnapshotId ?? null,
      quoteCount: snapshot.quotes.length,
      bookmakerCount: snapshot.bookmakerCount,
    },
  };
}

function apiFootballSources(
  fixture: Fixture,
  capturedAt: string,
  providerContext: ResearchProviderContext,
): SourceRecord[] {
  return [
    apiFootballSource(fixture, capturedAt),
    providerContext.fixtureStatistics
      ? apiFootballStatisticsSource(providerContext.fixtureStatistics, capturedAt)
      : undefined,
    providerContext.oddsSnapshot
      ? apiFootballOddsSnapshotSource(providerContext.oddsSnapshot, capturedAt)
      : undefined,
  ].filter((source): source is SourceRecord => Boolean(source));
}

function fixtureMetadataSummary(fixture: Fixture): string {
  const score = Number.isFinite(fixture.scoreHome) && Number.isFinite(fixture.scoreAway)
    ? `, score ${fixture.scoreHome}-${fixture.scoreAway}`
    : '';
  return [
    `API-Football fixture ${fixture.providerFixtureId}`,
    `home team ${fixture.homeTeamId}`,
    `away team ${fixture.awayTeamId}`,
    `status ${fixture.status}`,
    `scheduledAt ${fixture.scheduledAt}${score}`,
  ].join(', ');
}

function fixtureStatisticsSummary(statistics: FixtureStatistics): string {
  const cornerParts = [
    Number.isFinite(statistics.cornersHome) ? `home corners ${statistics.cornersHome}` : undefined,
    Number.isFinite(statistics.cornersAway) ? `away corners ${statistics.cornersAway}` : undefined,
    Number.isFinite(statistics.totalCorners) ? `total corners ${statistics.totalCorners}` : undefined,
  ].filter(Boolean);
  const corners = cornerParts.length ? cornerParts.join(', ') : 'no mapped corner statistics returned';
  return [
    `API-Football fixture statistics ${statistics.providerFixtureId}`,
    corners,
    `capturedAt ${statistics.capturedAt}`,
  ].join(', ');
}

function fixtureStatisticsClaim(statistics: FixtureStatistics): string {
  if (Number.isFinite(statistics.totalCorners)) {
    return `API-Football statistics list ${statistics.totalCorners} total corners for fixture ${statistics.providerFixtureId}.`;
  }
  return `API-Football statistics were captured for fixture ${statistics.providerFixtureId}.`;
}

function fixtureMetadataClaim(fixture: Fixture): string {
  return `API-Football lists fixture ${fixture.providerFixtureId} as ${fixture.status} with scheduled kickoff ${fixture.scheduledAt}.`;
}

function redactErrorMessage(error: string): string {
  const redacted = redactSecrets(error);
  return typeof redacted === 'string' ? redacted : 'Agentic research failed before structured JSON was returned.';
}

function prependMissingSources(sources: SourceRecord[] | undefined, requiredSources: SourceRecord[]): SourceRecord[] {
  const existing = Array.isArray(sources) ? sources : [];
  const missing = requiredSources.filter((source) => !existing.some((item) => item.id === source.id));
  return [...missing, ...existing];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.map((source) => {
    if (!source.url || isValidUrl(source.url)) return source;
    return {
      ...source,
      url: undefined,
      artifactPath: source.artifactPath ?? source.url,
    };
  });
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function writeBlockedArtifact(
  config: AgentConfig,
  runId: string,
  name: string,
  payload: Record<string, unknown>,
): FixtureResearchResult {
  const artifactPath = writeArtifact(config, runId, name, payload);
  return {
    ok: false,
    gateResult: {
      ...BLOCKED_GATE,
      warnings: typeof payload.error === 'string' ? [payload.error] : [],
    },
    artifactPath,
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
}

function defaultPersistBundle(config: AgentConfig, runtime: RuntimeContext) {
  return async (bundle: ResearchBundle, artifactPath: string): Promise<void> => {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required to persist research bundles.');

    const db = getPrismaClient() as unknown as StoragePrismaClient;
    const repositories = createStorageRepositories(db);
    await repositories.harnessRuns.upsertForRun?.({
      id: bundle.runId,
      runtime: config.runtime,
      profile: config.profile,
      providerSports: runtime.providerSports,
      providerAgentic: config.provider,
      model: config.model,
      status: 'succeeded',
      verdict: bundle.gateResult.verdict,
      startedAt: new Date(bundle.createdAt),
      completedAt: new Date(),
    });
    await repositories.researchBundles.createWithItems({
      bundle,
      artifactPath,
      artifactHash: hashPayload(bundle),
    });
  };
}

export function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
