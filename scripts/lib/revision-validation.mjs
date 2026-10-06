import {existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {resolveCanonicalPublishedRecommendation,inspectJsonFile,classifyValidationState,inspectValidationMutex} from './validation-runtime.mjs';
/** Registered immutable revisions are separate validation cohorts, never main-lock replacements. */
export function planRevisionValidations({artifactRoot,previousDate,now,eligible=true}) {
 const dir=resolve(artifactRoot,'cron','revisions');if(!eligible||!existsSync(dir))return [];
 const plans=[];
 for(const file of readdirSync(dir).filter(name=>/^daily-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]+\.lock$/.test(name)).sort()){
  const batch=file.slice(0,-5),date=batch.slice(6,16);if(date>previousDate)continue;
  const canonical=resolveCanonicalPublishedRecommendation({artifactRoot,date,revisionBatchId:batch});if(!canonical.ok)continue;
  const path=resolve(artifactRoot,'cron','locks',`validation-${date}-${batch}.lock`);
  const validation=inspectJsonFile(path);
  if (validation.exists && !validation.valid) continue;
  const decision = classifyValidationState(validation.value, { now: new Date(now) });
  const mutex = inspectValidationMutex(path, { now: new Date(now) });
  if (!decision.run || !mutex.wouldAcquire) continue;
  plans.push({flow:'revision-validation',run:true,targetDate:date,dailyBatchId:batch,revisionBatchId:batch,recommendationArtifact:canonical.recommendationArtifact,path,reason:validation.exists?'revision-retry-due':'published-revision-needs-validation'});
 }
 return plans.slice(0,1);
}
