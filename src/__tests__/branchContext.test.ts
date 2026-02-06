/**
 * Tests for branchContext builder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { buildBranchContext } from '../infra/task/branchContext.js';

const mockExecFileSync = vi.mocked(execFileSync);

describe('buildBranchContext', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('should include original instruction, diff stat, and commit log', () => {
    mockExecFileSync
      .mockReturnValueOnce('src/index.ts | 2 +-\n1 file changed, 1 insertion(+), 1 deletion(-)')
      .mockReturnValueOnce('abcd123 fix: sample change');

    const result = buildBranchContext('/repo', 'takt/branch', {
      defaultBranch: 'main',
      originalInstruction: 'Fix the issue',
    });

    expect(result).toContain('## 元の依頼');
    expect(result).toContain('Fix the issue');
    expect(result).toContain('## 現在の変更内容（mainからの差分）');
    expect(result).toContain('src/index.ts');
    expect(result).toContain('## コミット履歴');
    expect(result).toContain('abcd123');
  });
});
