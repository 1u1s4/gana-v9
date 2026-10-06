import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenCost, rolloutUsage } from '../studies/token-cost.mjs';
import { startSportsCache } from '../studies/api-cache.mjs';

test('token cost separates cache and never adds reasoning twice', () => {
  assert.equal(tokenCost('gpt-6.1-sol', { input_tokens: 1000000, cached_input_tokens: 500000, output_tokens: 100000, reasoning_output_tokens: 80000 }), 2.05);
  assert.equal(tokenCost('gpt-6.1-sol', { input_tokens: 1000000, cached_input_tokens: 500000, output_tokens: 100000 }, true), 3.6);
  assert.equal(tokenCost('gpt-6-luna', null), null);
  assert.throws(() => tokenCost('gpt-6-luna', { input_tokens: 5, cached_input_tokens: 6 }));
});
test('rollout accounting ignores repeated counters and preserves interrupted usage', () => {
  const event = (input, output) => ({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, output_tokens: output }, last_token_usage: { input_tokens: 100 } } } });
  const result = rolloutUsage([event(100, 10), event(100, 10), event(200, 30)]);
  assert.equal(result.requests.length, 2); assert.equal(result.usage.input_tokens, 200);
  assert.equal(result.requests.reduce((sum, r) => sum + r.usage.output_tokens, 0), 30);
});
test('resumed session charges only increments inside the metered call', () => {
  const event = (timestamp,input,output) => ({timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:output},last_token_usage:{input_tokens:100}}}});
  const result=rolloutUsage([event('2026-10-06T12:00:00Z',100,10),event('2026-10-06T12:02:00Z',200,30),event('2026-10-06T12:04:00Z',300,50)],{startedAt:'2026-10-06T12:01:00Z',completedAt:'2026-10-06T12:03:00Z'});
  assert.equal(result.usage.input_tokens,100);assert.equal(result.usage.output_tokens,20);assert.equal(result.requests.length,1);
});
test('sports capture shares exact responses, blocks foreign origins and retries failures', async () => {
  let requests = 0;
  const upstream = createServer((req, res) => { requests++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ errors: req.url.startsWith('/fail') && requests === 2 ? { quota: 'temporary' } : {}, response: [{ revision: requests }] })); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const root = await mkdtemp(join(tmpdir(), 'gana-study-test-'));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const cache = await startSportsCache(root, origin, 'test-only');
  const get = url => fetch(cache.url, { method: 'POST', headers: { authorization: `Bearer ${cache.token}` }, body: JSON.stringify({ url, cell: 'test' }) });
  try {
    const [a,b] = await Promise.all([get(`${origin}/odds?b=2&a=1`),get(`${origin}/odds?a=1&b=2`)]);
    assert.deepEqual(await a.json(), await b.json()); assert.equal(requests, 1);
    assert.equal((await get('https://unexpected.invalid/')).status, 502); assert.equal(requests, 1);
    assert.equal((await get(`${origin}/fail`)).status, 502);
    assert.equal((await get(`${origin}/fail`)).status, 200); assert.equal(requests, 3);
  } finally { await cache.close(); await new Promise(resolve => upstream.close(resolve)); await rm(root, { recursive: true }); }
});
