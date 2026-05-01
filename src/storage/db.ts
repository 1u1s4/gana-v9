import { PrismaClient } from '@prisma/client';
import type { ServiceStatusReport, StatusConfigValue } from '../filters/status.js';
import { isMissingStatusValue } from '../filters/status.js';
import { detectDatabaseEngine, redactedConnectionIdentity } from './redacted-status.js';

export interface DatabaseStatusConfig {
  url?: string;
  databaseUrl?: string;
  connectionString?: string;
  directUrl?: string;
  serviceRoleKey?: string;
  anonKey?: string;
}

export type DbStatusConfig = {
  databaseUrl?: string;
  database?: DatabaseStatusConfig;
  db?: DatabaseStatusConfig;
  storage?: {
    database?: DatabaseStatusConfig;
  };
};

export interface DbStatusReport extends ServiceStatusReport {
  service: 'storage.db';
}

let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

export async function disconnectDb(): Promise<void> {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = undefined;
}

export async function getDbStatus(config: DbStatusConfig = {}): Promise<DbStatusReport> {
  const databaseUrl = pickDatabaseUrl(config);
  const identity = redactedConnectionIdentity(databaseUrl);
  const baseConfig: Record<string, StatusConfigValue> = {
    engine: identity.engine,
    host: identity.host,
    port: identity.port,
    database: identity.database,
    user: identity.user,
  };

  if (isMissingStatusValue(databaseUrl)) {
    return {
      service: 'storage.db',
      status: 'missing',
      message: 'DATABASE_URL is required for storage.db.',
      missing: ['connection'],
      configured: [],
      config: baseConfig,
    };
  }

  if (identity.engine !== 'mysql') {
    return {
      service: 'storage.db',
      status: 'disconnected',
      message: `DATABASE_URL must use mysql for this PR-03 override; detected ${identity.engine}.`,
      missing: [],
      configured: ['connection'],
      config: baseConfig,
    };
  }

  const db = getPrismaClient();
  const checkedAt = new Date();

  try {
    await db.$queryRaw`SELECT 1`;
    const migration = await readMigrationStatus(db);
    const activeRunCount = await countActiveRuns(db);
    const lastWrite = await readLastWrite(db);
    const lastWriteMetadata = await readLastWriteMetadata(db);

    return {
      service: 'storage.db',
      status: migration.failedCount > 0 ? 'degraded' : 'connected',
      message: migration.failedCount > 0
        ? 'Database connection is available, but one or more Prisma migrations failed.'
        : 'Database connection is available.',
      missing: [],
      configured: ['connection'],
      config: {
        ...baseConfig,
        connected: true,
        migrationStatus: migration.status,
        appliedMigrations: migration.appliedCount,
        failedMigrations: migration.failedCount,
        latestMigration: migration.latestMigration ?? 'none',
        lastRead: checkedAt.toISOString(),
        lastWrite: lastWrite ?? 'none',
        lastWriteTables: lastWriteMetadata ?? 'none',
        activeRunCount: activeRunCount ?? 'unknown',
      },
    };
  } catch (err: any) {
    const errorCode = typeof err?.code === 'string' ? err.code : 'unknown';
    return {
      service: 'storage.db',
      status: 'disconnected',
      message: actionableDbError(err),
      missing: [],
      configured: ['connection'],
      config: {
        ...baseConfig,
        connected: false,
        error: `Prisma error ${errorCode}. See logs with redaction enabled for details.`,
      },
    };
  }
}

export const getDatabaseStatus = getDbStatus;

function pickDatabaseUrl(config: DbStatusConfig): string | undefined {
  const database = config.database ?? config.storage?.database ?? config.db ?? {};
  return [
    config.databaseUrl,
    database.url,
    database.databaseUrl,
    database.connectionString,
    database.directUrl,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
}

interface MigrationStatus {
  status: 'uninitialized' | 'applied' | 'failed';
  appliedCount: number;
  failedCount: number;
  latestMigration: string | null;
}

async function readMigrationStatus(db: PrismaClient): Promise<MigrationStatus> {
  try {
    const rows = await db.$queryRaw<Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY started_at DESC
    `;
    const failedCount = rows.filter((row) => row.finished_at === null && row.rolled_back_at === null).length;
    return {
      status: failedCount > 0 ? 'failed' : 'applied',
      appliedCount: rows.filter((row) => row.finished_at !== null).length,
      failedCount,
      latestMigration: rows[0]?.migration_name ?? null,
    };
  } catch (err: any) {
    if (isMissingTableError(err)) {
      return {
        status: 'uninitialized',
        appliedCount: 0,
        failedCount: 0,
        latestMigration: null,
      };
    }
    throw err;
  }
}

async function countActiveRuns(db: PrismaClient): Promise<number | null> {
  try {
    return await db.harnessRun.count({
      where: {
        status: { in: ['created', 'queued', 'running'] },
      },
    });
  } catch (err: any) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

async function readLastWrite(db: PrismaClient): Promise<string | null> {
  try {
    const rows = await db.$queryRaw<Array<{ last_write: Date | null }>>`
      SELECT MAX(last_write) AS last_write
      FROM (
        SELECT MAX(created_at) AS last_write FROM harness_runs
        UNION ALL SELECT MAX(created_at) FROM fixtures
        UNION ALL SELECT MAX(created_at) FROM provider_snapshots
        UNION ALL SELECT MAX(created_at) FROM odds_quotes
        UNION ALL SELECT MAX(created_at) FROM artifacts
        UNION ALL SELECT MAX(created_at) FROM audit_logs
        UNION ALL SELECT MAX(created_at) FROM provider_quota_samples
        UNION ALL SELECT MAX(created_at) FROM low_odds_scans
        UNION ALL SELECT MAX(created_at) FROM low_odds_hits
        UNION ALL SELECT MAX(created_at) FROM research_bundles
        UNION ALL SELECT MAX(created_at) FROM source_records
        UNION ALL SELECT MAX(created_at) FROM evidence_items
        UNION ALL SELECT MAX(created_at) FROM claims
        UNION ALL SELECT MAX(created_at) FROM predictions
        UNION ALL SELECT MAX(created_at) FROM parlays
        UNION ALL SELECT MAX(created_at) FROM parlay_legs
        UNION ALL SELECT MAX(created_at) FROM validation_artifacts
      ) writes
    `;
    return rows[0]?.last_write?.toISOString() ?? null;
  } catch (err: any) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

async function readLastWriteMetadata(db: PrismaClient): Promise<string | null> {
  try {
    const rows = await db.$queryRaw<Array<{ table_name: string; last_write: Date | null }>>`
      SELECT table_name, last_write
      FROM (
        SELECT 'harness_runs' AS table_name, MAX(created_at) AS last_write FROM harness_runs
        UNION ALL SELECT 'fixtures', MAX(created_at) FROM fixtures
        UNION ALL SELECT 'provider_snapshots', MAX(created_at) FROM provider_snapshots
        UNION ALL SELECT 'odds_quotes', MAX(created_at) FROM odds_quotes
        UNION ALL SELECT 'artifacts', MAX(created_at) FROM artifacts
        UNION ALL SELECT 'audit_logs', MAX(created_at) FROM audit_logs
        UNION ALL SELECT 'provider_quota_samples', MAX(created_at) FROM provider_quota_samples
        UNION ALL SELECT 'low_odds_scans', MAX(created_at) FROM low_odds_scans
        UNION ALL SELECT 'low_odds_hits', MAX(created_at) FROM low_odds_hits
        UNION ALL SELECT 'research_bundles', MAX(created_at) FROM research_bundles
        UNION ALL SELECT 'source_records', MAX(created_at) FROM source_records
        UNION ALL SELECT 'evidence_items', MAX(created_at) FROM evidence_items
        UNION ALL SELECT 'claims', MAX(created_at) FROM claims
        UNION ALL SELECT 'predictions', MAX(created_at) FROM predictions
        UNION ALL SELECT 'parlays', MAX(created_at) FROM parlays
        UNION ALL SELECT 'parlay_legs', MAX(created_at) FROM parlay_legs
        UNION ALL SELECT 'validation_artifacts', MAX(created_at) FROM validation_artifacts
      ) writes
      WHERE last_write IS NOT NULL
      ORDER BY last_write DESC
    `;
    if (!rows.length) return null;
    return rows
      .map((row) => `${row.table_name}:${row.last_write?.toISOString() ?? 'none'}`)
      .join(',');
  } catch (err: any) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

function isMissingTableError(err: any): boolean {
  const message = String(err?.message ?? err);
  return err?.code === 'P2021' || message.includes("doesn't exist") || message.includes('does not exist');
}

function actionableDbError(err: any): string {
  const engine = detectDatabaseEngine(process.env.DATABASE_URL);
  const errorCode = typeof err?.code === 'string' ? err.code : 'unknown';
  if (engine !== 'mysql') {
    return 'DATABASE_URL is not a MySQL connection string for the active PR-03 override.';
  }
  return `Database connection failed with Prisma error ${errorCode}. Check DATABASE_URL, network access, SSL settings, and migration state.`;
}
