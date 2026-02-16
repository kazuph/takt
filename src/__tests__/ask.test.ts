/**
 * Tests for ask prompt builder
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../infra/config/index.js', () => ({
  loadGlobalConfig: vi.fn(),
}));

vi.mock('../infra/task/index.js', () => ({
  buildBranchContext: vi.fn(),
}));

vi.mock('../infra/providers/index.js', () => ({
  getProvider: vi.fn(),
}));

vi.mock('../shared/context.js', () => ({
  isQuietMode: vi.fn(),
}));

vi.mock('../shared/ui/index.js', () => ({
  StreamDisplay: class MockStreamDisplay {
    createHandler = vi.fn();
    flush = vi.fn();
  },
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../shared/utils/index.js', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn() })),
  getErrorMessage: vi.fn(),
}));

import { buildAskPrompt } from '../features/tasks/execute/ask.js';

describe('buildAskPrompt', () => {
  it('should include task, piece, branch, context, and question', () => {
    const prompt = buildAskPrompt({
      task: 'Fix cron Slack posting',
      piece: 'default',
      branch: 'takt/branch',
      context: 'diff summary',
      question: 'What was changed?',
    });

    expect(prompt).toContain('## タスク');
    expect(prompt).toContain('Fix cron Slack posting');
    expect(prompt).toContain('## ピース');
    expect(prompt).toContain('default');
    expect(prompt).toContain('## ブランチ');
    expect(prompt).toContain('takt/branch');
    expect(prompt).toContain('## 変更内容の要約');
    expect(prompt).toContain('diff summary');
    expect(prompt).toContain('## 質問');
    expect(prompt).toContain('What was changed?');
  });
});
