#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, statSync, writeSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sendDiscordNativePayload } from '../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { resolveDiscordTargets } from '../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';
import { buildCronOutcome, compactPath, durationBetween, emitCronRichSummary } from './gana-telegram-rich-output.mjs';
import {
  countPublishableSelections,
  readExistingRecommendationArtifact,
  readCurrentRecommendationArtifact,
  resolveApiFootballLimitRetry,
  validateRetryablePublishLock,
  validatePublicationLedgerAlignment,
} from './lib/daily-e2e-wrapper-state.mjs';
import { resolveDailyRuntime } from './lib/daily-e2e-runtime.mjs';
import { discordMessageIds as publicationDiscordMessageIds, publishDailyRecommendations } from './lib/daily-e2e-publication.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const TIMEZONE = 'America/Guatemala';
const ARTIFACT_ROOT = process.env.GANA_ARTIFACT_ROOT?.trim() || '.artifacts/gana-v9';
const DEFAULT_DISCORD_MAX_SELECTIONS = 25;

if (process.env.GANA_MAINTENANCE_PAUSED === 'true') {
  console.log('Gana daily operations are paused for database maintenance.');
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));
const publishExisting = args.publishExisting || strictBooleanEnv('GANA_DAILY_PUBLISH_EXISTING', false);
if (publishExisting && args.force) throw new Error('--publish-existing cannot be combined with --force.');
if (publishExisting && (!args.date || !args.dailyBatchId)) {
  throw new Error('--publish-existing requires both --date and --daily-batch-id.');
}
const date = args.date ?? guatemalaDate(1);
const dailyBatchId = args.dailyBatchId ?? `daily-${date}-full`;
const discordTargets = resolveDiscordTargets({ gatewayTarget: args.gatewayTarget });
const notBefore = args.notBefore ?? process.env.GANA_DAILY_E2E_NOT_BEFORE ?? '10:15';
const retryDelayMs = positiveMinutes(process.env.GANA_DAILY_EMPTY_RETRY_MINUTES, 120) * 60 * 1000;
const logPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `${dailyBatchId}.log`);
const outcomePath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', `${dailyBatchId}-outcome.json`);
const recommendationsPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs', dailyBatchId, 'daily-parlay-recommendations.json');
const lockPath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', 'locks', `daily-e2e-${date}.lock`);
const publishedSkipNoticePath = resolve(REPO_ROOT, ARTIFACT_ROOT, 'cron', 'notifications', `daily-e2e-${date}-published.notified`);

mkdirSync(dirname(logPath), { recursive: true });
if (!args.force && !hasReachedGuatemalaWallClock(notBefore)) {
  writeOutcome(buildCronOutcome({
    flow: 'daily-e2e',
    status: 'skipped',
    date,
    timezone: TIMEZONE,
    batchId: dailyBatchId,
    reason: 'not-before guard',
    artifacts: [outcomePath],
  }));
  emitCronRichSummary({
    title: 'Gana v9 · Daily E2E omitido',
    status: 'skipped',
    date,
    timezone: TIMEZONE,
    bullets: [
      'Motivo: not-before guard',
      `Batch: ${dailyBatchId}`,
      `No antes de: ${notBefore}`,
      `Hora GT: ${formatGuatemalaTime(guatemalaTimeParts())}`,
    ],
    footer: '⏭️ No se corrió nada todavía; el catch-up lo intenta de nuevo en ventana válida.',
  });
  process.exit(0);
}

if (publishExisting) {
  const existingRunLock = existsSync(lockPath) ? readJsonFile(lockPath) : undefined;
  const lockGate = validateRetryablePublishLock(existingRunLock, { date, dailyBatchId });
  if (!lockGate.ok) {
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e-publish-existing',
      status: 'skipped',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      reason: lockGate.reason,
      retryAfter: lockGate.retryAfter,
      artifacts: [lockPath, outcomePath],
    }));
    emitCronRichSummary({
      title: 'Gana v9 · Publicación existente omitida',
      status: 'skipped',
      date,
      timezone: TIMEZONE,
      bullets: [
        `Batch: ${dailyBatchId}`,
        `Lock gate: ${lockGate.reason}`,
        lockGate.retryAfter ? `Retry after: ${lockGate.retryAfter}` : undefined,
        `Lock: ${compactPath(lockPath)}`,
      ].filter(Boolean),
      footer: '⏭️ No se ejecutó E2E ni se envió Discord.',
    });
    process.exit(0);
  }
  const acquiredPublishLock = acquireOnce(lockPath, 20 * 60 * 60 * 1000, {
    date,
    dailyBatchId,
    status: 'publishing-existing',
    startedAt: new Date().toISOString(),
    sourceStatus: existingRunLock.status,
  });
  if (!acquiredPublishLock) {
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e-publish-existing',
      status: 'skipped',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      reason: 'publish-lock-race-lost',
      artifacts: [lockPath, outcomePath],
    }));
    process.exit(0);
  }
  process.exit(await runPublishExistingMode());
}

const dailyRuntime = resolveDailyRuntime({ env: process.env, codexModel: args.codexModel });
const providers = args.providers ?? process.env.GANA_DAILY_PROVIDERS ?? 'codex';
const codexModel = dailyRuntime.codexModel;
const providerConcurrency = args.providerConcurrency ?? Number(process.env.GANA_DAILY_PROVIDER_CONCURRENCY ?? 1);
const parlayProfile = args.parlayProfile ?? process.env.GANA_PARLAY_PROFILE ?? 'portfolio-v2';
const requiredLeagues = args.requiredLeagues ?? process.env.GANA_DAILY_REQUIRED_LEAGUES ?? '1:World Cup:World:2026';
const webMode = args.web ?? process.env.GANA_WEB_MODE ?? 'live';
if (!Number.isInteger(providerConcurrency) || providerConcurrency < 1) {
  throw new Error('--provider-concurrency must be a positive integer.');
}
let acquiredRunLock = false;
const existingRunLock = !args.force && existsSync(lockPath) ? readJsonFile(lockPath) : undefined;
if (!args.force) {
  acquiredRunLock = acquireOnce(lockPath, 20 * 60 * 60 * 1000, { date, dailyBatchId, status: 'running', startedAt: new Date().toISOString() });
}
if (!args.force && !acquiredRunLock) {
  const retryAfter = typeof existingRunLock?.retryAfter === 'string' ? existingRunLock.retryAfter : undefined;
  const skip = describeExistingRunLock(existingRunLock, retryAfter);
  writeOutcome(buildCronOutcome({
    flow: 'daily-e2e',
    status: 'skipped',
    date,
    timezone: TIMEZONE,
    batchId: dailyBatchId,
    reason: skip.reason,
    artifacts: [lockPath, outcomePath],
    retryAfter,
  }));
  if (skip.reason === 'already published' && hasPublishedSkipNotice(publishedSkipNoticePath)) {
    process.exit(0);
  }
  emitCronRichSummary({
    title: 'Gana v9 · Daily E2E omitido',
    status: 'skipped',
    date,
    timezone: TIMEZONE,
    bullets: buildSkipBullets({
      message: skip.message,
      batchId: dailyBatchId,
      lock: existingRunLock,
      lockPath,
      retryAfter,
    }),
    footer: skip.footer,
  });
  if (skip.reason === 'already published') {
    writePublishedSkipNotice(publishedSkipNoticePath, { date, dailyBatchId, lockPath, notifiedAt: new Date().toISOString() });
  }
  process.exit(0);
}
const startedAt = new Date();
const command = [
  'node',
  '--import',
  'tsx',
  'src/cli.ts',
  'daily-e2e',
  '--date', date,
  '--providers', providers,
  '--provider-concurrency', String(providerConcurrency),
  ...(args.maxFixtures ? ['--max-fixtures', String(args.maxFixtures)] : []),
  '--threshold', String(args.threshold ?? 1.2),
  '--web', webMode,
  '--parlay-profile', parlayProfile,
  '--required-leagues', requiredLeagues,
  '--daily-batch-id', dailyBatchId,
];
if (codexModel) command.push('--codex-model', codexModel);

const env = {
  ...process.env,
  GANA_PROFILE: process.env.GANA_PROFILE ?? 'full-permissions',
  GANA_APPROVAL_MODE: process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
  AGENT_PROVIDER: process.env.AGENT_PROVIDER ?? 'codex',
  AGENT_CODEX_FALLBACK_MODELS: dailyRuntime.codexFallbackModels.join(','),
  AGENT_CODEX_SANDBOX: process.env.AGENT_CODEX_SANDBOX ?? 'danger-full-access',
  AGENT_REASONING_EFFORT: dailyRuntime.reasoningEffort,
  AGENT_FAST_MODE: String(dailyRuntime.fastMode),
  AGENT_NATIVE_WEB_SEARCH_MODE: process.env.AGENT_NATIVE_WEB_SEARCH_MODE ?? 'live',
  GANA_TIMEZONE: process.env.GANA_TIMEZONE ?? TIMEZONE,
  GANA_DAILY_PROVIDER_CONCURRENCY: process.env.GANA_DAILY_PROVIDER_CONCURRENCY ?? String(providerConcurrency),
  GANA_DAILY_REQUIRED_LEAGUES: process.env.GANA_DAILY_REQUIRED_LEAGUES ?? requiredLeagues,
  GANA_LOW_ODDS_THRESHOLD: process.env.GANA_LOW_ODDS_THRESHOLD ?? String(args.threshold ?? 1.2),
  GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES: process.env.GANA_LOW_ODDS_GLOBAL_MAX_FIXTURES ?? process.env.GANA_CRON_LOW_ODDS_GLOBAL_MAX_FIXTURES ?? '10000',
  GANA_MAX_FIXTURES_PER_RUN: process.env.GANA_MAX_FIXTURES_PER_RUN ?? '10000',
  GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN: process.env.GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN ?? '10000',
  GANA_MAX_PROVIDER_REQUESTS_PER_RUN: process.env.GANA_MAX_PROVIDER_REQUESTS_PER_RUN ?? '10000',
};

const logFd = openSync(logPath, 'a');
let sentRecommendations = false;
let retryLockReason = 'daily-e2e produced no Discord recommendations';
let retryLockRetryAfter;
try {
  let handled = false;
  writeLogLine(logFd, `started ${startedAt.toISOString()} ${command.join(' ')}`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', logFd, logFd],
  });
  const completedAt = new Date();
  writeLogLine(logFd, `completed ${completedAt.toISOString()} status=${result.status} signal=${result.signal ?? 'none'}`);
  if (result.error) writeLogLine(logFd, `error ${result.error.message}`);

  const artifactState = readCurrentRecommendationArtifact(recommendationsPath, { date, dailyBatchId, startedAt });
  const publishableCounts = artifactState.ok ? countPublishableSelections(artifactState.artifact) : {
    total: 0,
    recommendations: 0,
    requiredAtomic: 0,
    requiredSelectedParlays: 0,
  };
  const providerLimitRetry = artifactState.ok ? resolveApiFootballLimitRetry(artifactState.artifact) : undefined;
  if (providerLimitRetry) {
    retryLockReason = providerLimitRetry.reason;
    retryLockRetryAfter = providerLimitRetry.retryAfter;
  }
  const selectionCount = publishableCounts.total;
  const ledgerAlignment = artifactState.ok
    ? validatePublicationLedgerAlignment(artifactState.artifact)
    : { ok: false, reason: artifactState.reason };
  const publication = artifactState.ok && selectionCount > 0 && ledgerAlignment.ok
    ? await publishDailyRecommendations({
      artifact: artifactState.artifact,
      artifactPath: recommendationsPath,
      date,
      dailyBatchId,
      discordTarget: discordTargets.recommendations,
      databaseUrl: process.env.DATABASE_URL,
      sourceManifest: artifactState.sourceManifest,
      sourceManifestSha256: artifactState.sourceManifestSha256,
      maxSelections: args.max ?? DEFAULT_DISCORD_MAX_SELECTIONS,
      mode: 'daily-e2e',
    })
    : { status: 'blocked', reason: selectionCount > 0 ? ledgerAlignment.reason : 'no-publishable-selections' };
  const dbLedger = publication.dbLedger ?? { ok: false, reason: publication.reason };
  if (publication.status === 'published' || publication.status === 'already-published') {
    sentRecommendations = true;
    const recommendationNotify = publication.notification;
    const publicationLedger = publication.publicationLedger;
    const messageIds = publication.status === 'published'
      ? publicationDiscordMessageIds(recommendationNotify)
      : publication.messageIds ?? [];
    emitCronRichSummary({
      title: publication.status === 'published' ? 'Gana v9 · Daily E2E publicado' : 'Gana v9 · Daily E2E ya publicado',
      status: 'ok',
      date,
      timezone: TIMEZONE,
      bullets: [
        `Batch: ${dailyBatchId}`,
        `Publicación: ${selectionCount} selections · ${publishableCounts.recommendations} recommendations`,
        `Obligatorias: ${publishableCounts.requiredAtomic + publishableCounts.requiredSelectedParlays}`,
        `Ledger DB: ${dbLedger.reason}`,
        `Publication ledger: ${publication.reason}`,
        `Run: exit ${result.status ?? 'unknown'} · ${durationBetween(startedAt, completedAt)}`,
        messageIds.length ? `Discord recomendaciones: ${messageIds.join(', ')}` : undefined,
        `Recommendations: ${compactPath(recommendationsPath)}`,
        `Log: ${compactPath(logPath)}`,
        `Outcome: ${compactPath(outcomePath)}`,
      ].filter(Boolean),
      footer: '🛡️ Revisión manual requerida antes de promoción · sin ejecución monetaria',
    });
    writeLock(lockPath, {
      date,
      dailyBatchId,
      status: 'published',
      reconciledFromLedger: publication.status === 'already-published',
      selectionCount,
      recommendationCount: publishableCounts.recommendations,
      requiredLeagueSelectionCount: publishableCounts.requiredAtomic + publishableCounts.requiredSelectedParlays,
      ledger: dbLedger,
      publicationLedger,
      messageId: messageIds[0] ?? null,
      messageIds,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e',
      status: 'published',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      startedAt,
      completedAt: new Date(),
      command,
      exitStatus: result.status,
      signal: result.signal,
      reason: publication.reason,
      counts: publishableCounts,
      ledger: dbLedger,
      publicationLedger,
      notifications: { recommendations: messageIds },
      artifacts: [
        { label: 'recommendations', path: recommendationsPath },
        { label: 'log', path: logPath },
        { label: 'outcome', path: outcomePath },
      ],
    }));
    process.exitCode = 0;
    handled = true;
  } else if (publication.status === 'ledger-conflict'
    || publication.status === 'publication-uncertain'
    || publication.status === 'publication-ledger-error') {
    sentRecommendations = true;
    const messageIds = publicationDiscordMessageIds(publication.notification);
    const terminalStatus = publication.status === 'ledger-conflict' ? 'publication-uncertain' : publication.status;
    writeLogLine(logFd, `publication blocked from automatic retry: ${publication.reason}`);
    writeLock(lockPath, {
      date,
      dailyBatchId,
      status: terminalStatus,
      selectionCount,
      recommendationCount: publishableCounts.recommendations,
      ledger: dbLedger,
      publicationLedger: publication.publicationLedger,
      messageId: messageIds[0] ?? null,
      messageIds,
      updatedAt: new Date().toISOString(),
      reason: publication.reason,
    });
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e',
      status: 'review-required',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      startedAt,
      completedAt: new Date(),
      command,
      exitStatus: result.status,
      signal: result.signal,
      reason: publication.reason,
      counts: publishableCounts,
      ledger: dbLedger,
      publicationLedger: publication.publicationLedger,
      notifications: { recommendations: messageIds },
      artifacts: [lockPath, recommendationsPath, logPath, outcomePath],
    }));
    process.exitCode = 1;
    handled = true;
  }
  if (artifactState.ok && selectionCount === 0) {
    writeLogLine(logFd, `recommendations artifact contains zero publishable selections; sending operational alert instead of empty Discord recommendations: ${recommendationsPath}`);
  }
  if (artifactState.ok && selectionCount > 0 && !ledgerAlignment.ok) {
    writeLogLine(logFd, `recommendations artifact failed publication ledger alignment: ${ledgerAlignment.reason}`);
  }
  if (artifactState.ok && selectionCount > 0 && ledgerAlignment.ok && !dbLedger.ok) {
    writeLogLine(logFd, `recommendations artifact failed DB ledger verification: ${dbLedger.reason}`);
  }
  if (!artifactState.ok) {
    writeLogLine(logFd, `recommendations artifact is not publishable for this run: ${artifactState.reason}`);
  }

  if (!handled) {
    const latest = artifactState.ok ? recommendationsPath : findLatestRecommendations(date);
    await sendStatus(discordTargets.alerts, {
      title: '⚠️ Gana v9 · Daily E2E requiere revisión',
      description: [
        `📅 ${date} · ${TIMEZONE}`,
        `🧪 batch ${dailyBatchId}`,
        `🧾 exit ${result.status ?? 'unknown'} · signal ${result.signal ?? 'none'}`,
        artifactState.ok && selectionCount > 0 ? `🗃️ ledger ${ledgerAlignment.ok ? dbLedger.reason : ledgerAlignment.reason}` : undefined,
        latest ? `📦 artifact ${latest}` : '📦 sin artifact de recomendaciones',
        '🛡️ Revisar logs antes de promoción.',
      ].filter(Boolean).join('\n'),
      color: 0xf2994a,
    });
    emitCronRichSummary({
      title: 'Gana v9 · Daily E2E requiere revisión',
      status: 'warning',
      date,
      timezone: TIMEZONE,
      bullets: [
        `Batch: ${dailyBatchId}`,
        `Run: exit ${result.status ?? 'unknown'} · signal ${result.signal ?? 'none'} · ${durationBetween(startedAt, completedAt)}`,
        `Artifact gate: ${artifactState.reason}`,
        artifactState.ok && selectionCount > 0 ? `Ledger gate: ${ledgerAlignment.ok ? dbLedger.reason : ledgerAlignment.reason}` : undefined,
        `Publicables: ${selectionCount}`,
        `Discord alertas: ${discordTargets.alerts}`,
        latest ? `Latest: ${compactPath(latest)}` : undefined,
        `Log: ${compactPath(logPath)}`,
        `Outcome: ${compactPath(outcomePath)}`,
      ].filter(Boolean),
      footer: '⚠️ Revisar logs antes de promoción; no se enviaron recomendaciones vacías.',
    });
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e',
      status: 'review-required',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      startedAt,
      completedAt,
      command,
      exitStatus: result.status,
      signal: result.signal,
      reason: artifactState.ok && selectionCount > 0
        ? (ledgerAlignment.ok ? dbLedger.reason : ledgerAlignment.reason)
        : artifactState.reason,
      counts: publishableCounts,
      ledger: artifactState.ok && selectionCount > 0 ? (ledgerAlignment.ok ? dbLedger : ledgerAlignment) : undefined,
      notifications: { alerts: discordTargets.alerts },
      artifacts: [
        ...(latest ? [{ label: 'latest', path: latest }] : []),
        { label: 'log', path: logPath },
        { label: 'outcome', path: outcomePath },
      ],
    }));
    process.exitCode = result.status === 0 ? 1 : result.status ?? 1;
  }
} finally {
  if (acquiredRunLock && !sentRecommendations) {
    const retryAfter = retryLockRetryAfter ?? new Date(Date.now() + retryDelayMs).toISOString();
    writeLock(lockPath, {
      date,
      dailyBatchId,
      status: 'retryable',
      retryAfter,
      updatedAt: new Date().toISOString(),
      reason: retryLockReason,
    });
    writeLogLine(logFd, `daily-e2e lock marked retryable until ${retryAfter}: ${retryLockReason}`);
  }
  closeSync(logFd);
}

async function runPublishExistingMode() {
  const startedAt = new Date();
  const logFd = openSync(logPath, 'a');
  const command = [
    'node',
    'scripts/gana-daily-e2e-and-notify.mjs',
    '--publish-existing',
    '--date', date,
    '--daily-batch-id', dailyBatchId,
  ];
  let terminalLockWritten = false;
  let retryReason = 'publish-existing did not complete';
  try {
    writeLogLine(logFd, `started ${startedAt.toISOString()} ${command.join(' ')}`);
    const artifactState = readExistingRecommendationArtifact(recommendationsPath, {
      date,
      dailyBatchId,
      now: startedAt,
      maxAgeMs: positiveHours(process.env.GANA_DAILY_PUBLISH_EXISTING_MAX_AGE_HOURS, 36) * 60 * 60 * 1000,
    });
    if (!artifactState.ok) {
      retryReason = `publish-existing artifact gate failed: ${artifactState.reason}`;
      writeLogLine(logFd, retryReason);
      writeOutcome(buildCronOutcome({
        flow: 'daily-e2e-publish-existing',
        status: 'review-required',
        date,
        timezone: TIMEZONE,
        batchId: dailyBatchId,
        startedAt,
        completedAt: new Date(),
        command,
        reason: artifactState.reason,
        artifacts: [
          { label: 'recommendations', path: recommendationsPath },
          { label: 'log', path: logPath },
          { label: 'outcome', path: outcomePath },
        ],
      }));
      return 1;
    }

    const publication = await publishDailyRecommendations({
      artifact: artifactState.artifact,
      artifactPath: recommendationsPath,
      date,
      dailyBatchId,
      discordTarget: discordTargets.recommendations,
      databaseUrl: process.env.DATABASE_URL,
      sourceManifest: artifactState.sourceManifest,
      sourceManifestSha256: artifactState.sourceManifestSha256,
      maxSelections: args.max ?? DEFAULT_DISCORD_MAX_SELECTIONS,
      mode: 'publish-existing',
    });
    const completedAt = new Date();
    writeLogLine(logFd, `completed ${completedAt.toISOString()} status=${publication.status} reason=${publication.reason}`);

    if (publication.status === 'published' || publication.status === 'already-published') {
      const messageIds = publication.status === 'published'
        ? publicationDiscordMessageIds(publication.notification)
        : publication.messageIds ?? [];
      writeLock(lockPath, {
        date,
        dailyBatchId,
        status: 'published',
        mode: 'publish-existing',
        reconciledFromLedger: publication.status === 'already-published',
        selectionCount: publication.counts?.total ?? 0,
        recommendationCount: publication.counts?.recommendations ?? 0,
        ledger: publication.dbLedger,
        publicationLedger: publication.publicationLedger,
        messageId: messageIds[0] ?? null,
        messageIds,
        completedAt: completedAt.toISOString(),
        updatedAt: completedAt.toISOString(),
      });
      terminalLockWritten = true;
      writeOutcome(buildCronOutcome({
        flow: 'daily-e2e-publish-existing',
        status: 'published',
        date,
        timezone: TIMEZONE,
        batchId: dailyBatchId,
        startedAt,
        completedAt,
        command,
        reason: publication.reason,
        counts: publication.counts,
        ledger: publication.dbLedger,
        publicationLedger: publication.publicationLedger,
        notifications: { recommendations: messageIds },
        artifacts: [
          { label: 'recommendations', path: recommendationsPath },
          { label: 'log', path: logPath },
          { label: 'outcome', path: outcomePath },
        ],
      }));
      emitCronRichSummary({
        title: publication.status === 'published'
          ? 'Gana v9 · Artifact existente publicado'
          : 'Gana v9 · Publicación existente reconciliada',
        status: 'ok',
        date,
        timezone: TIMEZONE,
        bullets: [
          `Batch: ${dailyBatchId}`,
          `Publicables: ${publication.counts?.total ?? 0}`,
          `Estado: ${publication.reason}`,
          messageIds.length ? `Discord recomendaciones: ${messageIds.join(', ')}` : 'Discord: ledger ya publicado',
          `Recommendations: ${compactPath(recommendationsPath)}`,
        ],
        footer: '🛡️ No se ejecutó E2E ni se invocaron providers/web.',
      });
      return 0;
    }

    if (publication.status === 'ledger-conflict'
      || publication.status === 'publication-uncertain'
      || publication.status === 'publication-ledger-error') {
      const messageIds = publicationDiscordMessageIds(publication.notification);
      writeLock(lockPath, {
        date,
        dailyBatchId,
        status: publication.status === 'ledger-conflict' ? 'publication-uncertain' : publication.status,
        mode: 'publish-existing',
        reason: publication.reason,
        selectionCount: publication.counts?.total ?? 0,
        publicationLedger: publication.publicationLedger,
        messageId: messageIds[0] ?? null,
        messageIds,
        updatedAt: completedAt.toISOString(),
      });
      terminalLockWritten = true;
      writeOutcome(buildCronOutcome({
        flow: 'daily-e2e-publish-existing',
        status: 'review-required',
        date,
        timezone: TIMEZONE,
        batchId: dailyBatchId,
        startedAt,
        completedAt,
        command,
        reason: publication.reason,
        counts: publication.counts,
        ledger: publication.dbLedger,
        publicationLedger: publication.publicationLedger,
        notifications: { recommendations: messageIds },
        artifacts: [lockPath, recommendationsPath, logPath, outcomePath],
      }));
      return 1;
    }

    retryReason = `publish-existing blocked: ${publication.reason}`;
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e-publish-existing',
      status: 'review-required',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      startedAt,
      completedAt,
      command,
      reason: publication.reason,
      counts: publication.counts,
      ledger: publication.dbLedger,
      artifacts: [lockPath, recommendationsPath, logPath, outcomePath],
    }));
    return 1;
  } catch (error) {
    retryReason = `publish-existing failed: ${safeErrorMessage(error)}`;
    writeLogLine(logFd, retryReason);
    writeOutcome(buildCronOutcome({
      flow: 'daily-e2e-publish-existing',
      status: 'review-required',
      date,
      timezone: TIMEZONE,
      batchId: dailyBatchId,
      startedAt,
      completedAt: new Date(),
      command,
      reason: retryReason,
      artifacts: [lockPath, recommendationsPath, logPath, outcomePath],
    }));
    return 1;
  } finally {
    if (!terminalLockWritten) {
      const retryAfter = new Date(Date.now() + retryDelayMs).toISOString();
      writeLock(lockPath, {
        date,
        dailyBatchId,
        status: 'retryable',
        retryAfter,
        updatedAt: new Date().toISOString(),
        reason: retryReason,
      });
      writeLogLine(logFd, `publish-existing lock marked retryable until ${retryAfter}: ${retryReason}`);
    }
    closeSync(logFd);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') parsed.date = requireValue(argv, ++index, arg);
    else if (arg === '--daily-batch-id') parsed.dailyBatchId = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--providers') parsed.providers = requireValue(argv, ++index, arg);
    else if (arg === '--codex-model') parsed.codexModel = requireValue(argv, ++index, arg);
    else if (arg === '--threshold') parsed.threshold = Number(requireValue(argv, ++index, arg));
    else if (arg === '--provider-concurrency') parsed.providerConcurrency = Number(requireValue(argv, ++index, arg));
    else if (arg === '--max-fixtures') parsed.maxFixtures = Number(requireValue(argv, ++index, arg));
    else if (arg === '--parlay-profile') parsed.parlayProfile = requireValue(argv, ++index, arg);
    else if (arg === '--required-leagues') parsed.requiredLeagues = requireValue(argv, ++index, arg);
    else if (arg === '--web') parsed.web = requireValue(argv, ++index, arg);
    else if (arg === '--not-before') parsed.notBefore = requireValue(argv, ++index, arg);
    else if (arg === '--max') parsed.max = Number(requireValue(argv, ++index, arg));
    else if (arg === '--publish-existing') parsed.publishExisting = true;
    else if (arg === '--force') parsed.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function acquireOnce(path, ttlMs, payload) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const lock = readJsonFile(path);
    const status = typeof lock?.status === 'string' ? lock.status : 'unknown';
    if (status === 'retryable' && typeof lock?.retryAfter === 'string') {
      const retryAtMs = Date.parse(lock.retryAfter);
      if (Number.isFinite(retryAtMs) && retryAtMs <= Date.now()) {
        rmSync(path, { force: true });
      } else {
        return false;
      }
    } else if (status === 'running') {
      const ageMs = Date.now() - statSync(path).mtimeMs;
      if (ageMs < ttlMs) return false;
      rmSync(path, { force: true });
    } else {
      return false;
    }
  }
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (err) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  }
  try {
    writeSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    closeSync(fd);
  }
  return true;
}

function writeLock(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function hasPublishedSkipNotice(path) {
  return existsSync(path);
}

function writePublishedSkipNotice(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function describeExistingRunLock(lock, retryAfter) {
  const status = typeof lock?.status === 'string' ? lock.status : 'unknown';
  if (retryAfter || status === 'retryable') {
    return {
      reason: 'retry pending',
      message: 'retry pendiente tras run vacío/fallido',
      footer: '⏭️ Sin duplicar publicaciones; esperando ventana de retry.',
    };
  }
  if (status === 'published') {
    return {
      reason: 'already published',
      message: 'ya corrió y publicó recomendaciones',
      footer: '⏭️ Sin duplicar publicaciones; batch ya publicado.',
    };
  }
  if (status === 'running') {
    return {
      reason: 'run in progress',
      message: 'sigue en curso',
      footer: '⏭️ Sin duplicar publicaciones; ejecución activa.',
    };
  }
  if (status === 'completed' || status === 'succeeded') {
    return {
      reason: 'already completed',
      message: 'ya corrió y completó',
      footer: '⏭️ Sin duplicar publicaciones; batch ya completado.',
    };
  }
  if (status === 'failed' || status === 'blocked') {
    return {
      reason: `previous ${status}`,
      message: `corrida previa quedó ${status}`,
      footer: '⏭️ Sin duplicar publicaciones; revisar lock antes de rerun forzado.',
    };
  }
  return {
    reason: 'lock active unknown status',
    message: `lock activo con estado no reconocido: ${status}`,
    footer: '⏭️ Sin duplicar publicaciones; lock activo.',
  };
}

function buildSkipBullets({ message, batchId, lock, lockPath, retryAfter }) {
  const status = typeof lock?.status === 'string' ? lock.status : 'unknown';
  const completedAt = typeof lock?.completedAt === 'string' ? lock.completedAt : undefined;
  const selectionCount = Number.isFinite(lock?.selectionCount) ? lock.selectionCount : undefined;
  const recommendationCount = Number.isFinite(lock?.recommendationCount) ? lock.recommendationCount : undefined;
  return [
    `Motivo: ${message}`,
    `Batch: ${batchId}`,
    `Lock: ${status}${completedAt ? ` · completed ${completedAt}` : ''}`,
    selectionCount !== undefined || recommendationCount !== undefined
      ? `Publicación: ${selectionCount ?? 0} selections · ${recommendationCount ?? 0} recommendations`
      : undefined,
    retryAfter ? `Retry after: ${retryAfter}` : undefined,
    `Path: ${compactPath(lockPath)}`,
  ].filter(Boolean);
}

function writeOutcome(payload) {
  mkdirSync(dirname(outcomePath), { recursive: true });
  writeFileSync(outcomePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function positiveMinutes(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function positiveHours(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function strictBooleanEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function guatemalaDate(offsetDays) {
  const base = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function hasReachedGuatemalaWallClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('--not-before must use HH:MM in America/Guatemala.');
  const current = guatemalaTimeParts();
  const requiredMinutes = (Number(match[1]) * 60) + Number(match[2]);
  const currentMinutes = (current.hour * 60) + current.minute;
  return currentMinutes >= requiredMinutes;
}

function guatemalaTimeParts() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function formatGuatemalaTime(parts) {
  const hh = String(parts.hour).padStart(2, '0');
  const mm = String(parts.minute).padStart(2, '0');
  const ss = String(parts.second).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function writeLogLine(fd, line) {
  if (!line) return;
  writeSync(fd, `${line}\n`);
}

function findLatestRecommendations(date) {
  const runs = resolve(REPO_ROOT, ARTIFACT_ROOT, 'runs');
  const matches = [];
  collect(runs, matches, date);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.path;
}

function collect(dir, matches, date) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, matches, date);
    else if (entry.isFile() && entry.name === 'daily-parlay-recommendations.json' && path.includes(date)) {
      matches.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
}

function safeErrorMessage(err) {
  const raw = err instanceof Error ? err.message : String(err);
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl ? raw.replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]') : raw;
}

async function sendStatus(target, embed) {
  return sendDiscordNativePayload(target, {
    username: 'Gana Hermes',
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [embed],
  });
}
