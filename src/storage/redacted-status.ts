export interface RedactedConnectionIdentity {
  engine: 'mysql' | 'postgresql' | 'unknown';
  host: string | null;
  port: string | null;
  database: string | null;
  user: string | null;
}

export function parseDatabaseUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined;
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

export function detectDatabaseEngine(url: string | undefined): RedactedConnectionIdentity['engine'] {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) return 'unknown';
  if (parsed.protocol === 'mysql:') return 'mysql';
  if (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') return 'postgresql';
  return 'unknown';
}

export function redactedConnectionIdentity(url: string | undefined): RedactedConnectionIdentity {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) {
    return {
      engine: 'unknown',
      host: null,
      port: null,
      database: null,
      user: null,
    };
  }

  return {
    engine: detectDatabaseEngine(url),
    host: redactVisibleIdentifier(parsed.hostname),
    port: parsed.port || null,
    database: redactVisibleIdentifier(parsed.pathname.replace(/^\//, '')),
    user: redactVisibleIdentifier(decodeURIComponent(parsed.username)),
  };
}

export function redactVisibleIdentifier(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 2) return '*'.repeat(value.length);
  if (value.length <= 8) return `${value[0]}${'*'.repeat(value.length - 2)}${value[value.length - 1]}`;
  return `${value.slice(0, 3)}${'*'.repeat(Math.min(value.length - 6, 18))}${value.slice(-3)}`;
}
