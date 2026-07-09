#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveDiscordTargets } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const env = { ...loadDotEnv(), ...process.env };
const gatewayTarget = args.gatewayTarget ?? env.GANA_DISCORD_TARGET;
const discordTargets = resolveDiscordTargets({ gatewayTarget, env });
const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
const userDomain = `gui/${process.getuid()}`;

const baseEnvironment = {
  PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
  GANA_DISCORD_TARGET: gatewayTarget ?? discordTargets.alerts,
  GANA_DISCORD_RECOMMENDATIONS_TARGET: discordTargets.recommendations,
  GANA_DISCORD_VALIDATION_TARGET: discordTargets.validation,
  GANA_DISCORD_STRATEGY_TARGET: discordTargets.strategy,
  GANA_DISCORD_ALERTS_TARGET: discordTargets.alerts,
};

const jobs = [
  {
    label: 'com.gana-v9.validate-yesterday',
    script: 'scripts/gana-previous-day-validation-notify.sh',
    calendar: { Hour: 7, Minute: 0 },
    stdout: '.artifacts/gana-v9/cron/launchd-validation.log',
    stderr: '.artifacts/gana-v9/cron/launchd-validation.err.log',
  },
  {
    label: 'com.gana-v9.daily-e2e',
    script: 'scripts/gana-daily-e2e-notify.sh',
    calendar: { Hour: 10, Minute: 15 },
    stdout: '.artifacts/gana-v9/cron/launchd-daily-e2e.log',
    stderr: '.artifacts/gana-v9/cron/launchd-daily-e2e.err.log',
  },
  {
    label: 'com.gana-v9.daily-e2e-catchup',
    script: 'scripts/gana-daily-e2e-notify.sh',
    calendar: halfHourCalendar(10, 22),
    stdout: '.artifacts/gana-v9/cron/launchd-daily-e2e-catchup.log',
    stderr: '.artifacts/gana-v9/cron/launchd-daily-e2e-catchup.err.log',
  },
  {
    label: 'com.gana-v9.strategy-review',
    script: 'scripts/gana-strategy-review.sh',
    calendar: { Hour: 13, Minute: 0 },
    stdout: '.artifacts/gana-v9/cron/launchd-strategy-review.log',
    stderr: '.artifacts/gana-v9/cron/launchd-strategy-review.err.log',
  },
];

mkdirSync(launchAgentsDir, { recursive: true });

const results = [];
for (const job of jobs) {
  const plistPath = join(launchAgentsDir, `${job.label}.plist`);
  const plist = buildPlist(job);
  if (args.print) {
    console.log(`### ${plistPath}`);
    console.log(plist);
    continue;
  }
  writeFileSync(plistPath, plist);
  unload(job.label, plistPath);
  const bootstrap = run('launchctl', ['bootstrap', userDomain, plistPath], { allowFailure: true });
  if (bootstrap.status !== 0 && !alreadyBootstrapped(bootstrap.stderr)) {
    throw new Error(`launchctl bootstrap failed for ${job.label}: ${(bootstrap.stderr || bootstrap.stdout).trim()}`);
  }
  run('launchctl', ['enable', `${userDomain}/${job.label}`]);
  const print = run('launchctl', ['print', `${userDomain}/${job.label}`], { allowFailure: true });
  results.push({
    label: job.label,
    plistPath,
    bootstrapStatus: bootstrap.status,
    loaded: print.status === 0,
  });
}

if (!args.print) {
  console.log(JSON.stringify({
    ok: true,
    userDomain,
    discordTargets,
    jobs: results,
  }, null, 2));
}

function buildPlist(job) {
  const stdout = resolve(REPO_ROOT, job.stdout);
  const stderr = resolve(REPO_ROOT, job.stderr);
  mkdirSync(dirname(stdout), { recursive: true });
  mkdirSync(dirname(stderr), { recursive: true });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(job.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${escapeXml(resolve(REPO_ROOT, job.script))}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(REPO_ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(baseEnvironment).map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`).join('\n')}
  </dict>
  <key>StartCalendarInterval</key>
${calendarPlist(job.calendar)}
  <key>StandardOutPath</key>
  <string>${escapeXml(stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderr)}</string>
</dict>
</plist>
`;
}

function calendarPlist(calendar) {
  if (Array.isArray(calendar)) {
    return `  <array>\n${calendar.map((item) => calendarDict(item, 4)).join('\n')}\n  </array>`;
  }
  return calendarDict(calendar, 2);
}

function calendarDict(item, indent) {
  const spaces = ' '.repeat(indent);
  return `${spaces}<dict>
${spaces}  <key>Hour</key>
${spaces}  <integer>${item.Hour}</integer>
${spaces}  <key>Minute</key>
${spaces}  <integer>${item.Minute}</integer>
${spaces}</dict>`;
}

function halfHourCalendar(startHour, endHour) {
  const entries = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    entries.push({ Hour: hour, Minute: 0 });
    entries.push({ Hour: hour, Minute: 30 });
  }
  return entries;
}

function unload(label, plistPath) {
  run('launchctl', ['bootout', userDomain, plistPath], { allowFailure: true });
  run('launchctl', ['bootout', `${userDomain}/${label}`], { allowFailure: true });
}

function run(command, argv, options = {}) {
  const child = spawnSync(command, argv, { encoding: 'utf8' });
  if (child.error) throw child.error;
  if (!options.allowFailure && child.status !== 0) {
    throw new Error(`${command} ${argv.join(' ')} failed with exit ${child.status}: ${(child.stderr || child.stdout).trim()}`);
  }
  return child;
}

function alreadyBootstrapped(stderr) {
  return /service already loaded|already exists|Bootstrap failed: 5/i.test(String(stderr ?? ''));
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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}
