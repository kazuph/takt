/**
 * Type definitions for the provider abstraction layer
 */

import type { StreamCallback, PermissionHandler, AskUserQuestionHandler } from '../claude/index.js';
import type { AgentResponse, PermissionMode } from '../../core/models/index.js';

/** Common options for all providers */
export interface ProviderCallOptions {
  cwd: string;
  sessionId?: string;
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  /** Maximum number of agentic turns */
  maxTurns?: number;
  /** Permission mode for tool execution (from piece step) */
  permissionMode?: PermissionMode;
  onStream?: StreamCallback;
  onPermissionRequest?: PermissionHandler;
  onAskUserQuestion?: AskUserQuestionHandler;
  bypassPermissions?: boolean;
  /** Anthropic API key for Claude provider */
  anthropicApiKey?: string;
  /** OpenAI API key for Codex provider */
  openaiApiKey?: string;
}

/** Provider interface - all providers must implement this */
export interface Provider {
  /** Call the provider with a prompt (using systemPrompt from options if provided) */
  call(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse>;

  /** Call the provider with explicit system prompt */
  callCustom(agentName: string, prompt: string, systemPrompt: string, options: ProviderCallOptions): Promise<AgentResponse>;
}

/** Provider type */
export type ProviderType = 'claude' | 'codex' | 'mock';
