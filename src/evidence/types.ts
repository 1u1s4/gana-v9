import { z } from 'zod';
import type { AgentProviderCompat } from '../providers/agentic/types.js';

export const SOURCE_TYPES = [
  'api-football',
  'provider-snapshot',
  'web-search',
  'db',
  'artifact',
] as const;

export const RESEARCH_GATE_VERDICTS = [
  'promotable',
  'review-required',
  'blocked',
] as const;

export const CLAIM_SUBJECT_TYPES = [
  'fixture',
  'team',
  'market',
] as const;

export const CLAIM_SUPPORT_LEVELS = [
  'supported',
  'partial',
  'weak',
  'unsupported',
  'conflicting',
] as const;

export const CLAIM_CONFLICT_STATUSES = [
  'none',
  'potential',
  'conflict',
] as const;

export const AGENT_PROVIDER_COMPAT_VALUES = [
  'codex',
  'gemini',
  'cursor',
  'openrouter',
] as const;

export type SourceType = typeof SOURCE_TYPES[number];
export type ResearchGateVerdict = typeof RESEARCH_GATE_VERDICTS[number];
export type ClaimSubjectType = typeof CLAIM_SUBJECT_TYPES[number];
export type ClaimSupportLevel = typeof CLAIM_SUPPORT_LEVELS[number];
export type ClaimConflictStatus = typeof CLAIM_CONFLICT_STATUSES[number];

export const jsonRecordSchema = z.record(z.string(), z.unknown());

export const sourceRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SOURCE_TYPES),
  url: z.string().url().optional(),
  snapshotId: z.string().min(1).optional(),
  artifactPath: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  capturedAt: z.string().datetime(),
  hash: z.string().min(1).optional(),
  metadata: jsonRecordSchema.optional(),
}).superRefine((source, ctx) => {
  if (!source.url && !source.snapshotId && !source.artifactPath && !source.externalId) {
    ctx.addIssue({
      code: 'custom',
      message: 'SourceRecord requires url, snapshotId, artifactPath, or externalId.',
      path: ['url'],
    });
  }
});

export const evidenceItemSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  claimIds: z.array(z.string().min(1)).default([]),
  snippet: z.string().min(1).optional(),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  metadata: jsonRecordSchema.optional(),
});

export const claimSubjectSchema = z.object({
  type: z.enum(CLAIM_SUBJECT_TYPES),
  id: z.string().min(1).optional(),
  market: z.string().min(1).nullable().optional(),
});

export const claimSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  subject: claimSubjectSchema,
  supportLevel: z.enum(CLAIM_SUPPORT_LEVELS),
  evidenceIds: z.array(z.string().min(1)),
  conflictStatus: z.enum(CLAIM_CONFLICT_STATUSES),
  metadata: jsonRecordSchema.optional(),
});

export const researchGateResultSchema = z.object({
  verdict: z.enum(RESEARCH_GATE_VERDICTS),
  reasons: z.array(z.string().min(1)).default([]),
  warnings: z.array(z.string().min(1)).default([]),
});

export const researchBundleSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  fixtureId: z.string().min(1),
  providerFixtureId: z.string().min(1),
  sources: z.array(sourceRecordSchema),
  evidenceItems: z.array(evidenceItemSchema),
  claims: z.array(claimSchema),
  gateResult: researchGateResultSchema,
  providerAgentic: z.enum(AGENT_PROVIDER_COMPAT_VALUES),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  warnings: z.array(z.string().min(1)).default([]),
  metadata: jsonRecordSchema.optional(),
});

export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type ClaimSubject = z.infer<typeof claimSubjectSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ResearchGateResult = z.infer<typeof researchGateResultSchema>;
export type ResearchBundle = z.infer<typeof researchBundleSchema> & {
  providerAgentic: AgentProviderCompat;
};

export interface ResearchValidationIssue {
  path: string;
  message: string;
}
