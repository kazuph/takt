/**
 * Terminal spinner for async operations.
 *
 * Displays an animated spinner with a message while background work is in progress.
 */

import chalk from 'chalk';

/** Spinner for async operations */
export class Spinner {
  private intervalId?: ReturnType<typeof setInterval>;
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.intervalId = setInterval(() => {
      process.stdout.write(
        `\r${chalk.cyan(this.frames[this.currentFrame])} ${this.message}`
      );
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(finalMessage?: string): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    process.stdout.write('\r' + ' '.repeat(this.message.length + 10) + '\r');
    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  update(message: string): void {
    this.message = message;
  }
}
