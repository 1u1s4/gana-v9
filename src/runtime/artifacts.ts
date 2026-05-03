import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { AgentConfig } from '../config.js';
import { redactSecrets } from '../permissions/redaction.js';
import type { HarnessEvent } from './events.js';

const RUN_FILES = [
  'events.jsonl',
  'provider-snapshots.jsonl',
  'agent-events.jsonl',
  'audit-log.jsonl',
  'spans.jsonl',
];

export function ensureArtifactRoot(config: Pick<AgentConfig, 'artifactRoot'>): string {
  const root = resolve(config.artifactRoot);
  for (const dir of ['', 'sessions', 'runs', 'evidence-packs', 'handoffs']) {
    const target = dir ? join(root, dir) : root;
    if (!existsSync(target)) mkdirSync(target, { recursive: true });
  }
  return root;
}

export function createRunArtifactDir(config: Pick<AgentConfig, 'artifactRoot'>, runId: string): string {
  const root = ensureArtifactRoot(config);
  const dir = join(root, 'runs', safeName(runId));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const file of RUN_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) writeFileSync(path, '');
  }
  const handoffPath = join(dir, 'handoff.md');
  if (!existsSync(handoffPath)) writeFileSync(handoffPath, '');
  return dir;
}

export function writeRunJson(config: Pick<AgentConfig, 'artifactRoot'>, runId: string, run: unknown): string {
  const dir = createRunArtifactDir(config, runId);
  const path = join(dir, 'run.json');
  writeFileSync(path, `${stableStringify(redactSecrets(run))}\n`);
  return path;
}

export function appendEventJsonl(
  config: Pick<AgentConfig, 'artifactRoot'>,
  runId: string,
  event: HarnessEvent,
): string {
  const dir = createRunArtifactDir(config, runId);
  const path = join(dir, 'events.jsonl');
  appendFileSync(path, `${stableStringify(redactSecrets(event))}\n`);
  return path;
}

export function appendAgentEventJsonl(
  config: Pick<AgentConfig, 'artifactRoot'>,
  runId: string,
  event: HarnessEvent,
): string {
  const dir = createRunArtifactDir(config, runId);
  const path = join(dir, 'agent-events.jsonl');
  appendFileSync(path, `${stableStringify(redactSecrets(event))}\n`);
  return path;
}

export function writeArtifact(
  config: Pick<AgentConfig, 'artifactRoot'>,
  runId: string,
  name: string,
  payload: unknown,
): string {
  const dir = createRunArtifactDir(config, runId);
  const safe = safeName(name);
  const path = join(dir, safe);
  const redacted = redactSecrets(payload);
  const body = typeof redacted === 'string' ? redacted : stableStringify(redacted);
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  return path;
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(redactSecrets(payload))).digest('hex');
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => [key, sortValue(val)] as const);
  return Object.fromEntries(entries);
}

function safeName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '-');
}
