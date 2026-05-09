import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../config.js';
import { addLeaguePreset, listLeaguePresets, removeLeaguePreset } from './presets.js';

function configWithPresetFile(initial?: unknown) {
  const root = mkdtempSync(join(tmpdir(), 'gana-league-presets-test-'));
  const path = join(root, 'league-presets.json');
  if (initial !== undefined) {
    writeFileSync(path, `${JSON.stringify(initial, null, 2)}\n`);
  }
  const config = loadConfig({
    apiFootball: {
      defaultSeason: 2026,
      leaguePresetsPath: path,
    },
  }, { skipApiKey: true });
  return { config, path };
}

describe('league preset file', () => {
  it('keeps default coverage for requested tier-one and LATAM leagues with provider seasons', async () => {
    const config = loadConfig({
      apiFootball: {
        defaultSeason: 2026,
        leaguePresetsPath: resolve(process.cwd(), 'config/league-presets.json'),
      },
    }, { skipApiKey: true });

    const byLeagueId = new Map((await listLeaguePresets(config)).map((preset) => [preset.providerCompetitionId, preset]));

    assert.deepEqual(
      ['39', '135', '140', '78', '128', '339', '262'].map((leagueId) => {
        const preset = byLeagueId.get(leagueId);
        return preset && {
          id: preset.providerCompetitionId,
          name: preset.name,
          country: preset.country,
          season: preset.season,
        };
      }),
      [
        { id: '39', name: 'Premier League', country: 'England', season: 2025 },
        { id: '135', name: 'Serie A', country: 'Italy', season: 2025 },
        { id: '140', name: 'La Liga', country: 'Spain', season: 2025 },
        { id: '78', name: 'Bundesliga', country: 'Germany', season: 2025 },
        { id: '128', name: 'Liga Profesional Argentina', country: 'Argentina', season: 2026 },
        { id: '339', name: 'Liga Nacional', country: 'Guatemala', season: 2025 },
        { id: '262', name: 'Liga MX', country: 'Mexico', season: 2025 },
      ],
    );
  });

  it('lists enabled leagues from the persisted JSON file ordered by priority', async () => {
    const { config } = configWithPresetFile({
      presetKey: 'default',
      leagues: [
        { id: '253', name: 'Major League Soccer', country: 'USA', season: 2026, priority: 100, enabled: true },
        { id: '140', name: 'La Liga', country: 'Spain', season: 2026, priority: 20, enabled: true },
        { id: '999', name: 'Disabled League', enabled: false },
      ],
    });

    const presets = await listLeaguePresets(config);

    assert.deepEqual(presets.map((preset) => preset.providerCompetitionId), ['140', '253']);
    assert.deepEqual(presets.map((preset) => preset.priority), [20, 100]);
  });

  it('creates the persisted JSON file when adding the first league', async () => {
    const { config, path } = configWithPresetFile();

    const preset = await addLeaguePreset(config, {
      id: '339',
      name: 'Liga Nacional',
      country: 'Guatemala',
      priority: 110,
    });

    assert.equal(preset.providerCompetitionId, '339');
    assert.equal(preset.priority, 110);
    assert.equal(existsSync(path), true);

    const file = JSON.parse(readFileSync(path, 'utf-8'));
    assert.equal(file.presetKey, 'default');
    assert.deepEqual(file.leagues, [
      { id: '339', name: 'Liga Nacional', country: 'Guatemala', season: 2026, priority: 110, enabled: true },
    ]);
  });

  it('marks removed leagues disabled instead of deleting the file entry', async () => {
    const { config, path } = configWithPresetFile({
      presetKey: 'default',
      leagues: [
        { id: '39', name: 'Premier League', country: 'England', season: 2026, priority: 10, enabled: true },
      ],
    });

    const preset = await removeLeaguePreset(config, '39');

    assert.equal(preset.providerCompetitionId, '39');
    assert.equal(preset.enabled, false);
    assert.deepEqual(await listLeaguePresets(config), []);

    const file = JSON.parse(readFileSync(path, 'utf-8'));
    assert.equal(file.leagues[0].enabled, false);
  });
});
