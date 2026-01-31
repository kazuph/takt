/**
 * Claude provider implementation
 */

import { callClaude, callClaudeCustom, type ClaudeCallOptions } from '../claude/client.js';
import { resolveAnthropicApiKey } from '../config/globalConfig.js';
import type { AgentResponse } from '../models/types.js';
import type { Provider, ProviderCallOptions } from './index.js';

/** Claude provider - wraps existing Claude client */
export class ClaudeProvider implements Provider {
  async call(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const callOptions: ClaudeCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      allowedTools: options.allowedTools,
      model: options.model,
      maxTurns: options.maxTurns,
      systemPrompt: options.systemPrompt,
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      onPermissionRequest: options.onPermissionRequest,
      onAskUserQuestion: options.onAskUserQuestion,
      bypassPermissions: options.bypassPermissions,
      anthropicApiKey: options.anthropicApiKey ?? resolveAnthropicApiKey(),
    };

    return callClaude(agentName, prompt, callOptions);
  }

  async callCustom(agentName: string, prompt: string, systemPrompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const callOptions: ClaudeCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      allowedTools: options.allowedTools,
      model: options.model,
      maxTurns: options.maxTurns,
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      onPermissionRequest: options.onPermissionRequest,
      onAskUserQuestion: options.onAskUserQuestion,
      bypassPermissions: options.bypassPermissions,
      anthropicApiKey: options.anthropicApiKey ?? resolveAnthropicApiKey(),
    };

    return callClaudeCustom(agentName, prompt, systemPrompt, callOptions);
  }
}
