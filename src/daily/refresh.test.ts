import assert from 'node:assert/strict';
import {test} from 'node:test';
import {refreshReason} from './refresh.js';
const base={scheduledAt:'2026-10-06T20:00:00Z',status:'scheduled',previousGeneratedAt:'2026-10-05T20:00:00Z',now:new Date('2026-10-06T19:00:00Z')};
test('refresh only crosses the pre-kickoff window once and never selects started fixtures',()=>{
 assert.equal(refreshReason(base),'pre-kickoff-evidence-window');
 assert.equal(refreshReason({...base,previousGeneratedAt:'2026-10-06T18:30:00Z'}),null);
 assert.equal(refreshReason({...base,now:new Date('2026-10-06T16:00:00Z')}),null);
 assert.equal(refreshReason({...base,now:new Date('2026-10-06T20:00:00Z'),error:'timeout'}),null);
 assert.equal(refreshReason({...base,status:'finished',error:'timeout'}),null);
});
test('refresh recovers operational failures without treating analytical abstentions or policy rejection as transient',()=>{
 const early={...base,now:new Date('2026-10-06T12:00:00Z')};
 assert.equal(refreshReason({...early,error:'score timed out after 420000ms'}),'recoverable-stage');
 assert.equal(refreshReason({...early,error:'Odds snapshot has no persisted quotes'}),'recoverable-stage');
 assert.equal(refreshReason({...early,error:'missing evidence; model probability null'}),null);
 assert.equal(refreshReason({...early,error:'Monetary automation is blocked'}),null);
});

import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSelectiveRefresh} from './refresh.js';
test('refresh isolates a revision and avoids a second model call for an unchanged recovery trigger',async()=>{
 const root=mkdtempSync(join(tmpdir(),'refresh-'));
 const source=join(root,'runs','source');mkdirSync(source,{recursive:true});
 const fixture:any={id:'fixture',providerFixtureId:'1',scheduledAt:'2026-10-07T20:00:00Z',status:'scheduled',homeTeamName:'A',awayTeamName:'B'};
 const previous={results:[{providerFixtureId:'1',error:'timeout',predictions:[]}]};
 writeFileSync(join(source,'fixtures.json'),JSON.stringify({fixtures:[fixture]}));writeFileSync(join(source,'scoring-results.json'),JSON.stringify(previous));
 const config:any={artifactRoot:root,apiFootball:{timezone:'America/Guatemala'}};
 let researchCalls=0;
 const deps:any={now:()=>new Date('2026-10-06T18:00:00Z'),provider:{getFixture:async()=>fixture},
 odds:async()=>({quotes:[{market:'h2h',selection:'home',price:2,bookmaker:'book'}]}),
 research:async()=>{researchCalls++;return {bundle:{id:'b',claims:[],sources:[],evidenceItems:[]}}},
 score:async()=>({predictions:[{id:'review',status:'review-required',promotable:false,expectedValue:.1}],runId:'test'})};
 try{
 const first:any=await runSelectiveRefresh(config,{sourceRunId:'source',date:'2026-10-07'},{} as any,deps);
 assert.equal(first.status,'complete');assert.equal(first.recommendations,0);
 const second:any=await runSelectiveRefresh(config,{sourceRunId:'source',date:'2026-10-07'},{} as any,deps);
 assert.equal(researchCalls,1);assert.equal(second.decisions[0].reason,'same-evidence-trigger-already-attempted');
 assert.deepEqual(JSON.parse(readFileSync(join(source,'scoring-results.json'),'utf8')),previous);
 }finally{rmSync(root,{recursive:true,force:true})}
});

import { automaticRefreshReason } from './refresh.js';
import { PRE_MATCH_REVIEW_POLICY } from './pre-match-policy.js';

test('automatic refresh requires a real upcoming window and preserves a publication lead margin', () => {
  assert.equal(automaticRefreshReason(base, new Date('2026-10-06T18:00:00Z')), 'pre-kickoff-evidence-window');
  assert.equal(automaticRefreshReason(base, new Date('2026-10-06T17:59:59Z')), null);
  assert.equal(automaticRefreshReason(base, new Date('2026-10-06T19:40:00Z')), null);
  assert.equal(automaticRefreshReason({...base,status:'finished'}, base.now), null);
});

test('automatic reviews pin Astra medium, ignore price-only changes, refresh new lineups and bound attempts', async () => {
  const root=mkdtempSync(join(tmpdir(),'refresh-auto-'));
  const source=join(root,'runs','source');mkdirSync(source,{recursive:true});
  const fixture:any={id:'fixture',providerFixtureId:'1',scheduledAt:'2026-10-07T20:00:00Z',status:'scheduled',homeTeamName:'A',awayTeamName:'B',providerHomeTeamId:'10',providerAwayTeamId:'20'};
  writeFileSync(join(source,'fixtures.json'),JSON.stringify({fixtures:[fixture]}));
  writeFileSync(join(source,'scoring-results.json'),JSON.stringify({results:[{providerFixtureId:'1',predictions:[{generatedAt:'2026-10-07T18:30:00Z'}]}]}));
  const config:any={artifactRoot:root,apiFootball:{timezone:'America/Guatemala'},provider:'openrouter',model:'wrong',reasoningEffort:'xhigh',fastMode:true,codexFallbackModels:['wrong'],codexThreadId:'old',nativeWebSearch:false,nativeWebSearchMode:'disabled'};
  let calls=0,price=2,lineups:any=undefined;
  const deps:any={now:()=>new Date('2026-10-07T19:00:00Z'),provider:{getFixture:async()=>fixture,getFixtureLineups:async()=>lineups},
    odds:async()=>({quotes:[{market:'h2h',selection:'home',price,bookmaker:'book'}]}),
    research:async(c:any,_i:any,r:any)=>{calls++;assert.equal(c.model,'gpt-6-astra');assert.equal(c.reasoningEffort,'medium');assert.equal(c.fastMode,false);assert.deepEqual(c.codexFallbackModels,[]);assert.equal(c.codexThreadId,undefined);assert.equal(r.model,'gpt-6-astra');assert.equal(c.nativeWebSearch,true);assert.equal(c.nativeWebSearchMode,'live');return {bundle:{id:'b',claims:[],sources:[],evidenceItems:[]}};},
    score:async(c:any)=>{assert.equal(c.provider,'codex');return {predictions:[],runId:'test'};}};
  const run=()=>runSelectiveRefresh(config,{sourceRunId:'source',date:'2026-10-07',automatic:true},{} as any,deps);
  try {
    const first:any=await run();assert.equal(calls,1);
    const artifact=JSON.parse(readFileSync(first.artifactPath,'utf8'));assert.equal(artifact.preMatchReview.status,'evaluated');assert.equal(artifact.preMatchReview.model,PRE_MATCH_REVIEW_POLICY.model);
    price=2.1;await run();assert.equal(calls,1,'price movement alone must not launch another review');
    lineups={providerFixtureId:'1',teams:['10','20'].map((teamId,i)=>({teamId,starting:Array.from({length:11},(_,j)=>({id:String(100+i*20+j),name:`Player ${i}-${j}`}))}))};
    await run();assert.equal(calls,2,'confirmed lineups trigger a second Astra review');
    lineups.teams[0].starting[0]={id:'999',name:'Replacement'};
    await run();assert.equal(calls,2,'bounded automatic attempts');
    const other:any=await runSelectiveRefresh(config,{sourceRunId:'source',date:'2026-10-07',automatic:true,fixtureIds:['different']},{} as any,deps);
    assert.equal(other.status,'no-targets');
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('scoring errors remain failed and cannot silently retry as analytical abstentions', async () => {
  const root=mkdtempSync(join(tmpdir(),'refresh-error-'));
  const source=join(root,'runs','source');mkdirSync(source,{recursive:true});
  const fixture:any={id:'fixture',providerFixtureId:'1',scheduledAt:'2026-10-07T20:00:00Z',status:'scheduled'};
  writeFileSync(join(source,'fixtures.json'),JSON.stringify({fixtures:[fixture]}));
  writeFileSync(join(source,'scoring-results.json'),JSON.stringify({results:[{providerFixtureId:'1'}]}));
  const config:any={artifactRoot:root,apiFootball:{timezone:'America/Guatemala'}};
  let calls=0;
  const deps:any={now:()=>new Date('2026-10-07T19:00:00Z'),provider:{getFixture:async()=>fixture},
    odds:async()=>({quotes:[{market:'h2h',selection:'home',price:2}]}),
    research:async()=>{calls++;return {bundle:{id:'b',claims:[],sources:[],evidenceItems:[]}};},
    score:async()=>({predictions:[],error:'Monetary automation is blocked'})};
  try {
    const first:any=await runSelectiveRefresh(config,{sourceRunId:'source',date:'2026-10-07',automatic:true},{} as any,deps);
    assert.equal(first.status,'partial');assert.equal(first.decisions[0].status,'failed');
    assert.equal(JSON.parse(readFileSync(first.artifactPath,'utf8')).preMatchReview.status,'failed');
    const second:any=await runSelectiveRefresh(config,{sourceRunId:'source',date:'2026-10-07',automatic:true},{} as any,deps);
    assert.equal(second.decisions[0].reason,'previous-attempt-requires-reconciliation');assert.equal(calls,1);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('live kickoff rescheduled across the local date cannot enter the original cohort', async () => {
  const root=mkdtempSync(join(tmpdir(),'refresh-rescheduled-'));
  const source=join(root,'runs','source');mkdirSync(source,{recursive:true});
  const fixture:any={id:'fixture',providerFixtureId:'1',scheduledAt:'2026-10-08T05:30:00Z',status:'scheduled'};
  writeFileSync(join(source,'fixtures.json'),JSON.stringify({fixtures:[fixture]}));
  writeFileSync(join(source,'scoring-results.json'),JSON.stringify({results:[{providerFixtureId:'1'}]}));
  try {
    const result:any=await runSelectiveRefresh({artifactRoot:root,apiFootball:{timezone:'America/Guatemala'}} as any,
      {sourceRunId:'source',date:'2026-10-07',automatic:true},{} as any,{
        now:()=>new Date('2026-10-08T04:30:00Z'),
        provider:{getFixture:async()=>({...fixture,scheduledAt:'2026-10-08T06:00:00Z'})} as any,
        odds:async()=>{throw new Error('must stop before quotes or model calls');},
      });
    assert.equal(result.decisions[0].reason,'fixture-rescheduled-outside-date');assert.equal(result.recommendations,0);
  } finally {rmSync(root,{recursive:true,force:true});}
});
