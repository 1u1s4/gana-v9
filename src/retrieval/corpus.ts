export interface RetrievalDocument {
  id: string;
  text: string;
  sourceId?: string;
  type?: string;
  fixtureId?: string;
  teamId?: string;
  market?: string;
  availableAt?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export function buildCorpusFromEvidencePack(pack: any): RetrievalDocument[] {
  const sources = new Map((pack?.sources ?? []).map((source: any) => [source.id, source]));
  return [
    ...(pack?.claims ?? []).map((claim: any) => ({
      id: String(claim.id),
      text: String(claim.statement ?? claim.text ?? ''),
      sourceId: Array.isArray(claim.sourceIds) ? claim.sourceIds[0] : undefined,
      type: 'claim',
      fixtureId: claim.fixtureId,
      market: claim.market,
      availableAt: claim.availableAt,
      metadata: { claim },
    })),
    ...(pack?.evidenceItems ?? []).map((item: any) => {
      const source = sources.get(item.sourceId) as any;
      return {
        id: String(item.id),
        text: String(item.summary ?? item.text ?? ''),
        sourceId: item.sourceId,
        type: source?.type ?? 'evidence',
        fixtureId: item.fixtureId,
        market: item.market,
        availableAt: item.availableAt ?? source?.availableAt,
        metadata: { item, source },
      };
    }),
  ].filter((doc) => doc.id && doc.text);
}
