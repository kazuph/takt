/**
 * Task execution logic
 */

import { loadWorkflow } from '../config/index.js';
import { TaskRunner } from '../task/index.js';
import {
  header,
  info,
  error,
  success,
  status,
} from '../utils/ui.js';
import { createLogger } from '../utils/debug.js';
import { getErrorMessage } from '../utils/error.js';
import { executeWorkflow } from './workflowExecution.js';
import { DEFAULT_WORKFLOW_NAME } from '../constants.js';

const log = createLogger('task');

/**
 * Execute a single task with workflow
 */
export async function executeTask(
  task: string,
  cwd: string,
  workflowName: string = DEFAULT_WORKFLOW_NAME
): Promise<boolean> {
  const workflowConfig = loadWorkflow(workflowName);

  if (!workflowConfig) {
    error(`Workflow "${workflowName}" not found.`);
    info('Available workflows are in ~/.takt/workflows/');
    info('Use "takt /switch" to select a workflow.');
    return false;
  }

  log.debug('Running workflow', {
    name: workflowConfig.name,
    steps: workflowConfig.steps.map(s => s.name),
  });

  const result = await executeWorkflow(workflowConfig, task, cwd);
  return result.success;
}

/**
 * Run all pending tasks from .takt/tasks/
 *
 * タスクを動的に取得する。各タスク実行前に次のタスクを取得するため、
 * 実行中にタスクファイルが追加・削除されても反映される。
 */
export async function runAllTasks(
  cwd: string,
  workflowName: string = DEFAULT_WORKFLOW_NAME
): Promise<void> {
  const taskRunner = new TaskRunner(cwd);

  // 最初のタスクを取得
  let task = taskRunner.getNextTask();

  if (!task) {
    info('No pending tasks in .takt/tasks/');
    info('Create task files as .takt/tasks/*.md');
    return;
  }

  header('Running tasks');

  let successCount = 0;
  let failCount = 0;

  while (task) {
    console.log();
    info(`=== Task: ${task.name} ===`);
    console.log();

    const startedAt = new Date().toISOString();
    const executionLog: string[] = [];

    try {
      const taskSuccess = await executeTask(task.content, cwd, workflowName);
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

    // 次のタスクを動的に取得（新しく追加されたタスクも含む）
    task = taskRunner.getNextTask();
  }

  const totalCount = successCount + failCount;
  console.log();
  header('Tasks Summary');
  status('Total', String(totalCount));
  status('Success', String(successCount), successCount === totalCount ? 'green' : undefined);
  if (failCount > 0) {
    status('Failed', String(failCount), 'red');
  }
}
