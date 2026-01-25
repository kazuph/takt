/**
 * Task execution commands
 *
 * Commands: /task, /t
 */

import chalk from 'chalk';
import { header, info, error, success, divider, StreamDisplay } from '../../utils/ui.js';
import { showTaskList, type TaskInfo, type TaskResult } from '../../task/index.js';
import { commandRegistry, createCommand } from './registry.js';
import { runAgent } from '../../agents/runner.js';
import type { InteractiveState } from '../types.js';

/** Execute a task using coder agent */
async function executeTaskWithAgent(
  task: TaskInfo,
  state: InteractiveState
): Promise<TaskResult> {
  const startedAt = new Date().toISOString();
  const executionLog: string[] = [];

  console.log();
  divider('=', 60);
  header(`Task: ${task.name}`);
  divider('=', 60);
  console.log(chalk.cyan(`\n${task.content}\n`));
  divider('-', 60);

  let response: string;
  let taskSuccess: boolean;

  try {
    // Use stream display for real-time output
    const display = new StreamDisplay('coder');
    const streamHandler = display.createHandler();

    const result = await runAgent('coder', task.content, {
      cwd: state.cwd,
      onStream: (event) => {
        if (event.type !== 'result') {
          streamHandler(event);
        }
      },
    });

    display.flush();

    taskSuccess = result.status === 'done';
    response = result.content;
    executionLog.push(`Response received: ${response.length} chars`);
  } catch (err) {
    response = `[ERROR] Task execution error: ${err instanceof Error ? err.message : String(err)}`;
    taskSuccess = false;
    executionLog.push(`Error: ${err}`);
  }

  const completedAt = new Date().toISOString();

  return {
    task,
    success: taskSuccess,
    response,
    executionLog,
    startedAt,
    completedAt,
  };
}

/** Handle /task list subcommand */
async function handleTaskList(state: InteractiveState): Promise<void> {
  showTaskList(state.taskRunner);
}

/** Execute a single task and return the result */
async function executeSingleTask(
  task: TaskInfo,
  state: InteractiveState
): Promise<{ result: TaskResult; reportFile: string }> {
  // Execute the task
  const result = await executeTaskWithAgent(task, state);

  // Mark task as completed
  const reportFile = state.taskRunner.completeTask(result);

  console.log();
  divider('=', 60);
  if (result.success) {
    success('Task completed');
  } else {
    error('Task failed');
  }
  divider('=', 60);
  info(`Report: ${reportFile}`);

  return { result, reportFile };
}

/** Run all tasks starting from the given task */
async function runTasksFromStart(
  startTask: TaskInfo,
  state: InteractiveState
): Promise<void> {
  let task: TaskInfo | null = startTask;
  let completedCount = 0;
  let failedCount = 0;

  while (task) {
    const { result } = await executeSingleTask(task, state);

    if (result.success) {
      completedCount++;
    } else {
      failedCount++;
    }

    task = state.taskRunner.getNextTask();

    if (task) {
      console.log();
      info(`Proceeding to next task: ${task.name}`);
      divider('-', 60);
    }
  }

  console.log();
  divider('=', 60);
  success(`All tasks completed! (${completedCount} succeeded, ${failedCount} failed)`);
  divider('=', 60);
}

/** Handle /task run [name] subcommand - runs all pending tasks (optionally starting from a specific task) */
async function handleTaskRun(
  taskName: string | undefined,
  state: InteractiveState
): Promise<void> {
  let task: TaskInfo | null;

  if (taskName) {
    task = state.taskRunner.getTask(taskName);
    if (!task) {
      error(`Task '${taskName}' not found`);
      showTaskList(state.taskRunner);
      return;
    }
  } else {
    task = state.taskRunner.getNextTask();
    if (!task) {
      info('No pending tasks.');
      console.log(
        chalk.gray(`Place task files (.md) in ${state.taskRunner.getTasksDir()}/`)
      );
      return;
    }
  }

  await runTasksFromStart(task, state);
}

/** Handle /task all subcommand - alias for /task run (for backward compatibility) */
async function handleTaskAll(state: InteractiveState): Promise<void> {
  const task = state.taskRunner.getNextTask();
  if (!task) {
    info('No pending tasks.');
    console.log(
      chalk.gray(`Place task files (.md) in ${state.taskRunner.getTasksDir()}/`)
    );
    return;
  }

  await runTasksFromStart(task, state);
}

/** /task, /t - Task management command */
commandRegistry.register(
  createCommand(
    ['task', 't'],
    'Task management (list/run)',
    async (args, state) => {
      const subcommand = args[0]?.toLowerCase() ?? '';
      const subargs = args.slice(1).join(' ');

      // /task or /task list - show task list
      if (!subcommand || subcommand === 'list') {
        await handleTaskList(state);
        return { continue: true };
      }

      // /task run [name] - run all pending tasks (optionally starting from a specific task)
      if (subcommand === 'run') {
        await handleTaskRun(subargs || undefined, state);
        return { continue: true };
      }

      // /task all - alias for /task run (backward compatibility)
      if (subcommand === 'all') {
        await handleTaskAll(state);
        return { continue: true };
      }

      error(`Unknown subcommand: ${subcommand}`);
      info('Usage: /task [list|run [name]|all]');
      return { continue: true };
    }
  )
);
