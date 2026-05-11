import { randomUUID } from 'crypto';
import { join } from 'path';
import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import { isMarketKey, normalizeMarketScope, type MarketKey } from '../domain/markets.js';
import { hashPayload, writeArtifact } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import { runAgentWithRetry } from '../agent.js';
import { redactSecrets } from '../permissions/redaction.js';
import { createStorageRepositories } from '../storage/repositories/index.js';
import { getPrismaClient } from '../storage/db.js';
import type { JsonValue, StoragePrismaClient } from '../storage/types.js';
import { deriveNativeWebSearchRequirement, displayNativeWebToolName } from '../providers/agentic/helpers.js';
import type { AgentEvent } from '../providers/agentic/types.js';
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
  markets?: MarketKey[];
  oddsSnapshot?: CanonicalOddsSnapshot;
  signal?: AbortSignal;
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

interface NativeWebSearchTrace {
  used: boolean;
  browserFallbackUsed: boolean;
  calls: Array<{
    callId: string;
    name: string;
    query?: string;
    output?: string;
  }>;
}

const BLOCKED_GATE: ResearchGateResult = {
  verdict: 'blocked',
  reasons: ['research failed'],
  warnings: [],
};
const RESEARCH_AGENT_TIMEOUT_MS = positiveIntegerFromEnv('GANA_RESEARCH_AGENT_TIMEOUT_MS', positiveIntegerFromEnv('GANA_AGENT_TIMEOUT_MS', 300_000));
const RESEARCH_AGENT_JSON_ATTEMPTS = positiveIntegerFromEnv('GANA_RESEARCH_AGENT_JSON_ATTEMPTS', 2);
const RESEARCH_OUTPUT_SCHEMA_PATH = join(process.cwd(), 'skills/research-fixture-v2/output.schema.json');

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
  const marketScope = normalizeMarketScope(input.markets, config.apiFootball.defaultMarkets);

  let fixture: Fixture;
  try {
    fixture = await provider.getFixture({ providerFixtureId: input.fixtureId });
  } catch (err: any) {
    return writeBlockedArtifact(config, runId, 'research-fixture-error.json', {
      fixtureId: input.fixtureId,
      error: err?.message ?? String(err),
    });
  }

  const providerContext = await buildResearchProviderContext(provider, fixture, input.oddsSnapshot, marketScope);
  const prompt = buildResearchFixturePrompt({
    fixture,
    web: input.web,
    requiredMarkets: marketScope,
    marketFocus: marketScope,
    oddsSnapshot: providerContext.oddsSnapshot,
    fixtureStatistics: providerContext.fixtureStatistics,
    providerContextWarnings: providerContext.warnings,
    runId,
    createdAt,
  });

  let rawOutput = '';
  let parsed: ReturnType<typeof parseResearchJson> | undefined;
  const nativeWebSearchTrace = createNativeWebSearchTrace();
  for (let attempt = 1; attempt <= RESEARCH_AGENT_JSON_ATTEMPTS; attempt += 1) {
    try {
      const nativeWebSearchRequirement = deriveNativeWebSearchRequirement(config, {
        required: input.web === 'live',
        reason: 'research fixture',
      });
      const result = await runResearchAgent(deps.agentRunner ?? runAgentWithRetry, config, researchPromptForAttempt(prompt, attempt), {
        nativeWebSearchRequirement,
        onEvent: (event) => recordNativeWebSearchEvent(nativeWebSearchTrace, event),
        signal: input.signal,
      });
      rawOutput = result.text;
    } catch (err: any) {
      const error = redactErrorMessage(err?.message ?? String(err));
      if (isResearchTimeoutError(error) && attempt < RESEARCH_AGENT_JSON_ATTEMPTS) {
        rawOutput = '';
        continue;
      }
      return buildAndPersistAgentFailureFallback(config, input, runtime, deps, runId, fixture, createdAt, error, providerContext);
    }

    parsed = parseResearchJson(rawOutput);
    if (!parsed.ok) continue;
    if (isIncompleteLiveResearchPayload(parsed.value, input.web)) {
      if (attempt < RESEARCH_AGENT_JSON_ATTEMPTS) {
        rawOutput = '';
        continue;
      }
      return buildAndPersistAgentFailureFallback(
        config,
        input,
        runtime,
        deps,
        runId,
        fixture,
        createdAt,
        'Research web returned no usable claims or evidence after tool execution was requested',
        providerContext,
      );
    }
    break;
  }
  parsed ??= { ok: false, error: 'Research output must be strict JSON: no output returned' };
  if (!parsed.ok) {
    if (input.web === 'live' || input.web === 'cached') {
      return buildAndPersistAgentFailureFallback(
        config,
        input,
        runtime,
        deps,
        runId,
        fixture,
        createdAt,
        parsed.error,
        providerContext,
      );
    }
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
  const repairedSources = repairMissingEvidenceSources(
    repaired.value.evidenceItems,
    normalizeSourceRecords(ensureNativeWebSearchSource(
      prependMissingSources(repaired.value.sources, baseSources),
      input.web,
      createdAt,
      nativeWebSearchTrace,
      config.provider,
      runId,
    )),
    input.web,
    createdAt,
    runId,
  );
  const evidenceSourceRepairs = repairEvidenceSourceReferences(repaired.value.evidenceItems, repairedSources.sources);
  const webEnforcement = evaluateResearchWebCoverage(input.web, config, nativeWebSearchTrace, repairedSources.sources);
  const marketCoverage = buildResearchMarketCoverage(marketScope, providerContext.oddsSnapshot, evidenceSourceRepairs.evidenceItems, repaired.value.claims);
  const repairWarnings = uniqueStrings([
    ...repaired.warnings,
    ...repairedSources.warnings,
    ...evidenceSourceRepairs.warnings,
    ...webEnforcement.warnings,
    ...marketCoverage.warnings,
  ]);
  const bundleInput = {
    id: randomUUID(),
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    sources: repairedSources.sources,
    evidenceItems: evidenceSourceRepairs.evidenceItems,
    claims: repaired.value.claims,
    gateResult: repaired.value.gateResult,
    providerAgentic: config.provider,
    model: config.model,
    promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
    createdAt,
    warnings: uniqueStrings([...(repaired.value.warnings ?? []), ...repairWarnings, ...providerContext.warnings]),
    metadata: {
      ...(repaired.value.metadata ?? {}),
      providerContextWarnings: providerContext.warnings,
      marketScope,
      marketCoverage,
      webSearchCoverage: {
        mode: input.web,
        provider: config.provider,
        nativeSupported: webEnforcement.nativeSupported,
        nativeToolUsed: nativeWebSearchTrace.used,
        browserFallbackUsed: nativeWebSearchTrace.browserFallbackUsed,
        realWebSearchSourceCount: webEnforcement.realWebSearchSourceCount,
        syntheticWebSearchSourceCount: webEnforcement.syntheticWebSearchSourceCount,
        required: input.web === 'live',
      },
      ...(repairWarnings.length ? { referenceRepairs: repairWarnings } : {}),
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
    const balanced = extractFirstBalancedJsonObject(trimmed);
    if (balanced) {
      try {
        return { ok: true, value: JSON.parse(balanced) };
      } catch {
        // Fall through to the original strict JSON error for actionable debugging.
      }
    }
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

function extractFirstBalancedJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

function researchPromptForAttempt(prompt: string, attempt: number): string {
  if (attempt <= 1) return prompt;
  return [
    prompt,
    '',
    'Retry instruction: the previous research response failed or timed out. Use minimal-research-retry mode:',
    '- maximum 2 current web sources',
    '- maximum 4 claims',
    '- concise evidence summaries only',
    '- strict JSON only; no markdown, prose, comments, trailing text, or partial objects',
  ].join('\n');
}

function isResearchTimeoutError(error: string): boolean {
  return /timed out|timeout|aborted/i.test(error);
}

function isIncompleteLiveResearchPayload(value: any, web: ResearchWebMode): boolean {
  if (web !== 'live') return false;
  const claims = Array.isArray(value?.claims) ? value.claims : [];
  const evidenceItems = Array.isArray(value?.evidenceItems) ? value.evidenceItems : [];
  const reasons = Array.isArray(value?.gateResult?.reasons) ? value.gateResult.reasons : [];
  const warnings = Array.isArray(value?.gateResult?.warnings) ? value.gateResult.warnings : [];
  const text = [...reasons, ...warnings].filter((item): item is string => typeof item === 'string').join('\n');
  return (claims.length === 0 || evidenceItems.length === 0)
    && /tool call not yet performed|no valid external evidence gathered|no usable claims|no usable evidence/i.test(text);
}

function createNativeWebSearchTrace(): NativeWebSearchTrace {
  return { used: false, browserFallbackUsed: false, calls: [] };
}

function recordNativeWebSearchEvent(trace: NativeWebSearchTrace, event: AgentEvent): void {
  if ((event.type !== 'tool_call' && event.type !== 'tool_result') || !isWebSearchToolName(event.name)) return;
  if (event.name === 'browser') trace.browserFallbackUsed = true;
  else trace.used = true;
  const existing = trace.calls.find((call) => call.callId === event.callId);
  const call = existing ?? {
    callId: event.callId,
    name: event.name,
  };
  if (event.type === 'tool_call') {
    const query = webSearchQueryFromArgs(event.args);
    if (query) call.query = query;
  } else {
    call.output = event.output;
    if (!call.query) {
      const query = webSearchQueryFromOutput(event.output);
      if (query) call.query = query;
    }
  }
  if (!existing) trace.calls.push(call);
}

function isWebSearchToolName(name: string): boolean {
  return name === 'browser' || name === 'web_search' || name === 'google_web_search' || name.toLowerCase().includes('web_search');
}

function webSearchQueryFromArgs(args: Record<string, unknown>): string | undefined {
  const query = args.query;
  if (typeof query === 'string' && query.trim()) return query.trim();
  const queries = args.queries;
  if (Array.isArray(queries)) {
    const joined = queries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(', ');
    if (joined) return joined;
  }
  return undefined;
}

function webSearchQueryFromOutput(output: string): string | undefined {
  const prefix = 'Search completed:';
  if (!output.startsWith(prefix)) return undefined;
  const query = output.slice(prefix.length).trim();
  return query || undefined;
}

async function runResearchAgent(
  runner: typeof runAgentWithRetry,
  config: AgentConfig,
  prompt: string,
  options: Parameters<typeof runAgentWithRetry>[2],
): Promise<Awaited<ReturnType<typeof runAgentWithRetry>>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options?.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), RESEARCH_AGENT_TIMEOUT_MS);
  try {
    return await runner(config, prompt, {
      ...options,
      signal: controller.signal,
      outputSchemaPath: RESEARCH_OUTPUT_SCHEMA_PATH,
      useStdinPrompt: true,
    });
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`research agent timed out after ${Math.round(RESEARCH_AGENT_TIMEOUT_MS / 1000)}s`);
    }
    throw err;
  } finally {
    options?.signal?.removeEventListener('abort', abort);
    clearTimeout(timeout);
  }
}

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
    const subject = repairClaimSubject(claim?.subject, claim?.id, claim?.statement, warnings);
    const conflictStatus = repairClaimConflictStatus(claim?.conflictStatus, claim?.id, warnings);
    if (!Array.isArray(claim?.evidenceIds)) return { ...claim, subject, conflictStatus };
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
    return { ...claim, subject, conflictStatus, evidenceIds: uniqueStrings(repairedEvidenceIds) };
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

function repairClaimConflictStatus(value: unknown, claimId: unknown, warnings: string[]): 'none' | 'potential' | 'conflict' {
  if (value === 'none' || value === 'potential' || value === 'conflict') return value;
  if (typeof value === 'string' && /minor|partial|possible|uncertain|warning/i.test(value)) {
    warnings.push(`mapped conflictStatus "${value}" to "potential" on claim "${String(claimId ?? 'unknown')}"`);
    return 'potential';
  }
  warnings.push(`mapped invalid conflictStatus "${String(value ?? 'unknown')}" to "potential" on claim "${String(claimId ?? 'unknown')}"`);
  return 'potential';
}

function repairClaimSubject(subject: any, claimId: unknown, statement: unknown, warnings: string[]): any {
  if (subject?.type !== 'market') return subject;
  if (isMarketKey(subject.market)) return subject;
  if (isMarketKey(subject.id)) {
    warnings.push(`mapped market subject id "${subject.id}" to subject.market on claim "${String(claimId ?? 'unknown')}"`);
    return { ...subject, market: subject.id };
  }
  if (typeof statement === 'string') {
    const inferredMarket = inferMarketSubjectFromText(statement);
    if (isMarketKey(inferredMarket)) {
      warnings.push(`inferred market subject "${inferredMarket}" from statement on claim "${String(claimId ?? 'unknown')}"`);
      return { ...subject, market: inferredMarket };
    }
  }
  return subject;
}

function inferMarketSubjectFromText(statement: string): string | undefined {
  const normalized = statement.toLowerCase();
  const explicit = ['h2h', 'double_chance', 'goals_over_under', 'corners_over_under', 'btts']
    .find((market) => normalized.includes(market));
  if (explicit) return explicit;
  if (/\b(match\s*winner|moneyline|home\s*win|away\s*win|draw|1x2|h2h)\b/.test(normalized)) return 'h2h';
  if (/\b(double\s*chance|1x|x2|12)\b/.test(normalized)) return 'double_chance';
  if (/\b(goals?|over\s*under|total\s*goals|o\/u)\b/.test(normalized)) return 'goals_over_under';
  if (/\b(corners?|corner\s*total)\b/.test(normalized)) return 'corners_over_under';
  if (/\b(btts|both\s+teams\s+to\s+score)\b/.test(normalized)) return 'btts';
  if (/\b(bookmaker|odds?|market|price|implied)\b/.test(normalized)) return 'h2h';
  return undefined;
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
      marketScope: normalizeMarketScope(input.markets, config.apiFootball.defaultMarkets),
      agentError: error,
      providerContextWarnings: providerContext.warnings,
    },
  };
}

function evaluateResearchWebCoverage(
  web: ResearchWebMode,
  config: AgentConfig,
  trace: NativeWebSearchTrace,
  sources: SourceRecord[],
): {
  nativeSupported: boolean;
  realWebSearchSourceCount: number;
  syntheticWebSearchSourceCount: number;
  warnings: string[];
} {
  if (web === 'off') {
    return { nativeSupported: false, realWebSearchSourceCount: 0, syntheticWebSearchSourceCount: 0, warnings: [] };
  }
  const nativeRequirement = deriveNativeWebSearchRequirement(config, { required: web === 'live', reason: 'research fixture' });
  const realWebSearchSourceCount = sources.filter(isRealWebSearchSource).length;
  const syntheticWebSearchSourceCount = sources.filter((source) => source.type === 'web-search' && !isRealWebSearchSource(source)).length;
  const hasRealWebSearchSignal = realWebSearchSourceCount > 0 || trace.used || trace.browserFallbackUsed;
  const warnings: string[] = [];

  if (web === 'live' && nativeRequirement.supported && !trace.used) {
    warnings.push(
      `web live requested for provider ${config.provider}, but no real ${displayNativeWebToolName(config.provider) ?? 'native web search'} tool call was observed. Retry research with --web live and a provider/model that can use native web search, or use --web off for local-only scoring.`,
    );
  }
  if (web === 'live' && !nativeRequirement.supported && !trace.browserFallbackUsed) {
    warnings.push(
      `web live requested for provider ${config.provider}, which has no native web-search tool in this harness. Use OpenRouter/browser fallback with BROWSER_USE_API_KEY or switch to codex/gemini/cursor native web before promoting research.`,
    );
  }
  if (!hasRealWebSearchSignal) {
    warnings.push('web research requested but no real web-search source was linked; synthetic/repaired web sources do not count as sufficient evidence');
  }
  return {
    nativeSupported: nativeRequirement.supported,
    realWebSearchSourceCount,
    syntheticWebSearchSourceCount,
    warnings,
  };
}

function isRealWebSearchSource(source: SourceRecord): boolean {
  if (source.type !== 'web-search') return false;
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata as Record<string, unknown> : {};
  if (metadata.synthesized === true || metadata.repaired === true) return false;
  return Boolean(source.url || source.externalId);
}

function buildResearchMarketCoverage(
  requiredMarkets: readonly MarketKey[],
  oddsSnapshot: CanonicalOddsSnapshot | undefined,
  evidenceItems: Array<{ id?: unknown }>,
  claims: any[],
): {
  requiredMarkets: MarketKey[];
  quotedMarkets: MarketKey[];
  evidenceMarkets: MarketKey[];
  skippedMarkets: Array<{ market: MarketKey; reason: string }>;
  warnings: string[];
} {
  const quotedMarkets = [...new Set((oddsSnapshot?.quotes ?? []).map((quote) => quote.market).filter(isMarketKey))].sort();
  const evidenceIds = new Set(evidenceItems.map((item) => typeof item.id === 'string' ? item.id : '').filter(Boolean));
  const evidenceMarkets = [...new Set(claims.flatMap((claim) => {
    const market = claim?.subject?.type === 'market' ? claim.subject.market : claim?.metadata?.market;
    const ids = Array.isArray(claim?.evidenceIds) ? claim.evidenceIds : [];
    return isMarketKey(market) && ids.some((id: unknown) => typeof id === 'string' && evidenceIds.has(id)) ? [market] : [];
  }))].sort();
  const skippedMarkets = requiredMarkets.flatMap((market) => {
    if (!quotedMarkets.includes(market)) return [{ market, reason: 'missing odds quotes for requested market' }];
    if (!evidenceMarkets.includes(market)) return [{ market, reason: 'missing market-specific research evidence' }];
    return [];
  });
  const warnings = skippedMarkets.map((item) => `market ${item.market} skipped/review-required: ${item.reason}`);
  return {
    requiredMarkets: [...requiredMarkets],
    quotedMarkets,
    evidenceMarkets,
    skippedMarkets,
    warnings,
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
  const webWarnings = web !== 'off' && !bundleHasWebSearchCoverage(validatedBundle)
    ? [`web ${web} requested but no real web-search source was included`]
    : [];
  const bundle = normalizeResearchGateResult(mergeGateWarnings(validatedBundle, webWarnings), web);
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

function normalizeResearchGateResult(bundle: ResearchBundle, web: ResearchWebMode): ResearchBundle {
  if (bundle.gateResult.verdict === 'blocked') return bundle;

  const warnings = uniqueStrings([...bundle.warnings, ...bundle.gateResult.warnings]);
  const reasons = uniqueStrings(bundle.gateResult.reasons);
  const hasLiveWebEvidence = web === 'off' || bundleHasWebSearchCoverage(bundle);
  const fallback = bundle.metadata?.fallback === true || warnings.some(isHardResearchWarning) || reasons.some(isHardResearchWarning);
  const sufficientEvidence = hasSufficientIndependentEvidence(bundle);
  const agentPromotable = bundle.gateResult.verdict === 'promotable';
  const verdict = !fallback && hasLiveWebEvidence && (agentPromotable || sufficientEvidence) ? 'promotable' : 'review-required';
  const normalizedReasons = verdict === 'promotable'
    ? uniqueStrings([...reasons.filter((reason) => !/not promotable|insufficient for promotion/i.test(reason)), 'objective research gate passed with current web evidence'])
    : reasons;

  return {
    ...bundle,
    warnings,
    gateResult: {
      ...bundle.gateResult,
      verdict,
      reasons: normalizedReasons,
      warnings,
    },
  };
}

function bundleHasWebSearchCoverage(bundle: ResearchBundle): boolean {
  if (bundle.sources.some(isRealWebSearchSource)) return true;
  const coverage = bundle.metadata?.webSearchCoverage;
  if (!coverage || typeof coverage !== 'object') return false;
  const record = coverage as Record<string, unknown>;
  return record.nativeToolUsed === true || record.browserFallbackUsed === true;
}

function hasSufficientIndependentEvidence(bundle: ResearchBundle): boolean {
  const strongEvidenceIds = new Set(bundle.evidenceItems
    .filter((evidence) => evidenceConfidence(evidence.confidence) >= 0.65)
    .map((evidence) => evidence.id));
  const linkedStrongEvidenceIds = new Set<string>();
  let supportedClaimCount = 0;

  for (const claim of bundle.claims) {
    if (claim.conflictStatus === 'conflict' && !isNonMaterialScheduleConflictClaim(claim, bundle)) return false;
    if (claim.supportLevel !== 'supported') continue;
    const claimStrongEvidence = claim.evidenceIds.filter((id) => strongEvidenceIds.has(id));
    if (!claimStrongEvidence.length) continue;
    supportedClaimCount += 1;
    claimStrongEvidence.forEach((id) => linkedStrongEvidenceIds.add(id));
  }

  return supportedClaimCount >= 2 && linkedStrongEvidenceIds.size >= 2;
}

function isNonMaterialScheduleConflictClaim(claim: ResearchBundle['claims'][number], bundle: ResearchBundle): boolean {
  const subjectType = claim.subject?.type;
  if (subjectType !== 'fixture') return false;
  const claimText = claim.statement.toLowerCase();
  const evidenceText = claim.evidenceIds
    .map((id) => bundle.evidenceItems.find((evidence) => evidence.id === id)?.summary ?? '')
    .join(' ')
    .toLowerCase();
  const combined = `${claimText} ${evidenceText}`;
  const mentionsSchedule = /\b(kickoff|start\s*time|scheduled|schedule|timestamp|fixture\s*time|date)\b/.test(combined);
  const mentionsMinorDisagreement = /\b(differs?|different|provisional|time\s+zone|timezone|rescheduled|postponed)\b/.test(combined);
  const mentionsMarketOrAvailability = /\b(odds|market|price|line|injur|suspend|lineup|home|away|winner|draw|goals?|corners?|btts)\b/.test(combined);

  return mentionsSchedule && mentionsMinorDisagreement && !mentionsMarketOrAvailability;
}

function evidenceConfidence(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isHardResearchWarning(message: string): boolean {
  const normalized = message.toLowerCase();
  if (/\b(without|no)\s+(material\s+)?conflicts?\b/.test(normalized)) return false;
  return /fallback research|agentic research failed|research agent timed out|no web[-_ ]search source|no real .*web[-_ ]search|no native web[-_ ]search|browser fallback.*(?:missing|required|unavailable)|not included in the structured output|missing web[-_ ]search|web[-_ ]search evidence was required but not included|interrupted|insufficient evidence|contradict|mismatch|stale|\bconflict(?:ing|ed|s)?\b/i.test(message);
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
  markets?: MarketKey[],
): Promise<ResearchProviderContext> {
  const warnings: string[] = [];
  const fixtureStatistics = await fetchFixtureStatistics(provider, fixture.providerFixtureId, warnings);
  const oddsSnapshot = inputOddsSnapshot
    ?? await fetchCanonicalOddsSnapshot(provider, fixture.providerFixtureId, warnings, markets);

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
  markets?: MarketKey[],
): Promise<CanonicalOddsSnapshot | undefined> {
  if (!provider.getCanonicalOddsSnapshot) return undefined;
  try {
    return await provider.getCanonicalOddsSnapshot({ fixtureId: providerFixtureId, markets });
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
  const homeTeam = fixture.homeTeamName
    ? `${fixture.homeTeamName} (${fixture.homeTeamId})`
    : fixture.homeTeamId;
  const awayTeam = fixture.awayTeamName
    ? `${fixture.awayTeamName} (${fixture.awayTeamId})`
    : fixture.awayTeamId;
  return [
    `API-Football fixture ${fixture.providerFixtureId}`,
    `home team ${homeTeam}`,
    `away team ${awayTeam}`,
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
  const matchup = fixture.homeTeamName && fixture.awayTeamName
    ? `${fixture.homeTeamName} vs ${fixture.awayTeamName}`
    : `fixture ${fixture.providerFixtureId}`;
  return `API-Football lists ${matchup} (${fixture.providerFixtureId}) as ${fixture.status} with scheduled kickoff ${fixture.scheduledAt}.`;
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

function repairMissingEvidenceSources(
  evidenceItems: any[],
  sources: SourceRecord[],
  web: ResearchWebMode,
  capturedAt: string,
  runId: string,
): { sources: SourceRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const repairedSources = [...sources];

  for (const evidence of evidenceItems) {
    if (typeof evidence?.sourceId !== 'string' || sourceIds.has(evidence.sourceId)) continue;
    if (!shouldSynthesizeWebSearchSource(evidence, web)) continue;
    const source: SourceRecord = {
      id: evidence.sourceId,
      type: 'web-search',
      externalId: `repaired-missing-web-source:${runId}:${evidence.sourceId}`,
      title: `Repaired omitted web-search source ${evidence.sourceId}`,
      capturedAt,
      metadata: {
        repaired: true,
        reason: 'LLM output cited a web-search source id in evidence but omitted the matching source record.',
        evidenceId: typeof evidence.id === 'string' ? evidence.id : undefined,
      },
    };
    repairedSources.push(source);
    sourceIds.add(source.id);
    warnings.push(`synthesized omitted web-search source "${evidence.sourceId}" for evidence item "${evidence.id ?? 'unknown'}"`);
  }

  return { sources: repairedSources, warnings: uniqueStrings(warnings) };
}

function repairEvidenceSourceReferences(
  evidenceItems: any[],
  sources: SourceRecord[],
): { evidenceItems: any[]; warnings: string[] } {
  const warnings: string[] = [];
  const sourceIds = new Set(sources.map((source) => source.id));
  const repairedEvidenceItems = evidenceItems.map((evidence) => {
    if (typeof evidence?.sourceId !== 'string' || sourceIds.has(evidence.sourceId)) return evidence;
    const inferredSourceId = inferEvidenceSourceId(evidence, sources);
    if (!inferredSourceId) return evidence;
    warnings.push(`mapped unknown evidence source "${evidence.sourceId}" to "${inferredSourceId}" on evidence item "${evidence.id ?? 'unknown'}"`);
    return { ...evidence, sourceId: inferredSourceId };
  });
  return { evidenceItems: repairedEvidenceItems, warnings: uniqueStrings(warnings) };
}

function shouldSynthesizeWebSearchSource(evidence: any, web: ResearchWebMode): boolean {
  if (web === 'off') return false;
  const text = `${evidence?.summary ?? ''} ${evidence?.snippet ?? ''}`.toLowerCase();
  return /\b(web|search|result|report|news|article|site|source)\b/.test(text);
}

function inferEvidenceSourceId(evidence: any, sources: SourceRecord[]): string | undefined {
  const text = `${evidence?.summary ?? ''} ${evidence?.snippet ?? ''}`.toLowerCase();
  if (/\b(odds?|priced?|price|bookmaker|market|line)\b/.test(text) && sources.some((source) => source.id === 'source_api_football_odds_snapshot')) {
    return 'source_api_football_odds_snapshot';
  }
  if (/\b(statistics?|corners?|shots?|possession|cards?)\b/.test(text) && sources.some((source) => source.id === 'source_api_football_fixture_statistics')) {
    return 'source_api_football_fixture_statistics';
  }
  if (/\b(api-football|fixture|score|result|kickoff|status)\b/.test(text) && sources.some((source) => source.id === 'source_api_football_fixture')) {
    return 'source_api_football_fixture';
  }
  return undefined;
}

function ensureNativeWebSearchSource(
  sources: SourceRecord[],
  web: ResearchWebMode,
  capturedAt: string,
  trace: NativeWebSearchTrace,
  provider: AgentConfig['provider'],
  runId: string,
): SourceRecord[] {
  if (web === 'off' || !trace.used || sources.some((source) => source.type === 'web-search')) return sources;
  const queries = uniqueStrings(trace.calls.map((call) => call.query ?? '').filter(Boolean));
  return [
    ...sources,
    {
      id: 'source_native_web_search',
      type: 'web-search',
      externalId: `native-web-search:${provider}:${runId}`,
      title: queries.length ? `Native web search: ${queries[0]}` : 'Native web search',
      capturedAt,
      hash: hashPayload({
        provider,
        runId,
        calls: trace.calls,
      }),
      metadata: {
        provider,
        mode: web,
        synthesized: true,
        reason: 'Native web search tool was used, but the agent response did not include a web-search source.',
        queries,
        calls: trace.calls.map((call) => ({
          callId: call.callId,
          name: call.name,
          query: call.query,
        })),
      },
    },
  ];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.map((source) => {
    const normalized = {
      ...source,
      capturedAt: normalizeIsoDateTime(source.capturedAt),
    };
    if (!normalized.url || isValidUrl(normalized.url)) return normalized;
    return {
      ...normalized,
      url: undefined,
      artifactPath: normalized.artifactPath ?? normalized.url,
    };
  });
}

function normalizeIsoDateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
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
