import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface CodexModel {
  id: string;
  name: string;
  description?: string;
  defaultReasoning?: string;
  supportedReasoning?: string[];
  supportedInApi?: boolean;
  speedTiers?: string[];
}

const OUTPUT_PATH = resolve(process.argv[2] ?? process.env.CODEX_MODEL_LIST_PATH ?? 'config/codex-models.json');
const CODEX_HOME = process.env.CODEX_HOME ?? `${process.env.HOME}/.codex`;

function readCatalog(): any {
  try {
    return JSON.parse(execFileSync('codex', ['debug', 'models'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    const cachePath = resolve(CODEX_HOME, 'models_cache.json');
    if (!existsSync(cachePath)) throw new Error(`No Codex model catalog found. Expected ${cachePath}`);
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  }
}

function modelArray(catalog: any): any[] {
  if (Array.isArray(catalog)) return catalog;
  if (Array.isArray(catalog?.models)) return catalog.models;
  return [];
}

function normalizeModel(model: any): CodexModel | null {
  const id = String(model.slug ?? model.id ?? model.name ?? '');
  if (!id) return null;

  const supportedReasoning = Array.isArray(model.supported_reasoning_levels)
    ? model.supported_reasoning_levels.map((level: any) => String(level.effort ?? level)).filter(Boolean)
    : undefined;

  return {
    id,
    name: String(model.display_name ?? model.name ?? model.slug ?? id),
    ...(model.description && { description: String(model.description) }),
    ...(model.default_reasoning_level && { defaultReasoning: String(model.default_reasoning_level) }),
    ...(supportedReasoning?.length && { supportedReasoning }),
    ...(typeof model.supported_in_api === 'boolean' && { supportedInApi: model.supported_in_api }),
    ...(Array.isArray(model.additional_speed_tiers) && { speedTiers: model.additional_speed_tiers.map(String) }),
  };
}

function main() {
  const catalog = readCatalog();
  const models = modelArray(catalog)
    .map(normalizeModel)
    .filter((model): model is CodexModel => model !== null);

  if (models.length === 0) {
    throw new Error('Codex model catalog returned no parseable models.');
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: 'codex debug models',
    models,
  }, null, 2)}\n`);
  console.log(`Updated ${OUTPUT_PATH} with ${models.length} Codex models.`);
}

main();
