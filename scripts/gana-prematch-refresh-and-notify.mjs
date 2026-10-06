#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../src/config.ts';
import { disconnectDb } from '../src/storage/db.ts';
import { createRuntimeContext } from '../src/runtime/context.ts';
import { runSelectiveRefresh } from '../src/daily/refresh.ts';
import { PRE_MATCH_REVIEW_POLICY, preMatchConfig } from '../src/daily/pre-match-policy.ts';
import { runPreMatchRefresh } from './lib/pre-match-refresh.mjs';

const args = process.argv.slice(2);
if (args.some(a => !['--dry-run'].includes(a))) throw new Error('Usage: node --import tsx scripts/gana-prematch-refresh-and-notify.mjs [--dry-run]');
const dryRun = args.includes('--dry-run');
const root = resolve(process.env.GANA_ARTIFACT_ROOT ?? '.artifacts/gana-v9');
// A refresh must collect live evidence even if a prior recovery exported reuse.
delete process.env.GANA_RESEARCH_REUSE_RUN_ID;
const config = preMatchConfig(loadConfig({ artifactRoot: root, provider: PRE_MATCH_REVIEW_POLICY.provider,
  model: PRE_MATCH_REVIEW_POLICY.model, reasoningEffort: PRE_MATCH_REVIEW_POLICY.reasoningEffort,
}, { skipApiKey: dryRun, validateAgentAuth: !dryRun }));
const invoke = async input => {
  const dir = join(root, 'sessions', `prematch-${randomUUID()}`);
  if (!input.dryRun) mkdirSync(dir, { recursive: true });
  return runSelectiveRefresh(config, input, createRuntimeContext(config, join(dir, 'session.jsonl')));
};
const publish = async ({ date, batch, parentBatch }) => {
  const child = spawnSync(process.execPath, ['scripts/gana-publish-revision.mjs', '--date', date, '--daily-batch-id', batch, '--parent-batch-id', parentBatch], { encoding: 'utf8', maxBuffer: 8e6 });
  if (child.error) throw child.error;
  const result = JSON.parse(child.stdout.trim());
  if (child.status !== 0 && !result.status) throw new Error('Revision publisher failed; reconcile its receipt before retrying');
  return result;
};
const summary = await runPreMatchRefresh({ artifactRoot: root, policy: PRE_MATCH_REVIEW_POLICY, inspectRefresh: invoke, refresh: invoke, publish,
  dryRun, paused: process.env.GANA_MAINTENANCE_PAUSED === 'true' }).finally(disconnectDb);
// The frequent no-agent cron stays silent when there is no new evaluation.
if (dryRun || summary.actions?.length || summary.status === 'review-required') console.log(JSON.stringify(summary, null, 2));
if (summary.status === 'review-required') process.exitCode = 1;
