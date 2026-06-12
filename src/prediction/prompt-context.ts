import type {
  ClaimRecord,
  EvidenceItemRecord,
  FixtureRecord,
  JsonValue,
  OddsQuoteRecord,
  OddsSnapshotRecord,
  ResearchBundleRecord,
  SourceRecordRecord,
} from '../storage/types.js';

export const MAX_ALLOWED_QUOTES_IN_SCORE_PROMPT = 80;

export function toAllowedQuote(quote: OddsQuoteRecord) {
  return {
    oddsQuoteId: quote.id,
    market: quote.marketKey,
    selection: quote.selectionKey,
    line: numberOrNull(quote.line),
    odds: numberValue(quote.price),
    impliedProbability: numberOrNull(quote.impliedProbability),
    marketImpliedProbability: numberOrNull(quote.marketImpliedProbability),
    marketFairProbability: numberOrNull(quote.marketFairProbability),
    consensusFairOdds: numberOrNull(quote.consensusFairOdds),
    overround: numberOrNull(quote.overround),
    marketEfficiencyScore: numberOrNull(quote.marketEfficiencyScore),
    lowLiquidity: metadataBool(quote.metadata, 'lowLiquidity'),
    bookmaker: quote.bookmaker,
    capturedAt: quote.capturedAt instanceof Date ? quote.capturedAt.toISOString() : String(quote.capturedAt),
  };
}

export function selectScoringPromptQuotes(
  quotes: OddsQuoteRecord[],
  maxQuotes = MAX_ALLOWED_QUOTES_IN_SCORE_PROMPT,
): OddsQuoteRecord[] {
  const grouped = new Map<string, OddsQuoteRecord>();
  for (const quote of quotes) {
    const key = [
      quote.marketKey,
      quote.selectionKey,
      numberOrNull(quote.line) ?? 'null',
    ].join(':');
    const current = grouped.get(key);
    if (!current || numberValue(quote.price) > numberValue(current.price)) {
      grouped.set(key, quote);
    }
  }

  return [...grouped.values()]
    .sort(comparePromptQuotes)
    .slice(0, maxQuotes);
}

function comparePromptQuotes(a: OddsQuoteRecord, b: OddsQuoteRecord): number {
  return marketPriority(a.marketKey) - marketPriority(b.marketKey)
    || linePriority(a) - linePriority(b)
    || String(a.selectionKey).localeCompare(String(b.selectionKey))
    || numberValue(b.price) - numberValue(a.price)
    || String(a.bookmaker ?? '').localeCompare(String(b.bookmaker ?? ''));
}

function marketPriority(market: string | null | undefined): number {
  switch (market) {
    case 'h2h': return 0;
    case 'double_chance': return 1;
    case 'goals_over_under': return 2;
    case 'btts': return 3;
    case 'corners_over_under': return 4;
    default: return 10;
  }
}

function linePriority(quote: OddsQuoteRecord): number {
  const line = numberOrNull(quote.line);
  if (line === null) return 0;
  const preferred = quote.marketKey === 'corners_over_under'
    ? [8.5, 9.5, 10.5, 7.5, 11.5, 8, 9, 10, 11]
    : [1.5, 2.5, 3.5, 0.5, 4.5, 5.5, 2.25, 2.75, 3.25, 3.75];
  const exact = preferred.indexOf(line);
  if (exact >= 0) return exact;
  const nearest = Math.min(...preferred.map((candidate) => Math.abs(candidate - line)));
  return preferred.length + nearest;
}

export function fixturePromptView(fixture: FixtureRecord) {
  const metadata = fixture.metadata && typeof fixture.metadata === 'object' && !Array.isArray(fixture.metadata)
    ? fixture.metadata as Record<string, any>
    : {};
  const raw = metadata.raw && typeof metadata.raw === 'object' ? metadata.raw as Record<string, any> : {};
  return {
    id: fixture.id,
    providerFixtureId: fixture.providerFixtureId,
    competitionId: fixture.competitionId,
    season: fixture.season,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    scheduledAt: fixture.scheduledAt instanceof Date ? fixture.scheduledAt.toISOString() : fixture.scheduledAt,
    status: fixture.status,
    scoreHome: fixture.scoreHome,
    scoreAway: fixture.scoreAway,
    includedByFilters: fixture.includedByFilters,
    metadata: compactJson({
      league: raw.league
        ? {
          id: raw.league.id,
          name: raw.league.name,
          country: raw.league.country,
          season: raw.league.season,
          round: raw.league.round,
        }
        : undefined,
      teams: raw.teams
        ? {
          home: raw.teams.home ? { id: raw.teams.home.id, name: raw.teams.home.name } : undefined,
          away: raw.teams.away ? { id: raw.teams.away.id, name: raw.teams.away.name } : undefined,
        }
        : undefined,
      venue: metadata.venue,
      round: metadata.round,
      timezone: metadata.timezone,
      apiFootballStatusShort: metadata.apiFootballStatusShort,
      apiFootballStatusLong: metadata.apiFootballStatusLong,
    }),
  };
}

export function oddsSnapshotPromptView(snapshot: OddsSnapshotRecord) {
  return {
    id: snapshot.id,
    fixtureId: snapshot.fixtureId,
    providerFixtureId: snapshot.providerFixtureId,
    providerSnapshotId: snapshot.providerSnapshotId,
    bookmakerCount: snapshot.bookmakerCount,
    capturedAt: snapshot.capturedAt instanceof Date ? snapshot.capturedAt.toISOString() : String(snapshot.capturedAt),
    payloadHash: snapshot.payloadHash,
  };
}

export function researchBundlePromptView(bundle: ResearchBundleRecord | null) {
  if (!bundle) return null;
  return {
    id: bundle.id,
    runId: bundle.runId,
    status: bundle.status,
    gateResult: bundle.gateResult,
    providerAgentic: bundle.providerAgentic,
    model: bundle.model,
    promptVersion: bundle.promptVersion,
    warnings: bundle.warnings,
    metadata: bundle.metadata,
  };
}

export function sourcePromptView(source: SourceRecordRecord) {
  return {
    id: source.id,
    type: source.sourceType,
    url: source.url,
    title: source.title,
    externalId: source.externalId,
    providerSnapshotId: source.providerSnapshotId,
    capturedAt: source.capturedAt instanceof Date ? source.capturedAt.toISOString() : String(source.capturedAt),
    metadata: source.metadata,
  };
}

export function evidencePromptView(evidence: EvidenceItemRecord) {
  return {
    id: evidence.id,
    sourceId: evidence.sourceId,
    summary: evidence.summaryRedacted,
    confidence: numberOrNull(evidence.confidence),
    claimIds: evidence.claimIds,
    metadata: evidence.metadata,
  };
}

export function claimPromptView(claim: ClaimRecord) {
  return {
    id: claim.id,
    statement: claim.statement,
    marketKey: claim.marketKey,
    selectionKey: claim.selectionKey,
    line: numberOrNull(claim.line),
    supportLevel: claim.supportLevel,
    confidence: numberOrNull(claim.confidence),
    evidenceIds: claim.evidenceIds,
    conflictStatus: claim.conflictStatus,
  };
}

export function hasRealWebResearchSource(sources: SourceRecordRecord[]): boolean {
  return sources.some(isRealWebSourceRecord);
}

export function isRealWebSourceRecord(source: SourceRecordRecord): boolean {
  if (source.sourceType !== 'web-search') return false;
  const metadata = objectMetadata(source.metadata);
  if (metadata.synthesized === true || metadata.repaired === true) return false;
  return Boolean(source.url || source.externalId);
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return NaN;
}

function numberOrNull(value: unknown): number | null {
  const parsed = numberOrUndefined(value);
  return parsed ?? null;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metadataBool(metadata: unknown, key: string): boolean | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function objectMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, val]) => val !== undefined)))) as JsonValue;
}
