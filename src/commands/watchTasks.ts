/**
 * /watch command implementation
 *
 * Watches .takt/tasks/ for new task files and executes them automatically.
 * Stays resident until Ctrl+C (SIGINT).
 */

import { TaskRunner, type TaskInfo } from '../task/index.js';
import { TaskWatcher } from '../task/watcher.js';
import { getCurrentWorkflow } from '../config/paths.js';
import {
  header,
  info,
  error,
  success,
  status,
} from '../utils/ui.js';
import { getErrorMessage } from '../utils/error.js';
import { executeTask, resolveTaskExecution } from './taskExecution.js';
import { DEFAULT_WORKFLOW_NAME } from '../constants.js';

/**
 * Watch for tasks and execute them as they appear.
 * Runs until Ctrl+C.
 */
export async function watchTasks(cwd: string): Promise<void> {
  const workflowName = getCurrentWorkflow(cwd) || DEFAULT_WORKFLOW_NAME;
  const taskRunner = new TaskRunner(cwd);
  const watcher = new TaskWatcher(cwd);

  let taskCount = 0;
  let successCount = 0;
  let failCount = 0;

  header('TAKT Watch Mode');
  info(`Workflow: ${workflowName}`);
  info(`Watching: ${taskRunner.getTasksDir()}`);
  info('Waiting for tasks... (Ctrl+C to stop)');
  console.log();

  // Graceful shutdown on SIGINT
  const onSigInt = () => {
    console.log();
    info('Stopping watch...');
    watcher.stop();
  };
  process.on('SIGINT', onSigInt);

  try {
    await watcher.watch(async (task: TaskInfo) => {
      taskCount++;
      console.log();
      info(`=== Task ${taskCount}: ${task.name} ===`);
      console.log();

      const startedAt = new Date().toISOString();
      const executionLog: string[] = [];

      try {
        const { execCwd, execWorkflow } = resolveTaskExecution(task, cwd, workflowName);
        const taskSuccess = await executeTask(task.content, execCwd, execWorkflow);
        const completedAt = new Date().toISOString();

        taskRunner.completeTask({
          task,
          success: taskSuccess,
          response: taskSuccess ? 'Task completed successfully' : 'Task failed',
          executionLog,
          startedAt,
          completedAt,
        });

        if (taskSuccess) {
          successCount++;
          success(`Task "${task.name}" completed`);
        } else {
          failCount++;
          error(`Task "${task.name}" failed`);
        }
      } catch (err) {
        failCount++;
        const completedAt = new Date().toISOString();

        taskRunner.completeTask({
          task,
          success: false,
          response: getErrorMessage(err),
          executionLog,
          startedAt,
          completedAt,
        });

        error(`Task "${task.name}" error: ${getErrorMessage(err)}`);
      }

      console.log();
      info('Waiting for tasks... (Ctrl+C to stop)');
    });
  } finally {
    process.removeListener('SIGINT', onSigInt);
  }

  // Summary on exit
  if (taskCount > 0) {
    console.log();
    header('Watch Summary');
    status('Total', String(taskCount));
    status('Success', String(successCount), successCount === taskCount ? 'green' : undefined);
    if (failCount > 0) {
      status('Failed', String(failCount), 'red');
    }
  }

  success('Watch stopped.');
}
