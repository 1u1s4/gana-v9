import 'dotenv/config';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, existsSync, readdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { startSportsCache } from './api-cache.mjs';

// Experimental entry point: never calls the notification wrapper or production DB.
const repo = process.cwd();
const root = resolve(process.argv[2] ?? '.artifacts/gana-v9/model-study-2026-10-06');
const date = process.argv[3] ?? '2026-10-07';
const source = resolve('.artifacts/gana-v9');
const cells = [
  { id: 'sol61', model: 'gpt-6.1-sol', effort: 'high' },
  { id: 'sol56', model: 'gpt-5.6-sol', effort: 'xhigh' },
  { id: 'astra6', model: 'gpt-6-astra', effort: 'medium' },
  { id: 'luna6', model: 'gpt-6-luna', effort: 'xhigh' },
];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid study date');
if (existsSync(join(root, 'manifest.json'))) throw new Error('Study already started; preserve its accounting and use a new root');
mkdirSync(root, { recursive: true });
const realCodex = execFileSync('which', ['codex'], { encoding: 'utf8' }).trim();
const catalog = JSON.parse(execFileSync(realCodex, ['debug', 'models'], { encoding: 'utf8', maxBuffer: 8e6 }));
for (const cell of cells) {
  const model = catalog.models.find(m => m.slug === cell.model);
  if (!model?.supported_reasoning_levels.some(level => level.effort === cell.effort)) throw new Error(`Unavailable model/effort: ${cell.id}`);
}
writeFileSync(join(root, 'model-catalog.json'), JSON.stringify(catalog, null, 2));
// Freeze only the historical files read by published-feedback, plus provider caches.
const snapshot = join(root, 'input-snapshot'); mkdirSync(snapshot, { recursive: true });
const files = new Set();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const cutoff = date < today ? date : today;
const historyDates = new Set(Array.from({ length: 14 }, (_, index) => {
  const day = new Date(`${cutoff}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - index - 1); return day.toISOString().slice(0, 10);
}));
for (const name of readdirSync(join(source, 'cron/locks'))) {
  const match = /^(?:daily-e2e|validation)-(\d{4}-\d{2}-\d{2})\.lock$/.exec(name);
  if (!match || !historyDates.has(match[1])) continue;
  const path = join(source, 'cron/locks', name); files.add(path);
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  for (const path of [lock.artifacts?.recommendation, lock.artifacts?.metrics, lock.dailyBatchId && join(source, 'runs', lock.dailyBatchId, 'daily-parlay-recommendations.json')]) {
    if (typeof path === 'string' && path.startsWith(source + '/') && existsSync(path)) files.add(path);
  }
}
for (const path of files) { const to = join(snapshot, path.slice(source.length)); mkdirSync(dirname(to), { recursive: true }); copyFileSync(path, to); }
// Historical-corner caches carry providerSnapshotId foreign keys. Start empty
// in every cell so each local DB persists its own captured provider evidence.
for (const relative of ['weekly-leagues.json']) {
  if (existsSync(join(source, relative))) cpSync(join(source, relative), join(snapshot, relative), { recursive: true });
}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = { startedAt: new Date().toISOString(), date, gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  design: 'One E2E per model/effort; identical seeded local databases and first-capture sports responses; independent live model web research; no Discord delivery.',
  tokenCostBasis: 'API-equivalent standard token prices, not measured Codex subscription billing',
  cells, historicalInputs: [...files].map(path => ({ path: path.slice(source.length + 1), sha256: hash(path) })), normalizedSeedSha256: hash(join(root, 'normalized-seed.json')) };
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
const bin = join(root, 'bin'); mkdirSync(bin, { recursive: true });
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
writeFileSync(join(bin, 'codex'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(repo, 'scripts/studies/codex-meter.mjs'))} "$@"\n`, { mode: 0o755 });
for (const cell of cells) {
  cell.root = join(root, cell.id); cell.database = `gana_study_${createHash('sha256').update(root).digest('hex').slice(0,8)}_${cell.id}`; cell.batch = `daily-${date}-ms-${cell.id}`;
  mkdirSync(join(cell.root, 'workspace'), { recursive: true });
  execFileSync('git', ['init', '-q', join(cell.root, 'workspace')]);
  execFileSync('createdb', ['-h', '127.0.0.1', '-p', '55439', '-T', 'gana_study_seed', cell.database]);
  cpSync(snapshot, join(cell.root, 'artifacts'), { recursive: true });
  for (const path of files) {
    const copied = join(cell.root, 'artifacts', path.slice(source.length));
    writeFileSync(copied, readFileSync(copied, 'utf8').replaceAll(source, join(cell.root, 'artifacts')));
  }
}
const broker = await startSportsCache(root, new URL(process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io').origin, process.env.API_FOOTBALL_KEY);
async function run(cell) {
  const databaseUrl = `postgresql://${process.env.USER}@127.0.0.1:55439/${cell.database}?schema=public`;
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
    GANA_ARTIFACT_ROOT: join(cell.root, 'artifacts'), AGENT_PROVIDER: 'codex', AGENT_MODEL: cell.model,
    GANA_DAILY_CODEX_MODEL: cell.model, GANA_DAILY_REASONING_EFFORT: cell.effort, AGENT_REASONING_EFFORT: cell.effort,
    GANA_DAILY_FAST_MODE: 'false', AGENT_FAST_MODE: 'false', GANA_DAILY_CODEX_FALLBACK_MODELS: '', AGENT_CODEX_FALLBACK_MODELS: '',
    AGENT_CODEX_SANDBOX: 'read-only', GANA_MAX_PROVIDER_REQUESTS_PER_RUN: '10000', GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN: '10000',
    GANA_MAX_FIXTURES_PER_RUN: '10000', GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES: '10000', GANA_COVERAGE_DISCOVERY_MAX_FIXTURES: '12', GANA_LOW_ODDS_THRESHOLD: '1.10',
    GANA_STUDY_CACHE_URL: broker.url, GANA_STUDY_CACHE_TOKEN: broker.token, GANA_STUDY_SPORTS_ORIGIN: new URL(process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io').origin,
    GANA_STUDY_CELL: cell.id, GANA_STUDY_SPORTS_ACCESS: join(cell.root, 'sports-access.jsonl'), GANA_STUDY_USAGE_DIR: join(cell.root, 'usage'),
    GANA_STUDY_REAL_CODEX: realCodex, GANA_STUDY_WORKSPACE: join(cell.root, 'workspace'), PATH: `${bin}:${process.env.PATH}`,
    NODE_OPTIONS: `--import ${join(repo, 'scripts/studies/frozen-sports-preload.mjs')}` };
  delete env.GANA_RESEARCH_REUSE_RUN_ID;
  const args = ['--import', 'tsx', 'src/cli.ts', 'daily-e2e', '--date', date, '--daily-batch-id', cell.batch,
    '--providers', 'codex', '--provider-concurrency', '1', '--codex-model', cell.model, '--web', 'live', '--parlay-profile', 'portfolio-v2',
    '--required-leagues', 'auto', '--threshold', '1.10', '--max-fixtures', '10000'];
  cell.startedAt = new Date().toISOString(); cell.state = 'running'; persist();
  const fd = openSync(join(cell.root, 'e2e.log'), 'a');
  const child = spawn(process.execPath, args, { cwd: repo, env, stdio: ['ignore', fd, fd] }); closeSync(fd);
  cell.pid = child.pid; persist();
  const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  cell.exitCode = code; cell.completedAt = new Date().toISOString(); cell.state = code === 0 ? 'completed' : 'failed'; persist();
  console.log(JSON.stringify({ cell: cell.id, state: cell.state, exitCode: code }));
}
function persist() { writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2)); }
// Two E2Es at a time, preserving the harness's own per-stage concurrency.
try { await Promise.all([run(cells[0]), run(cells[1])]); await Promise.all([run(cells[2]), run(cells[3])]); }
finally { await broker.close(); manifest.completedAt = new Date().toISOString(); persist(); }
