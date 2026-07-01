import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function rel(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function isAllowedNotionUrlFile(relativePath) {
  return (
    relativePath.startsWith('docs/notion-migration/exported/') ||
    relativePath === 'docs/notion-migration/manifest.json'
  );
}

function isHistoricalExport(relativePath) {
  return relativePath.startsWith('docs/notion-migration/exported/');
}

const docsFiles = walk(path.join(root, 'docs'))
  .filter((filePath) => ['.md', '.json'].includes(path.extname(filePath)))
  .map(rel);

const scanFiles = ['README.md', 'README.es.md', ...docsFiles]
  .filter((relativePath) => fs.existsSync(path.join(root, relativePath)));

for (const relativePath of scanFiles) {
  const contents = fs.readFileSync(path.join(root, relativePath), 'utf8');

  if (!isAllowedNotionUrlFile(relativePath) && /https:\/\/app\.notion\.com/i.test(contents)) {
    errors.push(`${relativePath}: direct Notion URL outside historical export/manifest`);
  }

  if (isHistoricalExport(relativePath)) continue;

  const prohibitedPhrases = [
    [/mientras\s+(termina|se completa)\s+la migraci[oó]n/i, 'migration still described as unfinished'],
    [/during the migration/i, 'migration still described as in progress'],
    [/until separately normalized/i, 'Notion/export path still presented as temporary operational source'],
    [/Notion page, or explicit pending state/i, 'Notion page still accepted as operational completion state'],
  ];

  for (const [pattern, message] of prohibitedPhrases) {
    if (pattern.test(contents)) {
      errors.push(`${relativePath}: ${message}`);
    }
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/notion-migration/manifest.json'), 'utf8'));
const pending = manifest.filter((item) => item.migrationStatus === 'pending_canonical_review');
if (pending.length > 0) {
  errors.push(`docs/notion-migration/manifest.json: ${pending.length} pending_canonical_review entries remain`);
}

if (errors.length > 0) {
  console.error('Notion operational-source check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Notion operational-source check passed: ${manifest.length} manifest entries, 0 pending operational Notion sources.`);
