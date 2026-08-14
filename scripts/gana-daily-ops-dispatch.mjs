#!/usr/bin/env node
import 'dotenv/config';
import { resolve } from 'node:path';

import {
  resolveArtifactRoot,
  runDailyOpsDispatch,
} from './lib/daily-ops-dispatch.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.now && !args.dryRun) throw new Error('--now is allowed only together with --dry-run.');
  const now = args.now ? parseNow(args.now) : new Date();
  const artifactRoot = resolveArtifactRoot(REPO_ROOT, process.env.GANA_ARTIFACT_ROOT);
  const summary = runDailyOpsDispatch({
    repoRoot: REPO_ROOT,
    artifactRoot,
    now,
    dryRun: args.dryRun,
    env: process.env,
  });
  writeSummary(summary);
  if (summary.status === 'review-required') process.exitCode = 1;
} catch (error) {
  writeSummary({
    schemaVersion: 1,
    flow: 'daily-ops-dispatch',
    status: 'error',
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--now') parsed.now = requireValue(argv, ++index, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseNow(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('--now must be a valid ISO date/time.');
  return date;
}

function writeSummary(summary) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
