/**
 * List tasks command — main entry point.
 *
 * Interactive UI for reviewing branch-based task results.
 * Individual actions (merge, delete, instruct, diff) are in taskActions.ts.
 */

import {
  detectDefaultBranch,
  listTaktBranches,
  buildListItems,
} from '../../task/branchList.js';
import { selectOption, confirm } from '../../prompt/index.js';
import { info } from '../../utils/ui.js';
import { createLogger } from '../../utils/debug.js';
import type { TaskExecutionOptions } from '../execution/taskExecution.js';
import {
  type ListAction,
  showFullDiff,
  showDiffAndPromptAction,
  tryMergeBranch,
  mergeBranch,
  deleteBranch,
  instructBranch,
} from './taskActions.js';

// Re-export for backward compatibility (tests import from this module)
export {
  type ListAction,
  isBranchMerged,
  showFullDiff,
  tryMergeBranch,
  mergeBranch,
  deleteBranch,
  instructBranch,
} from './taskActions.js';

const log = createLogger('list-tasks');

/**
 * Main entry point: list branch-based tasks interactively.
 */
export async function listTasks(cwd: string, options?: TaskExecutionOptions): Promise<void> {
  log.info('Starting list-tasks');

  const defaultBranch = detectDefaultBranch(cwd);
  let branches = listTaktBranches(cwd);

  if (branches.length === 0) {
    info('No tasks to list.');
    return;
  }

  // Interactive loop
  while (branches.length > 0) {
    const items = buildListItems(cwd, branches, defaultBranch);

    const menuOptions = items.map((item, idx) => {
      const filesSummary = `${item.filesChanged} file${item.filesChanged !== 1 ? 's' : ''} changed`;
      const description = item.originalInstruction
        ? `${filesSummary} | ${item.originalInstruction}`
        : filesSummary;
      return {
        label: item.info.branch,
        value: String(idx),
        description,
      };
    });

    const selected = await selectOption<string>(
      'List Tasks (Branches)',
      menuOptions,
    );

    if (selected === null) {
      return;
    }

    const selectedIdx = parseInt(selected, 10);
    const item = items[selectedIdx];
    if (!item) continue;

    // Action loop: re-show menu after viewing diff
    let action: ListAction | null;
    do {
      action = await showDiffAndPromptAction(cwd, defaultBranch, item);

      if (action === 'diff') {
        showFullDiff(cwd, defaultBranch, item.info.branch);
      }
    } while (action === 'diff');

    if (action === null) continue;

    switch (action) {
      case 'instruct':
        await instructBranch(cwd, item, options);
        break;
      case 'try':
        tryMergeBranch(cwd, item);
        break;
      case 'merge':
        mergeBranch(cwd, item);
        break;
      case 'delete': {
        const confirmed = await confirm(
          `Delete ${item.info.branch}? This will discard all changes.`,
          false,
        );
        if (confirmed) {
          deleteBranch(cwd, item);
        }
        break;
      }
    }

    // Refresh branch list after action
    branches = listTaktBranches(cwd);
  }

  info('All tasks listed.');
}
