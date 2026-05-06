import type { Fixture } from '../domain/fixtures.js';
import type { CanonicalOddsSnapshot, FixtureStatistics } from '../providers/sports/types.js';
import { NO_MONETARY_ACTIONS_PROMPT } from '../security/no-monetary-actions.js';

export const RESEARCH_FIXTURE_PROMPT_VERSION = 'research-fixture-v2';
export const SCORE_PREDICTION_PROMPT_VERSION = 'score-prediction-v1';

export type ResearchWebMode = 'off' | 'cached' | 'live';

export interface BuildResearchFixturePromptInput {
  fixture: Fixture;
  web: ResearchWebMode;
  oddsSnapshot?: CanonicalOddsSnapshot;
  fixtureStatistics?: FixtureStatistics;
  providerContextWarnings?: string[];
  runId: string;
  createdAt: string;
}

export interface BuildScorePredictionPromptInput {
  runId: string;
  createdAt: string;
  web: ResearchWebMode;
  fixture: unknown;
  fixtureStatistics?: FixtureStatistics | null;
  oddsSnapshot: unknown;
  researchBundle: unknown;
  sources?: unknown[];
  evidenceItems: unknown[];
  claims: unknown[];
  allowedQuotes: unknown[];
  providerContextWarnings?: string[];
}

export function buildResearchFixturePrompt(input: BuildResearchFixturePromptInput): string {
  const oddsSummary = input.oddsSnapshot
    ? input.oddsSnapshot.quotes.slice(0, 40).map((quote) => ({
      market: quote.market,
      selection: quote.selection,
      line: quote.line ?? null,
      price: quote.price,
      impliedProbability: quote.impliedProbability,
      bookmaker: quote.bookmaker ?? null,
      capturedAt: quote.capturedAt,
      sourceSnapshotId: quote.sourceSnapshotId,
    }))
    : [];

  const payload = {
    promptVersion: RESEARCH_FIXTURE_PROMPT_VERSION,
    runId: input.runId,
    createdAt: input.createdAt,
    webMode: input.web,
    fixture: input.fixture,
    fixtureStatistics: input.fixtureStatistics ?? null,
    oddsSnapshot: input.oddsSnapshot
      ? {
        fixtureId: input.oddsSnapshot.fixtureId,
        providerFixtureId: input.oddsSnapshot.providerFixtureId,
        providerSnapshotId: input.oddsSnapshot.providerSnapshotId,
        oddsSnapshotId: input.oddsSnapshot.oddsSnapshotId ?? null,
        capturedAt: input.oddsSnapshot.capturedAt,
        bookmakerCount: input.oddsSnapshot.bookmakerCount,
        payloadHash: input.oddsSnapshot.payloadHash,
        quotes: oddsSummary,
      }
      : null,
    providerContextWarnings: input.providerContextWarnings ?? [],
  };

  return [
    'Produce structured football research for the fixture below.',
    'Return only valid JSON starting with "{" as the first character. Do not wrap it in markdown. Do not include prose outside JSON.',
    NO_MONETARY_ACTIONS_PROMPT,
    '',
    'Allowed source types: api-football, provider-snapshot, web-search, db, artifact.',
    'Use API-Football fixture, statistics, and odds context as provider evidence when present.',
    'If webMode is live or cached, use native web search and include at least one source with type "web-search" in the returned JSON.',
    'Every EvidenceItem.sourceId must reference a SourceRecord.id.',
    'Every Claim.evidenceIds entry must reference an EvidenceItem.id.',
    'Claims with subject.type "market" must use one canonical market key: h2h, double_chance, goals_over_under, corners_over_under, btts.',
    'Set gateResult.verdict to "promotable" only when the research is supported by sufficient evidence, no material conflicts are present, and web-search evidence is included when webMode is live or cached.',
    'Set gateResult.verdict to "review-required" when evidence is partial, required web-search evidence is missing, or factual uncertainty remains.',
    'Set gateResult.verdict to "blocked" only when the research cannot be structured from the available data.',
    '',
    'Required JSON shape:',
    JSON.stringify({
      sources: [{
        id: 'source_1',
        type: 'web-search',
        url: 'https://example.com/source',
        title: 'Source title',
        capturedAt: 'ISO-8601 timestamp',
        hash: 'optional hash or external id',
        metadata: {},
      }],
      evidenceItems: [{
        id: 'evidence_1',
        sourceId: 'source_1',
        claimIds: ['claim_1'],
        snippet: 'short redacted excerpt',
        summary: 'brief evidence summary',
        confidence: 0.75,
        metadata: {},
      }],
      claims: [{
        id: 'claim_1',
        statement: 'specific factual claim',
        subject: { type: 'fixture', id: payload.fixture.id },
        supportLevel: 'supported',
        evidenceIds: ['evidence_1'],
        conflictStatus: 'none',
        metadata: {},
      }],
      gateResult: {
        verdict: 'promotable',
        reasons: ['structured research generated with sufficient evidence'],
        warnings: [],
      },
      warnings: [],
      metadata: {},
    }, null, 2),
    '',
    'Input:',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

export function buildScorePredictionPrompt(input?: BuildScorePredictionPromptInput): string {
  const payload = input
    ? {
      promptVersion: SCORE_PREDICTION_PROMPT_VERSION,
      runId: input.runId,
      createdAt: input.createdAt,
      webMode: input.web,
      fixture: input.fixture,
      fixtureStatistics: input.fixtureStatistics ?? null,
      oddsSnapshot: input.oddsSnapshot,
      researchBundle: input.researchBundle,
      sources: input.sources ?? [],
      evidenceItems: input.evidenceItems,
      claims: input.claims,
      allowedQuotes: input.allowedQuotes,
      providerContextWarnings: input.providerContextWarnings ?? [],
    }
    : null;

  return [
    'Score football prediction candidates for the provided fixture context.',
    'Return only valid JSON. Do not wrap it in markdown. Do not include prose outside JSON.',
    NO_MONETARY_ACTIONS_PROMPT,
    '',
    `Prompt version: ${SCORE_PREDICTION_PROMPT_VERSION}.`,
    'Select analytical picks across every canonical market that has an available allowedQuote for this fixture.',
    'Emit at least one prediction per available market when evidence is sufficient; if a market is thin or uncertain, still emit the best analytical candidate with explicit warnings instead of silently omitting it.',
    'Every prediction must reference persisted oddsQuoteId values and evidenceIds from the supplied research bundle.',
    'Use canonical markets only: h2h, double_chance, goals_over_under, corners_over_under, btts.',
    'Do not invent odds, fixtures, evidence, providers, models, prompt versions, or scoring rule versions.',
    'Only select quotes listed in allowedQuotes. The market, selection, line, and odds must match that quote exactly.',
    'Use API-Football statistics and web-search evidence when present, especially for injuries, news, rotations, goals, BTTS, and corners context.',
    '',
    'Required JSON shape:',
    JSON.stringify({
      predictions: [{
        oddsQuoteId: 'persisted-odds-quote-id',
        market: 'h2h',
        selection: 'home',
        line: null,
        odds: 1.85,
        probability: 0.61,
        confidence: 0.72,
        evidenceIds: ['persisted-evidence-id'],
        claimIds: ['persisted-claim-id'],
        rationale: 'brief redacted rationale grounded in the supplied context',
        warnings: [],
      }],
      warnings: [],
      metadata: {},
    }, null, 2),
    ...(payload ? ['', 'Input:', JSON.stringify(payload, null, 2)] : []),
  ].join('\n');
}
