import type { ClaimRecord, DbDecimal, EvidenceItemRecord, FixtureRecord, ResearchBundleRecord } from '../storage/types.js';

export type PredictionGateVerdict = 'promotable' | 'review-required' | 'blocked';

export interface PredictionGateResult {
  verdict: PredictionGateVerdict;
  reasons: string[];
  warnings: string[];
}

export interface EvidenceGateInput {
  researchBundle?: ResearchBundleRecord | {
    id?: string;
    status?: string | null;
    gateResult?: unknown;
    evidenceItems?: Array<Partial<EvidenceItemRecord> & { id: string; confidence?: DbDecimal | null }>;
    claims?: Array<Partial<ClaimRecord> & { id: string; evidenceIds?: unknown }>;
  } | null;
  evidenceItems?: Array<Partial<EvidenceItemRecord> & { id: string; confidence?: DbDecimal | null }>;
  claims?: Array<Partial<ClaimRecord> & { id: string; evidenceIds?: unknown }>;
}

export interface EvidenceGateResult {
  sufficient: boolean;
  evidenceIds: string[];
  claimIds: string[];
  confidence: number;
  reasons: string[];
  warnings: string[];
}

export interface EvaluatePredictionGatesInput extends EvidenceGateInput {
  fixture?: FixtureRecord | {
    id?: string;
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    scheduledAt?: Date | string | null;
  } | null;
  hasOddsSnapshot?: boolean;
  hasOddsQuote?: boolean;
  oddsQuotes?: unknown[];
  marketValid?: boolean;
  dbWritable?: boolean;
  webResearchRequired?: boolean;
  hasWebResearch?: boolean;
}

export function evaluateEvidenceGate(input: EvidenceGateInput): EvidenceGateResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const bundle = input.researchBundle;
  const evidenceItems = input.evidenceItems ?? (bundle && 'evidenceItems' in bundle ? bundle.evidenceItems ?? [] : []);
  const claims = input.claims ?? (bundle && 'claims' in bundle ? bundle.claims ?? [] : []);
  const bundleStatus = researchBundleStatus(bundle);

  if (!bundle) reasons.push('missing research bundle');
  if (bundleStatus === 'blocked') reasons.push('research bundle is blocked');

  const strongEvidenceIds = new Set(
    evidenceItems
      .filter((evidence) => numberValue(evidence.confidence) >= 0.5)
      .map((evidence) => evidence.id),
  );
  const validClaims = claims.filter((claim) => {
    if (claim.conflictStatus === 'conflict') return false;
    const ids = jsonStringArray(claim.evidenceIds);
    return ids.some((id) => strongEvidenceIds.has(id));
  });
  const linkedEvidenceIds = new Set<string>();
  for (const claim of validClaims) {
    for (const evidenceId of jsonStringArray(claim.evidenceIds)) {
      if (strongEvidenceIds.has(evidenceId)) linkedEvidenceIds.add(evidenceId);
    }
  }

  if (validClaims.length < 1) reasons.push('insufficient evidence: at least one valid claim is required');
  if (linkedEvidenceIds.size < 2) reasons.push('insufficient evidence: at least two linked evidence items with confidence >= 0.5 are required');

  const confidenceValues = [...linkedEvidenceIds]
    .map((id) => evidenceItems.find((evidence) => evidence.id === id))
    .map((evidence) => numberValue(evidence?.confidence))
    .filter((value) => Number.isFinite(value));
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;

  if (bundle && bundleStatus !== 'promotable') {
    warnings.push('research is not promotable');
  }

  return {
    sufficient: reasons.length === 0,
    evidenceIds: [...linkedEvidenceIds],
    claimIds: validClaims.map((claim) => claim.id),
    confidence,
    reasons,
    warnings,
  };
}

export function evaluatePredictionGates(input: EvaluatePredictionGatesInput): PredictionGateResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const fixture = input.fixture;

  if (!fixture) {
    reasons.push('missing fixture');
  } else if (!isFixtureNormalized(fixture)) {
    reasons.push('missing normalized fixture');
  }

  const hasOdds = input.hasOddsSnapshot ?? Boolean(input.oddsQuotes?.length);
  if (!hasOdds) reasons.push('missing persisted odds snapshot');
  if (input.hasOddsQuote === false) reasons.push('missing persisted odds quote');
  if (input.marketValid === false) reasons.push('invalid market or selection');
  if (input.dbWritable === false) reasons.push('database write unavailable');

  const evidence = evaluateEvidenceGate(input);
  if (!evidence.sufficient) warnings.push(...evidence.reasons);
  warnings.push(...evidence.warnings);

  if (input.webResearchRequired && !input.hasWebResearch) {
    warnings.push('web research required but no web-search source was linked');
  }

  if (reasons.length) {
    return { verdict: 'blocked', reasons, warnings };
  }

  if (!evidence.sufficient || warnings.length) {
    return {
      verdict: 'review-required',
      reasons: evidence.sufficient ? ['prediction requires review'] : ['insufficient evidence'],
      warnings,
    };
  }

  return {
    verdict: 'promotable',
    reasons: ['prediction gates passed'],
    warnings: [],
  };
}

export function isFixtureNormalized(fixture: {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  scheduledAt?: Date | string | null;
}): boolean {
  return Boolean(fixture.homeTeamId && fixture.awayTeamId && fixture.scheduledAt);
}

export function aggregatePredictionGate(results: PredictionGateResult[]): PredictionGateResult {
  if (!results.length) {
    return { verdict: 'blocked', reasons: ['no predictions generated'], warnings: [] };
  }
  const warnings = [...new Set(results.flatMap((result) => result.warnings))];
  if (results.every((result) => result.verdict === 'blocked')) {
    return {
      verdict: 'blocked',
      reasons: [...new Set(results.flatMap((result) => result.reasons))],
      warnings,
    };
  }
  if (results.some((result) => result.verdict === 'review-required' || result.verdict === 'blocked')) {
    return {
      verdict: 'review-required',
      reasons: ['one or more predictions require review'],
      warnings,
    };
  }
  return { verdict: 'promotable', reasons: ['prediction gates passed'], warnings };
}

function researchBundleStatus(bundle: EvidenceGateInput['researchBundle']): string | undefined {
  if (!bundle) return undefined;
  if ('status' in bundle && typeof bundle.status === 'string') return bundle.status;
  const gate = 'gateResult' in bundle ? bundle.gateResult : undefined;
  if (gate && typeof gate === 'object' && !Array.isArray(gate)) {
    const verdict = (gate as { verdict?: unknown }).verdict;
    return typeof verdict === 'string' ? verdict : undefined;
  }
  return undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return 0;
}

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
