/**
 * Interactive cursor-based selection menus.
 *
 * Provides arrow-key navigation for option selection in the terminal.
 */

import chalk from 'chalk';
import { truncateText } from '../utils/index.js';

/** Option type for selectOption */
export interface SelectOptionItem<T extends string> {
  label: string;
  value: T;
  description?: string;
  details?: string[];
}

/**
 * Render the menu options to the terminal.
 * Exported for testing.
 */
export function renderMenu<T extends string>(
  options: SelectOptionItem<T>[],
  selectedIndex: number,
  hasCancelOption: boolean,
): string[] {
  const maxWidth = process.stdout.columns || 80;
  const labelPrefix = 4;
  const descPrefix = 5;
  const detailPrefix = 9;

  const lines: string[] = [];

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    const isSelected = i === selectedIndex;
    const cursor = isSelected ? chalk.cyan('❯') : ' ';
    const truncatedLabel = truncateText(opt.label, maxWidth - labelPrefix);
    const label = isSelected ? chalk.cyan.bold(truncatedLabel) : truncatedLabel;
    lines.push(`  ${cursor} ${label}`);

    if (opt.description) {
      const truncatedDesc = truncateText(opt.description, maxWidth - descPrefix);
      lines.push(chalk.gray(`     ${truncatedDesc}`));
    }
    if (opt.details && opt.details.length > 0) {
      for (const detail of opt.details) {
        const truncatedDetail = truncateText(detail, maxWidth - detailPrefix);
        lines.push(chalk.dim(`       • ${truncatedDetail}`));
      }
    }
  }

  if (hasCancelOption) {
    const isCancelSelected = selectedIndex === options.length;
    const cursor = isCancelSelected ? chalk.cyan('❯') : ' ';
    const label = isCancelSelected ? chalk.cyan.bold('Cancel') : chalk.gray('Cancel');
    lines.push(`  ${cursor} ${label}`);
  }

  return lines;
}

/**
 * Count total rendered lines for a set of options.
 * Exported for testing.
 */
export function countRenderedLines<T extends string>(
  options: SelectOptionItem<T>[],
  hasCancelOption: boolean,
): number {
  let count = 0;
  for (const opt of options) {
    count++;
    if (opt.description) count++;
    if (opt.details) count += opt.details.length;
  }
  if (hasCancelOption) count++;
  return count;
}

/** Result of handling a key input */
export type KeyInputResult =
  | { action: 'move'; newIndex: number }
  | { action: 'confirm'; selectedIndex: number }
  | { action: 'cancel'; cancelIndex: number }
  | { action: 'exit' }
  | { action: 'none' };

/**
 * Pure function for key input state transitions.
 * Exported for testing.
 */
export function handleKeyInput(
  key: string,
  currentIndex: number,
  totalItems: number,
  hasCancelOption: boolean,
  optionCount: number,
): KeyInputResult {
  if (key === '\x1B[A' || key === 'k') {
    return { action: 'move', newIndex: (currentIndex - 1 + totalItems) % totalItems };
  }
  if (key === '\x1B[B' || key === 'j') {
    return { action: 'move', newIndex: (currentIndex + 1) % totalItems };
  }
  if (key === '\r' || key === '\n') {
    return { action: 'confirm', selectedIndex: currentIndex };
  }
  if (key === '\x03') {
    return { action: 'exit' };
  }
  if (key === '\x1B') {
    return { action: 'cancel', cancelIndex: hasCancelOption ? optionCount : -1 };
  }
  return { action: 'none' };
}

/** Print the menu header (message + hint). */
function printHeader(message: string): void {
  console.log();
  console.log(chalk.cyan(message));
  console.log(chalk.gray('  (↑↓ to move, Enter to select)'));
  console.log();
}

/** Set up raw mode on stdin and return cleanup function. */
function setupRawMode(): { cleanup: (listener: (data: Buffer) => void) => void; wasRaw: boolean } {
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return {
    wasRaw,
    cleanup(listener: (data: Buffer) => void): void {
      process.stdin.removeListener('data', listener);
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
    },
  };
}

/** Redraw the menu using relative cursor movement. */
function redrawMenu<T extends string>(
  options: SelectOptionItem<T>[],
  selectedIndex: number,
  hasCancelOption: boolean,
  totalLines: number,
): void {
  process.stdout.write(`\x1B[${totalLines}A`);
  process.stdout.write('\x1B[J');
  const newLines = renderMenu(options, selectedIndex, hasCancelOption);
  process.stdout.write(newLines.join('\n') + '\n');
}

/** Interactive cursor-based menu selection. */
function interactiveSelect<T extends string>(
  message: string,
  options: SelectOptionItem<T>[],
  initialIndex: number,
  hasCancelOption: boolean,
): Promise<number> {
  return new Promise((resolve) => {
    const totalItems = hasCancelOption ? options.length + 1 : options.length;
    let selectedIndex = initialIndex;

    printHeader(message);

    process.stdout.write('\x1B[?7l');

    const totalLines = countRenderedLines(options, hasCancelOption);
    const lines = renderMenu(options, selectedIndex, hasCancelOption);
    process.stdout.write(lines.join('\n') + '\n');

    if (!process.stdin.isTTY) {
      process.stdout.write('\x1B[?7h');
      resolve(initialIndex);
      return;
    }

    const rawMode = setupRawMode();

    const cleanup = (listener: (data: Buffer) => void): void => {
      rawMode.cleanup(listener);
      process.stdout.write('\x1B[?7h');
    };

    const onKeypress = (data: Buffer): void => {
      const result = handleKeyInput(
        data.toString(),
        selectedIndex,
        totalItems,
        hasCancelOption,
        options.length,
      );

      switch (result.action) {
        case 'move':
          selectedIndex = result.newIndex;
          redrawMenu(options, selectedIndex, hasCancelOption, totalLines);
          break;
        case 'confirm':
          cleanup(onKeypress);
          resolve(result.selectedIndex);
          break;
        case 'cancel':
          cleanup(onKeypress);
          resolve(result.cancelIndex);
          break;
        case 'exit':
          cleanup(onKeypress);
          process.exit(130);
          break;
        case 'none':
          break;
      }
    };

    process.stdin.on('data', onKeypress);
  });
}

/**
 * Prompt user to select from a list of options using cursor navigation.
 * @returns Selected option or null if cancelled
 */
export async function selectOption<T extends string>(
  message: string,
  options: SelectOptionItem<T>[],
): Promise<T | null> {
  if (options.length === 0) return null;

  const selectedIndex = await interactiveSelect(message, options, 0, true);

  if (selectedIndex === options.length || selectedIndex === -1) {
    return null;
  }

  const selected = options[selectedIndex];
  if (selected) {
    console.log(chalk.green(`  ✓ ${selected.label}`));
    return selected.value;
  }

  return null;
}

/**
 * Prompt user to select from a list of options with a default value.
 * @returns Selected option value, or null if cancelled (ESC pressed)
 */
export async function selectOptionWithDefault<T extends string>(
  message: string,
  options: { label: string; value: T }[],
  defaultValue: T,
): Promise<T | null> {
  if (options.length === 0) return defaultValue;

  const defaultIndex = options.findIndex((opt) => opt.value === defaultValue);
  const initialIndex = defaultIndex >= 0 ? defaultIndex : 0;

  const decoratedOptions: SelectOptionItem<T>[] = options.map((opt) => ({
    ...opt,
    label: opt.value === defaultValue ? `${opt.label} ${chalk.green('(default)')}` : opt.label,
  }));

  const selectedIndex = await interactiveSelect(message, decoratedOptions, initialIndex, true);

  if (selectedIndex === options.length || selectedIndex === -1) {
    return null;
  }

  const selected = options[selectedIndex];
  if (selected) {
    console.log(chalk.green(`  ✓ ${selected.label}`));
    return selected.value;
  }

  return defaultValue;
}
