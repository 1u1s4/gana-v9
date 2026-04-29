import { serverTool } from '@openrouter/agent';
import type { AgentConfig } from '../config.js';
import { auditActionResult, auditPermissionEvaluation } from '../permissions/approvals.js';
import { evaluateAction } from '../permissions/policy.js';
import { redactSecrets } from '../permissions/redaction.js';
import type { RuntimeContext } from '../runtime/context.js';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { shellTool } from './shell.js';

export const tools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,

  serverTool({ type: 'openrouter:web_search' }),
  serverTool({ type: 'openrouter:datetime', parameters: { timezone: 'UTC' } }),
];

type ClientTool = {
  function: {
    name: string;
    execute?: (args: any, context?: any) => any;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export interface ToolPolicyContext {
  config: Pick<AgentConfig, 'profile' | 'approvalMode'>;
  runtime?: RuntimeContext;
}

const LOCAL_TOOLS = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,
] as const;

const SERVER_TOOLS = [
  serverTool({ type: 'openrouter:web_search' }),
  serverTool({ type: 'openrouter:datetime', parameters: { timezone: 'UTC' } }),
] as const;

export function createTools(context: ToolPolicyContext): any[] {
  return [
    ...LOCAL_TOOLS.map((item) => guardTool(item as unknown as ClientTool, context)),
    ...SERVER_TOOLS,
  ];
}

function guardTool(toolDef: ClientTool, context: ToolPolicyContext): ClientTool {
  const name = toolDef.function.name;
  const execute = toolDef.function.execute;
  if (typeof execute !== 'function') return toolDef;

  return {
    ...toolDef,
    function: {
      ...toolDef.function,
      execute: async (args: any, toolContext?: any) => {
        const evaluation = evaluateAction(name, args, {
          config: context.config,
          runtime: context.runtime,
          cwd: process.cwd(),
        });
        auditPermissionEvaluation(context.runtime, name, args, evaluation);

        if (evaluation.decision === 'block' || evaluation.decision === 'require_approval') {
          auditActionResult(context.runtime, {
            actionId: evaluation.actionId,
            action: name,
            args,
            decision: evaluation.decision,
            approvalKind: evaluation.approvalKind,
            reason: evaluation.reason,
            result: { blocked: true, reason: evaluation.reason },
          });
          return {
            error: evaluation.reason,
            blocked: true,
            decision: evaluation.decision,
          };
        }

        try {
          const result = await execute(args, toolContext);
          auditActionResult(context.runtime, {
            actionId: evaluation.actionId,
            action: name,
            args,
            result: summarizeResult(result),
            decision: evaluation.decision,
            approvalKind: evaluation.approvalKind,
            reason: evaluation.reason,
          });
          return result;
        } catch (err) {
          auditActionResult(context.runtime, {
            actionId: evaluation.actionId,
            action: name,
            args,
            error: err instanceof Error ? err.message : err,
            decision: evaluation.decision,
            approvalKind: evaluation.approvalKind,
            reason: evaluation.reason,
          });
          throw err;
        }
      },
    },
  };
}

function summarizeResult(result: unknown): unknown {
  const redacted = redactSecrets(result);
  if (typeof redacted === 'string') return redacted.slice(0, 500);
  return redacted;
}
