/**
 * Tests for ask prompt builder
 */

import { describe, it, expect } from 'vitest';
import { buildAskPrompt } from '../commands/ask.js';

describe('buildAskPrompt', () => {
  it('should include task, workflow, branch, context, and question', () => {
    const prompt = buildAskPrompt({
      task: 'Fix cron Slack posting',
      workflow: 'default',
      branch: 'takt/branch',
      context: 'diff summary',
      question: 'What was changed?',
    });

    expect(prompt).toContain('## タスク');
    expect(prompt).toContain('Fix cron Slack posting');
    expect(prompt).toContain('## ワークフロー');
    expect(prompt).toContain('default');
    expect(prompt).toContain('## ブランチ');
    expect(prompt).toContain('takt/branch');
    expect(prompt).toContain('## 変更内容の要約');
    expect(prompt).toContain('diff summary');
    expect(prompt).toContain('## 質問');
    expect(prompt).toContain('What was changed?');
  });
});
