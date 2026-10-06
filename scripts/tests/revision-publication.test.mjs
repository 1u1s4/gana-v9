import {readRecommendationSourceSnapshot} from '../lib/daily-recommendation-source-snapshot.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scopeRevisionLedgerRows} from '../lib/daily-e2e-publication.mjs';
import {resolveCanonicalPublishedRecommendation,sha256Json} from '../lib/validation-runtime.mjs';
import {planRevisionValidations} from '../lib/revision-validation.mjs';
import {runValidationWorkflow} from '../lib/validation-workflow.mjs';
import {buildDiscordPayloads} from '../../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
const date='2026-10-07',parent=`daily-${date}-full`,batch=`daily-${date}-revision`;
test('explicit revisions preserve the parent but never bypass incomplete or uncertain publications',()=>{
 const rows=[{dailyBatchId:parent,status:'published',discordMessageId:'123'}];
 assert.deepEqual(scopeRevisionLedgerRows(rows,{date,dailyBatchId:batch,mode:'daily-e2e'}).rows,rows);
 assert.deepEqual(scopeRevisionLedgerRows(rows,{date,dailyBatchId:batch,mode:'daily-revision',parentBatchId:parent}).rows,[]);
 assert.equal(scopeRevisionLedgerRows(rows,{date,dailyBatchId:batch,mode:'daily-revision',parentBatchId:'missing'}).ok,false);
 assert.equal(scopeRevisionLedgerRows([...rows,{dailyBatchId:'another',status:'publication-uncertain'}],{date,dailyBatchId:batch,mode:'daily-revision',parentBatchId:parent}).ok,false);
 const own={dailyBatchId:batch,status:'reserved'};assert.deepEqual(scopeRevisionLedgerRows([...rows,own],{date,dailyBatchId:batch,mode:'daily-revision',parentBatchId:parent}).rows,[own]);
});
test('registered revisions validate their exact hash/cohort separately and dispatcher waits until next date',async()=>{
 const root=mkdtempSync(join(tmpdir(),'gana-revision-'));
 const artifact={date,dailyBatchId:batch,revisionOfDailyBatchId:parent,presentation:'concise-v1',recommendations:[]};
 const write=(path,value)=>{mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,JSON.stringify(value))};
 try{
 const path=join(root,'runs',batch,'daily-parlay-recommendations.json');write(path,artifact);
 write(join(root,'cron','revisions',`${batch}.lock`),{date,dailyBatchId:batch,parentBatchId:parent,status:'published',sourceManifestSha256:readRecommendationSourceSnapshot(path,{strict:true}).sourceManifestSha256,artifactSha256:sha256Json(artifact),messageIds:['123']});
 assert.equal(resolveCanonicalPublishedRecommendation({artifactRoot:root,date,revisionBatchId:batch}).ok,true);
 assert.equal(resolveCanonicalPublishedRecommendation({artifactRoot:root,date}).ok,false);
 assert.equal(planRevisionValidations({artifactRoot:root,previousDate:'2026-10-06',now:new Date('2026-10-07')}).length,0);
 assert.equal(planRevisionValidations({artifactRoot:root,previousDate:date,now:new Date('2026-10-08')}).length,1);
 const result=await runValidationWorkflow({repoRoot:process.cwd(),artifactRoot:root,date,revisionBatchId:batch,dryRun:true});
 assert.ok(result.lockPath.includes(batch));
 write(path,{...artifact,tampered:true});assert.equal(resolveCanonicalPublishedRecommendation({artifactRoot:root,date,revisionBatchId:batch}).ok,false);
 assert.equal(planRevisionValidations({artifactRoot:root,previousDate:date,now:new Date('2026-10-08')}).length,0);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('revision is visibly labeled by the canonical concise formatter',()=>{
 const p=buildDiscordPayloads({date,presentation:'concise-v1',revisionOfDailyBatchId:parent,recommendations:[]});
 assert.match(p[0].embeds[0].description,/Actualización con evidencia nueva/);
 assert.deepEqual(p[0].allowed_mentions,{parse:[]});
});

test('model documentary evidence participates in immutable source proof even when the recommendation file is unchanged',()=>{
 const root=mkdtempSync(join(tmpdir(),'gana-model-proof-'));try{
  const evidence=join(root,'daily-model-evidence.json'),path=join(root,'daily-parlay-recommendations.json');
  writeFileSync(evidence,JSON.stringify({date,kind:'daily-model-evidence',predictions:[{rationale:'original'}]}));
  writeFileSync(path,JSON.stringify({date,dailyBatchId:batch,modelEvidencePath:evidence,recommendations:[]}));
  const first=readRecommendationSourceSnapshot(path,{strict:true});assert.ok(first.sourceManifest.sources.some(s=>s.role==='model-evidence'));
  writeFileSync(evidence,JSON.stringify({date,kind:'daily-model-evidence',predictions:[{rationale:'changed'}]}));
  const second=readRecommendationSourceSnapshot(path,{strict:true});assert.equal(first.sourceArtifactSha256,second.sourceArtifactSha256);assert.notEqual(first.sourceManifestSha256,second.sourceManifestSha256);
 }finally{rmSync(root,{recursive:true,force:true})}
});
