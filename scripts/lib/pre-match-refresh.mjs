import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCanonicalPublishedRecommendation, writeJsonAtomic } from './validation-runtime.mjs';
import { acquireGlobalLock, releaseGlobalLock, guatemalaClock, offsetIsoDate } from './daily-ops-dispatch.mjs';

const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
const read = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

// Only confirmed publications enroll fixtures. Unpublished experiments never do.
export async function planPreMatchRefresh({ artifactRoot, now, policy, inspectRefresh, resolvePublished = resolveCanonicalPublishedRecommendation }) {
  const today = guatemalaClock(now).date;
  const targets = new Map();
  const blocked = [];
  for (const date of [today, offsetIsoDate(today, 1)]) {
    const parent = resolvePublished({ artifactRoot, date });
    if (!parent.ok) continue;
    const publications = [parent];
    const revisions = join(artifactRoot, 'cron/revisions');
    if (existsSync(revisions)) for (const name of readdirSync(revisions).sort()) {
      const receipt = read(join(revisions, name));
      if (!receipt && name.startsWith(`daily-${date}-`)) { blocked.push({date,reason:'invalid-revision-receipt'}); continue; }
      if (receipt?.date !== date || receipt.parentBatchId !== parent.dailyBatchId) continue;
      if (receipt.status !== 'published') { blocked.push({ date, reason: 'revision-requires-reconciliation', batch: receipt.dailyBatchId }); continue; }
      const revision = resolvePublished({ artifactRoot, date, revisionBatchId: receipt.dailyBatchId });
      if (revision.ok) publications.push(revision);
      else blocked.push({ date, reason: revision.reason, batch: receipt.dailyBatchId });
    }
    if (blocked.some(b => b.date === date)) continue;
    publications.sort((a,b)=>String(a.dailyLock.completedAt ?? a.dailyLock.updatedAt ?? '').localeCompare(String(b.dailyLock.completedAt ?? b.dailyLock.updatedAt ?? '')));
    for (const publication of publications) for (const sourceRunId of publication.artifact.sourceRunIds ?? []) {
      if (!safeId(sourceRunId) || !existsSync(join(artifactRoot, 'runs', sourceRunId, 'scoring-results.json'))
        || !existsSync(join(artifactRoot, 'runs', sourceRunId, 'fixtures.json'))) continue;
      const plan = await inspectRefresh({ sourceRunId, date, automatic: true, dryRun: true });
      for (const target of plan.targets ?? []) {
        if (!safeId(target.providerFixtureId)) continue;
        const key = `${date}-${target.providerFixtureId}`;
        const guardRoot = join(artifactRoot, 'refresh-ledger');
        const guards = existsSync(guardRoot) ? readdirSync(guardRoot).filter(n => n.startsWith(`auto-${key}-`)).map(n => read(join(guardRoot, n))) : [];
        if (guards.some(g => g?.status !== 'complete')) { blocked.push({ date, fixture: target.providerFixtureId, reason: 'refresh-requires-reconciliation' }); continue; }
        if (guards.length >= policy.maxAttemptsPerFixture) continue;
        const checkedPath = join(artifactRoot, 'cron/prematch-checks', `${key}.json`);
        const checked = read(checkedPath);
        // Later confirmed revisions supersede the source for the same fixture.
        targets.set(key, { ...target, date, sourceRunId, parentBatchId: parent.dailyBatchId,
          checkedPath, lastCheckedAt: checked?.checkedAt ?? '1970-01-01T00:00:00.000Z' });
      }
    }
  }
  const selected = [...targets.values()].sort((a, b) => a.lastCheckedAt.localeCompare(b.lastCheckedAt) || a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, policy.maxFixturesPerPass);
  return { targets: selected, blocked, policy };
}

export async function runPreMatchRefresh({ artifactRoot, policy, inspectRefresh, refresh, publish, now = () => new Date(), dryRun = false, paused = false, resolvePublished }) {
  if (paused) return { status: 'paused', actions: [] };
  const plan = () => planPreMatchRefresh({ artifactRoot, policy, inspectRefresh, now: now(), resolvePublished });
  if (dryRun) return { status: 'dry-run', ...await plan() };
  const lock = acquireGlobalLock(join(artifactRoot, 'cron/locks/daily-ops-dispatch.lock'), { now: now() });
  if (!lock.acquired) return { status: 'skipped', reason: lock.reason, actions: [] };
  try {
    const planned = await plan();
    // Report a new reconciliation problem once; a frequent silent skip must not
    // hide a broken publication, and unchanged failures must not spam Discord.
    const noticePath = join(artifactRoot, 'cron/prematch-blocked-notice.json');
    const blockedFingerprint = JSON.stringify([...new Set(planned.blocked.map(item => JSON.stringify(item)))].sort());
    const previousNotice = read(noticePath);
    const newBlockers = planned.blocked.length > 0 && previousNotice?.fingerprint !== blockedFingerprint;
    if (previousNotice?.fingerprint !== blockedFingerprint) {
      writeJsonAtomic(noticePath, { fingerprint: blockedFingerprint, checkedAt: now().toISOString(), blocked: planned.blocked });
    }
    const actions = [];
    // Each call has its own immutable revision and is checked again against live kickoff.
    for (const target of planned.targets) {
      writeJsonAtomic(target.checkedPath, { checkedAt: now().toISOString(), sourceRunId: target.sourceRunId });
      try {
        const result = await refresh({ sourceRunId: target.sourceRunId, date: target.date, automatic: true, fixtureIds: [target.providerFixtureId] });
        const evaluated = result.decisions?.filter(d => d.status === 'evaluated').length ?? 0;
        const failed = result.decisions?.some(d => d.status === 'failed');
        if (!evaluated && !failed) continue;
        let publication;
        if (result.recommendations > 0) publication = await publish({ date: target.date, batch: result.revisionId, parentBatch: target.parentBatchId });
        const action = { fixture: target.providerFixtureId, date: target.date, sourceRunId: target.sourceRunId,
          revisionId: result.revisionId, status: failed ? 'review-required' : 'evaluated', recommendations: result.recommendations,
          artifactPath: result.artifactPath, publication };
        actions.push(action);
        writeJsonAtomic(join(artifactRoot, 'cron/prematch-results', `${result.revisionId}.json`), action);
        if (publication && !['published', 'already-published'].includes(publication.status)) break;
      } catch (error) {
        actions.push({ fixture: target.providerFixtureId, status: 'review-required', reason: error.message });
        break;
      }
    }
    return { status: newBlockers || actions.some(a => a.status === 'review-required' || (a.publication && !['published','already-published'].includes(a.publication.status))) ? 'review-required' : actions.length ? 'completed' : 'skipped',
      policy, actions, blocked: planned.blocked, newBlockers };
  } finally { releaseGlobalLock(lock); }
}
