import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const WRAPPER = resolve(ROOT, 'scripts/gana-strategy-review.mjs');
const DATE = '2026-07-14';

test('strategy review defaults to Terra high without fast tier or fallbacks', () => {
  const shell = readFileSync(resolve(ROOT, 'scripts/gana-strategy-review.sh'), 'utf8');
  const wrapper = readFileSync(resolve(ROOT, 'scripts/gana-strategy-review.mjs'), 'utf8');
  const service = readFileSync(resolve(ROOT, 'src/strategy-review/daily.ts'), 'utf8');

  assert.match(shell, /GANA_STRATEGY_REVIEW_MODEL:-gpt-5\.6-terra/);
  assert.match(shell, /GANA_STRATEGY_REVIEW_REASONING_EFFORT:-high/);
  assert.match(shell, /GANA_STRATEGY_REVIEW_FAST_MODE:-false/);
  assert.match(shell, /GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS-/);
  assert.match(shell, /GANA_CODEX_BIN_DIR/);
  assert.match(shell, /\$HOME\/\.local\/bin/);
  assert.match(shell, /CODEX_USER_BIN:\+\$CODEX_USER_BIN:/);
  assert.match(shell, /AGENT_FAST_MODE="\$GANA_STRATEGY_REVIEW_FAST_MODE"/);
  assert.match(shell, /AGENT_CODEX_FALLBACK_MODELS="\$GANA_STRATEGY_REVIEW_CODEX_FALLBACK_MODELS"/);

  assert.match(wrapper, /AGENT_MODEL: .*'gpt-5\.6-terra'/);
  assert.match(wrapper, /AGENT_REASONING_EFFORT: .*'high'/);
  assert.match(wrapper, /AGENT_FAST_MODE: .*'false'/);
  assert.match(wrapper, /AGENT_CODEX_FALLBACK_MODELS: .*''/);

  assert.match(service, /const DEFAULT_MODEL = 'gpt-5\.6-terra'/);
  assert.match(service, /const DEFAULT_REASONING = 'high'/);
});

test('strategy wrapper owns only review and notification and publishes one terminal outcome', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    const first = runWrapper(env);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(commands(commandLog), ['review', 'notify']);
    assert.match(first.stdout, /Validación\/métricas: no se recalculan/);

    const lock = readJson(lockPath(artifactRoot));
    assert.equal(lock.status, 'published');
    assert.equal(lock.date, DATE);
    assert.equal(lock.scope, `strategy-${DATE}`);
    assert.equal(lock.reviewExit, 0);
    assert.equal(lock.notifyExit, 0);

    const outcome = readJson(outcomePath(artifactRoot));
    assert.equal(outcome.status, 'published');
    assert.equal(outcome.scope, `strategy-${DATE}`);
    assert.equal(outcome.reviewExit, 0);
    assert.equal(outcome.notifyExit, 0);
    const terminalOutcome = readFileSync(outcomePath(artifactRoot), 'utf8');

    writeFileSync(commandLog, '');
    const second = runWrapper(env);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(commands(commandLog), []);
    assert.match(second.stdout, /review ya publicado/);
    assert.equal(readJson(lockPath(artifactRoot)).status, 'published');
    assert.equal(readFileSync(outcomePath(artifactRoot), 'utf8'), terminalOutcome);
  });
});

test('review-required is terminal and is not retried automatically', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    const first = runWrapper({
      ...env,
      MOCK_REVIEW_EXIT: '17',
      MOCK_REVIEW_CREATE_ARTIFACT: 'false',
    });
    assert.equal(first.status, 17, first.stderr);
    assert.deepEqual(commands(commandLog), ['review']);
    const firstLock = readJson(lockPath(artifactRoot));
    assert.equal(firstLock.status, 'review-required');
    assert.equal(firstLock.reason, 'strategy-review-exit-17');
    const terminalOutcome = readFileSync(outcomePath(artifactRoot), 'utf8');

    writeFileSync(commandLog, '');
    const second = runWrapper(env);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(commands(commandLog), []);
    assert.match(second.stdout, /corrida previa requiere revisión manual/);
    assert.equal(readJson(lockPath(artifactRoot)).runId, firstLock.runId);
    assert.equal(readFileSync(outcomePath(artifactRoot), 'utf8'), terminalOutcome);
  });
});

test('a notification failure is terminal and does not resend automatically', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    const first = runWrapper({ ...env, MOCK_NOTIFY_EXIT: '23' });
    assert.equal(first.status, 23, first.stderr);
    assert.deepEqual(commands(commandLog), ['review', 'notify']);
    const firstLock = readJson(lockPath(artifactRoot));
    assert.equal(firstLock.status, 'review-required');
    assert.equal(firstLock.reason, 'strategy-review-notify-exit-23');
    assert.equal(firstLock.reviewExit, 0);
    assert.equal(firstLock.notifyExit, 23);

    writeFileSync(commandLog, '');
    const second = runWrapper(env);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(commands(commandLog), []);
    assert.equal(readJson(lockPath(artifactRoot)).runId, firstLock.runId);
  });
});

test('a live running owner blocks duplicate review work', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    writeRunningLock(artifactRoot, {
      runId: 'live-owner',
      ownerPid: process.pid,
      childPid: null,
    });

    const child = runWrapper(env);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(commands(commandLog), []);
    assert.match(child.stdout, /review sigue en curso/);
    assert.equal(readJson(lockPath(artifactRoot)).runId, 'live-owner');
  });
});

test('a live child blocks recovery even when the wrapper owner is dead', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    writeRunningLock(artifactRoot, {
      runId: 'live-child',
      ownerPid: 2_147_483_647,
      childPid: process.pid,
    });

    const child = runWrapper(env);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(commands(commandLog), []);
    assert.match(child.stdout, /review sigue en curso/);
    assert.equal(readJson(lockPath(artifactRoot)).runId, 'live-child');
  });
});

test('a dead running owner is safely reclaimed before review executes', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    writeRunningLock(artifactRoot, {
      runId: 'dead-owner',
      ownerPid: 2_147_483_647,
      childPid: null,
    });

    const child = runWrapper(env);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(commands(commandLog), ['review', 'notify']);
    const lock = readJson(lockPath(artifactRoot));
    assert.equal(lock.status, 'published');
    assert.notEqual(lock.runId, 'dead-owner');
    assert.equal(lock.recoveredFromRunId, 'dead-owner');
  });
});

test('notification can be disabled without restoring validation or metrics ownership', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    const child = runWrapper(env, ['--notify', 'false']);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(commands(commandLog), ['review']);
    const lock = readJson(lockPath(artifactRoot));
    assert.equal(lock.status, 'published');
    assert.equal(lock.notifyEnabled, false);
    assert.equal(lock.reason, 'strategy-review-completed-notification-disabled');
  });
});

test('maintenance mode exits before acquiring a lock or starting commands', () => {
  withHarness(({ artifactRoot, commandLog, env }) => {
    const child = runWrapper({ ...env, GANA_MAINTENANCE_PAUSED: 'true' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(commands(commandLog), []);
    assert.equal(existsSync(lockPath(artifactRoot)), false);
    assert.match(child.stdout, /paused for database maintenance/);
  });
});

test('wrapper source has no validation or daily metrics command', () => {
  const wrapper = readFileSync(WRAPPER, 'utf8');
  assert.doesNotMatch(wrapper, /\['gana',\s*'validate'/);
  assert.doesNotMatch(wrapper, /\['gana',\s*'metrics',\s*'daily'/);
  assert.match(wrapper, /'gana',\s*\n\s*'strategy-review'/);
  assert.match(wrapper, /renameSync\(path, quarantinePath\)/);
  assert.doesNotMatch(wrapper, /rmSync\(path\)/);
});

function withHarness(run) {
  const root = mkdtempSync(join(tmpdir(), 'gana-strategy-review-'));
  const artifactRoot = join(root, 'artifacts');
  const binDir = join(root, 'bin');
  const commandLog = join(root, 'commands.log');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'node'), nodeShim(), { mode: 0o700 });
  writeFileSync(commandLog, '');
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    GANA_ARTIFACT_ROOT: artifactRoot,
    GANA_CRON_DIRECT_TELEGRAM: 'false',
    GANA_MAINTENANCE_PAUSED: 'false',
    MOCK_COMMAND_LOG: commandLog,
    MOCK_REVIEW_DATE: DATE,
    MOCK_REVIEW_EXIT: '0',
    MOCK_REVIEW_CREATE_ARTIFACT: 'true',
    MOCK_NOTIFY_EXIT: '0',
  };
  try {
    run({ root, artifactRoot, commandLog, env });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runWrapper(env, extraArgs = []) {
  return spawnSync(process.execPath, [
    WRAPPER,
    '--date', DATE,
    '--scope', `strategy-${DATE}`,
    ...extraArgs,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
    timeout: 10_000,
  });
}

function writeRunningLock(artifactRoot, overrides) {
  const path = lockPath(artifactRoot);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    flow: 'strategy-review',
    date: DATE,
    scope: `strategy-${DATE}`,
    status: 'running',
    phase: 'review',
    startedAt: '2026-07-14T19:15:00.000Z',
    updatedAt: '2026-07-14T19:15:00.000Z',
    ...overrides,
  }, null, 2)}\n`);
}

function lockPath(artifactRoot) {
  return join(artifactRoot, 'cron', 'locks', `strategy-review-${DATE}.lock`);
}

function outcomePath(artifactRoot) {
  return join(artifactRoot, 'cron', `strategy-review-${DATE}-outcome.json`);
}

function commands(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function nodeShim() {
  const realNode = shellQuote(process.execPath);
  return `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"notify-discord-strategy-review.mjs"* ]]; then
  printf 'notify\\n' >> "$MOCK_COMMAND_LOG"
  exit "${'${MOCK_NOTIFY_EXIT:-0}'}"
fi
if [[ " $* " == *" strategy-review "* ]]; then
  printf 'review\\n' >> "$MOCK_COMMAND_LOG"
  if [[ "${'${MOCK_REVIEW_CREATE_ARTIFACT:-true}'}" == "true" ]]; then
    artifact_dir="$GANA_ARTIFACT_ROOT/runs/strategy-$MOCK_REVIEW_DATE-test"
    mkdir -p "$artifact_dir"
    printf '{"date":"%s"}\\n' "$MOCK_REVIEW_DATE" > "$artifact_dir/strategy-review.json"
  fi
  exit "${'${MOCK_REVIEW_EXIT:-0}'}"
fi
exec ${realNode} "$@"
`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}
