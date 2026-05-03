import { z } from 'zod';
import { validateRepoRelativePath } from '../permissions/filesystem-policy.js';

const repoRelativePath = z.string().superRefine((path, ctx) => {
  const result = validateRepoRelativePath(path);
  if (!result.allowed) {
    ctx.addIssue({ code: 'custom', message: result.reason ?? 'invalid repo-relative path' });
  }
});

export const fileWriteInputSchema = z.object({
  path: repoRelativePath.describe('Repo-relative path to the file'),
  content: z.string().describe('Content to write'),
  reason: z.string().min(1).describe('Why this mutation is needed'),
  dryRun: z.boolean().default(true),
  expectedParent: repoRelativePath.optional(),
  idempotencyKey: z.string().min(1),
});

export const fileEditInputSchema = z.object({
  path: repoRelativePath.describe('Repo-relative path to the file'),
  search: z.string().min(1).optional(),
  replace: z.string().optional(),
  edits: z.array(z.object({
    old_text: z.string().min(1),
    new_text: z.string(),
  })).optional(),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  reason: z.string().min(1).describe('Why this mutation is needed'),
  dryRun: z.boolean().default(true),
  idempotencyKey: z.string().min(1),
}).superRefine((input, ctx) => {
  if (!input.expectedSha256 && !input.dryRun) {
    ctx.addIssue({
      code: 'custom',
      path: ['expectedSha256'],
      message: 'expectedSha256 is required for non-dry-run edits',
    });
  }
  if (!input.edits?.length && input.search === undefined) {
    ctx.addIssue({ code: 'custom', message: 'provide either edits[] or search/replace' });
  }
});

export const shellInputSchema = z.object({
  command: z.enum(['pnpm test', 'pnpm typecheck', 'pnpm lint', 'git status']),
  cwd: repoRelativePath.optional(),
  reason: z.string().min(1),
  timeoutMs: z.number().int().positive().max(300_000).default(120_000),
  idempotencyKey: z.string().min(1),
});

export const dangerousShellInputSchema = z.object({
  command: z.string().min(1),
  cwd: repoRelativePath.optional(),
  reason: z.string().min(1),
  timeoutMs: z.number().int().positive().max(300_000).default(120_000),
  dryRun: z.boolean().default(true),
  idempotencyKey: z.string().min(1),
});

export const artifactPromoteInputSchema = z.object({
  artifactId: z.string().min(1),
  runId: z.string().min(1),
  target: z.enum(['evidence-pack', 'handoff', 'analytical-report']),
  reason: z.string().min(1),
  dryRun: z.boolean().default(true),
  idempotencyKey: z.string().min(1),
});

export const predictionPromoteInputSchema = z.object({
  predictionId: z.string().min(1),
  runId: z.string().min(1),
  reason: z.string().min(1),
  dryRun: z.boolean().default(true),
  idempotencyKey: z.string().min(1),
});

export type FileWriteInput = z.infer<typeof fileWriteInputSchema>;
export type FileEditInput = z.infer<typeof fileEditInputSchema>;
export type ShellInput = z.infer<typeof shellInputSchema>;
export type DangerousShellInput = z.infer<typeof dangerousShellInputSchema>;
export type ArtifactPromoteInput = z.infer<typeof artifactPromoteInputSchema>;
export type PredictionPromoteInput = z.infer<typeof predictionPromoteInputSchema>;
