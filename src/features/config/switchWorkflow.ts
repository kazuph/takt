/**
 * Workflow switching command
 */

import {
  listWorkflowEntries,
  loadAllWorkflows,
  getWorkflowCategories,
  buildCategorizedWorkflows,
  loadWorkflow,
  getCurrentWorkflow,
  setCurrentWorkflow,
} from '../../infra/config/index.js';
import {
  getBookmarkedWorkflows,
  toggleBookmark,
} from '../../infra/config/global/index.js';
import { info, success, error } from '../../shared/ui/index.js';
import { selectOption } from '../../shared/prompt/index.js';
import type { SelectOptionItem } from '../../shared/prompt/index.js';
import {
  buildWorkflowSelectionItems,
  buildTopLevelSelectOptions,
  parseCategorySelection,
  buildCategoryWorkflowOptions,
  applyBookmarks,
  warnMissingWorkflows,
  selectWorkflowFromCategorizedWorkflows,
  type SelectionOption,
} from '../workflowSelection/index.js';

/**
 * Create an onBookmark callback for workflow selection.
 * Toggles the bookmark in global config and returns updated options.
 */
function createBookmarkCallback(
  items: ReturnType<typeof buildWorkflowSelectionItems>,
  currentWorkflow: string,
): (value: string) => SelectOptionItem<string>[] {
  return (value: string): SelectOptionItem<string>[] => {
    const categoryName = parseCategorySelection(value);
    if (categoryName) {
      return applyBookmarks(
        buildTopLevelSelectOptions(items, currentWorkflow),
        getBookmarkedWorkflows(),
      );
    }
    toggleBookmark(value);
    return applyBookmarks(
      buildTopLevelSelectOptions(items, currentWorkflow),
      getBookmarkedWorkflows(),
    );
  };
}

/**
 * 2-stage workflow selection with directory categories and bookmark support.
 */
async function selectWorkflowWithCategories(cwd: string): Promise<string | null> {
  const current = getCurrentWorkflow(cwd);
  const entries = listWorkflowEntries(cwd);
  const items = buildWorkflowSelectionItems(entries);

  // Loop until user selects a workflow or cancels at top level
  while (true) {
    const baseOptions = buildTopLevelSelectOptions(items, current);
    const options = applyBookmarks(baseOptions, getBookmarkedWorkflows());

    const selected = await selectOption<string>('Select workflow:', options, {
      onBookmark: createBookmarkCallback(items, current),
    });
    if (!selected) return null;

    const categoryName = parseCategorySelection(selected);
    if (categoryName) {
      const categoryOptions = buildCategoryWorkflowOptions(items, categoryName, current);
      if (!categoryOptions) continue;
      const bookmarkedInCategory = applyBookmarks(categoryOptions, getBookmarkedWorkflows());
      const workflowSelection = await selectOption<string>(`Select workflow in ${categoryName}:`, bookmarkedInCategory, {
        cancelLabel: '← Go back',
        onBookmark: (value: string): SelectOptionItem<string>[] => {
          toggleBookmark(value);
          return applyBookmarks(
            buildCategoryWorkflowOptions(items, categoryName, current) as SelectionOption[],
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
 * Switch to a different workflow
 * @returns true if switch was successful
 */
export async function switchWorkflow(cwd: string, workflowName?: string): Promise<boolean> {
  // No workflow specified - show selection prompt
  if (!workflowName) {
    const current = getCurrentWorkflow(cwd);
    info(`Current workflow: ${current}`);

    const categoryConfig = getWorkflowCategories(cwd);
    let selected: string | null;
    if (categoryConfig) {
      const allWorkflows = loadAllWorkflows(cwd);
      if (allWorkflows.size === 0) {
        info('No workflows found.');
        selected = null;
      } else {
        const categorized = buildCategorizedWorkflows(allWorkflows, categoryConfig);
        warnMissingWorkflows(categorized.missingWorkflows);
        selected = await selectWorkflowFromCategorizedWorkflows(categorized, current);
      }
    } else {
      selected = await selectWorkflowWithCategories(cwd);
    }

    if (!selected) {
      info('Cancelled');
      return false;
    }

    workflowName = selected;
  }

  // Check if workflow exists
  const config = loadWorkflow(workflowName, cwd);

  if (!config) {
    error(`Workflow "${workflowName}" not found`);
    return false;
  }

  // Save to project config
  setCurrentWorkflow(cwd, workflowName);
  success(`Switched to workflow: ${workflowName}`);

  return true;
}
