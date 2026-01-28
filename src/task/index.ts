/**
 * Task execution module
 */

export {
  TaskRunner,
  type TaskInfo,
  type TaskResult,
} from './runner.js';

export { showTaskList } from './display.js';

export { TaskFileSchema, type TaskFileData } from './schema.js';
export { parseTaskFile, parseTaskFiles, type ParsedTask } from './parser.js';
export {
  createWorktree,
  removeWorktree,
  detectDefaultBranch,
  parseTaktWorktrees,
  listTaktWorktrees,
  getFilesChanged,
  extractTaskSlug,
  buildReviewItems,
  type WorktreeOptions,
  type WorktreeResult,
  type WorktreeInfo,
  type WorktreeReviewItem,
} from './worktree.js';
export { autoCommitWorktree, type AutoCommitResult } from './autoCommit.js';
export { TaskWatcher, type TaskWatcherOptions } from './watcher.js';
