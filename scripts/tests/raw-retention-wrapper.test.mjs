import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const WRAPPER = join(REPO_ROOT, 'scripts/gana-raw-retention-apply.sh');
const CRON_INSTALLER = join(REPO_ROOT, 'scripts/install-gana-cron.mjs');

test('wrapper publishes an atomic conservative JSON artifact when apply fails', () => {
  withHarness(({ artifactRoot, env }) => {
    const child = runWrapper(env, 'fail');
    assert.equal(child.status, 17, child.stderr);

    const reports = reportFiles(artifactRoot);
    assert.equal(reports.length, 1);
    assert.match(reports[0], /^retention-\d{8}T\d{6}Z-\d+\.json$/);
    assert.equal(readdirSync(join(artifactRoot, 'retention')).some((name) => name.startsWith('.')), false);

    const reportText = readFileSync(join(artifactRoot, 'retention', reports[0]), 'utf8');
    const report = JSON.parse(reportText);
    assert.equal(report.status, 'error');
    assert.equal(report.changed, 'possibly-partial');
    assert.equal(report.exitCode, 17);
    assert.equal(report.reason, 'retention-apply-command-failed');
    assert.doesNotMatch(reportText, /sensitive-marker/);
  });
});

test('wrapper replaces zero-exit truncated output with a valid error artifact', () => {
  withHarness(({ artifactRoot, env }) => {
    const child = runWrapper(env, 'invalid-json');
    assert.equal(child.status, 70, child.stderr);

    const reports = reportFiles(artifactRoot);
    assert.equal(reports.length, 1);
    const report = JSON.parse(readFileSync(join(artifactRoot, 'retention', reports[0]), 'utf8'));
    assert.equal(report.status, 'error');
    assert.equal(report.changed, 'possibly-partial');
    assert.equal(report.exitCode, 70);
    assert.equal(report.reason, 'retention-apply-invalid-json');
  });
});

test('wrapper gives a new ownerless lock a grace period instead of deleting it', () => {
  withHarness(({ artifactRoot, env }) => {
    const lockDir = join(artifactRoot, 'cron/locks/raw-retention.lock');
    mkdirSync(lockDir, { recursive: true });

    const child = runWrapper(env, 'fail');
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {
      status: 'skipped',
      reason: 'retention-lock-initializing',
      changed: false,
    });
    assert.equal(existsSync(lockDir), true);
    assert.equal(existsSync(join(artifactRoot, 'retention')), false);
  });
});

test('wrapper safely reclaims a stale lock with a dead owner', () => {
  withHarness(({ artifactRoot, env }) => {
    const lockDir = join(artifactRoot, 'cron/locks/raw-retention.lock');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(
      join(lockDir, 'owner'),
      `stale-owner\n2147483647\n${Math.floor(Date.now() / 1000) - 120}\n`,
      { mode: 0o600 },
    );

    const child = runWrapper(env, 'success');
    assert.equal(child.status, 0, child.stderr);
    assert.equal(reportFiles(artifactRoot).length, 1);
    assert.equal(existsSync(join(lockDir, 'kernel.lock')), true);
    assert.equal(existsSync(join(lockDir, 'owner')), false);
  });
});

test('wrapper repeats retention until post-delete dependencies reach a clean fixed point', () => {
  withHarness(({ artifactRoot, env }) => {
    const child = runWrapper(env, 'residual-then-success');
    assert.equal(child.status, 0, child.stderr);

    const reports = reportFiles(artifactRoot);
    assert.equal(reports.length, 1);
    const report = JSON.parse(readFileSync(join(artifactRoot, 'retention', reports[0]), 'utf8'));
    assert.equal(report.applyPasses, 2);
    assert.equal(report.after.totals.rowCount, 0);
    assert.equal(report.historyAfter.totals.rowCount, 0);
    assert.equal(report.compactionAfter.totals.rowCount, 0);
  });
});

test('wrapper cleanup never removes a lock whose ownership token changed', () => {
  withHarness(({ artifactRoot, env }) => {
    const child = runWrapper(env, 'steal-owner');
    assert.equal(child.status, 0, child.stderr);

    const lockDir = join(artifactRoot, 'cron/locks/raw-retention.lock');
    assert.equal(existsSync(lockDir), true);
    assert.match(readFileSync(join(lockDir, 'owner'), 'utf8'), /^replacement-owner\n/);
  });
});

test('system cron preview delegates all daily operations through one dispatcher', () => {
  withHarness(({ env }) => {
    const child = spawnSync(process.execPath, [CRON_INSTALLER, '--print'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
    });
    assert.equal(child.status, 0, child.stderr);

    const jobLines = child.stdout.split(/\r?\n/).filter((line) => /^\S.* \* \* \*/.test(line));
    assert.equal(jobLines.length, 1);
    assert.match(jobLines[0], /^15 7,10,13,18,22 \* \* \*/);
    assert.equal(jobLines[0].includes('scripts/gana-daily-ops-dispatch.mjs'), true);
    for (const line of jobLines) {
      const mkdirAt = line.indexOf('&& mkdir -p ');
      const redirectAt = line.indexOf(' >> ');
      assert.ok(mkdirAt >= 0, line);
      assert.ok(redirectAt > mkdirAt, line);
    }
  });
});

function withHarness(run) {
  const root = mkdtempSync(join(tmpdir(), 'gana-retention-wrapper-'));
  const artifactRoot = join(root, 'artifacts');
  const binDir = join(root, 'bin');
  const shimPath = join(binDir, 'node');
  const crontabShimPath = join(binDir, 'crontab');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(shimPath, nodeShim(), { mode: 0o700 });
  writeFileSync(
    crontabShimPath,
    '#!/usr/bin/env bash\nprintf "no crontab for test user\\n" >&2\nexit 1\n',
    { mode: 0o700 },
  );
  chmodSync(shimPath, 0o700);
  chmodSync(crontabShimPath, 0o700);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    GANA_ARTIFACT_ROOT: artifactRoot,
  };

  try {
    run({ root, artifactRoot, env });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runWrapper(env, mode) {
  return spawnSync(WRAPPER, [], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...env, MOCK_RETENTION_MODE: mode },
  });
}

function reportFiles(artifactRoot) {
  const dir = join(artifactRoot, 'retention');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
}

function nodeShim() {
  const realNode = shellQuote(process.execPath);
  return `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--input-type=module" ]]; then
  exit 1
fi
if [[ "\${1:-}" == "scripts/gana-raw-retention.mjs" ]]; then
  success='{"after":{"totals":{"rowCount":0}},"historyAfter":{"totals":{"rowCount":0}},"compactionAfter":{"totals":{"rowCount":0}},"capacityAfter":{"status":"ok"}}'
  case "\${MOCK_RETENTION_MODE:-success}" in
    fail)
      printf '{"partial":'
      printf 'sensitive-marker=must-not-enter-artifact\\n' >&2
      exit 17
      ;;
    invalid-json)
      printf '{"partial":'
      ;;
    steal-owner)
      owner="\${GANA_ARTIFACT_ROOT}/cron/locks/raw-retention.lock/owner"
      printf 'replacement-owner\\n999999999\\n0\\n' > "$owner"
      printf '%s\\n' "$success"
      ;;
    residual-then-success)
      state="\${GANA_ARTIFACT_ROOT}/retention-pass-state"
      if [[ ! -e "$state" ]]; then
        : > "$state"
        printf '%s\\n' '{"after":{"totals":{"rowCount":7}},"historyAfter":{"totals":{"rowCount":0}},"compactionAfter":{"totals":{"rowCount":0}},"capacityAfter":{"status":"ok"}}'
      else
        printf '%s\\n' "$success"
      fi
      ;;
    success)
      printf '%s\\n' "$success"
      ;;
    *)
      exit 99
      ;;
  esac
  exit 0
fi
exec ${realNode} "$@"
`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}
