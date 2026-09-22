import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../config.js';
import { refreshWeeklyLeagues, selectImportantActiveLeagues } from './league-discovery.js';

function league(id: number, name: string, country: string, start = '2026-08-01', end = '2027-05-30', odds = true) {
  return { league: { id, name, logo: `https://media.api-sports.io/football/leagues/${id}.png` }, country: { name: country }, seasons: [{ year: 2026, start, end, current: true, coverage: { odds } }] };
}
const payload = { response: [league(39, 'Premier League', 'England'), league(2, 'UEFA Champions League', 'World'), league(1, 'World Cup', 'World', '2026-06-11', '2026-07-19'), league(488, 'U19 Bundesliga', 'Germany'), league(339, 'Liga Nacional', 'Guatemala', undefined, undefined, false)] };

test('weekly discovery adds major active competitions, checks dates and retains no-odds coverage honestly', () => {
  const rows = selectImportantActiveLeagues(payload, '2026-09-22');
  assert.deepEqual(rows.map((row) => row.providerCompetitionId), ['39', '339', '2']);
  assert.equal(rows.find((row) => row.providerCompetitionId === '339')?.oddsAvailable, false);
  assert.equal(rows[0]?.season, 2026);
  assert.equal(selectImportantActiveLeagues({ response: [league(39, 'Premier League', 'England', '2026-10-10')] }, '2026-09-22').length, 0);
});

test('weekly discovery makes one bounded request, reuses cache, retries stale failures without extending expiry', async () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'gana-weekly-leagues-'));
  const config = { ...loadConfig(), artifactRoot, apiFootballKey: 'test-only', apiFootballBaseUrl: 'https://v3.football.api-sports.io' };
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /\/leagues\?current=true$/);
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify(payload));
  };
  try {
    const first = await refreshWeeklyLeagues(config, '2026-09-22', { now: new Date('2026-09-22T12:00:00Z'), fetchImpl });
    assert.equal(first.status, 'refreshed');
    const bytes = readFileSync(join(artifactRoot, 'weekly-leagues.json'), 'utf8');
    const cached = await refreshWeeklyLeagues(config, '2026-09-23', { now: new Date('2026-09-23T12:00:00Z'), fetchImpl });
    assert.equal(cached.status, 'cached'); assert.equal(calls, 1);
    await assert.rejects(refreshWeeklyLeagues(config, '2026-06-12', { now: new Date('2026-09-23T12:00:00Z'), fetchImpl }), /historical runs require/);
    assert.equal(calls, 1);
    const fail: typeof fetch = async () => { throw new Error('provider down'); };
    const stale = await refreshWeeklyLeagues(config, '2026-09-30', { now: new Date('2026-09-30T12:00:00Z'), fetchImpl: fail });
    assert.equal(stale.status, 'stale-cache');
    assert.equal(stale.expiresAt, first.expiresAt);
    assert.equal(readFileSync(join(artifactRoot, 'weekly-leagues.json'), 'utf8'), bytes);
    await assert.rejects(refreshWeeklyLeagues(config, '2026-10-08', { now: new Date('2026-10-08T12:00:00Z'), fetchImpl: fail }), /provider down/);
  } finally { rmSync(artifactRoot, { recursive: true, force: true }); }
});

test('weekly discovery refuses provider errors and empty output instead of replacing registry', async () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'gana-weekly-leagues-'));
  const config = { ...loadConfig(), artifactRoot, apiFootballKey: 'test-only', apiFootballBaseUrl: 'https://v3.football.api-sports.io' };
  try {
    await assert.rejects(refreshWeeklyLeagues(config, '2026-09-22', { fetchImpl: async () => new Response(JSON.stringify({ errors: { rateLimit: 'exceeded' }, response: [] })) }), /returned errors/);
    await assert.rejects(refreshWeeklyLeagues(config, '2026-09-22', { fetchImpl: async () => new Response(JSON.stringify({ response: [] })) }), /no eligible/);
  } finally { rmSync(artifactRoot, { recursive: true, force: true }); }
});
