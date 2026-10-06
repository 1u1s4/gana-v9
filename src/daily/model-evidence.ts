import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A documentary index, never a second scoring engine or an approval fallback. */
export function buildDailyModelEvidence(artifactRoot: string, date: string, sourceRunIds: string[]) {
  const predictions: Array<Record<string, unknown>> = [];
  const missingArtifacts: string[] = [];
  const lowOdds: Array<Record<string, unknown>> = [];
  for (const runId of [...new Set(sourceRunIds)]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(runId)) continue;
    const runPath = join(artifactRoot, 'runs', runId);
    const scoring = readJson(join(runPath, 'scoring-results.json'));
    // Parlay-only child runs have no fixture scoring; the provider run owns it.
    if (!Array.isArray(scoring?.results)) continue;
    const researchPath = join(runPath, 'research-results.json');
    const research = readJson(researchPath);
    if (!Array.isArray(research?.results)) missingArtifacts.push(researchPath);
    const bundles = new Map((research?.results ?? []).flatMap((result: any) => result.bundle ? [[result.bundle.id, result.bundle]] : [])) as Map<string, any>;
    for (const result of scoring.results) {
      for (const prediction of [...(result.predictions ?? []), ...(result.lowOddsPriceVariants ?? [])]) {
        const bundle = bundles.get(prediction.researchBundleId);
        const localId = (id: string) => bundle && id.startsWith(`${bundle.id}:`) ? id.slice(bundle.id.length + 1) : id;
        const claimedIds = new Set((prediction.claimIds ?? []).map(localId));
        const claims = (bundle?.claims ?? []).filter((claim: any) => claimedIds.has(claim.id));
        const evidenceIds = new Set([...(prediction.evidenceIds ?? []).map(localId), ...claims.flatMap((claim: any) => claim.evidenceIds ?? [])]);
        const evidence = (bundle?.evidenceItems ?? []).filter((item: any) => evidenceIds.has(item.id));
        const sourceIds = new Set(evidence.map((item: any) => item.sourceId));
        predictions.push({ predictionId: prediction.id, fixtureId: prediction.fixtureId, runId,
          market: prediction.market, selection: prediction.selection, line: prediction.line ?? null,
          odds: prediction.odds, model: prediction.model, promptVersion: prediction.promptVersion,
          modelProbability: prediction.modelProbability ?? prediction.probability ?? null,
          confidence: prediction.confidence, edge: prediction.edge, status: prediction.status,
          rationale: prediction.rationale ?? null, warnings: prediction.warnings, blockers: prediction.blockers,
          oddsSnapshotId: prediction.oddsSnapshotId, oddsQuoteId: prediction.oddsQuoteId,
          researchBundleId: prediction.researchBundleId, researchGate: bundle?.gateResult ?? null,
          evidenceIds: [...evidenceIds], claimIds: prediction.claimIds ?? [],
          claims, evidence, sources: (bundle?.sources ?? []).filter((source: any) => sourceIds.has(source.id)),
          traceComplete: Boolean(bundle && claims.length && claims.length === claimedIds.size
            && evidence.length && evidence.length === evidenceIds.size
            && evidence.every((item: any) => bundle.sources.some((source: any) => source.id === item.sourceId))),
          sourceArtifacts: { research: researchPath, scoring: join(runPath, 'scoring-results.json') },
        });
      }
    }
    const scan = readJson(join(runPath, 'low-odds-scan.json'));
    if (scan) lowOdds.push({ runId, threshold: scan.threshold, fixtures: scan.fixtureCount, quoteHits: scan.hitCount,
      uniqueFavorites: new Set((scan.hits ?? []).map((hit: any) => hit.fixtureId)).size,
      coverage: readJson(join(runPath, 'low-odds-coverage-audit.json')), scanErrors: scan.scanErrors ?? [],
    });
  }
  return { schemaVersion: 1, date, kind: 'daily-model-evidence',
    purpose: 'Documentary model decisions, including abstentions; no automatic promotion',
    predictions, lowOdds, missingArtifacts };
}

function readJson(path: string): any {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}
