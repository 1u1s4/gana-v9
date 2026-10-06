import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/gana-daily-e2e-notify.sh');
function isolated(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gana-scheduled-contract-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(script, join(root, 'scripts/daily.sh'));
    writeFileSync(join(root, '.env'), 'GANA_RESEARCH_REUSE_RUN_ID=stale-recovery\nAGENT_REASONING_EFFORT=low\nAGENT_FAST_MODE=true\n');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GANA_|AGENT_)/.test(key)));
    env.GANA_DAILY_DATE = '2026-10-08';
    env.GANA_RESEARCH_REUSE_RUN_ID = 'inherited-recovery';
    fn(root, env);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('scheduled config preview is side-effect free and excludes one-off recovery state', () => isolated((root, env) => {
  const run = spawnSync('bash', [join(root, 'scripts/daily.sh'), '--print-config'], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    date: '2026-10-08', dailyBatchId: 'daily-2026-10-08-full', providers: 'codex',
    model: 'gpt-5.6-sol', reasoningEffort: 'high', fastMode: 'false', fallbackModels: '',
    providerConcurrency: 1, web: 'live', parlayProfile: 'portfolio-v2', requiredLeagues: 'auto',
    coverageDiscoveryMaxFixtures: 12, lowOddsThreshold: 1.1, maxProviderRequests: 10000,
    researchReuseRunId: null,
  });
  assert.deepEqual(readdirSync(root).sort(), ['.env', 'scripts']);
}));

test('actual scheduled child receives the verified E2E flags and fresh research environment', () => isolated((root, env) => {
  const bin = join(root, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'node'), `#!${process.execPath}\nconsole.log(JSON.stringify({args:process.argv.slice(2),coverage:process.env.GANA_COVERAGE_DISCOVERY_MAX_FIXTURES,reuse:process.env.GANA_RESEARCH_REUSE_RUN_ID??null,reasoning:process.env.AGENT_REASONING_EFFORT,fast:process.env.AGENT_FAST_MODE}));\n`, { mode: 0o755 });
  const run = spawnSync('bash', [join(root, 'scripts/daily.sh')], { env: { ...env, GANA_CODEX_BIN_DIR: bin }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.args[0], 'scripts/gana-daily-e2e-and-notify.mjs');
  for (const [flag, value] of Object.entries({ '--date': '2026-10-08', '--providers': 'codex', '--codex-model': 'gpt-5.6-sol', '--provider-concurrency': '1', '--web': 'live', '--parlay-profile': 'portfolio-v2', '--required-leagues': 'auto' })) {
    assert.equal(result.args[result.args.indexOf(flag) + 1], value, flag);
  }
  assert.equal(result.coverage, '12'); assert.equal(result.reuse, null);
  assert.equal(result.reasoning, 'high'); assert.equal(result.fast, 'false');
}));
