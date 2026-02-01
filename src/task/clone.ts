/**
 * Git clone lifecycle management
 *
 * Creates, removes, and tracks git worktrees for task isolation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLogger } from '../utils/debug.js';
import { slugify } from '../utils/slug.js';
import { loadGlobalConfig } from '../config/globalConfig.js';

const log = createLogger('clone');

export interface WorktreeOptions {
  /** worktree setting: true = auto path, string = custom path */
  worktree: boolean | string;
  /** Branch name (optional, auto-generated if omitted) */
  branch?: string;
  /** Task slug for auto-generated paths/branches */
  taskSlug: string;
}

export interface WorktreeResult {
  /** Absolute path to the clone */
  path: string;
  /** Branch name used */
  branch: string;
}

function generateTimestamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 13);
}

/**
 * Resolve the base directory for clones from global config.
 * Returns the configured worktree_dir (resolved to absolute), or ./.worktree
 */
function resolveCloneBaseDir(projectDir: string): string {
  const globalConfig = loadGlobalConfig();
  if (globalConfig.worktreeDir) {
    return path.isAbsolute(globalConfig.worktreeDir)
      ? globalConfig.worktreeDir
      : path.resolve(projectDir, globalConfig.worktreeDir);
  }
  return path.join(projectDir, '.worktree');
}

/**
 * Resolve the worktree path based on options and global config.
 *
 * Priority:
 * 1. Custom path in options.worktree (string)
 * 2. worktree_dir from config.yaml (if set)
 * 3. Default: ./.worktree/{dir-name}
 */
function resolveClonePath(projectDir: string, options: WorktreeOptions): string {
  const timestamp = generateTimestamp();
  const slug = slugify(options.taskSlug);
  const dirName = slug ? `${timestamp}-${slug}` : timestamp;

  if (typeof options.worktree === 'string') {
    return path.isAbsolute(options.worktree)
      ? options.worktree
      : path.resolve(projectDir, options.worktree);
  }

  return path.join(resolveCloneBaseDir(projectDir), dirName);
}

function resolveBranchName(options: WorktreeOptions): string {
  if (options.branch) {
    return options.branch;
  }
  const timestamp = generateTimestamp();
  const slug = slugify(options.taskSlug);
  return slug ? `takt/${timestamp}-${slug}` : `takt/${timestamp}`;
}

function branchExists(projectDir: string, branch: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', branch], {
      cwd: projectDir,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a git worktree for the given branch.
 */
function addWorktreeWithGitWt(projectDir: string, branch: string, baseDir: string): string {
  const resolvedBaseDir = path.isAbsolute(baseDir)
    ? baseDir
    : path.resolve(projectDir, baseDir);

  const output = execFileSync(
    'git',
    ['wt', '--basedir', resolvedBaseDir, '--nocd', branch],
    {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    },
  );

  const lines = output.trim().split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  if (!lastLine) {
    throw new Error('git wt did not return a worktree path');
  }
  return lastLine.trim();
}

function addWorktreeAtPath(projectDir: string, worktreePath: string, branch: string): void {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  if (branchExists(projectDir, branch)) {
    execFileSync('git', ['worktree', 'add', worktreePath, branch], {
      cwd: projectDir,
      stdio: 'pipe',
    });
  } else {
    execFileSync('git', ['worktree', 'add', '-b', branch, worktreePath], {
      cwd: projectDir,
      stdio: 'pipe',
    });
  }
}

/**
 * Create a git worktree for a task.
 */
export function createSharedClone(projectDir: string, options: WorktreeOptions): WorktreeResult {
  const branch = resolveBranchName(options);
  const baseDir = resolveCloneBaseDir(projectDir);
  const clonePath =
    typeof options.worktree === 'string'
      ? resolveClonePath(projectDir, options)
      : addWorktreeWithGitWt(projectDir, branch, baseDir);

  log.info('Creating worktree', { path: clonePath, branch });

  if (typeof options.worktree === 'string') {
    addWorktreeAtPath(projectDir, clonePath, branch);
  }

  saveCloneMeta(projectDir, branch, clonePath);
  log.info('Worktree created', { path: clonePath, branch });

  return { path: clonePath, branch };
}

/**
 * Ensure a worktree for an existing branch.
 * Used by resume to continue work on a branch that was previously pushed.
 */
function findWorktreePathForBranch(projectDir: string, branch: string): string | null {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const lines = output.split(/\r?\n/);
    let currentPath: string | null = null;
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim();
        continue;
      }
      if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        if (ref === `refs/heads/${branch}`) {
          return currentPath;
        }
      }
    }
  } catch {
    // Ignore errors; fall back to creating a new worktree
  }
  return null;
}

/**
 * Ensure a worktree exists for an existing branch.
 * Reuses an existing worktree if present; otherwise creates one.
 */
export function createWorktreeForBranch(projectDir: string, branch: string): WorktreeResult {
  const existingPath = findWorktreePathForBranch(projectDir, branch);
  if (existingPath) {
    log.info('Reusing existing worktree for branch', { path: existingPath, branch });
    saveCloneMeta(projectDir, branch, existingPath);
    return { path: existingPath, branch };
  }

  const baseDir = resolveCloneBaseDir(projectDir);
  const clonePath = addWorktreeWithGitWt(projectDir, branch, baseDir);

  log.info('Creating worktree for branch', { path: clonePath, branch });

  saveCloneMeta(projectDir, branch, clonePath);
  log.info('Worktree created', { path: clonePath, branch });

  return { path: clonePath, branch };
}

/**
 * Remove a clone directory.
 */
export function removeClone(projectDir: string, clonePath: string): void {
  log.info('Removing worktree', { path: clonePath });
  try {
    execFileSync('git', ['worktree', 'remove', '--force', clonePath], {
      cwd: projectDir,
      stdio: 'pipe',
    });
    log.info('Worktree removed', { path: clonePath });
  } catch (err) {
    try {
      fs.rmSync(clonePath, { recursive: true, force: true });
      log.info('Worktree path removed by fallback', { path: clonePath });
    } catch (fallbackErr) {
      log.error('Failed to remove worktree', { path: clonePath, error: String(fallbackErr) });
    }
  }
}

// --- Clone metadata ---

const CLONE_META_DIR = 'clone-meta';

function encodeBranchName(branch: string): string {
  return branch.replace(/\//g, '--');
}

function getCloneMetaPath(projectDir: string, branch: string): string {
  return path.join(projectDir, '.takt', CLONE_META_DIR, `${encodeBranchName(branch)}.json`);
}

/**
 * Save clone metadata (branch → clonePath mapping).
 * Used to clean up orphaned clone directories on merge/delete.
 */
export function saveCloneMeta(projectDir: string, branch: string, clonePath: string): void {
  const filePath = getCloneMetaPath(projectDir, branch);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ branch, clonePath }));
  log.info('Clone meta saved', { branch, clonePath });
}

/**
 * Remove clone metadata for a branch.
 */
export function removeCloneMeta(projectDir: string, branch: string): void {
  try {
    fs.unlinkSync(getCloneMetaPath(projectDir, branch));
    log.info('Clone meta removed', { branch });
  } catch {
    // File may not exist — ignore
  }
}

/**
 * Clean up an orphaned worktree directory associated with a branch.
 * Reads metadata, removes worktree if it still exists, then removes metadata.
 */
export function cleanupOrphanedClone(projectDir: string, branch: string): void {
  try {
    const raw = fs.readFileSync(getCloneMetaPath(projectDir, branch), 'utf-8');
    const meta = JSON.parse(raw) as { clonePath: string };
    if (fs.existsSync(meta.clonePath)) {
      removeClone(projectDir, meta.clonePath);
      log.info('Orphaned worktree cleaned up', { branch, clonePath: meta.clonePath });
    }
  } catch {
    // No metadata or parse error — nothing to clean up
  }
  removeCloneMeta(projectDir, branch);
}
