import { tool } from '@openrouter/agent/tool';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { evaluateFilesystemWrite } from '../permissions/filesystem-policy.js';
import { fileWriteInputSchema } from './schemas.js';

export const fileWriteTool = tool({
  name: 'file_write',
  description: 'Write content to a repo-relative file, creating parent directories if needed',
  inputSchema: fileWriteInputSchema,
  execute: async (raw) => {
    const input = fileWriteInputSchema.parse(raw);
    const policy = evaluateFilesystemWrite({
      path: input.path,
      cwd: process.cwd(),
    });
    if (!policy.allowed || !policy.absolutePath) return { error: policy.reason, blocked: true };
    if (input.dryRun) {
      return { written: false, dryRun: true, path: input.path, bytes: Buffer.byteLength(input.content, 'utf-8') };
    }
    try {
      const path = resolve(policy.absolutePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, input.content, 'utf-8');
      return { written: true, path: input.path };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});
