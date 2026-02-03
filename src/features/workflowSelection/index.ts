/**
 * Workflow selection helpers (UI layer).
 */

import { selectOption } from '../../shared/prompt/index.js';
import type { SelectOptionItem } from '../../shared/prompt/index.js';
import { info, warn } from '../../shared/ui/index.js';
import {
  getBookmarkedWorkflows,
  toggleBookmark,
} from '../../infra/config/global/index.js';
import {
  findWorkflowCategories,
  type WorkflowDirEntry,
  type CategorizedWorkflows,
  type MissingWorkflow,
} from '../../infra/config/index.js';

/** Top-level selection item: either a workflow or a category containing workflows */
export type WorkflowSelectionItem =
  | { type: 'workflow'; name: string }
  | { type: 'category'; name: string; workflows: string[] };

/** Option item for prompt UI */
export interface SelectionOption {
  label: string;
  value: string;
}

/**
 * Build top-level selection items for the workflow chooser UI.
 * Root-level workflows and categories are displayed at the same level.
 */
export function buildWorkflowSelectionItems(entries: WorkflowDirEntry[]): WorkflowSelectionItem[] {
  const categories = new Map<string, string[]>();
  const items: WorkflowSelectionItem[] = [];

  for (const entry of entries) {
    if (entry.category) {
      let workflows = categories.get(entry.category);
      if (!workflows) {
        workflows = [];
        categories.set(entry.category, workflows);
      }
      workflows.push(entry.name);
    } else {
      items.push({ type: 'workflow', name: entry.name });
    }
  }

  for (const [name, workflows] of categories) {
    items.push({ type: 'category', name, workflows: workflows.sort() });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

const CATEGORY_VALUE_PREFIX = '__category__:';

/**
 * Build top-level select options from WorkflowSelectionItems.
 * Categories are encoded with a prefix in the value field.
 */
export function buildTopLevelSelectOptions(
  items: WorkflowSelectionItem[],
  currentWorkflow: string,
): SelectionOption[] {
  return items.map((item) => {
    if (item.type === 'workflow') {
      const isCurrent = item.name === currentWorkflow;
      const label = isCurrent ? `${item.name} (current)` : item.name;
      return { label, value: item.name };
    }
    const containsCurrent = item.workflows.some((w) => w === currentWorkflow);
    const label = containsCurrent ? `📁 ${item.name}/ (current)` : `📁 ${item.name}/`;
    return { label, value: `${CATEGORY_VALUE_PREFIX}${item.name}` };
  });
}

/**
 * Parse a top-level selection result.
 * Returns the category name if a category was selected, or null if a workflow was selected directly.
 */
export function parseCategorySelection(selected: string): string | null {
  if (selected.startsWith(CATEGORY_VALUE_PREFIX)) {
    return selected.slice(CATEGORY_VALUE_PREFIX.length);
  }
  return null;
}

/**
 * Build select options for workflows within a category.
 */
export function buildCategoryWorkflowOptions(
  items: WorkflowSelectionItem[],
  categoryName: string,
  currentWorkflow: string,
): SelectionOption[] | null {
  const categoryItem = items.find(
    (item) => item.type === 'category' && item.name === categoryName,
  );
  if (!categoryItem || categoryItem.type !== 'category') return null;

  return categoryItem.workflows.map((qualifiedName) => {
    const displayName = qualifiedName.split('/').pop()!;
    const isCurrent = qualifiedName === currentWorkflow;
    const label = isCurrent ? `${displayName} (current)` : displayName;
    return { label, value: qualifiedName };
  });
}

const BOOKMARK_MARK = '★ ';

/**
 * Sort options with bookmarked items first and add ★ prefix.
 * Pure function — does not mutate inputs.
 */
export function applyBookmarks(
  options: SelectionOption[],
  bookmarkedWorkflows: string[],
): SelectionOption[] {
  const bookmarkedSet = new Set(bookmarkedWorkflows);
  const bookmarked: SelectionOption[] = [];
  const rest: SelectionOption[] = [];

  for (const opt of options) {
    if (bookmarkedSet.has(opt.value)) {
      bookmarked.push({ ...opt, label: `${BOOKMARK_MARK}${opt.label}` });
    } else {
      rest.push(opt);
    }
  }

  return [...bookmarked, ...rest];
}

/**
 * Warn about missing workflows referenced by categories.
 */
export function warnMissingWorkflows(missing: MissingWorkflow[]): void {
  for (const { categoryName, workflowName } of missing) {
    warn(`Workflow "${workflowName}" in category "${categoryName}" not found`);
  }
}

function buildCategorySelectOptions(
  categorized: CategorizedWorkflows,
  currentWorkflow: string,
): SelectOptionItem<string>[] {
  const entries = Array.from(categorized.categories.entries())
    .map(([categoryName, workflows]) => ({ categoryName, workflows }));

  return entries.map(({ categoryName, workflows }) => {
    const containsCurrent = workflows.includes(currentWorkflow);
    const label = containsCurrent
      ? `${categoryName} (${workflows.length} workflows, current)`
      : `${categoryName} (${workflows.length} workflows)`;
    return { label, value: categoryName };
  });
}

function buildWorkflowOptionsForCategory(
  categorized: CategorizedWorkflows,
  categoryName: string,
  currentWorkflow: string,
): SelectOptionItem<string>[] | null {
  const workflows = categorized.categories.get(categoryName);
  if (!workflows) return null;

  return workflows.map((workflowName) => {
    const alsoIn = findWorkflowCategories(workflowName, categorized)
      .filter((name) => name !== categoryName);
    const isCurrent = workflowName === currentWorkflow;
    const alsoInLabel = alsoIn.length > 0 ? `also in ${alsoIn.join(', ')}` : '';

    let label = workflowName;
    if (isCurrent && alsoInLabel) {
      label = `${workflowName} (current, ${alsoInLabel})`;
    } else if (isCurrent) {
      label = `${workflowName} (current)`;
    } else if (alsoInLabel) {
      label = `${workflowName} (${alsoInLabel})`;
    }

    return { label, value: workflowName };
  });
}

/**
 * Select workflow from categorized workflows (2-stage UI).
 */
export async function selectWorkflowFromCategorizedWorkflows(
  categorized: CategorizedWorkflows,
  currentWorkflow: string,
): Promise<string | null> {
  const categoryOptions = buildCategorySelectOptions(categorized, currentWorkflow);

  if (categoryOptions.length === 0) {
    info('No workflows available for configured categories.');
    return null;
  }

  // Loop until user selects a workflow or cancels at category level
  while (true) {
    const selectedCategory = await selectOption<string>('Select workflow category:', categoryOptions);
    if (!selectedCategory) return null;

    const buildWorkflowOptions = (): SelectOptionItem<string>[] | null =>
      buildWorkflowOptionsForCategory(categorized, selectedCategory, currentWorkflow);

    const baseWorkflowOptions = buildWorkflowOptions();
    if (!baseWorkflowOptions) continue;

    const applyWorkflowBookmarks = (options: SelectOptionItem<string>[]): SelectOptionItem<string>[] => {
      return applyBookmarks(options, getBookmarkedWorkflows()) as SelectOptionItem<string>[];
    };

    const selectedWorkflow = await selectOption<string>(
      `Select workflow in ${selectedCategory}:`,
      applyWorkflowBookmarks(baseWorkflowOptions),
      {
        cancelLabel: '← Go back',
        onBookmark: (value: string): SelectOptionItem<string>[] => {
          toggleBookmark(value);
          const updatedOptions = buildWorkflowOptions();
          if (!updatedOptions) return [];
          return applyWorkflowBookmarks(updatedOptions);
        },
      },
    );

    // If workflow selected, return it. If cancelled (null), go back to category selection
    if (selectedWorkflow) return selectedWorkflow;
  }
}
