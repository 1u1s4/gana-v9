export type DomainId = string;
export type FixtureId = string;
export type TeamId = string;
export type CompetitionId = string;
export type ProviderSnapshotId = string;

export type SportsProvider = 'api-football';

// PostgreSQL's uuid type accepts UUID versions beyond v4. Keep this guard
// version-agnostic while requiring the canonical 8-4-4-4-12 representation
// used by the existing persisted ids.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function normalizeUuid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return isUuid(normalized) ? normalized : undefined;
}

export function uniqueUuids(values: Iterable<unknown>): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    const id = normalizeUuid(value);
    if (id) ids.add(id);
  }
  return [...ids];
}
