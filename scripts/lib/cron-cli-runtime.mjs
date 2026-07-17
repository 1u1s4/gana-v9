import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function resolveCronCliCommand(args, { repoRoot } = {}) {
  if (args[0] !== 'gana') return args;
  if (!repoRoot) throw new Error('resolveCronCliCommand requires repoRoot.');

  const compiledCli = resolve(repoRoot, 'dist', 'cli.js');
  const sourceRoot = resolve(repoRoot, 'src');
  if (isCompiledCliCurrent(compiledCli, sourceRoot)) {
    return ['node', compiledCli, ...args.slice(1)];
  }

  return ['node', '--import', 'tsx', 'src/cli.ts', ...args.slice(1)];
}

export function isCompiledCliCurrent(compiledCli, sourceRoot) {
  if (!existsSync(compiledCli)) return false;
  try {
    return statSync(compiledCli).mtimeMs >= newestFileMtimeMs(sourceRoot);
  } catch {
    return false;
  }
}

function newestFileMtimeMs(root) {
  let newest = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestFileMtimeMs(path));
    } else if (entry.isFile()) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}
