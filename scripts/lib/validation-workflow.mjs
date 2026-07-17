import { existsSync, mkdirSync, openSync, closeSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { runDailyStatsNotification } from '../../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-daily-stats.mjs';
import { sendDiscordNativePayload } from '../../.agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs';
import { resolveDiscordTargets } from '../../.agents/skills/discord-recommendation-notifier/scripts/discord-targets.mjs';
import { resolveCronCliCommand } from './cron-cli-runtime.mjs';
import {
  acquireValidationMutex,
  artifactPathFromOutput,
  assertExplicitCanonicalRecommendation,
  classifyValidationState,
  inspectJsonFile,
  inspectValidationMutex,
  notificationMessageIds,
  readJsonFile,
  releaseValidationMutex,
  resolveCanonicalPublishedRecommendation,
  sha256Json,
  validateArtifactForDate,
  writeJsonAtomic,
} from './validation-runtime.mjs';

export const VALIDATION_TIMEZONE = 'America/Guatemala';

export async function runValidationWorkflow(options, dependencies = {}) {
  const repoRoot = resolve(options.repoRoot);
  const artifactRoot = resolveArtifactRoot(repoRoot, options.artifactRoot);
  const date = requireIsoDate(options.date, 'date');
  const now = dependencies.now ? new Date(dependencies.now) : new Date();
  const env = {
    ...process.env,
    ...(options.env ?? {}),
    GANA_PROFILE: options.env?.GANA_PROFILE ?? process.env.GANA_PROFILE ?? 'full-permissions',
    GANA_APPROVAL_MODE: options.env?.GANA_APPROVAL_MODE ?? process.env.GANA_APPROVAL_MODE ?? 'auto-grant',
    AGENT_PROVIDER: options.env?.AGENT_PROVIDER ?? process.env.AGENT_PROVIDER ?? 'codex',
    GANA_TIMEZONE: options.env?.GANA_TIMEZONE ?? process.env.GANA_TIMEZONE ?? VALIDATION_TIMEZONE,
  };
  const targets = dependencies.resolveTargets
    ? dependencies.resolveTargets(options.gatewayTarget)
    : resolveDiscordTargets({ gatewayTarget: options.gatewayTarget });
  const runSlug = `validation-${date}`;
  const lockPath = resolve(artifactRoot, 'cron', 'locks', `${runSlug}.lock`);
  const logPath = resolve(artifactRoot, 'cron', `${runSlug}.log`);
  const preparedRoot = resolve(artifactRoot, 'cron', 'prepared');

  if (options.force) {
    return failure('unsafe-force-removed', date, lockPath, logPath, {
      message: '--force is disabled. Use --backfill with --test-label; the mutex is never bypassed.',
    });
  }
  if (options.backfill && !stringValue(options.testLabel)) {
    return failure('backfill-label-required', date, lockPath, logPath, {
      message: '--backfill requires --test-label so retrospective messages are visibly labelled.',
    });
  }
  if (options.notifyOnly && (!options.validationArtifact || !options.metricsArtifact)) {
    return failure('notify-only-artifacts-required', date, lockPath, logPath, {
      message: '--notify-only requires --validation-artifact and --metrics-artifact.',
    });
  }
  if (options.noPublication && !options.backfill) {
    return failure('no-publication-requires-backfill', date, lockPath, logPath, {
      message: '--no-publication is an explicit historical closeout and requires --backfill.',
    });
  }

  const canonical = resolveCanonicalPublishedRecommendation({ artifactRoot, date });
  if (options.noPublication) {
    if (canonical.reason === 'daily-lock-invalid') {
      return failure('daily-lock-invalid', date, lockPath, logPath, {
        message: 'Cannot close no-publication from a corrupt Daily lock.',
      });
    }
    if (canonical.ok || canonical.dailyLock?.status === 'published') {
      return failure('daily-was-published', date, lockPath, logPath, {
        message: 'Cannot close as no-publication because the Daily lock is published, even when its canonical artifact is missing or invalid.',
      });
    }
    const closeoutSafety = inspectNoPublicationSource(canonical, date);
    if (!closeoutSafety.ok) {
      return failure(closeoutSafety.reason, date, lockPath, logPath, {
        message: closeoutSafety.message,
      });
    }
  } else if (!canonical.ok) {
    if (options.dryRun) {
      return dryRunResult({
        date,
        lockPath,
        logPath,
        targets,
        canonical,
        existingState: inspectJsonFile(lockPath),
        decision: { run: false, reason: canonical.reason },
        action: 'blocked-source',
      });
    }
    return skipped(canonical.reason, date, lockPath, logPath, { canonical });
  }

  let recommendationArtifact;
  try {
    recommendationArtifact = options.noPublication
      ? undefined
      : assertExplicitCanonicalRecommendation(options.recommendationArtifact, canonical);
    if (recommendationArtifact) validateArtifactForDate(recommendationArtifact, date, 'recommendation');
  } catch (error) {
    return failure('recommendation-artifact-invalid', date, lockPath, logPath, { message: errorMessage(error) });
  }

  const previewExistingState = inspectJsonFile(lockPath);
  const previewExisting = previewExistingState.valid ? previewExistingState.value : undefined;
  const previewMutex = inspectValidationMutex(lockPath, {
    now,
    isProcessAlive: dependencies.isProcessAlive,
  });
  const previewDecision = previewExistingState.exists && !previewExistingState.valid
    ? { run: false, reason: 'validation-lock-invalid' }
    : classifyValidationState(previewExisting, { now, backfill: options.backfill });
  if (previewDecision.run && !previewMutex.wouldAcquire) {
    previewDecision.run = false;
    previewDecision.reason = previewMutex.reason;
  }
  const effectivePhase = options.noPublication ? 'no-publication' : options.notifyOnly ? 'notify' : previewDecision.phase;
  const previewArtifacts = {
    recommendation: recommendationArtifact,
    validation: options.validationArtifact ?? previewExisting?.artifacts?.validation,
    metrics: options.metricsArtifact ?? previewExisting?.artifacts?.metrics,
  };
  if (previewDecision.run && (effectivePhase === 'metrics' || effectivePhase === 'notify')) {
    try {
      if (!previewArtifacts.validation) throw new Error('validation artifact is required to resume this phase');
      previewArtifacts.validation = resolveArtifactPath(repoRoot, previewArtifacts.validation);
      validateArtifactForDate(previewArtifacts.validation, date, 'validation');
      if (effectivePhase === 'notify') {
        if (!previewArtifacts.metrics) throw new Error('metrics artifact is required to notify');
        previewArtifacts.metrics = resolveArtifactPath(repoRoot, previewArtifacts.metrics);
        validateArtifactForDate(previewArtifacts.metrics, date, 'metrics');
      }
    } catch (error) {
      previewDecision.run = false;
      previewDecision.reason = `resume-artifact-invalid:${errorMessage(error)}`;
    }
  }
  if (options.dryRun) {
    return dryRunResult({
      date,
      lockPath,
      logPath,
      targets,
      canonical,
      existingState: previewExistingState,
      mutex: previewMutex,
      decision: previewDecision,
      action: options.noPublication ? 'close-no-publication' : options.notifyOnly ? 'notify-only' : 'validate-metrics-notify',
      effectivePhase,
      recommendationArtifact,
      previewArtifacts,
      testLabel: stringValue(options.testLabel),
    });
  }

  if (previewExistingState.exists && !previewExistingState.valid) {
    return skipped('validation-lock-invalid', date, lockPath, logPath, { lockState: previewExistingState });
  }
  if (!previewDecision.run) {
    return skipped(previewDecision.reason, date, lockPath, logPath, {
      lock: previewExisting,
      mutex: previewMutex,
    });
  }

  mkdirSync(dirname(logPath), { recursive: true });

  const mutex = acquireValidationMutex(lockPath, {
    now,
    pid: dependencies.pid ?? process.pid,
    isProcessAlive: dependencies.isProcessAlive,
  });
  if (!mutex.acquired) return skipped(mutex.reason, date, lockPath, logPath, { mutex });

  const existingState = inspectJsonFile(lockPath);
  if (existingState.exists && !existingState.valid) {
    releaseValidationMutex(mutex);
    return skipped('validation-lock-invalid', date, lockPath, logPath, { lockState: existingState });
  }
  const existing = existingState.value;
  const decision = classifyValidationState(existing, { now, backfill: options.backfill });
  if (!decision.run) {
    releaseValidationMutex(mutex);
    return skipped(decision.reason, date, lockPath, logPath, { lock: existing });
  }

  const attempt = positiveInteger(existing?.attempt) + 1;
  const baseState = {
    schemaVersion: 2,
    flow: 'previous-day-validation',
    date,
    runSlug,
    attempt,
    mode: options.backfill ? 'backfill' : decision.mode,
    ownerPid: dependencies.pid ?? process.pid,
    discordTarget: targets.validation,
    testLabel: stringValue(options.testLabel),
    source: options.noPublication ? {
      dailyLock: canonical.lockPath,
      dailyStatus: canonical.dailyLock?.status ?? 'missing',
    } : {
      dailyLock: canonical.lockPath,
      dailyBatchId: canonical.dailyBatchId,
      recommendationArtifact,
    },
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    previous: summarizePriorState(existing),
  };
  let state = baseState;
  let publicationStarted = false;
  const commandRunner = dependencies.runCommand ?? runLoggedCommand;
  const prepareNotification = dependencies.prepareNotification ?? runDailyStatsNotification;
  const sendPayload = dependencies.sendPayload ?? sendDiscordNativePayload;

  try {
    if (options.noPublication) {
      const payload = buildNoPublicationPayload({
        date,
        testLabel: options.testLabel,
        sourceStatus: canonical.dailyLock?.status ?? 'missing',
      });
      const prepared = await prepareAndPublish({
        state,
        lockPath,
        preparedRoot,
        date,
        payloads: [{ kind: 'no-publication', payload }],
        target: targets.validation,
        sendPayload,
      });
      state = {
        ...prepared.state,
        status: 'not-applicable',
        reason: canonical.reason,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeJsonAtomic(lockPath, state);
      return completed(state, lockPath, logPath);
    }

    let phase = options.notifyOnly ? 'notify' : decision.phase;
    let validationArtifact = options.validationArtifact ?? existing?.artifacts?.validation;
    let metricsArtifact = options.metricsArtifact ?? existing?.artifacts?.metrics;

    if (phase === 'validation') {
      state = writeState(lockPath, state, {
        status: 'running-validation',
        phase: 'validation',
        artifacts: { recommendation: recommendationArtifact },
      });
      const validation = commandRunner({
        repoRoot,
        logPath,
        args: ['gana', 'validate', '--date', date, '--recommendation-artifact', recommendationArtifact],
        env,
      });
      validationArtifact = artifactPathFromOutput(validation.stdout);
      if (validationArtifact) {
        validationArtifact = resolveArtifactPath(repoRoot, validationArtifact);
        try {
          validateArtifactForDate(validationArtifact, date, 'validation');
        } catch (error) {
          return prePublicationFailure({
            state,
            lockPath,
            logPath,
            phase: 'validation',
            reason: `validation-artifact-invalid: ${errorMessage(error)}`,
            retryable: false,
            exits: { validation: validation.status },
          });
        }
      }
      if (validation.status !== 0 || !validationArtifact) {
        const validationPayload = validationArtifact ? readJsonFile(validationArtifact) : undefined;
        const retryable = !Array.isArray(validationPayload?.validations) || validationPayload.validations.length === 0;
        return prePublicationFailure({
          state,
          lockPath,
          logPath,
          phase: 'validation',
          reason: `validation-exit-${validation.status ?? 'unknown'}`,
          retryable,
          exits: { validation: validation.status },
          artifacts: { recommendation: recommendationArtifact, validation: validationArtifact },
        });
      }
      state = writeState(lockPath, state, {
        status: 'validation-complete',
        phase: 'metrics',
        validationExit: 0,
        artifacts: { recommendation: recommendationArtifact, validation: validationArtifact },
      });
      phase = 'metrics';
    } else if (validationArtifact) {
      validationArtifact = resolveArtifactPath(repoRoot, validationArtifact);
      validateArtifactForDate(validationArtifact, date, 'validation');
    }

    if (phase === 'metrics') {
      state = writeState(lockPath, state, {
        status: 'running-metrics',
        phase: 'metrics',
        artifacts: { recommendation: recommendationArtifact, validation: validationArtifact },
      });
      const metricsArgs = [
        'gana', 'metrics', 'daily', '--date', date,
        '--scope', options.scope ?? `daily-${date}`,
        '--recommendation-artifact', recommendationArtifact,
      ];
      if (options.persist !== undefined) metricsArgs.push('--persist', String(options.persist));
      const metrics = commandRunner({ repoRoot, logPath, args: metricsArgs, env });
      metricsArtifact = artifactPathFromOutput(metrics.stdout);
      if (metricsArtifact) {
        metricsArtifact = resolveArtifactPath(repoRoot, metricsArtifact);
        try {
          validateArtifactForDate(metricsArtifact, date, 'metrics');
        } catch (error) {
          return prePublicationFailure({
            state,
            lockPath,
            logPath,
            phase: 'metrics',
            reason: `metrics-artifact-invalid: ${errorMessage(error)}`,
            retryable: true,
            exits: { validation: 0, metrics: metrics.status },
            artifacts: { recommendation: recommendationArtifact, validation: validationArtifact },
          });
        }
      }
      if (metrics.status !== 0 || !metricsArtifact) {
        return prePublicationFailure({
          state,
          lockPath,
          logPath,
          phase: 'metrics',
          reason: `metrics-exit-${metrics.status ?? 'unknown'}`,
          retryable: true,
          exits: { validation: 0, metrics: metrics.status },
          artifacts: { recommendation: recommendationArtifact, validation: validationArtifact, metrics: metricsArtifact },
        });
      }
      state = writeState(lockPath, state, {
        status: 'metrics-complete',
        phase: 'notify',
        validationExit: 0,
        metricsExit: 0,
        artifacts: { recommendation: recommendationArtifact, validation: validationArtifact, metrics: metricsArtifact },
      });
      phase = 'notify';
    } else if (metricsArtifact) {
      metricsArtifact = resolveArtifactPath(repoRoot, metricsArtifact);
      validateArtifactForDate(metricsArtifact, date, 'metrics');
    }

    if (phase !== 'notify' || !validationArtifact || !metricsArtifact) {
      return prePublicationFailure({
        state,
        lockPath,
        logPath,
        phase,
        reason: 'workflow-resume-artifacts-incomplete',
        retryable: false,
        artifacts: { recommendation: recommendationArtifact, validation: validationArtifact, metrics: metricsArtifact },
      });
    }

    const notification = await prepareNotification({
      metricsArtifact,
      validationArtifact,
      recommendationArtifact,
      artifactRoot: resolve(artifactRoot, 'runs'),
      date,
      timezone: VALIDATION_TIMEZONE,
      transport: 'discord-native',
      gatewayTarget: targets.validation,
      dryRun: true,
      includeRecommendationMirror: options.includeRecommendationMirror !== false,
      maxRecommendations: 8,
      testLabel: stringValue(options.testLabel),
      username: 'Gana Hermes',
    });
    const payloads = [
      { kind: 'stats', payload: notification.payload },
      ...(notification.mirrorPayloads ?? []).map((payload, index) => ({ kind: `mirror-${index + 1}`, payload })),
    ];
    publicationStarted = true;
    const prepared = await prepareAndPublish({
      state: {
        ...state,
        validationExit: 0,
        metricsExit: 0,
        artifacts: { recommendation: recommendationArtifact, validation: validationArtifact, metrics: metricsArtifact },
      },
      lockPath,
      preparedRoot,
      date,
      payloads,
      target: targets.validation,
      sendPayload,
    });
    state = {
      ...prepared.state,
      status: 'published',
      phase: 'complete',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(lockPath, state);
    return completed(state, lockPath, logPath);
  } catch (error) {
    const latest = readJsonFile(lockPath) ?? state;
    if (publicationStarted || latest?.status === 'publishing') {
      state = {
        ...latest,
        status: 'publication-uncertain',
        phase: 'publication',
        reason: errorMessage(error),
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeJsonAtomic(lockPath, state);
      return failure('publication-uncertain', date, lockPath, logPath, { lock: state, message: errorMessage(error) });
    }
    return prePublicationFailure({
      state: latest,
      lockPath,
      logPath,
      phase: latest?.phase ?? 'unknown',
      reason: errorMessage(error),
      retryable: true,
      artifacts: latest?.artifacts,
    });
  } finally {
    releaseValidationMutex(mutex);
  }
}

async function prepareAndPublish({ state, lockPath, preparedRoot, date, payloads, target, sendPayload }) {
  mkdirSync(preparedRoot, { recursive: true });
  const entries = payloads.map(({ kind, payload }, index) => ({
    index,
    kind,
    status: 'reserved',
    payloadSha256: sha256Json(payload),
  }));
  const preparedPath = resolve(preparedRoot, `validation-${date}-attempt-${state.attempt}.json`);
  writeJsonAtomic(preparedPath, {
    schemaVersion: 1,
    date,
    target,
    createdAt: new Date().toISOString(),
    payloads,
  });
  let current = {
    ...state,
    status: 'publishing',
    phase: 'publication',
    preparedPath,
    payloadSetSha256: sha256Json(payloads),
    notifications: {
      target,
      entries,
      stats: undefined,
      mirrors: [],
      messageIds: [],
    },
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(lockPath, current);

  for (const entry of entries) {
    const sending = current.notifications.entries.map((item) => item.index === entry.index
      ? { ...item, status: 'sending', sendingAt: new Date().toISOString() }
      : item);
    current = {
      ...current,
      notifications: { ...current.notifications, entries: sending },
      updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(lockPath, current);
    const result = sendPayload(target, payloads[entry.index].payload);
    const ids = notificationMessageIds(result);
    if (ids.length !== 1) throw new Error(`Discord ${entry.kind} send returned no message id.`);
    const messageId = ids[0];
    const sent = current.notifications.entries.map((item) => item.index === entry.index
      ? { ...item, status: 'sent', messageId, sentAt: new Date().toISOString() }
      : item);
    current = {
      ...current,
      notifications: {
        ...current.notifications,
        entries: sent,
        stats: entry.kind === 'stats' || entry.kind === 'no-publication'
          ? messageId
          : current.notifications.stats,
        mirrors: entry.kind.startsWith('mirror-')
          ? [...current.notifications.mirrors, messageId]
          : current.notifications.mirrors,
        messageIds: [...current.notifications.messageIds, messageId],
      },
      updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(lockPath, current);
  }
  return { state: current, preparedPath };
}

function prePublicationFailure({ state, lockPath, logPath, phase, reason, retryable, exits = {}, artifacts }) {
  const now = new Date();
  const status = retryable ? 'retryable' : 'review-required';
  const lock = {
    ...state,
    status,
    phase,
    reason,
    validationExit: exits.validation ?? state?.validationExit ?? null,
    metricsExit: exits.metrics ?? state?.metricsExit ?? null,
    artifacts: artifacts ?? state?.artifacts,
    retryAfter: retryable ? new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString() : undefined,
    completedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  writeJsonAtomic(lockPath, lock);
  return failure(status, lock.date, lockPath, logPath, { lock, message: reason });
}

function runLoggedCommand({ repoRoot, logPath, args, env }) {
  const command = resolveCronCliCommand(args, { repoRoot });
  const started = `started ${new Date().toISOString()} ${command.join(' ')}`;
  appendLog(logPath, started);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) appendLog(logPath, result.stdout.trimEnd());
  if (result.stderr) appendLog(logPath, result.stderr.trimEnd());
  appendLog(logPath, `completed ${new Date().toISOString()} status=${result.status} signal=${result.signal ?? 'none'}`);
  if (result.error) appendLog(logPath, `error ${result.error.message}`);
  return result;
}

function appendLog(path, line) {
  if (!line) return;
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, `${line}\n`);
  } finally {
    closeSync(fd);
  }
}

function writeState(path, state, patch) {
  const next = { ...state, ...patch, updatedAt: new Date().toISOString() };
  writeJsonAtomic(path, next);
  return next;
}

function completed(lock, lockPath, logPath) {
  return {
    ok: true,
    status: lock.status,
    reason: lock.reason ?? 'validation-publication-completed',
    date: lock.date,
    lockPath,
    logPath,
    lock,
    exitCode: 0,
  };
}

function dryRunResult({
  date,
  lockPath,
  logPath,
  targets,
  canonical,
  existingState,
  decision,
  action,
  effectivePhase,
  mutex,
  recommendationArtifact,
  previewArtifacts,
  testLabel,
}) {
  const source = canonical.ok ? {
    status: 'published',
    dailyLock: canonical.lockPath,
    dailyBatchId: canonical.dailyBatchId,
    recommendationArtifact: recommendationArtifact ?? canonical.recommendationArtifact,
  } : {
    status: canonical.dailyLock?.status ?? 'missing',
    dailyLock: canonical.lockPath,
    reason: canonical.reason,
  };
  return {
    ok: true,
    status: 'dry-run',
    reason: decision.run ? `would-${action}` : `would-skip:${decision.reason}`,
    date,
    lockPath,
    logPath,
    dryRun: true,
    plan: {
      action,
      run: Boolean(decision.run),
      mode: decision.mode,
      phase: effectivePhase ?? decision.phase,
      testLabel,
      discordTarget: targets.validation,
      source,
      artifacts: previewArtifacts,
      existing: {
        exists: Boolean(existingState?.exists),
        valid: Boolean(existingState?.valid),
        error: existingState?.error,
        ...summarizePriorState(existingState?.value),
      },
      mutex,
      wouldCloseNoPublication: action === 'close-no-publication' && Boolean(decision.run),
      sideEffects: {
        commands: 0,
        databaseWrites: 0,
        apiRequests: 0,
        discordSends: 0,
        lockWrites: 0,
        mutexWrites: 0,
      },
    },
    exitCode: 0,
  };
}

function skipped(reason, date, lockPath, logPath, details = {}) {
  return { ok: true, status: 'skipped', reason, date, lockPath, logPath, ...details, exitCode: 0 };
}

function failure(reason, date, lockPath, logPath, details = {}) {
  return { ok: false, status: reason === 'publication-uncertain' ? reason : 'review-required', reason, date, lockPath, logPath, ...details, exitCode: 1 };
}

function buildNoPublicationPayload({ date, testLabel, sourceStatus }) {
  return {
    username: 'Gana Hermes',
    allowed_mentions: { parse: [] },
    content: '',
    embeds: [{
      title: 'Gana v9 - Validacion diaria',
      description: [
        testLabel ? `Nota: ${testLabel}` : undefined,
        `Fecha: ${date} (${VALIDATION_TIMEZONE})`,
        'Estado: no aplica — no se publicó un Daily para esta fecha.',
        `Daily lock: ${sourceStatus}.`,
        'No se validan ni se espejan picks que no fueron publicados.',
      ].filter(Boolean).join('\n'),
      color: 0x828282,
      footer: { text: 'Gana Hermes · cierre histórico explícito' },
      timestamp: new Date().toISOString(),
    }],
  };
}

function inspectNoPublicationSource(canonical, date) {
  if (canonical.reason === 'daily-lock-missing') return { ok: true };
  const dailyLock = canonical.dailyLock;
  const status = dailyLock?.status;
  if (!['retryable', 'failed', 'blocked'].includes(status)) {
    return {
      ok: false,
      reason: `daily-status-not-closeable:${status ?? 'unknown'}`,
      message: `Cannot close no-publication from Daily status ${status ?? 'unknown'}.`,
    };
  }
  if (dailyLock.date !== date) {
    return {
      ok: false,
      reason: 'daily-lock-date-mismatch',
      message: `Cannot close no-publication because the Daily lock date is ${dailyLock.date ?? 'missing'}, expected ${date}.`,
    };
  }
  const messageIds = [
    ...(Array.isArray(dailyLock.messageIds) ? dailyLock.messageIds : []),
    ...(Array.isArray(dailyLock.discordMessageIds) ? dailyLock.discordMessageIds : []),
    ...(Array.isArray(dailyLock.notifications?.messageIds) ? dailyLock.notifications.messageIds : []),
  ].filter(Boolean);
  if (messageIds.length > 0 || ['published', 'already-published'].includes(dailyLock.publication?.status)) {
    return {
      ok: false,
      reason: 'daily-publication-evidence-present',
      message: 'Cannot close no-publication because the Daily lock contains publication evidence.',
    };
  }
  return { ok: true };
}

function summarizePriorState(lock) {
  if (!lock) return undefined;
  return {
    schemaVersion: lock.schemaVersion,
    date: lock.date,
    status: lock.status,
    phase: lock.phase,
    reason: lock.reason,
    attempt: lock.attempt,
    validationExit: lock.validationExit,
    metricsExit: lock.metricsExit,
    retryAfter: lock.retryAfter,
    completedAt: lock.completedAt,
    source: lock.source,
    artifacts: lock.artifacts,
    notifications: lock.notifications,
  };
}

function resolveArtifactRoot(repoRoot, value) {
  const selected = stringValue(value) ?? '.artifacts/gana-v9';
  return isAbsolute(selected) ? selected : resolve(repoRoot, selected);
}

function resolveArtifactPath(repoRoot, value) {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function requireIsoDate(value, name) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} must be YYYY-MM-DD.`);
  const parsed = new Date(`${text}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${name} must be a valid calendar date in YYYY-MM-DD.`);
  }
  return text;
}

function positiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
