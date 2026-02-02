/**
 * Claude Agent SDK wrapper
 *
 * Uses @anthropic-ai/claude-agent-sdk for native TypeScript integration
 * instead of spawning CLI processes.
 */

import {
  hasActiveProcess,
  interruptCurrentProcess,
} from './query-manager.js';
import { executeClaudeQuery } from './executor.js';
import type {
  ClaudeSpawnOptions,
  ClaudeResult,
} from './types.js';

// Re-export types for backward compatibility
export type {
  StreamEvent,
  StreamCallback,
  PermissionRequest,
  PermissionHandler,
  AskUserQuestionInput,
  AskUserQuestionHandler,
  ClaudeResult,
  ClaudeResultWithQueryId,
  ClaudeSpawnOptions,
  InitEventData,
  ToolUseEventData,
  ToolResultEventData,
  ToolOutputEventData,
  TextEventData,
  ThinkingEventData,
  ResultEventData,
  ErrorEventData,
} from './types.js';

// Re-export query management functions
export {
  generateQueryId,
  hasActiveProcess,
  isQueryActive,
  getActiveQueryCount,
  interruptQuery,
  interruptAllQueries,
  interruptCurrentProcess,
} from './query-manager.js';

/**
 * Execute a Claude query using the Agent SDK.
 * Supports concurrent execution with query ID tracking.
 */
export async function executeClaudeCli(
  prompt: string,
  options: ClaudeSpawnOptions,
): Promise<ClaudeResult> {
  return executeClaudeQuery(prompt, options);
}

/**
 * ClaudeProcess class for backward compatibility.
 * Wraps the SDK query function.
 */
export class ClaudeProcess {
  private options: ClaudeSpawnOptions;
  private currentSessionId?: string;
  private interrupted = false;

  constructor(options: ClaudeSpawnOptions) {
    this.options = options;
  }

  /** Execute a prompt */
  async execute(prompt: string): Promise<ClaudeResult> {
    this.interrupted = false;
    const result = await executeClaudeCli(prompt, this.options);
    this.currentSessionId = result.sessionId;
    if (result.interrupted) {
      this.interrupted = true;
    }
    return result;
  }

  /** Interrupt the running query */
  kill(): void {
    this.interrupted = true;
    interruptCurrentProcess();
  }

  /** Check if a query is running */
  isRunning(): boolean {
    return hasActiveProcess();
  }

  /** Get session ID */
  getSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /** Check if query was interrupted */
  wasInterrupted(): boolean {
    return this.interrupted;
  }
}
