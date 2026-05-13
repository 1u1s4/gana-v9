import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import type { AgentConfig } from '../config.js';
import type { RuntimeContext } from '../runtime/context.js';
import { runDailyMetrics } from '../metrics/daily.js';

export function createDailyMetricsTool(context: { config: AgentConfig; runtime?: RuntimeContext }) {
  return tool({
    name: 'daily_metrics',
    description: 'Compute and optionally persist daily analytical metrics for predictions and parlays.',
    inputSchema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Last local date to include, formatted YYYY-MM-DD.'),
      days: z.number().int().min(1).max(90).default(1).describe('Rolling day count ending at date.'),
      persist: z.boolean().default(true).describe('Whether to upsert snapshots into daily_metrics.'),
      scope: z.string().min(1).max(80).default('all').describe('Metrics scope label.'),
    }),
    execute: async ({ date, days, persist, scope }) => runDailyMetrics(context.config, {
      date,
      days,
      persist,
      scope,
    }, context.runtime ?? {}),
  });
}
