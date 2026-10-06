import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchCornerHistory } from './corner-history.js';
const fixture:any={providerFixtureId:'99',scheduledAt:'2026-10-07T18:00:00Z'};
const now=new Date('2026-10-06T18:00:00Z');
const match=(id:string,status='FT',at='2026-10-01T18:00:00Z')=>({providerFixtureId:id,providerStatus:status,scheduledAt:at,venue:'home',leagueId:71,season:2026,contextFlags:[]});
test('corners fetches only completed prior regulation fixtures once and keeps missing values unknown',async()=>{
 const calls:string[]=[];
 const histories:any=[{teamId:'1',recentMatches:[match('1'),match('2'),match('3','AET'),match('99'),match('4','FT','2026-10-08T18:00:00Z')]},
 {teamId:'2',recentMatches:[{...match('1'),venue:'away'}]}];
 const result=await fetchCornerHistory({getFixtureStatistics:async({providerFixtureId:id})=>{calls.push(id);return {providerFixtureId:id,capturedAt:now.toISOString(),...(id==='1'?{cornersHome:0,cornersAway:7,totalCorners:7}:{})}}},fixture,histories,now);
 assert.deepEqual(calls,['1','2']);assert.equal(result.records.length,1);assert.equal(result.missing.length,1);
 assert.equal(result.teams[0].matches[0].cornersFor,0);assert.equal(result.teams[1].matches[0].cornersFor,7);
 assert.equal(result.teams[0].available,1);assert.equal(result.teams[0].requested,2);
});
test('historical corner cache retains source snapshot and does not refetch usable immutable match data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'gana-corners-'));let calls=0;
 const provider={getFixtureStatistics:async()=>{calls++;return {providerFixtureId:'1',capturedAt:now.toISOString(),providerSnapshotId:'snap',cornersHome:3,cornersAway:4,totalCorners:7}}};
 try{for(let i=0;i<2;i++){const r=await fetchCornerHistory(provider,fixture,[{teamId:'1',recentMatches:[match('1')]}] as any,now,dir);assert.equal(r.records[0].providerSnapshotId,'snap')}assert.equal(calls,1)}finally{rmSync(dir,{recursive:true,force:true})}
});
test('wrong fixture identity or inconsistent totals never become corner evidence',async()=>{
 const r=await fetchCornerHistory({getFixtureStatistics:async()=>({providerFixtureId:'wrong',capturedAt:now.toISOString(),cornersHome:3,cornersAway:4,totalCorners:6})},fixture,[{teamId:'1',recentMatches:[match('1')]}] as any,now);
 assert.equal(r.records.length,0);assert.equal(r.missing.length,1);
});
test('historical request budget is shared, bounded and balanced between teams without treating missing data as zero',async()=>{
 const ids:string[]=[];const budget={remaining:2,perFixture:2};
 const provider={getFixtureStatistics:async({providerFixtureId:id}:any)=>{ids.push(id);return {providerFixtureId:id,capturedAt:now.toISOString(),cornersHome:3,cornersAway:4,totalCorners:7}}};
 const histories:any=[{teamId:'1',recentMatches:[match('1'),match('3')]},{teamId:'2',recentMatches:[match('2'),match('4')]}];
 const r=await fetchCornerHistory(provider,fixture,histories,now,undefined,budget);
 assert.deepEqual(ids,['1','2']);assert.equal(budget.remaining,0);assert.equal(r.missing.length,2);assert.equal(r.teams[0].available,1);assert.equal(r.teams[1].available,1);
 const again=await fetchCornerHistory(provider,fixture,histories,now,undefined,budget);assert.equal(ids.length,2);assert.equal(again.records.length,0);
});
