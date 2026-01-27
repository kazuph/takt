/**
 * Type definitions for Claude SDK integration
 *
 * Contains stream event types, callback types, and result types
 * used throughout the Claude integration layer.
 */

import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';

// Re-export PermissionResult for convenience
export type { PermissionResult, PermissionUpdate };

/** Stream event data types (for backward compatibility) */
export interface InitEventData {
  model: string;
  sessionId: string;
}

export interface ToolUseEventData {
  tool: string;
  input: Record<string, unknown>;
  id: string;
}

export interface ToolResultEventData {
  content: string;
  isError: boolean;
}

export interface ToolOutputEventData {
  tool: string;
  output: string;
}

export interface TextEventData {
  text: string;
}

export interface ThinkingEventData {
  thinking: string;
}

export interface ResultEventData {
  result: string;
  sessionId: string;
  success: boolean;
}

export interface ErrorEventData {
  message: string;
  raw?: string;
}

/** Stream event (discriminated union) */
export type StreamEvent =
  | { type: 'init'; data: InitEventData }
  | { type: 'tool_use'; data: ToolUseEventData }
  | { type: 'tool_result'; data: ToolResultEventData }
  | { type: 'tool_output'; data: ToolOutputEventData }
  | { type: 'text'; data: TextEventData }
  | { type: 'thinking'; data: ThinkingEventData }
  | { type: 'result'; data: ResultEventData }
  | { type: 'error'; data: ErrorEventData };

/** Callback for streaming events */
export type StreamCallback = (event: StreamEvent) => void;

/** Permission request info passed to handler */
export interface PermissionRequest {
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
}

/** Permission handler callback type */
export type PermissionHandler = (
  request: PermissionRequest
) => Promise<PermissionResult>;

/** AskUserQuestion tool input */
export interface AskUserQuestionInput {
  questions: Array<{
    question: string;
    header?: string;
    options?: Array<{
      label: string;
      description?: string;
    }>;
    multiSelect?: boolean;
  }>;
}

/** AskUserQuestion handler callback type */
export type AskUserQuestionHandler = (
  input: AskUserQuestionInput
) => Promise<Record<string, string>>;

/** Result from Claude execution */
export interface ClaudeResult {
  success: boolean;
  content: string;
  sessionId?: string;
  error?: string;
  interrupted?: boolean;
  /** All assistant text accumulated during execution (for status detection) */
  fullContent?: string;
}

/** Extended result with query ID for concurrent execution */
export interface ClaudeResultWithQueryId extends ClaudeResult {
  queryId: string;
}
