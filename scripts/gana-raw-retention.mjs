#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { parseRawRetentionOptions, runRawRetention } from './lib/raw-data-retention.mjs';

let client;
try {
  const options = parseRawRetentionOptions(process.argv.slice(2), process.env);
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required. No database was changed.');
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('Raw retention supports only the PostgreSQL/Supabase target. No database was changed.');
  }

  client = new PrismaClient({ datasourceUrl: databaseUrl });
  const result = await runRawRetention(client, options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHumanReport(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client?.$disconnect();
}

function printHelp() {
  console.log(`Gana bounded data retention (PostgreSQL/Supabase)

Dry-run is the default and never deletes rows:
  pnpm db:retention
  pnpm db:retention -- --json

Apply only after reviewing dry-run output:
  pnpm db:retention -- --apply

Options:
  --retention-days N       Fixed at 7 (max 7); default GANA_RAW_RETENTION_DAYS or 7
  --transient-retention-days N
                           Fixed at 7 (max 7); default GANA_TRANSIENT_RETENTION_DAYS or 7
  --research-retention-days N
                           7..14 (max 14); default GANA_RESEARCH_RETENTION_DAYS or 14
  --analytic-retention-days N
                           Fixed at 30 (max 30); default GANA_ANALYTIC_RETENTION_DAYS or 30
  --history-retention-days N
                           30..60 (max 60); default GANA_HISTORY_RETENTION_DAYS or 60
  --batch-size N           1..10000; default GANA_RAW_RETENTION_BATCH_SIZE or 1000
  --statement-timeout-ms N Per-batch PostgreSQL timeout; default 30000
  --lock-timeout-ms N      Per-batch lock timeout; default 2000
  --max-batches N          Safety cap; reruns are idempotent
  --dry-run                Explicit dry-run
  --apply                  Delete eligible raw/history rows in short transactions
  --json                   Machine-readable report
`);
}

function printHumanReport(result) {
  printCapacity('Capacity before', result.capacityBefore);
  console.log(`Raw retention ${result.mode}: cutoff ${result.cutoff} (${result.retentionDays} days)`);
  printSection('Eligible before', result.before);
  console.log(`Tiered history: transient ${result.transientRetentionDays}d, research/validation ${result.researchRetentionDays}d, analytic ${result.analyticRetentionDays}d, durable ${result.historyRetentionDays}d`);
  printHistorySection('History eligible/reference-blocked before', result.historyBefore);
  printSection('Optional payloads eligible for compaction before', result.compactionBefore);
  if (result.deleted) printSection('Deleted', result.deleted);
  if (result.historyDeleted) printSection('History deleted', result.historyDeleted);
  if (result.compacted) printSection('Optional payloads compacted', result.compacted);
  if (result.after) printSection('Eligible after', result.after);
  if (result.historyAfter) printHistorySection('History eligible/reference-blocked after', result.historyAfter);
  if (result.compactionAfter) printSection('Optional payloads eligible for compaction after', result.compactionAfter);
  if (result.capacityAfter) printCapacity('Capacity after', result.capacityAfter);
  console.log(`Estimate note: ${result.estimate}`);
  if (result.mode === 'dry-run') console.log('No rows were deleted. Rerun with --apply only after reviewing this report.');
}

function printCapacity(label, capacity) {
  console.log(`${label}: ${capacity.status.toUpperCase()} ${formatBytes(capacity.databaseBytes)} (warning ${formatBytes(capacity.warningBytes)}, hard ${formatBytes(capacity.hardBytes)})`);
  for (const table of capacity.topTables.slice(0, 5)) {
    console.log(`  table ${table.schema}.${table.table}: ${formatBytes(table.totalBytes)} total (${formatBytes(table.tableBytes)} heap, ${formatBytes(table.indexBytes)} indexes)`);
  }
  for (const index of capacity.topIndexes.slice(0, 5)) {
    console.log(`  index ${index.schema}.${index.index}: ${formatBytes(index.indexBytes)} (${index.table})`);
  }
  if (capacity.criticalAction) console.log(`  CRITICAL: ${capacity.criticalAction}`);
}

function printSection(label, report) {
  console.log(label);
  for (const [key, value] of Object.entries(report.targets)) {
    const batches = value.batches === undefined ? '' : `, ${value.batches} batch(es)`;
    const groups = value.aggregateGroupCount === undefined ? '' : `, ${value.aggregateGroupCount} daily group(s)`;
    console.log(`  ${key}: ${value.rowCount} row(s), ~${formatBytes(value.estimatedBytes)}${groups}${batches}`);
  }
  console.log(`  total: ${report.totals.rowCount} row(s), ~${formatBytes(report.totals.estimatedBytes)}`);
}

function printHistorySection(label, report) {
  console.log(label);
  for (const [key, value] of Object.entries(report.targets)) {
    const tier = value.retentionClass ? ` [${value.retentionClass}, cutoff ${value.cutoff}]` : '';
    console.log(`  ${key}${tier}: eligible ${value.rowCount} row(s), ~${formatBytes(value.estimatedBytes)}; blocked ${value.blockedRowCount} row(s), ~${formatBytes(value.blockedEstimatedBytes)}`);
  }
  console.log(`  eligible total: ${report.totals.rowCount} row(s), ~${formatBytes(report.totals.estimatedBytes)}`);
  console.log(`  blocked total: ${report.blockedTotals.rowCount} row(s), ~${formatBytes(report.blockedTotals.estimatedBytes)}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}
