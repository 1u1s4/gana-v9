#!/usr/bin/env node
import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compactPath, emitCronRichSummary, renderCronRichSummary } from './gana-telegram-rich-output.mjs';
import { runValidationWorkflow, VALIDATION_TIMEZONE } from './lib/validation-workflow.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);

export function parseValidationArgs(argv) {
  const parsed = { includeRecommendationMirror: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') parsed.date = requireValue(argv, ++index, arg);
    else if (arg === '--gateway-target') parsed.gatewayTarget = requireValue(argv, ++index, arg);
    else if (arg === '--scope') parsed.scope = requireValue(argv, ++index, arg);
    else if (arg === '--recommendation-artifact') parsed.recommendationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--validation-artifact') parsed.validationArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--metrics-artifact') parsed.metricsArtifact = requireValue(argv, ++index, arg);
    else if (arg === '--persist') parsed.persist = requireValue(argv, ++index, arg);
    else if (arg === '--test-label') parsed.testLabel = requireValue(argv, ++index, arg);
    else if (arg === '--backfill') parsed.backfill = true;
    else if (arg === '--notify-only') parsed.notifyOnly = true;
    else if (arg === '--no-publication') parsed.noPublication = true;
    else if (arg === '--no-recommendation-mirror') parsed.includeRecommendationMirror = false;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const requestedDryRun = argv.includes('--dry-run');
  if (process.env.GANA_MAINTENANCE_PAUSED === 'true') {
    emitSummary({
      title: 'Gana v9 · Validación pausada',
      status: 'skipped',
      timezone: VALIDATION_TIMEZONE,
      bullets: ['GANA_MAINTENANCE_PAUSED=true'],
    }, { localOnly: requestedDryRun });
    return 0;
  }

  let args;
  try {
    args = parseValidationArgs(argv);
  } catch (error) {
    emitError(error, { localOnly: requestedDryRun });
    return 1;
  }
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const date = args.date ?? guatemalaDate(-1);
  const result = await runValidationWorkflow({
    ...args,
    date,
    repoRoot: REPO_ROOT,
    artifactRoot: process.env.GANA_ARTIFACT_ROOT,
    env: process.env,
  });
  const ids = result.lock?.notifications?.messageIds ?? [];
  const title = result.status === 'published'
    ? 'Gana v9 · Validación publicada'
    : result.status === 'not-applicable'
      ? 'Gana v9 · Validación cerrada sin publicación'
      : result.status === 'dry-run'
        ? 'Gana v9 · Previsualización de validación'
      : result.status === 'skipped'
        ? 'Gana v9 · Validación omitida'
        : 'Gana v9 · Validación requiere revisión';
  emitSummary({
    title,
    status: result.ok ? (result.status === 'skipped' ? 'skipped' : 'ok') : 'warning',
    date,
    timezone: VALIDATION_TIMEZONE,
    bullets: [
      `Estado: ${result.status}`,
      `Motivo: ${result.reason}`,
      Number.isFinite(result.lock?.validationExit) ? `Validate exit: ${result.lock.validationExit}` : undefined,
      Number.isFinite(result.lock?.metricsExit) ? `Metrics exit: ${result.lock.metricsExit}` : undefined,
      result.lock?.discordTarget ? `Discord target: ${result.lock.discordTarget}` : undefined,
      ids.length ? `Discord IDs: ${ids.join(', ')}` : undefined,
      result.lock?.source?.dailyBatchId ? `Daily batch: ${result.lock.source.dailyBatchId}` : undefined,
      result.plan?.action ? `Acción: ${result.plan.action}` : undefined,
      result.plan ? `Ejecutaría: ${result.plan.run ? 'sí' : 'no'}` : undefined,
      result.plan?.mode ? `Modo: ${result.plan.mode}` : undefined,
      result.plan?.phase ? `Fase: ${result.plan.phase}` : undefined,
      result.plan?.wouldCloseNoPublication ? 'Cierre sin publicación: sí' : undefined,
      result.plan?.discordTarget ? `Discord target: ${result.plan.discordTarget}` : undefined,
      result.plan?.source?.status ? `Fuente Daily: ${result.plan.source.status}${result.plan.source.reason ? ` · ${result.plan.source.reason}` : ''}` : undefined,
      result.plan?.source?.dailyBatchId ? `Daily batch: ${result.plan.source.dailyBatchId}` : undefined,
      result.plan?.source?.recommendationArtifact ? `Recommendations: ${compactPath(result.plan.source.recommendationArtifact)}` : undefined,
      result.plan?.artifacts?.validation ? `Validations: ${compactPath(result.plan.artifacts.validation)}` : undefined,
      result.plan?.artifacts?.metrics ? `Metrics: ${compactPath(result.plan.artifacts.metrics)}` : undefined,
      result.plan?.existing ? `Lock existente: ${result.plan.existing.exists ? `${result.plan.existing.valid ? result.plan.existing.status ?? 'válido' : 'inválido'}${result.plan.existing.phase ? ` · fase ${result.plan.existing.phase}` : ''}${result.plan.existing.reason ? ` · ${result.plan.existing.reason}` : ''}` : 'ausente'}` : undefined,
      result.plan?.mutex ? `Mutex: ${result.plan.mutex.wouldAcquire ? (result.plan.mutex.wouldReclaim ? 'reclamaría stale' : 'libre') : `bloqueado · ${result.plan.mutex.reason}`}` : undefined,
      result.plan?.sideEffects ? `Efectos ejecutados: ${JSON.stringify(result.plan.sideEffects)}` : undefined,
      result.lock?.artifacts?.recommendation ? `Recommendations: ${compactPath(result.lock.artifacts.recommendation)}` : undefined,
      result.lock?.artifacts?.validation ? `Validations: ${compactPath(result.lock.artifacts.validation)}` : undefined,
      result.lock?.artifacts?.metrics ? `Metrics: ${compactPath(result.lock.artifacts.metrics)}` : undefined,
      `Lock: ${compactPath(result.lockPath)}`,
      `Log: ${compactPath(result.logPath)}`,
    ].filter(Boolean),
    footer: result.status === 'publication-uncertain'
      ? '⚠️ Entrega incierta: no reintentar automáticamente.'
      : '🛡️ Resultado histórico etiquetado; sin ejecución monetaria.',
  }, { localOnly: requestedDryRun || result.status === 'dry-run' });
  return result.exitCode;
}

function usage() {
  return [
    'Usage:',
    '  gana-validate-metrics-and-notify.mjs --date YYYY-MM-DD [--recommendation-artifact PATH]',
    '  gana-validate-metrics-and-notify.mjs --date YYYY-MM-DD --backfill --test-label TEXT',
    '  gana-validate-metrics-and-notify.mjs --date YYYY-MM-DD --backfill --notify-only --test-label TEXT --validation-artifact PATH --metrics-artifact PATH',
    '  gana-validate-metrics-and-notify.mjs --date YYYY-MM-DD --backfill --no-publication --test-label TEXT',
    '  Append --dry-run to inspect the exact action without commands, DB/API/Discord, locks, or mutexes.',
    '',
    'Safety:',
    '  The recommendation artifact must match the published Daily batch.',
    '  --force is rejected; backfills keep the mutex and require a visible label.',
    '  Partial Discord delivery becomes publication-uncertain and is never retried automatically.',
  ].join('\n');
}

function emitError(error, { localOnly = false } = {}) {
  emitSummary({
    title: 'Gana v9 · Error de validación',
    status: 'warning',
    timezone: VALIDATION_TIMEZONE,
    bullets: [error instanceof Error ? error.message : String(error)],
  }, { localOnly });
}

function emitSummary(input, { localOnly = false } = {}) {
  if (localOnly) {
    console.log(renderCronRichSummary(input));
    return { delivered: false, localOnly: true };
  }
  return emitCronRichSummary(input);
}

function guatemalaDate(offsetDays) {
  const base = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VALIDATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    emitError(error, { localOnly: process.argv.includes('--dry-run') });
    process.exitCode = 1;
  });
}
