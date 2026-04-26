import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildApiFootballProviderSnapshot,
  createStableHash,
  parseApiFootballQuotaHeaders,
  redactApiFootballHeaders,
  stableJsonStringify,
} from './api-football-snapshots.js';

describe('api-football snapshots', () => {
  it('creates stable hashes independent of object key order', () => {
    assert.equal(stableJsonStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
    assert.equal(createStableHash({ b: 2, a: 1 }), createStableHash({ a: 1, b: 2 }));
  });

  it('redacts API-Football and auth headers case-insensitively', () => {
    assert.deepEqual(
      redactApiFootballHeaders({
        'X-APISports-Key': 'secret-key',
        Authorization: 'Bearer secret-token',
        Accept: 'application/json',
      }),
      {
        'x-apisports-key': '[REDACTED]',
        authorization: '[REDACTED]',
        accept: 'application/json',
      },
    );
  });

  it('parses API-Football quota headers without inventing missing values', () => {
    const quota = parseApiFootballQuotaHeaders(
      {
        'x-ratelimit-requests-limit': '100',
        'x-ratelimit-requests-remaining': '42',
        'x-ratelimit-remaining': '8',
        'x-request-id': 'req-1',
      },
      new Date('2026-04-25T12:00:00.000Z'),
    );

    assert.deepEqual(quota, {
      status: 'known',
      lastCheckedAt: '2026-04-25T12:00:00.000Z',
      daily: {
        limit: 100,
        remaining: 42,
      },
      minute: {
        remaining: 8,
      },
      retryAfterSeconds: undefined,
      providerRequestId: 'req-1',
    });
  });

  it('returns unknown quota when no parseable quota headers are present', () => {
    assert.deepEqual(
      parseApiFootballQuotaHeaders(
        {
          'x-ratelimit-requests-remaining': 'not-a-number',
          'content-type': 'application/json',
        },
        new Date('2026-04-25T12:00:00.000Z'),
      ),
      {
        status: 'unknown',
        lastCheckedAt: '2026-04-25T12:00:00.000Z',
        providerRequestId: undefined,
      },
    );
  });

  it('builds provider snapshots with redacted metadata and optional raw payload', () => {
    const snapshot = buildApiFootballProviderSnapshot({
      endpointName: 'fixtures',
      method: 'GET',
      url: 'https://v3.football.api-sports.io/fixtures',
      query: { date: '2026-04-25' },
      requestHeaders: { 'x-apisports-key': 'secret-key' },
      responseStatus: 200,
      responseHeaders: { 'x-ratelimit-requests-remaining': '41' },
      responsePayload: { response: [{ fixture: { id: 1 } }] },
      capturedAt: new Date('2026-04-25T12:00:00.000Z'),
      includeRawPayload: true,
      correlationId: 'corr-1',
    });

    assert.equal(snapshot.providerId, 'api-football');
    assert.equal(snapshot.endpointName, 'fixtures');
    assert.equal(snapshot.correlationId, 'corr-1');
    assert.equal(snapshot.requestHash.length, 64);
    assert.equal(snapshot.responseHash?.length, 64);
    assert.equal(snapshot.payloadHash?.length, 64);
    assert.deepEqual(snapshot.rawPayload, { response: [{ fixture: { id: 1 } }] });
    assert.deepEqual(snapshot.requestMetadata, {
      method: 'GET',
      url: 'https://v3.football.api-sports.io/fixtures',
      query: { date: '2026-04-25' },
      headers: { 'x-apisports-key': '[REDACTED]' },
      responseStatus: 200,
      responseHeaders: { 'x-ratelimit-requests-remaining': '41' },
    });
    assert.deepEqual(snapshot.quotaMetadata, {
      status: 'known',
      lastCheckedAt: '2026-04-25T12:00:00.000Z',
      daily: { remaining: 41 },
    });
  });
});
