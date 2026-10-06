import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { loadRecommendations } from '../../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { countPublishableSelections, validatePublicationLedgerAlignment, validatePublicationTargetIds } from '../lib/daily-e2e-wrapper-state.mjs';
import { verifyDbPersistenceLedger } from '../lib/daily-e2e-publication.mjs';

// Verify the real delivery projection locally. Never invoke a publisher/send.
const root=resolve(process.argv[2]);
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
const results=[];
for(const cell of manifest.cells){
  const artifactPath=join(root,cell.id,'artifacts/runs',cell.batch,'daily-parlay-recommendations.json');
  if(!cell.completedAt || !existsSync(artifactPath))continue;
  if(!/^gana_study_[a-z0-9_]+$/.test(cell.database))throw new Error('Dedicated local database required');
  const {artifact}=loadRecommendations(artifactPath,{strictSources:true});
  const counts=countPublishableSelections(artifact);
  const alignment=validatePublicationLedgerAlignment(artifact);
  const targetIds=validatePublicationTargetIds(artifact);
  const prisma=new PrismaClient({datasourceUrl:`postgresql://${process.env.USER}@127.0.0.1:55439/${cell.database}?schema=public`});
  let dbLedger;try{dbLedger=counts.total ? await verifyDbPersistenceLedger(artifact,{prisma}) : {ok:true,reason:'no selections to verify'};}finally{await prisma.$disconnect();}
  const stdout=execFileSync(process.execPath,['.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs','--artifact',artifactPath,'--dry-run'],{encoding:'utf8',maxBuffer:16e6});
  writeFileSync(join(root,cell.id,'discord-dry-run.json'),stdout);
  const preview=JSON.parse(stdout);
  const result={cell:cell.id,counts,alignment,targetIds,dbLedger,renderedSelectionCount:preview.renderedSelectionCount,payloadCount:preview.payloadCount,
    ok:alignment.ok && targetIds.ok && dbLedger.ok && counts.total===preview.renderedSelectionCount};
  results.push(result);
}
writeFileSync(join(root,'delivery-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),sentMessages:0,results},null,2));
console.log(JSON.stringify(results.map(r=>({cell:r.cell,ok:r.ok,counts:r.counts,ledger:r.dbLedger.reason})),null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
