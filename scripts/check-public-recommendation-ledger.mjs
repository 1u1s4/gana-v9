#!/usr/bin/env node

const args = parseArgs(process.argv.slice(2));
const date = args.date ?? guatemalaDate(1);
const timezone = args.timezone ?? 'America/Guatemala';
const baseUrl = (args.baseUrl ?? process.env.GANA_PUBLIC_PICKS_API_BASE ?? 'http://127.0.0.1:4317').replace(/\/$/, '');
const expectStatus = args.expect ?? null;
const timeoutMs = Number(args.timeoutMs ?? 20_000);

const url = new URL('/api/public-picks/feed', baseUrl);
url.searchParams.set('date', date);
url.searchParams.set('timezone', timezone);

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  clearTimeout(timer);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);

  const payload = await response.json();
  const ledger = payload?.source?.publicationLedger ?? {};
  const summary = payload?.dailySummary ?? {};
  const status = ledger.status ?? 'unknown';
  const output = {
    date: payload.date ?? date,
    endpoint: url.toString(),
    stale: Boolean(payload.stale),
    dailySummary: {
      total: summary.total ?? null,
      parlays: summary.parlays ?? null,
      requiredLeagueGeneralPredictions: summary.requiredLeagueGeneralPredictions ?? null,
      status: summary.status ?? null,
    },
    publicationLedger: {
      status,
      migrationRequired: Boolean(ledger.migrationRequired),
      publicationCount: ledger.publicationCount ?? 0,
      discordMessageIds: Array.isArray(ledger.discordMessageIds) ? ledger.discordMessageIds : [],
      payloadSha256: ledger.payloadSha256 ?? null,
      note: ledger.note ?? null,
    },
  };

  console.log(JSON.stringify(output, null, 2));

  if (expectStatus && status !== expectStatus) {
    console.error(`Expected publicationLedger.status=${expectStatus}, got ${status}`);
    process.exit(2);
  }
  if (expectStatus === 'persisted' && !(Number(ledger.publicationCount) > 0)) {
    console.error('Expected persisted ledger rows, got publicationCount=0');
    process.exit(3);
  }
  if (payload.stale) {
    console.error(`Public recommendations response is stale: ${(payload.staleReasons ?? []).join('; ')}`);
    process.exit(4);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    parsed[key] = inlineValue ?? values[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return parsed;
}

function guatemalaDate(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Guatemala',
    year: 'numeric',
  }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const base = new Date(`${lookup.year}-${lookup.month}-${lookup.day}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}
