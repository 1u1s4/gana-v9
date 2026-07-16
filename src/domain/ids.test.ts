import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isUuid, normalizeUuid, uniqueUuids } from './ids.js';

describe('persistable UUID ids', () => {
  it('accepts canonical UUIDs without restricting their version', () => {
    assert.equal(isUuid('550e8400-e29b-11d4-a716-446655440000'), true);
    assert.equal(isUuid('018f1f8e-7b5a-7abc-8def-0123456789ab'), true);
    assert.equal(isUuid('00000000-0000-0000-0000-000000000000'), true);
  });

  it('rejects artifact and HarnessRun-style human ids', () => {
    assert.equal(isUuid('daily-focus-2026-07-15-1'), false);
    assert.equal(isUuid('analytical-fallback-1'), false);
    assert.equal(isUuid('daily-2026-07-15-full'), false);
    assert.equal(isUuid('not-a-uuid'), false);
  });

  it('normalizes artifact input and returns only unique persistable ids', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    assert.equal(normalizeUuid(`  ${uuid}  `), uuid);
    assert.deepEqual(uniqueUuids([uuid, ` ${uuid} `, 'daily-focus-1', null]), [uuid]);
  });
});
