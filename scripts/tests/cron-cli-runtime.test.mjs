import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveCronCliCommand } from '../lib/cron-cli-runtime.mjs';

describe('cron CLI runtime selection', () => {
  it('uses TypeScript source when the compiled CLI is older than source', () => {
    const repoRoot = fixtureRepo({ sourceMtime: 200, compiledMtime: 100 });

    assert.deepEqual(
      resolveCronCliCommand(['gana', 'validate', '--date', '2026-07-15'], { repoRoot }),
      ['node', '--import', 'tsx', 'src/cli.ts', 'validate', '--date', '2026-07-15'],
    );
  });

  it('uses a current compiled CLI and leaves non-gana commands unchanged', () => {
    const repoRoot = fixtureRepo({ sourceMtime: 100, compiledMtime: 200 });
    const ganaArgs = ['gana', 'metrics', 'daily', '--date', '2026-07-15'];
    const nodeArgs = ['node', 'notifier.mjs'];

    assert.deepEqual(
      resolveCronCliCommand(ganaArgs, { repoRoot }),
      ['node', join(repoRoot, 'dist', 'cli.js'), ...ganaArgs.slice(1)],
    );
    assert.equal(resolveCronCliCommand(nodeArgs, { repoRoot }), nodeArgs);
  });
});

function fixtureRepo({ sourceMtime, compiledMtime }) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'gana-cron-cli-runtime-'));
  const sourcePath = join(repoRoot, 'src', 'recommendations', 'artifact.ts');
  const compiledPath = join(repoRoot, 'dist', 'cli.js');
  mkdirSync(join(repoRoot, 'src', 'recommendations'), { recursive: true });
  mkdirSync(join(repoRoot, 'dist'), { recursive: true });
  writeFileSync(sourcePath, 'export {};\n');
  writeFileSync(compiledPath, 'export {};\n');
  const sourceDate = new Date(sourceMtime * 1_000);
  const compiledDate = new Date(compiledMtime * 1_000);
  utimesSync(sourcePath, sourceDate, sourceDate);
  utimesSync(compiledPath, compiledDate, compiledDate);
  return repoRoot;
}
