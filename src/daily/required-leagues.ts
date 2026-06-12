import { createHash } from 'node:crypto';
import type { Fixture } from '../domain/fixtures.js';
import type { ParlayAnalysisRecommendation } from '../parlay/analysis.js';
import type { RunPipelineResult } from '../runtime/run-service.js';
import { fixtureDateRange } from '../storage/repositories/helpers.js';
import {
  DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
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
  status: string;
  warnings: string[];
  reasons: string[];
  rationale?: string;
}

export interface DailyRequiredLeagueParlayProjection {
  kind: 'required-league-parlay-projection';
  profile: typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number];
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
    parlayProfiles: readonly typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number][];
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
  const atomicProjections = buildRequiredLeagueAtomicProjections({
    ...input,
    coverageFixtures,
  });
  const parlayProjections = input.requiredLeagues.flatMap((league) => {
    const leagueFixtures = coverageFixtures.filter((fixture) => sameRequiredLeague(fixture.league, league));
    if (!leagueFixtures.length) return [];
    return buildRequiredLeagueParlayProjections(
      league,
      atomicProjections.filter((projection) => sameRequiredLeague(projection.league, league)),
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
      name: 'three-parlay-approaches',
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
      ...(parlayBlocked ? ['rerun required-league addendum after every required fixture has a non-blocked projection'] : []),
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
      objective: 'required league daily projections and three parlay approaches',
      status: goalStatus,
      checks: goalChecks,
      nextActions,
    },
    recommendationPolicy: {
      scope: 'required-league-addendum',
      defaultRequiredLeagues: DAILY_REQUIRED_LEAGUE_DEFAULTS,
      parlayProfiles: DAILY_PREFERRED_PARLAY_PROFILE_ORDER,
      atomicSelection: 'best non-blocked prediction per required fixture, promotable preferred over review-required',
      parlaySelection: 'two distinct required-league fixtures per approach, review-only analytical addendum',
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

function buildRequiredLeagueAtomicProjections(input: {
  providers: readonly DailyE2EProvider[];
  providerPipelineResults: Partial<Record<DailyE2EProvider, RunPipelineResult>>;
  timezone?: string;
  resolveModel: DailyRequiredLeagueModelResolver;
  coverageFixtures: readonly DailyRequiredLeagueCoverageFixture[];
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
        if (prediction.status === 'blocked') continue;
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
    .map((candidates) => toRequiredLeagueAtomicProjection(candidates, requiredFixturesById, requiredFixturesByProviderId))
    .filter((projection): projection is DailyRequiredLeagueAtomicProjection => Boolean(projection))
    .sort((a, b) =>
      requiredAtomicProjectionScore(b) - requiredAtomicProjectionScore(a)
      || b.confidence - a.confidence
      || a.odds - b.odds
    );
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
  const confidence = round(average(ordered.map((candidate) => candidate.prediction.confidence)), 6);
  const edge = round(average(ordered.map((candidate) => candidate.edge)), 6);
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
    status: primary.prediction.status,
    warnings,
    reasons: uniqueStrings([
      `required league ${fixture.league.name ?? fixture.league.providerCompetitionId}`,
      `best available non-blocked projection for ${fixture.fixture}`,
      providers.length > 1 ? `provider agreement: ${providers.join(', ')}` : `provider: ${primary.provider}`,
      `confidence ${round(confidence, 3)}`,
      `edge ${round(edge, 3)}`,
    ]),
    ...(primary.prediction.rationale ? { rationale: primary.prediction.rationale } : {}),
  };
}

function buildRequiredLeagueParlayProjections(
  league: DailyRequiredLeagueDefinition,
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
  fixtureCount: number,
): DailyRequiredLeagueParlayProjection[] {
  const projections = DAILY_PREFERRED_PARLAY_PROFILE_ORDER.map((profile) => {
    const legs = selectRequiredLeagueParlayLegs(profile, atomicProjections);
    if (fixtureCount < 2 || legs.length < 2) {
      return {
        kind: 'required-league-parlay-projection',
        profile,
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
          legs.length < 2 ? 'fewer than two required-league fixtures have non-blocked projections' : '',
        ]),
        riskFlags: ['required-league-addendum', 'blocked'],
      } satisfies DailyRequiredLeagueParlayProjection;
    }
    const combinedOdds = round(legs.reduce((product, projection) => product * projection.odds, 1), 6);
    const aggregateConfidence = round(legs.reduce((product, projection) => product * clamp(projection.confidence, 0.01, 0.99), 1), 6);
    const adjustedProbability = round(clamp(aggregateConfidence, 0.01, 0.99), 6);
    const expectedEdge = round((combinedOdds * adjustedProbability) - 1, 6);
    const sourceRunIds = uniqueStrings(legs.flatMap((projection) => projection.sourceRunIds));
    const providers = uniqueStrings(legs.flatMap((projection) => projection.providers)) as DailyE2EProvider[];
    return {
      kind: 'required-league-parlay-projection',
      profile,
      status: 'selected',
      parlayId: `required-${profile}-${createHash('sha256')
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
        `generated ${profile} addendum from ${legs.length} distinct required fixtures`,
        `providers: ${providers.join(', ') || 'unknown'}`,
      ],
      riskFlags: uniqueStrings([
        'required-league-addendum',
        'review-required',
        ...(expectedEdge <= 0 ? ['non-positive-expected-edge'] : []),
      ]),
    } satisfies DailyRequiredLeagueParlayProjection;
  });
  return dedupeRequiredLeagueParlayProjections(projections);
}

function dedupeRequiredLeagueParlayProjections(
  projections: readonly DailyRequiredLeagueParlayProjection[],
): DailyRequiredLeagueParlayProjection[] {
  const selectedBySignature = new Map<string, DailyRequiredLeagueParlayProjection>();
  return projections.map((projection) => {
    if (projection.status !== 'selected') return projection;
    const signature = requiredLeagueParlaySignature(projection);
    const duplicateOf = selectedBySignature.get(signature);
    if (!duplicateOf) {
      selectedBySignature.set(signature, projection);
      return projection;
    }
    return {
      ...projection,
      status: 'blocked',
      parlayId: null,
      combinedOdds: null,
      aggregateConfidence: null,
      adjustedProbability: null,
      expectedEdge: null,
      sourceRunIds: [],
      providers: [],
      legs: [],
      reasons: uniqueStrings([
        `duplicate of ${duplicateOf.profile}; identical required-league parlay is not published twice`,
        ...projection.reasons,
      ]),
      riskFlags: uniqueStrings([
        ...projection.riskFlags,
        'duplicate-required-league-parlay',
        'blocked',
      ]),
    };
  });
}

function requiredLeagueParlaySignature(projection: DailyRequiredLeagueParlayProjection): string {
  return projection.legs
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
  profile: typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number],
  atomicProjections: readonly DailyRequiredLeagueAtomicProjection[],
): DailyRequiredLeagueAtomicProjection[] {
  const ordered = [...atomicProjections]
    .sort((a, b) => requiredLeagueParlayLegScore(profile, b) - requiredLeagueParlayLegScore(profile, a));
  const selected: DailyRequiredLeagueAtomicProjection[] = [];
  const usedFixtureIds = new Set<string>();
  for (const projection of ordered) {
    if (usedFixtureIds.has(projection.fixtureId)) continue;
    selected.push(projection);
    usedFixtureIds.add(projection.fixtureId);
    if (selected.length >= 2) break;
  }
  return selected;
}

function requiredLeagueParlayLegScore(
  profile: typeof DAILY_PREFERRED_PARLAY_PROFILE_ORDER[number],
  projection: DailyRequiredLeagueAtomicProjection,
): number {
  const oddsPenalty = Math.log2(Math.max(1.01, projection.odds)) * (profile === 'parlay-diamante' ? 0.12 : 0.04);
  const confidenceWeight = profile === 'low-variance' ? 0.85 : 0.72;
  const edgeWeight = profile === 'parlay-refinado' ? 0.32 : 0.2;
  const statusBonus = projection.status === 'promotable' ? 0.18 : projection.status === 'review-required' ? 0.08 : 0;
  const diamanteWindowBonus = profile === 'parlay-diamante' && projection.odds >= 1.08 && projection.odds <= 1.35 ? 0.08 : 0;
  return round((projection.confidence * confidenceWeight) + (Math.max(0, projection.expectedEdge) * edgeWeight) + statusBonus + diamanteWindowBonus - oddsPenalty, 6);
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
