/**
 * Execution module type definitions
 */

import type { Language } from '../../models/types.js';
import type { ProviderType } from '../../providers/index.js';

/** Result of workflow execution */
export interface WorkflowExecutionResult {
  success: boolean;
  reason?: string;
}

/** Options for workflow execution */
export interface WorkflowExecutionOptions {
  /** Header prefix for display */
  headerPrefix?: string;
  /** Project root directory (where .takt/ lives). */
  projectCwd: string;
  /** Language for instruction metadata */
  language?: Language;
  provider?: ProviderType;
  model?: string;
}

export interface TaskExecutionOptions {
  provider?: ProviderType;
  model?: string;
}

export interface ExecuteTaskOptions {
  /** Task content */
  task: string;
  /** Working directory (may be a clone path) */
  cwd: string;
  /** Workflow name or path (auto-detected by isWorkflowPath) */
  workflowIdentifier: string;
  /** Project root (where .takt/ lives) */
  projectCwd: string;
  /** Agent provider/model overrides */
  agentOverrides?: TaskExecutionOptions;
}

export interface PipelineExecutionOptions {
  /** GitHub issue number */
  issueNumber?: number;
  /** Task content (alternative to issue) */
  task?: string;
  /** Workflow name or path to workflow file */
  workflow: string;
  /** Branch name (auto-generated if omitted) */
  branch?: string;
  /** Whether to create a PR after successful execution */
  autoPr: boolean;
  /** Repository in owner/repo format */
  repo?: string;
  /** Skip branch creation, commit, and push (workflow-only execution) */
  skipGit?: boolean;
  /** Working directory */
  cwd: string;
  provider?: ProviderType;
  model?: string;
}

export interface WorktreeConfirmationResult {
  execCwd: string;
  isWorktree: boolean;
  branch?: string;
}

export interface SelectAndExecuteOptions {
  autoPr?: boolean;
  repo?: string;
  workflow?: string;
  createWorktree?: boolean | undefined;
}
