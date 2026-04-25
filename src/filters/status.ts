import type { AgentConfig, ApiFootballFilterConfig } from '../config.js';

export type ServiceStatusState =
  | 'missing'
  | 'configured-not-checked'
  | 'ready-not-implemented'
  | 'connected'
  | 'disconnected'
  | 'degraded';

export type StatusConfigValue = string | number | boolean | null;

export interface ServiceStatusReport {
  service: string;
  status: ServiceStatusState;
  message: string;
  missing: string[];
  configured: string[];
  config: Record<string, StatusConfigValue>;
}

export interface FiltersStatus {
  service: 'filters';
  status: 'configured' | 'warning';
  summary: string;
  filters: ApiFootballFilterConfig;
  warnings: string[];
}

export function getFiltersStatus(config: Pick<AgentConfig, 'apiFootball'>): FiltersStatus {
  const warnings = config.apiFootball.defaultSeasonInferred
    ? ['GANA_DEFAULT_SEASON is not set; using the current calendar year as the default season.']
    : [];

  return {
    service: 'filters',
    status: warnings.length ? 'warning' : 'configured',
    summary: warnings.length
      ? 'Filter defaults are usable with warnings.'
      : 'Filter defaults are configured.',
    filters: config.apiFootball,
    warnings,
  };
}

export interface StatusRequirement {
  key: string;
  value: unknown;
}

export interface BuildStatusReportOptions {
  service: string;
  requirements: StatusRequirement[];
  config?: Record<string, unknown>;
  readyWhenConfigured?: boolean;
  missingMessage?: string;
  configuredMessage?: string;
  readyMessage?: string;
}

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|credential|key|password|private|secret|token)/i;

export function isMissingStatusValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

export function redactStatusValue(key: string, value: unknown): StatusConfigValue {
  if (isMissingStatusValue(value)) return null;
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]';
  if (typeof value === 'string') return redactUrlCredentials(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return '[configured]';
}

export function redactStatusConfig(config: Record<string, unknown> = {}): Record<string, StatusConfigValue> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, redactStatusValue(key, value)]),
  );
}

export function buildStatusReport(options: BuildStatusReportOptions): ServiceStatusReport {
  const missing = options.requirements
    .filter((requirement) => isMissingStatusValue(requirement.value))
    .map((requirement) => requirement.key);
  const configured = options.requirements
    .filter((requirement) => !isMissingStatusValue(requirement.value))
    .map((requirement) => requirement.key);

  if (missing.length > 0) {
    return {
      service: options.service,
      status: 'missing',
      message: options.missingMessage ?? `Missing required configuration for ${options.service}.`,
      missing,
      configured,
      config: redactStatusConfig(options.config),
    };
  }

  const status: ServiceStatusState = options.readyWhenConfigured
    ? 'ready-not-implemented'
    : 'configured-not-checked';

  return {
    service: options.service,
    status,
    message: status === 'ready-not-implemented'
      ? options.readyMessage ?? `${options.service} is configured, but execution is not implemented yet.`
      : options.configuredMessage ?? `${options.service} is configured, but connectivity has not been checked.`,
    missing,
    configured,
    config: redactStatusConfig(options.config),
  };
}

export function pickFirstConfiguredValue(...values: unknown[]): unknown {
  return values.find((value) => !isMissingStatusValue(value));
}

function redactUrlCredentials(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = '[redacted]';
    if (url.password) url.password = '[redacted]';
    return url.toString();
  } catch {
    return value;
  }
}
