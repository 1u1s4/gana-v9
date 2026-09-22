#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const statusOf = (item) => ['push', 'void'].includes(item?.status ?? item?.outcome?.status) ? 'voided' : item?.status ?? item?.outcome?.status ?? 'unvalidated';
const settled = (status) => ['won', 'lost', 'voided'].includes(status);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const signature = (legs) => legs.map((leg) => [leg.fixtureId, leg.market, leg.selection, leg.line ?? ''].join(':')).sort().join('|');

export function settlePublishedPick(pick, validations) {
  const direct = validations.find((item) => pick.kind === 'parlay' ? item.parlayId === pick.id : item.predictionId === pick.id);
  const legs = pick.legs.map((leg) => validations.find((item) => item.predictionId === leg.predictionId));
  const statuses = legs.map(statusOf);
  // A lost leg settles the parlay; missing other legs never imply a win.
  const status = direct ? statusOf(direct) : statuses.includes('lost') ? 'lost'
    : statuses.length && statuses.every((item) => item === 'voided') ? 'voided'
    : statuses.length && statuses.every(settled) ? 'won' : statuses.includes('pending') ? 'pending' : 'unvalidated';
  let returnUnits = null;
  if (status === 'lost') returnUnits = 0;
  if (status === 'voided') returnUnits = 1;
  if (status === 'won' && pick.kind !== 'parlay') returnUnits = pick.odds;
  if (status === 'won' && pick.kind === 'parlay' && statuses.length && statuses.every(settled)) {
    returnUnits = pick.legs.reduce((product, leg, index) => product * (statuses[index] === 'voided' ? 1 : leg.odds), 1);
  }
  return { status, returnUnits };
}

export function summarizePublishedPicks(rows) {
  const decided = rows.filter((row) => row.status === 'won' || row.status === 'lost');
  const won = decided.filter((row) => row.status === 'won').length;
  const payoutKnown = rows.filter((row) => settled(row.status) && row.returnUnits !== null);
  return {
    recommendations: rows.length,
    uniqueFixtureSets: new Set(rows.map((row) => row.fixtureSet)).size,
    days: new Set(rows.map((row) => row.date)).size,
    won, lost: decided.length - won, voided: rows.filter((row) => row.status === 'voided').length,
    unresolved: rows.filter((row) => !settled(row.status)).length,
    hitRate: decided.length ? won / decided.length : null,
    flatUnitPnl: payoutKnown.reduce((sum, row) => sum + row.returnUnits - 1, 0),
    payoutKnown: payoutKnown.length,
    flatUnitRoi: payoutKnown.length ? payoutKnown.reduce((sum, row) => sum + row.returnUnits - 1, 0) / payoutKnown.length : null,
    inference: 'descriptive-only; correlated selections and changing models are not independent calibration samples',
  };
}

export function buildPublishedPortfolioReport({ root, from, to }) {
  const locks = path.join(root, '.artifacts/gana-v9/cron/locks');
  const runs = path.join(root, '.artifacts/gana-v9/runs');
  const absolute = (file) => file ? path.resolve(root, file) : null;
  const rows = [], days = [], excluded = [];
  const groups = (items, field) => Object.fromEntries([...new Set(items.map(field))].sort().map((key) => [key, summarizePublishedPicks(items.filter((item) => field(item) === key))]));
  for (const name of fs.readdirSync(locks).filter((name) => /^daily-e2e-\d{4}-\d{2}-\d{2}\.lock$/.test(name)).sort()) {
    const date = name.slice(10, 20);
    if (date < from || date > to) continue;
    const lockPath = path.join(locks, name);
    const lock = read(lockPath);
    const messageIds = lock.messageIds ?? lock.manualDiscord?.messageIds ?? lock.publicationLedger?.discordMessageIds ?? [lock.messageId].filter(Boolean);
    if (lock.status !== 'published' || !messageIds.length) {
      excluded.push({ date, reason: 'no published lock with Discord message receipt', status: lock.status }); continue;
    }
    const artifactPath = path.join(runs, lock.dailyBatchId ?? '', 'daily-parlay-recommendations.json');
    if (!fs.existsSync(artifactPath)) { excluded.push({ date, reason: 'published artifact missing', artifactPath }); continue; }
    let lineage = 'published-lock-and-message-id';
    const payloadPath = absolute(lock.publicationLedger?.payloadPath);
    if (payloadPath && fs.existsSync(payloadPath)) {
      const payload = read(payloadPath);
      const sources = payload.sourceManifest?.sources ?? [{ path: payload.sourceArtifactPath, sha256: payload.sourceArtifactSha256 }];
      const invalid = sources.filter((source) => !source.path || !fs.existsSync(absolute(source.path)) || hash(fs.readFileSync(absolute(source.path))) !== source.sha256);
      if (invalid.length) { excluded.push({ date, reason: 'published source hash differs or missing; cannot reconstruct publication', invalidSources: invalid.map((item) => item.path) }); continue; }
      lineage = 'published-lock-message-id-and-source-sha256';
    }
    const artifact = read(artifactPath);
    const validationLockPath = path.join(locks, `validation-${date}.lock`);
    const validationLock = fs.existsSync(validationLockPath) ? read(validationLockPath) : {};
    const validationPath = absolute(Array.isArray(validationLock.artifacts) ? validationLock.artifacts.find((file) => file.endsWith('/validations.json')) : validationLock.artifacts?.validation);
    let validations = [], evaluatedAt = null;
    if (validationPath && fs.existsSync(validationPath)) {
      const validation = read(validationPath);
      if (absolute(validation.target?.recommendationArtifact) === artifactPath) {
        validations = validation.validations ?? []; evaluatedAt = validation.evaluatedAt;
      }
    }
    const picks = (artifact.recommendations ?? []).map((rec) => ({ ...rec, source: 'daily' }));
    const requiredPath = absolute(artifact.requiredLeagueRecommendationsPath);
    if (requiredPath && fs.existsSync(requiredPath)) {
      const required = read(requiredPath);
      for (const rec of required.atomicProjections ?? []) picks.push({ ...rec, kind: 'atomic-prediction', source: 'required-atomic', profile: 'required-atomic', legs: [rec], combinedOdds: rec.odds });
      for (const rec of required.parlayProjections ?? []) if (rec.status === 'selected') picks.push({ ...rec, kind: 'parlay', source: 'required-parlay' });
    }
    const seen = new Set(); let duplicates = 0;
    const dateRows = [];
    for (const [order, rec] of picks.entries()) {
      const legs = rec.legs ?? [];
      const semantic = signature(legs);
      if (!semantic || seen.has(semantic)) { duplicates++; continue; }
      seen.add(semantic);
      const kind = rec.kind ?? 'parlay';
      const id = kind === 'parlay' ? rec.parlayId : rec.predictionId ?? rec.predictionIds?.[0] ?? legs[0]?.predictionId;
      const odds = numeric(rec.combinedOdds ?? rec.odds ?? legs[0]?.odds);
      const confidence = numeric(rec.displayConfidence ?? rec.aggregateConfidence ?? rec.confidence);
      const aggregate = numeric(rec.aggregateConfidence ?? rec.confidence);
      const row = {
        date, batchId: lock.dailyBatchId, id, kind, source: rec.source, profile: rec.profile, order,
        legs, odds, confidence, aggregateConfidence: aggregate,
        legConfidenceProduct: legs.length && legs.every((leg) => numeric(leg.confidence) !== null) ? legs.reduce((p, leg) => p * leg.confidence, 1) : null,
        reviewOnly: rec.harnessStatus === 'review-required' || rec.status === 'review-required' || rec.selectionMode === 'analytical-fallback' || rec.riskFlags?.some((flag) => ['review-required', 'parlay-ineligible-source', 'model-probability-safety-confidence'].includes(flag)) || false,
        expectedEdge: numeric(rec.expectedEdge), riskFlags: rec.riskFlags ?? [],
        fixtureSet: [...new Set(legs.map((leg) => leg.fixtureId))].sort().join('|'),
        marketSet: [...new Set(legs.map((leg) => leg.market))].sort().join('+'),
        signature: semantic, lineage, artifactPath: path.relative(root, artifactPath),
        validationPath: validationPath ? path.relative(root, validationPath) : null, evaluatedAt,
      };
      Object.assign(row, settlePublishedPick(row, validations)); dateRows.push(row);
    }
    rows.push(...dateRows);
    days.push({ date, batchId: lock.dailyBatchId, lineage, rawRecommendations: picks.length, uniqueRecommendations: dateRows.length, duplicateLegSets: duplicates, candidatesExcluded: (artifact.councilCandidateRecommendations ?? []).length, messageIds, validationAvailable: validations.length > 0 });
  }
  const top = (items, metric) => [...items].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || a.order - b.order)[0];
  const legacy = [], guarded = [];
  for (const day of days) {
    const daily = rows.filter((row) => row.date === day.date && row.odds >= 1.45);
    const a = top(daily, 'confidence'); if (a) legacy.push(a);
    // Fixed integrity policy only; never use outcome/status/return to choose.
    const b = top(daily.filter((row) => !row.reviewOnly && row.expectedEdge > 0 && row.aggregateConfidence > 0 && row.aggregateConfidence <= 1), 'aggregateConfidence');
    if (b) guarded.push(b);
  }
  return {
    schemaVersion: 1, from, to,
    method: { universe: 'canonical published locks with Discord message ids; optional immutable source-manifest check', dedup: 'fixture-market-selection-line signature per day', outcomes: 'canonical matching validation target; unresolved never scored as losses; partial void payout requires every leg', comparison: 'descriptive counterfactual using fixed ex-ante integrity rules; no fitted thresholds, no causal or prospective performance claim', calibrationPolicy: 'No live thresholds retuned. Independent fixture sets, time-separated holdout and model/market/source cohorts required before calibration.', limitations: ['No live Discord fetch or DB query; receipts are local publication evidence', 'Missing locks/artifacts/validation excluded or left unresolved, never inferred from candidates', 'Legacy receipts without source hashes retained in a separate lineage cohort', 'Correlated recommendations and model changes prevent treating row counts as independent observations'] },
    summary: summarizePublishedPicks(rows), byProfile: groups(rows, (row) => row.profile ?? 'unknown'), byMarketSet: groups(rows, (row) => row.marketSet), byLineage: groups(rows, (row) => row.lineage), byReviewStatus: groups(rows, (row) => row.reviewOnly ? 'review-only' : 'not-marked-review'),
    probabilityAudit: { parlaysWithAverageAboveProduct: rows.filter((row) => row.kind === 'parlay' && row.legConfidenceProduct !== null && row.aggregateConfidence > row.legConfidenceProduct + 0.005).length, diamanteOutsideProfile: rows.filter((row) => row.profile === 'parlay-diamante' && (row.odds < 1.1 || row.odds > 1.3)).length, duplicatePublishedLegSets: days.reduce((sum, day) => sum + day.duplicateLegSets, 0) },
    fixedPolicyComparison: { legacyPublishedConfidence: summarizePublishedPicks(legacy), eligibleEvidenceConfidence: summarizePublishedPicks(guarded) },
    days, excluded, rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
  if (!args.from || !args.to) throw new Error('Usage: node scripts/retro-published-portfolio.mjs --from=YYYY-MM-DD --to=YYYY-MM-DD [--output=PATH]');
  const report = buildPublishedPortfolioReport({ root: process.cwd(), from: args.from, to: args.to });
  const output = path.resolve(args.output ?? `.artifacts/gana-v9/reports/published-portfolio-${args.from}-to-${args.to}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, summary: report.summary, probabilityAudit: report.probabilityAudit, byProfile: report.byProfile, comparison: report.fixedPolicyComparison, publishedDays: report.days.length, excludedDays: report.excluded.length }, null, 2));
}
