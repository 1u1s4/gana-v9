import { lineupFingerprint } from '../evidence/lineups.js';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from '../runtime/context.js';
import { createApiFootballProvider, getApiFootballOddsSnapshot } from '../providers/sports/api-football.js';
import { runFixtureResearch } from '../evidence/research.js';
import { runFixtureScoring } from '../prediction/service.js';
import { buildDailyModelEvidence } from './model-evidence.js';

export function refreshReason(input: { scheduledAt: string; status: string; previousGeneratedAt?: string; error?: string; now: Date; windowMinutes?: number }) {
  const kickoff = Date.parse(input.scheduledAt), now = input.now.getTime();
  if (input.status !== 'scheduled' || !Number.isFinite(kickoff) || kickoff <= now) return null;
  if (input.error && /timeout|timed out|temporar|429|503|502|connection|no persisted quotes|no real web-search source/i.test(input.error)) return 'recoverable-stage';
  const window = (input.windowMinutes ?? 120) * 60_000;
  const previous = Date.parse(input.previousGeneratedAt ?? '');
  return kickoff - now <= window && Number.isFinite(previous) && kickoff - previous > window ? 'pre-kickoff-evidence-window' : null;
}

/** Separate immutable revision. Does not overwrite a published cohort or auto-send. */
export async function runSelectiveRefresh(config: AgentConfig, input: { sourceRunId: string; date: string; dryRun?: boolean; windowMinutes?: number }, runtime: RuntimeContext, deps: {
    now?: () => Date;
    provider?: ReturnType<typeof createApiFootballProvider>;
    odds?: typeof getApiFootballOddsSnapshot;
    research?: typeof runFixtureResearch;
    score?: typeof runFixtureScoring;
  } = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(input.sourceRunId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Invalid source run or date');
  const dir = join(config.artifactRoot, 'runs', input.sourceRunId);
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const sourceFixtures = read('fixtures.json');
  const scan = existsSync(join(dir,'low-odds-scan.json')) ? read('low-odds-scan.json') : {};
  const fixtures = new Map<string, any>([...(sourceFixtures.fixtures ?? []), ...(scan.candidateFixtures ?? [])].map(f => [f.providerFixtureId, f]));
  const previous = read('scoring-results.json').results as any[];
  const now = deps.now?.() ?? new Date();
  const plan = previous.flatMap(result => {
    const id = result.providerFixtureId ?? result.fixtureId;
    const fixture = fixtures.get(id) ?? [...fixtures.values()].find(f => f.id === id);
    if (!fixture) return [];
    const localDate = new Intl.DateTimeFormat('en-CA',{ timeZone: config.apiFootball.timezone, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(fixture.scheduledAt));
    if (localDate !== input.date) return [];
    const generated = result.predictions?.map((p: any) => p.generatedAt).filter(Boolean).sort().at(-1);
    const reason = refreshReason({ ...fixture, previousGeneratedAt: generated, error: result.error, now, windowMinutes: input.windowMinutes });
    return reason ? [{ fixture, reason, previous: result }] : [];
  });
  if (input.dryRun) return { status: 'planned', sourceRunId: input.sourceRunId, targets: plan.map(p => ({ providerFixtureId: p.fixture.providerFixtureId, reason: p.reason })) };
  const revisionId = `daily-${input.date}-refresh-${randomUUID().slice(0,8)}`;
  const output = join(config.artifactRoot,'runs',revisionId); mkdirSync(output,{recursive:true});
  const save = (name: string, value: unknown) => writeFileSync(join(output,name),JSON.stringify(value,null,2));
  const child = { ...runtime, runId: revisionId, agenticResearchCallCount: 0 };
  const provider = deps.provider ?? createApiFootballProvider(config, {}, child);
  const odds = deps.odds ?? getApiFootballOddsSnapshot;
  const results: any[] = [], research: any[] = [], decisions: any[] = [];
  for (const target of plan) {
    // Identity, current status and kickoff are refreshed before any model call.
    try {
    const fixture = await provider.getFixture({ providerFixtureId: target.fixture.providerFixtureId });
    if (!refreshReason({ ...fixture, error: target.previous.error, previousGeneratedAt: target.previous.predictions?.[0]?.generatedAt, now: deps.now?.() ?? new Date(), windowMinutes: input.windowMinutes })) continue;
    fixtures.set(fixture.providerFixtureId, fixture);
    const snapshot = await odds(config,fixture.providerFixtureId,child);
    if (!snapshot.quotes.length) { decisions.push({ fixtureId:fixture.id,status:'deferred',reason:'no-current-quotes' }); continue; }
    let lineupState: ReturnType<typeof lineupFingerprint> = 'not-confirmed';
    if (target.reason === 'pre-kickoff-evidence-window' && provider.getFixtureLineups) {
      try { lineupState = lineupFingerprint(await provider.getFixtureLineups({ providerFixtureId: fixture.providerFixtureId }), fixture); }
      catch { /* Fresh research reports lineup uncertainty; never fabricate availability. */ }
    }
    const fingerprint=createHash('sha256').update(JSON.stringify([input.sourceRunId,fixture.providerFixtureId,target.reason,lineupState,
      snapshot.quotes.map(q=>[q.market,q.selection,q.line,q.bookmaker,q.price]).sort()])).digest('hex');
    const guardDir=join(config.artifactRoot,'refresh-ledger');mkdirSync(guardDir,{recursive:true});const guard=join(guardDir,`${fingerprint}.json`);
    try { closeSync(openSync(guard,'wx')); } catch(error:any) { if(error.code==='EEXIST'){decisions.push({fixtureId:fixture.id,status:'skipped',reason:'same-evidence-trigger-already-attempted'});continue;} throw error; }
    writeFileSync(guard,JSON.stringify({status:'running',revisionId,startedAt:new Date().toISOString()}));
    try {
      child.runId=revisionId;
      const evidence=await (deps.research ?? runFixtureResearch)({...config,codexThreadId:undefined},{fixtureId:fixture.providerFixtureId,web:'live',oddsSnapshot:snapshot},child);
      research.push(evidence);
      if(!evidence.bundle)throw new Error('Fresh research returned no bundle');
      await odds(config,fixture.providerFixtureId,child);
      const result=await (deps.score ?? runFixtureScoring)({...config,codexThreadId:undefined},{fixtureId:fixture.providerFixtureId,web:'live',researchBundle:evidence.bundle},child);
      results.push(result);decisions.push({fixtureId:fixture.id,status:'evaluated',reason:target.reason,runId:result.runId});
      writeFileSync(guard,JSON.stringify({status:'complete',revisionId,runId:result.runId,completedAt:new Date().toISOString()}));
    }catch(error){decisions.push({fixtureId:fixture.id,status:'failed',error:error instanceof Error?error.message:String(error)});writeFileSync(guard,JSON.stringify({status:'failed',revisionId,requiresReconciliation:true}));}
    } catch(error) { decisions.push({ fixtureId: target.fixture.id, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
    save('refresh-decisions.json',decisions);save('research-results.json',{results:research});save('scoring-results.json',{results});
  }
  save('research-results.json',{results:research});save('scoring-results.json',{results});save('fixtures.json',{fixtures:[...fixtures.values()]});save('refresh-decisions.json',decisions);
  const evidence=buildDailyModelEvidence(config.artifactRoot,input.date,[revisionId]);save('daily-model-evidence.json',evidence);
  const predictions=results.flatMap(r=>r.predictions??[]).filter(p=>p.status==='promotable'&&p.promotable&&p.expectedValue>0
    && evidence.predictions.some(record=>record.predictionId===p.id&&record.traceComplete));
  const recommendations=predictions.map((p,i)=>{const f=fixtures.get(p.providerFixtureId);return {kind:'atomic-prediction',rank:i+1,predictionId:p.id,predictionIds:[p.id],harnessStatus:p.status,combinedOdds:p.odds,aggregateConfidence:p.confidence,expectedEdge:p.edge,legs:[{...p,predictionId:p.id,fixture:f?`${f.homeTeamName} vs ${f.awayTeamName}`:p.providerFixtureId,scheduledAt:f?.scheduledAt}]};});
  const artifact={date:input.date,dailyBatchId:revisionId,presentation:'concise-v1',sourceRunIds:[revisionId],parentSourceRunId:input.sourceRunId,revision:true,persistencePolicy:{finalOperationalStore:'database-ledger'},publishedTargets:{parlayIds:[],predictionIds:predictions.map(p=>p.id)},modelEvidencePath:join(output,'daily-model-evidence.json'),recommendations};
  save('daily-parlay-recommendations.json',artifact);
  return { status: decisions.some(d=>d.status==='failed')?'partial':'complete',revisionId,artifactPath:join(output,'daily-parlay-recommendations.json'),decisions,recommendations:recommendations.length };
}
