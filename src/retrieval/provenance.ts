export interface ClaimLike {
  id: string;
  sourceIds?: string[];
  evidenceIds?: string[];
}

export function claimsHaveProvenance(claims: ClaimLike[]): { ok: boolean; missing: string[] } {
  const missing = claims
    .filter((claim) => !(claim.sourceIds?.length || claim.evidenceIds?.length))
    .map((claim) => claim.id);
  return { ok: missing.length === 0, missing };
}
