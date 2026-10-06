import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planPreMatchRefresh, runPreMatchRefresh } from '../lib/pre-match-refresh.mjs';
import { acquireGlobalLock, releaseGlobalLock } from '../lib/daily-ops-dispatch.mjs';
const policy={maxFixturesPerPass:4,maxAttemptsPerFixture:2};
const date='2026-10-07',now=()=>new Date('2026-10-07T18:00:00Z');
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'prematch-dispatch-'));
 const write=(path,value)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(value));};
 for(const id of ['source','experiment'])for(const name of ['fixtures.json','scoring-results.json'])write(join(root,'runs',id,name),{});
 const resolvePublished=({date:d})=>d===date?{ok:true,dailyBatchId:`daily-${date}-full`,dailyLock:{status:'published',updatedAt:now().toISOString()},artifact:{sourceRunIds:['source']}}:{ok:false};
 const inspectRefresh=async input=>({targets:[{providerFixtureId:'1',scheduledAt:'2026-10-07T19:00:00Z'}]});
 return {root,write,resolvePublished,inspectRefresh};
}
test('only published sources enroll; dry-run is side-effect free and a shared dispatcher lock blocks execution',async()=>{
 const f=fixture();try {
  const args={artifactRoot:f.root,policy,now,resolvePublished:f.resolvePublished,inspectRefresh:f.inspectRefresh,refresh:async()=>{throw Error('must not run');}};
  const preview=await runPreMatchRefresh({...args,dryRun:true});assert.equal(preview.targets.length,1);assert.equal(preview.targets[0].sourceRunId,'source');assert.equal(existsSync(join(f.root,'cron')),false);
  const lock=acquireGlobalLock(join(f.root,'cron/locks/daily-ops-dispatch.lock'));
  try { assert.equal((await runPreMatchRefresh(args)).status,'skipped'); } finally {releaseGlobalLock(lock);}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('scheduler publishes only gated recommendations and keeps no-op passes silent',async()=>{
 const f=fixture();let sends=0;try {
  const args={artifactRoot:f.root,policy,now,resolvePublished:f.resolvePublished,inspectRefresh:f.inspectRefresh,
   refresh:async()=>({revisionId:`daily-${date}-refresh-test`,artifactPath:'test',decisions:[{status:'evaluated'}],recommendations:1}),
   publish:async input=>{sends++;assert.equal(input.parentBatch,`daily-${date}-full`);return {status:'published',messageIds:['123']};}};
  const result=await runPreMatchRefresh(args);assert.equal(result.status,'completed');assert.equal(sends,1);
  const empty=await runPreMatchRefresh({...args,refresh:async()=>({decisions:[],recommendations:0})});assert.equal(empty.status,'skipped');assert.equal(sends,1);
  const blocked=await runPreMatchRefresh({...args,publish:async()=>({status:'publication-uncertain'})});assert.equal(blocked.status,'review-required');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('uncertain revisions and refresh attempts are never retried automatically',async()=>{
 const f=fixture();try {
  f.write(join(f.root,'refresh-ledger',`auto-${date}-1-trigger.json`),{status:'running'});
  const args={artifactRoot:f.root,policy,now:now(),resolvePublished:f.resolvePublished,inspectRefresh:f.inspectRefresh};
  assert.equal((await planPreMatchRefresh(args)).targets.length,0);
  rmSync(join(f.root,'refresh-ledger'),{recursive:true});
  f.write(join(f.root,'cron/revisions',`daily-${date}-revision.lock`),{date,parentBatchId:`daily-${date}-full`,dailyBatchId:`daily-${date}-revision`,status:'publication-uncertain'});
  const plan=await planPreMatchRefresh(args);assert.equal(plan.targets.length,0);assert.equal(plan.blocked[0].reason,'revision-requires-reconciliation');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('new reconciliation blockers surface once and unchanged blocked passes stay silent', async () => {
 const f=fixture();try {
  const guard=join(f.root,'refresh-ledger',`auto-${date}-1-trigger.json`);
  f.write(guard,{status:'failed'});
  const args={artifactRoot:f.root,policy,now,resolvePublished:f.resolvePublished,inspectRefresh:f.inspectRefresh,
   refresh:async()=>({decisions:[],recommendations:0})};
  const first=await runPreMatchRefresh(args);assert.equal(first.status,'review-required');assert.equal(first.newBlockers,true);
  const second=await runPreMatchRefresh(args);assert.equal(second.status,'skipped');assert.equal(second.newBlockers,false);
  rmSync(guard);await runPreMatchRefresh(args);
  f.write(guard,{status:'failed'});assert.equal((await runPreMatchRefresh(args)).newBlockers,true);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
