import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
export async function startSportsCache(root, upstreamOrigin, apiKey) {
  const dir = join(root, 'sports-cache'); mkdirSync(dir, { recursive: true });
  const pending = new Map(); const token = randomUUID();
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/capture' || req.headers.authorization !== `Bearer ${token}`) throw new Error('Invalid study cache request');
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 16384) throw new Error('Request too large'); }
      const input = JSON.parse(raw); const url = new URL(input.url);
      if (url.origin !== upstreamOrigin || url.username || url.password) throw new Error('Unexpected sports origin');
      url.searchParams.sort(); const key = createHash('sha256').update(url.href).digest('hex');
      const file = join(dir, `${key}.json`); let hit = existsSync(file) || pending.has(key);
      if (!pending.has(key)) pending.set(key, (async () => {
        if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
        const response = await fetch(url, { headers: { 'x-apisports-key': apiKey }, signal: AbortSignal.timeout(15000) });
        const body = await response.text(); const parsed = JSON.parse(body);
        if (!response.ok || Object.keys(parsed.errors ?? {}).length) throw new Error(`Sports capture failed (${response.status}): ${JSON.stringify(parsed.errors ?? {})}`);
        const record = { url: url.href, capturedAt: new Date().toISOString(), status: response.status,
          headers: [...response.headers].filter(([name]) => ['content-type','x-ratelimit-requests-limit','x-ratelimit-requests-remaining','x-ratelimit-limit','x-ratelimit-remaining'].includes(name)),
          body, sha256: createHash('sha256').update(body).digest('hex') };
        writeFileSync(file, JSON.stringify(record)); return record;
      })().catch(error => { pending.delete(key); throw error; }));
      const record = await pending.get(key);
      appendFileSync(join(root, 'sports-access.jsonl'), JSON.stringify({ cell: input.cell, url: url.href, sha256: record.sha256, hit, observedAt: new Date().toISOString() })+'\n');
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(record));
    } catch (error) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/capture`, token, close: () => new Promise(resolve => server.close(resolve)) };
}
