import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadConfig } from '../src/config.js';
import { checkApiFootballStatus } from '../src/providers/sports/api-football.js';
import { createRuntimeContext } from '../src/runtime/context.js';
import { disconnectDb, getDbStatus } from '../src/storage/db.js';

const REQUIRED_ENV = ['DATABASE_URL', 'API_FOOTBALL_KEY'] as const;

async function main(): Promise<void> {
  if (process.env.GANA_ENABLE_SMOKE !== '1') {
    console.log('[smoke] SKIP: set GANA_ENABLE_SMOKE=1 to run live smoke checks.');
    return;
  }

  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[smoke] FAIL: missing required live env: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  process.env.GANA_ARTIFACT_ROOT ??= mkdtempSync(join(tmpdir(), 'gana-smoke-artifacts-'));

  const config = loadConfig({}, { skipApiKey: true });
  const runtime = createRuntimeContext(config, join(process.env.GANA_ARTIFACT_ROOT, 'smoke-session.jsonl'));

  try {
    const db = await getDbStatus(config);
    const football = await checkApiFootballStatus(config, runtime);
    const failures = [
      db.status === 'connected' ? undefined : `storage.db=${db.status}`,
      football.status === 'connected' ? undefined : `providers.sports.football=${football.status}`,
    ].filter((item): item is string => Boolean(item));

    console.log(`[smoke] storage.db: ${db.status} - ${db.message}`);
    console.log(`[smoke] providers.sports.football: ${football.status} - ${football.message}`);

    if (failures.length > 0) {
      console.error(`[smoke] FAIL: ${failures.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    console.log('[smoke] PASS: live storage and football provider checks completed.');
  } finally {
    await disconnectDb();
  }
}

main().catch(async (err: unknown) => {
  await disconnectDb();
  console.error(`[smoke] FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
