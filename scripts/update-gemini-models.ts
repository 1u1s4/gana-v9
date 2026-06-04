import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { execFileSync } from 'child_process';

interface GeminiModel {
  id: string;
  name: string;
  source?: string;
}

interface GeminiModelList {
  updatedAt: string;
  models: GeminiModel[];
}

const OUTPUT_PATH = resolve(process.argv[2] ?? process.env.GEMINI_MODEL_LIST_PATH ?? 'config/gemini-models.json');

const FALLBACK_MODELS: GeminiModel[] = [
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', source: 'fallback' },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', source: 'fallback' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', source: 'fallback' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', source: 'fallback' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', source: 'fallback' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', source: 'fallback' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', source: 'fallback' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', source: 'fallback' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', source: 'fallback' },
];

function titleCaseModel(id: string): string {
  return id
    .split('-')
    .map((part) => {
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function addModel(models: Map<string, GeminiModel>, id: string, source: string, name?: string): void {
  const clean = id.replace(/^models\//, '').trim().toLowerCase();
  if (!/^gemini-\d+(?:\.\d+)?-[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(clean)) return;
  if (/\.(js|ts|json|toml|yml|yaml|png|txt)$/i.test(clean)) return;
  if (clean.includes('embedding')) return;
  if (clean.includes('cli')) return;
  if (clean.includes('api-key')) return;
  if (!/(pro|flash|computer-use|live)/.test(clean)) return;

  const existing = models.get(clean);
  const sourceParts = new Set([...(existing?.source?.split(',') ?? []), source]);
  models.set(clean, {
    id: clean,
    name: name ?? existing?.name ?? titleCaseModel(clean),
    source: [...sourceParts].filter(Boolean).join(','),
  });
}

function findGeminiCliRoot(): string | undefined {
  const candidates: string[] = [];

  try {
    const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    candidates.push(join(npmRoot, '@google/gemini-cli'));
  } catch {
    // npm may not be available in minimal environments.
  }

  try {
    const bin = execFileSync('which', ['gemini'], { encoding: 'utf8' }).trim();
    const linked = execFileSync('readlink', [bin], { encoding: 'utf8' }).trim();
    candidates.push(resolve(dirname(bin), linked, '..', '..'));
  } catch {
    // The CLI may not be symlinked.
  }

  return candidates.find((candidate) => existsSync(candidate));
}

function collectFiles(dir: string, maxDepth = 2): string[] {
  if (maxDepth < 0 || !existsSync(dir)) return [];

  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'docs') continue;
      out.push(...collectFiles(path, maxDepth - 1));
    } else if (/\.(js|mjs|md|json)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function readModelsFromInstalledCli(models: Map<string, GeminiModel>): void {
  const root = findGeminiCliRoot();
  if (!root) return;

  const files = [
    join(root, 'README.md'),
    ...collectFiles(join(root, 'bundle'), 1),
  ].filter((path) => existsSync(path));

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const matches = content.match(/\bgemini-[a-z0-9.-]+(?:-[a-z0-9]+)*\b/gi) ?? [];
    for (const id of matches) addModel(models, id, 'gemini-cli');
  }
}

async function readModelsFromGeminiApi(models: Map<string, GeminiModel>): Promise<void> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) return;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) {
    throw new Error(`Gemini API model list failed: ${res.status} ${await res.text()}`);
  }

  const payload = await res.json() as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
  for (const model of payload.models ?? []) {
    if (model.supportedGenerationMethods && !model.supportedGenerationMethods.includes('generateContent')) continue;
    if (model.name) addModel(models, model.name, 'gemini-api', model.displayName);
  }
}

function sortModels(models: GeminiModel[]): GeminiModel[] {
  return models.sort((a, b) => {
    const score = (id: string) => {
      if (id.includes('3')) return 0;
      if (id.includes('2.5')) return 1;
      if (id.includes('2.0')) return 2;
      return 3;
    };
    return score(a.id) - score(b.id) || a.id.localeCompare(b.id);
  });
}

async function main() {
  const models = new Map<string, GeminiModel>();

  for (const model of FALLBACK_MODELS) addModel(models, model.id, model.source ?? 'fallback', model.name);
  readModelsFromInstalledCli(models);
  await readModelsFromGeminiApi(models);

  const output: GeminiModelList = {
    updatedAt: new Date().toISOString(),
    models: sortModels([...models.values()]),
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Updated ${OUTPUT_PATH} with ${output.models.length} Gemini models.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
