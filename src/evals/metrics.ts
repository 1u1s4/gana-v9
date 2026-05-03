import { hashPayload } from '../runtime/artifacts.js';

export interface CertificationCheck {
  name: string;
  ok: boolean;
  details?: unknown;
}

export function certificationHash(checks: CertificationCheck[]): string {
  return hashPayload(checks.map((check) => ({ name: check.name, ok: check.ok, details: check.details ?? null })));
}
