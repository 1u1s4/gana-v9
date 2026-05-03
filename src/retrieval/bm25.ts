import type { RetrievalDocument } from './corpus.js';

export interface RetrievalHit {
  document: RetrievalDocument;
  score: number;
}

export function bm25Search(corpus: RetrievalDocument[], query: string, limit = 10): RetrievalHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const avgLength = corpus.reduce((sum, doc) => sum + tokenize(doc.text).length, 0) / Math.max(1, corpus.length);
  const docFreq = new Map<string, number>();
  const tokenized = corpus.map((doc) => {
    const tokens = tokenize(doc.text);
    for (const term of new Set(tokens)) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    return { doc, tokens };
  });
  const k1 = 1.2;
  const b = 0.75;
  return tokenized.map(({ doc, tokens }) => {
    const length = tokens.length || 1;
    const score = terms.reduce((sum, term) => {
      const tf = tokens.filter((token) => token === term).length;
      if (!tf) return sum;
      const idf = Math.log(1 + (corpus.length - (docFreq.get(term) ?? 0) + 0.5) / ((docFreq.get(term) ?? 0) + 0.5));
      return sum + idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * length / Math.max(1, avgLength))));
    }, 0);
    return { document: doc, score };
  }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9áéíóúñü]+/i).filter(Boolean);
}
