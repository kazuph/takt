/**
 * Escape sequence tracking for iTerm2-style Option+Enter detection
 *
 * iTerm2 (and some other Mac terminals) send Option+Enter as two separate events:
 * Escape followed by Enter. This module provides a tracker to detect this pattern
 * by checking if Enter is pressed shortly after Escape.
 */

/**
 * Tracks Escape key timing for detecting iTerm2-style Option+Enter.
 *
 * The threshold of 50ms is based on:
 * - Typical keyboard repeat delay is 200-500ms
 * - Terminal escape sequence transmission is near-instantaneous (<10ms)
 * - Human intentional Esc→Enter would take at least 100-150ms
 * - 50ms provides a safe margin to detect machine-generated sequences
 *   while avoiding false positives from intentional key presses
 */
export class EscapeSequenceTracker {
  private lastEscapeTime: number = 0;
  private readonly thresholdMs: number;

  /**
   * @param thresholdMs Time window to consider Esc+Enter as Option+Enter (default: 50ms)
   */
  constructor(thresholdMs: number = 50) {
    this.thresholdMs = thresholdMs;
  }

  /** Record that Escape key was pressed */
  trackEscape(): void {
    this.lastEscapeTime = Date.now();
  }

  /**
   * Check if Enter was pressed within threshold of Escape.
   * Resets the tracker if true to prevent repeated triggers.
   */
  isEscapeThenEnter(): boolean {
    const elapsed = Date.now() - this.lastEscapeTime;
    const isRecent = elapsed < this.thresholdMs && this.lastEscapeTime > 0;
    if (isRecent) {
      this.lastEscapeTime = 0; // Reset to prevent accidental triggers
    }
    return isRecent;
  }

  /** Reset the tracker state */
  reset(): void {
    this.lastEscapeTime = 0;
  }

  /** Get the threshold value (for testing) */
  getThreshold(): number {
    return this.thresholdMs;
  }
}
