/**
 * Tests for input handling module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  InputHistoryManager,
  EscapeSequenceTracker,
  isMultilineInputTrigger,
  hasBackslashContinuation,
  removeBackslashContinuation,
  type KeyEvent,
} from '../interactive/input.js';
import { loadInputHistory, saveInputHistory } from '../config/paths.js';

describe('InputHistoryManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `takt-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should load existing history from file', () => {
      saveInputHistory(testDir, ['entry1', 'entry2']);

      const manager = new InputHistoryManager(testDir);

      expect(manager.getHistory()).toEqual(['entry1', 'entry2']);
    });

    it('should start with empty history if no file exists', () => {
      const manager = new InputHistoryManager(testDir);

      expect(manager.getHistory()).toEqual([]);
    });

    it('should initialize index at end of history', () => {
      saveInputHistory(testDir, ['entry1', 'entry2']);

      const manager = new InputHistoryManager(testDir);

      expect(manager.getIndex()).toBe(2);
      expect(manager.isAtHistoryEntry()).toBe(false);
    });
  });

  describe('add', () => {
    it('should add entry and persist to file', () => {
      const manager = new InputHistoryManager(testDir);

      manager.add('new entry');

      expect(manager.getHistory()).toEqual(['new entry']);
      expect(loadInputHistory(testDir)).toEqual(['new entry']);
    });

    it('should not add consecutive duplicates', () => {
      const manager = new InputHistoryManager(testDir);

      manager.add('same');
      manager.add('same');

      expect(manager.getHistory()).toEqual(['same']);
    });

    it('should allow non-consecutive duplicates', () => {
      const manager = new InputHistoryManager(testDir);

      manager.add('first');
      manager.add('second');
      manager.add('first');

      expect(manager.getHistory()).toEqual(['first', 'second', 'first']);
    });
  });

  describe('navigation', () => {
    it('should navigate to previous entry', () => {
      saveInputHistory(testDir, ['entry1', 'entry2', 'entry3']);
      const manager = new InputHistoryManager(testDir);

      const entry1 = manager.navigatePrevious();
      const entry2 = manager.navigatePrevious();

      expect(entry1).toBe('entry3');
      expect(entry2).toBe('entry2');
      expect(manager.getIndex()).toBe(1);
    });

    it('should return undefined when at start of history', () => {
      saveInputHistory(testDir, ['entry1']);
      const manager = new InputHistoryManager(testDir);

      manager.navigatePrevious(); // Move to entry1
      const result = manager.navigatePrevious(); // Try to go further back

      expect(result).toBeUndefined();
      expect(manager.getIndex()).toBe(0);
    });

    it('should navigate to next entry', () => {
      saveInputHistory(testDir, ['entry1', 'entry2']);
      const manager = new InputHistoryManager(testDir);

      manager.navigatePrevious(); // entry2
      manager.navigatePrevious(); // entry1
      const result = manager.navigateNext();

      expect(result).toEqual({ entry: 'entry2', isCurrentInput: false });
      expect(manager.getIndex()).toBe(1);
    });

    it('should return current input when navigating past end', () => {
      saveInputHistory(testDir, ['entry1']);
      const manager = new InputHistoryManager(testDir);

      manager.saveCurrentInput('my current input');
      manager.navigatePrevious(); // entry1
      const result = manager.navigateNext(); // back to current

      expect(result).toEqual({ entry: 'my current input', isCurrentInput: true });
      expect(manager.isAtHistoryEntry()).toBe(false);
    });

    it('should return undefined when already at end', () => {
      const manager = new InputHistoryManager(testDir);

      const result = manager.navigateNext();

      expect(result).toBeUndefined();
    });
  });

  describe('resetIndex', () => {
    it('should reset index to end of history', () => {
      saveInputHistory(testDir, ['entry1', 'entry2']);
      const manager = new InputHistoryManager(testDir);

      manager.navigatePrevious();
      manager.navigatePrevious();
      manager.resetIndex();

      expect(manager.getIndex()).toBe(2);
      expect(manager.isAtHistoryEntry()).toBe(false);
    });

    it('should clear saved current input', () => {
      const manager = new InputHistoryManager(testDir);

      manager.saveCurrentInput('some input');
      manager.resetIndex();

      expect(manager.getCurrentInput()).toBe('');
    });
  });

  describe('getCurrentEntry', () => {
    it('should return entry at current index', () => {
      saveInputHistory(testDir, ['entry1', 'entry2']);
      const manager = new InputHistoryManager(testDir);

      manager.navigatePrevious(); // entry2

      expect(manager.getCurrentEntry()).toBe('entry2');
    });

    it('should return undefined when at end of history', () => {
      saveInputHistory(testDir, ['entry1']);
      const manager = new InputHistoryManager(testDir);

      expect(manager.getCurrentEntry()).toBeUndefined();
    });
  });

  describe('length', () => {
    it('should return history length', () => {
      saveInputHistory(testDir, ['entry1', 'entry2', 'entry3']);
      const manager = new InputHistoryManager(testDir);

      expect(manager.length).toBe(3);
    });

    it('should update after adding entries', () => {
      const manager = new InputHistoryManager(testDir);

      expect(manager.length).toBe(0);

      manager.add('entry1');
      expect(manager.length).toBe(1);

      manager.add('entry2');
      expect(manager.length).toBe(2);
    });
  });
});

describe('EscapeSequenceTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default threshold of 50ms', () => {
      const tracker = new EscapeSequenceTracker();
      expect(tracker.getThreshold()).toBe(50);
    });

    it('should accept custom threshold', () => {
      const tracker = new EscapeSequenceTracker(100);
      expect(tracker.getThreshold()).toBe(100);
    });
  });

  describe('isEscapeThenEnter', () => {
    it('should return true when Enter is pressed within threshold after Escape', () => {
      const tracker = new EscapeSequenceTracker(50);

      tracker.trackEscape();
      vi.advanceTimersByTime(30); // 30ms later

      expect(tracker.isEscapeThenEnter()).toBe(true);
    });

    it('should return false when Enter is pressed after threshold', () => {
      const tracker = new EscapeSequenceTracker(50);

      tracker.trackEscape();
      vi.advanceTimersByTime(60); // 60ms later (exceeds 50ms threshold)

      expect(tracker.isEscapeThenEnter()).toBe(false);
    });

    it('should return false when Escape was never pressed', () => {
      const tracker = new EscapeSequenceTracker();

      expect(tracker.isEscapeThenEnter()).toBe(false);
    });

    it('should reset after returning true (prevent repeated triggers)', () => {
      const tracker = new EscapeSequenceTracker(50);

      tracker.trackEscape();
      vi.advanceTimersByTime(30);

      expect(tracker.isEscapeThenEnter()).toBe(true);
      // Second call should return false (already reset)
      expect(tracker.isEscapeThenEnter()).toBe(false);
    });

    it('should not reset when returning false', () => {
      const tracker = new EscapeSequenceTracker(50);

      tracker.trackEscape();
      vi.advanceTimersByTime(60); // Over threshold

      expect(tracker.isEscapeThenEnter()).toBe(false);
      // Tracker should still have lastEscapeTime = 0 after false return
      // New escape tracking should work
      tracker.trackEscape();
      vi.advanceTimersByTime(30);
      expect(tracker.isEscapeThenEnter()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear the tracked escape time', () => {
      const tracker = new EscapeSequenceTracker(50);

      tracker.trackEscape();
      tracker.reset();
      vi.advanceTimersByTime(10); // Within threshold

      expect(tracker.isEscapeThenEnter()).toBe(false);
    });
  });
});

describe('isMultilineInputTrigger', () => {
  let tracker: EscapeSequenceTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new EscapeSequenceTracker(50);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createKey = (overrides: Partial<KeyEvent>): KeyEvent => ({
    name: undefined,
    ctrl: false,
    meta: false,
    shift: false,
    sequence: undefined,
    ...overrides,
  });

  describe('Ctrl+Enter', () => {
    it('should return true for Ctrl+Enter', () => {
      const key = createKey({ name: 'return', ctrl: true });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });

    it('should return true for Ctrl+Enter with "enter" name', () => {
      const key = createKey({ name: 'enter', ctrl: true });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });
  });

  describe('Ctrl+J', () => {
    it('should return true for Ctrl+J', () => {
      const key = createKey({ name: 'j', ctrl: true });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });

    it('should return true for Ctrl with linefeed sequence', () => {
      const key = createKey({ ctrl: true, sequence: '\n' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });
  });

  describe('Option+Enter (meta flag)', () => {
    it('should return true for meta+Enter', () => {
      const key = createKey({ name: 'return', meta: true });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });
  });

  describe('Shift+Enter', () => {
    it('should return true for Shift+Enter', () => {
      const key = createKey({ name: 'return', shift: true });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });
  });

  describe('Escape sequences', () => {
    it('should return true for \\x1b\\r sequence (Terminal.app)', () => {
      const key = createKey({ sequence: '\x1b\r' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });

    it('should return true for \\u001b\\r sequence', () => {
      const key = createKey({ sequence: '\u001b\r' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });

    it('should return true for \\x1bOM sequence', () => {
      const key = createKey({ sequence: '\x1bOM' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });
  });

  describe('iTerm2-style Escape+Enter', () => {
    it('should return true for Enter pressed within threshold after Escape', () => {
      tracker.trackEscape();
      vi.advanceTimersByTime(30);

      const key = createKey({ name: 'return' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(true);
    });

    it('should return false for Enter pressed after threshold', () => {
      tracker.trackEscape();
      vi.advanceTimersByTime(60);

      const key = createKey({ name: 'return' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(false);
    });
  });

  describe('Non-trigger keys', () => {
    it('should return false for plain Enter', () => {
      const key = createKey({ name: 'return' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(false);
    });

    it('should return false for other keys', () => {
      const key = createKey({ name: 'a' });
      expect(isMultilineInputTrigger(key, tracker)).toBe(false);
    });

    it('should return false for Ctrl without Enter/J', () => {
      const key = createKey({ name: 'k', ctrl: true });
      expect(isMultilineInputTrigger(key, tracker)).toBe(false);
    });
  });
});

describe('hasBackslashContinuation', () => {
  it('should return true for line ending with single backslash', () => {
    expect(hasBackslashContinuation('hello world\\')).toBe(true);
  });

  it('should return false for line ending with double backslash (escaped)', () => {
    expect(hasBackslashContinuation('hello world\\\\')).toBe(false);
  });

  it('should return true for line ending with triple backslash', () => {
    expect(hasBackslashContinuation('hello world\\\\\\')).toBe(true);
  });

  it('should return false for line without trailing backslash', () => {
    expect(hasBackslashContinuation('hello world')).toBe(false);
  });

  it('should return false for empty line', () => {
    expect(hasBackslashContinuation('')).toBe(false);
  });

  it('should return true for just a backslash', () => {
    expect(hasBackslashContinuation('\\')).toBe(true);
  });

  it('should handle backslash in middle of line', () => {
    expect(hasBackslashContinuation('path\\to\\file')).toBe(false);
    expect(hasBackslashContinuation('path\\to\\file\\')).toBe(true);
  });
});

describe('removeBackslashContinuation', () => {
  it('should remove trailing backslash', () => {
    expect(removeBackslashContinuation('hello world\\')).toBe('hello world');
  });

  it('should not modify line without trailing backslash', () => {
    expect(removeBackslashContinuation('hello world')).toBe('hello world');
  });

  it('should not remove escaped backslash (double)', () => {
    expect(removeBackslashContinuation('hello world\\\\')).toBe('hello world\\\\');
  });

  it('should remove only the continuation backslash from triple', () => {
    expect(removeBackslashContinuation('hello world\\\\\\')).toBe('hello world\\\\');
  });

  it('should handle empty string', () => {
    expect(removeBackslashContinuation('')).toBe('');
  });

  it('should handle just a backslash', () => {
    expect(removeBackslashContinuation('\\')).toBe('');
  });
});
