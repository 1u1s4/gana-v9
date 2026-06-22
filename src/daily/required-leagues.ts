import { createHash } from 'node:crypto';
import type { Fixture } from '../domain/fixtures.js';
import type { ParlayAnalysisRecommendation } from '../parlay/analysis.js';
import type { RunPipelineResult } from '../runtime/run-service.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';
import {
  atomicPredictionEdge,
  atomicPredictionKey,
  average,
  clamp,
  displayFixturesFromPipelineResult,
  fixtureDisplay,
  fixtureDisplayQuality,
  isFallbackPredictionCandidate,
  round,
  uniqueStrings,
} from './recommendation-policy.js';
import type { AtomicPredictionCandidate, DailyE2EProvider, RecommendationLegDisplay } from './types.js';

export type DailyRequiredLeagueModelResolver = (provider: DailyE2EProvider) => string;

export interface DailyRequiredLeagueInput {
  providerCompetitionId: string;
  name?: string;
  country?: string;
  season?: number | null;
}

export const DAILY_REQUIRED_LEAGUE_DEFAULTS: DailyRequiredLeagueInput[] = [
  { providerCompetitionId: '1', name: 'World Cup', country: 'World', season: 2026 },
];
export const DAILY_REQUIRED_LEAGUE_PARLAY_APPROACH_ORDER = [
  'principal',
  'resultados',
  'mixto-seguro',
  'parlay-diamante',
  'parlay-refinado',
  'low-variance',
] as const;
const REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE = 0.62;
const REQUIRED_LEAGUE_PARLAY_MIN_AGGREGATE_CONFIDENCE = 0.45;
const REQUIRED_LEAGUE_SAFETY_DOUBLE_CHANCE_MAX_ODDS = 1.25;
const REQUIRED_LEAGUE_SAFETY_DOUBLE_CHANCE_MIN_MODEL_CONFIDENCE = 0.5;
const REQUIRED_LEAGUE_SAFETY_TOTALS_MAX_ODDS = 1.6;
const REQUIRED_LEAGUE_SAFETY_BREAK_EVEN_EDGE_FLOOR = -0.015;
export type DailyRequiredLeagueParlayApproach = typeof DAILY_REQUIRED_LEAGUE_PARLAY_APPROACH_ORDER[number];
export type DailyRequiredLeagueGoalStatus = 'passed' | 'review-required';

export interface DailyRequiredLeagueDefinition {
  providerCompetitionId: string;
  name?: string;
  country?: string;
  season?: number | null;
}

export interface DailyRequiredLeagueCoverageFixture {
  fixtureId: string;
  providerFixtureId: string;
  fixture: string;
  display?: RecommendationLegDisplay;
  league: DailyRequiredLeagueDefinition;
  scheduledAt: string;
  status: 'covered' | 'missing-predictions';
  predictionCount: number;
  promotableCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
  providers: Record<string, {
    runId: string | null;
    fixtureSelected: boolean;
    predictionCount: number;
    promotableCount: number;
    reviewRequiredCount: number;
    blockedCount: number;
    gateVerdict: string | null;
    reasons: string[];
    warnings: string[];
  }>;
  reasons: string[];
}

export interface DailyRequiredLeagueAtomicProjection {
  kind: 'required-league-atomic-projection';
  rank: number;
  projectionId: string;
  predictionId: string;
  sourceRunId: string | null;
  sourceRunIds: string[];
  provider: DailyE2EProvider;
  providers: DailyE2EProvider[];
  model: string;
  league: DailyRequiredLeagueDefinition;
  fixtureId: string;
  providerFixtureId: string;
  fixture: string;
  display?: RecommendationLegDisplay;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  confidence: number;
  expectedEdge: number;
  safetyOverride?: 'market-implied-double-chance' | 'market-implied-conservative-total';
  status: string;
  warnings: string[];
  reasons: string[];
  rationale?: string;
}

export interface DailyRequiredLeagueParlayProjection {
  kind: 'required-league-parlay-projection';
  profile: DailyRequiredLeagueParlayApproach;
  status: 'selected' | 'blocked';
  parlayId: string | null;
  league: DailyRequiredLeagueDefinition;
  combinedOdds: number | null;
  aggregateConfidence: number | null;
  adjustedProbability: number | null;
  expectedEdge: number | null;
  sourceRunIds: string[];
  providers: DailyE2EProvider[];
  legs: ParlayAnalysisRecommendation['legs'];
  reasons: string[];
  riskFlags: string[];
}

export interface DailyRequiredLeagueArtifact {
  dailyBatchId: string;
  date: string;
  generatedAt: string;
  requiredLeagues: DailyRequiredLeagueDefinition[];
  coverage: {
    status: 'complete' | 'review-required' | 'not-scheduled';
    fixtureCount: number;
    coveredFixtures: number;
    missingPredictionFixtures: number;
    fixtures: DailyRequiredLeagueCoverageFixture[];
  };
  atomicProjections: DailyRequiredLeagueAtomicProjection[];
  parlayProjections: DailyRequiredLeagueParlayProjection[];
  goalCheck: {
    objective: string;
    status: DailyRequiredLeagueGoalStatus;
    checks: Array<{
      name: string;
      status: 'passed' | 'blocked';
      reasons: string[];
    }>;
    nextActions: string[];
  };
  recommendationPolicy: {
    scope: 'required-league-addendum';
    defaultRequiredLeagues: DailyRequiredLeagueInput[];
    parlayProfiles: readonly DailyRequiredLeagueParlayApproach[];
    atomicSelection: string;
    parlaySelection: string;
  };
  analyticalArtifactOnly: true;
  executionCapability: 'none';
}

export function normalizeRequiredLeagues(input: DailyRequiredLeagueInput[] | undefined): DailyRequiredLeagueDefinition[] {
  const fromEnv = parseRequiredLeaguesEnv(process.env.GANA_DAILY_REQUIRED_LEAGUES);
  const source = input ?? fromEnv ?? DAILY_REQUIRED_LEAGUE_DEFAULTS;
  const defaultsById = new Map(DAILY_REQUIRED_LEAGUE_DEFAULTS.map((league) => [league.providerCompetitionId, league]));
  const seen = new Set<string>();
  const normalized: DailyRequiredLeagueDefinition[] = [];

  for (const league of source) {
    const providerCompetitionId = String(league.providerCompetitionId ?? '').trim();
    if (!providerCompetitionId) continue;
    const defaultLeague = defaultsById.get(providerCompetitionId);
    const season = league.season === undefined
      ? defaultLeague?.season ?? null
      : league.season;
    if (season !== null && season !== undefined && (!Number.isInteger(season) || season < 1900)) {
      throw new Error(`required league ${providerCompetitionId} has invalid season ${String(season)}.`);
    }
    const key = `${providerCompetitionId}:${season ?? 'any'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      providerCompetitionId,
      name: league.name ?? defaultLeague?.name,
      country: league.country ?? defaultLeague?.country,
      season: season ?? null,
    });
  }

  return normalized;
}

function parseRequiredLeaguesEnv(value: string | undefined): DailyRequiredLeagueInput[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(off|false|none|disabled|0)$/i.test(trimmed)) return [];
  return trimmed.split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [providerCompetitionId, name, country, seasonText] = token.split(':').map((part) => part.trim());
      const season = seasonText ? Number(seasonText) : undefined;
      return {
        providerCompetitionId,
        ...(name ? { name } : {}),
        ...(country ? { country } : {}),
        ...(season !== undefined ? { season } : {}),
      };
    });
}

export function buildRequiredLeagueRecommendations(input: {
  dailyBatchId: string;
  date: string;
  generatedAt: string;
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  timezone?: string;
  resolveModel: DailyRequiredLeagueModelResolver;
  requiredLeagues: readonly DailyRequiredLeagueDefinition[];
}): DailyRequiredLeagueArtifact {
  const coverageFixtures = collectRequiredLeagueCoverageFixtures(input);
  const atomicProjectionDrafts = buildRequiredLeagueAtomicProjectionDrafts({
    ...input,
    coverageFixtures,
  });
  const parlayProjectionDrafts = buildRequiredLeagueAtomicProjectionDrafts({
    ...input,
    coverageFixtures,
    includeSafetyBlocked: true,
  });
  const atomicProjections = selectRequiredLeagueAtomicProjections(atomicProjectionDrafts);
  const parlayProjections = input.requiredLeagues.flatMap((league) => {
    const leagueFixtures = coverageFixtures.filter((fixture) => sameRequiredLeague(fixture.league, league));
    if (!leagueFixtures.length) return [];
    return buildRequiredLeagueParlayProjections(
      league,
      atomicProjections.filter((projection) => sameRequiredLeague(projection.league, league)),
      parlayProjectionDrafts.filter((projection) => sameRequiredLeague(projection.league, league)),
      leagueFixtures.length,
    );
  });

  const missingPredictionFixtures = coverageFixtures.filter((fixture) => fixture.status === 'missing-predictions');
  const coveredFixtures = coverageFixtures.length - missingPredictionFixtures.length;
  const selectedParlayApproaches = parlayProjections.filter((projection) => projection.status === 'selected').length;
  const parlayBlocked = coverageFixtures.length > 1
    && input.requiredLeagues.some((league) => {
      const leagueFixtureCount = coverageFixtures.filter((fixture) => sameRequiredLeague(fixture.league, league)).length;
      if (leagueFixtureCount <= 1) return false;
      return parlayProjections
        .filter((projection) => sameRequiredLeague(projection.league, league))
        .some((projection) => projection.status === 'blocked');
    });
  const coverageStatus = !coverageFixtures.length
    ? 'not-scheduled'
    : missingPredictionFixtures.length || parlayBlocked
      ? 'review-required'
      : 'complete';

  const goalChecks = [
    {
      name: 'fixtures-discovered',
      status: 'passed' as const,
      reasons: coverageFixtures.length
        ? [`${coverageFixtures.length} required-league fixture(s) discovered for ${input.date}`]
        : [`no required-league fixtures discovered for ${input.date}`],
    },
    {
      name: 'atomic-projection-coverage',
      status: missingPredictionFixtures.length ? 'blocked' as const : 'passed' as const,
      reasons: missingPredictionFixtures.length
        ? missingPredictionFixtures.map((fixture) => `${fixture.fixture} has no non-blocked prediction`)
        : [`${coveredFixtures} required-league fixture(s) have non-blocked projections`],
    },
    {
      name: 'required-parlay-approaches',
      status: parlayBlocked ? 'blocked' as const : 'passed' as const,
      reasons: parlayBlocked
        ? parlayProjections
          .filter((projection) => projection.status === 'blocked')
          .flatMap((projection) => projection.reasons.map((reason) => `${projection.league.name ?? projection.league.providerCompetitionId} ${projection.profile}: ${reason}`))
        : selectedParlayApproaches
          ? [`${selectedParlayApproaches} required-league parlay approach(es) generated`]
          : ['no required-league parlay was needed because fewer than two fixtures were scheduled or discovered'],
    },
  ];
  const goalStatus: DailyRequiredLeagueGoalStatus = goalChecks.some((check) => check.status === 'blocked')
    ? 'review-required'
    : 'passed';
  const nextActions = goalStatus === 'passed'
    ? []
    : uniqueStrings([
      ...missingPredictionFixtures.map((fixture) => `retry research/scoring for ${fixture.providerFixtureId} (${fixture.fixture}) with fresh web evidence`),
      ...(parlayBlocked ? ['rerun required-league addendum after every required fixture has enough alternate non-blocked projections for three unique parlays'] : []),
    ]);

  return {
    dailyBatchId: input.dailyBatchId,
    date: input.date,
    generatedAt: input.generatedAt,
    requiredLeagues: [...input.requiredLeagues],
    coverage: {
      status: coverageStatus,
      fixtureCount: coverageFixtures.length,
      coveredFixtures,
      missingPredictionFixtures: missingPredictionFixtures.length,
      fixtures: coverageFixtures,
    },
    atomicProjections,
    parlayProjections,
    goalCheck: {
      objective: 'required league daily projections and required parlay approaches',
      status: goalStatus,
      checks: goalChecks,
      nextActions,
    },
    recommendationPolicy: {
      scope: 'required-league-addendum',
      defaultRequiredLeagues: DAILY_REQUIRED_LEAGUE_DEFAULTS,
      parlayProfiles: DAILY_REQUIRED_LEAGUE_PARLAY_APPROACH_ORDER,
      atomicSelection: 'best non-blocked prediction per required fixture, promotable preferred over review-required',
      parlaySelection: 'safety-first required-league planner: keep principal/resultados/mixto-seguro plus parlay-diamante/parlay-refinado/low-variance; prefer low-variance double-chance coverage, conservative totals pairs, best double-chance pairs, and daily-focus-style low-odds pairs; allow market-implied safety confidence for low-price blocked double-chance and conservative-total candidates while keeping traceable review-required risk flags',
    },
    analyticalArtifactOnly: true,
    executionCapability: 'none',
  };
}

function collectRequiredLeagueCoverageFixtures(input: {
  date: string;
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  timezone?: string;
  requiredLeagues: readonly DailyRequiredLeagueDefinition[];
}): DailyRequiredLeagueCoverageFixture[] {
  const fixturesById = new Map<string, Fixture>();
  for (const result of Object.values(input.providerPipelineResults)) {
    for (const fixture of displayFixturesFromPipelineResult(result)) {
      const league = requiredLeagueForFixture(fixture, input.requiredLeagues);
      if (!league) continue;
      if (!fixtureFallsOnDate(fixture, input.date, input.timezone)) continue;
      const key = fixture.id || fixture.providerFixtureId;
      const current = fixturesById.get(key);
      if (!current || fixtureDisplayQuality(fixtureDisplay(fixture) ?? emptyFixtureDisplay()) > fixtureDisplayQuality(fixtureDisplay(current) ?? emptyFixtureDisplay())) {
        fixturesById.set(key, fixture);
      }
    }
  }

  return [...fixturesById.values()]
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .map((fixture) => coverageFixtureFromPipelineResults(fixture, input));
}

function coverageFixtureFromPipelineResults(
  fixture: Fixture,
  input: {
    providers: readonly DailyE2EProvider[];
    providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
    requiredLeagues: readonly DailyRequiredLeagueDefinition[];
  },
): DailyRequiredLeagueCoverageFixture {
  const league = requiredLeagueForFixture(fixture, input.requiredLeagues) ?? {
    providerCompetitionId: String(fixture.leagueId ?? fixture.competitionId ?? ''),
    name: fixture.competitionName,
    season: fixture.season ?? null,
  };
  const display = fixtureDisplay(fixture);
  const providers = Object.fromEntries(input.providers.map((provider) => {
    const result = input.providerPipelineResults[provider];
    const scoring = (result?.scoring ?? []).filter((item) => scoringMatchesFixture(item, fixture));
    const predictions = scoring.flatMap((item) => item.predictions);
    return [provider, {
      runId: result?.runId ?? null,
      fixtureSelected: displayFixturesFromPipelineResult(result).some((item) => sameFixture(item, fixture)),
      predictionCount: predictions.length,
      promotableCount: predictions.filter((prediction) => prediction.status === 'promotable').length,
      reviewRequiredCount: predictions.filter((prediction) => prediction.status === 'review-required').length,
      blockedCount: predictions.filter((prediction) => prediction.status === 'blocked').length,
      gateVerdict: uniqueStrings(scoring.map((item) => item.gateResult.verdict)).join(',') || null,
      reasons: uniqueStrings(scoring.flatMap((item) => item.gateResult.reasons ?? [])),
      warnings: uniqueStrings(scoring.flatMap((item) => item.gateResult.warnings ?? [])),
    }];
  }));
  const providerValues = Object.values(providers);
  const predictionCount = providerValues.reduce((sum, provider) => sum + provider.predictionCount, 0);
  const promotableCount = providerValues.reduce((sum, provider) => sum + provider.promotableCount, 0);
  const reviewRequiredCount = providerValues.reduce((sum, provider) => sum + provider.reviewRequiredCount, 0);
  const blockedCount = providerValues.reduce((sum, provider) => sum + provider.blockedCount, 0);
  const projectableCount = predictionCount - blockedCount;
  const reasons = uniqueStrings([
    ...(projectableCount > 0 ? [] : ['no non-blocked prediction was produced for this required fixture']),
    ...providerValues.flatMap((provider) => provider.reasons),
    ...providerValues.flatMap((provider) => provider.warnings),
  ]);

  return {
    fixtureId: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    fixture: display?.fixtureLabel ?? `${fixture.homeTeamName ?? fixture.homeTeamId} vs ${fixture.awayTeamName ?? fixture.awayTeamId}`,
    ...(display ? { display } : {}),
    league,
    scheduledAt: fixture.scheduledAt,
    status: projectableCount > 0 ? 'covered' : 'missing-predictions',
    predictionCount,
    promotableCount,
    reviewRequiredCount,
    blockedCount,
    providers,
    reasons,
  };
}

function buildRequiredLeagueAtomicProjectionDrafts(input: {
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  timezone?: string;
  resolveModel: DailyRequiredLeagueModelResolver;
  coverageFixtures: readonly DailyRequiredLeagueCoverageFixture[];
  includeSafetyBlocked?: boolean;
}): DailyRequiredLeagueAtomicProjection[] {
  const requiredFixturesById = new Map(input.coverageFixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const requiredFixturesByProviderId = new Map(input.coverageFixtures.map((fixture) => [fixture.providerFixtureId, fixture]));
  const groups = new Map<string, AtomicPredictionCandidate[]>();

  for (const provider of input.providers) {
    const result = input.providerPipelineResults[provider];
    if (!result?.runId) continue;
    const providerModel = input.resolveModel(provider);
    for (const scoring of result.scoring) {
      const requiredFixture = requiredFixturesById.get(scoring.fixtureId ?? '')
        ?? requiredFixturesByProviderId.get(scoring.providerFixtureId ?? '');
      if (!requiredFixture) continue;
      for (const prediction of scoring.predictions) {
        const safetyOverride = requiredLeagueSafetyOverride(prediction);
        if (prediction.status === 'blocked' && !(input.includeSafetyBlocked && safetyOverride)) continue;
        if (!isFallbackPredictionCandidate(prediction)) continue;
        const display = requiredFixture.display;
        const candidate: AtomicPredictionCandidate = {
          provider,
          model: prediction.model ?? providerModel,
          runId: result.runId,
          prediction,
          fixture: requiredFixture.fixture,
          display,
          edge: atomicPredictionEdge(prediction),
        };
        const key = `${prediction.fixtureId}:${atomicPredictionKey(prediction)}`;
        groups.set(key, [...(groups.get(key) ?? []), candidate]);
      }
    }
  }

  const drafts = [...groups.values()]
    .map((candidates) => toRequiredLeagueAtomicProjection(
      candidates,
      requiredFixturesById,
      requiredFixturesByProviderId,
      input.includeSafetyBlocked === true,
    ))
    .filter((projection): projection is DailyRequiredLeagueAtomicProjection => Boolean(projection))
    .sort((a, b) =>
      requiredAtomicProjectionScore(b) - requiredAtomicProjectionScore(a)
      || b.confidence - a.confidence
      || a.odds - b.odds
    );
  return drafts;
}

function selectRequiredLeagueAtomicProjections(
  drafts: readonly DailyRequiredLeagueAtomicProjection[],
): DailyRequiredLeagueAtomicProjection[] {
  const selected: DailyRequiredLeagueAtomicProjection[] = [];
  const usedFixtureIds = new Set<string>();
  for (const projection of drafts) {
    if (usedFixtureIds.has(projection.fixtureId)) continue;
    usedFixtureIds.add(projection.fixtureId);
    selected.push({ ...projection, rank: selected.length + 1 });
  }
  return selected;
}

function toRequiredLeagueAtomicProjection(
  candidates: AtomicPredictionCandidate[],
  requiredFixturesById: ReadonlyMap<string, DailyRequiredLeagueCoverageFixture>,
  requiredFixturesByProviderId: ReadonlyMap<string, DailyRequiredLeagueCoverageFixture>,
  allowSafetyConfidence = false,
): DailyRequiredLeagueAtomicProjection | undefined {
  const ordered = [...candidates].sort((a, b) =>
    requiredPredictionCandidateScore(b) - requiredPredictionCandidateScore(a)
    || b.prediction.confidence - a.prediction.confidence
    || a.prediction.odds - b.prediction.odds
  );
  const primary = ordered[0];
  if (!primary) return undefined;
  const fixture = requiredFixturesById.get(primary.prediction.fixtureId)
    ?? requiredFixturesByProviderId.get(primary.prediction.providerFixtureId ?? '');
  if (!fixture) return undefined;
  const providers = uniqueStrings(ordered.map((candidate) => candidate.provider)) as DailyE2EProvider[];
  const sourceRunIds = uniqueStrings(ordered.map((candidate) => candidate.runId));
  const safetyOverrides = allowSafetyConfidence
    ? uniqueStrings(ordered.map((candidate) => requiredLeagueSafetyOverride(candidate.prediction) ?? ''))
    : [];
  const safetyOverride = safetyOverrides.includes('market-implied-double-chance')
    ? 'market-implied-double-chance'
    : safetyOverrides.includes('market-implied-conservative-total')
      ? 'market-implied-conservative-total'
      : undefined;
  const confidence = round(average(ordered.map((candidate) =>
    allowSafetyConfidence ? requiredLeagueCandidateConfidence(candidate) : candidate.prediction.confidence,
  )), 6);
  const edge = round(average(ordered.map((candidate) =>
    allowSafetyConfidence ? requiredLeagueCandidateEdge(candidate) : candidate.edge,
  )), 6);
  const warnings = uniqueStrings(ordered.flatMap((candidate) => [
    ...(candidate.prediction.warnings ?? []),
    ...(candidate.prediction.blockers ?? []),
  ]));

  return {
    kind: 'required-league-atomic-projection',
    rank: 0,
    projectionId: `required-atomic-${createHash('sha256')
      .update(ordered.map((candidate) => candidate.prediction.id).join('|'))
      .digest('hex')
      .slice(0, 16)}`,
    predictionId: primary.prediction.id,
    sourceRunId: primary.runId,
    sourceRunIds,
    provider: primary.provider,
    providers,
    model: primary.model,
    league: fixture.league,
    fixtureId: fixture.fixtureId,
    providerFixtureId: fixture.providerFixtureId,
    fixture: fixture.fixture,
    ...(fixture.display ? { display: fixture.display } : {}),
    market: primary.prediction.market,
    selection: primary.prediction.selection,
    line: primary.prediction.line ?? null,
    odds: round(primary.prediction.odds, 6),
    confidence,
    expectedEdge: edge,
    ...(safetyOverride ? { safetyOverride } : {}),
    status: primary.prediction.status,
    warnings,
    reasons: uniqueStrings([
      `required league ${fixture.league.name ?? fixture.league.providerCompetitionId}`,
      `best available non-blocked projection for ${fixture.fixture}`,
      safetyOverride ? `safety override: ${safetyOverride}` : '',
      providers.length > 1 ? `provider agreement: ${providers.join(', ')}` : `provider: ${primary.provider}`,
      `confidence ${round(confidence, 3)}`,
      `edge ${round(edge, 3)}`,
    ]),
    ...(primary.prediction.rationale ? { rationale: primary.prediction.rationale } : {}),
  };
}

function requiredLeagueSafetyOverride(
  prediction: AtomicPredictionCandidate['prediction'],
): DailyRequiredLeagueAtomicProjection['safetyOverride'] | undefined {
  if (prediction.market === 'double_chance'
    && prediction.selection !== 'home_or_away'
    && prediction.odds <= REQUIRED_LEAGUE_SAFETY_DOUBLE_CHANCE_MAX_ODDS
    && prediction.confidence >= REQUIRED_LEAGUE_SAFETY_DOUBLE_CHANCE_MIN_MODEL_CONFIDENCE) {
    return 'market-implied-double-chance';
  }
  if (prediction.market === 'goals_over_under'
    && prediction.odds <= REQUIRED_LEAGUE_SAFETY_TOTALS_MAX_ODDS
    && Number.isFinite(prediction.line)
    && (
      (prediction.selection === 'under' && Number(prediction.line) >= 3.25)
      || (prediction.selection === 'over' && Number(prediction.line) <= 1.5)
    )) {
    return 'market-implied-conservative-total';
  }
  return undefined;
}

function requiredLeagueCandidateConfidence(candidate: AtomicPredictionCandidate): number {
  const override = requiredLeagueSafetyOverride(candidate.prediction);
  if (!override) return candidate.prediction.confidence;
  return Math.max(candidate.prediction.confidence, requiredLeagueImpliedConfidence(candidate.prediction));
}

function requiredLeagueCandidateEdge(candidate: AtomicPredictionCandidate): number {
  const override = requiredLeagueSafetyOverride(candidate.prediction);
  if (!override) return candidate.edge;
  const confidence = requiredLeagueCandidateConfidence(candidate);
  return Math.max(candidate.edge, (candidate.prediction.odds * confidence) - 1, 0);
}

function requiredLeagueImpliedConfidence(prediction: AtomicPredictionCandidate['prediction']): number {
  if (Number.isFinite(prediction.impliedProbability)) return clamp(prediction.impliedProbability, 0.01, 0.99);
  return clamp(1 / prediction.odds, 0.01, 0.99);
}

type RequiredLeagueMarketFamily = 'result' | 'totals' | 'corners' | 'other';

interface RequiredLeagueParlayApproachSpec {
  profile: DailyRequiredLeagueParlayApproach;
  intent: string;
  targetOddsMin: number;
  targetOddsMax: number;
  targetOddsIdeal: number;
  preferredFamilies: readonly RequiredLeagueMarketFamily[];
  preferMixedFamilies?: boolean;
  strategy?:
    | 'double-chance-coverage'
    | 'safe-totals-pair'
    | 'best-double-chance-pair'
    | 'diamond-low-odds-pair'
    | 'refined-focus-pair'
    | 'low-variance-pair';
}

const REQUIRED_LEAGUE_PARLAY_APPROACH_SPECS: readonly RequiredLeagueParlayApproachSpec[] = [
  {
    profile: 'principal',
    intent: 'cobertura segura de resultado: doble oportunidad favorita/no pierde en todos los fixtures requeridos cuando esté disponible',
    targetOddsMin: 1.35,
    targetOddsMax: 2.2,
    targetOddsIdeal: 1.65,
    preferredFamilies: ['result'],
    strategy: 'double-chance-coverage',
  },
  {
    profile: 'resultados',
    intent: 'cupón de totales conservadores: preferir under alto u over bajo antes que líneas agresivas',
    targetOddsMin: 1.55,
    targetOddsMax: 2.5,
    targetOddsIdeal: 1.9,
    preferredFamilies: ['totals'],
    strategy: 'safe-totals-pair',
  },
  {
    profile: 'mixto-seguro',
    intent: 'mejor combinación corta de doble oportunidad entre los fixtures requeridos',
    targetOddsMin: 1.18,
    targetOddsMax: 1.7,
    targetOddsIdeal: 1.35,
    preferredFamilies: ['result'],
    strategy: 'best-double-chance-pair',
  },
  {
    profile: 'parlay-diamante',
    intent: 'enfoque obligatorio diamante: par corto de cuota baja cercano a 1.20 usando resultado seguro o total conservador',
    targetOddsMin: 1.1,
    targetOddsMax: 1.3,
    targetOddsIdeal: 1.2,
    preferredFamilies: ['result', 'totals'],
    strategy: 'diamond-low-odds-pair',
  },
  {
    profile: 'parlay-refinado',
    intent: 'enfoque obligatorio refinado: par balanceado con familias de mercado distintas cuando haya suficiente edge',
    targetOddsMin: 1.3,
    targetOddsMax: 2.1,
    targetOddsIdeal: 1.55,
    preferredFamilies: ['result', 'totals'],
    preferMixedFamilies: true,
    strategy: 'refined-focus-pair',
  },
  {
    profile: 'low-variance',
    intent: 'enfoque obligatorio low-variance: par defensivo de baja varianza con doble oportunidad o total conservador',
    targetOddsMin: 1.25,
    targetOddsMax: 2.2,
    targetOddsIdeal: 1.45,
    preferredFamilies: ['result', 'totals'],
    strategy: 'low-variance-pair',
  },
];

function buildRequiredLeagueParlayProjections(
  league: DailyRequiredLeagueDefinition,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  parlayCandidates: readonly DailyRequiredLeagueAtomicProjection[],
  fixtureCount: number,
): DailyRequiredLeagueParlayProjection[] {
  const usedSignatures = new Set<string>();
  const usedPredictionCounts = new Map<string, number>();
  const usedFixturePairCounts = new Map<string, number>();
  const anchorPredictionIds = new Set(atomicProjections.map((projection) => projection.predictionId));
  const projections = REQUIRED_LEAGUE_PARLAY_APPROACH_SPECS.map((spec) => {
    const selected = selectRequiredLeagueParlayLegs(
      spec,
      parlayCandidates,
      {
        usedSignatures,
        usedPredictionCounts,
        usedFixturePairCounts,
        anchorPredictionIds,
      },
    );
    const legs = selected?.legs ?? [];
    const availableFixtureCount = new Set(parlayCandidates.map((projection) => projection.fixtureId)).size;
    if (!selected || fixtureCount < 2 || availableFixtureCount < 2 || legs.length < 2) {
      const diagnostic = fixtureCount >= 2 && availableFixtureCount >= 2
        ? bestRequiredLeagueParlayDiagnostic(spec, parlayCandidates, {
          usedSignatures,
          usedPredictionCounts,
          usedFixturePairCounts,
          anchorPredictionIds,
        })
        : undefined;
      return {
        kind: 'required-league-parlay-projection',
        profile: spec.profile,
        status: 'blocked',
        parlayId: null,
        league,
        combinedOdds: null,
        aggregateConfidence: null,
        adjustedProbability: null,
        expectedEdge: null,
        sourceRunIds: [],
        providers: [],
        legs: [],
        reasons: uniqueStrings([
          fixtureCount < 2 ? 'fewer than two required-league fixtures were scheduled or discovered' : '',
          availableFixtureCount < 2 ? 'fewer than two required-league fixtures have non-blocked projections' : '',
          fixtureCount >= 2 && availableFixtureCount >= 2 && legs.length < 2
            ? `no unique required-league parlay meets positive-edge and confidence floors for ${spec.profile}`
            : '',
          diagnostic ? formatRequiredLeagueParlayDiagnostic(diagnostic) : '',
        ]),
        riskFlags: uniqueStrings([
          'required-league-addendum',
          'blocked',
          'required-league-confidence-floor',
          ...(fixtureCount >= 2 && availableFixtureCount >= 2 ? ['duplicate-required-league-parlay', 'insufficient-required-league-parlay-diversity'] : []),
        ]),
      } satisfies DailyRequiredLeagueParlayProjection;
    }
    usedSignatures.add(selected.signature);
    for (const leg of legs) {
      usedPredictionCounts.set(leg.predictionId, (usedPredictionCounts.get(leg.predictionId) ?? 0) + 1);
    }
    usedFixturePairCounts.set(selected.fixturePairSignature, (usedFixturePairCounts.get(selected.fixturePairSignature) ?? 0) + 1);
    const combinedOdds = round(legs.reduce((product, projection) => product * projection.odds, 1), 6);
    const aggregateConfidence = round(legs.reduce((product, projection) => product * clamp(projection.confidence, 0.01, 0.99), 1), 6);
    const adjustedProbability = round(clamp(aggregateConfidence, 0.01, 0.99), 6);
    const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
    const sourceRunIds = uniqueStrings(legs.flatMap((projection) => projection.sourceRunIds));
    const providers = uniqueStrings(legs.flatMap((projection) => projection.providers)) as DailyE2EProvider[];
    return {
      kind: 'required-league-parlay-projection',
      profile: spec.profile,
      status: 'selected',
      parlayId: `required-${spec.profile}-${createHash('sha256')
        .update(legs.map((projection) => projection.predictionId).join('|'))
        .digest('hex')
        .slice(0, 16)}`,
      league,
      combinedOdds,
      aggregateConfidence,
      adjustedProbability,
      expectedEdge,
      sourceRunIds,
      providers,
      legs: legs.map(requiredLeagueParlayLeg),
      reasons: [
        `required league ${league.name ?? league.providerCompetitionId}`,
        `atomic portfolio planner: ${spec.intent}`,
        `generated ${spec.profile} addendum from ${legs.length} distinct required fixtures with a unique required-league signature`,
        `market families: ${uniqueStrings(legs.map(requiredLeagueProjectionMarketFamily)).join(', ')}`,
        legs.some((projection) => projection.safetyOverride)
          ? `safety overrides: ${uniqueStrings(legs.map((projection) => projection.safetyOverride ?? '')).join(', ')}`
          : '',
        `providers: ${providers.join(', ') || 'unknown'}`,
      ].filter(Boolean),
      riskFlags: uniqueStrings([
        'required-league-addendum',
        'review-required',
        'atomic-portfolio-planner',
        ...(legs.some((projection) => projection.safetyOverride) ? ['market-implied-safety-confidence'] : []),
        ...(legs.some((projection) => projection.status === 'blocked') ? ['blocked-leg-safety-override'] : []),
        ...(legs.some((projection) => requiredLeagueProjectionMarketFamily(projection) === 'corners') ? ['corners-market'] : []),
        ...(expectedEdge <= 0 ? ['non-positive-expected-edge'] : []),
      ]),
    } satisfies DailyRequiredLeagueParlayProjection;
  });
  return projections;
}

interface RequiredLeagueParlayLegSelection {
  legs: DailyRequiredLeagueAtomicProjection[];
  signature: string;
  fixturePairSignature: string;
  combinedOdds: number;
  aggregateConfidence: number;
  expectedEdge: number;
  minConfidence: number;
  score: number;
}

function requiredLeagueParlayLegsSignature(
  legs: readonly Pick<DailyRequiredLeagueAtomicProjection, 'fixtureId' | 'predictionId' | 'market' | 'selection' | 'line' | 'odds'>[],
): string {
  return legs
    .map((leg) => [
      leg.fixtureId,
      leg.predictionId,
      leg.market,
      leg.selection,
      leg.line ?? '',
      leg.odds ?? '',
    ].join(':'))
    .sort()
    .join('|');
}

function selectRequiredLeagueParlayLegs(
  spec: RequiredLeagueParlayApproachSpec,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  context: {
    usedSignatures: ReadonlySet<string>;
    usedPredictionCounts: ReadonlyMap<string, number>;
    usedFixturePairCounts: ReadonlyMap<string, number>;
    anchorPredictionIds: ReadonlySet<string>;
  },
): RequiredLeagueParlayLegSelection | undefined {
  if (spec.strategy === 'double-chance-coverage') {
    const selected = selectRequiredLeagueDoubleChanceCoverage(spec, atomicProjections, context);
    if (selected) return selected;
  }
  if (spec.strategy === 'safe-totals-pair') {
    const selected = selectRequiredLeagueSafeTotalsPair(spec, atomicProjections, context);
    if (selected) return selected;
  }
  if (spec.strategy === 'best-double-chance-pair') {
    const selected = selectRequiredLeagueBestDoubleChancePair(spec, atomicProjections, context);
    if (selected) return selected;
  }
  if (spec.strategy === 'diamond-low-odds-pair') {
    const selected = selectRequiredLeagueDailyFocusPair(spec, atomicProjections, context, {
      maxLegOdds: 1.35,
      preferLowOdds: true,
      preferMixedFamilies: false,
    });
    if (selected) return selected;
  }
  if (spec.strategy === 'refined-focus-pair') {
    const selected = selectRequiredLeagueDailyFocusPair(spec, atomicProjections, context, {
      maxLegOdds: 1.8,
      preferLowOdds: false,
      preferMixedFamilies: true,
    });
    if (selected) return selected;
  }
  if (spec.strategy === 'low-variance-pair') {
    const selected = selectRequiredLeagueDailyFocusPair(spec, atomicProjections, context, {
      maxLegOdds: 1.6,
      preferLowOdds: true,
      preferMixedFamilies: false,
    });
    if (selected) return selected;
  }

  const ordered = [...atomicProjections]
    .sort((a, b) =>
      requiredLeagueAtomicPortfolioProjectionScore(b) - requiredLeagueAtomicPortfolioProjectionScore(a)
      || requiredAtomicProjectionScore(b) - requiredAtomicProjectionScore(a)
      || a.odds - b.odds
      || a.predictionId.localeCompare(b.predictionId)
    );
  const combinations: RequiredLeagueParlayLegSelection[] = [];
  const seenSignatures = new Set<string>();
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex] as DailyRequiredLeagueAtomicProjection;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex] as DailyRequiredLeagueAtomicProjection;
      if (left.fixtureId === right.fixtureId) continue;
      if (!requiredLeagueProjectionParlayEligible(left) || !requiredLeagueProjectionParlayEligible(right)) continue;
      const legs = [left, right].sort(compareRequiredLeagueParlayLegOrder);
      const signature = requiredLeagueParlayLegsSignature(legs);
      if (context.usedSignatures.has(signature)) continue;
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
      const fixturePairSignature = requiredLeagueFixturePairSignature(legs);
      const metrics = requiredLeagueParlayPortfolioMetrics(legs);
      if (metrics.expectedEdge <= 0) continue;
      if (metrics.aggregateConfidence < REQUIRED_LEAGUE_PARLAY_MIN_AGGREGATE_CONFIDENCE) continue;
      combinations.push({
        legs,
        signature,
        fixturePairSignature,
        ...metrics,
        score: requiredLeagueParlaySelectionScore(spec, legs, context, fixturePairSignature),
      });
    }
  }
  return combinations
    .sort((a, b) =>
      b.score - a.score
      || b.expectedEdge - a.expectedEdge
      || b.minConfidence - a.minConfidence
      || b.legs.reduce((sum, leg) => sum + leg.confidence, 0) - a.legs.reduce((sum, leg) => sum + leg.confidence, 0)
      || a.signature.localeCompare(b.signature)
    )
    .find((combination) => !context.usedSignatures.has(combination.signature));
}

function selectRequiredLeagueDoubleChanceCoverage(
  spec: RequiredLeagueParlayApproachSpec,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  context: Parameters<typeof selectRequiredLeagueParlayLegs>[2],
): RequiredLeagueParlayLegSelection | undefined {
  const bestByFixture = new Map<string, DailyRequiredLeagueAtomicProjection>();
  for (const projection of atomicProjections.filter(requiredLeagueIsSafetyDoubleChance)) {
    const current = bestByFixture.get(projection.fixtureId);
    if (!current || requiredLeagueSafetyDoubleChanceScore(projection) > requiredLeagueSafetyDoubleChanceScore(current)) {
      bestByFixture.set(projection.fixtureId, projection);
    }
  }
  const legs = [...bestByFixture.values()].sort(compareRequiredLeagueParlayLegOrder);
  return buildRequiredLeagueParlayLegSelection(spec, legs, context, { allowBreakEvenSafety: true });
}

function selectRequiredLeagueSafeTotalsPair(
  spec: RequiredLeagueParlayApproachSpec,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  context: Parameters<typeof selectRequiredLeagueParlayLegs>[2],
): RequiredLeagueParlayLegSelection | undefined {
  const ordered = atomicProjections
    .filter(requiredLeagueIsConservativeTotal)
    .sort((a, b) => requiredLeagueConservativeTotalScore(b) - requiredLeagueConservativeTotalScore(a)
      || b.confidence - a.confidence
      || a.odds - b.odds);
  const combinations: RequiredLeagueParlayLegSelection[] = [];
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex] as DailyRequiredLeagueAtomicProjection;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex] as DailyRequiredLeagueAtomicProjection;
      if (left.fixtureId === right.fixtureId) continue;
      const selected = buildRequiredLeagueParlayLegSelection(spec, [left, right], context, { allowBreakEvenSafety: true });
      if (selected) combinations.push(selected);
    }
  }
  return combinations.sort((a, b) =>
    requiredLeagueTotalsPairShapeScore(b.legs) - requiredLeagueTotalsPairShapeScore(a.legs)
    || b.aggregateConfidence - a.aggregateConfidence
    || b.score - a.score
    || a.signature.localeCompare(b.signature)
  )[0];
}

function selectRequiredLeagueBestDoubleChancePair(
  spec: RequiredLeagueParlayApproachSpec,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  context: Parameters<typeof selectRequiredLeagueParlayLegs>[2],
): RequiredLeagueParlayLegSelection | undefined {
  const ordered = atomicProjections
    .filter(requiredLeagueIsSafetyDoubleChance)
    .sort((a, b) => requiredLeagueSafetyDoubleChanceScore(b) - requiredLeagueSafetyDoubleChanceScore(a)
      || b.confidence - a.confidence
      || a.odds - b.odds);
  const combinations: RequiredLeagueParlayLegSelection[] = [];
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex] as DailyRequiredLeagueAtomicProjection;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex] as DailyRequiredLeagueAtomicProjection;
      if (left.fixtureId === right.fixtureId) continue;
      const selected = buildRequiredLeagueParlayLegSelection(spec, [left, right], context, { allowBreakEvenSafety: true });
      if (selected) combinations.push(selected);
    }
  }
  return combinations.sort((a, b) =>
    b.aggregateConfidence - a.aggregateConfidence
    || a.combinedOdds - b.combinedOdds
    || b.score - a.score
    || a.signature.localeCompare(b.signature)
  )[0];
}

function selectRequiredLeagueDailyFocusPair(
  spec: RequiredLeagueParlayApproachSpec,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  context: Parameters<typeof selectRequiredLeagueParlayLegs>[2],
  options: { maxLegOdds: number; preferLowOdds: boolean; preferMixedFamilies: boolean },
): RequiredLeagueParlayLegSelection | undefined {
  const ordered = atomicProjections
    .filter((projection) => requiredLeagueIsDailyFocusCandidate(projection, options.maxLegOdds))
    .sort((a, b) =>
      requiredLeagueDailyFocusProjectionScore(spec, b, options) - requiredLeagueDailyFocusProjectionScore(spec, a, options)
      || b.confidence - a.confidence
      || a.odds - b.odds
      || a.predictionId.localeCompare(b.predictionId)
    );
  const combinations: RequiredLeagueParlayLegSelection[] = [];
  const seenSignatures = new Set<string>();
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex] as DailyRequiredLeagueAtomicProjection;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex] as DailyRequiredLeagueAtomicProjection;
      if (left.fixtureId === right.fixtureId) continue;
      const selected = buildRequiredLeagueParlayLegSelection(spec, [left, right], context, { allowBreakEvenSafety: true });
      if (!selected || seenSignatures.has(selected.signature)) continue;
      seenSignatures.add(selected.signature);
      combinations.push(selected);
    }
  }
  return combinations.sort((a, b) =>
    requiredLeagueDailyFocusCombinationScore(spec, b, options) - requiredLeagueDailyFocusCombinationScore(spec, a, options)
    || b.aggregateConfidence - a.aggregateConfidence
    || b.score - a.score
    || a.signature.localeCompare(b.signature)
  )[0];
}

function buildRequiredLeagueParlayLegSelection(
  spec: RequiredLeagueParlayApproachSpec,
  inputLegs: readonly DailyRequiredLeagueAtomicProjection[],
  context: Parameters<typeof selectRequiredLeagueParlayLegs>[2],
  options: { allowBreakEvenSafety?: boolean } = {},
): RequiredLeagueParlayLegSelection | undefined {
  const legs = [...inputLegs].sort(compareRequiredLeagueParlayLegOrder);
  if (legs.length < 2) return undefined;
  if (new Set(legs.map((leg) => leg.fixtureId)).size !== legs.length) return undefined;
  const signature = requiredLeagueParlayLegsSignature(legs);
  if (context.usedSignatures.has(signature)) return undefined;
  const fixturePairSignature = requiredLeagueFixturePairSignature(legs);
  const metrics = requiredLeagueParlayPortfolioMetrics(legs);
  const edgeFloor = options.allowBreakEvenSafety ? REQUIRED_LEAGUE_SAFETY_BREAK_EVEN_EDGE_FLOOR : 0;
  if (metrics.expectedEdge <= edgeFloor) return undefined;
  if (metrics.aggregateConfidence < REQUIRED_LEAGUE_PARLAY_MIN_AGGREGATE_CONFIDENCE) return undefined;
  if (metrics.minConfidence < REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE) return undefined;
  return {
    legs,
    signature,
    fixturePairSignature,
    ...metrics,
    score: requiredLeagueParlaySelectionScore(spec, legs, context, fixturePairSignature),
  };
}

function requiredLeagueIsSafetyDoubleChance(projection: DailyRequiredLeagueAtomicProjection): boolean {
  return projection.market === 'double_chance'
    && projection.selection !== 'home_or_away'
    && projection.odds <= REQUIRED_LEAGUE_SAFETY_DOUBLE_CHANCE_MAX_ODDS
    && projection.confidence >= REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE
    && projection.safetyOverride === 'market-implied-double-chance';
}

function requiredLeagueIsConservativeTotal(projection: DailyRequiredLeagueAtomicProjection): boolean {
  return projection.market === 'goals_over_under'
    && projection.safetyOverride === 'market-implied-conservative-total'
    && projection.confidence >= REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE;
}

function requiredLeagueSafetyDoubleChanceScore(projection: DailyRequiredLeagueAtomicProjection): number {
  return round((projection.confidence * 0.8)
    + ((1 / Math.max(1.01, projection.odds)) * 0.18)
    + (projection.providers.length > 1 ? 0.04 : 0)
    - (projection.odds * 0.02), 6);
}

function requiredLeagueConservativeTotalScore(projection: DailyRequiredLeagueAtomicProjection): number {
  const line = Number(projection.line ?? 0);
  const lowOverBonus = projection.selection === 'over' && line <= 1.5 ? 0.22 : 0;
  const highUnderBonus = projection.selection === 'under' && line >= 3.5 ? 0.22 : projection.selection === 'under' && line >= 3.25 ? 0.14 : 0;
  return round((projection.confidence * 0.72)
    + lowOverBonus
    + highUnderBonus
    + (projection.status === 'promotable' ? 0.05 : 0)
    - (Math.log2(Math.max(1.01, projection.odds)) * 0.04), 6);
}

function requiredLeagueIsDailyFocusCandidate(
  projection: DailyRequiredLeagueAtomicProjection,
  maxLegOdds: number,
): boolean {
  const family = requiredLeagueProjectionMarketFamily(projection);
  if (family !== 'result' && family !== 'totals') return false;
  if (projection.odds > maxLegOdds) return false;
  if (projection.confidence < REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE) return false;
  if (projection.expectedEdge > 0) return true;
  return projection.safetyOverride === 'market-implied-double-chance'
    || projection.safetyOverride === 'market-implied-conservative-total';
}

function requiredLeagueDailyFocusProjectionScore(
  spec: RequiredLeagueParlayApproachSpec,
  projection: DailyRequiredLeagueAtomicProjection,
  options: { preferLowOdds: boolean; preferMixedFamilies: boolean },
): number {
  const family = requiredLeagueProjectionMarketFamily(projection);
  const lowOddsBoost = projection.odds <= 1.15 ? 0.16 : projection.odds <= 1.3 ? 0.08 : projection.odds <= 1.5 ? 0.03 : 0;
  const safetyBoost = projection.safetyOverride ? 0.08 : 0;
  const familyBoost = family === 'result'
    ? spec.profile === 'low-variance' ? 0.09 : 0.05
    : family === 'totals'
      ? 0.06
      : 0;
  const edgeScore = Math.max(0, projection.expectedEdge) * 0.18;
  return round(
    requiredLeagueAtomicPortfolioProjectionScore(projection)
      + safetyBoost
      + familyBoost
      + (options.preferLowOdds ? lowOddsBoost : lowOddsBoost * 0.45)
      + edgeScore
      - requiredLeagueProjectionWeakPenalty(projection),
    6,
  );
}

function requiredLeagueDailyFocusCombinationScore(
  spec: RequiredLeagueParlayApproachSpec,
  selection: RequiredLeagueParlayLegSelection,
  options: { preferLowOdds: boolean; preferMixedFamilies: boolean },
): number {
  const families = selection.legs.map(requiredLeagueProjectionMarketFamily);
  const mixedBonus = options.preferMixedFamilies && new Set(families).size > 1 ? 0.18 : 0;
  const safetyBonus = selection.legs.filter((projection) => projection.safetyOverride).length * 0.05;
  const lowOddsBonus = options.preferLowOdds
    ? selection.legs.reduce((sum, projection) => sum + (projection.odds <= 1.3 ? 0.04 : 0), 0)
    : 0;
  return round(
    selection.score
      + requiredLeagueTargetOddsScore(spec, selection.combinedOdds)
      + requiredLeagueMarketFamilyScore(spec, selection.legs)
      + mixedBonus
      + safetyBonus
      + lowOddsBonus
      + Math.max(0, selection.expectedEdge) * 0.12,
    6,
  );
}

function requiredLeagueTotalsPairShapeScore(legs: readonly DailyRequiredLeagueAtomicProjection[]): number {
  const hasLowOver = legs.some((projection) => projection.selection === 'over' && Number(projection.line ?? 0) <= 1.5);
  const hasHighUnder = legs.some((projection) => projection.selection === 'under' && Number(projection.line ?? 0) >= 3.25);
  return (hasLowOver && hasHighUnder ? 0.35 : 0)
    + legs.reduce((sum, projection) => sum + requiredLeagueConservativeTotalScore(projection), 0);
}

function bestRequiredLeagueParlayDiagnostic(
  spec: RequiredLeagueParlayApproachSpec,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  context: {
    usedSignatures: ReadonlySet<string>;
    usedPredictionCounts: ReadonlyMap<string, number>;
    usedFixturePairCounts: ReadonlyMap<string, number>;
    anchorPredictionIds: ReadonlySet<string>;
  },
): RequiredLeagueParlayLegSelection | undefined {
  const ordered = [...atomicProjections]
    .sort((a, b) =>
      requiredLeagueAtomicPortfolioProjectionScore(b) - requiredLeagueAtomicPortfolioProjectionScore(a)
      || requiredAtomicProjectionScore(b) - requiredAtomicProjectionScore(a)
      || a.odds - b.odds
      || a.predictionId.localeCompare(b.predictionId)
    );
  const combinations: RequiredLeagueParlayLegSelection[] = [];
  const seenSignatures = new Set<string>();
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex] as DailyRequiredLeagueAtomicProjection;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex] as DailyRequiredLeagueAtomicProjection;
      if (left.fixtureId === right.fixtureId) continue;
      const legs = [left, right].sort(compareRequiredLeagueParlayLegOrder);
      const signature = requiredLeagueParlayLegsSignature(legs);
      if (context.usedSignatures.has(signature)) continue;
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
      const fixturePairSignature = requiredLeagueFixturePairSignature(legs);
      const metrics = requiredLeagueParlayPortfolioMetrics(legs);
      combinations.push({
        legs,
        signature,
        fixturePairSignature,
        ...metrics,
        score: requiredLeagueParlaySelectionScore(spec, legs, context, fixturePairSignature),
      });
    }
  }
  return combinations.sort((a, b) =>
    b.aggregateConfidence - a.aggregateConfidence
    || b.expectedEdge - a.expectedEdge
    || b.score - a.score
    || a.signature.localeCompare(b.signature)
  )[0];
}

function formatRequiredLeagueParlayDiagnostic(diagnostic: RequiredLeagueParlayLegSelection): string {
  const missedGates = [
    diagnostic.minConfidence < REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE
      ? `confianza mínima por leg ${formatRequiredLeaguePercent(diagnostic.minConfidence)} < ${formatRequiredLeaguePercent(REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE)}`
      : '',
    diagnostic.aggregateConfidence < REQUIRED_LEAGUE_PARLAY_MIN_AGGREGATE_CONFIDENCE
      ? `confianza agregada ${formatRequiredLeaguePercent(diagnostic.aggregateConfidence)} < ${formatRequiredLeaguePercent(REQUIRED_LEAGUE_PARLAY_MIN_AGGREGATE_CONFIDENCE)}`
      : '',
    diagnostic.expectedEdge <= 0
      ? `edge esperado ${formatRequiredLeaguePercent(diagnostic.expectedEdge)} <= 0.00%`
      : '',
  ].filter(Boolean);
  const legs = diagnostic.legs.map((leg) =>
    `${leg.fixture} ${leg.market} ${leg.selection}${leg.line === null ? '' : ` ${leg.line}`} @ ${round(leg.odds, 2)} (${formatRequiredLeaguePercent(leg.confidence)})`
  ).join(' + ');
  return [
    `mejor combo rechazado: ${legs}`,
    `cuota ${round(diagnostic.combinedOdds, 2)}`,
    `confianza agregada ${formatRequiredLeaguePercent(diagnostic.aggregateConfidence)}`,
    `edge esperado ${formatRequiredLeaguePercent(diagnostic.expectedEdge)}`,
    missedGates.length ? `no supera: ${missedGates.join('; ')}` : '',
  ].filter(Boolean).join('; ');
}

function formatRequiredLeaguePercent(value: number): string {
  return `${round(value * 100, 2).toFixed(2)}%`;
}

function requiredLeagueProjectionParlayEligible(projection: DailyRequiredLeagueAtomicProjection): boolean {
  return projection.confidence >= REQUIRED_LEAGUE_PARLAY_MIN_LEG_CONFIDENCE && projection.expectedEdge > 0;
}

function requiredLeagueParlayPortfolioMetrics(legs: readonly DailyRequiredLeagueAtomicProjection[]): {
  combinedOdds: number;
  aggregateConfidence: number;
  expectedEdge: number;
  minConfidence: number;
} {
  const combinedOdds = legs.reduce((product, projection) => product * projection.odds, 1);
  const aggregateConfidence = legs.reduce((product, projection) => product * clamp(projection.confidence, 0.01, 0.99), 1);
  const adjustedProbability = clamp(aggregateConfidence, 0.01, 0.99);
  return {
    combinedOdds,
    aggregateConfidence,
    expectedEdge: (combinedOdds * adjustedProbability) - 1,
    minConfidence: Math.min(...legs.map((projection) => projection.confidence)),
  };
}

function requiredLeagueFixturePairSignature(
  legs: readonly Pick<DailyRequiredLeagueAtomicProjection, 'fixtureId'>[],
): string {
  return legs.map((leg) => leg.fixtureId).sort().join('|');
}

function compareRequiredLeagueParlayLegOrder(
  a: DailyRequiredLeagueAtomicProjection,
  b: DailyRequiredLeagueAtomicProjection,
): number {
  const aTime = Date.parse(a.display?.kickoffLocal ?? '');
  const bTime = Date.parse(b.display?.kickoffLocal ?? '');
  const aHasTime = Number.isFinite(aTime);
  const bHasTime = Number.isFinite(bTime);
  if (aHasTime && bHasTime && aTime !== bTime) return aTime - bTime;
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
  return a.fixture.localeCompare(b.fixture);
}

function requiredLeagueParlaySelectionScore(
  spec: RequiredLeagueParlayApproachSpec,
  legs: readonly DailyRequiredLeagueAtomicProjection[],
  context: {
    usedPredictionCounts: ReadonlyMap<string, number>;
    usedFixturePairCounts: ReadonlyMap<string, number>;
    anchorPredictionIds: ReadonlySet<string>;
  },
  fixturePairSignature: string,
): number {
  const { combinedOdds, aggregateConfidence, expectedEdge, minConfidence } = requiredLeagueParlayPortfolioMetrics(legs);
  const averageLegScore = average(legs.map(requiredLeagueAtomicPortfolioProjectionScore));
  const targetOddsScore = requiredLeagueTargetOddsScore(spec, combinedOdds);
  const marketFamilyScore = requiredLeagueMarketFamilyScore(spec, legs);
  const expectedEdgeScore = Math.max(0, expectedEdge) * 0.2
    + average(legs.map((projection) => Math.max(0, projection.expectedEdge))) * 0.24;
  const anchorBonus = legs.filter((projection) => context.anchorPredictionIds.has(projection.predictionId)).length
    * (spec.profile === 'principal' ? 0.24 : 0.04);
  const reusePenalty = legs.reduce((sum, projection) =>
    sum + ((context.usedPredictionCounts.get(projection.predictionId) ?? 0) * (spec.profile === 'resultados' ? 0.05 : 0.18)), 0);
  const fixturePairPenalty = (context.usedFixturePairCounts.get(fixturePairSignature) ?? 0) * 0.06;
  const weakLegPenalty = legs.reduce((sum, projection) => sum + requiredLeagueProjectionWeakPenalty(projection), 0);
  const lowConfidencePenalty = minConfidence < 0.55 ? (0.55 - minConfidence) * 0.9 : 0;

  return round(
    averageLegScore
      + targetOddsScore
      + marketFamilyScore
      + (aggregateConfidence * 0.13)
      + (minConfidence * 0.08)
      + expectedEdgeScore
      + anchorBonus
      - reusePenalty
      - fixturePairPenalty
      - weakLegPenalty
      - lowConfidencePenalty,
    6,
  );
}

function requiredLeagueAtomicPortfolioProjectionScore(projection: DailyRequiredLeagueAtomicProjection): number {
  const oddsPenalty = Math.log2(Math.max(1.01, projection.odds)) * 0.05;
  const statusBonus = projection.status === 'promotable' ? 0.18 : projection.status === 'review-required' ? 0.08 : 0;
  return round(
    (projection.confidence * 0.76)
      + (Math.max(0, projection.expectedEdge) * 0.34)
      + statusBonus
      - oddsPenalty
      - requiredLeagueProjectionWeakPenalty(projection),
    6,
  );
}

function requiredLeagueTargetOddsScore(spec: RequiredLeagueParlayApproachSpec, combinedOdds: number): number {
  if (!Number.isFinite(combinedOdds) || combinedOdds <= 1) return -0.35;
  if (combinedOdds < spec.targetOddsMin) return -Math.min(0.24, (spec.targetOddsMin - combinedOdds) * 0.08);
  if (combinedOdds > spec.targetOddsMax) return -Math.min(0.28, (combinedOdds - spec.targetOddsMax) * 0.08);
  return round(0.16 - Math.min(0.12, Math.abs(combinedOdds - spec.targetOddsIdeal) * 0.035), 6);
}

function requiredLeagueMarketFamilyScore(
  spec: RequiredLeagueParlayApproachSpec,
  legs: readonly DailyRequiredLeagueAtomicProjection[],
): number {
  const families = legs.map(requiredLeagueProjectionMarketFamily);
  const uniqueFamilies = new Set(families);
  const preferredCount = families.filter((family) => spec.preferredFamilies.includes(family)).length;
  let score = preferredCount * 0.06;

  if (spec.preferMixedFamilies) {
    score += uniqueFamilies.size > 1 ? 0.16 : -0.1;
    if (families.includes('result') && families.includes('totals')) score += 0.08;
  }

  if (spec.profile === 'resultados') {
    const resultCount = families.filter((family) => family === 'result').length;
    score += resultCount === legs.length ? 0.26 : -(legs.length - resultCount) * 0.14;
    if (legs.every((projection) => projection.market === 'h2h')) score += 0.08;
  }

  if (spec.profile === 'mixto-seguro') {
    const hasResult = families.includes('result');
    const hasTotals = families.includes('totals');
    score += hasResult && hasTotals ? 0.2 : 0.02;
  }

  if (spec.profile === 'parlay-diamante') {
    score += families.every((family) => family === 'result' || family === 'totals') ? 0.12 : -0.08;
    if (legs.every((projection) => projection.odds <= 1.35)) score += 0.08;
  }

  if (spec.profile === 'parlay-refinado') {
    score += uniqueFamilies.size > 1 ? 0.16 : 0.03;
    if (families.includes('result') && families.includes('totals')) score += 0.08;
  }

  if (spec.profile === 'low-variance') {
    const safeCount = legs.filter((projection) =>
      projection.safetyOverride === 'market-implied-double-chance'
      || projection.safetyOverride === 'market-implied-conservative-total'
      || projection.odds <= 1.35
    ).length;
    score += safeCount * 0.07;
  }

  return round(score, 6);
}

function requiredLeagueProjectionMarketFamily(projection: Pick<DailyRequiredLeagueAtomicProjection, 'market'>): RequiredLeagueMarketFamily {
  if (projection.market === 'h2h' || projection.market === 'double_chance') return 'result';
  if (projection.market === 'goals_over_under' || projection.market === 'btts') return 'totals';
  if (projection.market === 'corners_over_under') return 'corners';
  return 'other';
}

function requiredLeagueProjectionWeakPenalty(projection: DailyRequiredLeagueAtomicProjection): number {
  let penalty = 0;
  const family = requiredLeagueProjectionMarketFamily(projection);
  if (family === 'corners') penalty += 0.55;
  if (projection.confidence < 0.5) penalty += 0.3;
  else if (projection.confidence < 0.55) penalty += 0.12;
  else if (projection.confidence < 0.58) penalty += 0.04;
  if (projection.expectedEdge <= 0) penalty += 0.18;
  else if (projection.expectedEdge < 0.01) penalty += 0.04;
  if (projection.odds < 1.12) penalty += 0.03;
  if (projection.odds > 2.35) penalty += 0.08;
  if (projection.market === 'double_chance' && projection.expectedEdge < 0.015) penalty += 0.05;
  if (projection.market === 'btts' && projection.confidence < 0.56) penalty += 0.06;
  const warningText = projection.warnings.join(' ').toLowerCase();
  if (/corner/.test(warningText)) penalty += 0.2;
  if (/low-confidence|confidence below/.test(warningText)) penalty += 0.04;
  return round(penalty, 6);
}

function requiredLeagueParlayLeg(projection: DailyRequiredLeagueAtomicProjection): ParlayAnalysisRecommendation['legs'][number] {
  return {
    predictionId: projection.predictionId,
    fixtureId: projection.fixtureId,
    fixture: projection.fixture,
    ...(projection.display ? { display: projection.display } : {}),
    market: projection.market,
    selection: projection.selection,
    line: projection.line,
    odds: projection.odds,
    confidence: projection.confidence,
    validationStatus: 'unvalidated',
    warnings: projection.warnings,
    banker: true,
    bankerReason: `required-league addendum leg: confidence ${round(projection.confidence, 3)} edge ${round(projection.expectedEdge, 3)}`,
  };
}

function requiredPredictionCandidateScore(candidate: AtomicPredictionCandidate): number {
  const prediction = candidate.prediction;
  const statusBonus = prediction.status === 'promotable'
    ? 0.5
    : prediction.status === 'candidate'
      ? 0.3
      : prediction.status === 'review-required'
        ? 0.2
        : prediction.status === 'draft'
          ? 0.05
          : -0.5;
  const oddsPenalty = Math.log2(Math.max(1.01, prediction.odds)) * 0.04;
  return round(statusBonus + (prediction.confidence * 0.72) + (Math.max(0, candidate.edge) * 0.3) - oddsPenalty, 6);
}

function requiredAtomicProjectionScore(projection: DailyRequiredLeagueAtomicProjection): number {
  const statusBonus = projection.status === 'promotable' ? 0.2 : projection.status === 'review-required' ? 0.08 : 0;
  return round(statusBonus + (projection.confidence * 0.72) + (Math.max(0, projection.expectedEdge) * 0.3), 6);
}

function requiredLeagueForFixture(
  fixture: Fixture,
  requiredLeagues: readonly DailyRequiredLeagueDefinition[],
): DailyRequiredLeagueDefinition | undefined {
  return requiredLeagues.find((league) => {
    const idMatches = String(fixture.leagueId ?? fixture.competitionId ?? '') === league.providerCompetitionId;
    const nameMatches = league.name && fixture.competitionName
      ? fixture.competitionName.trim().toLowerCase() === league.name.trim().toLowerCase()
      : false;
    if (!idMatches && !nameMatches) return false;
    if (league.season !== null && league.season !== undefined && fixture.season !== undefined && fixture.season !== league.season) return false;
    return true;
  });
}

function sameRequiredLeague(a: DailyRequiredLeagueDefinition, b: DailyRequiredLeagueDefinition): boolean {
  return a.providerCompetitionId === b.providerCompetitionId
    && (a.season ?? null) === (b.season ?? null);
}

function fixtureFallsOnDate(fixture: Fixture, date: string, timezone?: string): boolean {
  const scheduledAt = new Date(fixture.scheduledAt);
  if (!Number.isFinite(scheduledAt.getTime())) return false;
  const window = fixtureDateRange(date, timezone);
  return scheduledAt >= window.start && scheduledAt < window.end;
}

function scoringMatchesFixture(
  scoring: RunPipelineResult['scoring'][number],
  fixture: Fixture,
): boolean {
  return scoring.fixtureId === fixture.id
    || scoring.providerFixtureId === fixture.providerFixtureId
    || scoring.predictions.some((prediction) =>
      prediction.fixtureId === fixture.id || prediction.providerFixtureId === fixture.providerFixtureId
    );
}

function sameFixture(a: Fixture, b: Fixture): boolean {
  return a.id === b.id || a.providerFixtureId === b.providerFixtureId;
}

function emptyFixtureDisplay(): RecommendationLegDisplay {
  return {
    fixtureLabel: '',
    homeTeamName: '',
    awayTeamName: '',
  };
}
