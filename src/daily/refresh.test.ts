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
