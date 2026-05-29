export const DEFAULT_DISCORD_TARGET = 'discord:1494071165453467721';

export const DISCORD_TARGET_ENV = {
  recommendations: 'GANA_DISCORD_RECOMMENDATIONS_TARGET',
  council: 'GANA_DISCORD_COUNCIL_TARGET',
  validation: 'GANA_DISCORD_VALIDATION_TARGET',
  feedback: 'GANA_DISCORD_FEEDBACK_TARGET',
  strategy: 'GANA_DISCORD_STRATEGY_TARGET',
  alerts: 'GANA_DISCORD_ALERTS_TARGET',
};

export const DISCORD_TARGET_FLOWS = Object.freeze(Object.keys(DISCORD_TARGET_ENV));

export function resolveDiscordTarget(flow, options = {}) {
  const env = options.env ?? process.env;
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
