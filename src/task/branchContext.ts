/**
 * Branch context builder
 *
 * Generates a short context summary for a takt branch, including
 * diff stats and recent commit log.
 */

import { execFileSync } from 'node:child_process';
import { detectDefaultBranch } from './branchList.js';

export interface BranchContextOptions {
  defaultBranch?: string;
  originalInstruction?: string;
  includeDiffStat?: boolean;
  includeCommitLog?: boolean;
}

export function buildBranchContext(
  projectDir: string,
  branch: string,
  options?: BranchContextOptions,
): string {
  const defaultBranch = options?.defaultBranch ?? detectDefaultBranch(projectDir);
  const includeDiffStat = options?.includeDiffStat !== false;
  const includeCommitLog = options?.includeCommitLog !== false;
  const lines: string[] = [];

  if (options?.originalInstruction) {
    lines.push('## 元の依頼');
    lines.push(options.originalInstruction);
    lines.push('');
  }

  if (includeDiffStat) {
    try {
      const diffStat = execFileSync(
        'git', ['diff', '--stat', `${defaultBranch}...${branch}`],
        { cwd: projectDir, encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      if (diffStat) {
        lines.push('## 現在の変更内容（mainからの差分）');
        lines.push('```');
        lines.push(diffStat);
        lines.push('```');
        lines.push('');
      }
    } catch {
      // Ignore errors
    }
  }

  if (includeCommitLog) {
    try {
      const commitLog = execFileSync(
        'git', ['log', '--oneline', `${defaultBranch}..${branch}`],
        { cwd: projectDir, encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      if (commitLog) {
        lines.push('## コミット履歴');
        lines.push('```');
        lines.push(commitLog);
        lines.push('```');
        lines.push('');
      }
    } catch {
      // Ignore errors
    }
  }

  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}
