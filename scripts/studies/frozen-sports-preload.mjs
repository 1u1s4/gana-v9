import { appendFileSync } from 'node:fs';
const original = globalThis.fetch;
if (!process.env.GANA_STUDY_CACHE_URL || !process.env.GANA_STUDY_SPORTS_ORIGIN) throw new Error('Study cache configuration missing');
const broker = new URL(process.env.GANA_STUDY_CACHE_URL);
if (broker.hostname !== '127.0.0.1' || broker.protocol !== 'http:') throw new Error('Study cache must be loopback');
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== process.env.GANA_STUDY_SPORTS_ORIGIN) return original(input, options);
  if ((options?.method ?? 'GET') !== 'GET') throw new Error('Study only captures sports reads');
  const response = await original(broker, { method: 'POST', headers: { authorization: `Bearer ${process.env.GANA_STUDY_CACHE_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ url: url.href, cell: process.env.GANA_STUDY_CELL }), signal: options?.signal });
  const record = await response.json();
  if (!response.ok) throw new Error(record.error ?? 'Study cache failure');
  // Original query, response body and first-capture timestamp remain auditable.
  if (process.env.GANA_STUDY_SPORTS_ACCESS) appendFileSync(process.env.GANA_STUDY_SPORTS_ACCESS, JSON.stringify({ url: record.url, sha256: record.sha256, capturedAt: record.capturedAt })+'\n');
  return new Response(record.body, { status: record.status, headers: record.headers });
};
