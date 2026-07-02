import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_DISCORD_TARGET = 'discord:1510041125614915756';

export const DISCORD_TARGET_ENV = {
  recommendations: 'GANA_DISCORD_RECOMMENDATIONS_TARGET',
  validation: 'GANA_DISCORD_VALIDATION_TARGET',
  strategy: 'GANA_DISCORD_STRATEGY_TARGET',
  alerts: 'GANA_DISCORD_ALERTS_TARGET',
};

export const DISCORD_TARGET_FLOWS = Object.freeze(Object.keys(DISCORD_TARGET_ENV));

export function resolveDiscordTarget(flow, options = {}) {
  const env = options.env ?? runtimeEnv();
  const envKey = DISCORD_TARGET_ENV[flow];
  if (!envKey) throw new Error(`Unknown Discord target flow: ${flow}`);

  return cleanTarget(env[envKey])
    ?? cleanTarget(options.gatewayTarget)
    ?? cleanTarget(env.GANA_DISCORD_TARGET)
    ?? DEFAULT_DISCORD_TARGET;
}

export function resolveDiscordTargets(options = {}) {
  return Object.fromEntries(
    DISCORD_TARGET_FLOWS.map((flow) => [flow, resolveDiscordTarget(flow, options)]),
  );
}

export function discordTargetArg(target) {
  const value = cleanTarget(target);
  return value ? ['--gateway-target', value] : [];
}

function cleanTarget(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

let cachedDotEnv;

function runtimeEnv() {
  return { ...loadDotEnv(), ...process.env };
}

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (cachedDotEnv?.path === path) return cachedDotEnv.values;
  const values = {};
  if (!existsSync(path)) {
    cachedDotEnv = { path, values };
    return values;
  }
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = rest.join('=').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  cachedDotEnv = { path, values };
  return values;
}
