#!/usr/bin/env node
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

import {
  comparePublishedLineageFingerprints,
  fingerprintPublishedLineage,
} from './lib/published-lineage-fingerprint.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fatal('DATABASE_URL is required.');
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) fatal('Published-lineage fingerprint supports only PostgreSQL.');

const client = new PrismaClient({ datasourceUrl: databaseUrl });
try {
  const context = await client.$queryRawUnsafe(`
    select current_schema() as schema_name,
           current_setting('TimeZone') as timezone
  `);
  const schema = String(context?.[0]?.schema_name ?? context?.[0]?.schemaName ?? '');
  if (schema !== 'gana_ops') throw new Error(`Expected PostgreSQL search_path gana_ops; received ${schema || 'unknown'}.`);

  const fingerprint = await fingerprintPublishedLineage(client);
  const comparison = args.expectPath
    ? comparePublishedLineageFingerprints(readFingerprint(args.expectPath), fingerprint)
    : undefined;
  console.log(JSON.stringify({
    ...fingerprint,
    database: { schema, timezone: String(context?.[0]?.timezone ?? '') },
    ...(comparison ? { comparison } : {}),
  }, null, 2));
  if (comparison && !comparison.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}

function parseArgs(argv) {
  const result = { help: false, expectPath: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--expect') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fatal('--expect requires a fingerprint JSON path.');
      result.expectPath = value;
      index += 1;
    } else if (arg.startsWith('--expect=')) result.expectPath = arg.slice('--expect='.length);
    else fatal(`Unknown option: ${arg}`);
  }
  return result;
}

function readFingerprint(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed?.tables || typeof parsed.tables !== 'object') throw new Error('missing tables');
    return parsed;
  } catch (error) {
    throw new Error(`Could not read expected fingerprint ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printHelp() {
  console.log(`Gana published recommendation lineage fingerprint (read-only)

Print the current deterministic JSON fingerprint:
  node scripts/gana-published-lineage-fingerprint.mjs

Compare current lineage with a previous artifact (non-zero on mismatch):
  node scripts/gana-published-lineage-fingerprint.mjs --expect PATH
`);
}

function fatal(message) {
  console.error(message);
  process.exit(1);
}
