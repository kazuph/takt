/**
 * Mock provider implementation
 */

import { callMock, callMockCustom, type MockCallOptions } from '../mock/index.js';
import type { AgentResponse } from '../../core/models/index.js';
import type { Provider, ProviderCallOptions } from './types.js';

/** Mock provider - wraps existing Mock client */
export class MockProvider implements Provider {
  async call(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const callOptions: MockCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      onStream: options.onStream,
    };

    return callMock(agentName, prompt, callOptions);
  }

  async callCustom(agentName: string, prompt: string, _systemPrompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const callOptions: MockCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      onStream: options.onStream,
    };

    return callMockCustom(agentName, prompt, _systemPrompt, callOptions);
  }
}
