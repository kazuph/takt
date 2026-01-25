/**
 * Tests for Claude client utilities
 */

import { describe, it, expect } from 'vitest';
import {
  detectStatus,
  isRegexSafe,
  getBuiltinStatusPatterns,
} from '../claude/client.js';

describe('detectStatus', () => {
  it('should detect done status', () => {
    const content = 'Task completed successfully.\n[CODER:DONE]';
    const patterns = { done: '\\[CODER:DONE\\]' };
    expect(detectStatus(content, patterns)).toBe('done');
  });

  it('should detect approved status', () => {
    const content = 'Code looks good.\n[ARCHITECT:APPROVE]';
    const patterns = { approved: '\\[ARCHITECT:APPROVE\\]' };
    expect(detectStatus(content, patterns)).toBe('approved');
  });

  it('should return in_progress when no pattern matches', () => {
    const content = 'Working on it...';
    const patterns = { done: '\\[DONE\\]' };
    expect(detectStatus(content, patterns)).toBe('in_progress');
  });

  it('should be case insensitive', () => {
    const content = '[coder:done]';
    const patterns = { done: '\\[CODER:DONE\\]' };
    expect(detectStatus(content, patterns)).toBe('done');
  });

  it('should handle invalid regex gracefully', () => {
    const content = 'test';
    const patterns = { done: '[invalid(' };
    expect(detectStatus(content, patterns)).toBe('in_progress');
  });
});

describe('isRegexSafe', () => {
  it('should accept simple patterns', () => {
    expect(isRegexSafe('\\[DONE\\]')).toBe(true);
    expect(isRegexSafe('hello')).toBe(true);
    expect(isRegexSafe('^start')).toBe(true);
  });

  it('should reject patterns that are too long', () => {
    const longPattern = 'a'.repeat(201);
    expect(isRegexSafe(longPattern)).toBe(false);
  });

  it('should reject ReDoS patterns', () => {
    expect(isRegexSafe('(.*)*')).toBe(false);
    expect(isRegexSafe('(.+)+')).toBe(false);
    expect(isRegexSafe('(a|b)+')).toBe(false);
  });
});

describe('getBuiltinStatusPatterns', () => {
  it('should return patterns for coder', () => {
    const patterns = getBuiltinStatusPatterns('coder');
    expect(patterns.done).toBeDefined();
    expect(patterns.blocked).toBeDefined();
  });

  it('should return patterns for architect', () => {
    const patterns = getBuiltinStatusPatterns('architect');
    expect(patterns.approved).toBeDefined();
    expect(patterns.rejected).toBeDefined();
  });

  it('should return empty object for unknown agent', () => {
    const patterns = getBuiltinStatusPatterns('unknown');
    expect(patterns).toEqual({});
  });
});
