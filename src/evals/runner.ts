import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { AgentConfig } from '../config.js';
import type { Fixture } from '../domain/fixtures.js';
import type { OddsQuote } from '../domain/odds.js';
import { calibrationPlot } from '../analytics/calibration-plot.js';
import { buildLeaderboard } from '../analytics/leaderboard.js';
import { consensusFairPrices } from '../markets/fair-price.js';
import { createToolRegistry } from '../tools/index.js';
import type { RuntimeContext } from '../runtime/context.js';
import { stableStringify, writeArtifact } from '../runtime/artifacts.js';
import { executeRunPipeline } from '../runtime/pipeline.js';
import { redactSecrets } from '../permissions/redaction.js';
import { certificationHash, type CertificationCheck } from './metrics.js';

export interface CertificationResult {
  ok: boolean;
  profile: string;
  manifestPath: string;
  hash: string;
  checks: CertificationCheck[];
}

const REQUIRED_SKILLS = [
  'research-fixture-v1',
  'score-prediction-v1',
  'build-parlay-v1',
  'validate-settlement-v1',
  'devig-and-fairprice-v1',
  'line-movement-tracker-v1',
  'lineup-confirmation-gate-v1',
  'research-fixture-v2',
  'score-prediction-v2',
  'ensemble-disagreement-v1',
  'correlation-model-v1',
  'parlay-candidate-generator-v1',
  'parlay-ranker-v1',
  'validation-clv-v1',
  'calibration-monitor-v1',
];

export async function runCertification(config: AgentConfig, runtime: RuntimeContext, profile = 'ci-smoke'): Promise<CertificationResult> {
  const checks: CertificationCheck[] = [];
  const replay = await runReplayPipelineCheck(config, runtime).catch((err) => ({
    name: 'replay-pipeline-evidence-pack-v2',
    ok: false,
    details: err instanceof Error ? err.message : String(err),
  } satisfies CertificationCheck));
  const registry = createToolRegistry({ config, runtime });
  const tools = registry.listTools();
  checks.push({
    name: 'tools-have-required-registry-attributes',
    ok: tools.every((tool) => Boolean(
      tool.metadata
      && tool.schema
      && typeof tool.policy === 'function'
      && typeof tool.redaction === 'function'
      && typeof tool.audit === 'function'
      && tool.timeoutMs
      && tool.risk
      && typeof tool.executor === 'function',
    )),
    details: tools.map((tool) => tool.name),
  });
  checks.push({
    name: 'openrouter-server-tools-not-registered',
    ok: tools.every((tool) => !tool.name.startsWith('openrouter:')),
  });
  checks.push({
    name: 'mutating-tools-require-approval',
    ok: tools.filter((tool) => tool.metadata.mutatesFilesystem || tool.metadata.runsShell)
      .every((tool) => tool.metadata.requiresApproval !== 'never'),
  });
  checks.push({
    name: 'skills-versioned-with-tests',
    ok: REQUIRED_SKILLS.every((skill) => skillComplete(skill)),
    details: REQUIRED_SKILLS,
  });
  checks.push({
    name: 'skill-prompt-hashes-match-manifests',
    ok: REQUIRED_SKILLS.every((skill) => skillPromptHashMatches(skill)),
    details: REQUIRED_SKILLS.map((skill) => ({ skill, promptSha256: promptHash(skill) })),
  });
  checks.push({
    name: 'replay-fixture-present',
    ok: existsSync(resolve('fixtures/replays/ci-smoke.json')),
  });
  checks.push(replayMarketAnalyticsCheck());
  checks.push(replay);
  checks.push(secretLeakCheck());
  checks.push(predictionContractCheck());
  checks.push(handoffDisclaimerCheck());
  checks.push(calibrationAndLeaderboardCheck());
  checks.push({
    name: 'no-real-credentials-required',
    ok: !config.apiFootballKey && !config.databaseUrl,
  });
  checks.push({
    name: 'manifest-v2-contract-covered',
    ok: Boolean(replay.ok && (replay.details as any)?.manifestContract?.ok),
    details: (replay.details as any)?.manifestContract ?? ['sources', 'claims', 'approvals', 'gates', 'hashes', 'reproduction', 'governanceScorecard'],
  });
  checks.push({
    name: 'analytical-only-disclaimer-required',
    ok: Boolean(replay.ok && (replay.details as any)?.manifestContract?.handoffDisclaimer),
    details: (replay.details as any)?.manifestContract?.handoffDisclaimer,
  });

  const hash = certificationHash(checks);
  const goldenPath = resolve('fixtures/replays/ci-smoke.golden.json');
  if (existsSync(goldenPath)) {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf-8')) as { hash?: string };
    checks.push({
      name: 'golden-manifest-hash-matches',
      ok: golden.hash === hash,
      details: { expected: golden.hash, actual: hash },
    });
  } else {
    checks.push({
      name: 'golden-manifest-present',
      ok: false,
      details: goldenPath,
    });
  }
  const finalHash = certificationHash(checks);
  const root = resolve(config.artifactRoot, 'certification', profile);
  mkdirSync(root, { recursive: true });
  const manifestPath = join(root, 'manifest.json');
  const manifest = {
    manifestVersion: 1,
    profile,
    generatedAt: '1970-01-01T00:00:00.000Z',
    deterministic: true,
    replayFixture: 'fixtures/replays/ci-smoke.json',
    hash: finalHash,
    checks,
  };
  writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
  return { ok: checks.every((check) => check.ok), profile, manifestPath, hash: finalHash, checks };
}

function skillComplete(skill: string): boolean {
  const dir = resolve('skills', skill);
  if (!existsSync(join(dir, 'skill.json')) || !existsSync(join(dir, 'prompt.md')) || !existsSync(join(dir, 'output.schema.json'))) return false;
  const tests = join(dir, 'tests');
  return existsSync(tests) && readdirSync(tests).length > 0 && validJson(join(dir, 'skill.json'));
}

function skillPromptHashMatches(skill: string): boolean {
  const dir = resolve('skills', skill);
  if (!validJson(join(dir, 'skill.json')) || !existsSync(join(dir, 'prompt.md'))) return false;
  const manifest = JSON.parse(readFileSync(join(dir, 'skill.json'), 'utf-8')) as { promptSha256?: unknown };
  return typeof manifest.promptSha256 === 'string' && manifest.promptSha256 === promptHash(skill);
}

function promptHash(skill: string): string {
  const path = resolve('skills', skill, 'prompt.md');
  if (!existsSync(path)) return 'missing';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function replayMarketAnalyticsCheck(): CertificationCheck {
  try {
    const replay = JSON.parse(readFileSync(resolve('fixtures/replays/ci-smoke.json'), 'utf-8')) as {
      odds?: Array<{ bookmaker?: string; selection: string; odds: number }>;
    };
    const fair = consensusFairPrices((replay.odds ?? []).map((quote) => ({
      bookmaker: quote.bookmaker,
      selection: quote.selection,
      odds: quote.odds,
    })));
    const probabilitySum = fair.reduce((sum, item) => sum + item.marketFairProbability, 0);
    return {
      name: 'replay-market-analytics-devigged',
      ok: fair.length >= 2 && Math.abs(probabilitySum - 1) < 1e-9 && fair.every((item) => item.bookmakerCount >= 3),
      details: { selections: fair.length, probabilitySum, fair },
    };
  } catch (err) {
    return {
      name: 'replay-market-analytics-devigged',
      ok: false,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runReplayPipelineCheck(config: AgentConfig, runtime: RuntimeContext): Promise<CertificationCheck> {
  const replayConfig: AgentConfig = {
    ...config,
    apiFootball: {
      ...config.apiFootball,
      defaultMarkets: ['h2h'],
      lowOddsThreshold: 1.4,
    },
  };
  const replay = JSON.parse(readFileSync(resolve('fixtures/replays/ci-smoke.json'), 'utf-8')) as {
    date: string;
    fixtureId: string;
  };
  const runId = 'ci-smoke-replay-run';
  rmSync(resolve(config.artifactRoot, 'runs', runId), { recursive: true, force: true });
  rmSync(resolve(config.artifactRoot, 'evidence-packs', runId), { recursive: true, force: true });
  rmSync(resolve(config.artifactRoot, 'handoffs', `${runId}.md`), { force: true });
  const generatedAt = new Date('2026-05-03T12:00:00.000Z');
  const fixture: Fixture = {
    id: 'fixture-ci-smoke',
    provider: 'api-football',
    providerFixtureId: replay.fixtureId,
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    scheduledAt: '2026-05-03T18:00:00.000Z',
    status: 'scheduled',
    includedByFilters: ['included-by-manual-query'],
    createdAt: generatedAt.toISOString(),
    updatedAt: generatedAt.toISOString(),
  };
  const odds: OddsQuote[] = [
    {
      fixtureId: fixture.id,
      market: 'h2h',
      selection: 'home',
      price: 1.33,
      impliedProbability: 1 / 1.33,
      bookmaker: 'replay-a',
      capturedAt: generatedAt.toISOString(),
      sourceSnapshotId: 'provider-snapshot-ci-smoke',
    },
    {
      fixtureId: fixture.id,
      market: 'h2h',
      selection: 'away',
      price: 3.2,
      impliedProbability: 1 / 3.2,
      bookmaker: 'replay-a',
      capturedAt: generatedAt.toISOString(),
      sourceSnapshotId: 'provider-snapshot-ci-smoke',
    },
  ];
  const result = await executeRunPipeline(replayConfig, {
    date: replay.date,
    runId,
    web: 'cached',
    validate: 'force',
  }, runtime, {
    now: () => generatedAt,
    createRunId: () => runId,
    discoverFixtures: async () => ({
      fixtures: [fixture],
      evaluations: [{
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        includedReasons: ['included-by-manual-query'],
        excludedReasons: [],
        eligible: true,
      }],
      requestedLeagues: [{ providerCompetitionId: '1', season: 2026, name: 'CI Smoke League' }],
      requestedTeams: [],
    }),
    fetchOddsSnapshot: async () => ({
      fixtureId: fixture.id,
      providerFixtureId: fixture.providerFixtureId,
      oddsSnapshotId: 'odds-snapshot-ci-smoke',
      providerSnapshotId: 'provider-snapshot-ci-smoke',
      capturedAt: generatedAt.toISOString(),
      bookmakerCount: 1,
      payloadHash: 'ci-smoke-replay',
      quoteRecordIds: {
        'replay-a|h2h|home|': 'odds-quote-ci-smoke-home',
        'replay-a|h2h|away|': 'odds-quote-ci-smoke-away',
      },
      quotes: odds,
    }),
    researchFixture: async (_cfg, _input, rt) => {
      const bundle = {
        id: 'research-bundle-ci-smoke',
        runId,
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        sources: [{
          id: 'source-ci-smoke',
          type: 'provider-snapshot' as const,
          snapshotId: 'provider-snapshot-ci-smoke',
          title: 'Replay provider snapshot',
          capturedAt: generatedAt.toISOString(),
        }],
        evidenceItems: [{
          id: 'evidence-ci-smoke-1',
          sourceId: 'source-ci-smoke',
          claimIds: ['claim-ci-smoke'],
          summary: 'Replay fixture has a low-odds home selection.',
          confidence: 0.9,
        }, {
          id: 'evidence-ci-smoke-2',
          sourceId: 'source-ci-smoke',
          claimIds: ['claim-ci-smoke'],
          summary: 'Replay odds include linked provider context.',
          confidence: 0.8,
        }],
        claims: [{
          id: 'claim-ci-smoke',
          statement: 'The replay fixture has enough provider evidence for scoring.',
          subject: { type: 'market' as const, market: 'h2h' },
          supportLevel: 'supported' as const,
          evidenceIds: ['evidence-ci-smoke-1', 'evidence-ci-smoke-2'],
          conflictStatus: 'none' as const,
        }],
        gateResult: { verdict: 'promotable' as const, reasons: ['replay research complete'], warnings: [] },
        providerAgentic: 'codex' as const,
        model: config.model,
        promptVersion: 'research-fixture-v2',
        createdAt: generatedAt.toISOString(),
        warnings: [],
      };
      const artifactPath = writeArtifact(replayConfig, rt.runId ?? runId, 'research-bundle.json', bundle);
      return { ok: true, bundle, gateResult: bundle.gateResult, artifactPath };
    },
    scoreFixture: async (_cfg, _input, rt) => {
      const payload = {
        ok: true,
        runId,
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        gateResult: { verdict: 'promotable', reasons: ['prediction gates passed'], warnings: [] },
        predictions: [{
        id: 'prediction-ci-smoke',
        runId,
        fixtureId: fixture.id,
        providerFixtureId: fixture.providerFixtureId,
        market: 'h2h',
        selection: 'home',
        probability: 0.82,
        modelProbability: 0.82,
        odds: 1.33,
        impliedProbability: 1 / 1.33,
        marketImpliedProbability: 0.75,
        marketFairProbability: 0.72,
        edge: 0.1,
        oddsSnapshotId: 'odds-snapshot-ci-smoke',
        oddsQuoteId: 'odds-quote-ci-smoke-home',
        researchBundleId: 'research-bundle-ci-smoke',
        evidenceIds: ['evidence-ci-smoke-1', 'evidence-ci-smoke-2'],
        claimIds: ['claim-ci-smoke'],
        rationale: 'Replay prediction with positive edge and linked evidence.',
        blockers: [],
        promotable: true,
        warnings: [],
        providerAgentic: 'codex',
        model: config.model,
        promptVersion: 'score-prediction-v1',
        scoringRuleVersion: 'scoring-v1',
        confidence: 0.9,
        quality: 'high',
        confidenceBand: 'high',
        status: 'promotable',
        generatedAt: generatedAt.toISOString(),
      }],
      };
      writeArtifact(replayConfig, rt.runId ?? runId, 'predictions.json', payload);
      return payload as any;
    },
    buildParlay: async () => ({
      ok: true,
      runId,
      date: replay.date,
      gateResult: { verdict: 'promotable', reasons: ['all parlay gates passed'], warnings: [] },
      build: {
        parlay: {
          id: 'parlay-ci-smoke',
          sourceRunId: runId,
          legs: [{
            predictionId: 'prediction-ci-smoke',
            fixtureId: fixture.id,
            market: 'h2h',
            selection: 'home',
            odds: 1.33,
          }],
          aggregateConfidence: 0.9,
          aggregateQuality: 0.9,
          rationale: 'Replay parlay candidate for certification only.',
          warnings: [],
          status: 'promotable',
          generatedAt: generatedAt.toISOString(),
        },
        evaluations: [],
        config: {},
      },
      artifactPath: '',
    } as any),
    validateRun: async (_cfg, _input, rt) => {
      const payload = {
        ok: true,
        runId,
        target: { date: replay.date },
        gateResult: { verdict: 'promotable', reasons: ['replay validation complete'], warnings: [] },
        validations: [{
        id: 'validation-ci-smoke',
        runId,
        predictionId: 'prediction-ci-smoke',
        status: 'won',
        outcome: { status: 'won', evaluatedAt: generatedAt.toISOString(), settlementRuleVersion: 'settlement-v1' },
        evaluatedAt: generatedAt.toISOString(),
      }],
      };
      writeArtifact(replayConfig, rt.runId ?? runId, 'validations.json', payload);
      return payload as any;
    },
  });
  const manifest = JSON.parse(readFileSync(result.evidencePackPath, 'utf-8'));
  const manifestContract = validateEvidencePackV2(manifest);
  const spanContract = validateRunSpans(resolve(config.artifactRoot, 'runs', runId, 'spans.jsonl'));
  return {
    name: 'replay-pipeline-evidence-pack-v2',
    ok: result.ok && result.verdict === 'promotable' && manifestContract.ok && spanContract.ok,
    details: {
      verdict: result.verdict,
      steps: result.steps.map((step) => ({ name: step.name, verdict: step.verdict, ok: step.ok })),
      manifestContract,
      spanContract,
      counts: {
        sources: manifest.sources?.length ?? 0,
        claims: manifest.claims?.length ?? 0,
        evidenceItems: manifest.evidenceItems?.length ?? 0,
        predictions: manifest.predictions?.length ?? 0,
        validations: manifest.validations?.length ?? 0,
      },
    },
  };
}

function validateRunSpans(path: string): { ok: boolean; names: string[]; kinds: string[]; missingNames: string[]; missingKinds: string[] } {
  const spans = existsSync(path)
    ? readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as { name?: unknown; kind?: unknown })
    : [];
  const names = spans.map((span) => String(span.name ?? '')).filter(Boolean);
  const kinds = [...new Set(spans.map((span) => String(span.kind ?? '')).filter(Boolean))].sort();
  const requiredNames = [
    'policy.evaluate',
    'fixtures.fetch',
    'odds.fetch',
    'low_odds.scan',
    'research.web_search',
    'research.agent_call',
    'retrieval.quality',
    'score.agent_call',
    'parlay.build',
    'validation.settle',
    'evidence_pack.export',
  ];
  const requiredKinds = ['gate', 'llm', 'policy', 'provider', 'retrieval'];
  const missingNames = requiredNames.filter((name) => !names.includes(name));
  const missingKinds = requiredKinds.filter((kind) => !kinds.includes(kind));
  return {
    ok: missingNames.length === 0 && missingKinds.length === 0,
    names,
    kinds,
    missingNames,
    missingKinds,
  };
}

function validateEvidencePackV2(manifest: any): Record<string, unknown> & { ok: boolean; handoffDisclaimer: boolean } {
  const requiredArrays = ['sources', 'claims', 'evidenceItems', 'predictions', 'validations', 'approvals', 'gates', 'files'];
  const requiredObjects = ['hashes', 'reproduction', 'governanceScorecard', 'handoff'];
  const missing = [
    ...requiredArrays.filter((key) => !Array.isArray(manifest?.[key])),
    ...requiredObjects.filter((key) => !manifest?.[key] || typeof manifest[key] !== 'object' || Array.isArray(manifest[key])),
  ];
  const handoffDisclaimer = typeof manifest?.handoff?.disclaimer === 'string'
    && /uso analitico/i.test(manifest.handoff.disclaimer)
    && /no constituye/i.test(manifest.handoff.disclaimer);
  const reproduction = typeof manifest?.reproduction?.command === 'string'
    && manifest.reproduction.command.includes('pnpm gana run');
  const predictionContracts = (manifest?.predictions ?? []).every((prediction: any) => (
    prediction.evidenceIds?.length
    && typeof prediction.edge === 'number'
    && typeof prediction.confidenceBand === 'string'
  ));
  return {
    ok: missing.length === 0
      && manifest?.manifestVersion === 2
      && manifest?.analyticalOnly === true
      && manifest?.monetaryActions === 'forbidden-by-policy'
      && handoffDisclaimer
      && reproduction
      && predictionContracts,
    missing,
    handoffDisclaimer,
    reproduction,
    predictionContracts,
  };
}

function secretLeakCheck(): CertificationCheck {
  const leaked = {
    authorization: 'Bearer sk-test-secret1234567890',
    url: 'mysql://user:pass@example.test/db?api_key=abc123',
    nested: 'GITHUB_TOKEN=ghp_secretsecretsecret',
  };
  const redacted = stableStringify(redactSecrets(leaked));
  return {
    name: 'secret-leak-redaction-breaks-certify-fixture',
    ok: redacted.includes('[REDACTED]')
      && !redacted.includes('sk-test-secret')
      && !redacted.includes('ghp_secret')
      && !redacted.includes('api_key=abc123'),
    details: redacted,
  };
}

function predictionContractCheck(): CertificationCheck {
  const valid = validatePredictionContract({
    id: 'prediction-ok',
    edge: 0.04,
    confidenceBand: 'high',
    evidenceIds: ['evidence-1'],
  });
  const missingEvidence = validatePredictionContract({ id: 'prediction-bad', edge: 0.04, confidenceBand: 'high', evidenceIds: [] });
  const missingEdge = validatePredictionContract({ id: 'prediction-bad', confidenceBand: 'high', evidenceIds: ['evidence-1'] });
  const missingBand = validatePredictionContract({ id: 'prediction-bad', edge: 0.04, evidenceIds: ['evidence-1'] });
  return {
    name: 'negative-prediction-contract-fixtures-fail',
    ok: valid.ok && !missingEvidence.ok && !missingEdge.ok && !missingBand.ok,
    details: { valid, missingEvidence, missingEdge, missingBand },
  };
}

function validatePredictionContract(prediction: any): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!Array.isArray(prediction.evidenceIds) || prediction.evidenceIds.length === 0) missing.push('evidenceIds');
  if (typeof prediction.edge !== 'number') missing.push('edge');
  if (typeof prediction.confidenceBand !== 'string') missing.push('confidenceBand');
  return { ok: missing.length === 0, missing };
}

function handoffDisclaimerCheck(): CertificationCheck {
  const good = validateEvidencePackV2({
    manifestVersion: 2,
    analyticalOnly: true,
    monetaryActions: 'forbidden-by-policy',
    sources: [],
    claims: [],
    evidenceItems: [],
    predictions: [],
    validations: [],
    approvals: [],
    gates: [],
    files: [],
    hashes: {},
    reproduction: { command: 'pnpm gana run --date 2026-05-03 --web cached --validate auto' },
    governanceScorecard: {},
    handoff: { disclaimer: 'uso analitico, no constituye recomendacion de apuesta, no garantiza resultado' },
  });
  const bad = validateEvidencePackV2({
    ...good,
    manifestVersion: 2,
    analyticalOnly: true,
    monetaryActions: 'forbidden-by-policy',
    sources: [],
    claims: [],
    evidenceItems: [],
    predictions: [],
    validations: [],
    approvals: [],
    gates: [],
    files: [],
    hashes: {},
    reproduction: { command: 'pnpm gana run --date 2026-05-03 --web cached --validate auto' },
    governanceScorecard: {},
    handoff: {},
  });
  return {
    name: 'negative-handoff-disclaimer-fixture-fails',
    ok: good.ok && !bad.ok,
    details: { good, bad },
  };
}

function calibrationAndLeaderboardCheck(): CertificationCheck {
  const outcomes = [
    { probability: 0.8, outcome: 1 as const, promptVersion: 'score-prediction-v1', modelId: 'gpt-5.4-mini', market: 'h2h', league: 'ci' },
    { probability: 0.3, outcome: 0 as const, promptVersion: 'score-prediction-v1', modelId: 'gpt-5.4-mini', market: 'h2h', league: 'ci' },
    { probability: 0.7, outcome: 1 as const, promptVersion: 'score-prediction-v1', modelId: 'gpt-5.4-mini', market: 'btts', league: 'ci' },
  ];
  const calibration = calibrationPlot(outcomes);
  const leaderboard = buildLeaderboard(outcomes);
  return {
    name: 'calibration-plot-and-leaderboard-reproducible',
    ok: calibration.length > 0 && leaderboard.length > 0 && leaderboard.every((row) => row.n > 0),
    details: { calibration, leaderboard },
  };
}

function validJson(path: string): boolean {
  try {
    JSON.parse(readFileSync(path, 'utf-8'));
    return true;
  } catch {
    return false;
  }
}
