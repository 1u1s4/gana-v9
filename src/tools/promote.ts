import { tool } from '@openrouter/agent/tool';
import { artifactPromoteInputSchema, predictionPromoteInputSchema } from './schemas.js';

export const artifactPromoteTool = tool({
  name: 'artifact_promote',
  description: 'Promote an analytical artifact for handoff; never performs monetary actions',
  inputSchema: artifactPromoteInputSchema,
  execute: async (raw) => {
    const input = artifactPromoteInputSchema.parse(raw);
    return {
      promoted: !input.dryRun,
      dryRun: input.dryRun,
      artifactId: input.artifactId,
      runId: input.runId,
      target: input.target,
      analyticalOnly: true,
      monetaryActions: 'forbidden-by-policy',
    };
  },
});

export const predictionPromoteTool = tool({
  name: 'prediction_promote',
  description: 'Promote an analytical prediction candidate; never performs monetary actions',
  inputSchema: predictionPromoteInputSchema,
  execute: async (raw) => {
    const input = predictionPromoteInputSchema.parse(raw);
    return {
      promoted: !input.dryRun,
      dryRun: input.dryRun,
      predictionId: input.predictionId,
      runId: input.runId,
      analyticalOnly: true,
      monetaryActions: 'forbidden-by-policy',
    };
  },
});
