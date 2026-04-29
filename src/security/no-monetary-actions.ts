export interface MonetaryActionDetection {
  blocked: boolean;
  reason: string;
  matches: string[];
}

const MONETARY_PATTERNS = [
  /\b(place|submit|execute|auto(?:mate)?|confirm)\s+(a\s+)?(bet|wager|parlay|stake)\b/i,
  /\b(bet|wager|stake)\s+(\$|usd|eur|gtq|quetzales?|\d)/i,
  /\b(place|put|risk)\s+(\$|usd|eur|gtq|quetzales?|\d).{0,80}\b(on|into|for)\b/i,
  /\b(apostar|apuesta|apostar(?:me)?|ejecutar\s+apuesta|colocar\s+apuesta)\b/i,
  /\b(move|send|transfer|withdraw|deposit)\s+(funds|money|cash|balance)\b/i,
  /\b(pay|charge|bill|invoice|refund|deposit|withdraw|transfer|wire|send)\b.{0,80}\b(\$|usd|eur|gtq|money|funds?|bank|card|paypal|stripe|venmo|account|crypto|btc|eth)\b/i,
  /\b(retirar|depositar|transferir|mover)\s+(fondos|dinero|saldo)\b/i,
  /\b(buy|purchase|sell|short|trade|swap)\b.{0,80}\b(stock|stocks|share|shares|crypto|btc|eth|coin|token|option|options|futures|forex|usd|eur|\$)\b/i,
  /\b(bookmaker|sportsbook|bet365|draftkings|fanduel|stake\.com)\b.*\b(login|submit|place|wager|bet)\b/i,
  /\b(guarantee|guaranteed|garant[ií]a|garantizado)\b.*\b(result|profit|win|resultado|ganancia)\b/i,
  /\b(credit\s+card|debit\s+card|routing|account\s+number)\b/i,
];

export const NO_MONETARY_ACTIONS_PROMPT = [
  'Monetary safety: Gana v9 produces analytical artifacts only.',
  'Do not initiate purchases, payments, fund movements, account changes, or real-money betting activity.',
].join(' ');

export function detectMonetaryAction(value: unknown): MonetaryActionDetection {
  const text = flatten(value).join('\n');
  const matches = MONETARY_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
  return {
    blocked: matches.length > 0,
    reason: matches.length
      ? 'Monetary automation is blocked: Gana v9 only produces analytical artifacts and cannot execute wagers, move funds, collect financial credentials, or guarantee results.'
      : 'No monetary action detected.',
    matches,
  };
}

export function assertNoMonetaryAction(value: unknown): void {
  const detection = detectMonetaryAction(value);
  if (detection.blocked) throw new Error(detection.reason);
}

function flatten(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flatten);
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [key, ...flatten(item)]);
}
