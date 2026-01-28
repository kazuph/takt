/**
 * Review tasks command
 *
 * Interactive UI for reviewing worktree-based task results:
 * merge, skip, or delete actions.
 */

import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import {
  removeWorktree,
  detectDefaultBranch,
  listTaktWorktrees,
  buildReviewItems,
  type WorktreeReviewItem,
} from '../task/worktree.js';
import { selectOption, confirm } from '../prompt/index.js';
import { info, success, error as logError, warn } from '../utils/ui.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('review-tasks');

/** Actions available for a reviewed worktree */
export type ReviewAction = 'merge' | 'skip' | 'delete';

/**
 * Show diff stat for a branch and prompt for an action.
 */
async function showDiffAndPromptAction(
  cwd: string,
  defaultBranch: string,
  item: WorktreeReviewItem,
): Promise<ReviewAction> {
  console.log();
  console.log(chalk.bold.cyan(`=== ${item.info.branch} ===`));
  console.log();

  // Show diff stat
  try {
    const stat = execFileSync(
      'git', ['diff', '--stat', `${defaultBranch}...${item.info.branch}`],
      { cwd, encoding: 'utf-8', stdio: 'pipe' },
    );
    console.log(stat);
  } catch {
    warn('Could not generate diff stat');
  }

  // Prompt action
  const action = await selectOption<ReviewAction>(
    `Action for ${item.info.branch}:`,
    [
      { label: 'Merge', value: 'merge', description: 'Merge changes into current branch and clean up' },
      { label: 'Skip', value: 'skip', description: 'Return to list without changes' },
      { label: 'Delete', value: 'delete', description: 'Discard changes, remove worktree and branch' },
    ],
  );

  return action ?? 'skip';
}

/**
 * Merge a worktree branch into the current branch.
 * Removes the worktree first, then merges, then deletes the branch.
 */
export function mergeWorktreeBranch(projectDir: string, item: WorktreeReviewItem): boolean {
  const { branch } = item.info;

  try {
    // 1. Remove worktree (must happen before merge to unlock branch)
    removeWorktree(projectDir, item.info.path);

    // 2. Merge the branch
    execFileSync('git', ['merge', branch], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // 3. Delete the branch
    try {
      execFileSync('git', ['branch', '-d', branch], {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch {
      warn(`Could not delete branch ${branch}. You may delete it manually.`);
    }

    success(`Merged ${branch}`);
    log.info('Worktree merged', { branch });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`Merge failed: ${msg}`);
    logError('You may need to resolve conflicts manually.');
    log.error('Merge failed', { branch, error: msg });
    return false;
  }
}

/**
 * Delete a worktree and its branch (discard changes).
 */
export function deleteWorktreeBranch(projectDir: string, item: WorktreeReviewItem): boolean {
  const { branch } = item.info;

  try {
    // 1. Remove worktree
    removeWorktree(projectDir, item.info.path);

    // 2. Force-delete the branch
    execFileSync('git', ['branch', '-D', branch], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    success(`Deleted ${branch}`);
    log.info('Worktree deleted', { branch });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(`Delete failed: ${msg}`);
    log.error('Delete failed', { branch, error: msg });
    return false;
  }
}

/**
 * Main entry point: review worktree tasks interactively.
 */
export async function reviewTasks(cwd: string): Promise<void> {
  log.info('Starting review-tasks');

  const defaultBranch = detectDefaultBranch(cwd);
  let worktrees = listTaktWorktrees(cwd);

  if (worktrees.length === 0) {
    info('No tasks to review.');
    return;
  }

  // Interactive loop
  while (worktrees.length > 0) {
    const items = buildReviewItems(cwd, worktrees, defaultBranch);

    // Build selection options
    const options = items.map((item, idx) => ({
      label: item.info.branch,
      value: String(idx),
      description: `${item.filesChanged} file${item.filesChanged !== 1 ? 's' : ''} changed`,
    }));

    const selected = await selectOption<string>(
      'Review Tasks (Worktrees)',
      options,
    );

    if (selected === null) {
      return;
    }

    const selectedIdx = parseInt(selected, 10);
    const item = items[selectedIdx];
    if (!item) continue;

    const action = await showDiffAndPromptAction(cwd, defaultBranch, item);

    switch (action) {
      case 'merge':
        mergeWorktreeBranch(cwd, item);
        break;
      case 'delete': {
        const confirmed = await confirm(
          `Delete ${item.info.branch}? This will discard all changes.`,
          false,
        );
        if (confirmed) {
          deleteWorktreeBranch(cwd, item);
        }
        break;
      }
      case 'skip':
        break;
    }

    // Refresh worktree list after action
    worktrees = listTaktWorktrees(cwd);
  }

  info('All tasks reviewed.');
}
