/**
 * Interactive REPL mode for takt
 *
 * Provides an interactive shell similar to ORCA's interactive mode.
 * Features:
 * - Workflow switching with /switch (/sw)
 * - Multi-agent workflow execution
 * - Conversation history
 * - Session persistence
 */

import chalk from 'chalk';
import { loadGlobalConfig } from '../config/index.js';
import {
  getCurrentWorkflow,
  getProjectConfigDir,
  ensureDir,
} from '../config/paths.js';
import { interruptCurrentProcess } from '../claude/process.js';
import { info } from '../utils/ui.js';
import { generateSessionId } from '../utils/session.js';
import {
  createReadlineInterface,
  multiLineQuestion,
  InputHistoryManager,
} from './input.js';
import { TaskRunner } from '../task/index.js';
import { commandRegistry } from './commands/index.js';
import { printWelcome } from './ui.js';
import { executeMultiAgentWorkflow } from './workflow-executor.js';
import type { InteractiveState } from './types.js';

/**
 * Parse user input for iteration control.
 *
 * Returns the requested iteration count and the actual message.
 * Examples:
 *   "3" -> { iterations: 3, message: null } (continue with 3 more iterations)
 *   "fix the bug" -> { iterations: 1, message: "fix the bug" }
 *   "5 do something" -> { iterations: 5, message: "do something" }
 */
function parseIterationInput(input: string): { iterations: number; message: string | null } {
  const trimmed = input.trim();

  // Check if input is just a number (continue iterations)
  if (/^\d+$/.test(trimmed)) {
    const count = parseInt(trimmed, 10);
    if (count > 0 && count <= 100) {
      return { iterations: count, message: null };
    }
  }

  // Check if input starts with a number followed by space
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (match && match[1] && match[2]) {
    const count = parseInt(match[1], 10);
    if (count > 0 && count <= 100) {
      return { iterations: count, message: match[2] };
    }
  }

  // Default: single iteration with the full message
  return { iterations: 1, message: trimmed };
}

/** Execute workflow with user message */
async function executeWorkflow(
  message: string,
  state: InteractiveState,
  rl: ReturnType<typeof createReadlineInterface>
): Promise<boolean> {
  // Parse iteration control from input
  const { iterations, message: actualMessage } = parseIterationInput(message);

  // Determine the task to use
  let task: string;
  if (actualMessage === null) {
    // Number only - continue with previous task
    if (!state.currentTask) {
      info('継続するタスクがありません。タスクを入力してください。');
      return true;
    }
    task = state.currentTask;
    info(`前回のタスクを ${iterations} イテレーションで継続します`);
  } else {
    task = actualMessage;
    state.currentTask = task;
  }

  // Add user message to conversation history
  state.conversationHistory.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });

  // Add to input history (for up-arrow recall)
  state.historyManager.add(message);

  // Add to shared user inputs (for all agents)
  state.sharedUserInputs.push(task);

  // Run workflow with specified iterations
  const response = await executeMultiAgentWorkflow(task, state, rl, iterations);

  // Add assistant response to history
  state.conversationHistory.push({
    role: 'assistant',
    content: response,
    timestamp: new Date().toISOString(),
  });

  return true;
}

/** Process user input */
async function processInput(
  input: string,
  state: InteractiveState,
  rl: ReturnType<typeof createReadlineInterface>
): Promise<boolean> {
  const trimmed = input.trim();

  if (!trimmed) {
    return true; // Continue
  }

  // Handle commands
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const commandName = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (!commandName) {
      return true;
    }

    const command = commandRegistry.get(commandName);
    if (command) {
      const result = await command.execute(args, state, rl);
      return result.continue;
    }

    info(`Unknown command: ${commandName}`);
    info('Type /help for available commands');
    return true;
  }

  // Execute workflow with input
  return await executeWorkflow(trimmed, state, rl);
}

/** Start interactive mode */
export async function startInteractiveMode(
  cwd: string,
  initialTask?: string
): Promise<void> {
  // Load global config for validation
  loadGlobalConfig();
  const lastWorkflow = getCurrentWorkflow(cwd);

  // Create history manager (handles persistence automatically)
  const historyManager = new InputHistoryManager(cwd);

  // Create task runner
  const taskRunner = new TaskRunner(cwd);

  const state: InteractiveState = {
    cwd,
    workflowName: lastWorkflow,
    sessionId: generateSessionId(),
    conversationHistory: [],
    historyManager,
    taskRunner,
    sharedUserInputs: [],
    sacrificeMyPcMode: false,
  };

  // Ensure project config directory exists
  ensureDir(getProjectConfigDir(cwd));

  printWelcome(state);

  const rl = createReadlineInterface();

  // Handle initial task if provided
  if (initialTask) {
    const shouldContinue = await processInput(initialTask, state, rl);
    if (!shouldContinue) {
      rl.close();
      return;
    }
  }

  // Track Ctrl+C timing for double-press exit
  let lastSigintTime = 0;

  // Ctrl+C handler for double-press exit
  const handleCtrlC = (): void => {
    console.log();
    const now = Date.now();

    // Try to interrupt running Claude process first
    if (interruptCurrentProcess()) {
      info('Interrupted. Press Ctrl+C again to exit.');
      lastSigintTime = now;
    } else if (now - lastSigintTime < 2000) {
      // Double press within 2 seconds - exit
      info('Goodbye!');
      rl.close();
      process.exit(0);
    } else {
      info('Press Ctrl+C again to exit');
      lastSigintTime = now;
    }
  };

  // Main REPL loop with multi-line support
  const prompt = async (): Promise<void> => {
    // Show workflow indicator above prompt
    const modeIndicator = state.sacrificeMyPcMode ? chalk.red(' 💀') : '';
    console.log(chalk.gray(`[${state.workflowName}]`) + modeIndicator);

    try {
      const promptStr = state.sacrificeMyPcMode
        ? chalk.red('takt💀> ')
        : chalk.cyan('takt> ');

      const input = await multiLineQuestion(rl, {
        promptStr,
        onCtrlC: handleCtrlC,
        historyManager: state.historyManager,
      });

      if (input === '') {
        // Empty input, just re-prompt
        prompt();
        return;
      }

      const shouldContinue = await processInput(input, state, rl);
      if (shouldContinue) {
        prompt();
      } else {
        rl.close();
      }
    } catch {
      rl.close();
    }
  };

  prompt();
}
