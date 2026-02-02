/**
 * Task/workflow execution commands.
 */

// Types
export type {
  WorkflowExecutionResult,
  WorkflowExecutionOptions,
  TaskExecutionOptions,
  ExecuteTaskOptions,
  PipelineExecutionOptions,
  WorktreeConfirmationResult,
  SelectAndExecuteOptions,
} from './types.js';

export { executeWorkflow } from './workflowExecution.js';
export { executeTask, runAllTasks, executeAndCompleteTask, resolveTaskExecution } from './taskExecution.js';
export {
  selectAndExecuteTask,
  confirmAndCreateWorktree,
} from './selectAndExecute.js';
export { executePipeline } from './pipelineExecution.js';
export { withAgentSession } from './session.js';
