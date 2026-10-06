import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2); const arg = name => args[args.indexOf(name)+1];
const dir = process.env.GANA_STUDY_USAGE_DIR;
if (!dir || !process.env.GANA_STUDY_REAL_CODEX || !process.env.GANA_STUDY_WORKSPACE) throw new Error('Study meter requires explicit paths');
mkdirSync(dir, { recursive: true });
const path = join(dir, `${randomUUID()}.json`);
const record = { cell: process.env.GANA_STUDY_CELL, requestedModel: arg('-m'), startedAt: new Date().toISOString(), pid: process.pid, state: 'started', threadId: null, usage: null, nativeWebSearchEvents: 0, stage: args.includes('--output-schema') && arg('--output-schema').includes('research-fixture') ? 'research' : args.includes('--output-schema') && arg('--output-schema').includes('parlay-portfolio') ? 'portfolio' : 'scoring' };
let prompt = args.at(-1) === '-' ? '' : args.at(-1); let buffer = '';
const save = () => writeFileSync(path, JSON.stringify(record,null,2)); save();
const finalizePrompt = () => { if (/parlay-portfolio-v1|analytical soccer parlay portfolios|System prompt - Parlay (?:all-in|refinado)/i.test(prompt ?? '')) record.stage = 'portfolio'; record.promptSha256 = createHash('sha256').update(prompt ?? '').digest('hex'); record.providerFixtureId = /"providerFixtureId"\s*:\s*"(\d+)"/.exec(prompt ?? '')?.[1] ?? null; save(); };
const cwdIndex = args.indexOf('-C'); if (cwdIndex >= 0) args[cwdIndex+1] = process.env.GANA_STUDY_WORKSPACE;
const child = spawn(process.env.GANA_STUDY_REAL_CODEX, args, { stdio:['pipe','pipe','pipe'], env: { ...process.env, NODE_OPTIONS: '' } });
function event(line) { try { const value = JSON.parse(line); if (value.type === 'thread.started') record.threadId = value.thread_id;
  if (value.type === 'turn.completed' && value.usage) record.usage = value.usage;
  if (value.type === 'item.started' && value.item?.type === 'web_search') record.nativeWebSearchEvents++;
  if (['thread.started','turn.completed','turn.failed'].includes(value.type)) save();
} catch { /* Preserve provider stdout without treating non-JSON as usage. */ } }
child.stdout.on('data', chunk => { process.stdout.write(chunk); buffer += chunk.toString(); const lines=buffer.split('\n'); buffer=lines.pop(); for(const line of lines) event(line); });
child.stderr.pipe(process.stderr);
if (args.at(-1) === '-') { process.stdin.on('data', chunk => { prompt += chunk.toString(); }); process.stdin.on('end', finalizePrompt); process.stdin.pipe(child.stdin); } else { child.stdin.end(); finalizePrompt(); }
child.on('error', error => { record.state='spawn-error';record.error=error.message;save();process.exitCode=1; });
child.on('close', (code, signal) => { if(buffer.trim())event(buffer);record.state=code===0?'completed':'failed';record.exitCode=code;record.signal=signal;record.completedAt=new Date().toISOString();save();process.exitCode=code??1; });
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{record.state='interrupted';record.completedAt=new Date().toISOString();save();child.kill(signal);process.exit(143);});
