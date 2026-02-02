/**
 * Codex provider implementation
 */

import { callCodex, callCodexCustom, type CodexCallOptions } from '../codex/index.js';
import { resolveOpenaiApiKey } from '../config/index.js';
import type { AgentResponse } from '../../core/models/index.js';
import type { Provider, ProviderCallOptions } from './types.js';

/** Codex provider - wraps existing Codex client */
export class CodexProvider implements Provider {
  async call(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const callOptions: CodexCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      model: options.model,
      systemPrompt: options.systemPrompt,
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      openaiApiKey: options.openaiApiKey ?? resolveOpenaiApiKey(),
    };

    return callCodex(agentName, prompt, callOptions);
  }

  async callCustom(agentName: string, prompt: string, systemPrompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const callOptions: CodexCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      model: options.model,
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      openaiApiKey: options.openaiApiKey ?? resolveOpenaiApiKey(),
    };

    return callCodexCustom(agentName, prompt, systemPrompt, callOptions);
  }
}
