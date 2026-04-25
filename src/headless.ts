import { dispatchHeadless, type HeadlessCommandContext } from './commands.js';

export type { HeadlessCommandContext };

export async function runHeadless(argv: string[], context: HeadlessCommandContext): Promise<number> {
  const result = await dispatchHeadless(argv, context);
  return result.exitCode;
}
