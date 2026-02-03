/**
 * Task execution orchestration.
 *
 * Coordinates workflow selection, worktree creation, task execution,
 * auto-commit, and PR creation. Extracted from cli.ts to avoid
 * mixing CLI parsing with business logic.
 */

import {
  getCurrentWorkflow,
  listWorkflows,
  listWorkflowEntries,
  isWorkflowPath,
  loadAllWorkflows,
  getWorkflowCategories,
  buildCategorizedWorkflows,
} from '../../../infra/config/index.js';
import {
  getBookmarkedWorkflows,
  toggleBookmark,
} from '../../../infra/config/global/index.js';
import { selectOption, confirm } from '../../../shared/prompt/index.js';
import type { SelectOptionItem } from '../../../shared/prompt/index.js';
import { createSharedClone, autoCommitAndPush, summarizeTaskName } from '../../../infra/task/index.js';
import { DEFAULT_WORKFLOW_NAME } from '../../../shared/constants.js';
import { info, error, success } from '../../../shared/ui/index.js';
import { createLogger } from '../../../shared/utils/index.js';
import { createPullRequest, buildPrBody } from '../../../infra/github/index.js';
import { executeTask } from './taskExecution.js';
import type { TaskExecutionOptions, WorktreeConfirmationResult, SelectAndExecuteOptions } from './types.js';
import {
  buildWorkflowSelectionItems,
  buildTopLevelSelectOptions,
  parseCategorySelection,
  buildCategoryWorkflowOptions,
  applyBookmarks,
  warnMissingWorkflows,
  selectWorkflowFromCategorizedWorkflows,
  type SelectionOption,
} from '../../workflowSelection/index.js';

export type { WorktreeConfirmationResult, SelectAndExecuteOptions };

const log = createLogger('selectAndExecute');

/**
 * Select a workflow interactively with directory categories and bookmarks.
 */
async function selectWorkflowWithDirectoryCategories(cwd: string): Promise<string | null> {
  const availableWorkflows = listWorkflows(cwd);
  const currentWorkflow = getCurrentWorkflow(cwd);

  if (availableWorkflows.length === 0) {
    info(`No workflows found. Using default: ${DEFAULT_WORKFLOW_NAME}`);
    return DEFAULT_WORKFLOW_NAME;
  }

  if (availableWorkflows.length === 1 && availableWorkflows[0]) {
    return availableWorkflows[0];
  }

  const entries = listWorkflowEntries(cwd);
  const items = buildWorkflowSelectionItems(entries);

  const hasCategories = items.some((item) => item.type === 'category');

  if (!hasCategories) {
    const baseOptions: SelectionOption[] = availableWorkflows.map((name) => ({
      label: name === currentWorkflow ? `${name} (current)` : name,
      value: name,
    }));

    const buildFlatOptions = (): SelectionOption[] =>
      applyBookmarks(baseOptions, getBookmarkedWorkflows());

    return selectOption<string>('Select workflow:', buildFlatOptions(), {
      onBookmark: (value: string): SelectOptionItem<string>[] => {
        toggleBookmark(value);
        return buildFlatOptions();
      },
    });
  }

  const createTopLevelBookmarkCallback = (): ((value: string) => SelectOptionItem<string>[]) => {
    return (value: string): SelectOptionItem<string>[] => {
      if (parseCategorySelection(value)) {
        return applyBookmarks(buildTopLevelSelectOptions(items, currentWorkflow), getBookmarkedWorkflows());
      }
      toggleBookmark(value);
      return applyBookmarks(buildTopLevelSelectOptions(items, currentWorkflow), getBookmarkedWorkflows());
    };
  };

  // Loop until user selects a workflow or cancels at top level
  while (true) {
    const baseOptions = buildTopLevelSelectOptions(items, currentWorkflow);
    const topLevelOptions = applyBookmarks(baseOptions, getBookmarkedWorkflows());

    const selected = await selectOption<string>('Select workflow:', topLevelOptions, {
      onBookmark: createTopLevelBookmarkCallback(),
    });
    if (!selected) return null;

    const categoryName = parseCategorySelection(selected);
    if (categoryName) {
      const categoryOptions = buildCategoryWorkflowOptions(items, categoryName, currentWorkflow);
      if (!categoryOptions) continue;
      const bookmarkedCategoryOptions = applyBookmarks(categoryOptions, getBookmarkedWorkflows());
      const workflowSelection = await selectOption<string>(`Select workflow in ${categoryName}:`, bookmarkedCategoryOptions, {
        cancelLabel: '← Go back',
        onBookmark: (value: string): SelectOptionItem<string>[] => {
          toggleBookmark(value);
          return applyBookmarks(
            buildCategoryWorkflowOptions(items, categoryName, currentWorkflow) as SelectionOption[],
            getBookmarkedWorkflows(),
          );
        },
      });

      // If workflow selected, return it. If cancelled (null), go back to top level
      if (workflowSelection) return workflowSelection;
      continue;
    }

    return selected;
  }
}


/**
 * Select a workflow interactively with 2-stage category support.
 */
async function selectWorkflow(cwd: string): Promise<string | null> {
  const categoryConfig = getWorkflowCategories(cwd);
  if (categoryConfig) {
    const current = getCurrentWorkflow(cwd);
    const allWorkflows = loadAllWorkflows(cwd);
    if (allWorkflows.size === 0) {
      info(`No workflows found. Using default: ${DEFAULT_WORKFLOW_NAME}`);
      return DEFAULT_WORKFLOW_NAME;
    }
    const categorized = buildCategorizedWorkflows(allWorkflows, categoryConfig);
    warnMissingWorkflows(categorized.missingWorkflows);
    return selectWorkflowFromCategorizedWorkflows(categorized, current);
  }
  return selectWorkflowWithDirectoryCategories(cwd);
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
    if (isWorkflowPath(override)) {
      return override;
    }
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
