import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { transformCutoverEnv } from '../configure-supabase-cutover-env.mjs';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const SCRIPT = join(REPO_ROOT, 'scripts/configure-supabase-cutover-env.mjs');
const PROJECT_REF = 'mexcyqfvgmnbkrhoxaut';
const VALID_POOLER =
  `postgresql://postgres.${PROJECT_REF}:test-password@aws-1-us-west-2.pooler.supabase.com:5432/postgres` +
  '?sslmode=require&schema=gana_ops';
const VALID_DIRECT =
  `postgresql://postgres:test-password@db.${PROJECT_REF}.supabase.co:5432/postgres` +
  '?sslmode=require&schema=gana_ops';

test('finalize-cutover removes only source and migration target DSNs', () => {
  const initial = [
    'KEEP_ME=yes',
    'SOURCE_DATABASE_URL=mysql://source.invalid/gana_v9_ops_20260425',
    `DATABASE_URL=${VALID_POOLER}`,
    'TARGET_DATABASE_URL=postgresql://temporary.invalid/postgres',
    `DIRECT_URL=${VALID_DIRECT}`,
    'SOURCE_DATABASE_URL=mysql://duplicate.invalid/gana_v9_ops_20260425',
    '',
  ].join('\n');

  const transformed = transformCutoverEnv(initial, 'finalize-cutover');

  assert.equal(transformed.result.finalized, true);
  assert.equal(transformed.result.projectRef, PROJECT_REF);
  assert.equal(transformed.result.schema, 'gana_ops');
  assert.doesNotMatch(transformed.contents, /^SOURCE_DATABASE_URL=/m);
  assert.doesNotMatch(transformed.contents, /^TARGET_DATABASE_URL=/m);
  assert.match(transformed.contents, /^DATABASE_URL=/m);
  assert.match(transformed.contents, /^DIRECT_URL=/m);
  assert.match(transformed.contents, /^KEEP_ME=yes$/m);
});

test('finalize-cutover rejects a MySQL runtime DSN', () => {
  const initial = `DATABASE_URL=mysql://source.invalid/gana_v9_ops_20260425\nDIRECT_URL=${VALID_DIRECT}\n`;
  assert.throws(
    () => transformCutoverEnv(initial, 'finalize-cutover'),
    /must use PostgreSQL and must not point to the source MySQL database/,
  );
});

test('finalize-cutover rejects the wrong Supabase project or schema', () => {
  const wrongProject = VALID_POOLER.replace(PROJECT_REF, 'aaaaaaaaaaaaaaaaaaaa');
  assert.throws(
    () => transformCutoverEnv(`DATABASE_URL=${wrongProject}\nDIRECT_URL=${VALID_DIRECT}\n`, 'finalize-cutover'),
    new RegExp(`DATABASE_URL must point to Supabase project ${PROJECT_REF}`),
  );

  const wrongSchema = VALID_DIRECT.replace('schema=gana_ops', 'schema=public');
  assert.throws(
    () => transformCutoverEnv(`DATABASE_URL=${VALID_POOLER}\nDIRECT_URL=${wrongSchema}\n`, 'finalize-cutover'),
    /DIRECT_URL must use schema gana_ops/,
  );
});

test('finalize-cutover CLI changes only a temporary .env and enforces mode 0600', () => {
  withTemporaryEnv(
    [
      'SOURCE_DATABASE_URL=mysql://source.invalid/gana_v9_ops_20260425',
      `DATABASE_URL=${VALID_POOLER}`,
      'TARGET_DATABASE_URL=postgresql://temporary.invalid/postgres',
      `DIRECT_URL=${VALID_DIRECT}`,
      'KEEP_ME=yes',
      '',
    ].join('\n'),
    ({ root, envPath }) => {
      const child = spawnSync(process.execPath, [SCRIPT, 'finalize-cutover'], {
        cwd: root,
        encoding: 'utf8',
      });

      assert.equal(child.status, 0, child.stderr);
      assert.equal(JSON.parse(child.stdout).finalized, true);
      const finalized = readFileSync(envPath, 'utf8');
      assert.doesNotMatch(finalized, /^(?:SOURCE|TARGET)_DATABASE_URL=/m);
      assert.match(finalized, /^KEEP_ME=yes$/m);
      assert.equal(statSync(envPath).mode & 0o777, 0o600);
    },
  );
});

test('failed finalize-cutover leaves a temporary .env byte-for-byte unchanged', () => {
  const invalid = `DATABASE_URL=mysql://source.invalid/gana_v9_ops_20260425\nDIRECT_URL=${VALID_DIRECT}\n`;
  withTemporaryEnv(invalid, ({ root, envPath }) => {
    const child = spawnSync(process.execPath, [SCRIPT, 'finalize-cutover'], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.notEqual(child.status, 0);
    assert.equal(readFileSync(envPath, 'utf8'), invalid);
  });
});

function withTemporaryEnv(contents, run) {
  const root = mkdtempSync(join(tmpdir(), 'gana-finalize-cutover-'));
  const envPath = join(root, '.env');
  writeFileSync(envPath, contents, { mode: 0o644 });
  try {
    run({ root, envPath });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
