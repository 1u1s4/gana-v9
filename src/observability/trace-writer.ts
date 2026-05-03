import { appendFileSync } from 'fs';
import { join } from 'path';
import type { AgentConfig } from '../config.js';
import { redactSecrets } from '../permissions/redaction.js';
import { createRunArtifactDir, stableStringify } from '../runtime/artifacts.js';
import type { RuntimeContext } from '../runtime/context.js';
import type { HarnessSpan } from './spans.js';

export function appendSpanJsonl(config: Pick<AgentConfig, 'artifactRoot'>, runtime: RuntimeContext, span: HarnessSpan): string {
  const runId = runtime.runId ?? span.runId;
  const dir = createRunArtifactDir(config, runId);
  const path = join(dir, 'spans.jsonl');
  appendFileSync(path, `${stableStringify(redactSecrets(span))}\n`);
  return path;
}
