import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);
const CRON_INSTALLER = join(REPO_ROOT, 'scripts/install-gana-cron.mjs');
const HERMES_INSTALLER = join(REPO_ROOT, 'scripts/install-gana-hermes-cron.sh');
const LAUNCHD_INSTALLER = join(REPO_ROOT, 'scripts/install-gana-launchd.mjs');
const CRON_SCHEDULE = '15 7,10,13,18,22 * * *';
const DISPATCHER = 'scripts/gana-daily-ops-dispatch.mjs';
const HERMES_JOB = 'gana-v9-daily-operations';
const LAUNCHD_LABEL = 'com.gana-v9.daily-operations';
const LEGACY_HERMES_JOBS = [
  'gana-v9-raw-retention',
  'gana-v9-validate-yesterday-discord',
  'gana-v9-daily-e2e-discord',
  'gana-v9-daily-e2e-catchup-discord',
  'gana-v9-strategy-review',
];
const LEGACY_LAUNCHD_LABELS = [
  'com.gana-v9.raw-retention',
  'com.gana-v9.validate-yesterday',
  'com.gana-v9.daily-e2e',
  'com.gana-v9.daily-e2e-catchup',
  'com.gana-v9.strategy-review',
];
const LEGACY_SCRIPTS = [
  'scripts/gana-raw-retention-apply.sh',
  'scripts/gana-previous-day-validation-notify.sh',
  'scripts/gana-daily-e2e-notify.sh',
  'scripts/gana-strategy-review.sh',
];

test('system cron install and uninstall preserve unrelated entries while pruning legacy jobs', () => {
  withTempDir('gana-cron-installer-', (root) => {
    const binDir = join(root, 'bin');
    const statePath = join(root, 'crontab.txt');
    mkdirSync(binDir, { recursive: true });
    writeExecutable(join(binDir, 'crontab'), crontabShim());
    writeFileSync(statePath, [
      '# unrelated backup',
      '5 4 * * * /usr/local/bin/backup-database',
      '# BEGIN gana-v9 daily operations',
      'MAILTO=""',
      'TZ=America/Guatemala',
      `30 6 * * * cd ${shellQuote(REPO_ROOT)} && ${LEGACY_SCRIPTS[0]}`,
      `0 7 * * * cd ${shellQuote(REPO_ROOT)} && ${LEGACY_SCRIPTS[1]}`,
      `15 10 * * * cd ${shellQuote(REPO_ROOT)} && ${LEGACY_SCRIPTS[2]}`,
      `*/30 10-22 * * * cd ${shellQuote(REPO_ROOT)} && ${LEGACY_SCRIPTS[2]}`,
      `0 13 * * * cd ${shellQuote(REPO_ROOT)} && ${LEGACY_SCRIPTS[3]}`,
      '# END gana-v9 daily operations',
      '# unrelated gana report',
      '45 23 * * * /usr/local/bin/archive-gana-report',
      '',
    ].join('\n'));

    const env = testEnv(binDir, {
      FAKE_CRONTAB_STATE: statePath,
      GANA_DISCORD_TARGET: 'discord:test-alerts',
    });
    const install = run(process.execPath, [CRON_INSTALLER], env);
    assert.equal(install.status, 0, install.stderr);

    const installed = readFileSync(statePath, 'utf8');
    assert.match(installed, /5 4 \* \* \* \/usr\/local\/bin\/backup-database/);
    assert.match(installed, /45 23 \* \* \* \/usr\/local\/bin\/archive-gana-report/);
    assert.equal(countOccurrences(installed, DISPATCHER), 1);
    assert.match(installed, new RegExp(`^${escapeRegex(CRON_SCHEDULE)} `, 'm'));
    for (const legacyScript of LEGACY_SCRIPTS) assert.doesNotMatch(installed, new RegExp(escapeRegex(legacyScript)));

    const uninstall = run(process.execPath, [CRON_INSTALLER, '--uninstall'], env);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const uninstalled = readFileSync(statePath, 'utf8');
    assert.match(uninstalled, /5 4 \* \* \* \/usr\/local\/bin\/backup-database/);
    assert.match(uninstalled, /45 23 \* \* \* \/usr\/local\/bin\/archive-gana-report/);
    assert.doesNotMatch(uninstalled, /gana-v9-daily-operations/);
    assert.doesNotMatch(uninstalled, new RegExp(escapeRegex(DISPATCHER)));
  });
});

test('Hermes installer removes exact legacy names and canonical duplicates before upsert', () => {
  withTempDir('gana-hermes-installer-', (root) => {
    const binDir = join(root, 'bin');
    const scriptsDir = join(root, 'hermes-scripts');
    const statePath = join(root, 'jobs.txt');
    const logPath = join(root, 'hermes.log');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(scriptsDir, { recursive: true });
    writeExecutable(join(binDir, 'hermes'), hermesShim());

    const stateRows = [
      ['a00000000001', 'paused', LEGACY_HERMES_JOBS[0]],
      ['a00000000002', 'paused', LEGACY_HERMES_JOBS[1]],
      ['a00000000003', 'paused', LEGACY_HERMES_JOBS[2]],
      ['a00000000004', 'paused', LEGACY_HERMES_JOBS[3]],
      ['a00000000005', 'paused', LEGACY_HERMES_JOBS[4]],
      ['b00000000001', 'paused', HERMES_JOB],
      ['b00000000002', 'paused', HERMES_JOB],
      ['c00000000001', 'active', 'unrelated-nightly-job'],
    ];
    writeFileSync(statePath, `${stateRows.map((row) => row.join('|')).join('\n')}\n`);
    for (const wrapper of [
      'gana_v9_raw_retention_apply.sh',
      'gana_v9_previous_day_validation_notify.sh',
      'gana_v9_daily_e2e_notify.sh',
      'gana_v9_strategy_review.sh',
    ]) {
      writeFileSync(join(scriptsDir, wrapper), 'legacy\n');
    }

    const child = run('/bin/bash', [HERMES_INSTALLER], testEnv(binDir, {
      HERMES_SCRIPTS_DIR: scriptsDir,
      FAKE_HERMES_STATE: statePath,
      FAKE_HERMES_LOG: logPath,
      GANA_HERMES_CRON_DELIVER: 'discord:test-alerts',
    }));
    assert.equal(child.status, 0, child.stderr);

    const remaining = readHermesState(statePath);
    assert.equal(remaining.filter((job) => job.name === HERMES_JOB).length, 1);
    assert.equal(remaining.some((job) => LEGACY_HERMES_JOBS.includes(job.name)), false);
    assert.equal(remaining.some((job) => job.name === 'unrelated-nightly-job'), true);

    const log = readFileSync(logPath, 'utf8');
    for (const id of ['a00000000001', 'a00000000002', 'a00000000003', 'a00000000004', 'a00000000005', 'b00000000002']) {
      assert.match(log, new RegExp(`^cron\\tremove\\t${id}$`, 'm'));
    }
    assert.match(log, new RegExp(`^cron\\tedit\\t--schedule\\t${escapeRegex(CRON_SCHEDULE)}(?:\\t|$)`, 'm'));
    assert.doesNotMatch(log, /^cron\t(?:resume|run)\t/m);

    const wrapperPath = join(scriptsDir, 'gana_v9_daily_operations.sh');
    assert.equal(existsSync(wrapperPath), true);
    const wrapper = readFileSync(wrapperPath, 'utf8');
    assert.match(wrapper, /exec node .*scripts\/gana-daily-ops-dispatch\.mjs/);
    for (const legacyScript of LEGACY_SCRIPTS) assert.doesNotMatch(wrapper, new RegExp(escapeRegex(legacyScript)));

    const uninstall = run('/bin/bash', [HERMES_INSTALLER, '--uninstall'], testEnv(binDir, {
      HERMES_SCRIPTS_DIR: scriptsDir,
      FAKE_HERMES_STATE: statePath,
      FAKE_HERMES_LOG: logPath,
      GANA_HERMES_CRON_DELIVER: 'discord:test-alerts',
    }));
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const afterUninstall = readHermesState(statePath);
    assert.equal(afterUninstall.some((job) => job.name === HERMES_JOB), false);
    assert.equal(afterUninstall.some((job) => LEGACY_HERMES_JOBS.includes(job.name)), false);
    assert.equal(afterUninstall.some((job) => job.name === 'unrelated-nightly-job'), true);
    assert.equal(existsSync(wrapperPath), false);
  });
});

test('launchd preview contains one canonical plist with five 15-minute intervals', () => {
  withTempDir('gana-launchd-preview-', (root) => {
    const child = run(process.execPath, [LAUNCHD_INSTALLER, '--print'], {
      ...process.env,
      HOME: root,
      GANA_DISCORD_TARGET: 'discord:test-alerts',
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(countOccurrences(child.stdout, '<?xml version='), 1);
    assert.equal(countOccurrences(child.stdout, `<string>${LAUNCHD_LABEL}</string>`), 1);
    assert.equal(countOccurrences(child.stdout, '<key>StartCalendarInterval</key>'), 1);
    assert.match(child.stdout, new RegExp(escapeRegex(resolve(REPO_ROOT, DISPATCHER))));
    for (const legacyLabel of LEGACY_LAUNCHD_LABELS) {
      assert.doesNotMatch(child.stdout, new RegExp(`<string>${escapeRegex(legacyLabel)}</string>`));
    }
    assert.deepEqual(plistIntegers(child.stdout, 'Hour'), [7, 10, 13, 18, 22]);
    assert.deepEqual(plistIntegers(child.stdout, 'Minute'), [15, 15, 15, 15, 15]);
    assert.equal(existsSync(join(root, 'Library', 'LaunchAgents')), false);
  });
});

test('launchd install and uninstall remove only canonical and five legacy plists', () => {
  withTempDir('gana-launchd-installer-', (root) => {
    const binDir = join(root, 'bin');
    const launchAgentsDir = join(root, 'Library', 'LaunchAgents');
    const logPath = join(root, 'launchctl.log');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(launchAgentsDir, { recursive: true });
    writeExecutable(join(binDir, 'launchctl'), launchctlShim());
    for (const label of LEGACY_LAUNCHD_LABELS) writeFileSync(join(launchAgentsDir, `${label}.plist`), 'legacy\n');
    const unrelatedPath = join(launchAgentsDir, 'com.example.unrelated.plist');
    writeFileSync(unrelatedPath, 'unrelated\n');

    const env = testEnv(binDir, {
      HOME: root,
      FAKE_LAUNCHCTL_LOG: logPath,
      GANA_DISCORD_TARGET: 'discord:test-alerts',
    });
    const install = run(process.execPath, [LAUNCHD_INSTALLER], env);
    assert.equal(install.status, 0, install.stderr);
    for (const label of LEGACY_LAUNCHD_LABELS) assert.equal(existsSync(join(launchAgentsDir, `${label}.plist`)), false);
    const canonicalPath = join(launchAgentsDir, `${LAUNCHD_LABEL}.plist`);
    assert.equal(existsSync(canonicalPath), true);
    assert.equal(existsSync(unrelatedPath), true);

    const installedPlist = readFileSync(canonicalPath, 'utf8');
    assert.equal(countOccurrences(installedPlist, '<key>StartCalendarInterval</key>'), 1);
    assert.deepEqual(plistIntegers(installedPlist, 'Hour'), [7, 10, 13, 18, 22]);
    const installLog = readFileSync(logPath, 'utf8');
    for (const label of LEGACY_LAUNCHD_LABELS) assert.match(installLog, new RegExp(escapeRegex(label)));
    assert.equal(installLog.split(/\r?\n/).filter((line) => line.startsWith('bootstrap\t')).length, 1);

    for (const label of LEGACY_LAUNCHD_LABELS) writeFileSync(join(launchAgentsDir, `${label}.plist`), 'legacy\n');
    const uninstall = run(process.execPath, [LAUNCHD_INSTALLER, '--uninstall'], env);
    assert.equal(uninstall.status, 0, uninstall.stderr);
    for (const label of [LAUNCHD_LABEL, ...LEGACY_LAUNCHD_LABELS]) {
      assert.equal(existsSync(join(launchAgentsDir, `${label}.plist`)), false);
    }
    assert.equal(existsSync(unrelatedPath), true);
  });
});

function run(command, argv, env) {
  return spawnSync(command, argv, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
  });
}

function withTempDir(prefix, callback) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testEnv(binDir, overrides = {}) {
  return {
    ...process.env,
    ...overrides,
    PATH: `${binDir}:${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  };
}

function writeExecutable(path, contents) {
  writeFileSync(path, contents, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function crontabShim() {
  return `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-l" ]]; then
  if [[ -f "$FAKE_CRONTAB_STATE" ]]; then
    cat "$FAKE_CRONTAB_STATE"
    exit 0
  fi
  printf 'no crontab for test user\\n' >&2
  exit 1
fi
cp "$1" "$FAKE_CRONTAB_STATE"
`;
}

function hermesShim() {
  return `#!/usr/bin/env bash
set -euo pipefail
{
  first=1
  for arg in "$@"; do
    if (( first == 0 )); then printf '\\t'; fi
    printf '%s' "$arg"
    first=0
  done
  printf '\\n'
} >> "$FAKE_HERMES_LOG"

if [[ "\${1:-}" == "cron" && "\${2:-}" == "list" ]]; then
  while IFS='|' read -r id state name; do
    [[ -n "$id" ]] || continue
    printf '  %s [%s]\\n' "$id" "$state"
    printf '    Name:      %s\\n' "$name"
    printf '    Schedule:  test\\n\\n'
  done < "$FAKE_HERMES_STATE"
  exit 0
fi

if [[ "\${1:-}" == "cron" && "\${2:-}" == "remove" ]]; then
  awk -F '|' -v expected="$3" '$1 != expected' "$FAKE_HERMES_STATE" > "$FAKE_HERMES_STATE.tmp"
  mv "$FAKE_HERMES_STATE.tmp" "$FAKE_HERMES_STATE"
  exit 0
fi

if [[ "\${1:-}" == "cron" && "\${2:-}" == "edit" ]]; then
  exit 0
fi

if [[ "\${1:-}" == "cron" && "\${2:-}" == "create" ]]; then
  exit 0
fi

exit 64
`;
}

function launchctlShim() {
  return `#!/usr/bin/env bash
set -euo pipefail
{
  first=1
  for arg in "$@"; do
    if (( first == 0 )); then printf '\\t'; fi
    printf '%s' "$arg"
    first=0
  done
  printf '\\n'
} >> "$FAKE_LAUNCHCTL_LOG"
if [[ "\${1:-}" == "print" ]]; then exit 1; fi
exit 0
`;
}

function readHermesState(path) {
  return readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, state, name] = line.split('|');
    return { id, state, name };
  });
}

function plistIntegers(plist, key) {
  const pattern = new RegExp(`<key>${key}</key>\\s*<integer>(\\d+)</integer>`, 'g');
  return [...plist.matchAll(pattern)].map((match) => Number(match[1]));
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}
