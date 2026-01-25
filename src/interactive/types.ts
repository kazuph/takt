/**
 * Interactive mode type definitions
 */

import type { TaskRunner } from '../task/index.js';
import type { InputHistoryManager } from './input.js';

/** Conversation message */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** Interactive session state */
export interface InteractiveState {
  cwd: string;
  workflowName: string;
  sessionId: string;
  claudeSessionId?: string;
  conversationHistory: ConversationMessage[];
  historyManager: InputHistoryManager;
  taskRunner: TaskRunner;
  /** Current task for workflow continuation */
  currentTask?: string;
  /** Requested number of iterations (for number input) */
  requestedIterations?: number;
  /** All user inputs shared across agents */
  sharedUserInputs: string[];
  /**
   * Sacrifice-my-pc mode: auto-approve all permissions and skip confirmations.
   * When enabled, all permission requests are automatically approved,
   * iteration limits auto-continue with 10 iterations,
   * and blocked states are auto-skipped.
   */
  sacrificeMyPcMode: boolean;
}
