/**
 * High-level Claude client for agent interactions
 *
 * Uses the Claude Agent SDK for native TypeScript integration.
 */

import { executeClaudeCli, type ClaudeSpawnOptions, type StreamCallback, type PermissionHandler, type AskUserQuestionHandler } from './process.js';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AgentResponse, Status } from '../models/types.js';
import { DEFAULT_STATUS_PATTERNS } from '../models/schemas.js';

/** Options for calling Claude */
export interface ClaudeCallOptions {
  cwd: string;
  sessionId?: string;
  allowedTools?: string[];
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  statusPatterns?: Record<string, string>;
  /** SDK agents to register for sub-agent execution */
  agents?: Record<string, AgentDefinition>;
  /** Enable streaming mode with callback for real-time output */
  onStream?: StreamCallback;
  /** Custom permission handler for interactive permission prompts */
  onPermissionRequest?: PermissionHandler;
  /** Custom handler for AskUserQuestion tool */
  onAskUserQuestion?: AskUserQuestionHandler;
  /** Bypass all permission checks (sacrifice-my-pc mode) */
  bypassPermissions?: boolean;
}

/** Detect status from agent output content */
export function detectStatus(
  content: string,
  patterns: Record<string, string>
): Status {
  for (const [status, pattern] of Object.entries(patterns)) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(content)) {
        return status as Status;
      }
    } catch {
      // Invalid regex, skip
    }
  }
  return 'in_progress';
}

/** Validate regex pattern for ReDoS safety */
export function isRegexSafe(pattern: string): boolean {
  // Limit pattern length
  if (pattern.length > 200) {
    return false;
  }

  // Dangerous patterns that can cause ReDoS
  const dangerousPatterns = [
    /\(\.\*\)\+/,      // (.*)+
    /\(\.\+\)\*/,      // (.+)*
    /\(\.\*\)\*/,      // (.*)*
    /\(\.\+\)\+/,      // (.+)+
    /\([^)]*\|[^)]*\)\+/, // (a|b)+
    /\([^)]*\|[^)]*\)\*/, // (a|b)*
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}

/** Get status patterns for a built-in agent type */
export function getBuiltinStatusPatterns(agentType: string): Record<string, string> {
  return DEFAULT_STATUS_PATTERNS[agentType] || {};
}

/** Determine status from result */
function determineStatus(
  result: { success: boolean; interrupted?: boolean; content: string },
  patterns: Record<string, string>
): Status {
  if (!result.success) {
    // Check if it was an interrupt using the flag (not magic string)
    if (result.interrupted) {
      return 'interrupted';
    }
    return 'blocked';
  }
  return detectStatus(result.content, patterns);
}

/** Call Claude with an agent prompt */
export async function callClaude(
  agentType: string,
  prompt: string,
  options: ClaudeCallOptions
): Promise<AgentResponse> {
  const spawnOptions: ClaudeSpawnOptions = {
    cwd: options.cwd,
    sessionId: options.sessionId,
    allowedTools: options.allowedTools,
    model: options.model,
    maxTurns: options.maxTurns,
    systemPrompt: options.systemPrompt,
    agents: options.agents,
    onStream: options.onStream,
    onPermissionRequest: options.onPermissionRequest,
    onAskUserQuestion: options.onAskUserQuestion,
    bypassPermissions: options.bypassPermissions,
  };

  const result = await executeClaudeCli(prompt, spawnOptions);
  const patterns = options.statusPatterns || getBuiltinStatusPatterns(agentType);
  const status = determineStatus(result, patterns);

  return {
    agent: agentType,
    status,
    content: result.content,
    timestamp: new Date(),
    sessionId: result.sessionId,
  };
}

/** Call Claude with a custom agent configuration */
export async function callClaudeCustom(
  agentName: string,
  prompt: string,
  systemPrompt: string,
  options: ClaudeCallOptions
): Promise<AgentResponse> {
  const spawnOptions: ClaudeSpawnOptions = {
    cwd: options.cwd,
    sessionId: options.sessionId,
    allowedTools: options.allowedTools,
    model: options.model,
    maxTurns: options.maxTurns,
    systemPrompt,
    onStream: options.onStream,
    onPermissionRequest: options.onPermissionRequest,
    onAskUserQuestion: options.onAskUserQuestion,
    bypassPermissions: options.bypassPermissions,
  };

  const result = await executeClaudeCli(prompt, spawnOptions);
  // Use provided patterns, or fall back to built-in patterns for known agents
  const patterns = options.statusPatterns || getBuiltinStatusPatterns(agentName);
  const status = determineStatus(result, patterns);

  return {
    agent: agentName,
    status,
    content: result.content,
    timestamp: new Date(),
    sessionId: result.sessionId,
  };
}

/** Call a Claude Code built-in agent (using claude --agent flag if available) */
export async function callClaudeAgent(
  claudeAgentName: string,
  prompt: string,
  options: ClaudeCallOptions
): Promise<AgentResponse> {
  // For now, use system prompt approach
  // In future, could use --agent flag if Claude CLI supports it
  const systemPrompt = `You are the ${claudeAgentName} agent. Follow the standard ${claudeAgentName} workflow.`;

  return callClaudeCustom(claudeAgentName, prompt, systemPrompt, options);
}

/** Call a Claude Code skill (using /skill command) */
export async function callClaudeSkill(
  skillName: string,
  prompt: string,
  options: ClaudeCallOptions
): Promise<AgentResponse> {
  // Prepend skill invocation to prompt
  const fullPrompt = `/${skillName}\n\n${prompt}`;

  const spawnOptions: ClaudeSpawnOptions = {
    cwd: options.cwd,
    sessionId: options.sessionId,
    allowedTools: options.allowedTools,
    model: options.model,
    maxTurns: options.maxTurns,
    onStream: options.onStream,
    onPermissionRequest: options.onPermissionRequest,
    onAskUserQuestion: options.onAskUserQuestion,
    bypassPermissions: options.bypassPermissions,
  };

  const result = await executeClaudeCli(fullPrompt, spawnOptions);

  return {
    agent: `skill:${skillName}`,
    status: result.success ? 'done' : 'blocked',
    content: result.content,
    timestamp: new Date(),
    sessionId: result.sessionId,
  };
}
