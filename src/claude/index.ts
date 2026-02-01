/**
 * Claude module public API
 */

export {
  ClaudeProcess,
  executeClaudeCli,
  type ClaudeSpawnOptions,
  type StreamCallback,
  type PermissionHandler,
  type AskUserQuestionHandler,
  type ClaudeResult,
  type ClaudeResultWithQueryId,
  type StreamEvent,
} from './process.js';

export {
  detectRuleIndex,
  detectJudgeIndex,
  buildJudgePrompt,
  callClaude,
  callClaudeCustom,
  callClaudeAgent,
  callClaudeSkill,
  callAiJudge,
  type ClaudeCallOptions,
} from './client.js';
