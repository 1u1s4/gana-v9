import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ApiFootballProviderError,
  createFixtureNotFoundError,
  createMappingError,
  isApiFootballProviderError,
} from './api-football-errors.js';

describe('api-football errors', () => {
  it('creates actionable typed errors', () => {
    const error = createFixtureNotFoundError({
      operation: 'get fixture odds',
      endpointName: 'odds',
      expected: 'fixture odds response',
      received: 'empty response array',
      fixtureId: '1234',
      providerRequestId: 'req-1',
    });

    assert.equal(error.code, 'fixture_not_found');
    assert.equal(error.provider, 'api-football');
    assert.equal(error.endpointName, 'odds');
    assert.equal(error.fixtureId, '1234');
    assert.equal(error.providerRequestId, 'req-1');
    assert.match(error.message, /fixture_not_found/);
    assert.match(error.nextAction, /fixture ID/);
    assert.equal(isApiFootballProviderError(error), true);
  });

  it('serializes context without losing the next action', () => {
    const error = createMappingError({
      operation: 'map odds market',
      endpointName: 'odds',
      market: 'Unknown Market',
      expected: 'canonical MarketKey',
      received: 'API-Football market name Unknown Market',
    });

    assert.deepEqual(error.toJSON(), {
      name: 'ApiFootballProviderError',
      provider: 'api-football',
      code: 'mapping_error',
      message:
        'API-Football mapping_error: map odds market failed (endpoint=odds market=Unknown Market). Expected canonical MarketKey; received API-Football market name Unknown Market.',
      operation: 'map odds market',
      endpointName: 'odds',
      expected: 'canonical MarketKey',
      received: 'API-Football market name Unknown Market',
      fixtureId: undefined,
      market: 'Unknown Market',
      providerRequestId: undefined,
      nextAction: 'Update the API-Football mapper only if the provider value has a safe canonical mapping.',
    });
  });

  it('keeps instanceof behavior for catch blocks', () => {
    const error = new ApiFootballProviderError({
      code: 'rate_limited',
      operation: 'status request',
      endpointName: 'status',
      expected: 'provider accepts request',
      received: 'HTTP 429',
    });

    assert.equal(error instanceof Error, true);
    assert.equal(error instanceof ApiFootballProviderError, true);
  });

  it('redacts provider error messages and serialized received payloads', () => {
    const error = new ApiFootballProviderError({
      code: 'provider_unavailable',
      operation: 'status request',
      endpointName: 'status',
      expected: 'provider accepts request',
      received: {
        headers: {
          authorization: 'Bearer secret-token',
          'x-apisports-key': 'secret-key',
        },
        databaseUrl: 'mysql://user:secret-pass@example.test/db',
      },
    });
    const body = JSON.stringify(error.toJSON());

    assert.match(error.message, /\[REDACTED\]/);
    assert.match(body, /\[REDACTED\]/);
    assert.doesNotMatch(body, /secret-token|secret-key|secret-pass/);
  });
});
