import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWithConcurrency } from './concurrency.js';

test('mapWithConcurrency caps active work and preserves input order', async () => {
  let active = 0;
  let maxActive = 0;

  const output = await mapWithConcurrency(
    Array.from({ length: 12 }, (_, index) => index),
    3,
    async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 8 : 2));
      active -= 1;
      return value * 2;
    },
  );

  assert.equal(maxActive, 3);
  assert.deepEqual(output, Array.from({ length: 12 }, (_, index) => index * 2));
});

test('mapWithConcurrency falls back to one worker for invalid limits', async () => {
  let active = 0;
  let maxActive = 0;

  await mapWithConcurrency([1, 2, 3], Number.NaN, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value;
  });

  assert.equal(maxActive, 1);
});