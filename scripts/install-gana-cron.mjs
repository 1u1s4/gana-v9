#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DISCORD_TARGET_ENV, resolveDiscordTargets } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const env = { ...loadDotEnv(), ...process.env };
const gatewayTarget = args.gatewayTarget ?? env.GANA_DISCORD_TARGET;
const targetFlag = gatewayTarget ? ` --gateway-target ${shellQuote(gatewayTarget)}` : '';
const targetEnvPrefix = discordTargetEnvPrefix();
const discordTargets = resolveDiscordTargets({ gatewayTarget, env });
const begin = '# BEGIN gana-v9 daily operations';
const end = '# END gana-v9 daily operations';
const block = [
  begin,
  'MAILTO=""',
  'TZ=America/Guatemala',
  `0 7 * * * cd ${shellQuote(REPO_ROOT)} && /usr/bin/env zsh -lc ${shellQuote(`${sourceEnvCommand()} ${targetEnvPrefix}node scripts/gana-validate-metrics-and-notify.mjs${targetFlag} >> .artifacts/gana-v9/cron/cron-validation.log 2>&1`)}`,
  `15 10 * * * cd ${shellQuote(REPO_ROOT)} && /usr/bin/env zsh -lc ${shellQuote(`${sourceEnvCommand()} ${targetEnvPrefix}node scripts/gana-daily-e2e-and-notify.mjs${targetFlag} >> .artifacts/gana-v9/cron/cron-daily-e2e.log 2>&1`)}`,
  `*/30 10-22 * * * cd ${shellQuote(REPO_ROOT)} && /usr/bin/env zsh -lc ${shellQuote(`${sourceEnvCommand()} ${targetEnvPrefix}node scripts/gana-daily-e2e-and-notify.mjs${targetFlag} >> .artifacts/gana-v9/cron/cron-daily-e2e.log 2>&1`)}`,
  `0 13 * * * cd ${shellQuote(REPO_ROOT)} && /usr/bin/env zsh -lc ${shellQuote(`${sourceEnvCommand()} ${targetEnvPrefix}node scripts/gana-strategy-review.mjs${targetFlag} >> .artifacts/gana-v9/cron/cron-strategy-review.log 2>&1`)}`,
  end,
].join('\n');

const current = readCrontab();
const next = replaceBlock(current, block);

if (args.print) {
  console.log(next);
} else {
  const tempDir = mkdtempSync(join(tmpdir(), 'gana-crontab-'));
  const tempPath = join(tempDir, 'crontab.txt');
  writeFileSync(tempPath, next.endsWith('\n') ? next : `${next}\n`);
  const child = spawnSync('crontab', [tempPath], {
    encoding: 'utf8',
  });
  try {
    if (child.error) throw child.error;
    if (child.status !== 0) {
      throw new Error(`crontab install failed with exit ${child.status}: ${(child.stderr || child.stdout || '').trim()}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ok: true, gatewayTarget: gatewayTarget ?? null, discordTargets, timezone: 'America/Guatemala' }, null, 2));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--print') parsed.print = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readCrontab() {
  const child = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  if (child.status === 0) return child.stdout.trimEnd();
  if ((child.stderr || '').includes('no crontab')) return '';
  throw new Error(`crontab -l failed with exit ${child.status}: ${(child.stderr || child.stdout || '').trim()}`);
}

function replaceBlock(current, block) {
  const pattern = new RegExp(`${escapeRegex(begin)}[\\s\\S]*?${escapeRegex(end)}`, 'm');
  const trimmed = current.trimEnd();
  if (pattern.test(trimmed)) return `${trimmed.replace(pattern, block)}\n`;
  return `${trimmed ? `${trimmed}\n\n` : ''}${block}\n`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sourceEnvCommand() {
  return 'if [ -f .env ]; then set -a; source .env; set +a; fi;';
}

function discordTargetEnvPrefix() {
  const assignments = Object.values(DISCORD_TARGET_ENV)
    .filter((key) => process.env[key])
    .map((key) => `${key}=${shellQuote(process.env[key])}`);
  return assignments.length ? `${assignments.join(' ')} ` : '';
}

function loadDotEnv() {
  const path = resolve(REPO_ROOT, '.env');
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = rest.join('=').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}
