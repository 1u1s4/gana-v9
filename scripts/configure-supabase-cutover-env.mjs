#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'mexcyqfvgmnbkrhoxaut';
const POOLER_HOST = 'aws-1-us-west-2.pooler.supabase.com';
const SOURCE_DATABASE = 'gana_v9_ops_20260425';
const TARGET_DATABASE = 'postgres';
const TARGET_SCHEMA = 'gana_ops';
const COMMANDS = ['prepare-password', 'replace-prepared-password', 'activate-target', 'finalize-cutover'];

export function transformCutoverEnv(contents, command, options = {}) {
  if (!COMMANDS.includes(command)) {
    throw new Error(`Use ${COMMANDS.join(', ')}.`);
  }

  const values = parseEnv(contents);

  if (command === 'prepare-password' || command === 'replace-prepared-password') {
    if (command === 'prepare-password' && values.SUPABASE_DB_PASSWORD) {
      throw new Error('SUPABASE_DB_PASSWORD is already set; refusing to rotate it silently.');
    }
    const source = values.SOURCE_DATABASE_URL || values.DATABASE_URL;
    assertSourceDsn(source);
    contents = upsert(contents, 'SOURCE_DATABASE_URL', source);
    contents = upsert(
      contents,
      'SUPABASE_DB_PASSWORD',
      options.generatedPassword ?? randomBytes(36).toString('base64url'),
    );
    return {
      contents,
      result: { prepared: true, sourcePreserved: true, envMode: '0600' },
    };
  }

  if (command === 'activate-target') {
    const password = values.SUPABASE_DB_PASSWORD;
    if (!password) throw new Error('SUPABASE_DB_PASSWORD is required before activating target DSNs.');
    assertSourceDsn(values.SOURCE_DATABASE_URL);
    const encoded = encodeURIComponent(password);
    const base = `postgresql://postgres.${PROJECT_REF}:${encoded}@${POOLER_HOST}:5432/${TARGET_DATABASE}?sslmode=require`;
    contents = upsert(contents, 'TARGET_DATABASE_URL', base);
    contents = upsert(contents, 'DATABASE_URL', `${base}&schema=${TARGET_SCHEMA}&connection_limit=5`);
    contents = upsert(contents, 'DIRECT_URL', `${base}&schema=${TARGET_SCHEMA}&connection_limit=2`);
    contents = remove(contents, 'SUPABASE_DB_PASSWORD');
    return {
      contents,
      result: { activated: true, runtime: 'session-pooler', schema: TARGET_SCHEMA, envMode: '0600' },
    };
  }

  assertTargetDsn(values.DATABASE_URL, 'DATABASE_URL');
  assertTargetDsn(values.DIRECT_URL, 'DIRECT_URL');
  contents = remove(contents, 'SOURCE_DATABASE_URL');
  contents = remove(contents, 'TARGET_DATABASE_URL');
  return {
    contents,
    result: {
      finalized: true,
      projectRef: PROJECT_REF,
      schema: TARGET_SCHEMA,
      removed: ['SOURCE_DATABASE_URL', 'TARGET_DATABASE_URL'],
      envMode: '0600',
    },
  };
}

export function runCutoverEnvCli({ argv = process.argv, cwd = process.cwd(), output = console.log } = {}) {
  const envPath = resolve(cwd, '.env');
  const transformed = transformCutoverEnv(readFileSync(envPath, 'utf8'), argv[2]);
  persist(envPath, transformed.contents);
  output(JSON.stringify(transformed.result));
  return transformed.result;
}

function assertSourceDsn(value) {
  if (!value) throw new Error('A source MySQL DSN is required.');
  const parsed = new URL(value);
  if (parsed.protocol !== 'mysql:' || parsed.pathname.replace(/^\//, '') !== SOURCE_DATABASE) {
    throw new Error(`Refusing source DSN outside ${SOURCE_DATABASE}.`);
  }
}

function assertTargetDsn(value, key) {
  if (!value) throw new Error(`${key} is required before finalizing the cutover.`);

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid PostgreSQL DSN.`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${key} must use PostgreSQL and must not point to the source MySQL database.`);
  }
  if (parsed.pathname.replace(/^\//, '') !== TARGET_DATABASE) {
    throw new Error(`${key} must point to the Supabase postgres database.`);
  }
  if (parsed.searchParams.get('schema') !== TARGET_SCHEMA) {
    throw new Error(`${key} must use schema ${TARGET_SCHEMA}.`);
  }

  const directHost = `db.${PROJECT_REF}.supabase.co`;
  const poolerUser = `postgres.${PROJECT_REF}`;
  const pointsToDirectProject = parsed.hostname === directHost;
  const pointsToPooledProject =
    parsed.hostname.endsWith('.pooler.supabase.com') && parsed.username === poolerUser;
  if (!pointsToDirectProject && !pointsToPooledProject) {
    throw new Error(`${key} must point to Supabase project ${PROJECT_REF}.`);
  }
}

function parseEnv(value) {
  const result = {};
  for (const line of value.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    result[match[1]] = unquote(match[2]);
  }
  return result;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function upsert(value, key, replacement) {
  const line = `${key}=${replacement}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(value)) return value.replace(pattern, line);
  return `${value.replace(/\s*$/, '\n')}${line}\n`;
}

function remove(value, key) {
  return value.replace(new RegExp(`^${key}=.*(?:\\r?\\n|$)`, 'gm'), '');
}

function persist(envPath, value) {
  const temporary = `${envPath}.cutover.tmp`;
  writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, envPath);
  chmodSync(envPath, 0o600);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCutoverEnvCli();
}
