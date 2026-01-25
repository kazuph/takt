/**
 * Input history management with persistence
 *
 * Manages input history for the interactive REPL, providing:
 * - In-memory history for session use
 * - Persistent storage for cross-session recall
 * - Navigation through history entries
 */

import {
  loadInputHistory,
  saveInputHistory,
} from '../config/paths.js';

/**
 * Manages input history with persistence.
 * Provides a unified interface for in-memory and file-based history.
 */
export class InputHistoryManager {
  private history: string[];
  private readonly projectDir: string;
  private index: number;
  private currentInput: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.history = loadInputHistory(projectDir);
    this.index = this.history.length;
    this.currentInput = '';
  }

  /** Add an entry to history (both in-memory and persistent) */
  add(input: string): void {
    // Don't add consecutive duplicates
    if (this.history[this.history.length - 1] !== input) {
      this.history.push(input);
      saveInputHistory(this.projectDir, this.history);
    }
  }

  /** Get the current history array (read-only) */
  getHistory(): readonly string[] {
    return this.history;
  }

  /** Get the current history index */
  getIndex(): number {
    return this.index;
  }

  /** Reset index to the end of history */
  resetIndex(): void {
    this.index = this.history.length;
    this.currentInput = '';
  }

  /** Save the current input before navigating history */
  saveCurrentInput(input: string): void {
    if (this.index === this.history.length) {
      this.currentInput = input;
    }
  }

  /** Get the saved current input */
  getCurrentInput(): string {
    return this.currentInput;
  }

  /** Navigate to the previous entry. Returns the entry or undefined if at start. */
  navigatePrevious(): string | undefined {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    return undefined;
  }

  /** Navigate to the next entry. Returns the entry, current input at end, or undefined. */
  navigateNext(): { entry: string; isCurrentInput: boolean } | undefined {
    if (this.index < this.history.length) {
      this.index++;
      if (this.index === this.history.length) {
        return { entry: this.currentInput, isCurrentInput: true };
      }
      const entry = this.history[this.index];
      if (entry !== undefined) {
        return { entry, isCurrentInput: false };
      }
    }
    return undefined;
  }

  /** Check if currently at a history entry (not at the end) */
  isAtHistoryEntry(): boolean {
    return this.index < this.history.length;
  }

  /** Get the entry at the current index */
  getCurrentEntry(): string | undefined {
    return this.history[this.index];
  }

  /** Get the total number of history entries */
  get length(): number {
    return this.history.length;
  }
}
