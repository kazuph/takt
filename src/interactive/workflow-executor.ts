/**
 * Workflow executor for interactive mode
 *
 * Handles the execution of multi-agent workflows,
 * including streaming output and state management.
 */

import chalk from 'chalk';
import {
  loadWorkflow,
  getBuiltinWorkflow,
} from '../config/index.js';
import {
  loadAgentSessions,
  updateAgentSession,
} from '../config/paths.js';
import { WorkflowEngine, type UserInputRequest, type IterationLimitRequest } from '../workflow/engine.js';
import {
  info,
  error,
  success,
  StreamDisplay,
} from '../utils/ui.js';
import {
  playWarningSound,
  notifySuccess,
  notifyError,
  notifyWarning,
} from '../utils/notification.js';
import {
  createSessionLog,
  addToSessionLog,
  finalizeSessionLog,
  saveSessionLog,
} from '../utils/session.js';
import { createReadlineInterface } from './input.js';
import {
  createInteractivePermissionHandler,
  createPermissionState,
  resetPermissionStateForIteration,
} from './permission.js';
import {
  createAgentAnswerHandler,
  createAskUserQuestionHandler,
  createSacrificeModeQuestionHandler,
} from './handlers.js';
import { requestUserInput, requestIterationContinue } from './user-input.js';
import type { InteractiveState } from './types.js';
import type { WorkflowConfig } from '../models/types.js';
import type { AskUserQuestionHandler } from '../claude/process.js';

/**
 * Execute multi-agent workflow with streaming output.
 *
 * This is the main workflow execution function that:
 * - Loads and validates the workflow configuration
 * - Sets up stream handlers for real-time output
 * - Manages agent sessions for conversation continuity
 * - Handles blocked states and user input requests
 * - Logs session data for debugging
 */
export async function executeMultiAgentWorkflow(
  message: string,
  state: InteractiveState,
  rl: ReturnType<typeof createReadlineInterface>,
  requestedIterations: number = 10
): Promise<string> {
  const builtin = getBuiltinWorkflow(state.workflowName);
  let config: WorkflowConfig | null =
    builtin || loadWorkflow(state.workflowName);

  if (!config) {
    error(`Workflow "${state.workflowName}" not found.`);
    info('Available workflows: /workflow list');
    return `[ERROR] Workflow "${state.workflowName}" not found`;
  }

  // Apply requested iteration count
  if (requestedIterations !== config.maxIterations) {
    config = { ...config, maxIterations: requestedIterations };
  }

  const sessionLog = createSessionLog(message, state.cwd, config.name);

  // Track current display for streaming
  const displayRef: { current: StreamDisplay | null } = { current: null };

  // Create stream handler that delegates to current display
  const streamHandler = (
    event: Parameters<ReturnType<StreamDisplay['createHandler']>>[0]
  ): void => {
    if (!displayRef.current) return;
    if (event.type === 'result') return;
    displayRef.current.createHandler()(event);
  };

  // Create user input handler for blocked state
  const userInputHandler = async (request: UserInputRequest): Promise<string | null> => {
    // In sacrifice mode, auto-skip blocked states
    if (state.sacrificeMyPcMode) {
      info('[SACRIFICE MODE] Auto-skipping blocked state');
      return null;
    }

    // Flush current display before prompting
    if (displayRef.current) {
      displayRef.current.flushThinking();
      displayRef.current.flushText();
      displayRef.current = null;
    }
    return requestUserInput(request, rl, state.historyManager);
  };

  // Create iteration limit handler
  // Note: Even in sacrifice mode, we ask user for iteration continuation
  // to prevent runaway execution
  const iterationLimitHandler = async (request: IterationLimitRequest): Promise<number | null> => {
    // Flush current display before prompting
    if (displayRef.current) {
      displayRef.current.flushThinking();
      displayRef.current.flushText();
      displayRef.current = null;
    }
    return requestIterationContinue(request, rl, state.historyManager);
  };

  // Load saved agent sessions for session resumption
  const savedSessions = loadAgentSessions(state.cwd);

  // Session update handler - persist session IDs when they change
  const sessionUpdateHandler = (agentName: string, sessionId: string): void => {
    updateAgentSession(state.cwd, agentName, sessionId);
  };

  // Create permission state for iteration-scoped permissions
  const permissionState = createPermissionState();

  // Create interactive permission handler (sacrifice mode uses bypassPermissions)
  const permissionHandler = state.sacrificeMyPcMode
    ? undefined  // No handler needed - we'll use bypassPermissions mode
    : createInteractivePermissionHandler(rl, permissionState);

  // Create AskUserQuestion handler
  // Priority: sacrifice mode > answerAgent > interactive user input
  let askUserQuestionHandler: AskUserQuestionHandler;
  if (state.sacrificeMyPcMode) {
    askUserQuestionHandler = createSacrificeModeQuestionHandler();
  } else if (config.answerAgent) {
    // Use another agent to answer questions
    info(`質問回答エージェント: ${config.answerAgent}`);
    askUserQuestionHandler = createAgentAnswerHandler(config.answerAgent, state.cwd);
  } else {
    // Interactive user input
    askUserQuestionHandler = createAskUserQuestionHandler(rl, state.historyManager);
  }

  const engine = new WorkflowEngine(config, state.cwd, message, {
    onStream: streamHandler,
    onUserInput: userInputHandler,
    initialSessions: savedSessions,
    onSessionUpdate: sessionUpdateHandler,
    onPermissionRequest: permissionHandler,
    initialUserInputs: state.sharedUserInputs,
    onAskUserQuestion: askUserQuestionHandler,
    onIterationLimit: iterationLimitHandler,
    bypassPermissions: state.sacrificeMyPcMode,
  });

  engine.on('step:start', (step, iteration) => {
    // Reset iteration-scoped permission state at start of each step
    resetPermissionStateForIteration(permissionState);
    info(`[${iteration}/${config.maxIterations}] ${step.name} (${step.agentDisplayName})`);
    displayRef.current = new StreamDisplay(step.agentDisplayName);
  });

  engine.on('step:complete', (step, stepResponse) => {
    if (displayRef.current) {
      displayRef.current.flushThinking();
      displayRef.current.flushText();
      displayRef.current = null;
    }
    console.log();
    addToSessionLog(sessionLog, step.name, stepResponse);
  });

  // Handle user input event (after user provides input for blocked step)
  engine.on('step:user_input', (step, userInput) => {
    console.log();
    info(`ユーザー入力を受け取りました。${step.name} を再実行します...`);
    console.log(chalk.gray(`入力内容: ${userInput.slice(0, 100)}${userInput.length > 100 ? '...' : ''}`));
    console.log();
  });

  let wasInterrupted = false;
  let loopDetected = false;
  let wasBlocked = false;
  engine.on('workflow:abort', (_, reason) => {
    if (displayRef.current) {
      displayRef.current.flushThinking();
      displayRef.current.flushText();
      displayRef.current = null;
    }
    if (reason?.includes('interrupted')) {
      wasInterrupted = true;
    }
    if (reason?.includes('Loop detected')) {
      loopDetected = true;
    }
    if (reason?.includes('blocked') || reason?.includes('no user input')) {
      wasBlocked = true;
    }
  });

  try {
    const finalState = await engine.run();

    const statusVal = finalState.status === 'completed' ? 'completed' : 'aborted';
    finalizeSessionLog(sessionLog, statusVal);
    saveSessionLog(sessionLog, state.sessionId, state.cwd);

    if (finalState.status === 'completed') {
      success('Workflow completed!');
      notifySuccess('TAKT', `ワークフロー完了 (${finalState.iteration} iterations)`);
      return '[WORKFLOW COMPLETE]';
    } else if (wasInterrupted) {
      info('Workflow interrupted by user');
      // User intentionally interrupted - sound only, no system notification needed
      playWarningSound();
      return '[WORKFLOW INTERRUPTED]';
    } else if (loopDetected) {
      error('Workflow aborted due to loop detection');
      info('Tip: ループが検出されました。タスクを見直すか、/agent coder を直接使用してください。');
      notifyError('TAKT', 'ループ検出により中断されました');
      return '[WORKFLOW ABORTED: Loop detected]';
    } else if (wasBlocked) {
      info('Workflow aborted: エージェントがブロックされ、ユーザー入力が提供されませんでした');
      notifyWarning('TAKT', 'ユーザー入力待ちで中断されました');
      return '[WORKFLOW ABORTED: Blocked]';
    } else {
      error('Workflow aborted');
      notifyError('TAKT', 'ワークフローが中断されました');
      return '[WORKFLOW ABORTED]';
    }
  } catch (err) {
    if (displayRef.current) {
      displayRef.current.flushThinking();
      displayRef.current.flushText();
    }
    const errMsg = `[ERROR] ${err instanceof Error ? err.message : String(err)}`;
    error(errMsg);
    notifyError('TAKT', `エラー: ${err instanceof Error ? err.message : String(err)}`);
    return errMsg;
  }
}
