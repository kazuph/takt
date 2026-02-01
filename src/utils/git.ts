/**
 * Git utility helpers
 */

import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Resolve the project root for a git worktree.
 * Uses `git rev-parse --git-common-dir` to find the shared .git directory,
 * then returns its parent directory.
 */
export function resolveProjectRoot(cwd: string): string {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    if (!commonDir) return cwd;
    const commonAbs = isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
    return resolve(dirname(commonAbs));
  } catch {
    return cwd;
  }
}
