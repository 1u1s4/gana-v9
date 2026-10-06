import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { globSync } from 'glob';
import { tokenCost, rolloutUsage, PRICES, PRICE_SOURCE } from './token-cost.mjs';

const root = resolve(process.argv[2] ?? '.artifacts/gana-v9/model-study-2026-10-06');
const read = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
const manifest = read(join(root, 'manifest.json'));
const notes = read(join(root,'study-notes.json'));
const seed = read(join(root,'normalized-seed.json'));
const teamNames = new Map((seed?.team ?? []).map(t=>[t.id,t.name]));
const seededFixtures = (seed?.fixture ?? []).map(f=>({...f,homeTeamName:teamNames.get(f.homeTeamId),awayTeamName:teamNames.get(f.awayTeamId)}));
const days = [];
for(let time=Date.parse(manifest.startedAt)-86400000;time<=Date.parse(manifest.completedAt ?? new Date().toISOString())+86400000;time+=86400000) days.push(new Date(time).toISOString().slice(0,10).replaceAll('-','/'));
const sessions = days.flatMap(day => globSync(join(homedir(), '.codex/sessions', day, '*.jsonl')));
const sessionById = new Map(sessions.map(path => [path.slice(-42,-6), path]));
const rows = [], allPredictions = [], allCalls = [], allRecommendations = [];
const sum = (array, key) => array.reduce((s, row) => s + (row[key] ?? 0), 0);
const counts = array => array.reduce((out, key) => { out[key] = (out[key] ?? 0) + 1; return out; }, {});
const semanticKey = p => [p.providerFixtureId, p.market, p.selection, p.line ?? ''].join('|');
for (const cell of manifest.cells) {
  const dir = join(root, cell.id); const usageDir = join(dir, 'usage');
  const calls = (existsSync(usageDir) ? readdirSync(usageDir) : []).filter(name => name.endsWith('.json')).map(name => {
    const call = read(join(usageDir, name)); if ('webSearchCalls' in call) { call.nativeWebSearchEvents = call.webSearchCalls; delete call.webSearchCalls; } const sessionPath = sessionById.get(call.threadId);
    const rollout = sessionPath ? rolloutUsage(readFileSync(sessionPath, 'utf8').split('\n'), call) : null;
    const usage = call.usage ? { ...rollout?.usage, ...call.usage } : rollout?.usage ?? null;
    const terminalMatches = !call.usage || !rollout?.usage || ['input_tokens','cached_input_tokens','output_tokens'].every(key => call.usage[key] === rollout.usage[key]);
    const actualModels = [...new Set(rollout?.contexts.map(c => c.model) ?? [])];
    const actualEfforts = [...new Set(rollout?.contexts.map(c => c.effort) ?? [])];
    const tokenUsd = usage ? (rollout?.requests.length && terminalMatches ? rollout.requests.reduce((s,r) => s + tokenCost(cell.model,r.usage,r.longContext),0) : tokenCost(cell.model, usage)) : null;
    const result = { ...call, usage, sessionPath, actualModels, actualEfforts, terminalMatches,
      inputTokens: usage?.input_tokens, cachedTokens: usage?.cached_input_tokens, cacheWriteTokens: usage?.cache_write_input_tokens ?? 0,
      outputTokens: usage?.output_tokens, reasoningTokens: usage?.reasoning_output_tokens ?? null,
      totalTokens: usage ? usage.input_tokens + usage.output_tokens : null, tokenUsd,
      noCacheTokenUsd: usage ? (rollout?.requests.length && terminalMatches ? rollout.requests.reduce((s,r)=>s+tokenCost(cell.model,{...r.usage,cached_input_tokens:0,cache_write_input_tokens:0},r.longContext),0) : tokenCost(cell.model,{...usage,cached_input_tokens:0,cache_write_input_tokens:0})) : null,
      usageSource: call.usage ? 'terminal' : usage ? 'partial-rollout' : 'unknown',
      longContextRequests: rollout?.requests.filter(r => r.longContext).length ?? null,
      verifiedModelAndEffort: actualModels.length === 1 && actualModels[0] === cell.model && actualEfforts.length === 1 && actualEfforts[0] === cell.effort };
    allCalls.push(result); return result;
  });
  const selections = globSync(join(dir, 'artifacts/runs/*/selected-fixtures.json')).map(path => ({ path, data: read(path) }));
  const selection = selections[0]; const runDir = selection?.path.replace(/\/selected-fixtures.json$/, '');
  const interimBundles = [...new Map(globSync(join(dir,'artifacts/runs/*/research-bundle.json')).map(path => read(path)).filter(b => b?.id).map(b => [b.id,b])).values()];
  const research = runDir ? read(join(runDir, 'research-results.json'))?.results ?? interimBundles.map(bundle => ({ok:true,bundle,gateResult:bundle.gateResult})) : [];
  const scoring = runDir ? read(join(runDir, 'scoring-results.json'))?.results ?? [] : [];
  const fixtures = runDir ? read(join(runDir, 'fixtures.json')) : null;
  const expansion = new Set(runDir ? read(join(runDir,'coverage-discovery.json'))?.selectedFixtureIds ?? [] : []);
  const fixtureMap = new Map([...seededFixtures,...(fixtures?.fixtures ?? []), ...(fixtures?.discoveredRequiredFixtures ?? [])].map(f => [f.id,f]));
  const predictions = scoring.flatMap(result => (result.predictions ?? []).map(p => {
    const fixture = fixtureMap.get(p.fixtureId);
    return { cell: cell.id, ...p, key: semanticKey(p), discovery:expansion.has(p.fixtureId) ? 'expansion' : 'initial', fixture: fixture ? `${fixture.homeTeamName} vs ${fixture.awayTeamName}` : p.providerFixtureId };
  })); allPredictions.push(...predictions);
  const dailyDir = join(dir,'artifacts/runs',cell.batch ?? `daily-${manifest.date}-ms-${cell.id}`);
  const summary = read(join(dailyDir,'daily-e2e-summary.json'));
  const publication = read(join(dailyDir,'daily-parlay-recommendations.json'));
  const recMap = new Map();
  for (const rec of [...(publication?.recommendations ?? []), ...(publication?.atomicRecommendations ?? []), ...(publication?.parlayRecommendations ?? [])]) {
    const ids = (rec.legs ?? []).map(l => l.predictionId).sort(); const key = [rec.kind, ...ids].join('|');
    if (!recMap.has(key)) recMap.set(key, { cell: cell.id, origin:'general', kind: rec.kind, profile: rec.profile, harnessStatus: rec.harnessStatus, councilDecision: rec.councilDecision?.decision,
      combinedOdds: rec.combinedOdds, probability: rec.adjustedProbability, confidence: rec.aggregateConfidence,
      legs: (rec.legs ?? []).map(leg => ({ ...leg, key: predictions.find(p => p.id === leg.predictionId)?.key ?? null })) });
  }
  const generalRecommendations = recMap.size;
  const required = publication?.requiredLeagueRecommendationsPath ? read(publication.requiredLeagueRecommendationsPath) : null;
  for(const projection of required?.atomicProjections ?? []) {
    const p=predictions.find(p=>p.id===projection.predictionId);
    recMap.set('required-atomic:'+projection.predictionId,{cell:cell.id,origin:'required-league',kind:'atomic-prediction',profile:'required-league',harnessStatus:projection.status,
      combinedOdds:projection.odds,probability:projection.probability,confidence:projection.confidence,legs:[{...projection,key:p?.key ?? null}]});
  }
  for(const projection of (required?.parlayProjections ?? []).filter(p=>p.status==='selected')) {
    recMap.set('required-parlay:'+projection.parlayId,{cell:cell.id,origin:'required-league',kind:'parlay',profile:projection.profile,harnessStatus:projection.riskFlags?.includes('review-required') ? 'review-required' : 'selected',
      combinedOdds:projection.combinedOdds,probability:projection.adjustedProbability,confidence:projection.aggregateConfidence,
      legs:(projection.legs ?? []).map(leg=>({...leg,key:predictions.find(p=>p.id===leg.predictionId)?.key ?? null}))});
  }
  const recs = [...recMap.values()]; allRecommendations.push(...recs);
  const bundles = research.map(r => r.bundle).filter(Boolean);
  const bundleById = new Map(bundles.map(b=>[b.id,b]));
  const deliveredPredictionIds = new Set(recs.flatMap(r=>r.legs.map(l=>l.predictionId)));
  const auditedPredictions = predictions.filter(p=>p.promotable || deliveredPredictionIds.has(p.id));
  const evidenceIssues = auditedPredictions.flatMap(p=>{
    const bundle=bundleById.get(p.researchBundleId); if(!bundle)return [{predictionId:p.id,reason:'missing research bundle'}];
    const local=id=>id.startsWith(bundle.id+':') ? id.slice(bundle.id.length+1) : id;
    const claims=new Set(bundle.claims.map(c=>c.id)),evidence=new Set(bundle.evidenceItems.map(e=>e.id)),sources=new Set(bundle.sources.map(s=>s.id));
    const missingClaims=(p.claimIds ?? []).filter(id=>!claims.has(local(id))),missingEvidence=(p.evidenceIds ?? []).filter(id=>!evidence.has(local(id)));
    const missingSources=bundle.evidenceItems.filter(e=>(p.evidenceIds ?? []).map(local).includes(e.id) && !sources.has(e.sourceId));
    return !p.claimIds?.length || !p.evidenceIds?.length || missingClaims.length || missingEvidence.length || missingSources.length ? [{predictionId:p.id,reason:'incomplete evidence chain',missingClaims,missingEvidence,missingSources}] : [];
  });
  for(const id of deliveredPredictionIds) if(!predictions.some(p=>p.id===id)) evidenceIssues.push({predictionId:id,reason:'delivery references prediction absent from scoring results'});
  const stages = Object.fromEntries(['research','scoring','portfolio'].map(stage => {
    const selected = calls.filter(c => c.stage === stage);
    return [stage,{ calls:selected.length, completed:selected.filter(c => c.state === 'completed').length,
      inputTokens:sum(selected,'inputTokens'),cachedTokens:sum(selected,'cachedTokens'),outputTokens:sum(selected,'outputTokens'),totalTokens:sum(selected,'totalTokens'),tokenUsd:sum(selected,'tokenUsd') }];
  }));
  rows.push({ cell:cell.id,model:cell.model,effort:cell.effort,state:summary && cell.state==='failed' ? summary.verdict : cell.state ?? 'pending',exitCode:cell.exitCode,verdict:summary?.verdict,
    minutes:cell.startedAt ? (Date.parse(cell.completedAt ?? new Date().toISOString())-Date.parse(cell.startedAt))/60000 : null,
    fixtures:selection?.data.fixtures.map(f => f.providerFixtureId).sort() ?? [],researchPersisted:bundles.length,researchValid:bundles.filter(b=>!b.metadata?.fallback).length,researchFallback:bundles.filter(b=>b.metadata?.fallback).length,researchFallbacks:bundles.filter(b=>b.metadata?.fallback).map(b=>({providerFixtureId:b.providerFixtureId,reason:b.metadata.agentError ?? b.metadata.fallbackReason})),researchFailed:research.filter(r => !r.ok).length,evidenceIssues,evidenceAudited:auditedPredictions.length,
    researchGates:counts(research.map(r => r.gateResult?.verdict ?? 'missing')),researchMarketGates:counts(research.flatMap(r=>(r.gateResult?.markets ?? []).map(m=>m.market+':'+m.verdict))),scored:scoring.filter(r => r.predictions?.length).length,scoringOk:scoring.filter(r=>r.ok).length,
    scoringFailures:scoring.filter(r=>!r.ok && r.error).map(r=>({providerFixtureId:r.providerFixtureId,error:r.error})),
    scoringGateBlocks:scoring.filter(r=>!r.ok && !r.error).map(r=>({providerFixtureId:r.providerFixtureId,gate:r.gateResult})),
    predictions:predictions.length,probabilityEstimates:predictions.filter(p=>typeof p.probability==='number').length,uniquePredictionKeys:new Set(predictions.map(p=>p.key)).size,promotable:predictions.filter(p => p.promotable).length,
    promotableFixtures:new Set(predictions.filter(p => p.promotable).map(p => p.providerFixtureId)).size,predictionStatus:counts(predictions.map(p => p.status)),
    promotableByDiscovery:counts(predictions.filter(p=>p.promotable).map(p=>p.discovery)),
    recommendations:recs.length,generalRecommendations,requiredRecommendations:recs.length-generalRecommendations,atomic:recs.filter(r => r.kind === 'atomic-prediction').length,parlays:recs.filter(r => r.kind !== 'atomic-prediction').length,
    finalUniquePredictions:new Set(recs.flatMap(r => r.legs.map(l => l.predictionId))).size,council:summary?.council,
    evidenceItems:sum(bundles.map(b => ({ n:b.evidenceItems?.length ?? 0 })),'n'),sources:sum(bundles.map(b => ({ n:b.sources?.length ?? 0 })),'n'),
    calls:calls.length,failedCalls:calls.filter(c => !['completed','started'].includes(c.state)).length,
    unknownUsage:calls.filter(c => !c.usage).length,partialUsage:calls.filter(c => c.usageSource === 'partial-rollout').length,
    allModelsVerified:calls.length > 0 && calls.every(c => c.verifiedModelAndEffort),allCountersMatch:calls.every(c => c.terminalMatches),
    inputTokens:sum(calls,'inputTokens'),cachedTokens:sum(calls,'cachedTokens'),cacheWriteTokens:sum(calls,'cacheWriteTokens'),
    outputTokens:sum(calls,'outputTokens'),reasoningTokens:sum(calls,'reasoningTokens'),totalTokens:sum(calls,'totalTokens'),tokenUsd:sum(calls,'tokenUsd'),noCacheTokenUsd:sum(calls,'noCacheTokenUsd'),stages,runDir,dailyDir });
}
const comparisons = [];
for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
  const a=rows[i],b=rows[j];const pa=allPredictions.filter(p => p.cell===a.cell),pb=allPredictions.filter(p => p.cell===b.cell);
  const ma=new Map(pa.map(p => [p.key,p])),mb=new Map(pb.map(p => [p.key,p]));const common=[...ma.keys()].filter(k => mb.has(k));
  const promotableA=new Set(pa.filter(p=>p.promotable).map(p=>p.key)),promotableB=new Set(pb.filter(p=>p.promotable).map(p=>p.key));
  const probabilityDifferences=common.flatMap(key => typeof ma.get(key).probability==='number' && typeof mb.get(key).probability==='number' ? [{key,fixture:ma.get(key).fixture,a:ma.get(key).probability,b:mb.get(key).probability,delta:ma.get(key).probability-mb.get(key).probability,promotableA:ma.get(key).promotable,promotableB:mb.get(key).promotable}] : []).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta));
  comparisons.push({a:a.cell,b:b.cell,sameFixtures:JSON.stringify(a.fixtures)===JSON.stringify(b.fixtures),commonPredictions:common.length,
    unionPredictions:new Set([...ma.keys(),...mb.keys()]).size,commonPromotable:[...promotableA].filter(k=>promotableB.has(k)).length,
    unionPromotable:new Set([...promotableA,...promotableB]).size,
    probabilityPairs:probabilityDifferences.length,
    meanAbsoluteProbabilityDifference:probabilityDifferences.length ? probabilityDifferences.reduce((s,p)=>s+Math.abs(p.delta),0)/probabilityDifferences.length : null,
    meanConfidenceDifference:common.length ? common.reduce((s,key)=>s+ma.get(key).confidence-mb.get(key).confidence,0)/common.length : null,
    meanConfidenceDifferenceOnProbabilityPairs:probabilityDifferences.length ? probabilityDifferences.reduce((s,p)=>s+ma.get(p.key).confidence-mb.get(p.key).confidence,0)/probabilityDifferences.length : null,probabilityDifferences});
}
const sportsAccess=existsSync(join(root,'sports-access.jsonl')) ? readFileSync(join(root,'sports-access.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const bodies = new Map();for(const a of sportsAccess){const set=bodies.get(a.url) ?? new Set();set.add(a.sha256);bodies.set(a.url,set);}
const oddsByKey = new Map();for(const p of allPredictions){const set=oddsByKey.get(p.key) ?? new Set();set.add(p.odds);oddsByKey.set(p.key,set);}
const result = {generatedAt:new Date().toISOString(),manifest,priceSource:PRICE_SOURCE,prices:PRICES,rows,comparisons,
  verification:{inconsistentSelectionOdds:[...oddsByKey].filter(([,values])=>values.size>1).map(([key])=>key),sportsRequests:sportsAccess.length,uniqueSportsResponses:bodies.size,inconsistentResponseUrls:[...bodies].filter(([,s])=>s.size!==1).map(([url])=>url),sameFixtureCohort:rows.every(r=>JSON.stringify(r.fixtures)===JSON.stringify(rows[0].fixtures))},predictions:allPredictions,recommendations:allRecommendations,calls:allCalls};
const overheadRows=(notes?.discardedSetupRoots ?? []).flatMap(path=>read(resolve(root,path,'comparison.json'))?.rows ?? []);
result.setupOverhead={roots:notes?.discardedSetupRoots ?? [],totalTokens:sum(overheadRows,'totalTokens'),tokenUsd:sum(overheadRows,'tokenUsd'),unknownUsage:sum(overheadRows,'unknownUsage'),partialUsage:sum(overheadRows,'partialUsage'),calls:sum(overheadRows,'calls')};
result.totalMeasuredHarness={totalTokens:sum(rows,'totalTokens')+result.setupOverhead.totalTokens,tokenUsd:sum(rows,'tokenUsd')+result.setupOverhead.tokenUsd};
writeFileSync(join(root,'comparison.json'),JSON.stringify(result,null,2));
const csv = (name,records,keys) => writeFileSync(join(root,name),[keys.join(','),...records.map(row=>keys.map(key=>'"'+String(typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key] ?? '').replaceAll('"','""')+'"').join(','))].join('\n')+'\n');
csv('model-costs.csv',rows,['model','effort','state','fixtures','researchValid','scored','predictions','probabilityEstimates','promotable','recommendations','calls','failedCalls','inputTokens','cachedTokens','outputTokens','reasoningTokens','totalTokens','tokenUsd','noCacheTokenUsd','minutes']);
csv('prediction-comparison.csv',allPredictions,['cell','fixture','providerFixtureId','discovery','market','selection','line','odds','probability','confidence','promotable','status','rationale']);
csv('call-costs.csv',allCalls,['cell','stage','threadId','state','providerFixtureId','inputTokens','cachedTokens','outputTokens','reasoningTokens','totalTokens','tokenUsd','usageSource']);
const number=n=>new Intl.NumberFormat('es-GT',{maximumFractionDigits:0}).format(n ?? 0);
const dollars=n=>`$${n.toFixed(3)}`;
let md=`# Comparación E2E por modelo — ${manifest.date}\n\nUna corrida completa por combinación, con investigación propia y la misma configuración del harness. Inicio: ${manifest.startedAt}. Commit base: ${manifest.gitHead}.\n\n`;
if(!manifest.completedAt) md+='**Estudio en ejecución: cifras parciales; los modelos pendientes todavía no tienen resultados.**\n\n';
if(manifest.invalidReason) md+=`**Intento de preparación descartado. No usar para comparar la calidad de los modelos.** ${manifest.invalidReason}\n\n`;
md+='| Modelo | Esfuerzo | Estado | Research válido | Con probabilidad / registros | Promovibles | Simples / parlays | Tokens observados | USD tokens* | Minutos |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
for(const r of rows) md+=`| ${r.model} | ${r.effort} | ${r.state} | ${r.researchValid}/${r.fixtures.length} | ${r.probabilityEstimates} / ${r.predictions} | ${r.promotable} | ${r.atomic} / ${r.parlays} | ${number(r.totalTokens)} | ${r.partialUsage || r.unknownUsage ? '≥ ' : ''}${dollars(r.tokenUsd)} | ${r.minutes?.toFixed(1) ?? '—'} |\n`;
md+=`\n*Costo equivalente de API estándar según [tarifas oficiales](${PRICE_SOURCE}) consultadas el 6 de octubre de 2026. No representa un cargo medido de Codex. Excluye cargos de herramientas, proveedor deportivo y suscripciones. Incluye todos los intentos registrados. Tokens totales = entrada + salida; caché ya está dentro de entrada y razonamiento dentro de salida.\n\n`;
md+=`Corridas comparables: ${number(sum(rows,'totalTokens'))} tokens observados y ${dollars(sum(rows,'tokenUsd'))} equivalentes. `;
if(overheadRows.length)md+=`Preparación descartada por una referencia ausente en la base local: ${number(result.setupOverhead.totalTokens)} tokens y al menos ${dollars(result.setupOverhead.tokenUsd)}; ese consumo no se atribuye a la calidad de los modelos. `;
md+=`Total observado de ejecuciones del harness: ${number(result.totalMeasuredHarness.totalTokens)} tokens y ${dollars(result.totalMeasuredHarness.tokenUsd)} equivalentes. Las interrupciones hacen que estos importes sean mínimos observados, no facturación completa.\n\n`;
md+='## Desglose de consumo\n\n| Modelo | Entrada | De entrada, caché | Salida | De salida, razonamiento | Llamadas | Fallidas | Uso desconocido / parcial |\n|---|---:|---:|---:|---:|---:|---:|---:|\n';
for(const r of rows)md+=`| ${r.model} | ${number(r.inputTokens)} | ${number(r.cachedTokens)} | ${number(r.outputTokens)} | ${number(r.reasoningTokens)} | ${r.calls} | ${r.failedCalls} | ${r.unknownUsage} / ${r.partialUsage} |\n`;
md+='\n| Modelo | Investigación USD | Scoring USD | Portafolio USD |\n|---|---:|---:|---:|\n';
for(const r of rows)md+=`| ${r.model} | ${dollars(r.stages.research.tokenUsd)} | ${dollars(r.stages.scoring.tokenUsd)} | ${dollars(r.stages.portfolio.tokenUsd)} |\n`;
md+='\nEl estado previo de la caché de Codex no se puede reiniciar desde este experimento. Como contraste, valorar los mismos tokens sin descuento de caché da: '+rows.map(r=>`${r.model}: ${dollars(r.noCacheTokenUsd)}`).join('; ')+'. Es un contrafactual de precio, no consumo adicional.\n';
md+='\n## Coincidencia de predicciones\n\nSe compara por partido, mercado, selección y línea; no por UUID. Los mercados y líneas del mismo partido están correlacionados; no equivalen a partidos independientes. Los registros sin probabilidad numérica se conservan para auditar bloqueos, pero no se presentan como estimaciones numéricas.\n\n| Comparación | Coincidencias / unión | Pares con probabilidad | Diferencia absoluta media, pp | Diferencia de confianza A−B, pp | Promovibles comunes / unión |\n|---|---:|---:|---:|---:|---:|\n';
for(const c of comparisons)md+=`| ${c.a} / ${c.b} | ${c.commonPredictions} / ${c.unionPredictions} | ${c.probabilityPairs} | ${c.meanAbsoluteProbabilityDifference == null ? '—' : (100*c.meanAbsoluteProbabilityDifference).toFixed(2)} | ${c.meanConfidenceDifferenceOnProbabilityPairs == null ? '—' : (100*c.meanConfidenceDifferenceOnProbabilityPairs).toFixed(2)} | ${c.commonPromotable} / ${c.unionPromotable} |\n`;
md+='\nLas diferencias de probabilidad y confianza usan sólo pares con probabilidad numérica en ambos modelos. La confianza es la del harness para esa selección; no equivale a su probabilidad de acierto.\n';
md+='\nMercados con investigación marcada `promotable` (todavía sujetos al scoring y a los gates finales):\n\n| Mercado | '+rows.map(r=>r.cell).join(' | ')+' |\n|---|'+rows.map(()=>'---:').join('|')+'|\n';
for(const market of ['h2h','double_chance','goals_over_under','corners_over_under','btts'])md+=`| ${market} | `+rows.map(r=>r.researchMarketGates[market+':promotable'] ?? 0).join(' | ')+' |\n';
md+='\nScoring por mercado: estimaciones con probabilidad numérica / predicciones promovibles. No incluye registros bloqueados sin probabilidad.\n\n| Mercado | '+rows.map(r=>r.cell).join(' | ')+' |\n|---|'+rows.map(()=>'---:').join('|')+'|\n';
for(const market of ['h2h','double_chance','goals_over_under','corners_over_under','btts'])md+=`| ${market} | `+rows.map(r=>{const ps=allPredictions.filter(p=>p.cell===r.cell && p.market===market);return `${ps.filter(p=>typeof p.probability==='number').length} / ${ps.filter(p=>p.promotable).length}`;}).join(' | ')+' |\n';
const largestByKey = new Map();
for(const difference of comparisons.flatMap(c=>c.probabilityDifferences).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))) if(!largestByKey.has(difference.key)) largestByKey.set(difference.key,difference);
const differences = [...largestByKey.values()].slice(0,8);
if(differences.length){
  md+='\nMayores diferencias observadas en una misma selección. Cada celda muestra probabilidad del modelo y `P` si pasó el gate de promoción; `R` si no lo pasó. Son estimaciones del modelo, no probabilidades validadas.\n\n| Partido / mercado / selección / línea | '+rows.map(r=>r.cell).join(' | ')+' |\n|---|'+rows.map(()=>'---:').join('|')+'|\n';
  for(const difference of differences){ const p=allPredictions.find(p=>p.key===difference.key); md+=`| ${p.fixture} / ${p.market} / ${p.selection} / ${p.line ?? '—'} | `+rows.map(row=>{const p=allPredictions.find(p=>p.cell===row.cell && p.key===difference.key);return p && typeof p.probability === 'number' ? `${(100*p.probability).toFixed(1)}% ${p.promotable?'P':'R'}` : '—';}).join(' | ')+' |\n'; }
}
md+='\n## Selecciones para entrega\n\nIncluye el portafolio general después del council y las selecciones del flujo de ligas obligatorias. Son caminos distintos del harness: el veredicto del council general no describe por sí solo toda la entrega. Vista previa local, sin enviar mensajes.\n';
for(const row of rows){md+=`\n### ${row.model} ${row.effort}\n\n`; const recs=allRecommendations.filter(r=>r.cell===row.cell);if(!recs.length)md+='Sin selecciones finales registradas\n';for(const rec of recs)md+=`- ${rec.kind} · ${rec.origin} · ${rec.profile ?? ''} · cuota ${rec.combinedOdds} · harness ${rec.harnessStatus ?? '—'} · council ${rec.councilDecision ?? '—'}: ${rec.legs.map(l=>`${l.display?.fixtureLabel ?? l.fixture ?? l.fixtureId}: ${l.market} ${l.selection}${l.line == null ? '' : ' '+l.line}`).join('; ')}\n`;}
md+=`\n## Controles y límites\n\n- Misma cohorte entre los cuatro modelos: ${result.verification.sameFixtureCohort}\n- Respuestas deportivas únicas capturadas: ${bodies.size}; URLs con cuerpos inconsistentes: ${result.verification.inconsistentResponseUrls.length}\n- Selecciones comunes con cuotas diferentes: ${result.verification.inconsistentSelectionOdds.length}\n- Modelo y esfuerzo verificados en todas las sesiones: ${rows.every(r=>r.allModelsVerified)}\n- Contadores finales disponibles coinciden con sesiones: ${rows.every(r=>r.allCountersMatch)}\n- Bases locales independientes, sin publicación a Discord. Producción conserva su configuración\n- La semilla local no incluye predicciones antiguas ni historial de calibración en base de datos. Las cuatro corridas reciben la misma copia de los artefactos de validación publicados anteriores\n- Investigación web independiente: mide el E2E entero, no sólo el razonamiento sobre un dossier idéntico. Las consultas web y sus horarios pueden variar\n- Una sola réplica por combinación y una sola jornada. Modelo y esfuerzo cambian conjuntamente; no permite aislar causalmente cada factor\n- Promovible significa que pasó los gates del harness; no demuestra acierto ni calibración. Los partidos aún no se liquidaron\n- Uso parcial en llamadas interrumpidas es un mínimo observado; no se inventa consumo posterior al último contador\n\nArchivos: [datos completos](comparison.json), [costos por modelo](model-costs.csv), [predicciones](prediction-comparison.csv), [costos por llamada](call-costs.csv).\n`;
writeFileSync(join(root,'report.md'),md);
console.log(JSON.stringify({rows:rows.map(({cell,state,researchValid,scored,predictions,promotable,calls,totalTokens,tokenUsd})=>({cell,state,researchValid,scored,predictions,promotable,calls,totalTokens,tokenUsd})),verification:result.verification},null,2));
