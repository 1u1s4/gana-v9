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

type EvidencePackRecord = Record<string, unknown>;

export function buildCorpusFromEvidencePack(pack: unknown): RetrievalDocument[] {
  const root = asRecord(pack);
  const sources = new Map(
    asRecordArray(root?.sources)
      .map((source) => [stringValue(source.id), source] as const)
      .filter((entry): entry is [string, EvidencePackRecord] => Boolean(entry[0])),
  );

  return [
    ...asRecordArray(root?.claims).map((claim) => ({
      id: stringValue(claim.id) ?? '',
      text: stringValue(claim.statement) ?? stringValue(claim.text) ?? '',
      sourceId: firstString(claim.sourceIds),
      type: 'claim',
      fixtureId: stringValue(claim.fixtureId),
      market: stringValue(claim.market),
      availableAt: stringValue(claim.availableAt),
      metadata: { claim },
    })),
    ...asRecordArray(root?.evidenceItems).map((item) => {
      const sourceId = stringValue(item.sourceId);
      const source = sourceId ? sources.get(sourceId) : undefined;
      return {
        id: stringValue(item.id) ?? '',
        text: stringValue(item.summary) ?? stringValue(item.text) ?? '',
        sourceId,
        type: stringValue(source?.type) ?? 'evidence',
        fixtureId: stringValue(item.fixtureId),
        market: stringValue(item.market),
        availableAt: stringValue(item.availableAt) ?? stringValue(source?.availableAt),
        metadata: { item, source },
      };
    }),
  ].filter((doc) => doc.id && doc.text);
}

function asRecord(value: unknown): EvidencePackRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as EvidencePackRecord
    : undefined;
}

function asRecordArray(value: unknown): EvidencePackRecord[] {
  if (!Array.isArray(value)) return [];
  const records: EvidencePackRecord[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record) records.push(record);
  }
  return records;
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(stringValue).find(Boolean) : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  return text || undefined;
}
