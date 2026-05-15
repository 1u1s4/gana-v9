import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDailyProviderComparison } from './comparison.js';
import type { PredictionRecordView } from '../prediction/types.js';
import type { RunPipelineResult } from '../runtime/run-service.js';

describe('daily provider comparison', () => {
  it('classifies same selection, disagreement, and provider-only predictions', () => {
    const { comparison, consensus } = buildDailyProviderComparison({
      dailyBatchId: 'daily-2026-05-14',
      date: '2026-05-14',
      providers: [
        {
          provider: 'codex',
          model: 'gpt-5.5',
          runId: 'codex-run',
          result: pipelineResult('codex-run', [
            prediction({ id: 'c-1', fixtureId: 'fixture-a', providerFixtureId: '100', market: 'h2h', selection: 'home', confidence: 0.8, edge: 0.04 }),
            prediction({ id: 'c-2', fixtureId: 'fixture-b', providerFixtureId: '101', market: 'btts', selection: 'yes', confidence: 0.7, edge: 0.03 }),
            prediction({ id: 'c-3', fixtureId: 'fixture-c', providerFixtureId: '102', market: 'h2h', selection: 'away', confidence: 0.65, edge: 0.01 }),
          ]),
        },
        {
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          runId: 'gemini-run',
          result: pipelineResult('gemini-run', [
            prediction({ id: 'g-1', fixtureId: 'fixture-a', providerFixtureId: '100', market: 'h2h', selection: 'home', confidence: 0.74, edge: 0.02 }),
            prediction({ id: 'g-2', fixtureId: 'fixture-b', providerFixtureId: '101', market: 'btts', selection: 'no', confidence: 0.66, edge: -0.01 }),
            prediction({ id: 'g-3', fixtureId: 'fixture-d', providerFixtureId: '103', market: 'double_chance', selection: 'home_or_draw', confidence: 0.82, edge: 0.05 }),
          ]),
        },
      ],
    });

    assert.equal(comparison.summary.comparablePredictions, 6);
    assert.equal(comparison.summary.sameSelection, 1);
    assert.equal(comparison.summary.sameMarketDifferentSelection, 1);
    assert.equal(comparison.summary.onlyCodex, 1);
    assert.equal(comparison.summary.onlyGemini, 1);
    assert.equal(comparison.summary.agreementRate, 0.5);
    assert.equal(comparison.providerSummaries[0]?.totalPredictions, 3);
    assert.equal(comparison.analyticalArtifactOnly, true);
    assert.equal(comparison.executionCapability, 'none');
    assert.equal(consensus.summary.consensusPredictions, 1);
    assert.deepEqual(consensus.summary.providers, ['codex', 'gemini']);
    assert.equal(consensus.items[0]?.classification, 'same-selection');
  });

  it('keeps same-market line disagreements together for LLM review', () => {
    const { comparison, consensus } = buildDailyProviderComparison({
      dailyBatchId: 'daily-2026-05-14',
      date: '2026-05-14',
      providers: [
        {
          provider: 'codex',
          model: 'gpt-5.5',
          runId: 'codex-run',
          result: pipelineResult('codex-run', [
            prediction({ id: 'c-1', fixtureId: 'fixture-a', providerFixtureId: '100', market: 'goals_over_under', selection: 'under', line: 2.5 }),
            prediction({ id: 'c-2', fixtureId: 'fixture-b', providerFixtureId: '101', market: 'goals_over_under', selection: 'under', line: 2.5 }),
          ]),
        },
        {
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          runId: 'gemini-run',
          result: pipelineResult('gemini-run', [
            prediction({ id: 'g-1', fixtureId: 'fixture-a', providerFixtureId: '100', market: 'goals_over_under', selection: 'over', line: 2.5 }),
            prediction({ id: 'g-2', fixtureId: 'fixture-b', providerFixtureId: '101', market: 'goals_over_under', selection: 'under', line: 1.5 }),
          ]),
        },
      ],
    });

    assert.equal(comparison.summary.matchedGroups, 2);
    assert.equal(comparison.summary.sameSelection, 0);
    assert.equal(comparison.summary.sameMarketDifferentSelection, 1);
    assert.equal(comparison.summary.sameSelectionDifferentLine, 1);
    assert.equal(comparison.summary.materialDisagreements, 2);
    assert.equal(comparison.summary.disagreementRate, 1);
    assert.deepEqual(comparison.items.map((item) => item.classification), [
      'same-selection-different-line',
      'same-market-different-selection',
    ]);
    assert.deepEqual(comparison.items[0]?.providers.map((provider) => `${provider.provider}:${provider.selection}:${provider.line}`), [
      'codex:under:2.5',
      'gemini:under:1.5',
    ]);
    assert.equal(consensus.summary.consensusPredictions, 0);
  });
});

function pipelineResult(runId: string, predictions: PredictionRecordView[]): RunPipelineResult {
  return {
    ok: true,
    runId,
    date: '2026-05-14',
    status: 'succeeded',
    verdict: 'promotable',
    artifactDir: `/tmp/${runId}`,
    artifactPath: `/tmp/${runId}`,
    evidencePackPath: `/tmp/${runId}/evidence-pack.json`,
    handoffPath: `/tmp/${runId}/handoff.md`,
    steps: [],
    fixtures: [],
    lowOddsScan: { date: '2026-05-14', threshold: 1.2, fixtureCount: 0, hitCount: 0, hits: [], fixtureEvaluations: [] },
    oddsSnapshots: [],
    research: [],
    scoring: [{ ok: true, runId, gateResult: { verdict: 'promotable', reasons: [], warnings: [] }, predictions }],
  } as RunPipelineResult;
}

function prediction(input: Partial<PredictionRecordView> & Pick<PredictionRecordView, 'id' | 'fixtureId' | 'providerFixtureId' | 'market' | 'selection'>): PredictionRecordView {
  return {
    runId: 'run',
    oddsSnapshotId: 'snapshot',
    oddsQuoteId: `quote-${input.id}`,
    odds: 1.8,
    impliedProbability: 0.55,
    confidence: 0.7,
    confidenceBand: 'medium',
    quality: 'medium',
    edge: 0.02,
    evidenceIds: ['evidence-1'],
    claimIds: [],
    blockers: [],
    warnings: [],
    status: 'promotable',
    promptVersion: 'score-prediction-v2',
    scoringRuleVersion: 'scoring-v2',
    ...input,
  } as PredictionRecordView;
}
