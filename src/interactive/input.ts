/**
 * Input handling module for takt interactive mode
 *
 * Handles readline interface, multi-line input, and input history management.
 *
 * Multi-line input methods:
 * - Ctrl+J: Works on all terminals (recommended for mac Terminal.app)
 * - Ctrl+Enter: Works on terminals that support it
 * - Option+Enter: Works on iTerm2 and some other Mac terminals
 * - Backslash continuation: End line with \ to continue on next line
 */

import * as readline from 'node:readline';
import { emitKeypressEvents } from 'node:readline';
import { EscapeSequenceTracker } from './escape-tracker.js';
import { InputHistoryManager } from './history-manager.js';
import {
  createKeypressHandler,
  createLineHandler,
  createSigintHandler,
  type MultilineInputState,
} from './input-handlers.js';

// Re-export for backward compatibility
export { EscapeSequenceTracker } from './escape-tracker.js';
export { InputHistoryManager } from './history-manager.js';
export {
  isMultilineInputTrigger,
  hasBackslashContinuation,
  removeBackslashContinuation,
  type KeyEvent,
} from './input-handlers.js';

/** Create readline interface with keypress support */
export function createReadlineInterface(): readline.Interface {
  if (process.stdin.isTTY) {
    emitKeypressEvents(process.stdin);
  }

  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/** Options for multiLineQuestion */
export interface MultiLineQuestionOptions {
  promptStr: string;
  /**
   * Callback when Ctrl+C is pressed on the first line (no accumulated input).
   * Return `true` to cancel and resolve with empty string.
   * Return `void` or `false` to continue input (REPL behavior).
   */
  onCtrlC: () => boolean | void;
  historyManager: InputHistoryManager;
}

/**
 * Multi-line input using standard readline with Option+Return support and input history.
 *
 * This approach preserves all readline features (arrow keys, history, etc.)
 * while adding multi-line support via keypress event interception.
 *
 * - Enter: submit input (execute)
 * - Option+Enter (Mac) / Ctrl+Enter: insert newline (multi-line input)
 * - Up Arrow: navigate to previous input in history
 * - Down Arrow: navigate to next input in history
 * - Ctrl+C: interrupt / cancel
 */
export function multiLineQuestion(
  rl: readline.Interface,
  options: MultiLineQuestionOptions
): Promise<string> {
  const { promptStr, onCtrlC, historyManager } = options;

  return new Promise((resolve) => {
    const state: MultilineInputState = {
      lines: [],
      insertNewlineOnNextLine: false,
      isFirstLine: true,
      promptStr,
    };

    const escapeTracker = new EscapeSequenceTracker();
    historyManager.resetIndex();

    const cleanup = (): void => {
      process.stdin.removeListener('keypress', handleKeypress);
      rl.removeListener('line', handleLine);
      rl.removeListener('close', handleClose);
      rl.removeListener('SIGINT', handleSigint);
    };

    const handleKeypress = createKeypressHandler(rl, state, escapeTracker, historyManager);
    const handleLine = createLineHandler(rl, state, historyManager, cleanup, resolve);
    const handleSigint = createSigintHandler(rl, state, historyManager, onCtrlC, cleanup, resolve);

    const handleClose = (): void => {
      cleanup();
      resolve(state.lines.length > 0 ? state.lines.join('\n') : '');
    };

    process.stdin.on('keypress', handleKeypress);
    rl.on('line', handleLine);
    rl.on('close', handleClose);
    rl.on('SIGINT', handleSigint);

    rl.setPrompt(promptStr);
    rl.prompt();
  });
}
