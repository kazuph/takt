/**
 * Claude Agent SDK wrapper
 *
 * Uses @anthropic-ai/claude-agent-sdk for native TypeScript integration
 * instead of spawning CLI processes.
 */

import type { AgentDefinition, PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import {
  hasActiveProcess,
  interruptCurrentProcess,
} from './query-manager.js';
import { executeClaudeQuery } from './executor.js';
import type {
  StreamCallback,
  PermissionHandler,
  AskUserQuestionHandler,
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

/** Options for calling Claude via SDK */
export interface ClaudeSpawnOptions {
  cwd: string;
  sessionId?: string;
  allowedTools?: string[];
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  /** Enable streaming mode with callback */
  onStream?: StreamCallback;
  /** Custom agents to register */
  agents?: Record<string, AgentDefinition>;
  /** Permission mode for tool execution (default: 'default' for interactive) */
  permissionMode?: PermissionMode;
  /** Custom permission handler for interactive permission prompts */
  onPermissionRequest?: PermissionHandler;
  /** Custom handler for AskUserQuestion tool */
  onAskUserQuestion?: AskUserQuestionHandler;
  /** Bypass all permission checks (sacrifice-my-pc mode) */
  bypassPermissions?: boolean;
  /** Anthropic API key to inject via env (bypasses CLI auth) */
  anthropicApiKey?: string;
}

/**
 * Execute a Claude query using the Agent SDK.
 * Supports concurrent execution with query ID tracking.
 */
export async function executeClaudeCli(
  prompt: string,
  options: ClaudeSpawnOptions
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
