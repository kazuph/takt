/**
 * Input event handlers for multiline input
 *
 * Contains keypress and line handlers used by multiLineQuestion.
 */

import * as readline from 'node:readline';
import chalk from 'chalk';
import { createLogger } from '../utils/debug.js';
import { EscapeSequenceTracker } from './escape-tracker.js';
import { InputHistoryManager } from './history-manager.js';

const log = createLogger('input');

/** Key event interface for keypress handling */
export interface KeyEvent {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
}

/** State for multiline input session */
export interface MultilineInputState {
  lines: string[];
  insertNewlineOnNextLine: boolean;
  isFirstLine: boolean;
  promptStr: string;
}

/** Internal readline interface properties */
interface ReadlineInternal {
  line?: string;
  cursor?: number;
}

/** Get readline's internal line state */
export function getReadlineLine(rl: readline.Interface): string {
  const internal = rl as unknown as ReadlineInternal;
  return internal.line ?? '';
}

/** Set readline's internal line and cursor state */
export function setReadlineState(rl: readline.Interface, line: string, cursor: number): void {
  const internal = rl as unknown as ReadlineInternal;
  if ('line' in (rl as object)) {
    internal.line = line;
  }
  if ('cursor' in (rl as object)) {
    internal.cursor = cursor;
  }
}

/** Format a history entry for display (truncate multi-line entries) */
export function formatHistoryEntry(entry: string): string {
  const firstLine = entry.split('\n')[0] ?? '';
  const hasMoreLines = entry.includes('\n');
  return hasMoreLines ? firstLine + ' ...' : firstLine;
}

/**
 * Determines if a key event should trigger multi-line input mode.
 */
export function isMultilineInputTrigger(
  key: KeyEvent,
  escapeTracker: EscapeSequenceTracker
): boolean {
  const isEnterKey = key.name === 'return' || key.name === 'enter';
  const modifiedEnter = isEnterKey && (key.ctrl || key.meta || key.shift);
  const isCtrlJ = key.ctrl && (key.name === 'j' || key.sequence === '\n');
  const escapeSequences =
    key.sequence === '\x1b\r' ||
    key.sequence === '\u001b\r' ||
    key.sequence === '\x1bOM' ||
    key.sequence === '\u001bOM';
  const iterm2Style = isEnterKey && escapeTracker.isEscapeThenEnter();

  const result = modifiedEnter || isCtrlJ || escapeSequences || iterm2Style;

  if (isEnterKey || escapeSequences) {
    log.debug('isMultilineInputTrigger', {
      isEnterKey, modifiedEnter, isCtrlJ, escapeSequences, iterm2Style, result,
    });
  }

  return result;
}

/** Check if a line ends with backslash for line continuation */
export function hasBackslashContinuation(line: string): boolean {
  let backslashCount = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

/** Remove trailing backslash used for line continuation */
export function removeBackslashContinuation(line: string): string {
  if (hasBackslashContinuation(line)) {
    return line.slice(0, -1);
  }
  return line;
}

/**
 * Create keypress handler for multiline input.
 */
export function createKeypressHandler(
  rl: readline.Interface,
  state: MultilineInputState,
  escapeTracker: EscapeSequenceTracker,
  historyManager: InputHistoryManager
): (str: string | undefined, key: KeyEvent) => void {
  const replaceCurrentLine = (newContent: string): void => {
    const currentLine = getReadlineLine(rl);
    process.stdout.write('\r' + state.promptStr);
    process.stdout.write(' '.repeat(currentLine.length));
    process.stdout.write('\r' + state.promptStr + newContent);
    setReadlineState(rl, newContent, newContent.length);
  };

  return (_str: string | undefined, key: KeyEvent): void => {
    if (!key) return;

    const seqHex = key.sequence
      ? [...key.sequence].map(c => '0x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
      : '(none)';
    log.debug('keypress', {
      name: key.name, sequence: seqHex, ctrl: key.ctrl, meta: key.meta, shift: key.shift,
    });

    if (key.name === 'escape' || key.sequence === '\x1b') {
      escapeTracker.trackEscape();
    }

    if (isMultilineInputTrigger(key, escapeTracker)) {
      state.insertNewlineOnNextLine = true;
      return;
    }

    if (!state.isFirstLine) return;

    if (key.name === 'up' && historyManager.length > 0) {
      historyManager.saveCurrentInput(getReadlineLine(rl));
      const entry = historyManager.navigatePrevious();
      if (entry !== undefined) {
        replaceCurrentLine(formatHistoryEntry(entry));
      }
      return;
    }

    if (key.name === 'down') {
      const result = historyManager.navigateNext();
      if (result !== undefined) {
        const displayText = result.isCurrentInput ? result.entry : formatHistoryEntry(result.entry);
        replaceCurrentLine(displayText);
      }
    }
  };
}

/**
 * Create line handler for multiline input.
 */
export function createLineHandler(
  rl: readline.Interface,
  state: MultilineInputState,
  historyManager: InputHistoryManager,
  cleanup: () => void,
  resolve: (value: string) => void
): (line: string) => void {
  const showPrompt = (): void => {
    const prefix = state.isFirstLine ? state.promptStr : chalk.gray('... ');
    rl.setPrompt(prefix);
    rl.prompt();
  };

  return (line: string): void => {
    const hasBackslash = hasBackslashContinuation(line);
    log.debug('handleLine', { line, insertNewlineOnNextLine: state.insertNewlineOnNextLine, hasBackslash });

    if (state.insertNewlineOnNextLine || hasBackslash) {
      const cleanLine = hasBackslash ? removeBackslashContinuation(line) : line;
      state.lines.push(cleanLine);
      state.isFirstLine = false;
      state.insertNewlineOnNextLine = false;
      showPrompt();
    } else {
      cleanup();

      if (historyManager.isAtHistoryEntry() && state.isFirstLine) {
        const historyEntry = historyManager.getCurrentEntry();
        if (historyEntry !== undefined) {
          resolve(historyEntry);
          return;
        }
      }

      state.lines.push(line);
      resolve(state.lines.join('\n'));
    }
  };
}

/**
 * Create SIGINT handler for multiline input.
 */
export function createSigintHandler(
  rl: readline.Interface,
  state: MultilineInputState,
  historyManager: InputHistoryManager,
  onCtrlC: () => boolean | void,
  cleanup: () => void,
  resolve: (value: string) => void
): () => void {
  const showPrompt = (): void => {
    const prefix = state.isFirstLine ? state.promptStr : chalk.gray('... ');
    rl.setPrompt(prefix);
    rl.prompt();
  };

  return (): void => {
    if (state.lines.length > 0) {
      state.lines.length = 0;
      state.isFirstLine = true;
      state.insertNewlineOnNextLine = false;
      historyManager.resetIndex();
      console.log();
      showPrompt();
      return;
    }

    const shouldCancel = onCtrlC();
    if (shouldCancel === true) {
      cleanup();
      resolve('');
    }
  };
}
