/**
 * Tests for multiline input state handling logic
 *
 * Tests the pure functions that handle state transformations for multiline text editing.
 * Key detection logic has been moved to useRawKeypress.ts - see rawKeypress.test.ts for those tests.
 */

import { describe, it, expect } from 'vitest';
import {
  handleCharacterInput,
  handleNewLine,
  handleBackspace,
  handleLeftArrow,
  handleRightArrow,
  handleUpArrow,
  handleDownArrow,
  getFullInput,
  createInitialState,
  type MultilineInputState,
} from '../interactive/multilineInputLogic.js';

// Helper to create state
function createState(overrides: Partial<MultilineInputState> = {}): MultilineInputState {
  return {
    lines: [''],
    currentLine: 0,
    cursor: 0,
    ...overrides,
  };
}

describe('Character input handling', () => {
  it('should insert single character at cursor position', () => {
    const state = createState({ lines: ['hello'], cursor: 5 });
    const result = handleCharacterInput(state, 'x');

    expect(result.lines).toEqual(['hellox']);
    expect(result.cursor).toBe(6);
  });

  it('should insert character in middle of text', () => {
    const state = createState({ lines: ['helo'], cursor: 2 });
    const result = handleCharacterInput(state, 'l');

    expect(result.lines).toEqual(['hello']);
    expect(result.cursor).toBe(3);
  });

  it('should handle multi-byte characters (Japanese)', () => {
    const state = createState({ lines: [''], cursor: 0 });
    const result = handleCharacterInput(state, 'こんにちは');

    expect(result.lines).toEqual(['こんにちは']);
    expect(result.cursor).toBe(5); // 5 characters
  });

  it('should insert multi-byte characters at correct position', () => {
    const state = createState({ lines: ['Hello'], cursor: 5 });
    const result = handleCharacterInput(state, '日本語');

    expect(result.lines).toEqual(['Hello日本語']);
    expect(result.cursor).toBe(8); // 5 + 3 characters
  });

  it('should handle empty input', () => {
    const state = createState({ lines: ['test'], cursor: 4 });
    const result = handleCharacterInput(state, '');

    expect(result).toEqual(state);
  });
});

describe('New line handling', () => {
  it('should split line at cursor position', () => {
    const state = createState({ lines: ['hello world'], cursor: 5 });
    const result = handleNewLine(state);

    expect(result.lines).toEqual(['hello', ' world']);
    expect(result.currentLine).toBe(1);
    expect(result.cursor).toBe(0);
  });

  it('should add empty line at end', () => {
    const state = createState({ lines: ['hello'], cursor: 5 });
    const result = handleNewLine(state);

    expect(result.lines).toEqual(['hello', '']);
    expect(result.currentLine).toBe(1);
    expect(result.cursor).toBe(0);
  });

  it('should add empty line at start', () => {
    const state = createState({ lines: ['hello'], cursor: 0 });
    const result = handleNewLine(state);

    expect(result.lines).toEqual(['', 'hello']);
    expect(result.currentLine).toBe(1);
    expect(result.cursor).toBe(0);
  });
});

describe('Backspace handling', () => {
  it('should delete character before cursor', () => {
    const state = createState({ lines: ['hello'], cursor: 5 });
    const result = handleBackspace(state);

    expect(result.lines).toEqual(['hell']);
    expect(result.cursor).toBe(4);
  });

  it('should delete character in middle of text', () => {
    const state = createState({ lines: ['hello'], cursor: 3 });
    const result = handleBackspace(state);

    expect(result.lines).toEqual(['helo']);
    expect(result.cursor).toBe(2);
  });

  it('should merge lines when at start of line', () => {
    const state = createState({
      lines: ['line1', 'line2'],
      currentLine: 1,
      cursor: 0,
    });
    const result = handleBackspace(state);

    expect(result.lines).toEqual(['line1line2']);
    expect(result.currentLine).toBe(0);
    expect(result.cursor).toBe(5); // After 'line1'
  });

  it('should do nothing at start of first line', () => {
    const state = createState({ lines: ['hello'], cursor: 0 });
    const result = handleBackspace(state);

    expect(result).toEqual(state);
  });
});

describe('Arrow key navigation', () => {
  describe('Left arrow', () => {
    it('should move cursor left', () => {
      const state = createState({ lines: ['hello'], cursor: 3 });
      const result = handleLeftArrow(state);

      expect(result.cursor).toBe(2);
    });

    it('should move to previous line at start', () => {
      const state = createState({
        lines: ['line1', 'line2'],
        currentLine: 1,
        cursor: 0,
      });
      const result = handleLeftArrow(state);

      expect(result.currentLine).toBe(0);
      expect(result.cursor).toBe(5);
    });

    it('should do nothing at start of first line', () => {
      const state = createState({ lines: ['hello'], cursor: 0 });
      const result = handleLeftArrow(state);

      expect(result).toEqual(state);
    });
  });

  describe('Right arrow', () => {
    it('should move cursor right', () => {
      const state = createState({ lines: ['hello'], cursor: 2 });
      const result = handleRightArrow(state);

      expect(result.cursor).toBe(3);
    });

    it('should move to next line at end', () => {
      const state = createState({
        lines: ['line1', 'line2'],
        currentLine: 0,
        cursor: 5,
      });
      const result = handleRightArrow(state);

      expect(result.currentLine).toBe(1);
      expect(result.cursor).toBe(0);
    });

    it('should do nothing at end of last line', () => {
      const state = createState({ lines: ['hello'], cursor: 5 });
      const result = handleRightArrow(state);

      expect(result).toEqual(state);
    });
  });

  describe('Up arrow', () => {
    it('should move to previous line', () => {
      const state = createState({
        lines: ['line1', 'line2'],
        currentLine: 1,
        cursor: 3,
      });
      const result = handleUpArrow(state);

      expect(result.currentLine).toBe(0);
      expect(result.cursor).toBe(3);
    });

    it('should adjust cursor if previous line is shorter', () => {
      const state = createState({
        lines: ['ab', 'longer'],
        currentLine: 1,
        cursor: 5,
      });
      const result = handleUpArrow(state);

      expect(result.currentLine).toBe(0);
      expect(result.cursor).toBe(2);
    });

    it('should do nothing on first line', () => {
      const state = createState({ lines: ['hello'], cursor: 3 });
      const result = handleUpArrow(state);

      expect(result).toEqual(state);
    });
  });

  describe('Down arrow', () => {
    it('should move to next line', () => {
      const state = createState({
        lines: ['line1', 'line2'],
        currentLine: 0,
        cursor: 3,
      });
      const result = handleDownArrow(state);

      expect(result.currentLine).toBe(1);
      expect(result.cursor).toBe(3);
    });

    it('should adjust cursor if next line is shorter', () => {
      const state = createState({
        lines: ['longer', 'ab'],
        currentLine: 0,
        cursor: 5,
      });
      const result = handleDownArrow(state);

      expect(result.currentLine).toBe(1);
      expect(result.cursor).toBe(2);
    });

    it('should do nothing on last line', () => {
      const state = createState({ lines: ['hello'], cursor: 3 });
      const result = handleDownArrow(state);

      expect(result).toEqual(state);
    });
  });
});

describe('Utility functions', () => {
  describe('getFullInput', () => {
    it('should join lines with newlines', () => {
      const state = createState({ lines: ['line1', 'line2', 'line3'] });
      expect(getFullInput(state)).toBe('line1\nline2\nline3');
    });

    it('should trim whitespace', () => {
      const state = createState({ lines: ['  hello  ', ''] });
      expect(getFullInput(state)).toBe('hello');
    });

    it('should return empty string for empty input', () => {
      const state = createState({ lines: ['', '   ', ''] });
      expect(getFullInput(state)).toBe('');
    });
  });

  describe('createInitialState', () => {
    it('should create empty state', () => {
      const state = createInitialState();

      expect(state.lines).toEqual(['']);
      expect(state.currentLine).toBe(0);
      expect(state.cursor).toBe(0);
    });
  });
});
