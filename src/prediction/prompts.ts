import type { Fixture } from '../domain/fixtures.js';
import type { CanonicalOddsSnapshot } from '../providers/sports/types.js';
import { NO_MONETARY_ACTIONS_PROMPT } from '../security/no-monetary-actions.js';

export const RESEARCH_FIXTURE_PROMPT_VERSION = 'research-fixture-v1';
export const SCORE_PREDICTION_PROMPT_VERSION = 'score-prediction-v1';

export type ResearchWebMode = 'off' | 'cached' | 'live';

export interface BuildResearchFixturePromptInput {
  fixture: Fixture;
  web: ResearchWebMode;
  oddsSnapshot?: CanonicalOddsSnapshot;
  runId: string;
  createdAt: string;
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
  };

  return [
    'Produce structured football research for the fixture below.',
    'Return only valid JSON. Do not wrap it in markdown. Do not include prose outside JSON.',
    NO_MONETARY_ACTIONS_PROMPT,
    '',
    'Allowed source types: api-football, provider-snapshot, web-search, db, artifact.',
    'If webMode is live or cached, use native web search and include at least one source with type "web-search".',
    'Every EvidenceItem.sourceId must reference a SourceRecord.id.',
    'Every Claim.evidenceIds entry must reference an EvidenceItem.id.',
    'Claims with subject.type "market" must use one canonical market key: h2h, double_chance, goals_over_under, corners_over_under, btts.',
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
        verdict: 'review-required',
        reasons: ['structured research generated'],
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

export function buildScorePredictionPrompt(): string {
  return [
    'Score football prediction candidates for the provided fixture context.',
    'Return only valid JSON. Do not wrap it in markdown. Do not include prose outside JSON.',
    NO_MONETARY_ACTIONS_PROMPT,
    '',
    `Prompt version: ${SCORE_PREDICTION_PROMPT_VERSION}.`,
    'Every prediction must reference persisted oddsQuoteId values and evidenceIds from the supplied research bundle.',
    'Use canonical markets only: h2h, double_chance, goals_over_under, corners_over_under, btts.',
    'Do not invent odds, fixtures, evidence, providers, models, prompt versions, or scoring rule versions.',
  ].join('\n');
}
