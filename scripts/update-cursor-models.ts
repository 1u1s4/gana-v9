import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

interface CursorModel {
  id: string;
  name: string;
  isDefault?: boolean;
  isCurrent?: boolean;
}

const OUTPUT_PATH = resolve(process.argv[2] ?? process.env.CURSOR_MODEL_LIST_PATH ?? 'config/cursor-models.json');

function parseModels(text: string): CursorModel[] {
  const models: CursorModel[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'Available models' || trimmed.startsWith('Tip:')) continue;

    const match = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
    if (!match) continue;

    const id = match[1].trim();
    let name = match[2].trim();
    const annotations = [...name.matchAll(/\(([^)]+)\)/g)]
      .flatMap((match) => match[1].split(',').map((part) => part.trim().toLowerCase()));
    const isDefault = annotations.includes('default');
    const isCurrent = annotations.includes('current');
    name = name.replace(/\s+\([^)]+\)/g, '').trim();

    models.push({ id, name, ...(isDefault && { isDefault }), ...(isCurrent && { isCurrent }) });
  }

  return models;
}

function main() {
  const output = execFileSync('cursor-agent', ['--list-models'], { encoding: 'utf8' });
  const models = parseModels(output);

  if (models.length === 0) {
    throw new Error('cursor-agent --list-models returned no parseable models.');
  }

  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ updatedAt: new Date().toISOString(), models }, null, 2)}\n`);
  console.log(`Updated ${OUTPUT_PATH} with ${models.length} Cursor models.`);
}

main();
