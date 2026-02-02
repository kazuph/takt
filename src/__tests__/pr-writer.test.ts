import { describe, it, expect } from 'vitest';
import { __test__ } from '../github/pr-writer.js';

describe('pr-writer parse', () => {
  it('parses title and body', () => {
    const output = [
      '[PR:1]',
      'title: Fix cron posting',
      'body:',
      '## Summary',
      '- Fix cron handler',
      '',
      '## Tests',
      '- npm test',
    ].join('\n');

    const result = __test__.parsePrDraft(output);
    expect(result.title).toBe('Fix cron posting');
    expect(result.body).toContain('## Summary');
  });

  it('throws when missing tag', () => {
    expect(() => __test__.parsePrDraft('title: A\nbody:\nX')).toThrow();
  });
});
