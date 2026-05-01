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
import type { SportsDataProvider } from '../providers/sports/types.js';
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
  provider?: Pick<SportsDataProvider, 'getFixture'>;
  now?: () => Date;
  persistBundle?: (bundle: ResearchBundle, artifactPath: string) => Promise<void>;
  createRun?: (input: { runId: string; artifactDir?: string }) => Promise<string>;
}

const BLOCKED_GATE: ResearchGateResult = {
  verdict: 'blocked',
  reasons: ['research failed'],
  warnings: [],
};

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

  const prompt = buildResearchFixturePrompt({
    fixture,
    web: input.web,
    runId,
    createdAt,
  });

  let rawOutput = '';
  try {
    const nativeWebSearchRequirement = deriveNativeWebSearchRequirement(config, {
      required: input.web === 'live',
      reason: 'research fixture',
    });
    const result = await (deps.agentRunner ?? runAgentWithRetry)(config, prompt, {
      nativeWebSearchRequirement,
    });
    rawOutput = result.text;
  } catch (err: any) {
    const error = redactErrorMessage(err?.message ?? String(err));
    return buildAndPersistAgentFailureFallback(config, input, runtime, deps, runId, fixture, createdAt, error);
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

  const baseSource = apiFootballSource(fixture, createdAt);
  const bundleInput = {
    id: randomUUID(),
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    sources: normalizeSourceRecords(prependMissingSource(parsed.value.sources, baseSource)),
    evidenceItems: parsed.value.evidenceItems,
    claims: parsed.value.claims,
    gateResult: parsed.value.gateResult,
    providerAgentic: config.provider,
    model: config.model,
    promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
    createdAt,
    warnings: parsed.value.warnings ?? [],
    metadata: parsed.value.metadata ?? {},
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

async function buildAndPersistAgentFailureFallback(
  config: AgentConfig,
  input: RunFixtureResearchInput,
  runtime: RuntimeContext,
  deps: FixtureResearchDependencies,
  runId: string,
  fixture: Fixture,
  createdAt: string,
  error: string,
): Promise<FixtureResearchResult> {
  const bundleInput = buildAgentFailureFallbackBundle(config, input, runId, fixture, createdAt, error);
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
): ResearchBundle {
  const source = apiFootballSource(fixture, createdAt);
  const evidenceId = 'evidence_api_football_fixture_metadata';
  const claimId = 'claim_api_football_fixture_metadata';
  const warnings = [
    `agentic research failed before structured JSON was returned: ${error}`,
    'fallback research uses API-Football fixture metadata only',
    'fallback research is not promotable',
  ];

  return {
    id: randomUUID(),
    runId,
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    sources: [source],
    evidenceItems: [{
      id: evidenceId,
      sourceId: source.id,
      claimIds: [claimId],
      summary: fixtureMetadataSummary(fixture),
      confidence: 0.55,
      metadata: {
        fallback: true,
        fields: ['providerFixtureId', 'homeTeamId', 'awayTeamId', 'scheduledAt', 'status'],
      },
    }],
    claims: [{
      id: claimId,
      statement: fixtureMetadataClaim(fixture),
      subject: { type: 'fixture', id: fixture.id },
      supportLevel: 'supported',
      evidenceIds: [evidenceId],
      conflictStatus: 'none',
      metadata: {
        fallback: true,
        sourceId: source.id,
      },
    }],
    gateResult: {
      verdict: 'review-required',
      reasons: [
        'agentic research failed before structured JSON was returned',
        'fallback contains API-Football fixture metadata only',
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
): Promise<Pick<SportsDataProvider, 'getFixture'>> {
  const persistence = await createApiFootballPersistence(config, runtime);
  return createApiFootballProvider(config, persistence);
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

function fixtureMetadataClaim(fixture: Fixture): string {
  return `API-Football lists fixture ${fixture.providerFixtureId} as ${fixture.status} with scheduled kickoff ${fixture.scheduledAt}.`;
}

function redactErrorMessage(error: string): string {
  const redacted = redactSecrets(error);
  return typeof redacted === 'string' ? redacted : 'Agentic research failed before structured JSON was returned.';
}

function prependMissingSource(sources: SourceRecord[] | undefined, source: SourceRecord): SourceRecord[] {
  const existing = Array.isArray(sources) ? sources : [];
  return existing.some((item) => item.id === source.id) ? existing : [source, ...existing];
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
