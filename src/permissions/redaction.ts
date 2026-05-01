const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';

const SENSITIVE_KEY_PARTS = [
  'api-key',
  'apikey',
  'authorization',
  'cookie',
  'database-url',
  'database_url',
  'databaseurl',
  'key',
  'password',
  'refresh-token',
  'refresh_token',
  'secret',
  'token',
];

const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const PROVIDER_SECRET_HEADER_PATTERN = /\b(x-apisports-key|x-api-key|api[-_]?key)\s*[:= ]\s*([^\n\s]+)/gi;
const ENV_ASSIGNMENT_PATTERN = /(^|\n)(\s*[\w.-]*(?:key|token|secret|password|authorization|database_url)[\w.-]*\s*=\s*)([^\n]*)/gi;
const INLINE_SECRET_ASSIGNMENT_PATTERN = /(\b[\w.-]*(?:key|token|secret|password|authorization|database_url)[\w.-]*\s*=\s*)([^&\s"'`\\]+)/gi;
const QUERY_SECRET_PATTERN = /([?&][^=\s&]*(?:key|token|secret|password|authorization)[^=\s&]*=)([^&\s]+)/gi;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+)(?::([^@/\s]*))?@/gi;
const OPENAI_STYLE_SECRET_PATTERN = /\b(sk-[A-Za-z0-9_-]{12,})\b/g;
const GITHUB_TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9_]{12,})\b/g;
const JWT_PATTERN = /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g;
const COOKIE_PAIR_PATTERN = /\b(cookie\s*[:=]\s*)([^\n]+)/gi;

export function redactSecrets(value: unknown): unknown {
  return redactUnknown(value, new WeakSet<object>());
}

export function redactConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = REDACTED;
    if (parsed.password) parsed.password = REDACTED;

    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, REDACTED);
      }
    }

    return parsed.toString().replace(/%5BREDACTED%5D/gi, REDACTED);
  } catch {
    return redactNonUrlText(url).replace(URL_CREDENTIAL_PATTERN, (_match, protocol: string) => {
      return `${protocol}${REDACTED}:${REDACTED}@`;
    });
  }
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = isSensitiveKey(key) ? REDACTED : redactText(value);
  }
  return redacted;
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, seen));
  }

  const source = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    redacted[key] = isSensitiveKey(key) ? REDACTED : redactUnknown(item, seen);
  }
  return redacted;
}

function redactText(value: string): string {
  let redacted = redactUrlText(value);
  return redactNonUrlText(redacted);
}

function redactNonUrlText(value: string): string {
  let redacted = value.replace(AUTH_SCHEME_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`);
  redacted = redacted.replace(PROVIDER_SECRET_HEADER_PATTERN, (_match, key: string) => `${key} ${REDACTED}`);
  redacted = redacted.replace(ENV_ASSIGNMENT_PATTERN, (_match, prefix: string, assignment: string) => {
    return `${prefix}${assignment}${REDACTED}`;
  });
  redacted = redacted.replace(INLINE_SECRET_ASSIGNMENT_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`);
  redacted = redacted.replace(COOKIE_PAIR_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`);
  redacted = redacted.replace(OPENAI_STYLE_SECRET_PATTERN, REDACTED);
  redacted = redacted.replace(GITHUB_TOKEN_PATTERN, REDACTED);
  redacted = redacted.replace(JWT_PATTERN, REDACTED);
  return redacted.replace(QUERY_SECRET_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`);
}

function redactUrlText(value: string): string {
  if (!value.includes('://')) {
    return value;
  }

  const candidate = value.trim();
  if (!/\s/.test(candidate)) {
    return redactConnectionUrl(candidate);
  }

  let redacted = value.replace(URL_CREDENTIAL_PATTERN, (_match, protocol: string) => {
    return `${protocol}${REDACTED}:${REDACTED}@`;
  });
  redacted = redacted.replace(AUTH_SCHEME_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`);
  redacted = redacted.replace(PROVIDER_SECRET_HEADER_PATTERN, (_match, key: string) => `${key} ${REDACTED}`);
  redacted = redacted.replace(ENV_ASSIGNMENT_PATTERN, (_match, prefix: string, assignment: string) => {
    return `${prefix}${assignment}${REDACTED}`;
  });
  return redacted.replace(QUERY_SECRET_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/_/g, '-');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}
