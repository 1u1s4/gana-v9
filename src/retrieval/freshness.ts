export interface FreshnessInput {
  sourceType?: string;
  availableAt?: string;
  fixtureStatus?: string;
  now?: Date;
}

export interface FreshnessGate {
  fresh: boolean;
  reason?: string;
  ageMinutes?: number;
}

const MAX_AGE_BY_TYPE: Record<string, number> = {
  odds: 60,
  lineup: 30,
  injury: 360,
  news: 720,
};

export function evaluateFreshness(input: FreshnessInput): FreshnessGate {
  if (!input.availableAt) return { fresh: false, reason: 'source missing availableAt' };
  const ageMinutes = ((input.now ?? new Date()).getTime() - Date.parse(input.availableAt)) / 60_000;
  const maxAge = MAX_AGE_BY_TYPE[input.sourceType ?? ''] ?? 24 * 60;
  if (input.fixtureStatus === 'scheduled' && ageMinutes > maxAge) {
    return { fresh: false, reason: `stale ${input.sourceType ?? 'source'} source`, ageMinutes };
  }
  return { fresh: true, ageMinutes };
}
