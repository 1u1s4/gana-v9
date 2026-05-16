#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_TARGET = 'discord:1494071165453467721';
const args = parseArgs(process.argv.slice(2));
const gatewayTarget = args.gatewayTarget ?? process.env.GANA_DISCORD_TARGET ?? DEFAULT_TARGET;
const begin = '# BEGIN gana-v9 daily operations';
const end = '# END gana-v9 daily operations';
const block = [
  begin,
  'MAILTO=""',
  'TZ=America/Guatemala',
  `0 7 * * * cd ${shellQuote(REPO_ROOT)} && /usr/bin/env zsh -lc ${shellQuote(`node scripts/gana-validate-metrics-and-notify.mjs --gateway-target ${gatewayTarget} >> .artifacts/gana-v9/cron/cron-validation.log 2>&1`)}`,
  `0 10 * * * cd ${shellQuote(REPO_ROOT)} && /usr/bin/env zsh -lc ${shellQuote(`node scripts/gana-daily-e2e-and-notify.mjs --gateway-target ${gatewayTarget} >> .artifacts/gana-v9/cron/cron-daily-e2e.log 2>&1`)}`,
  end,
].join('\n');

const current = readCrontab();
const next = replaceBlock(current, block);

if (args.print) {
  console.log(next);
} else {
  const child = spawnSync('crontab', ['-'], {
    input: next.endsWith('\n') ? next : `${next}\n`,
    encoding: 'utf8',
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`crontab install failed with exit ${child.status}: ${(child.stderr || child.stdout || '').trim()}`);
  }
  console.log(JSON.stringify({ ok: true, gatewayTarget, timezone: 'America/Guatemala' }, null, 2));
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}
