import type { AgentConfig } from '../config.js';
import { auditActionResult, auditPermissionEvaluation } from '../permissions/approvals.js';
import { requestApproval } from '../permissions/approval-service.js';
import { evaluateAction } from '../permissions/policy.js';
import { redactSecrets } from '../permissions/redaction.js';
import { getToolMetadata } from '../permissions/tool-metadata.js';
import { finishSpan, hashUnknown, startSpan, type HarnessSpanKind, type HarnessSpanStatus } from '../observability/spans.js';
import { appendSpanJsonl } from '../observability/trace-writer.js';
import type { RuntimeContext } from '../runtime/context.js';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { dangerousShellTool, shellTool } from './shell.js';
import { artifactPromoteTool, predictionPromoteTool } from './promote.js';
import { ToolRegistry, riskFromMetadata } from './registry.js';
import { createBrowserUseTool } from './browser.js';

export const tools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,
  dangerousShellTool,
  artifactPromoteTool,
  predictionPromoteTool,
  createBrowserUseTool({ artifactRoot: '.artifacts/gana-v9', browserUse: {
    apiKey: '',
    baseUrl: 'https://api.browser-use.com',
    enabled: true,
    maxTasksPerMonth: 10,
    maxConcurrentSessions: 3,
    timeoutMs: 180_000,
  } }),
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
  config: Pick<AgentConfig, 'profile' | 'approvalMode' | 'artifactRoot' | 'browserUse'>;
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
  dangerousShellTool,
  artifactPromoteTool,
  predictionPromoteTool,
] as const;

export function createTools(context: ToolPolicyContext): any[] {
  return createToolRegistry(context).listTools().map((item) => guardTool(item.agentTool as ClientTool, context));
}

export function createToolRegistry(context: ToolPolicyContext): ToolRegistry {
  const registry = new ToolRegistry();
  for (const item of [...LOCAL_TOOLS, createBrowserUseTool(context.config)] as const) {
    const toolDef = item as unknown as ClientTool & { function: { inputSchema?: any } };
    const name = toolDef.function.name;
    registry.registerTool({
      name,
      origin: 'local',
      schema: toolDef.function.inputSchema,
      metadata: getToolMetadata(name),
      policy: evaluateAction,
      redaction: redactSecrets,
      audit: () => undefined,
      timeoutMs: name === 'shell' || name === 'dangerous_shell' ? 120_000 : 30_000,
      risk: riskFromMetadata(name),
      executor: toolDef.function.execute ?? (() => undefined),
      agentTool: toolDef,
    });
  }
  return registry;
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
        writeToolSpan(
          context,
          'policy.evaluate',
          'policy',
          policySpanStatus(evaluation.decision),
          { tool: name, decision: evaluation.decision, reason: evaluation.reason },
          args,
          { decision: evaluation.decision, reason: evaluation.reason },
        );

        if (evaluation.decision === 'block' || evaluation.decision === 'require_approval') {
          const approval = evaluation.decision === 'require_approval' && context.runtime
            ? requestApproval(context.runtime, {
              toolCallId: String(toolContext?.toolCallId ?? toolContext?.callId ?? evaluation.actionId),
              toolName: name,
              args,
              risk: evaluation.destructive ? 'high' : evaluation.metadata.runsShell || evaluation.metadata.mutatesFilesystem ? 'medium' : 'low',
              reason: evaluation.reason,
            })
            : undefined;
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
            approvalId: approval?.approvalId,
            toolCallId: approval?.toolCallId,
          };
        }

        const startedAt = Date.now();
        try {
          const result = await execute(args, toolContext);
          const redactedResult = redactSecrets(result);
          auditActionResult(context.runtime, {
            actionId: evaluation.actionId,
            action: name,
            args,
            result: summarizeResult(redactedResult),
            decision: evaluation.decision,
            approvalKind: evaluation.approvalKind,
            reason: evaluation.reason,
          });
          writeToolSpan(
            context,
            `tool.execute.${name}`,
            'tool',
            'ok',
            { tool: name, durationMs: Date.now() - startedAt },
            args,
            redactedResult,
          );
          return redactedResult;
        } catch (err) {
          const error = err instanceof Error ? err.message : err;
          auditActionResult(context.runtime, {
            actionId: evaluation.actionId,
            action: name,
            args,
            error,
            decision: evaluation.decision,
            approvalKind: evaluation.approvalKind,
            reason: evaluation.reason,
          });
          writeToolSpan(
            context,
            `tool.execute.${name}`,
            'tool',
            'error',
            { tool: name, durationMs: Date.now() - startedAt, error },
            args,
            { error },
          );
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

function policySpanStatus(decision: string): HarnessSpanStatus {
  if (decision === 'block') return 'blocked';
  if (decision === 'require_approval') return 'pending_approval';
  return 'ok';
}

function writeToolSpan(
  context: ToolPolicyContext,
  name: string,
  kind: HarnessSpanKind,
  status: HarnessSpanStatus,
  metadata: unknown,
  input?: unknown,
  output?: unknown,
): void {
  if (!context.runtime?.runId) return;
  try {
    const span = startSpan({
      traceId: context.runtime.traceId ?? `trace_${context.runtime.runId}`,
      runId: context.runtime.runId,
      taskId: context.runtime.taskId,
      name,
      kind,
      status,
      inputHash: input === undefined ? undefined : hashUnknown(input),
      metadataRedacted: metadata,
    });
    appendSpanJsonl(context.config, context.runtime, finishSpan(span, status, output));
  } catch {
    // Observability must not change tool behavior.
  }
}
