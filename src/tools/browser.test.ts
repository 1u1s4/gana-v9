import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { executeBrowserUseTask } from './browser.js';

function config() {
  return loadConfig({
    artifactRoot: mkdtempSync(join(tmpdir(), 'gana-browser-tool-')),
    browserUse: {
      apiKey: 'browser-use-test-key',
      baseUrl: 'https://api.browser-use.test',
      enabled: true,
      maxTasksPerMonth: 10,
      maxConcurrentSessions: 3,
      timeoutMs: 180_000,
    },
  }, { skipApiKey: true });
}

describe('Browser Use fallback tool', () => {
  it('creates and polls a Browser Use session with free-plan quota metadata', async () => {
    const cfg = config();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      { id: 'session-1', status: 'running' },
      { id: 'session-1', status: 'completed', output: 'latest team news' },
    ];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    };

    const result = await executeBrowserUseTask(cfg, {
      task: 'Find current team news for fixture 1001.',
      reason: 'native web search unavailable',
      idempotencyKey: 'browser-test-1',
    }, fetchImpl as typeof fetch);

    assert.equal(result.ok, true);
    assert.equal(result.status, 'completed');
    assert.equal(result.output, 'latest team news');
    assert.equal((result.quota as any).tasksUsed, 1);
    assert.equal((result.quota as any).maxTasksPerMonth, 10);
    assert.equal(requests[0]?.url, 'https://api.browser-use.test/api/v3/sessions');
    assert.equal(requests[1]?.url, 'https://api.browser-use.test/api/v3/sessions/session-1');
    assert.equal((requests[0]?.init?.headers as Record<string, string>)['X-Browser-Use-API-Key'], 'browser-use-test-key');
  });

  it('blocks before network use when the monthly task quota is exhausted', async () => {
    const cfg = loadConfig({
      artifactRoot: mkdtempSync(join(tmpdir(), 'gana-browser-tool-quota-')),
      browserUse: {
        apiKey: 'browser-use-test-key',
        baseUrl: 'https://api.browser-use.test',
        enabled: true,
        maxTasksPerMonth: 1,
        maxConcurrentSessions: 3,
        timeoutMs: 180_000,
      },
    }, { skipApiKey: true });
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: 'session-1', status: 'completed', output: 'ok' }), { status: 200 });
    };

    await executeBrowserUseTask(cfg, {
      task: 'First task.',
      reason: 'native web search unavailable',
      idempotencyKey: 'browser-test-quota-1',
    }, fetchImpl as typeof fetch);

    await assert.rejects(
      () => executeBrowserUseTask(cfg, {
        task: 'Second task.',
        reason: 'native web search unavailable',
        idempotencyKey: 'browser-test-quota-2',
      }, fetchImpl as typeof fetch),
      /monthly task limit reached/,
    );
    assert.equal(calls, 2);
  });
});
