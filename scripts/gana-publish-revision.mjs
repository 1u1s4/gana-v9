#!/usr/bin/env node
import 'dotenv/config';
import {resolve,join} from 'node:path';
import {readFileSync,writeFileSync,existsSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {publishDailyRecommendations,discordMessageIds} from './lib/daily-e2e-publication.mjs';
import {readCurrentRecommendationArtifact} from './lib/daily-e2e-wrapper-state.mjs';
import {resolveCanonicalPublishedRecommendation,sha256Json} from './lib/validation-runtime.mjs';
import {resolveDiscordTarget} from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';
const args={};for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(!['--date','--daily-batch-id','--parent-batch-id','--dry-run'].includes(key))throw new Error(`Unknown option ${key}`);args[key]=key==='--dry-run'?true:process.argv[++i];}
const date=args['--date'],batch=args['--daily-batch-id'];
if(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||!String(batch).startsWith(`daily-${date}-`)||!/^[A-Za-z0-9_-]+$/.test(batch??''))throw new Error('Exact date and safe daily batch ID required');
const root=resolve(process.env.GANA_ARTIFACT_ROOT??'.artifacts/gana-v9');
const parent=resolveCanonicalPublishedRecommendation({artifactRoot:root,date});
if(!parent.ok||parent.dailyLock.status!=='published'||parent.dailyBatchId!==args['--parent-batch-id']||parent.dailyBatchId===batch)throw new Error('Parent must be the exact confirmed published Daily');
const path=join(root,'runs',batch,'daily-parlay-recommendations.json');
const receiptPath=join(root,'cron','revisions',`${batch}.lock`);mkdirSync(join(root,'cron','revisions'),{recursive:true});
if(existsSync(receiptPath)){
 const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
 if(receipt.status==='published'){const proof=resolveCanonicalPublishedRecommendation({artifactRoot:root,date,revisionBatchId:batch});if(!proof.ok)throw new Error(proof.reason);console.log(JSON.stringify({status:'already-published',messageIds:receipt.messageIds}));process.exit(0);}
 throw new Error('Existing revision attempt must be reconciled before retrying');
}
const artifact=JSON.parse(readFileSync(path,'utf8'));
if(artifact.date!==date||artifact.dailyBatchId!==batch)throw new Error('Revision identity mismatch');
if(artifact.revisionOfDailyBatchId&&artifact.revisionOfDailyBatchId!==parent.dailyBatchId)throw new Error('Revision parent changed');
artifact.revisionOfDailyBatchId=parent.dailyBatchId;
writeFileSync(path,JSON.stringify(artifact,null,2));
const state=readCurrentRecommendationArtifact(path,{date,dailyBatchId:batch});if(!state.ok)throw new Error(state.reason);
const input={artifact:state.artifact,artifactPath:path,date,dailyBatchId:batch,discordTarget:resolveDiscordTarget('recommendations'),databaseUrl:process.env.DATABASE_URL,sourceManifest:state.sourceManifest,sourceManifestSha256:state.sourceManifestSha256,mode:'daily-revision'};
if(args['--dry-run']){console.log(JSON.stringify({status:'prepared',artifactPath:path,parentBatchId:parent.dailyBatchId,sourceManifestSha256:state.sourceManifestSha256,selectionCount:artifact.recommendations?.length??0}));process.exit(0);}
// Exclusive attempt receipt plus DB reservation: uncertain sends cannot silently retry.
closeSync(openSync(receiptPath,'wx'));
const receipt={date,dailyBatchId:batch,parentBatchId:parent.dailyBatchId,status:'publishing',sourceManifestSha256:state.sourceManifestSha256,artifactSha256:sha256Json(artifact),startedAt:new Date().toISOString()};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
try{
 const result=await publishDailyRecommendations(input);
 const messageIds=result.messageIds??discordMessageIds(result.notification);
 receipt.status=['published','already-published'].includes(result.status)&&messageIds.length?'published':result.status;
 receipt.messageIds=messageIds;receipt.publication=result;receipt.completedAt=new Date().toISOString();
 writeFileSync(receiptPath,JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,messageIds,receiptPath,reason:result.reason}));
 if(receipt.status!=='published')process.exitCode=1;
}catch(error){receipt.status='publication-uncertain';writeFileSync(receiptPath,JSON.stringify(receipt,null,2));throw error;}
