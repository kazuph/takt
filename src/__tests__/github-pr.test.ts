/**
 * Tests for github/pr module
 *
 * Tests buildPrBody formatting.
 * createPullRequest/pushBranch call `gh`/`git` CLI, not unit-tested here.
 */

import { describe, it, expect } from 'vitest';
import { buildPrBody } from '../github/pr.js';
import type { GitHubIssue } from '../github/types.js';

describe('buildPrBody', () => {
  it('should build body with issue and report', () => {
    const issue: GitHubIssue = {
      number: 99,
      title: 'Add login feature',
      body: 'Implement username/password authentication.',
      labels: [],
      comments: [],
    };

    const result = buildPrBody(issue, 'Workflow `default` completed.');

    expect(result).toContain('## Summary');
    expect(result).toContain('Implement username/password authentication.');
    expect(result).toContain('## Execution Report');
    expect(result).toContain('Workflow `default` completed.');
    expect(result).toContain('Closes #99');
  });

  it('should use title when body is empty', () => {
    const issue: GitHubIssue = {
      number: 10,
      title: 'Fix bug',
      body: '',
      labels: [],
      comments: [],
    };

    const result = buildPrBody(issue, 'Done.');

    expect(result).toContain('Fix bug');
    expect(result).toContain('Closes #10');
  });

  it('should build body without issue', () => {
    const result = buildPrBody(undefined, 'Task completed.');

    expect(result).toContain('## Summary');
    expect(result).toContain('## Execution Report');
    expect(result).toContain('Task completed.');
    expect(result).not.toContain('Closes');
  });
});
