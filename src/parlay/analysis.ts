import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '../config.js';
import { writeArtifact } from '../runtime/artifacts.js';
import { getPrismaClient } from '../storage/db.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';

export interface RunParlayAnalysisInput {
  date?: string;
  runId?: string;
  runIds?: string[];
  top?: number;
  bankrollUnits?: number;
  /** @deprecated use bankrollUnits. Kept as a CLI/API compatibility alias for older callers. */
  bankUnits?: number;
  maxPortfolioExposure?: number;
  maxParlayExposure?: number;
  profileScope?: ParlayAnalysisProfileScope;
}

export type ParlayAnalysisProfileScope = 'core' | 'all';

export interface ParlayAnalysisRunResult {
  ok: boolean;
  runId: string;
  date?: string;
  sourceRunId?: string;
  analyzed: number;
  top: ParlayAnalysisRecommendation[];
  diagnostics: ParlayAnalysisDiagnostics;
  artifactPath?: string;
  error?: string;
}

export interface ParlayAnalysisRecommendation {
  rank: number;
  parlayId: string;
  sourceRunId: string | null;
  profile: string;
  validationStatus: string;
  harnessStatus: string;
  combinedOdds: number;
  aggregateConfidence: number;
  adjustedProbability: number;
  expectedEdge: number;
  score: number;
  exposure: {
    units: number;
    percentOfAnalyticalBankroll: number;
    policy: string;
  };
  /** @deprecated use exposure. Kept for CLI/API compatibility with older artifacts. */
  stake: {
    units: number;
    percentOfBankroll: number;
    policy: string;
  };
  bankerLegs: ParlayAnalysisBankerLeg[];
  reasons: string[];
  riskFlags: string[];
  legs: ParlayAnalysisLeg[];
}

export interface ParlayAnalysisBankerLeg {
  predictionId: string;
  fixtureId: string;
  fixture: string;
  display?: ParlayAnalysisLegDisplay;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  confidence: number | null;
  reason: string;
}

export interface ParlayAnalysisLeg {
  predictionId: string;
  fixtureId: string;
  fixture: string;
  display?: ParlayAnalysisLegDisplay;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  confidence: number | null;
  validationStatus: string;
  warnings: string[];
  banker: boolean;
  bankerReason?: string;
}

export interface ParlayAnalysisLegDisplay {
  fixtureLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName?: string;
  kickoffLocal?: string;
}

export interface ParlayAnalysisDiagnostics {
  generatedAt: string;
  analyticalArtifactOnly: true;
  executionCapability: 'none';
  profileScope: ParlayAnalysisProfileScope;
  rawAnalyzed: number;
  profileScopedAnalyzed: number;
  cohortSourceRunId?: string;
  exposurePolicy: {
    analyticalUnits: number;
    maxPortfolioExposure: number;
    maxParlayExposure: number;
    unitLabel: 'analytical-units';
  };
  /** @deprecated use exposurePolicy. Kept for compatibility with existing artifacts/tests. */
  bankrollPolicy: {
    bankrollUnits: number;
    maxPortfolioStake: number;
    maxParlayStake: number;
    unitLabel: 'analytical-units';
  };
  universe: {
    won: number;
    lost: number;
    voided: number;
    pending: number;
    unvalidated: number;
    settled: number;
    hitRate: number | null;
  };
  selected: {
    won: number;
    lost: number;
    voided: number;
    pending: number;
    unvalidated: number;
    settled: number;
    hitRate: number | null;
    totalStakeUnits: number;
    totalStakePercentOfBankroll: number;
    totalExposureUnits: number;
    totalExposurePercent: number;
  };
  rejected: Array<{ parlayId: string; reasons: string[] }>;
}

export interface ParlayAnalysisDependencies {
  db?: ParlayAnalysisDb;
  now?: () => Date;
  writeArtifact?: (runId: string, name: string, payload: unknown) => string;
}

export interface ParlayAnalysisDb {
  parlay: {
    findMany(args: unknown): Promise<unknown[]>;
  };
}

interface Candidate {
  row: any;
  parlayId: string;
  sourceRunId: string | null;
  profile: string;
  validationStatus: string;
  harnessStatus: string;
  combinedOdds: number;
  aggregateConfidence: number;
  adjustedProbability: number;
  expectedEdge: number;
  score: number;
  rawStakeFraction: number;
  reasons: string[];
  riskFlags: string[];
  legs: ParlayAnalysisLeg[];
  rejectedReasons: string[];
}

const DEFAULT_TOP = 5;
const DEFAULT_BANKROLL_UNITS = 100;
const DEFAULT_MAX_PORTFOLIO_EXPOSURE = 0.08;
const DEFAULT_MAX_PARLAY_EXPOSURE = 0.025;
const DEFAULT_PROFILE_SCOPE: ParlayAnalysisProfileScope = 'core';
const CORE_ANALYSIS_PROFILES = new Set(['default', 'balanced', 'high-conviction', 'parlay-diamante']);
const PURGED_ANALYSIS_PROFILES = new Set(['default', 'review', 'totals', 'market-diverse', 'parlay-oro', 'aggressive']);
const MAX_RECOMMENDABLE_COMBINED_ODDS = 3.0;
const MAX_RECOMMENDABLE_LEGS = 3;

export async function runParlayAnalysis(
  config: AgentConfig,
  input: RunParlayAnalysisInput,
  runtime: { runId?: string },
  deps: ParlayAnalysisDependencies = {},
): Promise<ParlayAnalysisRunResult> {
  const runId = runtime.runId ?? randomUUID();
  runtime.runId = runId;
  const now = deps.now ?? (() => new Date());
  const generatedAt = now();
  const artifactWriter = deps.writeArtifact ?? ((id, name, payload) => writeArtifact(config, id, name, payload));
  const top = clampInteger(input.top ?? DEFAULT_TOP, 1, 25);
  const bankrollUnits = positiveNumber(input.bankrollUnits ?? input.bankUnits ?? DEFAULT_BANKROLL_UNITS, 'bankroll units');
  const maxPortfolioExposure = clampProbability(input.maxPortfolioExposure ?? DEFAULT_MAX_PORTFOLIO_EXPOSURE, 'max portfolio exposure');
  const maxParlayExposure = clampProbability(input.maxParlayExposure ?? DEFAULT_MAX_PARLAY_EXPOSURE, 'max parlay exposure');
  const profileScope = parseProfileScope(input.profileScope);

  const analysisRunIds = normalizeRunIds(input.runIds, input.runId);
  if (!input.date && analysisRunIds.length === 0) {
    return { ok: false, runId, analyzed: 0, top: [], diagnostics: emptyDiagnostics(generatedAt, bankrollUnits, maxPortfolioExposure, maxParlayExposure, profileScope), error: 'parlay analyze requires --date YYYY-MM-DD, --run-id RUN_ID, or --run-ids RUN_ID_A,RUN_ID_B.' };
  }
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, runId, date: input.date, sourceRunId: input.runId, analyzed: 0, top: [], diagnostics: emptyDiagnostics(generatedAt, bankrollUnits, maxPortfolioExposure, maxParlayExposure, profileScope), error: 'parlay analyze requires --date YYYY-MM-DD.' };
  }
  if (!deps.db && !config.databaseUrl) {
    return { ok: false, runId, date: input.date, sourceRunId: input.runId, analyzed: 0, top: [], diagnostics: emptyDiagnostics(generatedAt, bankrollUnits, maxPortfolioExposure, maxParlayExposure, profileScope), error: 'DATABASE_URL is required to analyze persisted parlays.' };
  }

  const db = deps.db ?? getPrismaClient() as unknown as ParlayAnalysisDb;
  const rawRows = await db.parlay.findMany(buildParlayQuery(config, input));
  const profileRows = filterRowsByProfileScope(rawRows, profileScope);
  const profileCandidates = profileRows.map(toCandidate);
  const cohort = selectCandidatesForAnalysis(profileCandidates, profileScope);
  const candidates = cohort.candidates.sort((a, b) => b.score - a.score || a.combinedOdds - b.combinedOdds);
  markDuplicateLegSetRejections(candidates);
  const eligible = candidates.filter((candidate) => !candidate.rejectedReasons.length).slice(0, top);
  const recommendations = allocateStake(eligible, bankrollUnits, maxPortfolioExposure, maxParlayExposure);
  const diagnostics = buildDiagnostics(generatedAt, bankrollUnits, maxPortfolioExposure, maxParlayExposure, profileScope, rawRows.length, profileRows.length, cohort.sourceRunId, candidates, recommendations);
  const artifactPath = artifactWriter(runId, 'parlay-analysis.json', {
    runId,
    date: input.date,
    sourceRunId: analysisRunIds.join(',') || input.runId,
    generatedAt: generatedAt.toISOString(),
    analyzed: candidates.length,
    rawAnalyzed: rawRows.length,
    profileScopedAnalyzed: profileRows.length,
    cohortSourceRunId: cohort.sourceRunId,
    profileScope,
    top: recommendations,
    diagnostics,
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  });

  return {
    ok: true,
    runId,
    date: input.date,
    sourceRunId: analysisRunIds.join(',') || input.runId,
    analyzed: candidates.length,
    top: recommendations,
    diagnostics,
    artifactPath,
  };
}

function buildParlayQuery(config: AgentConfig, input: RunParlayAnalysisInput): unknown {
  const where: Record<string, unknown> = {};
  const runIds = normalizeRunIds(input.runIds, input.runId);
  if (runIds.length > 1) where.runId = { in: runIds };
  else if (runIds.length === 1) where.runId = runIds[0];
  if (input.date) {
    const window = fixtureDateRange(input.date, config.apiFootball.timezone);
    const legInWindow = {
      fixture: {
        scheduledAt: {
          gte: window.start,
          lt: window.end,
        },
      },
    };
    where.AND = [
      { legs: { some: legInWindow } },
      { legs: { every: legInWindow } },
    ];
  }
  return {
    where,
    include: {
      validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      legs: {
        orderBy: { legIndex: 'asc' },
        include: {
          fixture: {
            select: {
              id: true,
              scheduledAt: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
              competition: { select: { name: true } },
            },
          },
          prediction: {
            select: {
              confidence: true,
              warnings: true,
              metadata: true,
              validationArtifacts: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
    take: 500,
  };
}

function normalizeRunIds(runIds: string[] | undefined, runId?: string): string[] {
  return Array.from(new Set([
    ...(runIds ?? []),
    ...(runId ? [runId] : []),
  ].map((item) => item.trim()).filter(Boolean)));
}

function toCandidate(row: unknown): Candidate {
  const parlay = row as any;
  const combinedOdds = numberValue(parlay.combinedOdds);
  const aggregateConfidence = clamp(numberValue(parlay.aggregateConfidence), 0, 1);
  const profile = profileFromMetadata(parlay.metadata);
  const validationStatus = latestStatus(parlay.validationArtifacts);
  const legs = Array.isArray(parlay.legs) ? parlay.legs.map(toLeg) : [];
  const riskFlags = riskFlagsFor(parlay, profile, legs);
  const adjustedProbability = adjustedProbabilityFor(aggregateConfidence, combinedOdds, profile, riskFlags, legs.length);
  const expectedEdge = combinedOdds * adjustedProbability - 1;
  const rawStakeFraction = kellyFraction(adjustedProbability, combinedOdds);
  const rejectedReasons = rejectionReasonsFor(profile, combinedOdds, aggregateConfidence, expectedEdge, riskFlags, legs.length);
  const reasons = reasonsFor(profile, combinedOdds, aggregateConfidence, adjustedProbability, expectedEdge, riskFlags);

  return {
    row: parlay,
    parlayId: String(parlay.id ?? ''),
    sourceRunId: typeof parlay.runId === 'string' ? parlay.runId : null,
    profile,
    validationStatus,
    harnessStatus: typeof parlay.status === 'string' ? parlay.status : 'unknown',
    combinedOdds,
    aggregateConfidence,
    adjustedProbability,
    expectedEdge,
    score: scoreFor(combinedOdds, aggregateConfidence, adjustedProbability, expectedEdge, riskFlags, profile),
    rawStakeFraction,
    reasons,
    riskFlags,
    legs,
    rejectedReasons,
  };
}

function markDuplicateLegSetRejections(candidates: Candidate[]): void {
  const seenEligible = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.rejectedReasons.length) continue;
    const signature = candidateLegSetSignature(candidate);
    if (!signature) continue;
    if (seenEligible.has(signature)) {
      candidate.rejectedReasons.push('duplicate parlay leg set across source runs');
      candidate.riskFlags = [...new Set([...candidate.riskFlags, 'duplicate-leg-set'])];
      candidate.reasons = [...candidate.reasons, 'risk flags: duplicate-leg-set'];
      continue;
    }
    seenEligible.add(signature);
  }
}

function candidateLegSetSignature(candidate: Candidate): string {
  return candidate.legs
    .map((leg) => leg.predictionId)
    .filter(Boolean)
    .sort()
    .join('|');
}

function toLeg(leg: any): ParlayAnalysisLeg {
  const fixture = leg.fixture ?? {};
  const prediction = leg.prediction ?? {};
  const market = String(leg.marketKey ?? 'unknown');
  const selection = String(leg.selectionKey ?? 'unknown');
  const line = nullableNumber(leg.line);
  const odds = numberValue(leg.odds);
  const confidence = nullableNumber(prediction.confidence);
  const warnings = stringArray(prediction.warnings);
  const bankerReason = bankerReasonFor(market, odds, confidence, warnings);
  const homeTeamName = String(fixture.homeTeam?.name ?? 'Local');
  const awayTeamName = String(fixture.awayTeam?.name ?? 'Visita');
  const fixtureLabel = `${homeTeamName} vs ${awayTeamName}`;
  const kickoff = fixture.scheduledAt instanceof Date
    ? fixture.scheduledAt.toISOString()
    : typeof fixture.scheduledAt === 'string'
      ? new Date(fixture.scheduledAt).toISOString()
      : undefined;
  return {
    predictionId: String(leg.predictionId ?? ''),
    fixtureId: String(leg.fixtureId ?? fixture.id ?? ''),
    fixture: fixtureLabel,
    display: {
      fixtureLabel,
      homeTeamName,
      awayTeamName,
      ...(typeof fixture.competition?.name === 'string' ? { leagueName: fixture.competition.name } : {}),
      ...(kickoff ? { kickoffLocal: kickoff } : {}),
    },
    market,
    selection,
    line,
    odds,
    confidence,
    validationStatus: latestStatus(prediction.validationArtifacts),
    warnings,
    banker: Boolean(bankerReason),
    ...(bankerReason ? { bankerReason } : {}),
  };
}

function bankerReasonFor(market: string, odds: number, confidence: number | null, warnings: string[]): string | undefined {
  if (confidence === null || confidence < 0.9) return undefined;
  if (!Number.isFinite(odds) || odds > 1.2) return undefined;
  if (market === 'corners_over_under') return undefined;
  if (warnings.some((warning) => /stale (?:news|source|odds) source|stale odds|unverified corners/i.test(warning))) return undefined;
  return `banker leg: confidence ${round(confidence, 3)} with low odds ${round(odds, 3)}`;
}

function riskFlagsFor(parlay: any, profile: string, legs: ParlayAnalysisLeg[]): string[] {
  const flags: string[] = [];
  const metadata = parlay.metadata && typeof parlay.metadata === 'object' ? parlay.metadata : {};
  const warnings = stringArray(parlay.warnings);
  const text = [
    JSON.stringify(metadata),
    warnings.join('\n'),
    legs.flatMap((leg) => leg.warnings).join('\n'),
  ].join('\n');

  if (parlay.status === 'review-required') flags.push('review-required');
  if (PURGED_ANALYSIS_PROFILES.has(profile)) flags.push('historically-weak-profile');
  if (profile === 'parlay-oro' && (metadata?.candidateDiagnostics as any)?.expectedEdge < 0) flags.push('negative-portfolio-edge');
  if (/low[-_ ]liquidity|low liquidity/i.test(text)) flags.push('low-liquidity');
  if (/stale (?:news|source|odds) source|stale odds/i.test(text)) flags.push('stale-source');
  if (/low-liquidity h2h short favorite|low_liquidity_h2h_favorite/i.test(text)) flags.push('low-liquidity-h2h-favorite');
  if (legs.some((leg) => leg.market === 'h2h' && leg.odds <= 1.2 && leg.warnings.some((warning) => /low[-_ ]liquidity|single[-_ ]bookmaker/i.test(warning)))) {
    flags.push('low-liquidity-h2h-favorite');
  }
  if (legs.some((leg) => leg.market === 'corners_over_under' && !leg.warnings.some((warning) => /settlement[- ]reliable/i.test(warning)))) {
    flags.push('corners-unverified');
  }
  if (legs.length > 4) flags.push('many-legs');
  if (numberValue(parlay.combinedOdds) > 2.2) flags.push('high-combined-odds');

  return [...new Set(flags)];
}

function adjustedProbabilityFor(confidence: number, combinedOdds: number, profile: string, riskFlags: string[], legs: number): number {
  let probability = confidence * profileMultiplier(profile);
  if (combinedOdds <= 1.5) probability *= 1.03;
  if (combinedOdds > 2.2) probability *= 0.92;
  if (combinedOdds > 3.0) probability *= 0.84;
  if (legs > 4) probability *= 0.9;
  for (const flag of riskFlags) {
    if (flag === 'review-required') probability *= 0.94;
    if (flag === 'low-liquidity') probability *= 0.98;
    if (flag === 'stale-source') probability *= 0.7;
    if (flag === 'low-liquidity-h2h-favorite') probability *= profile === 'parlay-diamante' ? 0.97 : 0.55;
    if (flag === 'corners-unverified') probability *= 0.65;
    if (flag === 'negative-portfolio-edge') probability *= 0.65;
    if (flag === 'many-legs') probability *= 0.92;
    if (flag === 'high-combined-odds') probability *= 0.92;
  }
  return round(clamp(probability, 0.01, 0.99), 6);
}

function profileMultiplier(profile: string): number {
  switch (profile) {
    case 'low-odds-top': return 1.16;
    case 'parlay-diamante': return 1.2;
    case 'low-variance': return 1.06;
    case 'high-conviction': return 1.0;
    case 'balanced': return 1.0;
    case 'totals': return 0.82;
    case 'review': return 0.78;
    case 'parlay-oro': return 0.78;
    case 'default': return 0.88;
    default: return 0.86;
  }
}

function rejectionReasonsFor(profile: string, odds: number, confidence: number, expectedEdge: number, riskFlags: string[], legs: number): string[] {
  const reasons: string[] = [];
  if (!Number.isFinite(odds) || odds <= 1) reasons.push('invalid combined odds');
  if (!Number.isFinite(confidence) || confidence <= 0) reasons.push('invalid aggregate confidence');
  if (legs < 2) reasons.push('less than two legs');
  if (legs > MAX_RECOMMENDABLE_LEGS) reasons.push(`more than ${MAX_RECOMMENDABLE_LEGS} legs after parlay purge`);
  if (odds > MAX_RECOMMENDABLE_COMBINED_ODDS) reasons.push(`combined odds above purge ceiling ${MAX_RECOMMENDABLE_COMBINED_ODDS}`);
  if (PURGED_ANALYSIS_PROFILES.has(profile)) reasons.push(`profile ${profile} is purged from final recommendations`);
  if (expectedEdge <= 0) reasons.push('non-positive adjusted edge');
  if (riskFlags.includes('stale-source')) reasons.push('stale source risk');
  if (riskFlags.includes('corners-unverified')) reasons.push('unverified corners risk');
  if (riskFlags.includes('negative-portfolio-edge')) reasons.push('negative portfolio edge');
  if (riskFlags.includes('low-liquidity-h2h-favorite') && profile !== 'parlay-diamante') reasons.push('low-liquidity h2h short favorite');
  return [...new Set(reasons)];
}

function reasonsFor(profile: string, odds: number, confidence: number, probability: number, edge: number, riskFlags: string[]): string[] {
  const reasons = [
    `profile ${profile}`,
    `combined odds ${round(odds, 3)}`,
    `aggregate confidence ${round(confidence, 3)}`,
    `adjusted probability ${round(probability, 3)}`,
    `adjusted edge ${round(edge, 3)}`,
  ];
  if (riskFlags.length) reasons.push(`risk flags: ${riskFlags.join(', ')}`);
  return reasons;
}

function scoreFor(odds: number, confidence: number, probability: number, edge: number, riskFlags: string[], profile: string): number {
  const profileBonus = profile === 'parlay-diamante' ? 0.1 : profile === 'low-odds-top' ? 0.08 : profile === 'low-variance' ? 0.03 : 0;
  const oddsPenalty = odds > 2.2 ? 0.08 : odds > 3 ? 0.16 : 0;
  const riskPenalty = riskFlags.length * 0.06;
  return round((probability * 0.55) + (Math.max(0, edge) * 0.25) + (confidence * 0.2) + profileBonus - oddsPenalty - riskPenalty, 6);
}

function kellyFraction(probability: number, odds: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  const fraction = ((probability * odds) - 1) / b;
  return Math.max(0, fraction * 0.25);
}

function allocateStake(candidates: Candidate[], bankrollUnits: number, maxPortfolioExposure: number, maxParlayExposure: number): ParlayAnalysisRecommendation[] {
  const capped = candidates.map((candidate) => ({
    candidate,
    fraction: Math.min(candidate.rawStakeFraction, maxParlayExposure),
  }));
  const total = capped.reduce((sum, item) => sum + item.fraction, 0);
  const scale = total > maxPortfolioExposure && total > 0 ? maxPortfolioExposure / total : 1;
  return capped.map(({ candidate, fraction }, index) => {
    const percent = round(fraction * scale, 6);
    return {
      rank: index + 1,
      parlayId: candidate.parlayId,
      sourceRunId: candidate.sourceRunId,
      profile: candidate.profile,
      validationStatus: candidate.validationStatus,
      harnessStatus: candidate.harnessStatus,
      combinedOdds: round(candidate.combinedOdds, 6),
      aggregateConfidence: round(candidate.aggregateConfidence, 6),
      adjustedProbability: candidate.adjustedProbability,
      expectedEdge: round(candidate.expectedEdge, 6),
      score: candidate.score,
      exposure: {
        units: round(bankrollUnits * percent, 4),
        percentOfAnalyticalBankroll: percent,
        policy: 'fractional-kelly-capped-analytical-exposure',
      },
      stake: {
        units: round(bankrollUnits * percent, 4),
        percentOfBankroll: percent,
        policy: 'fractional-kelly-capped-analytical-stake',
      },
      bankerLegs: candidate.legs
        .filter((leg) => leg.banker)
        .map((leg) => ({
          predictionId: leg.predictionId,
          fixtureId: leg.fixtureId,
          fixture: leg.fixture,
          market: leg.market,
          selection: leg.selection,
          line: leg.line,
          odds: leg.odds,
          confidence: leg.confidence,
          reason: leg.bankerReason ?? 'banker leg',
        })),
      reasons: candidate.reasons,
      riskFlags: candidate.riskFlags,
      legs: candidate.legs,
    };
  });
}

function buildDiagnostics(
  generatedAt: Date,
  bankrollUnits: number,
  maxPortfolioExposure: number,
  maxParlayExposure: number,
  profileScope: ParlayAnalysisProfileScope,
  rawAnalyzed: number,
  profileScopedAnalyzed: number,
  cohortSourceRunId: string | undefined,
  candidates: Candidate[],
  recommendations: ParlayAnalysisRecommendation[],
): ParlayAnalysisDiagnostics {
  return {
    generatedAt: generatedAt.toISOString(),
    analyticalArtifactOnly: true,
    executionCapability: 'none',
    profileScope,
    rawAnalyzed,
    profileScopedAnalyzed,
    ...(cohortSourceRunId ? { cohortSourceRunId } : {}),
    exposurePolicy: {
      analyticalUnits: bankrollUnits,
      maxPortfolioExposure,
      maxParlayExposure,
      unitLabel: 'analytical-units',
    },
    bankrollPolicy: {
      bankrollUnits,
      maxPortfolioStake: maxPortfolioExposure,
      maxParlayStake: maxParlayExposure,
      unitLabel: 'analytical-units',
    },
    universe: summarizeStatuses(candidates.map((candidate) => candidate.validationStatus)),
    selected: {
      ...summarizeStatuses(recommendations.map((recommendation) => recommendation.validationStatus)),
      totalStakeUnits: round(recommendations.reduce((sum, recommendation) => sum + recommendation.stake.units, 0), 4),
      totalStakePercentOfBankroll: round(recommendations.reduce((sum, recommendation) => sum + recommendation.stake.percentOfBankroll, 0), 6),
      totalExposureUnits: round(recommendations.reduce((sum, recommendation) => sum + recommendation.exposure.units, 0), 4),
      totalExposurePercent: round(recommendations.reduce((sum, recommendation) => sum + recommendation.exposure.percentOfAnalyticalBankroll, 0), 6),
    },
    rejected: candidates
      .filter((candidate) => candidate.rejectedReasons.length)
      .slice(0, 100)
      .map((candidate) => ({ parlayId: candidate.parlayId, reasons: candidate.rejectedReasons })),
  };
}

function summarizeStatuses(statuses: string[]) {
  const won = statuses.filter((status) => status === 'won').length;
  const lost = statuses.filter((status) => status === 'lost').length;
  const voided = statuses.filter((status) => status === 'voided').length;
  const pending = statuses.filter((status) => status === 'pending').length;
  const unvalidated = statuses.filter((status) => status === 'unvalidated').length;
  const settled = won + lost;
  return {
    won,
    lost,
    voided,
    pending,
    unvalidated,
    settled,
    hitRate: settled ? round(won / settled, 6) : null,
  };
}

function emptyDiagnostics(
  generatedAt: Date,
  bankrollUnits: number,
  maxPortfolioExposure: number,
  maxParlayExposure: number,
  profileScope: ParlayAnalysisProfileScope,
): ParlayAnalysisDiagnostics {
  return {
    generatedAt: generatedAt.toISOString(),
    analyticalArtifactOnly: true,
    executionCapability: 'none',
    profileScope,
    rawAnalyzed: 0,
    profileScopedAnalyzed: 0,
    exposurePolicy: { analyticalUnits: bankrollUnits, maxPortfolioExposure, maxParlayExposure, unitLabel: 'analytical-units' },
    bankrollPolicy: { bankrollUnits, maxPortfolioStake: maxPortfolioExposure, maxParlayStake: maxParlayExposure, unitLabel: 'analytical-units' },
    universe: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null },
    selected: { won: 0, lost: 0, voided: 0, pending: 0, unvalidated: 0, settled: 0, hitRate: null, totalStakeUnits: 0, totalStakePercentOfBankroll: 0, totalExposureUnits: 0, totalExposurePercent: 0 },
    rejected: [],
  };
}

function profileFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 'default';
  const value = (metadata as any).portfolioProfile ?? (metadata as any).profile;
  return typeof value === 'string' && value.trim() ? value : 'default';
}

function parseProfileScope(value: unknown): ParlayAnalysisProfileScope {
  if (value === undefined || value === null || value === '') return DEFAULT_PROFILE_SCOPE;
  if (value === 'core' || value === 'all') return value;
  throw new Error('--profile-scope must be core or all.');
}

function filterRowsByProfileScope(rows: unknown[], scope: ParlayAnalysisProfileScope): unknown[] {
  if (scope === 'all') return rows;
  return rows.filter((row: any) => CORE_ANALYSIS_PROFILES.has(profileFromMetadata(row?.metadata)));
}

function selectCandidatesForAnalysis(candidates: Candidate[], scope: ParlayAnalysisProfileScope): { candidates: Candidate[]; sourceRunId?: string } {
  if (scope !== 'core' || candidates.length === 0) return { candidates };
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = logicalSourceRunId(candidate.row);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const [sourceRunId, selected] = [...groups.entries()].sort((a, b) =>
    eligibleCount(b[1]) - eligibleCount(a[1])
    || topScoreSum(b[1]) - topScoreSum(a[1])
    || b[1].length - a[1].length
    || latestGeneratedAt(b[1].map((candidate) => candidate.row)) - latestGeneratedAt(a[1].map((candidate) => candidate.row)),
  )[0] ?? ['unknown', candidates];
  return { candidates: selected, sourceRunId };
}

function eligibleCount(candidates: Candidate[]): number {
  return candidates.filter((candidate) => !candidate.rejectedReasons.length).length;
}

function topScoreSum(candidates: Candidate[]): number {
  return candidates
    .filter((candidate) => !candidate.rejectedReasons.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, DEFAULT_TOP)
    .reduce((sum, candidate) => sum + candidate.score, 0);
}

function logicalSourceRunId(row: unknown): string {
  const candidate = row as any;
  const metadata = candidate?.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {};
  return typeof metadata.sourceRunId === 'string' && metadata.sourceRunId ? metadata.sourceRunId : String(candidate?.runId ?? 'unknown');
}

function latestGeneratedAt(rows: unknown[]): number {
  return Math.max(...rows.map((row: any) => {
    const value = row?.generatedAt instanceof Date ? row.generatedAt.getTime() : Date.parse(String(row?.generatedAt ?? ''));
    return Number.isFinite(value) ? value : 0;
  }));
}

function latestStatus(items: unknown): string {
  if (!Array.isArray(items) || !items.length) return 'unvalidated';
  const status = (items[0] as any)?.status;
  return typeof status === 'string' && status ? status : 'unvalidated';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(String(value));
  return 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clamp(value, min, max));
}

function clampProbability(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${label} must be greater than 0 and at most 1.`);
  return value;
}

function positiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0.`);
  return value;
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}
