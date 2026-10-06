// Standard API USD / 1M tokens, verified 2026-10-06. Codex billing is separate.
export const PRICES = {
  'gpt-6.1-sol': { input: 2, cached: 0.1, write: 2.5, output: 10 },
  'gpt-5.6-sol': { input: 4, cached: 0.4, write: 5, output: 20 },
  'gpt-6-astra': { input: 10, cached: 1, write: 12.5, output: 50 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 },
};
export const PRICE_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export function tokenCost(model, usage, longContext = false) {
  if (!usage) return null;
  const rates = PRICES[model]; if (!rates) throw new Error(`Unknown model: ${model}`);
  const input = usage.input_tokens ?? 0, cached = usage.cached_input_tokens ?? 0;
  const write = usage.cache_write_input_tokens ?? 0, output = usage.output_tokens ?? 0;
  if ([input, cached, write, output].some(n => !Number.isFinite(n) || n < 0) || cached + write > input) throw new Error('Invalid token accounting');
  // Reasoning is a subset of output; cache reads/writes are subsets of input.
  return ((input - cached - write) * rates.input * (longContext ? 2 : 1)
    + cached * rates.cached * (longContext ? 2 : 1)
    + write * rates.write * (longContext ? 2 : 1)
    + output * rates.output * (longContext ? 1.5 : 1)) / 1e6;
}
export function rolloutUsage(lines, window = {}) {
  let previous = null; const requests = []; const contexts = []; let webSearchCalls = 0;
  for (const line of lines) {
    let event; try { event = typeof line === 'string' ? JSON.parse(line) : line; } catch { continue; }
    const payload = event.payload;
    const time = Date.parse(event.timestamp);
    const included = (!window.startedAt || time >= Date.parse(window.startedAt)) && (!window.completedAt || time <= Date.parse(window.completedAt));
    if (included && event.type === 'turn_context') contexts.push({ model: payload.model, effort: payload.effort, cwd: payload.cwd });
    if (included && event.type === 'response_item' && payload?.type === 'web_search_call') webSearchCalls++;
    if (event.type !== 'event_msg' || payload?.type !== 'token_count' || !payload.info?.total_token_usage) continue;
    const total = payload.info.total_token_usage;
    // Codex repeats the previous token_count while reporting rate limits.
    if (previous && total.input_tokens === previous.input_tokens && total.output_tokens === previous.output_tokens) continue;
    const delta = Object.fromEntries(['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'].map(key => [key, (total[key] ?? 0) - (previous?.[key] ?? 0)]));
    if (Object.values(delta).some(n => n < 0)) throw new Error('Unexpected token counter reset; cannot silently double-count');
    if (included) requests.push({ usage: delta, longContext: (payload.info.last_token_usage?.input_tokens ?? delta.input_tokens) > 272000 }); previous = total;
  }
  const usage = requests.length ? Object.fromEntries(Object.keys(requests[0].usage).map(key=>[key,requests.reduce((n,r)=>n+r.usage[key],0)])) : null;
  return { usage, requests, contexts, webSearchCalls };
}
