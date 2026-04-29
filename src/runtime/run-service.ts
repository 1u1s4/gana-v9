import type { AgentConfig } from '../config.js';
import { runFixtureScoring, type FixtureScoringDependencies, type FixtureScoringResult, type RunFixtureScoringInput } from '../prediction/service.js';
import { runParlayBuild, type ParlayBuildDependencies, type ParlayBuildRunResult, type RunParlayBuildInput } from '../parlay/service.js';
import { runValidation, type RunValidationInput, type ValidationDependencies, type ValidationRunResult } from '../validation/service.js';
import type { RuntimeContext } from './context.js';
import {
  executeRunPipeline,
  exportRunArtifacts as exportPipelineArtifacts,
  type ExportRunInput,
  type ExportRunResult as PipelineExportRunResult,
  type RunPipelineDependencies,
  type RunPipelineInput,
  type RunPipelineResult as PipelineRunPipelineResult,
} from './pipeline.js';

export type RunPipelineResult = PipelineRunPipelineResult & {
  artifactPath?: string;
};

export type RunExportResult = PipelineExportRunResult & {
  artifactPath?: string;
  files?: string[];
};

export type RunServiceDependencies =
  RunPipelineDependencies
  & FixtureScoringDependencies
  & ParlayBuildDependencies
  & ValidationDependencies;

export async function runPipeline(
  config: AgentConfig,
  input: RunPipelineInput,
  runtime: RuntimeContext,
  deps: RunPipelineDependencies = {},
): Promise<RunPipelineResult> {
  const result = await executeRunPipeline(config, input, runtime, deps);
  return {
    ...result,
    artifactPath: result.artifactDir,
  };
}

export async function exportRunArtifacts(
  config: AgentConfig,
  input: ExportRunInput,
  runtime: RuntimeContext,
  deps: RunPipelineDependencies = {},
): Promise<RunExportResult> {
  const result = await exportPipelineArtifacts(config, input, runtime, deps);
  return {
    ...result,
    artifactPath: result.artifactDir,
    files: result.manifestPath ? [result.manifestPath, result.handoffPath].filter((item): item is string => Boolean(item)) : [],
  };
}

export async function runScore(
  config: AgentConfig,
  input: RunFixtureScoringInput,
  runtime: RuntimeContext,
  deps: FixtureScoringDependencies = {},
): Promise<FixtureScoringResult> {
  return runFixtureScoring(config, input, runtime, deps);
}

export async function buildParlay(
  config: AgentConfig,
  input: RunParlayBuildInput,
  runtime: RuntimeContext,
  deps: ParlayBuildDependencies = {},
): Promise<ParlayBuildRunResult> {
  return runParlayBuild(config, input, runtime, deps);
}

export async function validateRun(
  config: AgentConfig,
  input: RunValidationInput,
  runtime: RuntimeContext,
  deps: ValidationDependencies = {},
): Promise<ValidationRunResult> {
  return runValidation(config, input, runtime, deps);
}

export { runFixtureScoring, runParlayBuild, runValidation };
