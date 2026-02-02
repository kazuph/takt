/**
 * Task execution orchestration.
 *
 * Coordinates workflow selection, worktree creation, task execution,
 * auto-commit, and PR creation. Extracted from cli.ts to avoid
 * mixing CLI parsing with business logic.
 */

import { getCurrentWorkflow, listWorkflows, isWorkflowPath } from '../../../infra/config/index.js';
import { selectOptionWithDefault, confirm } from '../../../shared/prompt/index.js';
import { createSharedClone, autoCommitAndPush, summarizeTaskName } from '../../../infra/task/index.js';
import { DEFAULT_WORKFLOW_NAME } from '../../../shared/constants.js';
import { info, error, success } from '../../../shared/ui/index.js';
import { createLogger } from '../../../shared/utils/index.js';
import { createPullRequest, buildPrBody } from '../../../infra/github/index.js';
import { executeTask } from './taskExecution.js';
import type { TaskExecutionOptions, WorktreeConfirmationResult, SelectAndExecuteOptions } from './types.js';

export type { WorktreeConfirmationResult, SelectAndExecuteOptions };

const log = createLogger('selectAndExecute');

/**
 * Select a workflow interactively.
 * Returns the selected workflow name, or null if cancelled.
 */
async function selectWorkflow(cwd: string): Promise<string | null> {
  const availableWorkflows = listWorkflows(cwd);
  const currentWorkflow = getCurrentWorkflow(cwd);

  if (availableWorkflows.length === 0) {
    info(`No workflows found. Using default: ${DEFAULT_WORKFLOW_NAME}`);
    return DEFAULT_WORKFLOW_NAME;
  }

  if (availableWorkflows.length === 1 && availableWorkflows[0]) {
    return availableWorkflows[0];
  }

  const options = availableWorkflows.map((name) => ({
    label: name === currentWorkflow ? `${name} (current)` : name,
    value: name,
  }));

  const defaultWorkflow = availableWorkflows.includes(currentWorkflow)
    ? currentWorkflow
    : (availableWorkflows.includes(DEFAULT_WORKFLOW_NAME)
        ? DEFAULT_WORKFLOW_NAME
        : availableWorkflows[0] || DEFAULT_WORKFLOW_NAME);

  return selectOptionWithDefault('Select workflow:', options, defaultWorkflow);
}

/**
 * Determine workflow to use.
 *
 * - If override looks like a path (isWorkflowPath), return it directly (validation is done at load time).
 * - If override is a name, validate it exists in available workflows.
 * - If no override, prompt user to select interactively.
 */
async function determineWorkflow(cwd: string, override?: string): Promise<string | null> {
  if (override) {
    // Path-based: skip name validation (loader handles existence check)
    if (isWorkflowPath(override)) {
      return override;
    }
    // Name-based: validate workflow name exists
    const availableWorkflows = listWorkflows(cwd);
    const knownWorkflows = availableWorkflows.length === 0 ? [DEFAULT_WORKFLOW_NAME] : availableWorkflows;
    if (!knownWorkflows.includes(override)) {
      error(`Workflow not found: ${override}`);
      return null;
    }
    return override;
  }
  return selectWorkflow(cwd);
}

export async function confirmAndCreateWorktree(
  cwd: string,
  task: string,
  createWorktreeOverride?: boolean | undefined,
): Promise<WorktreeConfirmationResult> {
  const useWorktree =
    typeof createWorktreeOverride === 'boolean'
      ? createWorktreeOverride
      : await confirm('Create worktree?', true);

  if (!useWorktree) {
    return { execCwd: cwd, isWorktree: false };
  }

  // Summarize task name to English slug using AI
  info('Generating branch name...');
  const taskSlug = await summarizeTaskName(task, { cwd });

  const result = createSharedClone(cwd, {
    worktree: true,
    taskSlug,
  });
  info(`Clone created: ${result.path} (branch: ${result.branch})`);

  return { execCwd: result.path, isWorktree: true, branch: result.branch };
}

/**
 * Execute a task with workflow selection, optional worktree, and auto-commit.
 * Shared by direct task execution and interactive mode.
 */
export async function selectAndExecuteTask(
  cwd: string,
  task: string,
  options?: SelectAndExecuteOptions,
  agentOverrides?: TaskExecutionOptions,
): Promise<void> {
  const workflowIdentifier = await determineWorkflow(cwd, options?.workflow);

  if (workflowIdentifier === null) {
    info('Cancelled');
    return;
  }

  const { execCwd, isWorktree, branch } = await confirmAndCreateWorktree(
    cwd,
    task,
    options?.createWorktree,
  );

  log.info('Starting task execution', { workflow: workflowIdentifier, worktree: isWorktree });
  const taskSuccess = await executeTask({
    task,
    cwd: execCwd,
    workflowIdentifier,
    projectCwd: cwd,
    agentOverrides,
    interactiveUserInput: options?.interactiveUserInput === true,
  });

  if (taskSuccess && isWorktree) {
    const commitResult = autoCommitAndPush(execCwd, task, cwd);
    if (commitResult.success && commitResult.commitHash) {
      success(`Auto-committed & pushed: ${commitResult.commitHash}`);
    } else if (!commitResult.success) {
      error(`Auto-commit failed: ${commitResult.message}`);
    }

    // PR creation: --auto-pr → create automatically, otherwise ask
    if (commitResult.success && commitResult.commitHash && branch) {
      const shouldCreatePr = options?.autoPr === true || await confirm('Create pull request?', false);
      if (shouldCreatePr) {
        info('Creating pull request...');
        const prBody = buildPrBody(undefined, `Workflow \`${workflowIdentifier}\` completed successfully.`);
        const prResult = createPullRequest(execCwd, {
          branch,
          title: task.length > 100 ? `${task.slice(0, 97)}...` : task,
          body: prBody,
          repo: options?.repo,
        });
        if (prResult.success) {
          success(`PR created: ${prResult.url}`);
        } else {
          error(`PR creation failed: ${prResult.error}`);
        }
      }
    }
  }

  if (!taskSuccess) {
    process.exit(1);
  }
}
