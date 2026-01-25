/**
 * Session management helpers for agent execution
 */

import { loadAgentSessions, updateAgentSession } from '../config/paths.js';
import type { AgentResponse } from '../models/types.js';

/**
 * Execute a function with agent session management.
 * Automatically loads existing session and saves updated session ID.
 */
export async function withAgentSession(
  cwd: string,
  agentName: string,
  fn: (sessionId?: string) => Promise<AgentResponse>
): Promise<AgentResponse> {
  const sessions = loadAgentSessions(cwd);
  const sessionId = sessions[agentName];

  const result = await fn(sessionId);

  if (result.sessionId) {
    updateAgentSession(cwd, agentName, result.sessionId);
  }

  return result;
}
