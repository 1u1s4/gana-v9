import { isMarketKey } from '../domain/markets.js';
import {
  type Claim,
  type EvidenceItem,
  type ResearchBundle,
  type ResearchValidationIssue,
  claimSchema,
  evidenceItemSchema,
  researchBundleSchema,
} from './types.js';

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: ResearchValidationIssue[];
}

export function validateClaim(input: unknown): ValidationResult<Claim> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(toIssue) };
  }

  const issues = validateClaimSubject(parsed.data);
  return {
    ok: issues.length === 0,
    value: issues.length === 0 ? parsed.data : undefined,
    issues,
  };
}

export function validateEvidenceItem(input: unknown): ValidationResult<EvidenceItem> {
  const parsed = evidenceItemSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data, issues: [] }
    : { ok: false, issues: parsed.error.issues.map(toIssue) };
}

export function validateResearchBundle(input: unknown): ValidationResult<ResearchBundle> {
  const parsed = researchBundleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(toIssue) };
  }

  const issues = validateResearchBundleLinks(parsed.data);
  return {
    ok: issues.length === 0,
    value: issues.length === 0 ? parsed.data as ResearchBundle : undefined,
    issues,
  };
}

export function validateResearchBundleLinks(bundle: ResearchBundle): ResearchValidationIssue[] {
  const issues: ResearchValidationIssue[] = [];
  const sourceIds = new Set(bundle.sources.map((source) => source.id));
  const evidenceIds = new Set(bundle.evidenceItems.map((evidence) => evidence.id));
  const claimIds = new Set(bundle.claims.map((claim) => claim.id));

  for (const [index, evidence] of bundle.evidenceItems.entries()) {
    if (!sourceIds.has(evidence.sourceId)) {
      issues.push({
        path: `evidenceItems.${index}.sourceId`,
        message: `EvidenceItem references unknown source "${evidence.sourceId}".`,
      });
    }
    for (const claimId of evidence.claimIds) {
      if (!claimIds.has(claimId)) {
        issues.push({
          path: `evidenceItems.${index}.claimIds`,
          message: `EvidenceItem references unknown claim "${claimId}".`,
        });
      }
    }
  }

  for (const [index, claim] of bundle.claims.entries()) {
    issues.push(...validateClaimSubject(claim, `claims.${index}.subject`));
    if (claim.evidenceIds.length === 0) {
      issues.push({
        path: `claims.${index}.evidenceIds`,
        message: 'Claim requires at least one evidence ID.',
      });
    }
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({
          path: `claims.${index}.evidenceIds`,
          message: `Claim references unknown evidence "${evidenceId}".`,
        });
      }
    }
  }

  return issues;
}

export function mergeGateWarnings(bundle: ResearchBundle, warnings: string[]): ResearchBundle {
  const uniqueWarnings = [...new Set([...bundle.warnings, ...warnings])];
  const gateWarnings = [...new Set([...bundle.gateResult.warnings, ...warnings])];
  const verdict = bundle.gateResult.verdict === 'promotable' && warnings.length
    ? 'review-required'
    : bundle.gateResult.verdict;

  return {
    ...bundle,
    warnings: uniqueWarnings,
    gateResult: {
      ...bundle.gateResult,
      verdict,
      warnings: gateWarnings,
    },
  };
}

function validateClaimSubject(claim: Pick<Claim, 'subject'>, path = 'subject'): ResearchValidationIssue[] {
  if (claim.subject.type === 'market' && !isMarketKey(claim.subject.market)) {
    return [{
      path: `${path}.market`,
      message: 'Market claim subject requires a canonical market key.',
    }];
  }

  if ((claim.subject.type === 'fixture' || claim.subject.type === 'team') && !claim.subject.id) {
    return [{
      path: `${path}.id`,
      message: `${claim.subject.type} claim subject requires id.`,
    }];
  }

  return [];
}

function toIssue(issue: { path: PropertyKey[]; message: string }): ResearchValidationIssue {
  return {
    path: issue.path.map(String).join('.'),
    message: issue.message,
  };
}
