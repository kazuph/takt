/**
 * SDK options builder for Claude queries
 *
 * Builds the options object for Claude Agent SDK queries,
 * including permission handlers and hooks.
 */

import type {
  Options,
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
  PreToolUseHookInput,
  AgentDefinition,
  PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '../utils/debug.js';
import type {
  PermissionHandler,
  AskUserQuestionInput,
  AskUserQuestionHandler,
} from './types.js';

const log = createLogger('claude-sdk');

/** Options for calling Claude via SDK */
export interface ClaudeSpawnOptions {
  cwd: string;
  sessionId?: string;
  allowedTools?: string[];
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  /** Enable streaming mode */
  hasStream?: boolean;
  /** Custom agents to register */
  agents?: Record<string, AgentDefinition>;
  /** Permission mode for tool execution */
  permissionMode?: PermissionMode;
  /** Custom permission handler for interactive permission prompts */
  onPermissionRequest?: PermissionHandler;
  /** Custom handler for AskUserQuestion tool */
  onAskUserQuestion?: AskUserQuestionHandler;
}

/**
 * Create canUseTool callback from permission handler.
 */
export function createCanUseToolCallback(
  handler: PermissionHandler
): CanUseTool {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    callbackOptions: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
      blockedPath?: string;
      decisionReason?: string;
    }
  ): Promise<PermissionResult> => {
    return handler({
      toolName,
      input,
      suggestions: callbackOptions.suggestions,
      blockedPath: callbackOptions.blockedPath,
      decisionReason: callbackOptions.decisionReason,
    });
  };
}

/**
 * Create hooks for AskUserQuestion handling.
 */
export function createAskUserQuestionHooks(
  askUserHandler: AskUserQuestionHandler
): Partial<Record<string, HookCallbackMatcher[]>> {
  const preToolUseHook = async (
    input: HookInput,
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    const preToolInput = input as PreToolUseHookInput;
    if (preToolInput.tool_name === 'AskUserQuestion') {
      const toolInput = preToolInput.tool_input as AskUserQuestionInput;
      try {
        const answers = await askUserHandler(toolInput);
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: JSON.stringify(answers),
          },
        };
      } catch (err) {
        log.error('AskUserQuestion handler failed', { error: err });
        return { continue: true };
      }
    }
    return { continue: true };
  };

  return {
    PreToolUse: [{
      matcher: 'AskUserQuestion',
      hooks: [preToolUseHook],
    }],
  };
}

/**
 * Build SDK options from ClaudeSpawnOptions.
 */
export function buildSdkOptions(options: ClaudeSpawnOptions): Options {
  // Create canUseTool callback if permission handler is provided
  const canUseTool = options.onPermissionRequest
    ? createCanUseToolCallback(options.onPermissionRequest)
    : undefined;

  // Create hooks for AskUserQuestion handling
  const hooks = options.onAskUserQuestion
    ? createAskUserQuestionHooks(options.onAskUserQuestion)
    : undefined;

  const sdkOptions: Options = {
    cwd: options.cwd,
    model: options.model,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
    agents: options.agents,
    permissionMode: options.permissionMode ?? (options.onPermissionRequest ? 'default' : 'acceptEdits'),
    includePartialMessages: options.hasStream,
    canUseTool,
    hooks,
  };

  if (options.systemPrompt) {
    sdkOptions.systemPrompt = options.systemPrompt;
  }

  // Session management
  if (options.sessionId) {
    sdkOptions.resume = options.sessionId;
  } else {
    sdkOptions.continue = false;
  }

  return sdkOptions;
}
