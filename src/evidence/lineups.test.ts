import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifiedLineups,lineupFingerprint} from './lineups.js';
import {buildResearchProviderContext,apiFootballSources} from './provider-context.js';
const fixture:any={id:'f',providerFixtureId:'99',providerHomeTeamId:'1',providerAwayTeamId:'2',status:'scheduled',scheduledAt:'2026-10-06T20:00:00Z'};
const lineup:any={providerFixtureId:'99',capturedAt:'2026-10-06T19:00:00Z',providerSnapshotId:'snap',teams:['1','2'].map((teamId,i)=>({teamId,formation:'4-4-2',starting:Array.from({length:11},(_,j)=>({id:String(i*11+j+1),name:`Player ${j}`}))}))};
test('lineup evidence requires both exact teams and eleven distinct starters',()=>{
 assert.equal(verifiedLineups(lineup,fixture)?.status,'provider-starting-XI');
 for(const value of [{...lineup,providerFixtureId:'other'},{...lineup,teams:[lineup.teams[0]]},{...lineup,teams:[lineup.teams[0],lineup.teams[0]]},{...lineup,teams:[{...lineup.teams[0],starting:Array(11).fill(lineup.teams[0].starting[0])},lineup.teams[1]]}])assert.equal(verifiedLineups(value,fixture),undefined);
});
test('a newly confirmed or changed lineup changes the refresh trigger, timestamps alone do not',()=>{
 assert.notDeepEqual(lineupFingerprint(undefined,fixture),lineupFingerprint(lineup,fixture));
 assert.deepEqual(lineupFingerprint(lineup,fixture),lineupFingerprint({...lineup,capturedAt:'later'},fixture));
 const changed=structuredClone(lineup);changed.teams[0].starting[0].id='100';assert.notDeepEqual(lineupFingerprint(changed,fixture),lineupFingerprint(lineup,fixture));
});
test('pre-kickoff research exposes the provider lineup with source identity, but does not query a far-away match',async()=>{
 let calls=0;const provider={getFixture:async()=>fixture,getFixtureLineups:async()=>{calls++;return lineup}};
 const near=await buildResearchProviderContext(provider,fixture,undefined,['h2h'],new Date('2026-10-06T19:00:00Z'));
 assert.equal(near.lineups?.teams.length,2);assert.ok(apiFootballSources(fixture,lineup.capturedAt,near).some(s=>s.id===near.lineups?.sourceId&&s.snapshotId==='snap'));
 const far=await buildResearchProviderContext(provider,fixture,undefined,['h2h'],new Date('2026-10-05T19:00:00Z'));
 assert.equal(far.lineups,undefined);assert.equal(calls,1);
});

test('named starters without provider IDs remain explicitly unresolved rather than discarded or invented',()=>{
 const partial=structuredClone(lineup);partial.teams[1].starting[0].id='';
 const result=verifiedLineups(partial,fixture);assert.equal(result?.unresolvedPlayerIds,1);
 assert.match(result!.warnings[0],/identity is not fully resolved/);assert.equal(result!.teams[1].starting[0].id,'');
 const duplicate=structuredClone(partial);duplicate.teams[1].starting[1].id='';duplicate.teams[1].starting[1].name=duplicate.teams[1].starting[0].name;
 assert.equal(verifiedLineups(duplicate,fixture),undefined);
});
