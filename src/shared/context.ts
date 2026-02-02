/**
 * Runtime context shared across modules.
 *
 * Holds process-wide state (quiet mode, etc.) that would otherwise
 * create circular dependencies if exported from cli.ts.
 *
 * AppContext is a singleton — use AppContext.getInstance() or
 * the module-level convenience functions isQuietMode / setQuietMode.
 */

export class AppContext {
  private static instance: AppContext | null = null;

  private quietMode = false;

  private constructor() {}

  static getInstance(): AppContext {
    if (!AppContext.instance) {
      AppContext.instance = new AppContext();
    }
    return AppContext.instance;
  }

  /** Reset singleton for testing */
  static resetInstance(): void {
    AppContext.instance = null;
  }

  getQuietMode(): boolean {
    return this.quietMode;
  }

  setQuietMode(value: boolean): void {
    this.quietMode = value;
  }
}

// ---- Backward-compatible module-level functions ----

/** Get whether quiet mode is active (CLI flag or config, resolved in preAction) */
export function isQuietMode(): boolean {
  return AppContext.getInstance().getQuietMode();
}

/** Set quiet mode state. Called from CLI preAction hook. */
export function setQuietMode(value: boolean): void {
  AppContext.getInstance().setQuietMode(value);
}
