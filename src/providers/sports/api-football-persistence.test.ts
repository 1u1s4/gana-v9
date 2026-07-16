import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { disconnectDb } from '../../storage/db.js';
import { createApiFootballPersistence } from './api-football.js';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(async () => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  await disconnectDb();
});

describe('api-football persistence', () => {
  it('throws an explicit initialization error when DATABASE_URL is configured but storage is unavailable', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:1/gana?schema=gana_ops';

    await assert.rejects(
      createApiFootballPersistence({
        databaseUrl: process.env.DATABASE_URL,
        apiFootballBaseUrl: 'https://v3.football.api-sports.io',
      }),
      /API-Football persistence initialization failed:/,
    );
  });
});
