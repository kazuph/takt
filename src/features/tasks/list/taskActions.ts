/**
 * Individual actions for branch-based tasks.
 *
 * Provides merge, delete, try-merge, instruct, and diff operations
 * for branches listed by the listTasks command.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import chalk from 'chalk';
import {
  createTempCloneForBranch,
  removeClone,
  removeCloneMeta,
  cleanupOrphanedClone,
  buildBranchContext,
  autoCommitAndPush,
  type BranchListItem,
  type TaskListItem,
} from '../../../infra/task/index.js';
import { selectOption, promptInput, readMultilineFromStream } from '../../../shared/prompt/index.js';
import { info, success, error as logError, warn, header, blankLine } from '../../../shared/ui/index.js';
import { createLogger, getErrorMessage } from '../../../shared/utils/index.js';
import { executeTask } from '../execute/taskExecution.js';
import type { TaskExecutionOptions } from '../execute/types.js';
import { listPieces, getCurrentPiece } from '../../../infra/config/index.js';
import { DEFAULT_PIECE_NAME } from '../../../shared/constants.js';
import { encodeWorktreePath } from '../../../infra/config/project/sessionStore.js';
import { askAboutBranch } from '../execute/ask.js';

const log = createLogger('list-tasks');

/** Actions available for a listed branch */
export type ListAction = 'diff' | 'resume' | 'ask' | 'instruct' | 'try' | 'merge' | 'delete';

type BranchActionItem = BranchListItem | TaskListItem;

function resolveBranchActionInfo(item: BranchActionItem): { branch: string; worktreePath?: string } {
  if ('info' in item) {
    return {
      branch: item.info.branch,
      worktreePath: item.info.worktreePath,
    };
  }
  return {
    branch: item.branch ?? '',
    worktreePath: item.worktreePath,
  };
}

/**
 * Check if a branch has already been merged into HEAD.
 */
export function isBranchMerged(projectDir: string, branch: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', branch, 'HEAD'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Show full diff in an interactive pager (less).
 * Falls back to direct output if pager is unavailable.
 */
export function showFullDiff(
  cwd: string,
  defaultBranch: string,
  branch: string,
): void {
  try {
    const result = spawnSync(
      'git', ['diff', '--color=always', `${defaultBranch}...${branch}`],
      {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, GIT_PAGER: 'less -R' },
      },
    );
    if (result.status !== 0) {
      warn('Could not display diff');
    }
  } catch {
    warn('Could not display diff');
  }
}

/**
 * Show diff stat for a branch and prompt for an action.
 */
export async function showDiffAndPromptAction(
  cwd: string,
  defaultBranch: string,
  item: BranchListItem,
): Promise<ListAction | null> {
  header(item.info.branch);
  if (item.originalInstruction) {
    info(chalk.dim(`  ${item.originalInstruction}`));
  }
  blankLine();

  try {
    const stat = execFileSync(
      'git', ['diff', '--stat', `${defaultBranch}...${item.info.branch}`],
      { cwd, encoding: 'utf-8', stdio: 'pipe' },
    );
    info(stat);
  } catch {
    warn('Could not generate diff stat');
  }

  const action = await selectOption<ListAction>(
    `Action for ${item.info.branch}:`,
    [
      { label: 'View diff', value: 'diff', description: 'Show full diff in pager' },
      { label: 'Resume', value: 'resume', description: 'Give additional instructions via temp clone' },
      { label: 'Ask', value: 'ask', description: 'Ask about outcome or next steps' },
      { label: 'Try merge', value: 'try', description: 'Squash merge (stage changes without commit)' },
      { label: 'Merge & cleanup', value: 'merge', description: 'Merge and delete branch' },
      { label: 'Delete', value: 'delete', description: 'Discard changes, delete branch' },
    ],
  );

  return action;
}

/**
 * Try-merge (squash): stage changes from branch without committing.
 */
export function tryMergeBranch(projectDir: string, item: BranchActionItem): boolean {
  const { branch } = resolveBranchActionInfo(item);
  if (!branch) {
    logError('Cannot try-merge: branch is missing.');
    return false;
  }

  try {
    execFileSync('git', ['merge', '--squash', branch], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    success(`Squash-merged ${branch} (changes staged, not committed)`);
    info('Run `git status` to see staged changes, `git commit` to finalize, or `git reset` to undo.');
    log.info('Try-merge (squash) completed', { branch });
    return true;
  } catch (err) {
    const msg = getErrorMessage(err);
    logError(`Squash merge failed: ${msg}`);
    logError('You may need to resolve conflicts manually.');
    log.error('Try-merge (squash) failed', { branch, error: msg });
    return false;
  }
}

/**
 * Merge & cleanup: if already merged, skip merge and just delete the branch.
 */
export function mergeBranch(projectDir: string, item: BranchActionItem): boolean {
  const { branch } = resolveBranchActionInfo(item);
  if (!branch) {
    logError('Cannot merge: branch is missing.');
    return false;
  }
  const alreadyMerged = isBranchMerged(projectDir, branch);

  try {
    if (alreadyMerged) {
      info(`${branch} is already merged, skipping merge.`);
      log.info('Branch already merged, cleanup only', { branch });
    } else {
      execFileSync('git', ['merge', '--no-edit', branch], {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_MERGE_AUTOEDIT: 'no',
        },
      });
    }

    try {
      execFileSync('git', ['branch', '-d', branch], {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch {
      warn(`Could not delete branch ${branch}. You may delete it manually.`);
    }

    cleanupOrphanedClone(projectDir, branch);

    success(`Merged & cleaned up ${branch}`);
    log.info('Branch merged & cleaned up', { branch, alreadyMerged });
    return true;
  } catch (err) {
    const msg = getErrorMessage(err);
    logError(`Merge failed: ${msg}`);
    logError('You may need to resolve conflicts manually.');
    log.error('Merge & cleanup failed', { branch, error: msg });
    return false;
  }
}

/**
 * Delete a branch (discard changes).
 * For worktree branches, removes the worktree directory and session file.
 */
export function deleteBranch(projectDir: string, item: BranchActionItem): boolean {
  const { branch, worktreePath } = resolveBranchActionInfo(item);
  if (!branch) {
    logError('Cannot delete: branch is missing.');
    return false;
  }

  try {
    // If this is a worktree branch, remove the worktree directory and session file
    if (worktreePath) {
      // Remove worktree directory if it exists
      if (existsSync(worktreePath)) {
        rmSync(worktreePath, { recursive: true, force: true });
        log.info('Removed worktree directory', { worktreePath });
      }

      // Remove worktree-session file
      const encodedPath = encodeWorktreePath(worktreePath);
      const sessionFile = join(projectDir, '.takt', 'worktree-sessions', `${encodedPath}.json`);
      if (existsSync(sessionFile)) {
        unlinkSync(sessionFile);
        log.info('Removed worktree-session file', { sessionFile });
      }

      success(`Deleted worktree ${branch}`);
      log.info('Worktree branch deleted', { branch, worktreePath });
      return true;
    }

    // For regular branches, use git branch -D
    execFileSync('git', ['branch', '-D', branch], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    cleanupOrphanedClone(projectDir, branch);

    success(`Deleted ${branch}`);
    log.info('Branch deleted', { branch });
    return true;
  } catch (err) {
    const msg = getErrorMessage(err);
    logError(`Delete failed: ${msg}`);
    log.error('Delete failed', { branch, error: msg });
    return false;
  }
}

/**
 * Get the piece to use for instruction.
 */
async function selectPieceForInstruction(projectDir: string): Promise<string | null> {
  const availablePieces = listPieces(projectDir);
  const currentPiece = getCurrentPiece(projectDir);

  if (availablePieces.length === 0) {
    return DEFAULT_PIECE_NAME;
  }

  if (availablePieces.length === 1 && availablePieces[0]) {
    return availablePieces[0];
  }

  const options = availablePieces.map((name) => ({
    label: name === currentPiece ? `${name} (current)` : name,
    value: name,
  }));

  return await selectOption('Select piece:', options);
}

async function promptMultiline(message: string): Promise<string | null> {
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  const wasPaused = typeof stdin.isPaused === 'function' ? stdin.isPaused() : false;

  if (wasRaw && typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(false);
  }
  if (wasPaused && typeof stdin.resume === 'function') {
    stdin.resume();
  }

  console.log(chalk.green(message));
  const result = await readMultilineFromStream(stdin);

  if (wasRaw && typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
  }
  if (wasPaused && typeof stdin.pause === 'function') {
    stdin.pause();
  }

  return result;
}

/**
 * Resume branch: create a temp clone, give additional instructions,
 * auto-commit+push, then remove clone.
 */
export async function resumeBranch(
  projectDir: string,
  item: BranchListItem,
  options?: TaskExecutionOptions,
): Promise<boolean> {
  const { branch } = item.info;

  const instruction = await promptInput('Enter instruction');
  if (!instruction) {
    info('Cancelled');
    return false;
  }

  const selectedPiece = await selectPieceForInstruction(projectDir);
  if (!selectedPiece) {
    info('Cancelled');
    return false;
  }

  log.info('Resuming branch via temp clone', { branch, piece: selectedPiece });
  info(`Running instruction on ${branch}...`);

  const clone = createTempCloneForBranch(projectDir, branch);

  try {
    const branchContext = buildBranchContext(projectDir, branch, {
      originalInstruction: item.originalInstruction,
    });
    const fullInstruction = branchContext
      ? `${branchContext}## 追加指示\n${instruction}`
      : instruction;

    const taskSuccess = await executeTask({
      task: fullInstruction,
      cwd: clone.path,
      pieceIdentifier: selectedPiece,
      projectCwd: projectDir,
      agentOverrides: options,
    });

    if (taskSuccess) {
      const commitResult = autoCommitAndPush(clone.path, item.taskSlug, projectDir);
      if (commitResult.success && commitResult.commitHash) {
        info(`Auto-committed & pushed: ${commitResult.commitHash}`);
      } else if (!commitResult.success) {
        warn(`Auto-commit skipped: ${commitResult.message}`);
      }
      success(`Instruction completed on ${branch}`);
      log.info('Instruction completed', { branch });
    } else {
      logError(`Instruction failed on ${branch}`);
      log.error('Instruction failed', { branch });
    }

    return taskSuccess;
  } finally {
    removeClone(clone.path);
    removeCloneMeta(projectDir, branch);
  }
}

/** Backward-compatible alias */
export const instructBranch = resumeBranch;

/**
 * Ask about branch outcome or next steps.
 */
export async function askBranch(
  projectDir: string,
  item: BranchListItem,
  options?: TaskExecutionOptions,
): Promise<void> {
  let question = await promptMultiline('質問を入力（空行で送信）');
  while (question) {
    await askAboutBranch(projectDir, {
      branch: item.info.branch,
      question,
      originalInstruction: item.originalInstruction,
      provider: options?.provider,
      model: options?.model,
    });
    question = await promptMultiline('追加の質問を入力（空行で送信）');
  }
}
