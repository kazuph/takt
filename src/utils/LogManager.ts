/**
 * Log level management and formatted console output.
 *
 * LogManager is a singleton that encapsulates the current log level state.
 * Module-level functions are provided for backward compatibility.
 */

import chalk from 'chalk';

/** Log levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Log level priorities */
const LOG_PRIORITIES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Manages console log output level and provides formatted logging.
 * Singleton — use LogManager.getInstance().
 */
export class LogManager {
  private static instance: LogManager | null = null;
  private currentLogLevel: LogLevel = 'info';

  private constructor() {}

  static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  /** Reset singleton for testing */
  static resetInstance(): void {
    LogManager.instance = null;
  }

  /** Set log level */
  setLogLevel(level: LogLevel): void {
    this.currentLogLevel = level;
  }

  /** Check if a log level should be shown */
  shouldLog(level: LogLevel): boolean {
    return LOG_PRIORITIES[level] >= LOG_PRIORITIES[this.currentLogLevel];
  }

  /** Log a debug message */
  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  /** Log an info message */
  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(`[INFO] ${message}`));
    }
  }

  /** Log a warning message */
  warn(message: string): void {
    if (this.shouldLog('warn')) {
      console.log(chalk.yellow(`[WARN] ${message}`));
    }
  }

  /** Log an error message */
  error(message: string): void {
    if (this.shouldLog('error')) {
      console.log(chalk.red(`[ERROR] ${message}`));
    }
  }

  /** Log a success message */
  success(message: string): void {
    console.log(chalk.green(message));
  }
}

// ---- Backward-compatible module-level functions ----

export function setLogLevel(level: LogLevel): void {
  LogManager.getInstance().setLogLevel(level);
}

export function blankLine(): void {
  console.log();
}

export function debug(message: string): void {
  LogManager.getInstance().debug(message);
}

export function info(message: string): void {
  LogManager.getInstance().info(message);
}

export function warn(message: string): void {
  LogManager.getInstance().warn(message);
}

export function error(message: string): void {
  LogManager.getInstance().error(message);
}

export function success(message: string): void {
  LogManager.getInstance().success(message);
}

export function header(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(`=== ${title} ===`));
  console.log();
}

export function section(title: string): void {
  console.log(chalk.bold(`\n${title}`));
}

export function status(label: string, value: string, color?: 'green' | 'yellow' | 'red'): void {
  const colorFn = color ? chalk[color] : chalk.white;
  console.log(`${chalk.gray(label)}: ${colorFn(value)}`);
}

export function progressBar(current: number, total: number, width = 30): string {
  const percentage = Math.floor((current / total) * 100);
  const filled = Math.floor((current / total) * width);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `[${bar}] ${percentage}%`;
}

export function list(items: string[], bullet = '•'): void {
  for (const item of items) {
    console.log(chalk.gray(bullet) + ' ' + item);
  }
}

export function divider(char = '─', length = 40): void {
  console.log(chalk.gray(char.repeat(length)));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}
