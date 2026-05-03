import { tool } from '@openrouter/agent/tool';
import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { evaluateFilesystemWrite } from '../permissions/filesystem-policy.js';
import { fileEditInputSchema } from './schemas.js';

export const fileEditTool = tool({
  name: 'file_edit',
  description: 'Apply search-and-replace edits to a repo-relative file',
  inputSchema: fileEditInputSchema,
  execute: async (raw) => {
    const input = fileEditInputSchema.parse(raw);
    const policy = evaluateFilesystemWrite({
      path: input.path,
      cwd: process.cwd(),
    });
    if (!policy.allowed || !policy.absolutePath) return { error: policy.reason, blocked: true };
    const path = resolve(policy.absolutePath);
    try {
      let content = await readFile(path, 'utf-8');
      const original = content;
      const actualSha256 = sha256(original);
      if (input.expectedSha256 && input.expectedSha256 !== actualSha256) {
        return { error: 'expectedSha256 does not match current file content', actualSha256 };
      }

      const edits = input.edits ?? [{ old_text: input.search ?? '', new_text: input.replace ?? '' }];
      for (const edit of edits) {
        const count = content.split(edit.old_text).length - 1;
        if (count === 0) return { error: `Text not found: "${edit.old_text.slice(0, 50)}"` };
        if (count > 1) return { error: `Ambiguous match (${count} occurrences): "${edit.old_text.slice(0, 50)}"` };
        content = content.replace(edit.old_text, edit.new_text);
      }

      if (input.dryRun) {
        return { edited: false, dryRun: true, path: input.path, diff: buildDiff(input.path, original, content), expectedSha256: actualSha256 };
      }
      await writeFile(path, content, 'utf-8');

      return { edited: true, path: input.path, diff: buildDiff(input.path, original, content), sha256: sha256(content) };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});

function buildDiff(path: string, original: string, content: string): string {
  const oldLines = original.split('\n');
  const newLines = content.split('\n');
  const diff = [`--- ${path}`, `+++ ${path}`];
  let i = 0;
  while (i < oldLines.length || i < newLines.length) {
    if (oldLines[i] !== newLines[i]) {
      if (i < oldLines.length) diff.push(`-${oldLines[i]}`);
      if (i < newLines.length) diff.push(`+${newLines[i]}`);
    }
    i++;
  }
  return diff.join('\n');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
