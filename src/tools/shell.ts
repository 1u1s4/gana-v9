import { tool } from '@openrouter/agent/tool';
import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';
import { shellInputSchema, dangerousShellInputSchema } from './schemas.js';

const execFileAsync = promisify(execFile);

export const shellTool = tool({
  name: 'shell',
  description: 'Execute a safe allowlisted shell command and return output',
  inputSchema: shellInputSchema,
  execute: async (raw) => {
    const input = shellInputSchema.parse(raw);
    return executeShell(input.command, input.timeoutMs, input.cwd);
  },
});

export const dangerousShellTool = tool({
  name: 'dangerous_shell',
  description: 'Stage a non-allowlisted shell command. It is dry-run by default and always requires approval by policy.',
  inputSchema: dangerousShellInputSchema,
  execute: async (raw) => {
    const input = dangerousShellInputSchema.parse(raw);
    if (input.dryRun) return { executed: false, dryRun: true, command: input.command };
    return executeShell(input.command, input.timeoutMs, input.cwd);
  },
});

async function executeShell(command: string, timeoutMs: number, cwd?: string) {
  const shell = process.env.SHELL || '/bin/bash';
  try {
    const { stdout, stderr } = await execFileAsync(shell, ['-c', command], {
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      cwd: cwd ? resolve(process.cwd(), cwd) : process.cwd(),
      env: scopedEnv(),
    });
    const output = (stdout + stderr).trim();
    const lines = output.split('\n');
    const truncated = lines.length > 2000;
    return {
      output: truncated ? lines.slice(-2000).join('\n') : output,
      exitCode: 0,
      ...(truncated && { truncated: true }),
    };
  } catch (err: any) {
    if (err.killed) {
      return { output: err.stdout?.trim() ?? '', exitCode: null, timedOut: true };
    }
    return {
      output: ((err.stdout ?? '') + (err.stderr ?? '')).trim(),
      exitCode: err.code ?? 1,
    };
  }
}

function scopedEnv(): NodeJS.ProcessEnv {
  const allowed = ['HOME', 'PATH', 'SHELL', 'TMPDIR', 'USER', 'LANG', 'LC_ALL', 'CI', 'NODE_OPTIONS'];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []));
}
