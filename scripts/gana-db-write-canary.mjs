#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { runDbWriteCanary } from './lib/db-write-canary.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error('The write canary supports only the PostgreSQL/Supabase target.');
  process.exit(1);
}

const client = new PrismaClient({ datasourceUrl: databaseUrl });
try {
  const rows = await client.$queryRawUnsafe(
    `select current_schema() as schema_name, current_setting('TimeZone') as timezone`,
  );
  const schema = String(rows?.[0]?.schema_name ?? rows?.[0]?.schemaName ?? '');
  if (schema !== 'gana_ops') {
    throw new Error(`Expected PostgreSQL search_path schema gana_ops; received ${schema || 'unknown'}.`);
  }
  const result = await runDbWriteCanary(client);
  console.log(JSON.stringify({
    ...result,
    schema,
    timezone: String(rows?.[0]?.timezone ?? ''),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
